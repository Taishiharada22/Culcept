/**
 * CoAlter AOO Phase B B-4c — Counterfactual Silence Test (pure deterministic)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §10.2
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §10.2 (CEO 補正 14)
 *   - 型: lib/coalter/mirror/types.ts (B-4a) — CounterfactualOutcome, MirrorDecisionInput
 *   - 定数: lib/coalter/mirror/decisionConstants.ts (B-4a) — COUNTERFACTUAL_ERV_BAR
 *
 * 役割 (B-4c 段階):
 *   "If I stay silent now, what's the worst that happens?" を
 *   **pure / deterministic / no-LLM** で算出する。
 *
 *   4 outcome のいずれかを返す:
 *     - `"user_misses_small_observation"`: ERV bar 未達 → STAY_SILENT (許容)
 *     - `"user_misses_meaningful_insight"`: bar 通過 + 条件成立 → SPEAK 候補維持
 *     - `"user_takes_harmful_action"`: safety / rupture_high routing → STAY_SILENT
 *     - `"no_difference"`: 中立 (travel / unknown / sleep 等) → STAY_SILENT
 *
 * **B-4c では発話判定しない**:
 *   - 本関数は outcome を返すだけ
 *   - B-4d decisionEngine が outcome を見て STAY_SILENT / MIRROR_CANDIDATE 分岐
 *   - 本関数からは MirrorDecision / GateResult は返さない
 *
 * Defense-in-depth (B-0 §10.2 + CEO 補正 14):
 *   - `COUNTERFACTUAL_ERV_BAR` (0.85) は `SPEAK_THRESHOLD_BASE` (0.75) より厳しい
 *   - Three-Gate ALL PASS + ERV > 0.75 を通過した SPEAK 候補に対しても、
 *     本 CST が ERV >= 0.85 を要求 (二段階 threshold)
 *   - safety_concern / rupture_high は本 CST でも redundant に捕捉 (Safe Gate で先に捕捉される想定だが、defense-in-depth)
 *
 * 評価順序 (autonomous 設計判断、safety-first):
 *   1. ervScore が NaN / Infinity → "no_difference" (defensive、最初に判定)
 *   2. patternCategory === "safety_concern" → "user_takes_harmful_action"
 *   3. patternCategory === "rupture_signal_high" → "user_takes_harmful_action"
 *   4. ervScore < COUNTERFACTUAL_ERV_BAR (0.85) → "user_misses_small_observation"
 *   5. modeContext === "travel" → "no_difference" (体験優先、reflection 不要)
 *   6. modeContext unknown → "no_difference" (defensive)
 *   7. patternCategory が "null_pattern" でも "rupture_signal_mild" でもない → "no_difference"
 *      (defensive: unknown_category 等は CST 経由で SPEAK させない)
 *   8. userOverrideSleep !== false → "no_difference"
 *      (sleep / null / undefined すべて: 仮にここまで来ても sleep なら no_difference に倒す)
 *   9. 上記すべて通過 → "user_misses_meaningful_insight"
 *
 *   設計意図:
 *     - safety を最優先 (順序 2-3)
 *     - ERV bar を次に評価 (順序 4)
 *     - context 安全性チェック (順序 5-7)
 *     - user 意思 (順序 8)
 *     - すべてクリアして初めて "meaningful_insight" (順序 9)
 *
 *   結果: "user_misses_meaningful_insight" は **極めて限定的** (Phase B 北極星「黙る」と整合)
 *
 * No-Effect Contract (B-1 から継承):
 *   - pure / deterministic / side-effect-free
 *   - I/O / network / storage / DOM / event / timer / log / LLM 一切なし
 *   - raw text 入力禁止 (型レベルで MirrorDecisionInput に存在しない)
 *   - input mutation なし
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - B-1 / B-2 / B-3 / B-4a / B-4b zero diff
 *   - PII 受理なし
 */

import { COUNTERFACTUAL_ERV_BAR } from "./decisionConstants";
import type { CounterfactualOutcome, MirrorDecisionInput } from "./types";

/**
 * "If silent now, what's the worst case?" を算出する
 * **pure / deterministic / no-LLM** function。
 *
 * @param input - {@link MirrorDecisionInput}
 * @param ervScore - {@link computeERV} の戻り値 (0.0..1.0 の finite number 想定)
 * @returns {@link CounterfactualOutcome}
 *
 * @example
 *   counterfactualSilenceTest(input, 0.5)
 *     // → "user_misses_small_observation" (ERV bar 未達)
 *
 *   counterfactualSilenceTest({ ...input, patternCategory: { bucket: "safety_concern", ... } }, 0.95)
 *     // → "user_takes_harmful_action" (ERV 高くても safety 最優先)
 *
 *   counterfactualSilenceTest({ ...input, modeContext: { mode: "travel", ... } }, 0.9)
 *     // → "no_difference" (travel mode は体験優先)
 *
 *   counterfactualSilenceTest({ ...全 perfect, normal mode, null_pattern, sleep false }, 0.9)
 *     // → "user_misses_meaningful_insight" (極めて限定的に到達)
 */
export function counterfactualSilenceTest(
  input: MirrorDecisionInput,
  ervScore: number,
): CounterfactualOutcome {
  // (1) ervScore defensive: NaN / Infinity / 非数値 → no_difference (safest)
  if (typeof ervScore !== "number" || !Number.isFinite(ervScore)) {
    return "no_difference";
  }

  // (2) safety_concern → harmful_action (最優先 safety routing)
  if (input.patternCategory.bucket === "safety_concern") {
    return "user_takes_harmful_action";
  }

  // (3) rupture_signal_high → harmful_action (関係性 safety routing)
  if (input.patternCategory.bucket === "rupture_signal_high") {
    return "user_takes_harmful_action";
  }

  // (4) ERV bar 未達 → small_observation (許容できる「言わなさ過ぎ」)
  if (ervScore < COUNTERFACTUAL_ERV_BAR) {
    return "user_misses_small_observation";
  }

  // (5) travel mode → no_difference (体験優先、reflection 不要)
  if (
    input.modeContext.status === "known" &&
    input.modeContext.mode === "travel"
  ) {
    return "no_difference";
  }

  // (6) modeContext unknown → no_difference (defensive: 文脈不明で SPEAK させない)
  if (input.modeContext.status === "unknown") {
    return "no_difference";
  }

  // (7) patternCategory bucket: null_pattern / rupture_signal_mild のみ proceed
  // (safety_concern / rupture_signal_high は上で捕捉済、unknown_category は defensive)
  const bucket = input.patternCategory.bucket;
  if (bucket !== "null_pattern" && bucket !== "rupture_signal_mild") {
    return "no_difference";
  }

  // (8) userOverrideSleep !== false → no_difference
  // (true / null / undefined すべて: ここまで来ても sleep に該当すれば no_difference)
  if (input.userOverrideSleep !== false) {
    return "no_difference";
  }

  // (9) ALL conditions met → meaningful_insight (極めて限定的)
  return "user_misses_meaningful_insight";
}
