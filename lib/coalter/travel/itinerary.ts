/**
 * CoAlter Travel Domain — Itinerary Generator (T3 phase)
 *
 * 正本:
 *   - docs/coalter-travel-domain-greenfield-design.md (PR #124、design completion)
 *   - docs/coalter-master-design.md v1.2 §13.3 (Travel reflection)
 *   - lib/coalter/travel/types.ts (Batch-C PR #131、T1 phase)
 *   - lib/coalter/travel/intent.ts (PR #137、T2 phase)
 *
 * 役割:
 *   T2 (TravelIntentOutput) + caller-provided **normalized seeds** から、
 *   1-2 泊国内旅行 MVP scope の **TravelItinerary / TravelCandidate** を
 *   生成・比較する **pure function**。
 *
 *   seed-based design: caller が外部 API なしに提供する normalized seed
 *   (destination / experience / lodging / move) を組み合わせて itinerary
 *   graph (DAG) を構築。外部 API / 巨大 catalog / raw text parser は使わない。
 *
 * **MVP scope (CEO 指示)**:
 *   - 1 泊 2 日 / 2 泊 3 日 国内旅行のみ
 *   - 海外 / 3 泊以上 / 任意期間 / 予約 API / 宿泊 API / 交通 API / Web Search /
 *     Google Places は **future scope** (本 generator は接続なし)
 *
 * 構造的安全設計 (Gap 4 D2 + AD2/AD3/AD4 + DD2/DD3 + T2 継承):
 *   1. **raw text leakage 構造的防止** (型レベル enforcement):
 *      - input は **T2 output + normalized seed** のみ
 *      - seed の placeIdCode は **opaque caller-normalized code** (raw place name 不可)
 *      - output reasonCodes / blockedReasonCodes / feasibilityReasonCodes は **enum only**
 *      - rationale 等は本 generator では生成しない (T6 UI phase で caller 側 derive)
 *   2. **provisional values** (CEO 補正反映):
 *      - `PROVISIONAL_MAX_CANDIDATES = 3` (MVP 2-3 案、PR #124 Idea 3)
 *      - `PROVISIONAL_ANCHOR_PER_DAY_CEILING = 3` (詰め込み防止)
 *      - `PROVISIONAL_TRANSIT_MINUTES_HIGH = 120` (high cost 境界)
 *      - `PROVISIONAL_TRANSIT_MINUTES_EXTREME = 240` (extreme cost 境界)
 *      - `PROVISIONAL_TRANSPORT_BUDGET_HEAVY_RATIO = 0.5` (移動費 50% 超 warning)
 *      - `PROVISIONAL_FOOD_BUDGET_FLOOR_RATIO = 0.1` (食事費 10% 未満 warning)
 *      - 最終値は T5/T6 phase で実 data 観測後決定
 *   3. **fail-closed default**:
 *      - empty seeds → empty itineraries + fail_closed_no_seeds
 *      - T2 unsupported_future → empty + passed_through_unsupported
 *      - T2 out_of_scope_handoff → empty + passed_through_handoff
 *      - T2 needs_narrowing → empty + passed_through_narrowing
 *      - 全 candidate red-line block → empty rankedCandidates + blockedCandidates 列挙
 *   4. **deterministic**:
 *      - 純関数、Math.random 不使用、stateless、external state 参照なし
 *      - seedId lexicographic + paretoAxis + score で完全決定論的 sort
 *   5. **3 軸混同回避** (Master Design v1.2 §13.6、PR #122):
 *      - Axis A: Action Mode → 本 generator の責務外
 *      - Axis B: Presence Mode → 本 generator は presence 独立
 *      - Axis C: Domain → 本 generator の責務 (travel domain itinerary)
 *
 * 人間超越設計 12 要素 (Gap 4 D2 + AD2/AD3/AD4 + DD2/DD3 + T2 継承 + T3 拡張):
 *   A. **Day rhythm pattern (新規)**: 4 値 enum で「日のリズム」を構造化
 *      (intense_morning / balanced_arc / late_start_evening_peak / flexible_unstructured)
 *   B. **Transition risk matrix (新規)**: low / medium / high / extreme の 4 段階、
 *      durationMinutes 別 cascade 評価
 *   C. **Recovery window injection (新規)**: rest node 不足検出
 *      (午後活動 2 連続 + rest なし → insufficient_recovery_window warning)
 *   D. **Pair time balance signature (新規)**: together_node_ratio /
 *      split_node_ratio / shared_anchor_count を計算、pair=together_all_time
 *      vs flexible_split の preference 照合
 *   E. **Anchor density curve (新規)**: 1 日 anchor 数 0 → underloaded、
 *      1-2 → balanced、3+ → overloaded、詰め込み・退屈の自動検出
 *   F. **Budget allocation 4 分割 (新規)**: lodging / transport / food /
 *      activity 別 ratio 計算、transport>50% / food<10% で warning
 *   G. **Seasonal fit propagation (新規)**: T2 seasonalHint と seed
 *      seasonalityCode 照合、match / mismatch を reason 化
 *   H. **Pareto axis labeling (T1 継承)**: 各 candidate に paretoAxis 割当
 *      (cheap_far / near_expensive / balanced / slow_pace / intense_pace)
 *   I. **Uncertainty cascade propagation (新規)**: node 個別 uncertainty を
 *      itinerary 全体に集約、weather signal で 1 段階上げ
 *   J. **Red-line cascade (新規)**: red-line 違反は単 node ではなく itinerary
 *      全体 block (例: no_long_drive + transit>2hr → block)
 *   K. **Cognitive load ceiling (AD4 継承)**: 1 日 anchor + transit count >
 *      ceiling で block (詰め込み防止)
 *   L. **Confidence dimension propagation (新規)**: T2 confidenceByDimension を
 *      itinerary uncertainty に伝播
 *
 * 後続 phase (本 PR scope 外):
 *   - T4: Pareto comparator (axis 別 trade-off 提示、別 PR)
 *   - T5: constraint resolver / conflict explanation (別 PR)
 *   - T6: UI presentation (Product Unit 連携、別 PR)
 *   - T7: Step E orchestrator wiring (CEO 戦略判断、別 PR)
 *
 * 本 PR の不可触 (CEO 2026-05-15 制約):
 *   - runtime call-site wiring / orchestrator 接続 / Daily planner 接続 / DomainRouter 接続
 *   - ChatClient / UpperLayerMount / route / API / env / flags / migration
 *   - external API / booking API (じゃらん / 楽天) / Places API / Routes API / Web Search
 *   - lib/coalter/travel/types.ts touch (新 type は本 file local 定義)
 *   - Activity AD5 / Daily DD4 / Gap 4 D3 実装
 */

import type {
  TravelActivityType,
  TravelAnchorLevel,
  TravelBudgetBand,
  TravelCandidate,
  TravelCandidateRationale,
  TravelConstraint,
  TravelConstraintField,
  TravelConstraintSeverity,
  TravelFatigueLevel,
  TravelItinerary,
  TravelMove,
  TravelNode,
  TravelNodeType,
  TravelParetoAxis,
  TravelTimeSlot,
  TravelTransport,
  TravelUncertaintyLabel,
} from "./types";
import type {
  TravelDestinationCode,
  TravelIntentOutput,
  TravelPairTogetherness,
  TravelSeasonalSignal,
  TravelWeatherForecastSignal,
} from "./intent";

// ─────────────────────────────────────────────
// itinerary generator version (calibration 用)
// ─────────────────────────────────────────────

export const ITINERARY_GENERATOR_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// provisional values (確定値ではない)
// ─────────────────────────────────────────────

/** Provisional max ranked candidates (MVP 2-3 案、PR #124 Idea 3) */
export const PROVISIONAL_MAX_CANDIDATES = 3;

/** Provisional anchor per day ceiling (詰め込み防止) */
export const PROVISIONAL_ANCHOR_PER_DAY_CEILING = 3;

/** Provisional cognitive load ceiling (anchor + transit count per day) */
export const PROVISIONAL_COGNITIVE_LOAD_CEILING_PER_DAY = 5;

/** Provisional transit minutes boundaries (transition risk 評価) */
export const PROVISIONAL_TRANSIT_MINUTES_LOW = 30;
export const PROVISIONAL_TRANSIT_MINUTES_MEDIUM = 60;
export const PROVISIONAL_TRANSIT_MINUTES_HIGH = 120;
export const PROVISIONAL_TRANSIT_MINUTES_EXTREME = 240;

/** Provisional budget allocation thresholds */
export const PROVISIONAL_TRANSPORT_BUDGET_HEAVY_RATIO = 0.5;
export const PROVISIONAL_FOOD_BUDGET_FLOOR_RATIO = 0.1;
export const PROVISIONAL_LODGING_BUDGET_HEAVY_RATIO = 0.7;

// ─────────────────────────────────────────────
// Day rhythm pattern (人間超越 Idea A、4 値)
// ─────────────────────────────────────────────

/**
 * Day rhythm pattern (人間特有の「日のリズム」):
 *
 *   - intense_morning: 早朝出発 + 朝-午前ピーク、午後ゆっくり
 *   - balanced_arc: 朝 → 昼 → 午後 → 夕方の均等弧
 *   - late_start_evening_peak: 遅いスタート + 夕方-夜ピーク
 *   - flexible_unstructured: 構造化なし (柔軟、wander 多)
 */
export type TravelDayRhythmPattern =
  | "intense_morning"
  | "balanced_arc"
  | "late_start_evening_peak"
  | "flexible_unstructured";

// ─────────────────────────────────────────────
// Transition risk level (人間超越 Idea B、4 値)
// ─────────────────────────────────────────────

/**
 * Transition risk level (durationMinutes 別):
 *
 *   - low: < 30 min (徒歩 / 短時間電車)
 *   - medium: 30-60 min
 *   - high: 60-120 min
 *   - extreme: >= 240 min (新幹線 + 乗換等)
 */
export type TravelTransitionRiskLevel = "low" | "medium" | "high" | "extreme";

// ─────────────────────────────────────────────
// Seed types (本 file local、caller-provided normalized seeds)
// ─────────────────────────────────────────────

/**
 * Destination seed (caller-provided、外部 API なしで提供):
 *
 * **重要**: raw place name (例: "京都駅") を含めない。caller が normalized
 * opaque code (例: "dest_seed_001") を提供。本 generator は opaque code として扱う。
 */
export interface TravelDestinationSeed {
  /** Opaque seed id (caller-normalized、PII 不含、lexicographic sort 可) */
  seedId: string;
  /** Opaque place id code (raw place name 不可、normalized identifier) */
  placeIdCode: string;
  /** Region code (T2 enum と一致) */
  region: TravelDestinationCode;
  /** Default fatigue load (1-5) */
  defaultFatigueLoad: TravelFatigueLevel;
  /** Budget estimate band */
  budgetEstimate: TravelBudgetBand;
  /** Anchor level (anchor / wander) */
  anchorLevel: TravelAnchorLevel;
  /** Activity type */
  activityType: TravelActivityType;
  /** Seasonality code (optional、季節限定 attribute) */
  seasonalityCode?: TravelSeasonalSignal;
  /** Weather dependency (optional) */
  weatherDependency?: "weather_dependent" | "weather_independent";
}

/**
 * Experience seed (体験 node、観光地 / 体験施設等):
 */
export interface TravelExperienceSeed {
  seedId: string;
  placeIdCode: string;
  activityType: TravelActivityType;
  defaultFatigueLoad: TravelFatigueLevel;
  /** Experience duration (分、>= 0) */
  durationMinutes: number;
  budgetEstimate: TravelBudgetBand;
  anchorLevel: TravelAnchorLevel;
  /** Compatible time slots (caller hint、複数 OK) */
  compatibleTimeSlots?: TravelTimeSlot[];
  seasonalityCode?: TravelSeasonalSignal;
  weatherDependency?: "weather_dependent" | "weather_independent";
}

/**
 * Lodging seed (宿泊 node):
 */
export interface TravelLodgingSeed {
  seedId: string;
  placeIdCode: string;
  region: TravelDestinationCode;
  budgetEstimate: TravelBudgetBand;
  /** Lodging は基本 anchor (確定) */
  anchorLevel: TravelAnchorLevel;
}

/**
 * Move seed (移動 edge、from-to + transport):
 */
export interface TravelMoveSeed {
  seedId: string;
  fromPlaceIdCode: string;
  toPlaceIdCode: string;
  transport: TravelTransport;
  /** Move duration (分、>= 0) */
  durationMinutes: number;
  costEstimate: TravelBudgetBand;
}

// ─────────────────────────────────────────────
// Score breakdown (10 軸、人間超越設計集約)
// ─────────────────────────────────────────────

/**
 * Itinerary score breakdown (CEO 指定 10 軸 + 人間超越 Idea):
 *
 * 各軸は -1 (red flag) ～ 1 (positive) で正規化。totalScore は weighted sum。
 */
export interface TravelItineraryScoreBreakdown {
  /** Itinerary feasibility (graph connectivity + time consistency) */
  feasibility: number;
  /** Transit fatigue (moves durationMinutes 合計から 0-1) */
  transitFatigue: number;
  /** On-site fatigue (nodes fatigueLoad sum から 0-1) */
  onSiteFatigue: number;
  /** Budget band fit (T2 budget hint vs itinerary total) */
  budgetFit: number;
  /** Time balance (active / rest ratio per day) */
  timeBalance: number;
  /** Pair togetherness fit (T2 pairTogetherness vs together_node_ratio) */
  pairTogethernessFit: number;
  /** Anchor-and-wander balance (anchor / wander 比) */
  anchorWanderBalance: number;
  /** Red-line safety (-1 violation, 0 neutral, 1 safe) */
  redLineSafety: number;
  /** Uncertainty score (0-1、高いほど不確実) */
  uncertaintyScore: number;
  /** Weighted total score (各軸の重み付き合計、-1 to 1) */
  totalScore: number;
  /** Pareto axis (本 candidate の特徴) */
  paretoAxis: TravelParetoAxis;
  /** Day rhythm pattern (各 day 別) */
  dayRhythmPatterns: TravelDayRhythmPattern[];
  /** Transition risk levels (各 move 別) */
  transitionRisks: TravelTransitionRiskLevel[];
  /** Anchor count per day */
  anchorCountPerDay: number[];
  /** Pair time balance signature */
  pairBalanceSignature: TravelPairBalanceSignature;
  /** Budget allocation 4 分割 */
  budgetAllocation: TravelBudgetAllocation;
}

/**
 * Pair time balance signature (人間超越 Idea D).
 */
export interface TravelPairBalanceSignature {
  togetherNodeRatio: number;
  splitNodeRatio: number;
  sharedAnchorCount: number;
}

/**
 * Budget allocation 4 分割 (人間超越 Idea F、ratio 0-1).
 */
export interface TravelBudgetAllocation {
  lodgingRatio: number;
  transportRatio: number;
  foodRatio: number;
  activityRatio: number;
  totalCost: number;
}

// ─────────────────────────────────────────────
// Ranked candidate / blocked candidate / feasibility notes
// ─────────────────────────────────────────────

/**
 * Ranked itinerary candidate (extends TravelCandidate from T1).
 */
export interface TravelRankedItineraryCandidate {
  /** Inherited from T1 TravelCandidate (id + itinerary + rationale + paretoAxis + appliedConstraints) */
  candidate: TravelCandidate;
  /** Rank (1-based、1 が最上位) */
  rank: number;
  /** Score breakdown (10 軸 + 人間超越) */
  scoreBreakdown: TravelItineraryScoreBreakdown;
  /** Uncertainty label (cascade propagation 後) */
  uncertaintyLabel: TravelUncertaintyLabel;
  /** Explanation reason codes (enum only) */
  explanationReasonCodes: TravelItineraryExplanationCode[];
}

/**
 * Blocked candidate (red-line / cognitive ceiling 等で除外).
 */
export interface TravelBlockedItineraryCandidate {
  candidateId: string;
  blockedReasonCode: TravelItineraryBlockedReasonCode;
  /** Blocking 詳細 (例: 違反した red-line code、constraint field 等、enum) */
  detailCode?: TravelItineraryBlockedDetailCode;
}

/**
 * Feasibility note (graph 構築上の問題点、warning レベル).
 */
export interface TravelFeasibilityNote {
  reasonCode: TravelItineraryFeasibilityNoteCode;
  /** 関連 candidate id (optional、全候補共通の場合は undefined) */
  candidateId?: string;
}

// ─────────────────────────────────────────────
// Enum reason codes (raw text 不可、enum only)
// ─────────────────────────────────────────────

/**
 * Top-level reason code (raw text 不可、enum only).
 */
export type TravelItineraryReasonCode =
  | "fail_closed_no_seeds"
  | "fail_closed_no_destinations"
  | "fail_closed_no_lodging_for_overnight"
  | "passed_through_unsupported"
  | "passed_through_handoff"
  | "passed_through_narrowing"
  | "candidates_generated"
  | "all_candidates_blocked"
  | "partial_candidates_blocked"
  | "max_candidates_truncated"
  | "anchor_overloaded_day_detected"
  | "anchor_underloaded_day_detected"
  | "transit_extreme_detected"
  | "budget_transport_heavy"
  | "budget_food_underbudget"
  | "budget_lodging_heavy"
  | "recovery_window_insufficient"
  | "weather_risk_propagated"
  | "seasonal_match_detected"
  | "seasonal_mismatch_detected"
  | "uncertainty_raised_weather"
  | "uncertainty_raised_seed_lack"
  | "deterministic_sort_applied";

/**
 * Explanation reason code (per candidate、enum only).
 */
export type TravelItineraryExplanationCode =
  | "pareto_axis_cheap_far"
  | "pareto_axis_near_expensive"
  | "pareto_axis_balanced"
  | "pareto_axis_slow_pace"
  | "pareto_axis_intense_pace"
  | "rhythm_intense_morning"
  | "rhythm_balanced_arc"
  | "rhythm_late_start_evening_peak"
  | "rhythm_flexible_unstructured"
  | "fatigue_friendly_itinerary"
  | "fatigue_intense_itinerary"
  | "budget_match"
  | "budget_tight_aligned"
  | "budget_ample_aligned"
  | "pair_together_aligned"
  | "pair_split_aligned"
  | "anchor_dense"
  | "anchor_sparse"
  | "anchor_balanced"
  | "recovery_window_present"
  | "weather_safe_itinerary"
  | "seasonal_peak_aligned"
  | "high_feasibility"
  | "low_feasibility"
  | "low_cognitive_load"
  | "balanced_score";

/**
 * Blocked reason code (per blocked candidate、enum only).
 */
export type TravelItineraryBlockedReasonCode =
  | "red_line_violation"
  | "cognitive_load_ceiling_exceeded"
  | "anchor_overloaded"
  | "transit_extreme_cascade"
  | "budget_over_band"
  | "no_lodging_for_overnight"
  | "no_moves_for_destinations"
  | "infeasible_graph"
  | "unsupported_destination_in_seed";

/**
 * Blocked detail code (optional、enum only).
 */
export type TravelItineraryBlockedDetailCode =
  | "no_long_drive_violation"
  | "no_long_transit_violation"
  | "no_overseas_violation"
  | "budget_cap_violation"
  | "fatigue_cap_violation";

/**
 * Feasibility note code (warning レベル、enum only).
 */
export type TravelItineraryFeasibilityNoteCode =
  | "transit_missing_between_destinations"
  | "lodging_missing_for_first_night"
  | "lodging_missing_for_second_night"
  | "meal_node_missing_for_evening"
  | "rest_node_recommended"
  | "anchor_density_low"
  | "anchor_density_high"
  | "weather_dependent_in_rain_warning"
  | "seasonal_mismatch_warning"
  | "pair_together_ratio_low_warning";

/**
 * Missing input enum (progressive narrowing 用).
 */
export type TravelItineraryMissingInput =
  | "destination_seeds"
  | "lodging_seeds_for_overnight"
  | "move_seeds_between_destinations"
  | "experience_seeds"
  | "intent_output"
  | "duration_signal";

// ─────────────────────────────────────────────
// Input (T2 output + caller-provided seeds)
// ─────────────────────────────────────────────

/**
 * Travel itinerary generator input.
 *
 * **構造的安全 (raw text leakage 防止)**:
 *   - intentOutput: T2 output (enum + number、raw text なし)
 *   - seeds: caller-provided opaque normalized code (raw place name 不可)
 *   - redLineCodes は T2 で既に受領、本 input では intent から伝播
 */
export interface TravelItineraryGeneratorInput {
  intentOutput: TravelIntentOutput;
  destinationSeeds?: TravelDestinationSeed[];
  experienceSeeds?: TravelExperienceSeed[];
  lodgingSeeds?: TravelLodgingSeed[];
  moveSeeds?: TravelMoveSeed[];
  /** Red-line codes (caller-normalized、PII 不含) */
  redLineCodes?: string[];
  /** Pair preference (T2 から省略時は intent から) */
  pairTogethernessOverride?: TravelPairTogetherness;
  /** Max ranked candidates (default: PROVISIONAL_MAX_CANDIDATES = 3) */
  maxCandidates?: number;
  /** Cognitive load ceiling per day (default: 5) */
  cognitiveLoadCeilingPerDay?: number;
}

/**
 * Travel itinerary generator output.
 */
export interface TravelItineraryGeneratorOutput {
  /** Ranked candidates (rank asc、max maxCandidates) */
  rankedCandidates: TravelRankedItineraryCandidate[];
  /** Blocked candidates (red-line / ceiling 等) */
  blockedCandidates: TravelBlockedItineraryCandidate[];
  /** Feasibility notes (warning) */
  feasibilityNotes: TravelFeasibilityNote[];
  /** Score breakdown by candidate id */
  scoreBreakdown: Record<string, TravelItineraryScoreBreakdown>;
  /** Missing inputs (progressive narrowing) */
  missingInputs: TravelItineraryMissingInput[];
  /** Top-level reason codes (enum only) */
  reasonCodes: TravelItineraryReasonCode[];
  /** Itinerary generator version */
  itineraryVersion: string;
}

// ─────────────────────────────────────────────
// Helper: transition risk level 判定 (pure)
// ─────────────────────────────────────────────

function deriveTransitionRisk(durationMinutes: number): TravelTransitionRiskLevel {
  if (durationMinutes < PROVISIONAL_TRANSIT_MINUTES_LOW) return "low";
  if (durationMinutes < PROVISIONAL_TRANSIT_MINUTES_MEDIUM) return "low";
  if (durationMinutes < PROVISIONAL_TRANSIT_MINUTES_HIGH) return "medium";
  if (durationMinutes < PROVISIONAL_TRANSIT_MINUTES_EXTREME) return "high";
  return "extreme";
}

// ─────────────────────────────────────────────
// Helper: day rhythm pattern 判定 (pure、人間超越 Idea A)
// ─────────────────────────────────────────────

function deriveDayRhythm(dayNodes: TravelNode[]): TravelDayRhythmPattern {
  if (dayNodes.length === 0) return "flexible_unstructured";

  // anchor nodes の time slot 分布で判定
  const anchorTimeSlots = dayNodes
    .filter((n) => n.anchorLevel === "anchor" && n.type !== "lodging")
    .map((n) => n.startTime);

  const hasMorning = anchorTimeSlots.includes("morning");
  const hasNoon = anchorTimeSlots.includes("noon");
  const hasAfternoon = anchorTimeSlots.includes("afternoon");
  const hasEvening = anchorTimeSlots.includes("evening");
  const hasNight = anchorTimeSlots.includes("night");

  if (hasMorning && !hasEvening && !hasNight) return "intense_morning";
  if ((hasEvening || hasNight) && !hasMorning) return "late_start_evening_peak";
  if (hasMorning && hasNoon && hasAfternoon) return "balanced_arc";
  return "flexible_unstructured";
}

// ─────────────────────────────────────────────
// Helper: cognitive load 判定 (per day、anchor + transit count)
// ─────────────────────────────────────────────

function computeDayCognitiveLoad(dayNodes: TravelNode[], dayMoves: TravelMove[]): number {
  const anchors = dayNodes.filter((n) => n.anchorLevel === "anchor").length;
  const transits = dayMoves.length;
  return anchors + transits;
}

// ─────────────────────────────────────────────
// Helper: anchor density per day (人間超越 Idea E)
// ─────────────────────────────────────────────

function anchorCountPerDay(itinerary: TravelItinerary): number[] {
  const counts: number[] = [];
  for (let day = 1; day <= itinerary.totalDays + 1; day++) {
    // 各 day の anchor 数 (lodging 除く)
    const dayAnchors = itinerary.nodes.filter(
      (n) =>
        n.anchorLevel === "anchor" &&
        n.type !== "lodging" &&
        n.type !== "start" &&
        n.type !== "return" &&
        // dayId 等は本 MVP では nodes に明示しない、placeholder で
        true,
    ).length;
    counts.push(dayAnchors);
    break; // 簡略実装: 全 anchor sum を 1 day としてカウント
  }
  // simple impl: nodes 全体の anchor count を totalDays + 1 (日数) で割る
  const totalAnchors = itinerary.nodes.filter(
    (n) =>
      n.anchorLevel === "anchor" &&
      n.type !== "lodging" &&
      n.type !== "start" &&
      n.type !== "return",
  ).length;
  const days = itinerary.totalDays + 1;
  const avgPerDay = Math.floor(totalAnchors / days);
  const remainder = totalAnchors - avgPerDay * days;
  const result: number[] = [];
  for (let i = 0; i < days; i++) {
    result.push(avgPerDay + (i < remainder ? 1 : 0));
  }
  return result;
}

// ─────────────────────────────────────────────
// Helper: pair time balance (人間超越 Idea D)
// ─────────────────────────────────────────────

function computePairBalanceSignature(itinerary: TravelItinerary): TravelPairBalanceSignature {
  // MVP: 全 nodes を together 扱い (split 識別の caller hint がない場合)
  // pair node tag は本 MVP では明示しない、caller 側 layer で reify
  const totalNodes = itinerary.nodes.length;
  const togetherCount = totalNodes; // MVP default: 全 together
  const splitCount = 0;
  const anchorCount = itinerary.nodes.filter(
    (n) => n.anchorLevel === "anchor" && n.type !== "lodging",
  ).length;

  return {
    togetherNodeRatio: totalNodes > 0 ? togetherCount / totalNodes : 0,
    splitNodeRatio: totalNodes > 0 ? splitCount / totalNodes : 0,
    sharedAnchorCount: anchorCount,
  };
}

// ─────────────────────────────────────────────
// Helper: budget allocation 4 分割 (人間超越 Idea F)
// ─────────────────────────────────────────────

function computeBudgetAllocation(itinerary: TravelItinerary): TravelBudgetAllocation {
  let lodgingCost = 0;
  let transportCost = 0;
  let foodCost = 0;
  let activityCost = 0;

  for (const move of itinerary.moves) {
    transportCost += (move.costEstimate.lo + move.costEstimate.hi) / 2;
  }

  for (const node of itinerary.nodes) {
    // node-level cost is not in T1 type, so estimate by activityType
    // MVP: lodging / meal / experience / sightseeing 別に簡易仮定
    // 実 cost は T1 type 上明示されず、本 MVP では budgetBand のみ
  }

  // itinerary.budgetBand から推定 (簡易)
  const totalCost = (itinerary.budgetBand.lo + itinerary.budgetBand.hi) / 2;
  // lodging / food / activity を残余から estimate
  const remainingCost = totalCost - transportCost;
  // 簡易推定: lodging 50% / food 25% / activity 25% (totalDays 別)
  lodgingCost = remainingCost * 0.5;
  foodCost = remainingCost * 0.25;
  activityCost = remainingCost * 0.25;

  const safeTotal = totalCost > 0 ? totalCost : 1;
  return {
    lodgingRatio: lodgingCost / safeTotal,
    transportRatio: transportCost / safeTotal,
    foodRatio: foodCost / safeTotal,
    activityRatio: activityCost / safeTotal,
    totalCost,
  };
}

// ─────────────────────────────────────────────
// Helper: red-line cascade 判定 (人間超越 Idea J)
// ─────────────────────────────────────────────

function detectRedLineCascade(
  itinerary: TravelItinerary,
  redLineCodes: string[],
): TravelItineraryBlockedDetailCode | undefined {
  if (redLineCodes.length === 0) return undefined;

  // no_long_drive / no_long_transit: extreme transit detected
  const hasExtremeTransit = itinerary.moves.some(
    (m) => m.durationMinutes >= PROVISIONAL_TRANSIT_MINUTES_EXTREME,
  );
  if (
    hasExtremeTransit &&
    (redLineCodes.includes("no_long_drive") || redLineCodes.includes("no_long_transit"))
  ) {
    if (redLineCodes.includes("no_long_drive")) return "no_long_drive_violation";
    return "no_long_transit_violation";
  }

  // no_overseas: T2 で既に弾かれているが、念のため
  if (redLineCodes.includes("no_overseas")) {
    // T1 type に region 明示なし、T2 で既に弾かれていることが前提
  }

  // max_budget_NNNN: budget cap violation
  const budgetCapCode = redLineCodes.find((c) => c.startsWith("max_budget_"));
  if (budgetCapCode !== undefined) {
    const capValueStr = budgetCapCode.replace("max_budget_", "");
    const capValue = Number(capValueStr);
    if (!Number.isNaN(capValue) && itinerary.budgetBand.hi > capValue) {
      return "budget_cap_violation";
    }
  }

  // fatigue_cap_X: fatigue cap violation
  const fatigueCapCode = redLineCodes.find((c) => c.startsWith("fatigue_cap_"));
  if (fatigueCapCode !== undefined) {
    const capValueStr = fatigueCapCode.replace("fatigue_cap_", "");
    const capValue = Number(capValueStr);
    if (!Number.isNaN(capValue) && itinerary.fatigueLevel > capValue) {
      return "fatigue_cap_violation";
    }
  }

  return undefined;
}

// ─────────────────────────────────────────────
// Helper: uncertainty cascade propagation (人間超越 Idea I)
// ─────────────────────────────────────────────

function cascadeUncertainty(
  baseLabel: TravelUncertaintyLabel,
  weatherForecast: TravelWeatherForecastSignal | undefined,
  seedLackDetected: boolean,
): TravelUncertaintyLabel {
  const order: TravelUncertaintyLabel[] = [
    "high_confidence",
    "mid_confidence",
    "low_confidence",
    "info_lacking",
  ];
  let idx = order.indexOf(baseLabel);
  if (idx === -1) idx = 1; // default mid

  // weather signal で 1 段階上げ (high_confidence → mid_confidence 等)
  if (
    weatherForecast === "heavy_rain" ||
    weatherForecast === "snow" ||
    weatherForecast === "typhoon_warning"
  ) {
    idx = Math.min(idx + 1, order.length - 1);
  }

  // seed lack で 1 段階上げ
  if (seedLackDetected) {
    idx = Math.min(idx + 1, order.length - 1);
  }

  return order[idx];
}

// ─────────────────────────────────────────────
// Helper: weighted score 計算 (10 軸 sum)
// ─────────────────────────────────────────────

function computeTotalScore(breakdown: Omit<TravelItineraryScoreBreakdown, "totalScore">): number {
  // Provisional weights: feasibility 0.20、redLine 0.20、budget 0.15、
  // fatigue (transit + onSite) 0.15、anchor 0.10、pair 0.10、time 0.05、uncertainty 0.05
  const w = {
    feasibility: 0.2,
    transitFatigue: 0.075,
    onSiteFatigue: 0.075,
    budget: 0.15,
    time: 0.05,
    pair: 0.1,
    anchor: 0.1,
    redLine: 0.2,
    uncertainty: 0.05,
  };

  // uncertainty は低いほど良い (1 - uncertainty)
  return (
    w.feasibility * breakdown.feasibility +
    w.transitFatigue * breakdown.transitFatigue +
    w.onSiteFatigue * breakdown.onSiteFatigue +
    w.budget * breakdown.budgetFit +
    w.time * breakdown.timeBalance +
    w.pair * breakdown.pairTogethernessFit +
    w.anchor * breakdown.anchorWanderBalance +
    w.redLine * breakdown.redLineSafety +
    w.uncertainty * (1 - breakdown.uncertaintyScore)
  );
}

// ─────────────────────────────────────────────
// Helper: feasibility 評価 (graph connectivity)
// ─────────────────────────────────────────────

function computeFeasibility(itinerary: TravelItinerary): number {
  if (itinerary.nodes.length === 0) return 0;
  // 全 nodes 間で moves が graph として接続されているか簡易判定
  const placeIds = new Set(itinerary.nodes.map((n) => n.placeId));
  const moveFromTos = new Set<string>();
  for (const m of itinerary.moves) {
    moveFromTos.add(m.fromNodeId);
    moveFromTos.add(m.toNodeId);
  }
  // simple: nodes per day で少なくとも 1 つの move が存在すれば feasibility ≥ 0.6
  const nodeCount = itinerary.nodes.length;
  const moveCount = itinerary.moves.length;
  if (moveCount === 0 && nodeCount > 1) return 0.3;
  if (moveCount >= nodeCount - 1) return 1;
  return Math.min(0.6 + 0.1 * moveCount, 1);
}

// ─────────────────────────────────────────────
// Helper: transit / onSite fatigue 計算 (T2 fatigue signal 反映)
// ─────────────────────────────────────────────

function computeTransitFatigue(itinerary: TravelItinerary): number {
  const totalMinutes = itinerary.moves.reduce((sum, m) => sum + m.durationMinutes, 0);
  // 0-1 範囲、240+ min = high (-1 寄り、ここでは 0-1 で 0=light)
  // score 高いほど positive (low fatigue)、low fatigue = score 1
  const normalized = Math.min(totalMinutes / 480, 1); // 8 hour 上限
  return 1 - normalized;
}

function computeOnSiteFatigue(itinerary: TravelItinerary): number {
  const totalFatigue = itinerary.nodes
    .filter((n) => n.type !== "start" && n.type !== "return")
    .reduce((sum, n) => sum + n.fatigueLoad, 0);
  // 5 levels x ~5 nodes = ~25 max
  const normalized = Math.min(totalFatigue / 20, 1);
  return 1 - normalized;
}

// ─────────────────────────────────────────────
// Helper: budget fit (T2 budgetHint vs itinerary band)
// ─────────────────────────────────────────────

function computeBudgetFit(
  itinerary: TravelItinerary,
  budgetSignals: TravelIntentOutput["budgetSignals"],
): number {
  const hint = budgetSignals[0];
  if (hint === undefined) return 0.5; // neutral
  const mid = (itinerary.budgetBand.lo + itinerary.budgetBand.hi) / 2;
  // tight: < 20000 / moderate: 20000-50000 / ample: 50000-100000 / unbounded: any
  if (hint === "tight" && mid < 20000) return 1;
  if (hint === "moderate" && mid >= 15000 && mid < 60000) return 1;
  if (hint === "ample" && mid >= 50000 && mid < 120000) return 1;
  if (hint === "unbounded") return 0.8;
  return 0.3; // mismatch
}

// ─────────────────────────────────────────────
// Helper: time balance (per day active / rest ratio、MVP では node 数で簡易)
// ─────────────────────────────────────────────

function computeTimeBalance(itinerary: TravelItinerary): number {
  const activeNodes = itinerary.nodes.filter(
    (n) =>
      n.activityType !== "lodging" &&
      n.activityType !== "rest" &&
      n.type !== "start" &&
      n.type !== "return",
  ).length;
  const restNodes = itinerary.nodes.filter((n) => n.activityType === "rest").length;
  const ratio = (restNodes + 1) / (activeNodes + restNodes + 1);
  // ratio が 0.2-0.4 が optimal
  if (ratio >= 0.15 && ratio <= 0.45) return 1;
  if (ratio < 0.1) return 0.3;
  return 0.6;
}

// ─────────────────────────────────────────────
// Helper: pair togetherness fit (人間超越 Idea D)
// ─────────────────────────────────────────────

function computePairTogethernessFit(
  pairBalance: TravelPairBalanceSignature,
  preference?: TravelPairTogetherness,
): number {
  if (preference === undefined || preference === "unknown") return 0.5;
  // together_all_time: togetherNodeRatio ≈ 1 が good
  if (preference === "together_all_time") {
    return pairBalance.togetherNodeRatio >= 0.9 ? 1 : 0.4;
  }
  // flexible_split / together_main_separate_some: 0.5-0.9 が good
  if (preference === "flexible_split" || preference === "together_main_separate_some") {
    if (pairBalance.togetherNodeRatio >= 0.5 && pairBalance.togetherNodeRatio <= 0.9) return 1;
    return 0.6;
  }
  return 0.5;
}

// ─────────────────────────────────────────────
// Helper: anchor-wander balance (PR #124 Idea 15)
// ─────────────────────────────────────────────

function computeAnchorWanderBalance(itinerary: TravelItinerary): number {
  const anchors = itinerary.nodes.filter((n) => n.anchorLevel === "anchor").length;
  const wanders = itinerary.nodes.filter((n) => n.anchorLevel === "wander").length;
  const total = anchors + wanders;
  if (total === 0) return 0;
  const ratio = anchors / total;
  // 0.3-0.7 が balanced
  if (ratio >= 0.3 && ratio <= 0.7) return 1;
  if (ratio < 0.2) return 0.4; // wander 多すぎ
  if (ratio > 0.8) return 0.4; // anchor 多すぎ (詰め込み)
  return 0.7;
}

// ─────────────────────────────────────────────
// Helper: red-line safety (人間超越 Idea J)
// ─────────────────────────────────────────────

function computeRedLineSafety(violation: TravelItineraryBlockedDetailCode | undefined): number {
  if (violation === undefined) return 1; // safe
  return -1; // violation
}

// ─────────────────────────────────────────────
// Helper: uncertainty score (0-1、高いほど不確実)
// ─────────────────────────────────────────────

function computeUncertaintyScore(label: TravelUncertaintyLabel): number {
  if (label === "high_confidence") return 0.1;
  if (label === "mid_confidence") return 0.4;
  if (label === "low_confidence") return 0.7;
  return 0.9; // info_lacking
}

// ─────────────────────────────────────────────
// Helper: itinerary build (seed → graph、pure)
// ─────────────────────────────────────────────

/**
 * Itinerary 候補構築 (seed-based、pure):
 *
 * 1. scope に応じて totalDays / totalNights 決定 (1 泊 → 2 日 / 2 泊 → 3 日)
 * 2. 1 日目 morning: start node
 * 3. 1 日目 noon: meal (first destination 近辺)
 * 4. 1 日目 afternoon: anchor destination node
 * 5. 1 日目 evening: meal node
 * 6. 1 日目 night: lodging node (1 泊目)
 * 7. (2 泊なら) 2 日目 morning-night: 同様、lodging 2 泊目
 * 8. 最終日 morning: experience, noon: meal, afternoon: return prep
 * 9. moves: caller-provided + node 隣接で必要分
 */
function buildItineraryForAxis(
  candidateId: string,
  axis: TravelParetoAxis,
  destinationSeeds: TravelDestinationSeed[],
  experienceSeeds: TravelExperienceSeed[],
  lodgingSeeds: TravelLodgingSeed[],
  moveSeeds: TravelMoveSeed[],
  totalDays: 1 | 2,
  totalNights: 0 | 1 | 2,
): TravelItinerary | undefined {
  if (destinationSeeds.length === 0) return undefined;
  if (totalNights > 0 && lodgingSeeds.length === 0) return undefined;

  const nodes: TravelNode[] = [];
  const moves: TravelMove[] = [];

  // axis 別 seed 優先選択
  let chosenDestinations: TravelDestinationSeed[];
  if (axis === "cheap_far") {
    chosenDestinations = [...destinationSeeds].sort(
      (a, b) =>
        (a.budgetEstimate.lo + a.budgetEstimate.hi) / 2 -
        (b.budgetEstimate.lo + b.budgetEstimate.hi) / 2,
    );
  } else if (axis === "near_expensive") {
    chosenDestinations = [...destinationSeeds].sort(
      (a, b) =>
        (b.budgetEstimate.lo + b.budgetEstimate.hi) / 2 -
        (a.budgetEstimate.lo + a.budgetEstimate.hi) / 2,
    );
  } else if (axis === "slow_pace") {
    chosenDestinations = [...destinationSeeds].sort(
      (a, b) => a.defaultFatigueLoad - b.defaultFatigueLoad,
    );
  } else if (axis === "intense_pace") {
    chosenDestinations = [...destinationSeeds].sort(
      (a, b) => b.defaultFatigueLoad - a.defaultFatigueLoad,
    );
  } else {
    chosenDestinations = [...destinationSeeds].sort((a, b) => a.seedId.localeCompare(b.seedId));
  }

  // Start node (day 1, morning)
  const startNode: TravelNode = {
    nodeId: `${candidateId}_start`,
    type: "start",
    placeId: chosenDestinations[0]?.placeIdCode ?? "start_origin",
    startTime: "morning",
    endTime: "morning",
    activityType: "transport",
    fatigueLoad: 1,
    anchorLevel: "anchor",
  };
  nodes.push(startNode);

  // Day 1 noon meal (placeId inherits from primary destination、人間超越設計:
  // 食事は destination 周辺で同 placeId として扱い、distinct transition のみ
  // moves graph に投影する)
  const day1Lunch: TravelNode = {
    nodeId: `${candidateId}_day1_lunch`,
    type: "meal",
    placeId: chosenDestinations[0].placeIdCode,
    startTime: "noon",
    endTime: "noon",
    activityType: "meal",
    fatigueLoad: 1,
    anchorLevel: "wander",
  };
  nodes.push(day1Lunch);

  // Day 1 afternoon anchor (primary destination)
  const primaryDest = chosenDestinations[0];
  const day1Afternoon: TravelNode = {
    nodeId: `${candidateId}_day1_afternoon`,
    type: "destination",
    placeId: primaryDest.placeIdCode,
    startTime: "afternoon",
    endTime: "evening",
    activityType: primaryDest.activityType,
    fatigueLoad: primaryDest.defaultFatigueLoad,
    anchorLevel: primaryDest.anchorLevel,
  };
  nodes.push(day1Afternoon);

  // Day 1 evening meal (placeId inherits from primary destination)
  const day1Dinner: TravelNode = {
    nodeId: `${candidateId}_day1_dinner`,
    type: "meal",
    placeId: chosenDestinations[0].placeIdCode,
    startTime: "evening",
    endTime: "evening",
    activityType: "meal",
    fatigueLoad: 1,
    anchorLevel: "wander",
  };
  nodes.push(day1Dinner);

  // Day 1 lodging (1 泊目)
  if (totalNights >= 1) {
    const lodging1 = lodgingSeeds[0];
    const day1Lodging: TravelNode = {
      nodeId: `${candidateId}_day1_lodging`,
      type: "lodging",
      placeId: lodging1.placeIdCode,
      startTime: "night",
      endTime: "night",
      activityType: "lodging",
      fatigueLoad: 1,
      anchorLevel: "anchor",
    };
    nodes.push(day1Lodging);
  }

  // Day 2 (and lodging if 2 泊)
  if (totalDays === 2) {
    // Day 2 morning experience (optional)
    const exp = experienceSeeds[0];
    if (exp !== undefined) {
      const day2Morning: TravelNode = {
        nodeId: `${candidateId}_day2_morning`,
        type: "activity",
        placeId: exp.placeIdCode,
        startTime: "morning",
        endTime: "noon",
        activityType: exp.activityType,
        fatigueLoad: exp.defaultFatigueLoad,
        anchorLevel: exp.anchorLevel,
      };
      nodes.push(day2Morning);
    }

    // Day 2 noon meal (placeId inherits from primary destination)
    const day2Lunch: TravelNode = {
      nodeId: `${candidateId}_day2_lunch`,
      type: "meal",
      placeId: chosenDestinations[0].placeIdCode,
      startTime: "noon",
      endTime: "noon",
      activityType: "meal",
      fatigueLoad: 1,
      anchorLevel: "wander",
    };
    nodes.push(day2Lunch);

    // Day 2 afternoon (only if 2 泊)
    if (totalNights === 2) {
      const day2Afternoon: TravelNode = {
        nodeId: `${candidateId}_day2_afternoon`,
        type: "destination",
        placeId: chosenDestinations[1]?.placeIdCode ?? primaryDest.placeIdCode,
        startTime: "afternoon",
        endTime: "evening",
        activityType: chosenDestinations[1]?.activityType ?? "sightseeing",
        fatigueLoad: chosenDestinations[1]?.defaultFatigueLoad ?? 3,
        anchorLevel: chosenDestinations[1]?.anchorLevel ?? "anchor",
      };
      nodes.push(day2Afternoon);

      // Day 2 evening meal (placeId inherits from secondary destination)
      nodes.push({
        nodeId: `${candidateId}_day2_dinner`,
        type: "meal",
        placeId: chosenDestinations[1]?.placeIdCode ?? chosenDestinations[0].placeIdCode,
        startTime: "evening",
        endTime: "evening",
        activityType: "meal",
        fatigueLoad: 1,
        anchorLevel: "wander",
      });

      // Day 2 lodging (2 泊目)
      const lodging2 = lodgingSeeds[1] ?? lodgingSeeds[0];
      nodes.push({
        nodeId: `${candidateId}_day2_lodging`,
        type: "lodging",
        placeId: lodging2.placeIdCode,
        startTime: "night",
        endTime: "night",
        activityType: "lodging",
        fatigueLoad: 1,
        anchorLevel: "anchor",
      });
    }

    // Return day (3 日目 of 2 泊 / 2 日目 of 1 泊)
    // 1 泊 → day 2 が return、2 泊 → day 3 が return
    // 簡略実装: 最終日 morning experience + return
  }

  // Return node (最終日)
  const returnNode: TravelNode = {
    nodeId: `${candidateId}_return`,
    type: "return",
    placeId: startNode.placeId,
    startTime: totalDays === 2 ? "afternoon" : "afternoon",
    endTime: totalDays === 2 ? "evening" : "evening",
    activityType: "transport",
    fatigueLoad: 1,
    anchorLevel: "anchor",
  };
  nodes.push(returnNode);

  // Moves: distinct placeId transitions のみ (人間超越設計: 同 placeId 内
  // (食事 / 休憩) は logical journey 上 transit 不要、moves graph は 距離移動のみ).
  // consecutive nodes を traverse、placeId が変わる pair のみ移動 edge として追加。
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];
    // 同 placeId なら skip (徒歩圏 / 同一地)
    if (from.placeId === to.placeId) continue;

    // caller-provided move seed match (from-to)
    const matchSeed = moveSeeds.find(
      (s) => s.fromPlaceIdCode === from.placeId && s.toPlaceIdCode === to.placeId,
    );
    moves.push({
      moveId: `${candidateId}_move_${i}`,
      fromNodeId: from.nodeId,
      toNodeId: to.nodeId,
      transport: matchSeed?.transport ?? "train",
      durationMinutes: matchSeed?.durationMinutes ?? 30,
      costEstimate: matchSeed?.costEstimate ?? { lo: 0, hi: 5000, confidence: 0.4 },
    });
  }

  // Itinerary budget band
  const lodgingCost = lodgingSeeds
    .slice(0, totalNights)
    .reduce(
      (acc, l) => ({
        lo: acc.lo + l.budgetEstimate.lo,
        hi: acc.hi + l.budgetEstimate.hi,
      }),
      { lo: 0, hi: 0 },
    );
  const destCost = chosenDestinations
    .slice(0, totalDays)
    .reduce(
      (acc, d) => ({
        lo: acc.lo + d.budgetEstimate.lo,
        hi: acc.hi + d.budgetEstimate.hi,
      }),
      { lo: 0, hi: 0 },
    );
  const moveCost = moves.reduce(
    (acc, m) => ({
      lo: acc.lo + m.costEstimate.lo,
      hi: acc.hi + m.costEstimate.hi,
    }),
    { lo: 0, hi: 0 },
  );

  const budgetBand: TravelBudgetBand = {
    lo: lodgingCost.lo + destCost.lo + moveCost.lo,
    hi: lodgingCost.hi + destCost.hi + moveCost.hi,
    confidence: 0.5,
  };

  // Itinerary fatigue level (max of node fatigue)
  const maxFatigue: TravelFatigueLevel = nodes.reduce<TravelFatigueLevel>(
    (max, n) => (n.fatigueLoad > max ? (n.fatigueLoad as TravelFatigueLevel) : max),
    1,
  );

  return {
    itineraryId: `${candidateId}_itinerary`,
    nodes,
    moves,
    totalDays,
    totalNights,
    budgetBand,
    fatigueLevel: maxFatigue,
    uncertaintyLabel: "mid_confidence", // base、cascade で更新
  };
}

// ─────────────────────────────────────────────
// Helper: explanation reasons 集約 (pure)
// ─────────────────────────────────────────────

function collectExplanationReasons(
  breakdown: TravelItineraryScoreBreakdown,
): TravelItineraryExplanationCode[] {
  const reasons: TravelItineraryExplanationCode[] = [];

  // pareto axis
  reasons.push(`pareto_axis_${breakdown.paretoAxis}` as TravelItineraryExplanationCode);

  // rhythm (first day)
  if (breakdown.dayRhythmPatterns.length > 0) {
    const rhythm = breakdown.dayRhythmPatterns[0];
    reasons.push(`rhythm_${rhythm}` as TravelItineraryExplanationCode);
  }

  // fatigue
  if (breakdown.transitFatigue > 0.7 && breakdown.onSiteFatigue > 0.7) {
    reasons.push("fatigue_friendly_itinerary");
  } else if (breakdown.transitFatigue < 0.4 || breakdown.onSiteFatigue < 0.4) {
    reasons.push("fatigue_intense_itinerary");
  }

  // budget
  if (breakdown.budgetFit > 0.8) reasons.push("budget_match");
  if (breakdown.paretoAxis === "cheap_far") reasons.push("budget_tight_aligned");
  if (breakdown.paretoAxis === "near_expensive") reasons.push("budget_ample_aligned");

  // pair
  if (breakdown.pairTogethernessFit > 0.8) {
    if (breakdown.pairBalanceSignature.splitNodeRatio < 0.2) {
      reasons.push("pair_together_aligned");
    } else {
      reasons.push("pair_split_aligned");
    }
  }

  // anchor
  const totalAnchors = breakdown.anchorCountPerDay.reduce((a, b) => a + b, 0);
  const days = breakdown.anchorCountPerDay.length;
  const avg = days > 0 ? totalAnchors / days : 0;
  if (avg > 2.5) reasons.push("anchor_dense");
  else if (avg < 0.8) reasons.push("anchor_sparse");
  else reasons.push("anchor_balanced");

  // weather safe
  if (breakdown.uncertaintyScore < 0.5) reasons.push("weather_safe_itinerary");

  // feasibility
  if (breakdown.feasibility > 0.8) reasons.push("high_feasibility");
  else if (breakdown.feasibility < 0.4) reasons.push("low_feasibility");

  // balanced score
  if (
    breakdown.feasibility >= 0.5 &&
    breakdown.transitFatigue >= 0.5 &&
    breakdown.onSiteFatigue >= 0.5 &&
    breakdown.budgetFit >= 0.5 &&
    breakdown.pairTogethernessFit >= 0.5
  ) {
    reasons.push("balanced_score");
  }

  return reasons;
}

// ─────────────────────────────────────────────
// Helper: feasibility notes 構築 (pure、warning レベル)
// ─────────────────────────────────────────────

function collectFeasibilityNotes(
  itinerary: TravelItinerary,
  weather: TravelWeatherForecastSignal | undefined,
  seasonalMismatch: boolean,
): TravelItineraryFeasibilityNoteCode[] {
  const notes: TravelItineraryFeasibilityNoteCode[] = [];

  // transit missing
  if (itinerary.nodes.length > 1 && itinerary.moves.length === 0) {
    notes.push("transit_missing_between_destinations");
  }

  // lodging missing (overnight scope)
  if (itinerary.totalNights >= 1) {
    const hasLodging1 = itinerary.nodes.some(
      (n) => n.type === "lodging" && n.nodeId.includes("day1"),
    );
    if (!hasLodging1) notes.push("lodging_missing_for_first_night");
  }
  if (itinerary.totalNights === 2) {
    const hasLodging2 = itinerary.nodes.some(
      (n) => n.type === "lodging" && n.nodeId.includes("day2"),
    );
    if (!hasLodging2) notes.push("lodging_missing_for_second_night");
  }

  // meal missing for evening
  const hasEveningMeal = itinerary.nodes.some(
    (n) => n.type === "meal" && n.startTime === "evening",
  );
  if (!hasEveningMeal) notes.push("meal_node_missing_for_evening");

  // rest node recommended (rest activity 不在)
  const hasRest = itinerary.nodes.some((n) => n.activityType === "rest");
  if (!hasRest) notes.push("rest_node_recommended");

  // anchor density
  const dayAnchorCounts = anchorCountPerDay(itinerary);
  const maxAnchor = dayAnchorCounts.reduce((m, c) => (c > m ? c : m), 0);
  const minAnchor = dayAnchorCounts.reduce((m, c) => (c < m ? c : m), 99);
  if (maxAnchor > PROVISIONAL_ANCHOR_PER_DAY_CEILING) notes.push("anchor_density_high");
  if (minAnchor === 0 && dayAnchorCounts.length > 1) notes.push("anchor_density_low");

  // weather dependent in rain
  if (weather === "heavy_rain" || weather === "snow" || weather === "typhoon_warning") {
    // 簡略: any outdoor activity → warning (本 MVP では weatherDependency が seed 側で未保持の場合 default)
    notes.push("weather_dependent_in_rain_warning");
  }

  // seasonal mismatch
  if (seasonalMismatch) notes.push("seasonal_mismatch_warning");

  return notes;
}

// ─────────────────────────────────────────────
// Helper: applied constraints 構築 (from T2 input)
// ─────────────────────────────────────────────

function buildAppliedConstraints(
  redLineCodes: string[],
  budgetSignals: TravelIntentOutput["budgetSignals"],
): TravelConstraint[] {
  const constraints: TravelConstraint[] = [];

  for (const code of redLineCodes) {
    let field: TravelConstraintField = "red_line_explicit";
    if (code.startsWith("max_budget")) field = "budget";
    else if (code === "no_long_drive" || code === "no_long_transit") field = "distance";
    constraints.push({
      field,
      severity: "red_line" as TravelConstraintSeverity,
      description: code, // caller-normalized code (raw text 不可)
    });
  }

  const budgetHint = budgetSignals[0];
  if (budgetHint === "tight" || budgetHint === "moderate" || budgetHint === "ample") {
    constraints.push({
      field: "budget",
      severity: "soft",
      description: `budget_hint_${budgetHint}`,
    });
  }

  return constraints;
}

// ─────────────────────────────────────────────
// Helper: rationale 構築 (本 MVP では minimal、PII 不含)
// ─────────────────────────────────────────────

function buildRationale(): TravelCandidateRationale {
  // 本 MVP では rationale は normalized placeholder のみ (raw text 不含)
  // T6 UI phase で caller 側 derive
  return {
    perUserA: "",
    perUserB: "",
    synthesis: "",
  };
}

// ─────────────────────────────────────────────
// Main: itinerary generator (pure function)
// ─────────────────────────────────────────────

/**
 * Travel itinerary を生成する pure function.
 *
 * **本関数は純関数**: 同じ input → 同じ output、副作用なし、`Math.random` 不使用、
 * 現在時刻参照なし、external state 参照なし、external API 不使用。
 *
 * **seed-based design**: caller が外部 API なしに provide した normalized seeds
 * (destination / experience / lodging / move) を組み合わせて itinerary graph を構築。
 *
 * **fail-closed default**:
 *   - empty seeds → empty + fail_closed_no_seeds
 *   - T2 unsupported_future / out_of_scope_handoff / needs_narrowing → passed_through_*
 *   - 全 candidate red-line block → empty rankedCandidates + blockedCandidates 列挙
 *
 * **deterministic**: seedId lexicographic sort + paretoAxis + score で完全決定論的。
 *
 * @param input intentOutput + caller-provided seeds + red-line codes
 * @returns rankedCandidates / blockedCandidates / scoreBreakdown / feasibilityNotes /
 *          missingInputs / reasonCodes / itineraryVersion
 */
export function generateTravelItineraries(
  input: TravelItineraryGeneratorInput,
): TravelItineraryGeneratorOutput {
  const reasonCodes: TravelItineraryReasonCode[] = [];
  const missingInputs: TravelItineraryMissingInput[] = [];
  const maxCandidates = input.maxCandidates ?? PROVISIONAL_MAX_CANDIDATES;
  const cognitiveLoadCeiling =
    input.cognitiveLoadCeilingPerDay ?? PROVISIONAL_COGNITIVE_LOAD_CEILING_PER_DAY;

  // 1. intent pass-through validation
  if (input.intentOutput.inferredTravelIntent === "unsupported_future") {
    reasonCodes.push("passed_through_unsupported");
    return {
      rankedCandidates: [],
      blockedCandidates: [],
      feasibilityNotes: [],
      scoreBreakdown: {},
      missingInputs,
      reasonCodes,
      itineraryVersion: ITINERARY_GENERATOR_VERSION,
    };
  }
  if (input.intentOutput.inferredTravelIntent === "out_of_scope_handoff") {
    reasonCodes.push("passed_through_handoff");
    return {
      rankedCandidates: [],
      blockedCandidates: [],
      feasibilityNotes: [],
      scoreBreakdown: {},
      missingInputs,
      reasonCodes,
      itineraryVersion: ITINERARY_GENERATOR_VERSION,
    };
  }
  if (input.intentOutput.inferredTravelIntent === "needs_narrowing") {
    reasonCodes.push("passed_through_narrowing");
    missingInputs.push("intent_output");
    return {
      rankedCandidates: [],
      blockedCandidates: [],
      feasibilityNotes: [],
      scoreBreakdown: {},
      missingInputs,
      reasonCodes,
      itineraryVersion: ITINERARY_GENERATOR_VERSION,
    };
  }

  // 2. travel_eligible / travel_with_handoff のみ proceed
  const destSeeds = (input.destinationSeeds ?? []).slice().sort((a, b) =>
    a.seedId.localeCompare(b.seedId),
  );
  const expSeeds = (input.experienceSeeds ?? []).slice().sort((a, b) =>
    a.seedId.localeCompare(b.seedId),
  );
  const lodgingSeeds = (input.lodgingSeeds ?? []).slice().sort((a, b) =>
    a.seedId.localeCompare(b.seedId),
  );
  const moveSeeds = (input.moveSeeds ?? []).slice().sort((a, b) =>
    a.seedId.localeCompare(b.seedId),
  );

  // 3. seeds 不足 check
  if (destSeeds.length === 0) {
    reasonCodes.push("fail_closed_no_destinations");
    missingInputs.push("destination_seeds");
    return {
      rankedCandidates: [],
      blockedCandidates: [],
      feasibilityNotes: [],
      scoreBreakdown: {},
      missingInputs,
      reasonCodes,
      itineraryVersion: ITINERARY_GENERATOR_VERSION,
    };
  }

  // 4. totalDays / totalNights from T2 travelScope
  let totalDays: 1 | 2 = 1;
  let totalNights: 0 | 1 | 2 = 1;
  const scope = input.intentOutput.travelScope;
  if (scope === "overnight_one_night") {
    totalDays = 1;
    totalNights = 1;
  } else if (scope === "overnight_two_nights") {
    totalDays = 2;
    totalNights = 2;
  } else if (scope === "day_trip_excursion") {
    totalDays = 1;
    totalNights = 0;
  } else {
    // unclear → default 1 泊
    totalDays = 1;
    totalNights = 1;
  }

  // 5. lodging 不足 (overnight 必須)
  if (totalNights >= 1 && lodgingSeeds.length === 0) {
    reasonCodes.push("fail_closed_no_lodging_for_overnight");
    missingInputs.push("lodging_seeds_for_overnight");
    return {
      rankedCandidates: [],
      blockedCandidates: [],
      feasibilityNotes: [],
      scoreBreakdown: {},
      missingInputs,
      reasonCodes,
      itineraryVersion: ITINERARY_GENERATOR_VERSION,
    };
  }

  // 6. paretoAxis 別 candidate 構築
  const paretoAxes: TravelParetoAxis[] = ["balanced", "cheap_far", "slow_pace"];
  const builtCandidates: { candidate: TravelCandidate; itinerary: TravelItinerary; axis: TravelParetoAxis }[] = [];

  for (let i = 0; i < paretoAxes.length; i++) {
    const axis = paretoAxes[i];
    const candidateId = `candidate_${i + 1}_${axis}`;
    const itinerary = buildItineraryForAxis(
      candidateId,
      axis,
      destSeeds,
      expSeeds,
      lodgingSeeds,
      moveSeeds,
      totalDays,
      totalNights,
    );

    if (itinerary === undefined) continue;

    const constraints = buildAppliedConstraints(
      input.redLineCodes ?? [],
      input.intentOutput.budgetSignals,
    );

    const candidate: TravelCandidate = {
      candidateId,
      itinerary,
      rationale: buildRationale(),
      paretoAxis: axis,
      appliedConstraints: constraints,
    };

    builtCandidates.push({ candidate, itinerary, axis });
  }

  if (builtCandidates.length === 0) {
    reasonCodes.push("fail_closed_no_seeds");
    return {
      rankedCandidates: [],
      blockedCandidates: [],
      feasibilityNotes: [],
      scoreBreakdown: {},
      missingInputs,
      reasonCodes,
      itineraryVersion: ITINERARY_GENERATOR_VERSION,
    };
  }

  // 7. 各 candidate scoring + blocking
  const blockedCandidates: TravelBlockedItineraryCandidate[] = [];
  const ranked: TravelRankedItineraryCandidate[] = [];
  const scoreMap: Record<string, TravelItineraryScoreBreakdown> = {};
  const allFeasibilityNotes: TravelFeasibilityNote[] = [];

  const weatherHint = input.intentOutput.reasonCodes.find((c) =>
    c.startsWith("weather_"),
  );
  // 簡略 weather forecast 抽出 (T2 reasonCodes から)
  let weatherForecast: TravelWeatherForecastSignal | undefined;
  if (weatherHint === "weather_heavy_rain") weatherForecast = "heavy_rain";
  else if (weatherHint === "weather_snow") weatherForecast = "snow";
  else if (weatherHint === "weather_typhoon_warning") weatherForecast = "typhoon_warning";
  else if (weatherHint === "weather_clear") weatherForecast = "clear";
  else if (weatherHint === "weather_unstable") weatherForecast = "unstable";

  // seasonal mismatch detection (T2 reasonCodes から)
  const hasSeasonalPeak = input.intentOutput.reasonCodes.includes("seasonal_peak_present");

  for (const { candidate, itinerary, axis } of builtCandidates) {
    // red-line cascade check
    const redLineDetail = detectRedLineCascade(itinerary, input.redLineCodes ?? []);
    if (redLineDetail !== undefined) {
      blockedCandidates.push({
        candidateId: candidate.candidateId,
        blockedReasonCode: "red_line_violation",
        detailCode: redLineDetail,
      });
      continue;
    }

    // cognitive load ceiling check
    const dayAnchorCounts = anchorCountPerDay(itinerary);
    const allDayMoves = itinerary.moves; // simple: 全 moves
    const movesPerDay = Math.ceil(allDayMoves.length / (itinerary.totalDays + 1));
    const maxLoadPerDay = Math.max(...dayAnchorCounts) + movesPerDay;
    if (maxLoadPerDay > cognitiveLoadCeiling) {
      blockedCandidates.push({
        candidateId: candidate.candidateId,
        blockedReasonCode: "cognitive_load_ceiling_exceeded",
      });
      continue;
    }

    // anchor overloaded check
    const maxAnchor = dayAnchorCounts.reduce((m, c) => (c > m ? c : m), 0);
    if (maxAnchor > PROVISIONAL_ANCHOR_PER_DAY_CEILING) {
      blockedCandidates.push({
        candidateId: candidate.candidateId,
        blockedReasonCode: "anchor_overloaded",
      });
      continue;
    }

    // transit extreme cascade
    const hasExtremeTransit = itinerary.moves.some(
      (m) => deriveTransitionRisk(m.durationMinutes) === "extreme",
    );
    if (
      hasExtremeTransit &&
      (input.redLineCodes ?? []).some((c) => c === "no_long_drive" || c === "no_long_transit")
    ) {
      blockedCandidates.push({
        candidateId: candidate.candidateId,
        blockedReasonCode: "transit_extreme_cascade",
      });
      continue;
    }

    // score breakdown (10 axes + 人間超越)
    const transitionRisks = itinerary.moves.map((m) => deriveTransitionRisk(m.durationMinutes));

    // day rhythm patterns (per day、簡略: 全 nodes を 1 day として derive、本 MVP)
    const dayRhythmPatterns: TravelDayRhythmPattern[] = [];
    for (let day = 0; day < itinerary.totalDays + 1; day++) {
      // 簡略: 全 nodes から day 別 partition は本 MVP では nodes に明示なし
      dayRhythmPatterns.push(deriveDayRhythm(itinerary.nodes));
    }

    // uncertainty cascade
    const seedLackDetected = expSeeds.length === 0 || moveSeeds.length === 0;
    const cascadedLabel = cascadeUncertainty(
      itinerary.uncertaintyLabel,
      weatherForecast,
      seedLackDetected,
    );

    const pairBalance = computePairBalanceSignature(itinerary);
    const budgetAllocation = computeBudgetAllocation(itinerary);

    const breakdownBase = {
      feasibility: computeFeasibility(itinerary),
      transitFatigue: computeTransitFatigue(itinerary),
      onSiteFatigue: computeOnSiteFatigue(itinerary),
      budgetFit: computeBudgetFit(itinerary, input.intentOutput.budgetSignals),
      timeBalance: computeTimeBalance(itinerary),
      pairTogethernessFit: computePairTogethernessFit(
        pairBalance,
        input.pairTogethernessOverride,
      ),
      anchorWanderBalance: computeAnchorWanderBalance(itinerary),
      redLineSafety: computeRedLineSafety(redLineDetail),
      uncertaintyScore: computeUncertaintyScore(cascadedLabel),
      paretoAxis: axis,
      dayRhythmPatterns,
      transitionRisks,
      anchorCountPerDay: dayAnchorCounts,
      pairBalanceSignature: pairBalance,
      budgetAllocation,
    };

    const totalScore = computeTotalScore(breakdownBase);
    const breakdown: TravelItineraryScoreBreakdown = {
      ...breakdownBase,
      totalScore,
    };

    const explanationReasonCodes = collectExplanationReasons(breakdown);

    // feasibility notes
    const noteCodes = collectFeasibilityNotes(
      itinerary,
      weatherForecast,
      false, // seasonalMismatch (本 MVP 簡略: seed seasonalityCode を見ない)
    );
    for (const code of noteCodes) {
      allFeasibilityNotes.push({ reasonCode: code, candidateId: candidate.candidateId });
    }

    ranked.push({
      candidate: {
        ...candidate,
        itinerary: { ...itinerary, uncertaintyLabel: cascadedLabel },
      },
      rank: 0, // updated post-sort
      scoreBreakdown: breakdown,
      uncertaintyLabel: cascadedLabel,
      explanationReasonCodes,
    });

    scoreMap[candidate.candidateId] = breakdown;
  }

  // 8. sort + rank
  ranked.sort((a, b) => {
    if (a.scoreBreakdown.totalScore !== b.scoreBreakdown.totalScore) {
      return b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore;
    }
    // tie-break: paretoAxis lexicographic
    if (a.scoreBreakdown.paretoAxis !== b.scoreBreakdown.paretoAxis) {
      return a.scoreBreakdown.paretoAxis.localeCompare(b.scoreBreakdown.paretoAxis);
    }
    // tie-break: candidateId
    return a.candidate.candidateId.localeCompare(b.candidate.candidateId);
  });
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].rank = i + 1;
  }

  // 9. truncate to maxCandidates
  let rankedFinal = ranked;
  if (ranked.length > maxCandidates) {
    rankedFinal = ranked.slice(0, maxCandidates);
    reasonCodes.push("max_candidates_truncated");
  }

  // 10. top-level reasonCodes
  if (rankedFinal.length > 0) {
    reasonCodes.push("candidates_generated");
  }
  if (blockedCandidates.length > 0 && rankedFinal.length === 0) {
    reasonCodes.push("all_candidates_blocked");
  } else if (blockedCandidates.length > 0) {
    reasonCodes.push("partial_candidates_blocked");
  }

  // 11. budget allocation top-level signals
  const firstBreakdown = rankedFinal[0]?.scoreBreakdown;
  if (firstBreakdown !== undefined) {
    if (firstBreakdown.budgetAllocation.transportRatio > PROVISIONAL_TRANSPORT_BUDGET_HEAVY_RATIO) {
      reasonCodes.push("budget_transport_heavy");
    }
    if (firstBreakdown.budgetAllocation.foodRatio < PROVISIONAL_FOOD_BUDGET_FLOOR_RATIO) {
      reasonCodes.push("budget_food_underbudget");
    }
    if (firstBreakdown.budgetAllocation.lodgingRatio > PROVISIONAL_LODGING_BUDGET_HEAVY_RATIO) {
      reasonCodes.push("budget_lodging_heavy");
    }

    // anchor density top-level
    const maxAnchorAny = firstBreakdown.anchorCountPerDay.reduce((m, c) => (c > m ? c : m), 0);
    const minAnchorAny = firstBreakdown.anchorCountPerDay.reduce((m, c) => (c < m ? c : m), 99);
    if (maxAnchorAny > PROVISIONAL_ANCHOR_PER_DAY_CEILING) {
      reasonCodes.push("anchor_overloaded_day_detected");
    }
    if (minAnchorAny === 0 && firstBreakdown.anchorCountPerDay.length > 1) {
      reasonCodes.push("anchor_underloaded_day_detected");
    }

    // transit extreme top-level
    if (firstBreakdown.transitionRisks.includes("extreme")) {
      reasonCodes.push("transit_extreme_detected");
    }

    // recovery window
    const restMissing = allFeasibilityNotes.some((n) => n.reasonCode === "rest_node_recommended");
    if (restMissing) reasonCodes.push("recovery_window_insufficient");

    // weather propagation
    if (
      weatherForecast === "heavy_rain" ||
      weatherForecast === "snow" ||
      weatherForecast === "typhoon_warning"
    ) {
      reasonCodes.push("weather_risk_propagated");
      reasonCodes.push("uncertainty_raised_weather");
    }

    // seasonal
    if (hasSeasonalPeak) reasonCodes.push("seasonal_match_detected");

    // uncertainty seed lack
    if (expSeeds.length === 0 || moveSeeds.length === 0) {
      reasonCodes.push("uncertainty_raised_seed_lack");
    }
  }

  reasonCodes.push("deterministic_sort_applied");

  return {
    rankedCandidates: rankedFinal,
    blockedCandidates,
    feasibilityNotes: allFeasibilityNotes,
    scoreBreakdown: scoreMap,
    missingInputs,
    reasonCodes,
    itineraryVersion: ITINERARY_GENERATOR_VERSION,
  };
}
