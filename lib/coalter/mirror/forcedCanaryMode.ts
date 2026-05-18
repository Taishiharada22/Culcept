/**
 * CoAlter AOO Phase C C-3 — Forced Canary Mode (Preview-only mock engine input)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-c-integration-design.md (PR #186) §4.3 / Appendix F
 *   - Option γ 採用 (CEO 補正 2026-05-18): mock signal injection
 *
 * 役割 (C-3 段階):
 *   **Preview canary 専用 helper**。flag `mirrorForcedCanaryEnabled === true` のときだけ:
 *     1. **safe mock engine input** を提供 (engineAdapter が消費)
 *     2. **visible cap override** 1 → 10 (frequencyCap が消費)
 *
 *   forced mode の唯一の目的: **C-4 で visible Mirror path を実機到達させる**
 *     - C-2 後も `alignment` / `uncertainty` / `silenceBudget` axis が unknown のまま
 *       (PresenceSignal shape の制約、`presenceMirrorBridge.ts` 設計 caveat 参照)
 *     - そのため Observe Gate で必ず fail → MIRROR_CANDIDATE 不発火 → visible 出ない
 *     - forced canary mode で **全 axis に safe mock 値を供給** することで Observe/Worth/
 *       Safe Gate + ERV + Counterfactual を通過させ、controlled に visible 経路を発火可能に
 *
 *   **Production / 全 Preview / Development には絶対投入禁止** (Phase C 不可侵境界):
 *     - flag は CEO 手動で branch-scoped Preview のみに投入
 *     - flag OFF (env 未投入) で本 module は完全 no-op (副作用ゼロ、import すら無害)
 *
 * 設計原則 (Phase B canon §7.4 + Phase C 不可侵境界 と整合):
 *   - **緩めるのは cap override + mock injection の 2 点のみ**
 *   - 7-layer postSpeakVerification は **strict 維持** (mock template も verification 通過必須)
 *   - sleepStore は **real `getSleep()` 経由** (forced ON でも sleep ON → visible 不可)
 *   - PII firewall (型レベル + runtime): mock は **enum / number / boolean のみ** 含む
 *   - Question / Proposal / Suggestion auto-fire 禁止 (template enum で構造保証)
 *   - LLM / fetch / DB / storage / telemetry 一切なし
 *
 * Mock 値の calibration (decisionEngine.test.ts `happyInput` と一致):
 *   - mode: "normal" (safe baseline)
 *   - alignment: strongly_positive (raw 1.0)
 *   - uncertainty: low_0_to_30 (raw 0)
 *   - silenceBudget: low_0_to_30 (raw 0)
 *   - patternCategory: null_pattern (通常評価へ進む)
 *   - observationNovelty: 1.0 (max)
 *   - conversationPhase: in_progress
 *   - timeSinceLastSpeakTurns: 20 (>> 5 worth threshold)
 *   - ruptureFlag: false
 *   - userOverrideSleep: false (mock 値、ただし engineAdapter は real getSleep() で override)
 *
 *   ERV 計算 (B-4c formula、テスト同等):
 *     ΔU = 0.4*1.0 + 0.4*1.0 + 0.2*1.0 = 1.0
 *     - attentionCost 0 - autonomyCost 0.05 - trustRisk 0 - safetyMargin 0.05 = 0.90
 *     0.90 >= COUNTERFACTUAL_ERV_BAR (0.85) → MIRROR_CANDIDATE 生成
 *
 * No-Effect Contract:
 *   - flag OFF → 完全 no-op (import 副作用なし、function 戻り値 null)
 *   - flag ON でも:
 *     - I/O / network / storage / DOM / event / timer / log / LLM 一切なし
 *     - 入力 mutation なし
 *     - state なし (deterministic function、毎呼出で同 mock 返す)
 *
 * 不可侵境界:
 *   - presence layer / observer layer / chat layer touch なし
 *   - 既存 B-5a/B-5b/C-1/C-2 mirror code 0 diff (本 module は新規追加のみ)
 *   - ChatClient / MirrorSurface / MirrorVisibleSurface / SleepUIToggle / MirrorHost 0 diff
 */

import { COALTER_FLAGS } from "../flags";
import type {
  ConversationPhase,
  MirrorAlignmentBucket,
  MirrorPatternCategoryBucket,
  MirrorPresenceMode,
  MirrorSilenceBudgetBucket,
  MirrorUncertaintyBucket,
} from "./types";
import type { MirrorReadInput } from "./presenceMirrorBridge";

// =============================================================================
// Constants
// =============================================================================

/**
 * Forced canary mode の visible cap (1 → 10 override)。
 *
 * 通常 mode の `INITIAL_VISIBLE_CAP = 1` (Phase B 設計) を、observation density
 * 確保のため 10 に拡大。**他 gate (sleep / verification / 4-gate) は緩めない**。
 */
export const FORCED_CANARY_VISIBLE_CAP = 10 as const;

// =============================================================================
// Mock engine input (deterministic, PII-free, safety-first baseline)
// =============================================================================

/**
 * engineAdapter が forced canary mode 時に消費する **完全 mock engine input**。
 *
 * **PII firewall (型レベル)**:
 *   - raw text / userId / messageId / pairId / sessionId / email field を**書けない**
 *   - 全 field は enum / number / boolean のみ
 *
 * 値は `tests/unit/coalter/mirror/decisionEngine.test.ts` の `happyInput()` と一致
 * (Observe + Worth + Safe Gate + ERV + Counterfactual すべて通過する最低条件)。
 */
export interface ForcedCanaryMockEngineInput {
  readonly mode: MirrorPresenceMode;
  readonly alignmentBucket: Exclude<MirrorAlignmentBucket, "unknown">;
  readonly alignmentRaw: number;
  readonly uncertaintyBucket: "low_0_to_30" | "mid_30_to_70";
  readonly uncertaintyRaw: number;
  readonly silenceBudgetBucket: "low_0_to_30" | "mid_30_to_70";
  readonly silenceBudgetRaw: number;
  readonly patternCategoryBucket: "null_pattern" | "rupture_signal_mild";
  readonly observationNovelty: number;
  readonly conversationPhase: ConversationPhase;
  readonly timeSinceLastSpeakTurns: number;
  readonly ruptureFlag: boolean;
  readonly userOverrideSleep: boolean;
}

/**
 * Safe baseline mock (CEO 補正、decisionEngine.test.ts `happyInput` と一致):
 *   - mode normal / alignment strongly_positive / uncertainty 0 / silenceBudget 0
 *   - patternCategory null_pattern (通常評価)
 *   - novelty 1.0 / phase in_progress / time 20 / no rupture / no sleep (mock)
 *
 * これらの値で ERV ≈ 0.90 (Counterfactual bar 0.85 を上回る) → MIRROR_CANDIDATE 生成。
 *
 * 安全側設計 (mock も verification を緩めない):
 *   - patternCategory `safety_concern` / `rupture_signal_high` は**使わない** (Safe Gate fail)
 *   - mock の `userOverrideSleep: false` は適当値、engineAdapter で real `getSleep()` で override
 *   - LLM / external / raw 一切なし
 */
const SAFE_MOCK: ForcedCanaryMockEngineInput = {
  mode: "normal",
  alignmentBucket: "strongly_positive",
  alignmentRaw: 1.0,
  uncertaintyBucket: "low_0_to_30",
  uncertaintyRaw: 0,
  silenceBudgetBucket: "low_0_to_30",
  silenceBudgetRaw: 0,
  patternCategoryBucket: "null_pattern",
  observationNovelty: 1.0,
  conversationPhase: "in_progress",
  timeSinceLastSpeakTurns: 20,
  ruptureFlag: false,
  userOverrideSleep: false,
} as const;

// =============================================================================
// Bridge cache shape (presenceMirrorBridge が消費する 2-axis mock)
// =============================================================================

/**
 * presenceMirrorBridge が `getMirrorReadInput()` で返す mock (bridge cache shape)。
 *
 * `MirrorReadInput` は (mode, patternCategoryBucket, capturedAt) の 3 field のみ。
 * 残り axes (alignment / uncertainty / silenceBudget / novelty / phase / time /
 * rupture) は engineAdapter が `getForcedCanaryMockEngineInput()` 経由で取得。
 *
 * deterministic: `capturedAt` も固定値 (test の reproducibility のため) ではなく
 * Date.now() (presenceMirrorBridge real cache と同形式)。
 */
function buildForcedMockMirrorReadInput(): MirrorReadInput {
  return {
    mode: SAFE_MOCK.mode,
    patternCategoryBucket: SAFE_MOCK.patternCategoryBucket,
    capturedAt: Date.now(),
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Forced canary mode flag check (re-export for callers)。
 *
 * `COALTER_FLAGS.mirrorForcedCanaryEnabled` を直接参照する経路と同等。
 * function 経由でも property getter 経由でも env 毎回読みで動的反映。
 */
export function isForcedCanaryActive(): boolean {
  return COALTER_FLAGS.mirrorForcedCanaryEnabled;
}

/**
 * Forced canary mode の visible cap (1 → 10 override) を取得。
 *
 * `frequencyCap.getEffectiveVisibleCap()` から呼ばれる。
 */
export function getForcedCanaryVisibleCap(): number {
  return FORCED_CANARY_VISIBLE_CAP;
}

/**
 * Forced canary mode 時の **bridge cache shape mock** を取得。
 *
 * `presenceMirrorBridge.getMirrorReadInput()` が forced mode ON 時に preferentially
 * 返す cache (real subscribe cache を上書き)。
 *
 * @returns `MirrorReadInput` (forced ON 時) / `null` (forced OFF 時、no-op)
 */
export function getForcedCanaryMockReadInput(): MirrorReadInput | null {
  if (!isForcedCanaryActive()) return null;
  return buildForcedMockMirrorReadInput();
}

/**
 * Forced canary mode 時の **完全 mock engine input** を取得。
 *
 * `engineAdapter.buildMirrorDecisionInput()` が forced mode ON 時に preferentially
 * 使う。real `getSleep()` 経由の userOverrideSleep override は engineAdapter で行う
 * (sleep ON → visible 不可、CEO 補正 6 と整合)。
 *
 * @returns `ForcedCanaryMockEngineInput` (forced ON 時) / `null` (forced OFF 時)
 */
export function getForcedCanaryMockEngineInput(): ForcedCanaryMockEngineInput | null {
  if (!isForcedCanaryActive()) return null;
  return SAFE_MOCK;
}

// =============================================================================
// Test-only helpers
// =============================================================================

/**
 * **Test only**: SAFE_MOCK 値を直接取得 (test 中の assertion 用)。
 *
 * @internal
 */
export function __getSafeMockForTest(): ForcedCanaryMockEngineInput {
  return SAFE_MOCK;
}
