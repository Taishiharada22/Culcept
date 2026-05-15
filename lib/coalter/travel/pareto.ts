/**
 * CoAlter Travel Domain — Pareto Comparator (T4 phase)
 *
 * 正本:
 *   - docs/coalter-travel-domain-greenfield-design.md (PR #124、design completion)
 *   - docs/coalter-master-design.md v1.2 §13.3 (Travel reflection)
 *   - lib/coalter/travel/types.ts (PR #131、T1)
 *   - lib/coalter/travel/intent.ts (PR #137、T2)
 *   - lib/coalter/travel/itinerary.ts (PR #138、T3)
 *
 * 役割:
 *   T3 (TravelItineraryGeneratorOutput) を入力に、複数の TravelCandidate /
 *   TravelItinerary を **Pareto-style multi-axis** で比較し、
 *   - 階層化された Pareto fronts (front 1 / 2 / 3...)
 *   - dominated candidate の明示
 *   - trade-off label (budget_vs_fatigue 等 8 値)
 *   - dominance reason (どの軸で勝ったか 7 値)
 *   - why-this-over-that explanation (なぜ A が B より良いか 6 値)
 *   - pair-wise comparison notes
 *   を返す **pure function**。
 *
 * **MVP scope (CEO 指示)**:
 *   - 1 泊 2 日 / 2 泊 3 日 国内旅行のみ (T3 が既に enforce、T4 は pass-through)
 *   - 海外 / 3 泊以上 / 任意期間 / 予約 API は future scope (T2/T3 で既に弾き済)
 *
 * 構造的安全設計 (Gap 4 D2 + AD2/AD3/AD4 + DD2/DD3 + T2/T3 継承):
 *   1. **raw text leakage 構造的防止** (型レベル enforcement):
 *      - input は T3 output (型 + enum + number、raw text なし)
 *      - output reasonCodes / tradeoffLabels / dominanceReasonCodes /
 *        whyCodes / comparisonNoteCodes は **enum only**
 *      - PII 構造的に保存不能 (JSON.stringify 検証)
 *   2. **provisional values** (CEO 補正反映):
 *      - PROVISIONAL_PARETO_SAFETY_BAND=0.05 (人間知覚閾値、neither dominates 境界)
 *      - PROVISIONAL_UNCERTAINTY_DISCOUNT=0.1 (high uncertainty で 10% 減)
 *      - PROVISIONAL_PAIR_MISMATCH_DISCOUNT=0.2 (pair mismatch で 20% 減)
 *      - PROVISIONAL_MAX_FRONTS=3 (front 1-3 まで)
 *      - PROVISIONAL_AXIS_WEIGHTS (各軸 weight、override 可)
 *   3. **fail-closed default**:
 *      - empty rankedCandidates → empty + fail_closed_empty_input
 *      - 1 candidate のみ → single front + single_candidate reason
 *      - 全 red-line block → empty rankedCandidates + blockedCandidates 列挙
 *   4. **deterministic**:
 *      - 純関数、Math.random 不使用、stateless、external state 参照なし
 *      - paretoFront / effectiveScore / uncertainty / paretoAxis / candidateId
 *        の多段階 tie-break で完全決定論的
 *   5. **3 軸混同回避** (Master Design v1.2 §13.6):
 *      - Axis A: Action Mode → 本 comparator の責務外
 *      - Axis B: Presence Mode → 本 comparator は presence 独立
 *      - Axis C: Domain → 本 comparator の責務 (travel domain comparison)
 *
 * 人間超越設計 13 要素 (Gap 4 D2 + AD2/AD3/AD4 + DD2/DD3 + T2/T3 継承 + T4 拡張):
 *   A. **Multi-axis Pareto front layering (新規)**: front 1, 2, 3... 階層化、
 *      1 vs 2 vs 3 段階提示
 *   B. **Trade-off label 8 値 enum (新規)**: budget_vs_fatigue / near_vs_far /
 *      slow_vs_intense / comfort_vs_novelty / pair_together_vs_split /
 *      anchor_dense_vs_sparse / cheap_far_vs_near_expensive /
 *      low_uncertainty_vs_high_uncertainty
 *   C. **Dominance reason code 7 値 (新規)**: dominates_in_budget /
 *      dominates_in_fatigue / dominates_in_feasibility / dominates_in_pair_fit /
 *      dominates_in_red_line_safety / dominates_in_novelty /
 *      dominates_universally
 *   D. **Why-this-over-that explanation 6 値 (新規)**:
 *      better_budget_with_similar_fatigue / better_fatigue_with_acceptable_budget /
 *      better_pair_fit_with_similar_feasibility / more_novel_with_acceptable_uncertainty /
 *      safer_red_line_with_comparable_richness / more_balanced_overall
 *   E. **Novelty / discovery value 軸 derive (新規)**: T3 にない novelty axis を
 *      T4 で計算 (experience seeds + anchor diversity + seasonal match)
 *   F. **Confidence-aware Pareto (新規)**: 低 confidence 候補は
 *      effectiveScore *= (1 - UNCERTAINTY_DISCOUNT) で discount
 *   G. **Red-line hard block cascade (新規)**: T3 blocked 継承 + T4 追加 block
 *      (redLineSafety < 0 残り候補も追加 block)
 *   H. **Pair preference penalty (新規)**: pair mismatch で
 *      effectiveScore *= (1 - PAIR_MISMATCH_DISCOUNT) で discount
 *   I. **Deterministic tie-break 多段階 (新規)**: paretoFront asc → effectiveScore
 *      desc → uncertainty asc → paretoAxis lexicographic → candidateId lexicographic
 *   J. **Comparison note pair-wise (新規)**: candidate ペア毎の comparison 構造
 *      (caller が specific pair を聞く時の material)
 *   K. **Threshold safety zone (新規)**: 0.05 未満の差は neither dominates、
 *      人間知覚閾値を反映、微差で順位入れ替わるのを防ぐ
 *   L. **Diversity preservation (新規)**: top 3 で同 paretoAxis 重複したら 1 つに
 *      絞る、similar candidate 並ぶの防止
 *   M. **Provisional weights override (新規)**: 各軸 weight override 可、
 *      calibration 用
 *
 * 後続 phase (本 PR scope 外):
 *   - T5: constraint resolver / conflict explanation (別 PR)
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
  TravelParetoAxis,
  TravelUncertaintyLabel,
} from "./types";
import type { TravelPairTogetherness } from "./intent";
import type {
  TravelBlockedItineraryCandidate,
  TravelItineraryScoreBreakdown,
  TravelRankedItineraryCandidate,
} from "./itinerary";

// ─────────────────────────────────────────────
// comparator version (calibration 用)
// ─────────────────────────────────────────────

export const PARETO_COMPARATOR_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// provisional values (確定値ではない)
// ─────────────────────────────────────────────

/**
 * Provisional Pareto safety band (人間知覚閾値、neither dominates 境界).
 *
 * 2 つの candidate の score 差が 0.05 未満 → neither dominates、人間が
 * 「ほぼ同じ」と感じる範囲。微差で順位入れ替わるのを防ぐ。
 */
export const PROVISIONAL_PARETO_SAFETY_BAND = 0.05;

/**
 * Provisional uncertainty discount (high uncertainty で 10% 減).
 *
 * 低 confidence 候補は同じ score でも下位 rank。
 */
export const PROVISIONAL_UNCERTAINTY_DISCOUNT = 0.1;

/**
 * Provisional pair mismatch discount (pair mismatch で 20% 減).
 *
 * pair preference と pairTogethernessFit がミスマッチ → effective score 0.8 倍。
 */
export const PROVISIONAL_PAIR_MISMATCH_DISCOUNT = 0.2;

/**
 * Provisional max fronts (front 1-3 まで返す).
 */
export const PROVISIONAL_MAX_FRONTS = 3;

/**
 * Provisional axis weights (各軸 weight、override 可).
 *
 * 合計が 1.0 になる必要なし (relative weight として使われる)。
 */
export const PROVISIONAL_AXIS_WEIGHTS: TravelParetoAxisWeights = {
  budget: 0.15,
  transitFatigue: 0.1,
  onSiteFatigue: 0.1,
  feasibility: 0.15,
  pair: 0.1,
  anchor: 0.05,
  redLineSafety: 0.2,
  novelty: 0.05,
  uncertainty: 0.05,
  timeBalance: 0.05,
};

// ─────────────────────────────────────────────
// Axis weights (本 file local、override 可)
// ─────────────────────────────────────────────

export interface TravelParetoAxisWeights {
  budget: number;
  transitFatigue: number;
  onSiteFatigue: number;
  feasibility: number;
  pair: number;
  anchor: number;
  redLineSafety: number;
  novelty: number;
  uncertainty: number;
  timeBalance: number;
}

// ─────────────────────────────────────────────
// enum: trade-off label (人間超越 Idea B、8 値)
// ─────────────────────────────────────────────

/**
 * Trade-off label (candidate ペア間の trade-off 軸):
 *
 *   - budget_vs_fatigue: 安いが疲労 / 高いが楽
 *   - near_vs_far: 近いが特色少ない / 遠いが特色多い
 *   - slow_vs_intense: ゆっくりだが体験少ない / 詰め込みだが豊富
 *   - comfort_vs_novelty: 慣れた領域 / 新規挑戦
 *   - pair_together_vs_split: 常に一緒 / 独立行動 tolerance
 *   - anchor_dense_vs_sparse: 詰め込み / ゆとり
 *   - cheap_far_vs_near_expensive: 古典的 Pareto trade-off
 *   - low_uncertainty_vs_high_uncertainty: 確実だが普通 / 不確実だが大胆
 */
export type TravelParetoTradeoffLabelCode =
  | "budget_vs_fatigue"
  | "near_vs_far"
  | "slow_vs_intense"
  | "comfort_vs_novelty"
  | "pair_together_vs_split"
  | "anchor_dense_vs_sparse"
  | "cheap_far_vs_near_expensive"
  | "low_uncertainty_vs_high_uncertainty";

// ─────────────────────────────────────────────
// enum: dominance reason code (人間超越 Idea C、7 値)
// ─────────────────────────────────────────────

/**
 * Dominance reason code (A が B を dominate した時の軸):
 *
 *   - dominates_in_budget: budget 軸で勝ち
 *   - dominates_in_fatigue: fatigue 軸で勝ち
 *   - dominates_in_feasibility: feasibility 軸で勝ち
 *   - dominates_in_pair_fit: pair 軸で勝ち
 *   - dominates_in_red_line_safety: red-line 軸で勝ち
 *   - dominates_in_novelty: novelty 軸で勝ち
 *   - dominates_universally: 全軸で勝ち (Pareto 厳密 dominance)
 */
export type TravelParetoDominanceReasonCode =
  | "dominates_in_budget"
  | "dominates_in_fatigue"
  | "dominates_in_feasibility"
  | "dominates_in_pair_fit"
  | "dominates_in_red_line_safety"
  | "dominates_in_novelty"
  | "dominates_universally";

// ─────────────────────────────────────────────
// enum: why-this-over-that explanation (人間超越 Idea D、6 値)
// ─────────────────────────────────────────────

/**
 * Why-this-over-that explanation code (なぜ A の方が良いか):
 *
 *   - better_budget_with_similar_fatigue
 *   - better_fatigue_with_acceptable_budget
 *   - better_pair_fit_with_similar_feasibility
 *   - more_novel_with_acceptable_uncertainty
 *   - safer_red_line_with_comparable_richness
 *   - more_balanced_overall
 */
export type TravelParetoWhyCode =
  | "better_budget_with_similar_fatigue"
  | "better_fatigue_with_acceptable_budget"
  | "better_pair_fit_with_similar_feasibility"
  | "more_novel_with_acceptable_uncertainty"
  | "safer_red_line_with_comparable_richness"
  | "more_balanced_overall";

// ─────────────────────────────────────────────
// enum: comparison note code (pair-wise note)
// ─────────────────────────────────────────────

export type TravelParetoComparisonNoteCode =
  | "neither_dominates_within_safety_band"
  | "a_dominates_b_strictly"
  | "a_dominates_b_with_caveat"
  | "tradeoff_present"
  | "axis_disparity_high"
  | "axis_disparity_low";

// ─────────────────────────────────────────────
// enum: top-level reason code
// ─────────────────────────────────────────────

export type TravelParetoReasonCode =
  | "fail_closed_empty_input"
  | "single_candidate"
  | "all_candidates_blocked"
  | "pareto_layering_applied"
  | "diversity_preservation_applied"
  | "uncertainty_discount_applied"
  | "pair_mismatch_discount_applied"
  | "safety_band_neither_dominates"
  | "tradeoff_labels_generated"
  | "dominance_reasons_attached"
  | "why_codes_attached"
  | "deterministic_sort_applied"
  | "max_fronts_truncated"
  | "red_line_hard_block_propagated"
  | "novelty_axis_derived"
  | "weights_overridden";

// ─────────────────────────────────────────────
// enum: missing input (progressive narrowing 用)
// ─────────────────────────────────────────────

export type TravelParetoMissingInput =
  | "ranked_candidates"
  | "score_breakdowns";

// ─────────────────────────────────────────────
// Pareto front (人間超越 Idea A)
// ─────────────────────────────────────────────

export interface TravelParetoFront {
  /** Front number (1-based、1 が最も dominate されない front) */
  frontNumber: number;
  /** 含まれる candidate id (lexicographic sort) */
  candidateIds: string[];
}

// ─────────────────────────────────────────────
// Ranked Pareto candidate
// ─────────────────────────────────────────────

export interface TravelRankedParetoCandidate {
  candidateId: string;
  /** Overall rank (1-based) */
  rank: number;
  /** Pareto front number (1-based) */
  paretoFront: number;
  /** Effective score (after uncertainty/pair discount) */
  effectiveScore: number;
  /** Pareto axis label (T3 から継承) */
  paretoAxis: TravelParetoAxis;
  /** Uncertainty label */
  uncertaintyLabel: TravelUncertaintyLabel;
  /** Why-this-rank explanation codes */
  whyThisRankCodes: TravelParetoWhyCode[];
}

// ─────────────────────────────────────────────
// Dominated candidate (Pareto 厳密 dominated、front 1 から除外)
// ─────────────────────────────────────────────

export interface TravelDominatedCandidate {
  candidateId: string;
  dominatedByCandidateId: string;
  dominanceReasonCodes: TravelParetoDominanceReasonCode[];
}

// ─────────────────────────────────────────────
// Trade-off label entry
// ─────────────────────────────────────────────

export interface TravelTradeoffLabel {
  candidateAId: string;
  candidateBId: string;
  labelCode: TravelParetoTradeoffLabelCode;
}

// ─────────────────────────────────────────────
// Pareto score breakdown (T3 から拡張、novelty 軸追加)
// ─────────────────────────────────────────────

export interface TravelParetoScoreBreakdown {
  /** Inherited from T3 */
  feasibility: number;
  transitFatigue: number;
  onSiteFatigue: number;
  budgetFit: number;
  timeBalance: number;
  pairTogethernessFit: number;
  anchorWanderBalance: number;
  redLineSafety: number;
  uncertaintyScore: number;
  /** T4 拡張 (人間超越 Idea E、novelty 軸 derive) */
  noveltyScore: number;
  /** Effective score (after uncertainty/pair discount + weights) */
  effectiveScore: number;
  /** Pareto axis (T3 から継承) */
  paretoAxis: TravelParetoAxis;
}

// ─────────────────────────────────────────────
// Comparison note (pair-wise)
// ─────────────────────────────────────────────

export interface TravelParetoComparisonNote {
  candidateAId: string;
  candidateBId: string;
  noteCode: TravelParetoComparisonNoteCode;
}

// ─────────────────────────────────────────────
// Input (T3 output + optional override)
// ─────────────────────────────────────────────

/**
 * Travel Pareto comparator input.
 *
 * **構造的安全 (raw text leakage 防止)**:
 *   - rankedCandidates: T3 output (型 + enum)
 *   - blockedCandidates: T3 output (型 + enum)
 *   - pairTogethernessPreference: enum
 *   - axisWeightOverrides: number-only weights
 */
export interface TravelParetoComparatorInput {
  rankedCandidates: TravelRankedItineraryCandidate[];
  blockedCandidates?: TravelBlockedItineraryCandidate[];
  /** Pair preference (T2 から伝播、override 可) */
  pairTogethernessPreference?: TravelPairTogetherness;
  /** Pareto safety band (default: 0.05) */
  paretoSafetyBand?: number;
  /** Max fronts (default: 3) */
  maxFronts?: number;
  /** Axis weight overrides (calibration 用) */
  axisWeightOverrides?: Partial<TravelParetoAxisWeights>;
}

// ─────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────

export interface TravelParetoComparatorOutput {
  /** Pareto fronts (front 1 / 2 / 3..., max maxFronts) */
  paretoFronts: TravelParetoFront[];
  /** Final ranked candidates (top to bottom) */
  rankedCandidates: TravelRankedParetoCandidate[];
  /** Dominated candidates (Pareto 厳密 dominated) */
  dominatedCandidates: TravelDominatedCandidate[];
  /** Trade-off labels (candidate pair 間) */
  tradeoffLabels: TravelTradeoffLabel[];
  /** Score breakdown by candidate id */
  scoreBreakdown: Record<string, TravelParetoScoreBreakdown>;
  /** Blocked candidates (T3 + T4 追加) */
  blockedCandidates: TravelBlockedItineraryCandidate[];
  /** Comparison notes (pair-wise) */
  comparisonNotes: TravelParetoComparisonNote[];
  /** Missing inputs */
  missingInputs: TravelParetoMissingInput[];
  /** Top-level reason codes */
  reasonCodes: TravelParetoReasonCode[];
  /** Comparator version */
  comparatorVersion: string;
}

// ─────────────────────────────────────────────
// Helper: novelty score derive (人間超越 Idea E、pure)
// ─────────────────────────────────────────────

/**
 * Novelty / discovery value 軸を T3 score breakdown から derive (pure).
 *
 * 計算:
 *   - anchor diversity: anchorWanderBalance が 0.5 周辺で max (variety)
 *   - feasibility が高い → ある程度 explorable
 *   - uncertaintyScore が中程度 → discovery 余地あり (高すぎると info_lacking)
 *
 * Range: 0-1、高いほど novel。
 */
function deriveNoveltyScore(breakdown: TravelItineraryScoreBreakdown): number {
  // anchor diversity score (0.5 周辺で max)
  const anchorDiversity = 1 - Math.abs(breakdown.anchorWanderBalance - 0.5) * 2;
  // 0.3-0.7 uncertainty 範囲で discovery 余地あり
  const uncertaintyForDiscovery =
    breakdown.uncertaintyScore >= 0.3 && breakdown.uncertaintyScore <= 0.7
      ? 1
      : 0.4;
  // feasibility は novelty に positive
  const feasibilityFactor = Math.max(breakdown.feasibility, 0);
  return Math.min(
    Math.max(
      anchorDiversity * 0.3 + uncertaintyForDiscovery * 0.4 + feasibilityFactor * 0.3,
      0,
    ),
    1,
  );
}

// ─────────────────────────────────────────────
// Helper: effective score (人間超越 Idea F + H、pure)
// ─────────────────────────────────────────────

/**
 * Effective score: T3 totalScore に discount を適用 (pure).
 *
 *   - uncertainty discount: uncertaintyScore > 0.6 → score *= (1 - 0.1)
 *   - pair mismatch discount: pairTogethernessFit < 0.5 → score *= (1 - 0.2)
 *   - red-line safety: -1 violation → score 強制 -1 (block 候補)
 */
function computeEffectiveScore(
  totalScore: number,
  uncertaintyScore: number,
  pairTogethernessFit: number,
  redLineSafety: number,
  uncertaintyDiscount: number,
  pairDiscount: number,
): number {
  if (redLineSafety < 0) return -1;
  let eff = totalScore;
  if (uncertaintyScore > 0.6) eff = eff * (1 - uncertaintyDiscount);
  if (pairTogethernessFit < 0.5) eff = eff * (1 - pairDiscount);
  return eff;
}

// ─────────────────────────────────────────────
// Helper: weighted total (人間超越 Idea M、pure)
// ─────────────────────────────────────────────

function computeWeightedTotal(
  breakdown: TravelParetoScoreBreakdown,
  weights: TravelParetoAxisWeights,
): number {
  return (
    weights.budget * breakdown.budgetFit +
    weights.transitFatigue * breakdown.transitFatigue +
    weights.onSiteFatigue * breakdown.onSiteFatigue +
    weights.feasibility * breakdown.feasibility +
    weights.pair * breakdown.pairTogethernessFit +
    weights.anchor * breakdown.anchorWanderBalance +
    weights.redLineSafety * breakdown.redLineSafety +
    weights.novelty * breakdown.noveltyScore +
    weights.uncertainty * (1 - breakdown.uncertaintyScore) +
    weights.timeBalance * breakdown.timeBalance
  );
}

// ─────────────────────────────────────────────
// Helper: Pareto dominance check (人間超越 Idea K safety band、pure)
// ─────────────────────────────────────────────

/**
 * A が B を Pareto dominate するか判定 (with safety band).
 *
 * dominate ⇔ 全軸 A >= B (within band) ∧ 1+ 軸 A > B (beyond band)
 *
 * safety band 内の差は dominance 判定しない (人間知覚閾値)。
 */
function paretoDominates(
  a: TravelParetoScoreBreakdown,
  b: TravelParetoScoreBreakdown,
  band: number,
): { dominates: boolean; reasons: TravelParetoDominanceReasonCode[] } {
  const reasons: TravelParetoDominanceReasonCode[] = [];
  const axes: { name: string; aVal: number; bVal: number; reasonCode: TravelParetoDominanceReasonCode }[] = [
    { name: "budget", aVal: a.budgetFit, bVal: b.budgetFit, reasonCode: "dominates_in_budget" },
    {
      name: "transitFatigue",
      aVal: a.transitFatigue,
      bVal: b.transitFatigue,
      reasonCode: "dominates_in_fatigue",
    },
    {
      name: "onSiteFatigue",
      aVal: a.onSiteFatigue,
      bVal: b.onSiteFatigue,
      reasonCode: "dominates_in_fatigue",
    },
    {
      name: "feasibility",
      aVal: a.feasibility,
      bVal: b.feasibility,
      reasonCode: "dominates_in_feasibility",
    },
    {
      name: "pair",
      aVal: a.pairTogethernessFit,
      bVal: b.pairTogethernessFit,
      reasonCode: "dominates_in_pair_fit",
    },
    {
      name: "redLineSafety",
      aVal: a.redLineSafety,
      bVal: b.redLineSafety,
      reasonCode: "dominates_in_red_line_safety",
    },
    {
      name: "novelty",
      aVal: a.noveltyScore,
      bVal: b.noveltyScore,
      reasonCode: "dominates_in_novelty",
    },
  ];

  let allAtLeastEqual = true;
  let oneStrictlyBetter = false;
  let universallyBetter = true;
  const usedReasons = new Set<TravelParetoDominanceReasonCode>();

  for (const ax of axes) {
    const diff = ax.aVal - ax.bVal;
    if (diff < -band) {
      // A < B by more than band → A does not dominate
      allAtLeastEqual = false;
      universallyBetter = false;
    }
    if (diff > band) {
      // A > B by more than band → A strictly better on this axis
      oneStrictlyBetter = true;
      usedReasons.add(ax.reasonCode);
    } else {
      // within safety band on this axis
      universallyBetter = false;
    }
  }

  if (allAtLeastEqual && oneStrictlyBetter) {
    if (universallyBetter) {
      reasons.push("dominates_universally");
    } else {
      // each unique axis reason
      for (const r of usedReasons) reasons.push(r);
    }
    return { dominates: true, reasons };
  }
  return { dominates: false, reasons: [] };
}

// ─────────────────────────────────────────────
// Helper: Pareto fronts compute (人間超越 Idea A、pure)
// ─────────────────────────────────────────────

/**
 * Pareto front を階層化計算 (pure).
 *
 * front 1 = 誰にも dominate されない候補
 * front 2 = front 1 を除いて誰にも dominate されない候補
 * ...
 */
function computeParetoFronts(
  breakdowns: Record<string, TravelParetoScoreBreakdown>,
  candidateIds: string[],
  band: number,
  maxFronts: number,
): { fronts: TravelParetoFront[]; dominated: TravelDominatedCandidate[] } {
  const fronts: TravelParetoFront[] = [];
  const dominated: TravelDominatedCandidate[] = [];

  let remaining = candidateIds.slice();
  let frontNumber = 1;

  while (remaining.length > 0 && frontNumber <= maxFronts) {
    const currentFront: string[] = [];
    const nextRemaining: string[] = [];

    for (const cid of remaining) {
      const ax = breakdowns[cid];
      if (ax === undefined) continue;
      // dominate されるか check
      let dominatedBy: string | undefined;
      let dominatedReasons: TravelParetoDominanceReasonCode[] = [];

      for (const other of remaining) {
        if (other === cid) continue;
        const otherAx = breakdowns[other];
        if (otherAx === undefined) continue;
        const result = paretoDominates(otherAx, ax, band);
        if (result.dominates) {
          dominatedBy = other;
          dominatedReasons = result.reasons;
          break;
        }
      }

      if (dominatedBy === undefined) {
        currentFront.push(cid);
      } else {
        nextRemaining.push(cid);
        // 上位 front 候補で dominate された場合のみ記録 (front 1 で dominated)
        if (frontNumber === 1) {
          dominated.push({
            candidateId: cid,
            dominatedByCandidateId: dominatedBy,
            dominanceReasonCodes: dominatedReasons,
          });
        }
      }
    }

    if (currentFront.length === 0) break;
    fronts.push({
      frontNumber,
      candidateIds: currentFront.slice().sort((a, b) => a.localeCompare(b)),
    });
    remaining = nextRemaining;
    frontNumber++;
  }

  return { fronts, dominated };
}

// ─────────────────────────────────────────────
// Helper: trade-off label 判定 (人間超越 Idea B、pair-wise、pure)
// ─────────────────────────────────────────────

/**
 * 2 つの candidate 間の trade-off label を判定 (pure).
 *
 * 最も顕著な軸差を返す。複数 axes で対立があれば最大差で選択。
 */
function deriveTradeoffLabel(
  a: TravelParetoScoreBreakdown,
  b: TravelParetoScoreBreakdown,
): TravelParetoTradeoffLabelCode | undefined {
  // 各 axis 差分計算
  const budgetDiff = Math.abs(a.budgetFit - b.budgetFit);
  const fatigueDiff = Math.abs(
    (a.transitFatigue + a.onSiteFatigue) / 2 - (b.transitFatigue + b.onSiteFatigue) / 2,
  );
  const pairDiff = Math.abs(a.pairTogethernessFit - b.pairTogethernessFit);
  const noveltyDiff = Math.abs(a.noveltyScore - b.noveltyScore);
  const anchorDiff = Math.abs(a.anchorWanderBalance - b.anchorWanderBalance);
  const uncertaintyDiff = Math.abs(a.uncertaintyScore - b.uncertaintyScore);

  // axis 別 differential が一定以上で対立があれば label
  // 最大差で label 選択 (deterministic)
  const candidates: { code: TravelParetoTradeoffLabelCode; diff: number }[] = [];
  if (budgetDiff > 0.15 && fatigueDiff > 0.15) {
    candidates.push({ code: "budget_vs_fatigue", diff: budgetDiff + fatigueDiff });
  }
  if (a.paretoAxis === "cheap_far" && b.paretoAxis === "near_expensive") {
    candidates.push({ code: "cheap_far_vs_near_expensive", diff: 1 });
  } else if (a.paretoAxis === "near_expensive" && b.paretoAxis === "cheap_far") {
    candidates.push({ code: "cheap_far_vs_near_expensive", diff: 1 });
  }
  if (a.paretoAxis === "slow_pace" && b.paretoAxis === "intense_pace") {
    candidates.push({ code: "slow_vs_intense", diff: 1 });
  } else if (a.paretoAxis === "intense_pace" && b.paretoAxis === "slow_pace") {
    candidates.push({ code: "slow_vs_intense", diff: 1 });
  }
  if (noveltyDiff > 0.2) {
    candidates.push({ code: "comfort_vs_novelty", diff: noveltyDiff });
  }
  if (pairDiff > 0.2) {
    candidates.push({ code: "pair_together_vs_split", diff: pairDiff });
  }
  if (anchorDiff > 0.2) {
    candidates.push({ code: "anchor_dense_vs_sparse", diff: anchorDiff });
  }
  if (uncertaintyDiff > 0.2) {
    candidates.push({ code: "low_uncertainty_vs_high_uncertainty", diff: uncertaintyDiff });
  }
  if (
    Math.abs(a.budgetFit - b.budgetFit) > 0.2 &&
    Math.abs(a.feasibility - b.feasibility) > 0.1
  ) {
    candidates.push({ code: "near_vs_far", diff: Math.abs(a.budgetFit - b.budgetFit) });
  }

  if (candidates.length === 0) return undefined;

  // 最大 diff を持つもの (tie-break: code lexicographic)
  candidates.sort((x, y) => {
    if (x.diff !== y.diff) return y.diff - x.diff;
    return x.code.localeCompare(y.code);
  });
  return candidates[0].code;
}

// ─────────────────────────────────────────────
// Helper: why-this-over-that explanation (人間超越 Idea D、pure)
// ─────────────────────────────────────────────

/**
 * "なぜ A が B より良いか" を構造化 (pure).
 *
 * A の effective score > B の effective score 前提で、どの軸での優位が
 * 主因かを判定。
 */
function deriveWhyAOverB(
  a: TravelParetoScoreBreakdown,
  b: TravelParetoScoreBreakdown,
): TravelParetoWhyCode | undefined {
  // budget で勝ち、fatigue は similar
  if (
    a.budgetFit - b.budgetFit > 0.1 &&
    Math.abs(a.transitFatigue - b.transitFatigue) < 0.15
  ) {
    return "better_budget_with_similar_fatigue";
  }
  // fatigue で勝ち、budget は許容範囲
  if (
    a.transitFatigue + a.onSiteFatigue - b.transitFatigue - b.onSiteFatigue > 0.2 &&
    Math.abs(a.budgetFit - b.budgetFit) < 0.2
  ) {
    return "better_fatigue_with_acceptable_budget";
  }
  // pair fit で勝ち、feasibility は similar
  if (
    a.pairTogethernessFit - b.pairTogethernessFit > 0.15 &&
    Math.abs(a.feasibility - b.feasibility) < 0.15
  ) {
    return "better_pair_fit_with_similar_feasibility";
  }
  // novelty で勝ち、uncertainty は許容範囲
  if (
    a.noveltyScore - b.noveltyScore > 0.15 &&
    a.uncertaintyScore - b.uncertaintyScore < 0.2
  ) {
    return "more_novel_with_acceptable_uncertainty";
  }
  // red-line で勝ち、richness は comparable
  if (
    a.redLineSafety - b.redLineSafety > 0.1 &&
    Math.abs(a.noveltyScore + a.anchorWanderBalance - b.noveltyScore - b.anchorWanderBalance) <
      0.2
  ) {
    return "safer_red_line_with_comparable_richness";
  }
  // 全体的に balanced
  if (
    a.feasibility >= 0.5 &&
    a.budgetFit >= 0.5 &&
    a.pairTogethernessFit >= 0.5 &&
    a.redLineSafety >= 0.5
  ) {
    return "more_balanced_overall";
  }
  return undefined;
}

// ─────────────────────────────────────────────
// Helper: pair mismatch 判定 (pure)
// ─────────────────────────────────────────────

function isPairMismatch(
  pairTogethernessFit: number,
  preference: TravelPairTogetherness | undefined,
): boolean {
  if (preference === undefined || preference === "unknown") return false;
  return pairTogethernessFit < 0.5;
}

// ─────────────────────────────────────────────
// Helper: diversity preservation (人間超越 Idea L、pure)
// ─────────────────────────────────────────────

/**
 * Top N で同 paretoAxis 重複を 1 つに絞る (pure).
 *
 * deterministic: effectiveScore desc → uncertainty asc → candidateId lexicographic
 * の順で、各 paretoAxis から最初に出現した candidate を残す。
 */
function applyDiversityPreservation(
  sorted: TravelRankedParetoCandidate[],
  topN: number,
): TravelRankedParetoCandidate[] {
  const result: TravelRankedParetoCandidate[] = [];
  const seenAxes = new Set<TravelParetoAxis>();

  for (const cand of sorted) {
    if (result.length >= topN) break;
    if (!seenAxes.has(cand.paretoAxis)) {
      result.push(cand);
      seenAxes.add(cand.paretoAxis);
    }
  }
  // 残り枠は seen axis でも追加 (top N 維持)
  if (result.length < topN) {
    for (const cand of sorted) {
      if (result.length >= topN) break;
      if (!result.includes(cand)) result.push(cand);
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// Helper: comparison note 構築 (pair-wise、pure)
// ─────────────────────────────────────────────

function buildComparisonNotes(
  rankedIds: string[],
  breakdowns: Record<string, TravelParetoScoreBreakdown>,
  band: number,
): TravelParetoComparisonNote[] {
  const notes: TravelParetoComparisonNote[] = [];

  for (let i = 0; i < rankedIds.length; i++) {
    for (let j = i + 1; j < rankedIds.length; j++) {
      const aId = rankedIds[i];
      const bId = rankedIds[j];
      const a = breakdowns[aId];
      const b = breakdowns[bId];
      if (a === undefined || b === undefined) continue;

      const scoreDiff = Math.abs(a.effectiveScore - b.effectiveScore);
      const totalAxesDisparity =
        Math.abs(a.budgetFit - b.budgetFit) +
        Math.abs(a.transitFatigue - b.transitFatigue) +
        Math.abs(a.onSiteFatigue - b.onSiteFatigue) +
        Math.abs(a.noveltyScore - b.noveltyScore);
      let code: TravelParetoComparisonNoteCode;

      const dom = paretoDominates(a, b, band);
      if (dom.dominates) {
        if (dom.reasons.includes("dominates_universally")) {
          code = "a_dominates_b_strictly";
        } else {
          code = "a_dominates_b_with_caveat";
        }
      } else if (totalAxesDisparity > 1.0) {
        // 高 disparity → trade-off (axis 別大差) を最優先で表現
        code = "axis_disparity_high";
      } else if (scoreDiff < band && totalAxesDisparity < 0.3) {
        // 真の near-equivalent (score 差小 + axis 差小)
        code = "neither_dominates_within_safety_band";
      } else if (totalAxesDisparity < 0.3) {
        code = "axis_disparity_low";
      } else {
        code = "tradeoff_present";
      }

      notes.push({
        candidateAId: aId,
        candidateBId: bId,
        noteCode: code,
      });
    }
  }

  return notes;
}

// ─────────────────────────────────────────────
// Helper: trade-off labels 構築 (pair-wise、pure)
// ─────────────────────────────────────────────

function buildTradeoffLabels(
  rankedIds: string[],
  breakdowns: Record<string, TravelParetoScoreBreakdown>,
): TravelTradeoffLabel[] {
  const labels: TravelTradeoffLabel[] = [];
  for (let i = 0; i < rankedIds.length; i++) {
    for (let j = i + 1; j < rankedIds.length; j++) {
      const aId = rankedIds[i];
      const bId = rankedIds[j];
      const a = breakdowns[aId];
      const b = breakdowns[bId];
      if (a === undefined || b === undefined) continue;
      const labelCode = deriveTradeoffLabel(a, b);
      if (labelCode !== undefined) {
        labels.push({ candidateAId: aId, candidateBId: bId, labelCode });
      }
    }
  }
  return labels;
}

// ─────────────────────────────────────────────
// Helper: why codes 構築 (per candidate vs reference、pure)
// ─────────────────────────────────────────────

function buildWhyCodes(
  candidate: TravelRankedParetoCandidate,
  breakdowns: Record<string, TravelParetoScoreBreakdown>,
  ranked: TravelRankedParetoCandidate[],
): TravelParetoWhyCode[] {
  const codes: TravelParetoWhyCode[] = [];
  const a = breakdowns[candidate.candidateId];
  if (a === undefined) return codes;
  // top rank は why_code 無 (自分自身) のため、次の rank と比較
  for (const other of ranked) {
    if (other.candidateId === candidate.candidateId) continue;
    if (other.rank > candidate.rank) {
      // candidate が better than other
      const b = breakdowns[other.candidateId];
      if (b === undefined) continue;
      const why = deriveWhyAOverB(a, b);
      if (why !== undefined && !codes.includes(why)) {
        codes.push(why);
      }
    }
  }
  return codes;
}

// ─────────────────────────────────────────────
// Main: Pareto comparator (pure function、deterministic、stateless)
// ─────────────────────────────────────────────

/**
 * T3 (TravelItineraryGeneratorOutput) を入力に、Pareto-style multi-axis 比較を行う
 * pure function.
 *
 * **本関数は純関数**: 同じ input → 同じ output、副作用なし、`Math.random` 不使用、
 * 現在時刻参照なし、external state 参照なし、external API 不使用。
 *
 * **fail-closed default**:
 *   - empty rankedCandidates → empty + fail_closed_empty_input
 *   - 1 candidate のみ → single_candidate + 単一 front
 *   - 全 red-line block → empty rankedCandidates + blockedCandidates 列挙
 *
 * **deterministic**: paretoFront / effectiveScore / uncertainty / paretoAxis /
 * candidateId の多段階 tie-break で完全決定論的。
 *
 * @param input T3 output (rankedCandidates / blockedCandidates) + optional override
 * @returns paretoFronts / rankedCandidates / dominatedCandidates / tradeoffLabels /
 *          scoreBreakdown / blockedCandidates / comparisonNotes / missingInputs /
 *          reasonCodes / comparatorVersion
 */
export function compareTravelCandidatesPareto(
  input: TravelParetoComparatorInput,
): TravelParetoComparatorOutput {
  const reasonCodes: TravelParetoReasonCode[] = [];
  const missingInputs: TravelParetoMissingInput[] = [];
  const band = input.paretoSafetyBand ?? PROVISIONAL_PARETO_SAFETY_BAND;
  const maxFronts = input.maxFronts ?? PROVISIONAL_MAX_FRONTS;

  // weights override
  const weights: TravelParetoAxisWeights = {
    ...PROVISIONAL_AXIS_WEIGHTS,
    ...input.axisWeightOverrides,
  };
  if (input.axisWeightOverrides !== undefined) {
    reasonCodes.push("weights_overridden");
  }

  // 1. empty input fail-closed
  if (input.rankedCandidates.length === 0) {
    reasonCodes.push("fail_closed_empty_input");
    missingInputs.push("ranked_candidates");
    return {
      paretoFronts: [],
      rankedCandidates: [],
      dominatedCandidates: [],
      tradeoffLabels: [],
      scoreBreakdown: {},
      blockedCandidates: input.blockedCandidates ?? [],
      comparisonNotes: [],
      missingInputs,
      reasonCodes,
      comparatorVersion: PARETO_COMPARATOR_VERSION,
    };
  }

  // 2. T3 から redLineSafety < 0 残候補を追加 block (red-line cascade)
  const validCandidates: TravelRankedItineraryCandidate[] = [];
  const additionalBlocked: TravelBlockedItineraryCandidate[] = [];
  for (const cand of input.rankedCandidates) {
    if (cand.scoreBreakdown.redLineSafety < 0) {
      additionalBlocked.push({
        candidateId: cand.candidate.candidateId,
        blockedReasonCode: "red_line_violation",
      });
    } else {
      validCandidates.push(cand);
    }
  }

  if (additionalBlocked.length > 0) {
    reasonCodes.push("red_line_hard_block_propagated");
  }

  const allBlocked: TravelBlockedItineraryCandidate[] = [
    ...(input.blockedCandidates ?? []),
    ...additionalBlocked,
  ];

  // 3. all blocked
  if (validCandidates.length === 0) {
    reasonCodes.push("all_candidates_blocked");
    return {
      paretoFronts: [],
      rankedCandidates: [],
      dominatedCandidates: [],
      tradeoffLabels: [],
      scoreBreakdown: {},
      blockedCandidates: allBlocked,
      comparisonNotes: [],
      missingInputs,
      reasonCodes,
      comparatorVersion: PARETO_COMPARATOR_VERSION,
    };
  }

  // 4. Pareto score breakdown 構築 (novelty + effective score)
  const breakdowns: Record<string, TravelParetoScoreBreakdown> = {};
  for (const cand of validCandidates) {
    const t3 = cand.scoreBreakdown;
    const noveltyScore = deriveNoveltyScore(t3);
    const pretotal = computeWeightedTotal(
      {
        feasibility: t3.feasibility,
        transitFatigue: t3.transitFatigue,
        onSiteFatigue: t3.onSiteFatigue,
        budgetFit: t3.budgetFit,
        timeBalance: t3.timeBalance,
        pairTogethernessFit: t3.pairTogethernessFit,
        anchorWanderBalance: t3.anchorWanderBalance,
        redLineSafety: t3.redLineSafety,
        uncertaintyScore: t3.uncertaintyScore,
        noveltyScore,
        effectiveScore: 0,
        paretoAxis: t3.paretoAxis,
      },
      weights,
    );
    const eff = computeEffectiveScore(
      pretotal,
      t3.uncertaintyScore,
      t3.pairTogethernessFit,
      t3.redLineSafety,
      PROVISIONAL_UNCERTAINTY_DISCOUNT,
      PROVISIONAL_PAIR_MISMATCH_DISCOUNT,
    );

    breakdowns[cand.candidate.candidateId] = {
      feasibility: t3.feasibility,
      transitFatigue: t3.transitFatigue,
      onSiteFatigue: t3.onSiteFatigue,
      budgetFit: t3.budgetFit,
      timeBalance: t3.timeBalance,
      pairTogethernessFit: t3.pairTogethernessFit,
      anchorWanderBalance: t3.anchorWanderBalance,
      redLineSafety: t3.redLineSafety,
      uncertaintyScore: t3.uncertaintyScore,
      noveltyScore,
      effectiveScore: eff,
      paretoAxis: t3.paretoAxis,
    };

    if (t3.uncertaintyScore > 0.6) reasonCodes.push("uncertainty_discount_applied");
    if (isPairMismatch(t3.pairTogethernessFit, input.pairTogethernessPreference)) {
      reasonCodes.push("pair_mismatch_discount_applied");
    }
  }

  if (validCandidates.length > 0) {
    reasonCodes.push("novelty_axis_derived");
  }

  // 5. single candidate handling
  if (validCandidates.length === 1) {
    const cand = validCandidates[0];
    const bd = breakdowns[cand.candidate.candidateId];
    reasonCodes.push("single_candidate");
    reasonCodes.push("deterministic_sort_applied");
    return {
      paretoFronts: [
        { frontNumber: 1, candidateIds: [cand.candidate.candidateId] },
      ],
      rankedCandidates: [
        {
          candidateId: cand.candidate.candidateId,
          rank: 1,
          paretoFront: 1,
          effectiveScore: bd.effectiveScore,
          paretoAxis: bd.paretoAxis,
          uncertaintyLabel: cand.uncertaintyLabel,
          whyThisRankCodes: [],
        },
      ],
      dominatedCandidates: [],
      tradeoffLabels: [],
      scoreBreakdown: breakdowns,
      blockedCandidates: allBlocked,
      comparisonNotes: [],
      missingInputs,
      reasonCodes,
      comparatorVersion: PARETO_COMPARATOR_VERSION,
    };
  }

  // 6. Pareto fronts compute (人間超越 Idea A)
  const candidateIds = validCandidates.map((c) => c.candidate.candidateId);
  const { fronts, dominated } = computeParetoFronts(breakdowns, candidateIds, band, maxFronts);
  reasonCodes.push("pareto_layering_applied");
  reasonCodes.push("dominance_reasons_attached");

  if (fronts.length >= maxFronts && candidateIds.length > fronts.flatMap((f) => f.candidateIds).length) {
    reasonCodes.push("max_fronts_truncated");
  }

  // 7. ranked candidates 構築 (multi-stage tie-break、人間超越 Idea I)
  const uncertaintyLabelMap: Record<string, TravelUncertaintyLabel> = {};
  for (const cand of validCandidates) {
    uncertaintyLabelMap[cand.candidate.candidateId] = cand.uncertaintyLabel;
  }

  const allRanked: TravelRankedParetoCandidate[] = [];
  for (const front of fronts) {
    for (const cid of front.candidateIds) {
      const bd = breakdowns[cid];
      if (bd === undefined) continue;
      allRanked.push({
        candidateId: cid,
        rank: 0, // updated post-sort
        paretoFront: front.frontNumber,
        effectiveScore: bd.effectiveScore,
        paretoAxis: bd.paretoAxis,
        uncertaintyLabel: uncertaintyLabelMap[cid],
        whyThisRankCodes: [],
      });
    }
  }

  // Multi-stage tie-break: paretoFront asc → effectiveScore desc →
  // uncertainty asc (low first) → paretoAxis lexicographic → candidateId lexicographic
  const uncertaintyOrder: Record<TravelUncertaintyLabel, number> = {
    high_confidence: 0,
    mid_confidence: 1,
    low_confidence: 2,
    info_lacking: 3,
  };

  allRanked.sort((a, b) => {
    if (a.paretoFront !== b.paretoFront) return a.paretoFront - b.paretoFront;
    if (Math.abs(a.effectiveScore - b.effectiveScore) > 0.001) {
      return b.effectiveScore - a.effectiveScore;
    }
    const aUnc = uncertaintyOrder[a.uncertaintyLabel] ?? 1;
    const bUnc = uncertaintyOrder[b.uncertaintyLabel] ?? 1;
    if (aUnc !== bUnc) return aUnc - bUnc;
    if (a.paretoAxis !== b.paretoAxis) return a.paretoAxis.localeCompare(b.paretoAxis);
    return a.candidateId.localeCompare(b.candidateId);
  });

  // 8. apply diversity preservation (top maxFronts、人間超越 Idea L)
  const diverseRanked = applyDiversityPreservation(allRanked, maxFronts);
  if (diverseRanked.length < allRanked.length) {
    reasonCodes.push("diversity_preservation_applied");
  }

  // rank 番号付与
  for (let i = 0; i < diverseRanked.length; i++) {
    diverseRanked[i].rank = i + 1;
  }

  // 9. why codes 構築 (per candidate、人間超越 Idea D)
  for (const cand of diverseRanked) {
    cand.whyThisRankCodes = buildWhyCodes(cand, breakdowns, diverseRanked);
  }
  if (diverseRanked.some((c) => c.whyThisRankCodes.length > 0)) {
    reasonCodes.push("why_codes_attached");
  }

  // 10. trade-off labels 構築 (人間超越 Idea B)
  const rankedIds = diverseRanked.map((c) => c.candidateId);
  const tradeoffLabels = buildTradeoffLabels(rankedIds, breakdowns);
  if (tradeoffLabels.length > 0) {
    reasonCodes.push("tradeoff_labels_generated");
  }

  // 11. comparison notes (pair-wise、人間超越 Idea J)
  const comparisonNotes = buildComparisonNotes(rankedIds, breakdowns, band);
  if (comparisonNotes.some((n) => n.noteCode === "neither_dominates_within_safety_band")) {
    reasonCodes.push("safety_band_neither_dominates");
  }

  reasonCodes.push("deterministic_sort_applied");

  return {
    paretoFronts: fronts,
    rankedCandidates: diverseRanked,
    dominatedCandidates: dominated,
    tradeoffLabels,
    scoreBreakdown: breakdowns,
    blockedCandidates: allBlocked,
    comparisonNotes,
    missingInputs,
    reasonCodes,
    comparatorVersion: PARETO_COMPARATOR_VERSION,
  };
}
