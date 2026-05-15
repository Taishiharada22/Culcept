/**
 * CoAlter Travel Domain — Constraint Resolver / Conflict Explanation (T5 phase)
 *
 * 正本:
 *   - docs/coalter-travel-domain-greenfield-design.md (PR #124、design completion)
 *   - docs/coalter-master-design.md v1.2 §13.3 (Travel reflection)
 *   - lib/coalter/travel/types.ts (PR #131、T1)
 *   - lib/coalter/travel/intent.ts (PR #137、T2)
 *   - lib/coalter/travel/itinerary.ts (PR #138、T3)
 *   - lib/coalter/travel/pareto.ts (PR #139、T4)
 *
 * 役割:
 *   T2 / T3 / T4 output を入力に、旅行案の制約衝突を整理し、
 *   - 「なぜこの案は通るのか」 (resolvedCandidates + whyResolvedCodes)
 *   - 「なぜブロックされるのか」 (blockedCandidates + hardBlocks + softWarnings)
 *   - 「どの制約を緩めれば成立するのか」 (minimalRelaxationSet + relaxationSuggestionCode)
 *   を説明する **pure function**。
 *
 * **MVP scope**:
 *   - T2/T3 が 1-2 泊国内 MVP boundary を enforce 済の前提
 *   - 海外 / 3 泊以上 / booking integration は T2 で fail-closed、T3/T4/T5 で pass-through
 *   - 本 resolver は **normalized T2/T3/T4 output のみ** 比較・説明、external validation なし
 *
 * 構造的安全設計 (Gap 4 D2 + AD2/AD3/AD4 + DD2/DD3 + T2/T3/T4 継承):
 *   1. **raw text leakage 構造的防止** (型レベル enforcement):
 *      - input は T2/T3/T4 output (型 + enum + number、raw text なし)
 *      - output reasonCodes / hardBlockCodes / softWarningCodes /
 *        relaxationSuggestionCodes / whyCodes は **enum only**
 *      - PII 構造的に保存不能 (JSON.stringify 検証)
 *   2. **provisional values** (CEO 補正反映):
 *      - PROVISIONAL_CASCADE_HIGH_THRESHOLD=2 (1 制約が 2 候補以上 block → cascade high)
 *      - PROVISIONAL_CASCADE_MEDIUM_THRESHOLD=1
 *      - PROVISIONAL_UNCERTAINTY_DEMOTE_LABEL="info_lacking" (この uncertainty で hard→soft 降格)
 *   3. **fail-closed default**:
 *      - empty T4 ranked → empty resolved + fail_closed_empty_input
 *      - T2 unsupported_future → passed_through_unsupported
 *      - 全 candidate hard_block → empty resolved + blockedCandidates 列挙
 *   4. **deterministic**:
 *      - 純関数、Math.random 不使用、stateless、external state 参照なし
 *      - red_line > severity > axis > candidateId の多段階 tie-break
 *   5. **3 軸混同回避** (Master Design v1.2 §13.6):
 *      - Axis A: Action Mode → 本 resolver の責務外
 *      - Axis B: Presence Mode → 本 resolver は presence 独立
 *      - Axis C: Domain → 本 resolver の責務 (travel domain constraint resolution)
 *
 * 人間超越設計 13 要素 (Gap 4 D2 + AD2/AD3/AD4 + DD2/DD3 + T2/T3/T4 継承 + T5 拡張):
 *   A. **Constraint hierarchy enforcement (CEO 指定)**: red_line > hard > soft >
 *      preference の階層化、red_line 違反は緩和不可、hard 違反は緩和可能、soft 違反は warning
 *   B. **Minimal relaxation set (greedy、CEO 指定)**: 全 hardBlock を unblock する
 *      最小制約緩和集合を greedy で計算
 *   C. **Conflict explanation graph (CEO 指定)**: candidate × constraint × severity ×
 *      origin phase × affected axes の graph 構造
 *   D. **Hard-block vs soft-warning separation (CEO 指定)**: 明示 enum 別 list で区別
 *   E. **"what would make this feasible" suggestion (CEO 指定)**: fixed relaxation
 *      suggestion code 列挙 (relax_budget_one_step / accept_higher_fatigue 等)
 *   F. **Pareto trade-off aware conflict summary (CEO 指定)**: T4 で dominated された
 *      候補を「trade-off で成立可」と説明 (soft warning 化)
 *   G. **Uncertainty-aware blocking (CEO 指定)**: uncertainty=info_lacking 候補は
 *      conflict severity を 1 段階下げる (hard → soft 降格)
 *   H. **Deterministic conflict ordering (CEO 指定)**: red_line / severity / axis /
 *      candidateId の多段階 tie-break
 *   I. **Constraint genealogy tracking (新規)**: T2/T3/T4 どの phase で発生した
 *      constraint かを tag (origin_t2_intent / origin_t3_itinerary / origin_t4_pareto)
 *   J. **Cascade conflict detection (新規)**: 1 制約が複数候補を block する場合の
 *      cascade level (low / medium / high)
 *   K. **Conflict heatmap (新規)**: candidate × constraint matrix で violation map
 *   L. **Trade-off compatibility ranking (新規)**: T4 trade-off label と T5 conflict
 *      を組合せ、"この trade-off を受容するなら成立する" 提案
 *   M. **Feasibility delta (1-step relaxation、新規)**: enum 段階で「1 step 緩和で
 *      成立か」を判定 (relax_budget_one_step 等)
 *
 * 後続 phase (本 PR scope 外):
 *   - T6: UI presentation (Product Unit 連携、別 PR)
 *   - T7: Step E orchestrator wiring (CEO 戦略判断、別 PR)
 *
 * 本 PR の不可触 (CEO 2026-05-15 制約):
 *   - runtime call-site wiring / orchestrator 接続
 *   - ChatClient / UpperLayerMount / route / API / env / flags / migration
 *   - external API / booking API / Places API / Routes API / Web Search
 *   - lib/coalter/travel/types.ts touch (新 type は本 file local 定義)
 *   - Activity AD5 / Daily DD4 / Gap 4 D3 実装
 */

import type {
  TravelConstraintField,
  TravelConstraintSeverity,
  TravelUncertaintyLabel,
} from "./types";
import type { TravelIntentOutput } from "./intent";
import type {
  TravelBlockedItineraryCandidate,
  TravelItineraryBlockedReasonCode,
  TravelItineraryFeasibilityNoteCode,
  TravelItineraryGeneratorOutput,
} from "./itinerary";
import type {
  TravelParetoComparatorOutput,
  TravelParetoComparisonNoteCode,
  TravelParetoDominanceReasonCode,
} from "./pareto";

// ─────────────────────────────────────────────
// resolver version (calibration 用)
// ─────────────────────────────────────────────

export const CONSTRAINT_RESOLVER_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// provisional values (確定値ではない)
// ─────────────────────────────────────────────

/** Provisional cascade thresholds (1 制約が複数候補 block) */
export const PROVISIONAL_CASCADE_HIGH_THRESHOLD = 2;
export const PROVISIONAL_CASCADE_MEDIUM_THRESHOLD = 1;

/** Provisional uncertainty demote label (この uncertainty で hard→soft 降格) */
export const PROVISIONAL_UNCERTAINTY_DEMOTE_LABEL: TravelUncertaintyLabel = "info_lacking";

// ─────────────────────────────────────────────
// enum: constraint conflict reason code
// ─────────────────────────────────────────────

export type TravelConstraintConflictReasonCode =
  | "budget_over_band"
  | "fatigue_over_ceiling"
  | "transit_extreme"
  | "time_balance_imbalanced"
  | "pair_togetherness_mismatch"
  | "weather_high_risk"
  | "anchor_overloaded"
  | "anchor_underloaded"
  | "uncertainty_high"
  | "red_line_no_overseas"
  | "red_line_no_long_drive"
  | "red_line_no_long_transit"
  | "red_line_max_budget"
  | "red_line_max_fatigue"
  | "cognitive_load_ceiling_exceeded"
  | "dominated_in_pareto"
  | "missing_lodging_seed"
  | "missing_destination_seed"
  | "seasonal_mismatch"
  | "weather_dependent_in_rain"
  | "rest_node_missing"
  | "infeasible_graph"
  | "passed_through_unsupported_scope"
  | "passed_through_narrowing";

// ─────────────────────────────────────────────
// enum: relaxation suggestion code (人間超越 Idea E + M)
// ─────────────────────────────────────────────

/**
 * "What would make this feasible" suggestion code.
 *
 * **重要 (CEO 2026-05-15 補正、red-line policy)**:
 *   - red-line / veto constraint は **automatic relaxation 不可** (user/pair が明示した
 *     hard block であり、AI が「緩めれば成立」と提案する対象ではない)
 *   - red-line 候補の relaxation suggestion は `requires_explicit_red_line_revision`
 *     または `no_relaxation_possible_due_to_red_line` を返す (説明のみ、runtime
 *     action ではない)
 *   - changing red-line requires explicit future user revision (本 PR では runtime
 *     action ではなく reason code / note に留める)
 *
 * Suggestion code 4 種:
 *   - relax_*_one_step: enum 段階で 1 step 緩和 (人間超越 Idea M、non-red-line only)
 *   - shift_to_*: 別 seed に shift
 *   - accept_*: warning を受容
 *   - red-line family (緩和ではなく説明のみ、minimalRelaxationSet から除外):
 *     - `red_line_not_relaxable`: red-line constraint marker
 *     - `requires_explicit_red_line_revision`: explicit user revision 必要
 *     - `blocked_by_red_line`: red-line で block されている (他制約を緩めても解決せず)
 *     - `no_relaxation_possible_due_to_red_line`: red-line で完全不可
 *   - no_relaxation_possible: 緩和不可一般 (sentinel)
 */
export type TravelConstraintRelaxationCode =
  | "relax_budget_one_step"
  | "relax_fatigue_one_step"
  | "relax_transit_one_step"
  | "relax_anchor_density"
  | "accept_higher_uncertainty"
  | "shift_to_different_destination"
  | "shift_to_different_lodging"
  | "accept_weather_risk"
  | "accept_pair_split"
  | "accept_pareto_dominated"
  | "red_line_not_relaxable"
  | "requires_explicit_red_line_revision"
  | "blocked_by_red_line"
  | "no_relaxation_possible_due_to_red_line"
  | "no_relaxation_possible";

// ─────────────────────────────────────────────
// enum: why resolved code
// ─────────────────────────────────────────────

export type TravelConstraintWhyResolvedCode =
  | "all_constraints_within_band"
  | "soft_constraints_acceptable"
  | "no_red_line_violations"
  | "within_cognitive_capacity"
  | "weather_within_acceptable_range"
  | "pair_preference_aligned"
  | "uncertainty_acceptable"
  | "pareto_top_front"
  | "no_hard_block"
  | "tradeoff_compatibility_acceptable";

// ─────────────────────────────────────────────
// enum: hard block code
// ─────────────────────────────────────────────

export type TravelConstraintHardBlockCode =
  | "red_line_violation"
  | "infeasible_graph"
  | "cognitive_load_ceiling_exceeded"
  | "all_required_seeds_missing"
  | "anchor_overloaded_block"
  | "transit_extreme_cascade_block"
  | "budget_over_band_block";

// ─────────────────────────────────────────────
// enum: soft warning code
// ─────────────────────────────────────────────

export type TravelConstraintSoftWarningCode =
  | "budget_heavy_transport"
  | "budget_underbudget_food"
  | "budget_heavy_lodging"
  | "anchor_overloaded_day"
  | "anchor_underloaded_day"
  | "weather_risk_propagated"
  | "uncertainty_raised_seed_lack"
  | "uncertainty_raised_weather"
  | "transit_extreme_warning"
  | "pair_mismatch_warning"
  | "seasonal_mismatch_warning"
  | "rest_node_missing_warning"
  | "anchor_density_low_warning"
  | "anchor_density_high_warning"
  | "weather_dependent_in_rain_warning"
  | "pareto_dominated_soft_warning"
  | "tradeoff_acceptance_required"
  | "uncertainty_demoted_from_hard";

// ─────────────────────────────────────────────
// enum: origin phase (人間超越 Idea I、constraint genealogy)
// ─────────────────────────────────────────────

export type TravelConstraintOriginPhase =
  | "origin_t2_intent"
  | "origin_t3_itinerary"
  | "origin_t4_pareto";

// ─────────────────────────────────────────────
// enum: affected axis code
// ─────────────────────────────────────────────

export type TravelConstraintAffectedAxisCode =
  | "axis_budget"
  | "axis_transit_fatigue"
  | "axis_onsite_fatigue"
  | "axis_feasibility"
  | "axis_pair"
  | "axis_anchor"
  | "axis_red_line"
  | "axis_novelty"
  | "axis_uncertainty"
  | "axis_time_balance";

// ─────────────────────────────────────────────
// enum: cascade level (人間超越 Idea J)
// ─────────────────────────────────────────────

export type TravelConstraintCascadeLevel = "none" | "low" | "medium" | "high";

// ─────────────────────────────────────────────
// enum: top-level reason code
// ─────────────────────────────────────────────

export type TravelConstraintReasonCode =
  | "fail_closed_empty_input"
  | "all_resolved"
  | "all_hard_blocked"
  | "partial_resolved"
  | "soft_warnings_present"
  | "greedy_relaxation_candidate_set_computed"
  | "conflict_graph_built"
  | "cascade_high_detected"
  | "cascade_medium_detected"
  | "cascade_low_detected"
  | "constraint_hierarchy_applied"
  | "uncertainty_severity_demoted"
  | "deterministic_sort_applied"
  | "pareto_dominated_warning_added"
  | "no_relaxation_possible"
  | "passed_through_unsupported"
  | "passed_through_narrowing"
  | "tradeoff_compatibility_computed"
  | "conflict_heatmap_built"
  | "constraint_genealogy_tagged"
  | "feasibility_delta_computed"
  | "red_line_marked_non_relaxable"
  | "requires_explicit_red_line_revision_present"
  | "relaxation_set_is_heuristic_not_globally_minimal";

// ─────────────────────────────────────────────
// enum: missing input (progressive narrowing 用)
// ─────────────────────────────────────────────

export type TravelConstraintMissingInput =
  | "intent_output"
  | "itinerary_output"
  | "pareto_output"
  | "ranked_candidates";

// ─────────────────────────────────────────────
// Conflict graph node (人間超越 Idea C)
// ─────────────────────────────────────────────

export interface TravelConstraintConflictNode {
  candidateId: string;
  constraintField: TravelConstraintField;
  severity: TravelConstraintSeverity;
  conflictReasonCode: TravelConstraintConflictReasonCode;
  originPhase: TravelConstraintOriginPhase;
  affectedAxisCodes: TravelConstraintAffectedAxisCode[];
}

// ─────────────────────────────────────────────
// Hard block entry (人間超越 Idea D)
// ─────────────────────────────────────────────

export interface TravelHardBlockEntry {
  candidateId: string;
  blockReasonCode: TravelConstraintHardBlockCode;
  /** Optional detail code (詳細) */
  detailCode?: string;
  /** Optional relaxation suggestion (人間超越 Idea E) */
  relaxationSuggestionCode?: TravelConstraintRelaxationCode;
}

// ─────────────────────────────────────────────
// Soft warning entry (人間超越 Idea D)
// ─────────────────────────────────────────────

export interface TravelSoftWarningEntry {
  candidateId: string;
  warningReasonCode: TravelConstraintSoftWarningCode;
}

// ─────────────────────────────────────────────
// Minimal relaxation set (人間超越 Idea B、greedy heuristic)
// ─────────────────────────────────────────────

/**
 * **Greedy minimal relaxation candidate set** (heuristic、not guaranteed globally minimal).
 *
 * **CEO 2026-05-15 補正**:
 *   - 本 set は **greedy heuristic** であり、mathematically minimal ではない
 *   - 結果は **deterministic and explainable** だが globally minimal は保証されない
 *   - 利用者は "greedy minimal relaxation candidate set" として扱うべき
 *
 * **Red-line policy**:
 *   - red-line / veto constraint は **本 set に含めない** (automatic relaxation 不可)
 *   - red-line で block された候補が残る場合、relaxationCodes に
 *     `red_line_not_relaxable` marker が追加される (説明のみ、runtime action ではない)
 */
export interface TravelMinimalRelaxationSet {
  /**
   * Greedy で選ばれた relaxation codes (重複なし、deterministic lexicographic sort).
   *
   * red-line family (red_line_not_relaxable / requires_explicit_red_line_revision /
   * blocked_by_red_line / no_relaxation_possible_due_to_red_line) は marker のみで
   * automatic relaxation 候補ではない。
   */
  relaxationCodes: TravelConstraintRelaxationCode[];
  /**
   * Estimated unblocked count (この relaxation で unblock される候補数).
   *
   * red-line で残る hardBlock は count に含めない。
   */
  estimatedUnblockedCount: number;
  /** Cascade level (relaxation で何候補影響するか) */
  cascade: TravelConstraintCascadeLevel;
}

// ─────────────────────────────────────────────
// Resolved candidate
// ─────────────────────────────────────────────

export interface TravelResolvedCandidate {
  candidateId: string;
  rank: number;
  resolutionStatus: "fully_resolved" | "resolved_with_soft_warnings";
  /** Applied relaxations (空なら緩和なし) */
  appliedRelaxations: TravelConstraintRelaxationCode[];
  /** Why-resolved explanation codes (enum only) */
  whyResolvedCodes: TravelConstraintWhyResolvedCode[];
}

// ─────────────────────────────────────────────
// Constraint blocked candidate (T3/T4 から伝播 + T5 追加)
// ─────────────────────────────────────────────

export interface TravelConstraintBlockedCandidate {
  candidateId: string;
  hardBlockEntries: TravelHardBlockEntry[];
  /** Aggregated reason codes (enum only) */
  reasonCodes: TravelConstraintConflictReasonCode[];
}

// ─────────────────────────────────────────────
// Feasibility note (warning レベル)
// ─────────────────────────────────────────────

export interface TravelConstraintFeasibilityNote {
  candidateId?: string;
  noteCode: TravelConstraintSoftWarningCode;
}

// ─────────────────────────────────────────────
// Conflict heatmap (人間超越 Idea K)
// ─────────────────────────────────────────────

export type TravelConstraintHeatmap = Record<
  string, // candidateId
  Record<string, TravelConstraintSeverity> // constraintField → severity
>;

// ─────────────────────────────────────────────
// Trade-off compatibility (人間超越 Idea L)
// ─────────────────────────────────────────────

export interface TravelTradeoffCompatibilityEntry {
  candidateAId: string;
  candidateBId: string;
  acceptableTradeoffLabel: string; // T4 tradeoffLabelCode (enum string)
  resolutionSuggestion: TravelConstraintRelaxationCode;
}

// ─────────────────────────────────────────────
// Feasibility delta (人間超越 Idea M)
// ─────────────────────────────────────────────

export interface TravelFeasibilityDeltaEntry {
  candidateId: string;
  /** 1-step relaxation で成立するか */
  oneStepRelaxationFeasible: boolean;
  /** Required relaxation (1 step で成立する場合) */
  requiredRelaxation?: TravelConstraintRelaxationCode;
}

// ─────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────

/**
 * Constraint resolver input.
 *
 * **構造的安全 (raw text leakage 防止)**:
 *   - intentOutput: T2 output (enum + number)
 *   - itineraryOutput: T3 output (enum + number)
 *   - paretoOutput: T4 output (enum + number)
 *   - redLineCodes: caller-normalized fixed code list (PII 不含)
 *   - acceptableRelaxationCodes: caller-hint enum list
 */
export interface TravelConstraintResolverInput {
  intentOutput: TravelIntentOutput;
  itineraryOutput: TravelItineraryGeneratorOutput;
  paretoOutput: TravelParetoComparatorOutput;
  /** Red-line codes (caller-normalized、PII 不含) */
  redLineCodes?: string[];
  /** Caller-accepted relaxation codes (緩和 OK 候補) */
  acceptableRelaxationCodes?: TravelConstraintRelaxationCode[];
  /** Cascade thresholds override */
  cascadeHighThreshold?: number;
  cascadeMediumThreshold?: number;
}

// ─────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────

export interface TravelConstraintResolverOutput {
  /** Fully resolved or resolved-with-warnings candidates */
  resolvedCandidates: TravelResolvedCandidate[];
  /** Hard-blocked candidates */
  blockedCandidates: TravelConstraintBlockedCandidate[];
  /** Conflict graph (candidate × constraint × severity × origin × axes) */
  conflictGraph: TravelConstraintConflictNode[];
  /** Hard blocks (CEO 指定、明示 separation) */
  hardBlocks: TravelHardBlockEntry[];
  /** Soft warnings (CEO 指定、明示 separation) */
  softWarnings: TravelSoftWarningEntry[];
  /** Minimal relaxation set (greedy) */
  minimalRelaxationSet: TravelMinimalRelaxationSet;
  /** Feasibility notes (warning レベル) */
  feasibilityNotes: TravelConstraintFeasibilityNote[];
  /** Conflict heatmap (人間超越 Idea K) */
  conflictHeatmap: TravelConstraintHeatmap;
  /** Trade-off compatibility (人間超越 Idea L) */
  tradeoffCompatibility: TravelTradeoffCompatibilityEntry[];
  /** Feasibility delta (人間超越 Idea M) */
  feasibilityDelta: TravelFeasibilityDeltaEntry[];
  /** Missing inputs */
  missingInputs: TravelConstraintMissingInput[];
  /** Top-level reason codes */
  reasonCodes: TravelConstraintReasonCode[];
  /** Resolver version */
  resolverVersion: string;
}

// ─────────────────────────────────────────────
// Helper: severity hierarchy ordering (人間超越 Idea A)
// ─────────────────────────────────────────────

const SEVERITY_ORDER: Record<TravelConstraintSeverity, number> = {
  red_line: 0,
  hard: 1,
  soft: 2,
  preference: 3,
};

// ─────────────────────────────────────────────
// Helper: T3 blocked reason → conflict reason mapping (pure)
// ─────────────────────────────────────────────

function mapT3BlockedToConflictReason(
  blockedReason: TravelItineraryBlockedReasonCode,
  detailCode: string | undefined,
): { reason: TravelConstraintConflictReasonCode; severity: TravelConstraintSeverity } {
  if (blockedReason === "red_line_violation") {
    if (detailCode === "no_long_drive_violation") {
      return { reason: "red_line_no_long_drive", severity: "red_line" };
    }
    if (detailCode === "no_long_transit_violation") {
      return { reason: "red_line_no_long_transit", severity: "red_line" };
    }
    if (detailCode === "no_overseas_violation") {
      return { reason: "red_line_no_overseas", severity: "red_line" };
    }
    if (detailCode === "budget_cap_violation") {
      return { reason: "red_line_max_budget", severity: "red_line" };
    }
    if (detailCode === "fatigue_cap_violation") {
      return { reason: "red_line_max_fatigue", severity: "red_line" };
    }
    return { reason: "red_line_max_budget", severity: "red_line" };
  }
  if (blockedReason === "cognitive_load_ceiling_exceeded") {
    return { reason: "cognitive_load_ceiling_exceeded", severity: "hard" };
  }
  if (blockedReason === "anchor_overloaded") {
    return { reason: "anchor_overloaded", severity: "hard" };
  }
  if (blockedReason === "transit_extreme_cascade") {
    return { reason: "transit_extreme", severity: "hard" };
  }
  if (blockedReason === "budget_over_band") {
    return { reason: "budget_over_band", severity: "hard" };
  }
  if (blockedReason === "no_lodging_for_overnight") {
    return { reason: "missing_lodging_seed", severity: "hard" };
  }
  if (blockedReason === "no_moves_for_destinations") {
    return { reason: "missing_destination_seed", severity: "hard" };
  }
  if (blockedReason === "infeasible_graph") {
    return { reason: "infeasible_graph", severity: "hard" };
  }
  if (blockedReason === "unsupported_destination_in_seed") {
    return { reason: "red_line_no_overseas", severity: "red_line" };
  }
  return { reason: "infeasible_graph", severity: "hard" };
}

// ─────────────────────────────────────────────
// Helper: T3 feasibility note → soft warning mapping (pure)
// ─────────────────────────────────────────────

function mapT3FeasibilityToSoftWarning(
  noteCode: TravelItineraryFeasibilityNoteCode,
): TravelConstraintSoftWarningCode | undefined {
  if (noteCode === "transit_missing_between_destinations") return "transit_extreme_warning";
  if (noteCode === "lodging_missing_for_first_night") return "rest_node_missing_warning";
  if (noteCode === "lodging_missing_for_second_night") return "rest_node_missing_warning";
  if (noteCode === "meal_node_missing_for_evening") return "rest_node_missing_warning";
  if (noteCode === "rest_node_recommended") return "rest_node_missing_warning";
  if (noteCode === "anchor_density_low") return "anchor_density_low_warning";
  if (noteCode === "anchor_density_high") return "anchor_density_high_warning";
  if (noteCode === "weather_dependent_in_rain_warning") return "weather_dependent_in_rain_warning";
  if (noteCode === "seasonal_mismatch_warning") return "seasonal_mismatch_warning";
  if (noteCode === "pair_together_ratio_low_warning") return "pair_mismatch_warning";
  return undefined;
}

// ─────────────────────────────────────────────
// Helper: conflict reason → field mapping
// ─────────────────────────────────────────────

function conflictReasonToField(
  reason: TravelConstraintConflictReasonCode,
): TravelConstraintField {
  if (
    reason === "budget_over_band" ||
    reason === "red_line_max_budget"
  ) {
    return "budget";
  }
  if (
    reason === "fatigue_over_ceiling" ||
    reason === "red_line_max_fatigue" ||
    reason === "cognitive_load_ceiling_exceeded"
  ) {
    return "fatigue";
  }
  if (
    reason === "transit_extreme" ||
    reason === "red_line_no_long_drive" ||
    reason === "red_line_no_long_transit"
  ) {
    return "distance";
  }
  if (reason === "time_balance_imbalanced") return "time_window";
  if (
    reason === "weather_high_risk" ||
    reason === "weather_dependent_in_rain"
  ) {
    return "weather";
  }
  if (reason === "pair_togetherness_mismatch") return "pair_preference";
  if (reason === "red_line_no_overseas") return "red_line_explicit";
  return "red_line_explicit";
}

// ─────────────────────────────────────────────
// Helper: conflict reason → affected axes mapping
// ─────────────────────────────────────────────

function conflictReasonToAffectedAxes(
  reason: TravelConstraintConflictReasonCode,
): TravelConstraintAffectedAxisCode[] {
  if (
    reason === "budget_over_band" ||
    reason === "red_line_max_budget"
  ) {
    return ["axis_budget"];
  }
  if (
    reason === "fatigue_over_ceiling" ||
    reason === "red_line_max_fatigue"
  ) {
    return ["axis_transit_fatigue", "axis_onsite_fatigue"];
  }
  if (reason === "transit_extreme") return ["axis_transit_fatigue"];
  if (
    reason === "red_line_no_long_drive" ||
    reason === "red_line_no_long_transit"
  ) {
    return ["axis_transit_fatigue", "axis_red_line"];
  }
  if (reason === "cognitive_load_ceiling_exceeded") return ["axis_anchor", "axis_feasibility"];
  if (reason === "anchor_overloaded" || reason === "anchor_underloaded") return ["axis_anchor"];
  if (reason === "pair_togetherness_mismatch") return ["axis_pair"];
  if (
    reason === "weather_high_risk" ||
    reason === "weather_dependent_in_rain"
  ) {
    return ["axis_uncertainty"];
  }
  if (reason === "uncertainty_high") return ["axis_uncertainty"];
  if (reason === "dominated_in_pareto") return ["axis_feasibility", "axis_novelty"];
  if (reason === "infeasible_graph") return ["axis_feasibility"];
  if (reason === "red_line_no_overseas") return ["axis_red_line"];
  return ["axis_feasibility"];
}

// ─────────────────────────────────────────────
// Helper: relaxation suggestion derive from conflict reason
// ─────────────────────────────────────────────

/**
 * Conflict reason → relaxation suggestion code mapping (pure).
 *
 * **CEO 2026-05-15 補正 (red-line policy)**:
 *   - red-line / veto conflict は **automatic relaxation 不可**
 *   - red_line_* reasons → `requires_explicit_red_line_revision` または
 *     `no_relaxation_possible_due_to_red_line` (説明のみ)
 *   - これらは `computeMinimalRelaxationSet` から除外される (skip target)
 */
function deriveRelaxationSuggestion(
  reason: TravelConstraintConflictReasonCode,
): TravelConstraintRelaxationCode {
  // Non-red-line relaxable constraints
  if (reason === "budget_over_band") return "relax_budget_one_step";
  if (reason === "fatigue_over_ceiling") return "relax_fatigue_one_step";
  if (reason === "transit_extreme") return "relax_transit_one_step";
  if (reason === "cognitive_load_ceiling_exceeded") return "relax_anchor_density";
  if (reason === "anchor_overloaded") return "relax_anchor_density";
  if (reason === "anchor_underloaded") return "shift_to_different_destination";
  if (reason === "pair_togetherness_mismatch") return "accept_pair_split";
  if (reason === "weather_high_risk") return "accept_weather_risk";
  if (reason === "weather_dependent_in_rain") return "accept_weather_risk";
  if (reason === "uncertainty_high") return "accept_higher_uncertainty";
  if (reason === "dominated_in_pareto") return "accept_pareto_dominated";
  if (reason === "missing_lodging_seed") return "shift_to_different_lodging";
  if (reason === "missing_destination_seed") return "shift_to_different_destination";

  // Red-line / veto constraints — **non-relaxable by default** (CEO 2026-05-15)
  // automatic relaxation 不可。説明のみ、runtime action ではない。
  if (reason === "red_line_no_overseas") return "no_relaxation_possible_due_to_red_line";
  if (reason === "red_line_no_long_drive") return "requires_explicit_red_line_revision";
  if (reason === "red_line_no_long_transit") return "requires_explicit_red_line_revision";
  if (reason === "red_line_max_budget") return "requires_explicit_red_line_revision";
  if (reason === "red_line_max_fatigue") return "requires_explicit_red_line_revision";

  return "no_relaxation_possible";
}

// ─────────────────────────────────────────────
// Helper: hard block reason mapping
// ─────────────────────────────────────────────

function deriveHardBlockCode(
  reason: TravelConstraintConflictReasonCode,
): TravelConstraintHardBlockCode {
  if (
    reason === "red_line_no_overseas" ||
    reason === "red_line_no_long_drive" ||
    reason === "red_line_no_long_transit" ||
    reason === "red_line_max_budget" ||
    reason === "red_line_max_fatigue"
  ) {
    return "red_line_violation";
  }
  if (reason === "cognitive_load_ceiling_exceeded") return "cognitive_load_ceiling_exceeded";
  if (reason === "anchor_overloaded") return "anchor_overloaded_block";
  if (reason === "transit_extreme") return "transit_extreme_cascade_block";
  if (reason === "budget_over_band") return "budget_over_band_block";
  if (
    reason === "missing_lodging_seed" ||
    reason === "missing_destination_seed"
  ) {
    return "all_required_seeds_missing";
  }
  if (reason === "infeasible_graph") return "infeasible_graph";
  return "infeasible_graph";
}

// ─────────────────────────────────────────────
// Helper: uncertainty-aware demotion (人間超越 Idea G)
// ─────────────────────────────────────────────

/**
 * uncertainty が demote label の場合、severity を 1 段階下げる.
 *
 * hard → soft / red_line → red_line (red_line は緩和不可なので変えない).
 */
function demoteByUncertainty(
  severity: TravelConstraintSeverity,
  uncertaintyLabel: TravelUncertaintyLabel,
): TravelConstraintSeverity {
  if (uncertaintyLabel !== PROVISIONAL_UNCERTAINTY_DEMOTE_LABEL) return severity;
  if (severity === "red_line") return "red_line"; // unchanged
  if (severity === "hard") return "soft";
  return severity;
}

// ─────────────────────────────────────────────
// Helper: cascade level derive (人間超越 Idea J)
// ─────────────────────────────────────────────

function deriveCascadeLevel(
  count: number,
  highThreshold: number,
  mediumThreshold: number,
): TravelConstraintCascadeLevel {
  if (count === 0) return "none";
  if (count >= highThreshold) return "high";
  if (count >= mediumThreshold) return "medium";
  return "low";
}

// ─────────────────────────────────────────────
// Helper: minimal relaxation set (greedy、人間超越 Idea B)
// ─────────────────────────────────────────────

/**
 * Skip-list: red-line / veto / sentinel relaxation codes.
 *
 * これらは **automatic relaxation 候補に含めない** (CEO 2026-05-15 補正):
 *   - red_line_not_relaxable / requires_explicit_red_line_revision /
 *     blocked_by_red_line / no_relaxation_possible_due_to_red_line:
 *     red-line / veto は AI が緩めて良い対象ではない
 *   - no_relaxation_possible: sentinel (cover 不可)
 *
 * → これらの code を suggestion に持つ hardBlock は cover されない (block 継続)。
 */
const RED_LINE_OR_NON_RELAXABLE_CODES: ReadonlySet<TravelConstraintRelaxationCode> = new Set([
  "red_line_not_relaxable",
  "requires_explicit_red_line_revision",
  "blocked_by_red_line",
  "no_relaxation_possible_due_to_red_line",
  "no_relaxation_possible",
]);

/**
 * **Greedy minimal relaxation candidate set** computation (pure、heuristic).
 *
 * **重要 (CEO 2026-05-15 補正)**:
 *   - 本関数は **greedy heuristic** であり、**mathematically minimal** ではない
 *   - 結果は **deterministic and explainable** だが **not guaranteed globally minimal**
 *   - 出力は "greedy minimal relaxation candidate set" として扱うべき
 *
 * **Red-line policy (CEO 2026-05-15)**:
 *   - red-line / veto constraint は **automatic relaxation 候補に含めない**
 *   - red_line_* / no_relaxation_possible_due_to_red_line / requires_explicit_red_line_revision /
 *     blocked_by_red_line を持つ hardBlock は cover されない (block 継続)
 *   - red-line を変えられるのは将来 user が明示的に red-line 自体を再設定した場合のみ
 *
 * Greedy approach:
 *   1. 各 hardBlock の relaxationSuggestionCode が red-line family 以外なら集計対象
 *   2. relaxationCode 別に cover する hardBlock 数を集計
 *   3. 最大 cover を greedy で 1 つ選ぶ (deterministic: count desc → code lexicographic)
 *   4. 該当 hardBlock を集合から外す
 *   5. 残 hardBlock があれば step 2 へ (cover 可能な relaxation がなければ終了)
 *   6. red-line で残った hardBlock が存在すれば red_line_marked_non_relaxable を含む
 *
 * Deterministic: relaxation code lexicographic で tie-break、最終 result も sort。
 *
 * **本結果が globally minimal でない例**:
 *   - hardBlock = { A→{relax_X, relax_Y}, B→{relax_X}, C→{relax_Y} } (各 block が
 *     複数 relaxation で cover 可能なら、最小 set は {X,Y} だが、greedy は count
 *     優先で 1 つ目を選ぶため non-minimal の可能性がある)
 *
 *   本実装では各 hardBlock は relaxationSuggestionCode を 1 つだけ持つ設計
 *   (deriveRelaxationSuggestion で単一 code) のため、実用上は globally minimal に
 *   近い結果になるが、設計上は heuristic と扱う。
 */
function computeMinimalRelaxationSet(
  hardBlocks: TravelHardBlockEntry[],
): TravelMinimalRelaxationSet {
  if (hardBlocks.length === 0) {
    return {
      relaxationCodes: [],
      estimatedUnblockedCount: 0,
      cascade: "none",
    };
  }

  const remainingBlocks = hardBlocks.slice();
  const selectedRelaxations: TravelConstraintRelaxationCode[] = [];
  let redLineBlocksRemain = false;

  while (remainingBlocks.length > 0) {
    // 各 relaxation code が cover する hardBlock 数を集計
    // (red-line family / sentinel は skip)
    const coverage = new Map<TravelConstraintRelaxationCode, number>();
    for (const block of remainingBlocks) {
      const r = block.relaxationSuggestionCode;
      if (r === undefined) continue;
      if (RED_LINE_OR_NON_RELAXABLE_CODES.has(r)) {
        redLineBlocksRemain = true;
        continue;
      }
      coverage.set(r, (coverage.get(r) ?? 0) + 1);
    }

    if (coverage.size === 0) {
      // 緩和不可な hardBlock のみ残る
      break;
    }

    // 最大 cover を 1 つ選ぶ (deterministic: count desc → code lexicographic)
    let bestCode: TravelConstraintRelaxationCode | undefined;
    let bestCount = -1;
    for (const [code, count] of coverage) {
      if (
        count > bestCount ||
        (count === bestCount && bestCode !== undefined && code.localeCompare(bestCode) < 0)
      ) {
        bestCode = code;
        bestCount = count;
      }
    }

    if (bestCode === undefined) break;
    selectedRelaxations.push(bestCode);

    // 該当 hardBlock を集合から外す
    const beforeLen = remainingBlocks.length;
    for (let i = remainingBlocks.length - 1; i >= 0; i--) {
      if (remainingBlocks[i].relaxationSuggestionCode === bestCode) {
        remainingBlocks.splice(i, 1);
      }
    }
    if (remainingBlocks.length === beforeLen) break; // safety
  }

  // red-line で残った hardBlock があれば marker を追加 (説明用、relaxation ではない)
  if (redLineBlocksRemain) {
    selectedRelaxations.push("red_line_not_relaxable");
  }

  // 全 hardBlock が緩和不可で 1 つも選ばれなかった場合
  if (selectedRelaxations.length === 0 && remainingBlocks.length > 0) {
    selectedRelaxations.push("no_relaxation_possible");
  }

  // sort relaxation codes deterministically
  selectedRelaxations.sort((a, b) => a.localeCompare(b));

  // red-line marker は estimatedUnblockedCount に含めない
  const nonRedLineCovered = selectedRelaxations.filter(
    (r) => !RED_LINE_OR_NON_RELAXABLE_CODES.has(r),
  );
  const unblocked = hardBlocks.length - remainingBlocks.length;
  const trueUnblocked = nonRedLineCovered.length > 0 ? unblocked : 0;

  return {
    relaxationCodes: selectedRelaxations,
    estimatedUnblockedCount: trueUnblocked,
    cascade: deriveCascadeLevel(
      trueUnblocked,
      PROVISIONAL_CASCADE_HIGH_THRESHOLD,
      PROVISIONAL_CASCADE_MEDIUM_THRESHOLD,
    ),
  };
}

// ─────────────────────────────────────────────
// Helper: deterministic sort for conflict graph (人間超越 Idea H)
// ─────────────────────────────────────────────

function sortConflictNodes(nodes: TravelConstraintConflictNode[]): TravelConstraintConflictNode[] {
  return nodes.slice().sort((a, b) => {
    // 1. red_line first (severity order)
    const aSev = SEVERITY_ORDER[a.severity];
    const bSev = SEVERITY_ORDER[b.severity];
    if (aSev !== bSev) return aSev - bSev;
    // 2. field lexicographic
    if (a.constraintField !== b.constraintField) {
      return a.constraintField.localeCompare(b.constraintField);
    }
    // 3. candidateId lexicographic
    return a.candidateId.localeCompare(b.candidateId);
  });
}

// ─────────────────────────────────────────────
// Helper: trade-off compatibility (人間超越 Idea L)
// ─────────────────────────────────────────────

function buildTradeoffCompatibility(
  paretoOutput: TravelParetoComparatorOutput,
): TravelTradeoffCompatibilityEntry[] {
  const entries: TravelTradeoffCompatibilityEntry[] = [];
  for (const label of paretoOutput.tradeoffLabels) {
    // 各 trade-off label に対応する relaxation suggestion
    let suggestion: TravelConstraintRelaxationCode = "no_relaxation_possible";
    if (label.labelCode === "budget_vs_fatigue") suggestion = "relax_budget_one_step";
    else if (label.labelCode === "cheap_far_vs_near_expensive") suggestion = "relax_transit_one_step";
    else if (label.labelCode === "slow_vs_intense") suggestion = "relax_anchor_density";
    else if (label.labelCode === "comfort_vs_novelty") suggestion = "accept_higher_uncertainty";
    else if (label.labelCode === "pair_together_vs_split") suggestion = "accept_pair_split";
    else if (label.labelCode === "anchor_dense_vs_sparse") suggestion = "relax_anchor_density";
    else if (label.labelCode === "low_uncertainty_vs_high_uncertainty") suggestion = "accept_higher_uncertainty";
    else if (label.labelCode === "near_vs_far") suggestion = "relax_transit_one_step";

    entries.push({
      candidateAId: label.candidateAId,
      candidateBId: label.candidateBId,
      acceptableTradeoffLabel: label.labelCode,
      resolutionSuggestion: suggestion,
    });
  }
  return entries;
}

// ─────────────────────────────────────────────
// Helper: feasibility delta (人間超越 Idea M、1-step relaxation)
// ─────────────────────────────────────────────

function buildFeasibilityDelta(
  blockedCandidates: TravelConstraintBlockedCandidate[],
): TravelFeasibilityDeltaEntry[] {
  const entries: TravelFeasibilityDeltaEntry[] = [];

  for (const blocked of blockedCandidates) {
    // 1-step relaxation で成立か判定
    // ロジック: 該当 candidate の hard block が 1 つだけで、relaxation suggestion が 1 つあれば feasible
    const uniqueRelaxations = new Set<TravelConstraintRelaxationCode>();
    for (const block of blocked.hardBlockEntries) {
      if (
        block.relaxationSuggestionCode !== undefined &&
        block.relaxationSuggestionCode !== "no_relaxation_possible"
      ) {
        uniqueRelaxations.add(block.relaxationSuggestionCode);
      }
    }

    const oneStep = uniqueRelaxations.size === 1;
    let requiredRelax: TravelConstraintRelaxationCode | undefined;
    if (oneStep) {
      const arr = Array.from(uniqueRelaxations).sort();
      requiredRelax = arr[0];
    }

    entries.push({
      candidateId: blocked.candidateId,
      oneStepRelaxationFeasible: oneStep,
      requiredRelaxation: requiredRelax,
    });
  }

  return entries;
}

// ─────────────────────────────────────────────
// Helper: heatmap build (人間超越 Idea K)
// ─────────────────────────────────────────────

function buildConflictHeatmap(
  conflictGraph: TravelConstraintConflictNode[],
): TravelConstraintHeatmap {
  const heatmap: TravelConstraintHeatmap = {};
  for (const node of conflictGraph) {
    if (heatmap[node.candidateId] === undefined) {
      heatmap[node.candidateId] = {};
    }
    // 既存 severity と比較して最も厳しい (低 order) を残す
    const existing = heatmap[node.candidateId][node.constraintField];
    if (existing === undefined || SEVERITY_ORDER[node.severity] < SEVERITY_ORDER[existing]) {
      heatmap[node.candidateId][node.constraintField] = node.severity;
    }
  }
  return heatmap;
}

// ─────────────────────────────────────────────
// Main: constraint resolver (pure function、deterministic、stateless)
// ─────────────────────────────────────────────

/**
 * T2 / T3 / T4 output を入力に、旅行案の制約衝突を整理し、
 * 「なぜ通る / なぜ block / 何を緩めれば成立するか」を説明する pure function.
 *
 * **本関数は純関数**: 同じ input → 同じ output、副作用なし、`Math.random` 不使用、
 * 現在時刻参照なし、external state 参照なし、external API 不使用。
 *
 * **fail-closed default**:
 *   - empty T4 ranked → fail_closed_empty_input
 *   - T2 unsupported_future → passed_through_unsupported
 *   - 全 candidate hard_block → empty resolved + blockedCandidates 列挙
 *
 * **deterministic**: red_line / severity / axis / candidateId の多段階 tie-break で
 * 完全決定論的。
 */
export function resolveTravelConstraints(
  input: TravelConstraintResolverInput,
): TravelConstraintResolverOutput {
  const reasonCodes: TravelConstraintReasonCode[] = [];
  const missingInputs: TravelConstraintMissingInput[] = [];
  const cascadeHigh = input.cascadeHighThreshold ?? PROVISIONAL_CASCADE_HIGH_THRESHOLD;
  const cascadeMedium = input.cascadeMediumThreshold ?? PROVISIONAL_CASCADE_MEDIUM_THRESHOLD;

  // 1. intent pass-through
  if (input.intentOutput.inferredTravelIntent === "unsupported_future") {
    reasonCodes.push("passed_through_unsupported");
    return {
      resolvedCandidates: [],
      blockedCandidates: [],
      conflictGraph: [],
      hardBlocks: [],
      softWarnings: [],
      minimalRelaxationSet: { relaxationCodes: [], estimatedUnblockedCount: 0, cascade: "none" },
      feasibilityNotes: [],
      conflictHeatmap: {},
      tradeoffCompatibility: [],
      feasibilityDelta: [],
      missingInputs,
      reasonCodes,
      resolverVersion: CONSTRAINT_RESOLVER_VERSION,
    };
  }
  if (input.intentOutput.inferredTravelIntent === "needs_narrowing") {
    reasonCodes.push("passed_through_narrowing");
    missingInputs.push("intent_output");
    return {
      resolvedCandidates: [],
      blockedCandidates: [],
      conflictGraph: [],
      hardBlocks: [],
      softWarnings: [],
      minimalRelaxationSet: { relaxationCodes: [], estimatedUnblockedCount: 0, cascade: "none" },
      feasibilityNotes: [],
      conflictHeatmap: {},
      tradeoffCompatibility: [],
      feasibilityDelta: [],
      missingInputs,
      reasonCodes,
      resolverVersion: CONSTRAINT_RESOLVER_VERSION,
    };
  }

  // 2. empty T4 ranked + no T3 blocked + no T4 dominated → fail-closed
  //    (blocked / dominated 候補がある場合は process 続行、conflict explanation 提供)
  if (
    input.paretoOutput.rankedCandidates.length === 0 &&
    input.itineraryOutput.rankedCandidates.length === 0 &&
    input.itineraryOutput.blockedCandidates.length === 0 &&
    input.paretoOutput.dominatedCandidates.length === 0 &&
    input.paretoOutput.blockedCandidates.length === 0
  ) {
    reasonCodes.push("fail_closed_empty_input");
    missingInputs.push("ranked_candidates");
    return {
      resolvedCandidates: [],
      blockedCandidates: [],
      conflictGraph: [],
      hardBlocks: [],
      softWarnings: [],
      minimalRelaxationSet: { relaxationCodes: [], estimatedUnblockedCount: 0, cascade: "none" },
      feasibilityNotes: [],
      conflictHeatmap: {},
      tradeoffCompatibility: [],
      feasibilityDelta: [],
      missingInputs,
      reasonCodes,
      resolverVersion: CONSTRAINT_RESOLVER_VERSION,
    };
  }

  // 3. uncertainty label by candidate id (T4 から)
  const uncertaintyByCandidate: Record<string, TravelUncertaintyLabel> = {};
  for (const cand of input.paretoOutput.rankedCandidates) {
    uncertaintyByCandidate[cand.candidateId] = cand.uncertaintyLabel;
  }

  // 4. T3 blocked candidates → conflict graph + hard blocks (constraint hierarchy + genealogy)
  const conflictGraph: TravelConstraintConflictNode[] = [];
  const hardBlocks: TravelHardBlockEntry[] = [];
  const softWarnings: TravelSoftWarningEntry[] = [];
  const blockedMap: Record<string, TravelConstraintBlockedCandidate> = {};
  let demoteApplied = false;

  for (const blocked of input.itineraryOutput.blockedCandidates) {
    const { reason, severity: rawSeverity } = mapT3BlockedToConflictReason(
      blocked.blockedReasonCode,
      blocked.detailCode,
    );
    const cid = blocked.candidateId;
    // uncertainty-aware demotion (人間超越 Idea G)
    const uncLabel = uncertaintyByCandidate[cid];
    const severity = uncLabel !== undefined ? demoteByUncertainty(rawSeverity, uncLabel) : rawSeverity;
    if (severity !== rawSeverity) {
      demoteApplied = true;
    }

    const node: TravelConstraintConflictNode = {
      candidateId: cid,
      constraintField: conflictReasonToField(reason),
      severity,
      conflictReasonCode: reason,
      originPhase: "origin_t3_itinerary",
      affectedAxisCodes: conflictReasonToAffectedAxes(reason),
    };
    conflictGraph.push(node);

    if (severity === "red_line" || severity === "hard") {
      const relaxationSuggestion = deriveRelaxationSuggestion(reason);
      const hb: TravelHardBlockEntry = {
        candidateId: cid,
        blockReasonCode: deriveHardBlockCode(reason),
        detailCode: blocked.detailCode,
        relaxationSuggestionCode: relaxationSuggestion,
      };
      hardBlocks.push(hb);

      if (blockedMap[cid] === undefined) {
        blockedMap[cid] = { candidateId: cid, hardBlockEntries: [], reasonCodes: [] };
      }
      blockedMap[cid].hardBlockEntries.push(hb);
      if (!blockedMap[cid].reasonCodes.includes(reason)) {
        blockedMap[cid].reasonCodes.push(reason);
      }
    } else {
      // demoted to soft → soft warning
      softWarnings.push({
        candidateId: cid,
        warningReasonCode: "uncertainty_demoted_from_hard",
      });
    }
  }

  // 5. T3 feasibility notes → soft warnings
  for (const note of input.itineraryOutput.feasibilityNotes) {
    const warnCode = mapT3FeasibilityToSoftWarning(note.reasonCode);
    if (warnCode !== undefined && note.candidateId !== undefined) {
      softWarnings.push({
        candidateId: note.candidateId,
        warningReasonCode: warnCode,
      });
    }
  }

  // 6. T3 reasonCodes → top-level soft warnings (heatmap 入り、no candidate id)
  for (const code of input.itineraryOutput.reasonCodes) {
    if (code === "budget_transport_heavy") {
      softWarnings.push({ candidateId: "", warningReasonCode: "budget_heavy_transport" });
    } else if (code === "budget_food_underbudget") {
      softWarnings.push({ candidateId: "", warningReasonCode: "budget_underbudget_food" });
    } else if (code === "budget_lodging_heavy") {
      softWarnings.push({ candidateId: "", warningReasonCode: "budget_heavy_lodging" });
    } else if (code === "recovery_window_insufficient") {
      softWarnings.push({ candidateId: "", warningReasonCode: "rest_node_missing_warning" });
    } else if (code === "anchor_overloaded_day_detected") {
      softWarnings.push({ candidateId: "", warningReasonCode: "anchor_overloaded_day" });
    } else if (code === "anchor_underloaded_day_detected") {
      softWarnings.push({ candidateId: "", warningReasonCode: "anchor_underloaded_day" });
    } else if (code === "weather_risk_propagated") {
      softWarnings.push({ candidateId: "", warningReasonCode: "weather_risk_propagated" });
    } else if (code === "uncertainty_raised_weather") {
      softWarnings.push({ candidateId: "", warningReasonCode: "uncertainty_raised_weather" });
    } else if (code === "uncertainty_raised_seed_lack") {
      softWarnings.push({ candidateId: "", warningReasonCode: "uncertainty_raised_seed_lack" });
    } else if (code === "seasonal_mismatch_detected") {
      softWarnings.push({ candidateId: "", warningReasonCode: "seasonal_mismatch_warning" });
    } else if (code === "transit_extreme_detected") {
      softWarnings.push({ candidateId: "", warningReasonCode: "transit_extreme_warning" });
    }
  }

  // 7. T4 dominated candidates → soft warning + conflict graph
  for (const dom of input.paretoOutput.dominatedCandidates) {
    conflictGraph.push({
      candidateId: dom.candidateId,
      constraintField: "pair_preference", // dominated は通常 multi-axis、便宜 pair_preference 扱い
      severity: "soft",
      conflictReasonCode: "dominated_in_pareto",
      originPhase: "origin_t4_pareto",
      affectedAxisCodes: conflictReasonToAffectedAxes("dominated_in_pareto"),
    });
    softWarnings.push({
      candidateId: dom.candidateId,
      warningReasonCode: "pareto_dominated_soft_warning",
    });
  }

  // 8. T4 pair_mismatch_discount → soft warning + conflict
  if (input.paretoOutput.reasonCodes.includes("pair_mismatch_discount_applied")) {
    for (const ranked of input.paretoOutput.rankedCandidates) {
      const t4Score = input.paretoOutput.scoreBreakdown[ranked.candidateId];
      if (t4Score !== undefined && t4Score.pairTogethernessFit < 0.5) {
        conflictGraph.push({
          candidateId: ranked.candidateId,
          constraintField: "pair_preference",
          severity: "soft",
          conflictReasonCode: "pair_togetherness_mismatch",
          originPhase: "origin_t4_pareto",
          affectedAxisCodes: ["axis_pair"],
        });
        softWarnings.push({
          candidateId: ranked.candidateId,
          warningReasonCode: "pair_mismatch_warning",
        });
      }
    }
  }

  // 9. resolved candidates: T4 ranked のうち hard block されていない
  const resolvedCandidates: TravelResolvedCandidate[] = [];
  for (const ranked of input.paretoOutput.rankedCandidates) {
    if (blockedMap[ranked.candidateId] !== undefined) continue;

    const cid = ranked.candidateId;
    const cidSoftWarnings = softWarnings.filter((w) => w.candidateId === cid);
    const status: TravelResolvedCandidate["resolutionStatus"] =
      cidSoftWarnings.length === 0 ? "fully_resolved" : "resolved_with_soft_warnings";

    const whyResolvedCodes: TravelConstraintWhyResolvedCode[] = [];
    if (cidSoftWarnings.length === 0) {
      whyResolvedCodes.push("all_constraints_within_band");
      whyResolvedCodes.push("no_red_line_violations");
      whyResolvedCodes.push("no_hard_block");
    } else {
      whyResolvedCodes.push("soft_constraints_acceptable");
      whyResolvedCodes.push("no_red_line_violations");
    }
    if (ranked.paretoFront === 1) whyResolvedCodes.push("pareto_top_front");

    resolvedCandidates.push({
      candidateId: cid,
      rank: ranked.rank,
      resolutionStatus: status,
      appliedRelaxations: [],
      whyResolvedCodes,
    });
  }

  // 10. greedy minimal relaxation candidate set (heuristic、CEO 2026-05-15 補正)
  const minimalRelaxationSet = computeMinimalRelaxationSet(hardBlocks);
  if (hardBlocks.length > 0) {
    reasonCodes.push("greedy_relaxation_candidate_set_computed");
    // 本結果は heuristic であり globally minimal は保証されない (明示)
    reasonCodes.push("relaxation_set_is_heuristic_not_globally_minimal");
  }
  // red-line family が hardBlocks に存在すれば marker reason 追加
  if (minimalRelaxationSet.relaxationCodes.includes("red_line_not_relaxable")) {
    reasonCodes.push("red_line_marked_non_relaxable");
  }
  // hardBlocks 内に requires_explicit_red_line_revision suggestion を持つ block が
  // あれば reason 追加 (greedy set からは除外されているが、説明用 reason は立てる)
  const hasExplicitRedLineRevision = hardBlocks.some(
    (h) => h.relaxationSuggestionCode === "requires_explicit_red_line_revision",
  );
  if (hasExplicitRedLineRevision) {
    reasonCodes.push("requires_explicit_red_line_revision_present");
    if (!reasonCodes.includes("red_line_marked_non_relaxable")) {
      reasonCodes.push("red_line_marked_non_relaxable");
    }
  }

  // 11. feasibility delta (1-step relaxation)
  const blockedCandidates = Object.values(blockedMap).sort((a, b) =>
    a.candidateId.localeCompare(b.candidateId),
  );
  const feasibilityDelta = buildFeasibilityDelta(blockedCandidates);
  reasonCodes.push("feasibility_delta_computed");

  // 12. trade-off compatibility (T4 trade-off labels から)
  const tradeoffCompatibility = buildTradeoffCompatibility(input.paretoOutput);
  if (tradeoffCompatibility.length > 0) {
    reasonCodes.push("tradeoff_compatibility_computed");
  }

  // 13. conflict heatmap
  const sortedConflictGraph = sortConflictNodes(conflictGraph);
  const conflictHeatmap = buildConflictHeatmap(sortedConflictGraph);
  if (sortedConflictGraph.length > 0) {
    reasonCodes.push("conflict_graph_built");
    reasonCodes.push("conflict_heatmap_built");
    reasonCodes.push("constraint_genealogy_tagged");
  }

  // 14. feasibility notes
  const feasibilityNotes: TravelConstraintFeasibilityNote[] = softWarnings.map((w) => ({
    candidateId: w.candidateId === "" ? undefined : w.candidateId,
    noteCode: w.warningReasonCode,
  }));

  // 15. cascade reasonCodes
  if (minimalRelaxationSet.cascade === "high") {
    reasonCodes.push("cascade_high_detected");
  } else if (minimalRelaxationSet.cascade === "medium") {
    reasonCodes.push("cascade_medium_detected");
  } else if (minimalRelaxationSet.cascade === "low") {
    reasonCodes.push("cascade_low_detected");
  }

  // 16. uncertainty demotion reason
  if (demoteApplied) {
    reasonCodes.push("uncertainty_severity_demoted");
  }

  // 17. pareto dominated warning reason
  if (input.paretoOutput.dominatedCandidates.length > 0) {
    reasonCodes.push("pareto_dominated_warning_added");
  }

  // 18. minimal relaxation no_relaxation_possible
  if (minimalRelaxationSet.relaxationCodes.includes("no_relaxation_possible")) {
    reasonCodes.push("no_relaxation_possible");
  }

  // 19. constraint hierarchy applied
  reasonCodes.push("constraint_hierarchy_applied");

  // 20. resolved status reasonCodes
  if (resolvedCandidates.length === 0 && blockedCandidates.length > 0) {
    reasonCodes.push("all_hard_blocked");
  } else if (resolvedCandidates.length > 0 && blockedCandidates.length > 0) {
    reasonCodes.push("partial_resolved");
  } else if (resolvedCandidates.length > 0 && blockedCandidates.length === 0) {
    reasonCodes.push("all_resolved");
  }
  if (softWarnings.length > 0) {
    reasonCodes.push("soft_warnings_present");
  }

  reasonCodes.push("deterministic_sort_applied");

  return {
    resolvedCandidates,
    blockedCandidates,
    conflictGraph: sortedConflictGraph,
    hardBlocks,
    softWarnings,
    minimalRelaxationSet,
    feasibilityNotes,
    conflictHeatmap,
    tradeoffCompatibility,
    feasibilityDelta,
    missingInputs,
    reasonCodes,
    resolverVersion: CONSTRAINT_RESOLVER_VERSION,
  };
}
