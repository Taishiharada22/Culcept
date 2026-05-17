/**
 * CoAlter AOO Phase B B-4a — Decision Constants (reason enum + thresholds)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §3 / §4 / §10.2
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2 / §3
 *
 * 役割 (B-4a 段階):
 *   Decision Engine の **constants 層のみ**。実装 logic (ERV / Gate / Counterfactual /
 *   decideMirror) は B-4b〜B-4d で順次追加する。本 file は:
 *     - threshold 数値 const (SPEAK_THRESHOLD_BASE / COUNTERFACTUAL_ERV_BAR /
 *       WORTH_NOVELTY_MIN / WORTH_TIME_SINCE_MIN_TURNS)
 *     - reason 文字列 const (MIRROR_STAY_SILENT_REASON)
 *     - reason の literal union 型 (MirrorStaySilentReason)
 *   のみを提供する。**runtime logic / 副作用 / 制御フロー一切なし**。
 *
 * Threshold 設計 (B-0 plan §3 / §4):
 *   - 全 threshold は **tentative**: B-5 canary 観測で CEO calibration 対象
 *   - SPEAK_THRESHOLD_BASE = 0.75: ERV がこの値を超えたとき初めて SPEAK 候補
 *   - COUNTERFACTUAL_ERV_BAR = 0.85: Counterfactual Silence Test の bar (SPEAK_THRESHOLD
 *     よりも高い defense-in-depth、B-0 §10.2)
 *   - WORTH_NOVELTY_MIN = 0.5: Worth Gate の novelty 最小値 (B-0 §4.2)
 *   - WORTH_TIME_SINCE_MIN_TURNS = 5: 連続発話防止の最小 turn 数 (B-0 §2.3)
 *
 * Reason enum 設計 (B-4a):
 *   - 17 値 (Observe 5 + Worth 4 + Safe 4 + ERV 1 + Counterfactual 3)
 *   - 全 snake_case (`^[a-z_]+$`)
 *   - 重複なし (Object.values の Set 化で test 検証)
 *   - 各値は B-0 plan の specific section と 1:1 mapping (jsdoc 参照)
 *   - typo 防止のため `as const` + `(typeof X)[keyof typeof X]` literal union 型
 *
 * 設計境界 (B-0 §9 / Phase A 継承):
 *   - 既存 presence layer / observer / chat layer touch なし
 *   - B-1 (flag) / B-2 (modeContext) / B-3 (buckets) zero diff
 *   - PII 受理なし (本 file は constants のみ、入力受け取りなし)
 *   - 副作用なし
 *
 * B-4b 以降の役割 (本 file は変更しない):
 *   - B-4b: Observe / Worth / Safe Gate pure function 実装
 *   - B-4c: ERV + Counterfactual Silence Test pure function 実装
 *   - B-4d: decisionEngine 統合
 */

// =============================================================================
// Thresholds (tentative, B-5 canary calibration 対象)
// =============================================================================

/**
 * ERV (Expected Relationship Value) base SPEAK threshold.
 *
 * ERV がこの値を超えたとき、SPEAK 候補としての評価が継続する。
 * 0.75 は B-0 plan §3.3 で CEO 確定した tentative 値 (Phase B canary で calibration)。
 *
 * 0.85 への引き上げ条件 (B-0 plan §3.3):
 *   - Preview canary 6 週間以上の安定運用
 *   - false-positive 率 < 3% 維持
 *   - UI 違和感 / 邪魔フィードバック 0 件
 *   - CEO 承認
 */
export const SPEAK_THRESHOLD_BASE = 0.75 as const;

/**
 * Counterfactual Silence Test の ERV bar (defense-in-depth).
 *
 * SPEAK_THRESHOLD_BASE (0.75) を上回った ERV でも、本 bar (0.85) 未達なら
 * "user_misses_small_observation" outcome として STAY_SILENT 扱い。
 * B-0 plan §10.2 / CEO 補正 14 (PR #165) で確定した tentative 値。
 */
export const COUNTERFACTUAL_ERV_BAR = 0.85 as const;

/**
 * Worth Gate の observation_novelty 最小値。
 *
 * 入力 novelty がこの値未満なら Worth Gate fail (worth_gate_novelty_low)。
 * B-0 plan §4.2 由来、tentative。
 */
export const WORTH_NOVELTY_MIN = 0.5 as const;

/**
 * Worth Gate の time_since_last_speak 最小 turn 数。
 *
 * 直近 Mirror SPEAK から本数値未満の turn しか経過していない場合、
 * Worth Gate fail (worth_gate_time_since_last_speak_too_recent)。
 * B-0 plan §2.3 / §4.2 由来、固定 (CEO 確定)。
 */
export const WORTH_TIME_SINCE_MIN_TURNS = 5 as const;

// =============================================================================
// MIRROR_STAY_SILENT_REASON enum (17 values, B-0 spec section 1:1 mapping)
// =============================================================================

/**
 * Mirror Channel が STAY_SILENT を返す理由の正式 enum。
 *
 * 17 値: Observe Gate 5 + Worth Gate 4 + Safe Gate 4 + ERV 1 + Counterfactual 3
 *
 * 各値は B-0 plan の specific section と 1:1 mapping:
 *   - observe_gate_*: B-0 §6 unified unknown handling
 *   - worth_gate_*: B-0 §4.2 Worth Gate
 *   - safe_gate_*: B-0 §4.3 Safe Gate
 *   - erv_below_threshold: B-0 §3 ERV
 *   - counterfactual_*: B-0 §10.2 Counterfactual Silence Test
 *
 * 使用方法:
 *   - 各 reason 値は IDE autocomplete から取得可能
 *   - 例: `MIRROR_STAY_SILENT_REASON.SAFE_SAFETY_CONCERN`
 *   - 型は `MirrorStaySilentReason` (本 file 下部で export)
 *
 * 不変原則:
 *   - 値は snake_case (`^[a-z_]+$`)、重複なし
 *   - 新規 reason 追加時は本 enum + B-0 plan 該当 section の両方を更新
 *   - reason 値の文字列を caller が直接書く (magic string) ことを禁止
 *     (必ず本 enum 経由で参照、typo 防止)
 */
export const MIRROR_STAY_SILENT_REASON = {
  // ─────────────────────────────────────────────
  // Observe Gate (B-0 §6 unified unknown handling) — 5 values
  // ─────────────────────────────────────────────
  /** modeContext (B-2 reader 結果) が unknown */
  OBSERVE_UNKNOWN_MODE_CONTEXT: "observe_gate_unknown_modeContext",
  /** alignmentBucket (B-3) が unknown */
  OBSERVE_UNKNOWN_ALIGNMENT: "observe_gate_unknown_alignment",
  /** uncertaintyBucket (B-3) が unknown */
  OBSERVE_UNKNOWN_UNCERTAINTY: "observe_gate_unknown_uncertainty",
  /** silenceBudgetBucket (B-3) が unknown */
  OBSERVE_UNKNOWN_SILENCE_BUDGET: "observe_gate_unknown_silence_budget",
  /** patternCategoryBucket (B-3) が unknown_category */
  OBSERVE_UNKNOWN_PATTERN_CATEGORY: "observe_gate_unknown_pattern_category",

  // ─────────────────────────────────────────────
  // Worth Gate (B-0 §4.2) — 4 values
  // ─────────────────────────────────────────────
  /** silenceBudgetBucket === "high_70_to_100" (発話余裕なし) */
  WORTH_SILENCE_BUDGET_HIGH: "worth_gate_silence_budget_high",
  /** observation_novelty が WORTH_NOVELTY_MIN 未満 */
  WORTH_NOVELTY_LOW: "worth_gate_novelty_low",
  /** conversationPhase が Mirror 不適 (greeting / closing / emergent / unknown) */
  WORTH_CONVERSATION_PHASE_UNSUITABLE: "worth_gate_conversation_phase_unsuitable",
  /** time_since_last_speak_turns が WORTH_TIME_SINCE_MIN_TURNS 未満 */
  WORTH_TIME_SINCE_LAST_SPEAK_TOO_RECENT: "worth_gate_time_since_last_speak_too_recent",

  // ─────────────────────────────────────────────
  // Safe Gate (B-0 §4.3 / §9.3) — 4 values
  // ─────────────────────────────────────────────
  /** patternCategoryBucket === "safety_concern" (Phase B 全期間発話禁止) */
  SAFE_SAFETY_CONCERN: "safe_gate_safety_concern",
  /** patternCategoryBucket === "rupture_signal_high" or ruptureFlag === true */
  SAFE_RUPTURE_HIGH: "safe_gate_rupture_high",
  /** uncertaintyBucket === "high_70_to_100" (高不確実性) */
  SAFE_UNCERTAINTY_HIGH: "safe_gate_uncertainty_high",
  /** userOverrideSleep === true (UI toggle or 言語停止検出) */
  SAFE_USER_OVERRIDE_SLEEP: "safe_gate_user_override_sleep",

  // ─────────────────────────────────────────────
  // ERV (B-0 §3) — 1 value
  // ─────────────────────────────────────────────
  /** ERV score が SPEAK_THRESHOLD_BASE (0.75) 未達 */
  ERV_BELOW_THRESHOLD: "erv_below_threshold",

  // ─────────────────────────────────────────────
  // Counterfactual Silence Test (B-0 §10.2) — 3 values
  // ─────────────────────────────────────────────
  /** "user_misses_small_observation" — ERV が COUNTERFACTUAL_ERV_BAR (0.85) 未達 */
  COUNTERFACTUAL_USER_MISSES_SMALL_OBSERVATION:
    "counterfactual_user_misses_small_observation",
  /** "user_takes_harmful_action" — safety / rupture_high routing (本来 Safe Gate で捕捉) */
  COUNTERFACTUAL_USER_TAKES_HARMFUL_ACTION: "counterfactual_user_takes_harmful_action",
  /** "no_difference" — travel mode 等で SPEAK 効果が中立と判定 */
  COUNTERFACTUAL_NO_DIFFERENCE: "counterfactual_no_difference",
} as const;

/**
 * MIRROR_STAY_SILENT_REASON の literal union 型。
 *
 * 用途:
 *   - `MirrorDecision` (types.ts) の `reason` field 型
 *   - `GateResult` (types.ts) の fail 時 reason field 型
 *   - 関数の return 型シグネチャ
 *
 * 値追加時:
 *   - 本 enum object に新規 entry を追加するだけで literal union が自動拡張
 *   - typo は compile-time で検出 (IDE autocomplete + tsc check)
 */
export type MirrorStaySilentReason =
  (typeof MIRROR_STAY_SILENT_REASON)[keyof typeof MIRROR_STAY_SILENT_REASON];
