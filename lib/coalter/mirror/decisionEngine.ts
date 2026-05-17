/**
 * CoAlter AOO Phase B B-4d — Decision Engine (gates + ERV + Counterfactual 統合)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §3 / §4 / §10.2
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5
 *   - 型: lib/coalter/mirror/types.ts (B-4a) — MirrorDecision, MirrorDecisionInput
 *   - 定数: lib/coalter/mirror/decisionConstants.ts (B-4a)
 *   - Gates: lib/coalter/mirror/gates/* (B-4b) — checkObserveGate / checkWorthGate / checkSafeGate
 *   - ERV: lib/coalter/mirror/erv.ts (B-4c)
 *   - Counterfactual: lib/coalter/mirror/counterfactualSilenceTest.ts (B-4c)
 *
 * 役割 (B-4d 段階):
 *   Phase B Mirror Channel の **Decision Engine**。B-4b 3 gates + B-4c ERV + CST
 *   を統合し、**`MirrorDecision`** (STAY_SILENT / MIRROR_CANDIDATE) を返す pure function。
 *
 *   本 file が初めて `MIRROR_CANDIDATE` を生成し得る (B-4a〜B-4c は型/数値/outcome のみ)。
 *
 * Engine flow (CEO 8 段 fail-closed AND):
 *   1. `checkObserveGate(input)` → fail なら STAY_SILENT (observe_gate_*)
 *   2. `checkWorthGate(input)` → fail なら STAY_SILENT (worth_gate_*)
 *   3. `checkSafeGate(input)` → fail なら STAY_SILENT (safe_gate_*)
 *   4. `computeERV(input)` → 数値 [0, 1] (defensive clamp)
 *   5. `ervScore < SPEAK_THRESHOLD_BASE (0.75)` → STAY_SILENT (erv_below_threshold)
 *   6. `counterfactualSilenceTest(input, ervScore)` → CounterfactualOutcome
 *   7. outcome !== "user_misses_meaningful_insight" → STAY_SILENT (mapped CST reason)
 *   8. ALL 通過 → **MIRROR_CANDIDATE** with ervScore + reason: "speak_passed"
 *
 *   **Default-STAY_SILENT 構造保証** (B-0 §10.4 + B-4 preflight §10.1):
 *     - MIRROR_CANDIDATE 生成には `ervScore: number` (computeERV 経由のみ取得可能) 必須
 *     - 8 段 fail-closed AND を全通過する case のみ生成
 *     - 関数末尾の fallback も型上 STAY_SILENT を選ぶしかない (型レベル defense)
 *
 * Defense-in-depth (B-0 §10.2):
 *   - SPEAK_THRESHOLD_BASE (0.75): 1 段目 gate (step 5)
 *   - COUNTERFACTUAL_ERV_BAR (0.85): 2 段目 gate (step 7、CST 内部で評価)
 *   - safety_concern / rupture_signal_high は Safe Gate (step 3) で先に捕捉、
 *     万一 bypass されても CST (step 7) で `harmful_action` outcome として再捕捉
 *
 * No-Effect Contract (B-1 から継承):
 *   - pure / deterministic / side-effect-free
 *   - I/O / network / storage / DOM / event / timer / log / LLM 一切なし
 *   - input mutation なし
 *   - 副作用ゼロ
 *
 * 不可侵境界 (B-0 §9 / Phase A 継承):
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - B-1 / B-2 / B-3 / B-4a / B-4b / B-4c zero diff (本 file は read-only で import)
 *   - PII 受理なし (MirrorDecisionInput 経由のみ)
 *
 * B-5 計画 (本 file は変更しない):
 *   - B-5 で本関数を MirrorHost 等から呼ぶ
 *   - B-5 で reason を `MirrorDiagnosticSnapshot` (B-0 §8.3) に記録
 *   - B-5 で MIRROR_CANDIDATE を Mirror 文生成 + Post-Speak Verification + 描画へ橋渡し
 */

import { checkObserveGate } from "./gates/observeGate";
import { checkWorthGate } from "./gates/worthGate";
import { checkSafeGate } from "./gates/safeGate";
import { computeERV } from "./erv";
import { counterfactualSilenceTest } from "./counterfactualSilenceTest";
import {
  MIRROR_STAY_SILENT_REASON,
  SPEAK_THRESHOLD_BASE,
} from "./decisionConstants";
import type {
  CounterfactualOutcome,
  MirrorDecision,
  MirrorDecisionInput,
  MirrorStaySilentReason,
} from "./types";

/**
 * STAY_SILENT MirrorDecision を生成する pure helper。
 *
 * 型レベル保証:
 *   - type: "STAY_SILENT" literal
 *   - reason: MirrorStaySilentReason (validated)
 *   - ervScore field なし
 */
function staySilent(reason: MirrorStaySilentReason): MirrorDecision {
  return { type: "STAY_SILENT", reason };
}

/**
 * Counterfactual outcome → MirrorStaySilentReason mapping。
 *
 * `"user_misses_meaningful_insight"` は STAY_SILENT 経路に該当しない (本関数は呼ばれない)。
 * decideMirror で `outcome === "user_misses_meaningful_insight"` を switch で
 * 別経路 (MIRROR_CANDIDATE) に分岐させた後の残り 3 outcome を処理する。
 *
 * Exhaustive switch via `never`: 新しい CounterfactualOutcome 値が追加されたら
 * compile-time で fail (default 経路の never check)。
 */
function mapCounterfactualToStaySilent(
  outcome: Exclude<CounterfactualOutcome, "user_misses_meaningful_insight">,
): MirrorStaySilentReason {
  switch (outcome) {
    case "user_misses_small_observation":
      return MIRROR_STAY_SILENT_REASON.COUNTERFACTUAL_USER_MISSES_SMALL_OBSERVATION;
    case "user_takes_harmful_action":
      return MIRROR_STAY_SILENT_REASON.COUNTERFACTUAL_USER_TAKES_HARMFUL_ACTION;
    case "no_difference":
      return MIRROR_STAY_SILENT_REASON.COUNTERFACTUAL_NO_DIFFERENCE;
    default: {
      // 新しい outcome 追加時に compile fail (TypeScript never check)
      const _exhaustive: never = outcome;
      void _exhaustive;
      // Runtime defensive fallback (compile fail を補完): no_difference (safest)
      return MIRROR_STAY_SILENT_REASON.COUNTERFACTUAL_NO_DIFFERENCE;
    }
  }
}

/**
 * Mirror Channel の **Decision Engine** — gates + ERV + Counterfactual を統合し、
 * `MirrorDecision` を返す pure function。
 *
 * 8 段 fail-closed AND:
 *   1-3. Three-Gate (Observe / Worth / Safe)
 *   4. ERV 計算
 *   5. ERV < SPEAK_THRESHOLD_BASE check
 *   6-7. Counterfactual Silence Test + outcome 分岐
 *   8. 全通過 → MIRROR_CANDIDATE
 *
 * @param input - {@link MirrorDecisionInput}
 * @returns {@link MirrorDecision}
 *   - `{ type: "STAY_SILENT", reason }`: 1-7 のいずれかで fail
 *   - `{ type: "MIRROR_CANDIDATE", ervScore, reason: "speak_passed" }`: 8 段すべて通過 (極めて限定的)
 *
 * @example
 *   decideMirror({ ...全 unknown })
 *     // → { type: "STAY_SILENT", reason: "observe_gate_unknown_modeContext" }
 *
 *   decideMirror({ ...全 perfect 条件 })
 *     // → { type: "MIRROR_CANDIDATE", ervScore: 0.9, reason: "speak_passed" }
 */
export function decideMirror(input: MirrorDecisionInput): MirrorDecision {
  // ─────────────────────────────────────────────
  // Step 1: Observe Gate
  // ─────────────────────────────────────────────
  const observe = checkObserveGate(input);
  if (!observe.passed) {
    return staySilent(observe.reason);
  }

  // ─────────────────────────────────────────────
  // Step 2: Worth Gate
  // ─────────────────────────────────────────────
  const worth = checkWorthGate(input);
  if (!worth.passed) {
    return staySilent(worth.reason);
  }

  // ─────────────────────────────────────────────
  // Step 3: Safe Gate
  // ─────────────────────────────────────────────
  const safe = checkSafeGate(input);
  if (!safe.passed) {
    return staySilent(safe.reason);
  }

  // ─────────────────────────────────────────────
  // Step 4: ERV computation
  // ─────────────────────────────────────────────
  const ervScore = computeERV(input);

  // ─────────────────────────────────────────────
  // Step 5: ERV threshold check
  // (computeERV は clamp([0,1]) 保証だが、defensive に < で比較)
  // ─────────────────────────────────────────────
  if (ervScore < SPEAK_THRESHOLD_BASE) {
    return staySilent(MIRROR_STAY_SILENT_REASON.ERV_BELOW_THRESHOLD);
  }

  // ─────────────────────────────────────────────
  // Step 6: Counterfactual Silence Test
  // ─────────────────────────────────────────────
  const outcome = counterfactualSilenceTest(input, ervScore);

  // ─────────────────────────────────────────────
  // Step 7-8: Outcome 分岐 (meaningful_insight のみ MIRROR_CANDIDATE)
  // ─────────────────────────────────────────────
  if (outcome === "user_misses_meaningful_insight") {
    // 全 8 段通過 → MIRROR_CANDIDATE 生成 (極めて限定的、Phase B 北極星「黙る」と整合)
    return {
      type: "MIRROR_CANDIDATE",
      ervScore,
      reason: "speak_passed",
    };
  }

  // 残り 3 outcome (small_observation / harmful_action / no_difference) → STAY_SILENT
  return staySilent(mapCounterfactualToStaySilent(outcome));
}
