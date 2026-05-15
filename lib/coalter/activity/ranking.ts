/**
 * CoAlter Activity Domain — Multi-Axis Ranking (AD4 phase)
 *
 * 正本:
 *   - docs/coalter-activity-domain-mapping.md (PR #126、design completion)
 *   - docs/coalter-master-design.md v1.2 §13.4 (Activity reflection)
 *   - lib/coalter/activity/types.ts (Batch-C PR #131、AD1)
 *   - lib/coalter/activity/intent.ts (PR #132、AD2)
 *   - lib/coalter/activity/candidates.ts (PR #133、AD3)
 *
 * 役割:
 *   AD3 candidate generator + scorer 出力を入力に、**Pareto-style multi-axis ranking**
 *   で 2-3 案提示の最適化 + fairness ledger / anti-repetition / cognitive load ceiling
 *   統合を行う pure function。runtime-capable library 追加のみ、call-site wiring 0、
 *   production behavior 0 変化 (CEO 2026-05-15 表現精度継承)。
 *
 * **AD3 との差別化**:
 *   - AD3: 6 dimensions weighted sum で single totalScore sort
 *   - AD4: Pareto front rank + 5 axis 追加 (pairFairness / noveltyComfortBalance /
 *     cognitiveLoadFit / antiRepetition / redLineSafety) + tie-break deterministic
 *
 * 構造的安全設計 (Gap 4 D2 + AD2/AD3 + DD2/DD3 継承):
 *   1. raw text leakage 構造的防止:
 *      - input は AD3 output (ActivityScoredCandidate[]) + normalized state のみ
 *      - output reasonCodes / explanationReasonCodes / blockedReasonCodes / fairnessReasonCodes は **enum only**
 *      - history activityName は caller normalized (PII 不含)
 *   2. provisional values (CEO 補正反映):
 *      - PROVISIONAL_MAX_RANKED_COUNT = 3 (MVP 2-3 案)
 *      - PROVISIONAL_COGNITIVE_LOAD_CEILING = 3 (high まで OK 想定)
 *      - PROVISIONAL_FAIRNESS_BALANCE_BAND = 0.2 (|bias| < 0.2 → balanced)
 *      - 各 axis weights は PROVISIONAL (calibration AD5/AD6 phase)
 *   3. fail-closed default:
 *      - empty candidates → empty rankedCandidates + fail_closed
 *   4. red-line hard block:
 *      - redLineSafety = -1 (red_line_safety violation) → Pareto 除外、blocked list
 *   5. cognitive load ceiling:
 *      - currentLoad + candidateLoad > ceiling → cognitive_load_ceiling_exceeded blocked
 *   6. deterministic:
 *      - 純関数、Math.random 不使用、Pareto front + tie-break で完全決定論的
 *
 * 後続 phase (本 PR scope 外):
 *   - AD5: UI presentation (別 PR、Product Unit 連携)
 *   - AD6: production observation + mode enum rollout (別 PR、CEO 戦略判断)
 *
 * 本 PR の不可触 (CEO 2026-05-15 制約):
 *   - runtime call-site wiring / orchestrator 接続
 *   - ChatClient / UpperLayerMount / route / API / env / flags / migration
 *   - lib/coalter/activity/types.ts 既存 type touch (新 type は本 file local 定義)
 *   - Travel T2 / Daily DD4 / Gap 4 D3 実装
 */

import type {
  ActivityFatigueLevel,
  ActivityHandoffTarget,
  ActivityTaxonomy,
  ActivityUncertaintyLabel,
} from "./types";
import type {
  ActivityCandidateGeneratorOutput,
  ActivityScoredCandidate,
} from "./candidates";

// ─────────────────────────────────────────────
// ranking version (calibration 用)
// ─────────────────────────────────────────────

export const RANKING_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// provisional values (確定値ではない)
// ─────────────────────────────────────────────

/**
 * Provisional max ranked count (MVP 2-3 案).
 */
export const PROVISIONAL_MAX_RANKED_COUNT = 3;

/**
 * Provisional cognitive load ceiling (high まで OK 想定).
 */
export const PROVISIONAL_COGNITIVE_LOAD_CEILING = 3;

/**
 * Provisional fairness balance band (|bias| < 0.2 → balanced).
 */
export const PROVISIONAL_FAIRNESS_BALANCE_BAND = 0.2;

// ─────────────────────────────────────────────
// AD4 specific normalized signals (本 file local)
// ─────────────────────────────────────────────

/**
 * Cognitive load level (Daily session 累積).
 */
export type CognitiveLoadLevel = 1 | 2 | 3;

/**
 * Activity weather code (AD2 / AD3 同 value space、本 file local 再宣言).
 */
export type ActivityWeatherCodeAD4 = "sunny" | "rainy" | "cloudy" | "unknown";

/**
 * Recent activity history entry (PII 不含 caller responsibility).
 */
export interface RecentActivityHistoryEntry {
  /** caller normalized activity name (e.g., "park_walk"、PII 不含) */
  activityName: string;
  /** 何日前か (0 = 今日、>=0) */
  daysAgo: number;
}

/**
 * Fairness state (Fairness Ledger からの bias 反映).
 */
export interface ActivityRankingFairnessState {
  /** -1 to +1 (正: A 寄り、負: B 寄り、0: balanced) */
  recentBias: number;
  /** Recent saturation activity names (caller normalized、PII 不含) */
  cooldownActivities: string[];
}

/**
 * Daily context for AD4 (AD2/AD3 same value space、本 file local).
 */
export interface ActivityRankingDailyContext {
  energyBudget?: 1 | 2 | 3 | 4 | 5;
  weather?: ActivityWeatherCodeAD4;
  pairAvailability?: "both" | "one_only" | "unknown";
}

// ─────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────

/**
 * AD4 input.
 */
export interface ActivityRankingInput {
  /** AD3 generator output (accepted candidates) */
  generatorOutput: ActivityCandidateGeneratorOutput;
  /** Daily context (AD2 と同 signal 範囲) */
  daily: ActivityRankingDailyContext;
  /** Fairness state (optional、未指定 → balanced 扱い) */
  fairness?: ActivityRankingFairnessState;
  /** Recent history (anti-repetition、optional) */
  recentHistory?: RecentActivityHistoryEntry[];
  /** Current cognitive load level (Daily 累積、default 1) */
  cognitiveLoadLevel?: CognitiveLoadLevel;
  /** Max ranked count (default 3) */
  maxRankedCount?: number;
  /** Cognitive load ceiling (default 3、high OK) */
  cognitiveLoadCeiling?: CognitiveLoadLevel;
}

// ─────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────

/**
 * AD4 score breakdown (AD3 breakdown + AD4 新規 5 axis).
 */
export interface ActivityRankingScoreBreakdown {
  // AD3 から carry
  fatigueFit: number;
  weatherFit: number;
  budgetFit: number;
  noveltyFit: number;
  pairFit: number;
  taxonomyAlignment: number;
  // AD4 新規 5 axis
  pairFairness: number;        // -1 to +1 (fairness ledger balance restoring)
  noveltyComfortBalance: number; // -1 to +1 (Pareto mix value)
  cognitiveLoadFit: number;    // -1 to +1
  antiRepetition: number;      // -1 to +1 (recent history saturation penalty)
  redLineSafety: number;       // 0 or -1 (red-line violation = -1)
  // AD4 Pareto + 集約
  paretoFront: number;         // 1, 2, 3, ... (1 = top front)
  rankedScore: number;         // 0-1 normalized weighted sum
}

/**
 * Ranked candidate (AD4 output、Pareto rank attached).
 */
export interface ActivityRankedCandidate {
  seedId: string;
  name: string;
  taxonomy: Partial<ActivityTaxonomy>;
  scoreBreakdown: ActivityRankingScoreBreakdown;
  /** 1-based rank (1 = top) */
  rank: number;
  uncertaintyLabel: ActivityUncertaintyLabel;
  /** なぜこの candidate が上位か (raw text 不可、enum only) */
  explanationReasonCodes: ActivityRankingExplanationCode[];
}

/**
 * Fairness note per candidate.
 */
export interface ActivityFairnessNote {
  seedId: string;
  reasonCode: ActivityFairnessReasonCode;
}

/**
 * Blocked candidate (red-line hard block / cognitive load ceiling / handoff).
 */
export interface ActivityRankingBlockedCandidate {
  seedId: string;
  blockedReasonCode: ActivityRankingBlockedReasonCode;
}

/**
 * AD4 output.
 */
export interface ActivityRankingOutput {
  rankedCandidates: ActivityRankedCandidate[];
  scoreBreakdown: Record<string, ActivityRankingScoreBreakdown>;
  fairnessNotes: ActivityFairnessNote[];
  blockedCandidates: ActivityRankingBlockedCandidate[];
  uncertaintyLabels: Record<string, ActivityUncertaintyLabel>;
  reasonCodes: ActivityRankingReasonCode[];
  rankingVersion: string;
}

// ─────────────────────────────────────────────
// Reason / Explanation / Blocked / Fairness enum (raw text 不可)
// ─────────────────────────────────────────────

/**
 * Overall reason codes.
 */
export type ActivityRankingReasonCode =
  | "empty_input"
  | "no_candidates_provided"
  | "fail_closed"
  | "pareto_ranking_applied"
  | "fairness_adjustment_applied"
  | "anti_repetition_applied"
  | "cognitive_load_ceiling_active"
  | "max_count_reached"
  | "all_blocked"
  | "single_candidate_only"
  | "deterministic_tie_break_applied";

/**
 * Per-candidate explanation codes (なぜ上位か).
 */
export type ActivityRankingExplanationCode =
  | "top_pareto_front"
  | "second_pareto_front"
  | "balanced_score"
  | "novelty_seeker_match"
  | "comfort_seeker_match"
  | "novelty_comfort_mix"
  | "fairness_lean_to_a"
  | "fairness_lean_to_b"
  | "fairness_balanced"
  | "low_cognitive_load_match"
  | "fatigue_friendly"
  | "weather_safe"
  | "budget_match"
  | "no_recent_repetition"
  | "slight_recent_repetition"
  | "tie_break_by_seed_id";

/**
 * Blocked reason codes.
 */
export type ActivityRankingBlockedReasonCode =
  | "red_line_hard_block"
  | "cognitive_load_ceiling_exceeded"
  | "handoff_target_present"
  | "above_max_rank_count";

/**
 * Fairness note codes.
 */
export type ActivityFairnessReasonCode =
  | "fairness_bias_balanced"
  | "fairness_bias_a_favored_history"
  | "fairness_bias_b_favored_history"
  | "fairness_bias_unknown_neutral"
  | "anti_repetition_recent_high"
  | "anti_repetition_recent_mid"
  | "anti_repetition_recent_low"
  | "anti_repetition_recent_none"
  | "saturation_cooldown_active";

// ─────────────────────────────────────────────
// Helper: derive candidate cognitive load from taxonomy (pure)
// ─────────────────────────────────────────────

/**
 * Candidate cognitive load を taxonomy から導出.
 *
 * - novelty=novelty + fatigueLevel>=4 → load 3 (high)
 * - novelty=novelty OR fatigueLevel>=4 → load 2 (mid)
 * - その他 → load 1 (low)
 *
 * Note: cognitive load は fatigue とは異なる軸 (新規 vs familiar の認知負荷)。
 */
function deriveCognitiveLoad(taxonomy: Partial<ActivityTaxonomy>): CognitiveLoadLevel {
  const novelty = taxonomy.noveltyLevel;
  const fatigue = taxonomy.fatigueLevel;
  const isNovelty = novelty === "novelty";
  const isHighFatigue = fatigue !== undefined && fatigue >= 4;
  if (isNovelty && isHighFatigue) return 3;
  if (isNovelty || isHighFatigue) return 2;
  return 1;
}

// ─────────────────────────────────────────────
// Helper: anti-repetition penalty (pure)
// ─────────────────────────────────────────────

/**
 * Recent history からの anti-repetition penalty (-1 to 0).
 *
 *   - daysAgo < 3 → -0.5 (recent_high penalty)
 *   - daysAgo < 7 → -0.3 (recent_mid)
 *   - daysAgo < 14 → -0.1 (recent_low)
 *   - daysAgo >= 14 OR not in history → 0 (none)
 */
function computeAntiRepetition(
  candidateName: string,
  recentHistory: RecentActivityHistoryEntry[] | undefined,
): { score: number; reason: ActivityFairnessReasonCode } {
  if (recentHistory === undefined) {
    return { score: 0, reason: "anti_repetition_recent_none" };
  }
  const matched = recentHistory.find((h) => h.activityName === candidateName);
  if (matched === undefined) {
    return { score: 0, reason: "anti_repetition_recent_none" };
  }
  if (matched.daysAgo < 3) {
    return { score: -0.5, reason: "anti_repetition_recent_high" };
  }
  if (matched.daysAgo < 7) {
    return { score: -0.3, reason: "anti_repetition_recent_mid" };
  }
  if (matched.daysAgo < 14) {
    return { score: -0.1, reason: "anti_repetition_recent_low" };
  }
  return { score: 0, reason: "anti_repetition_recent_none" };
}

// ─────────────────────────────────────────────
// Helper: pair fairness (balance restoring、pure)
// ─────────────────────────────────────────────

/**
 * Pair fairness balance score.
 *
 * Fairness ledger bias を balance restoring direction で評価:
 *   - |bias| < BALANCE_BAND → balanced (score = 0)
 *   - bias > BALANCE_BAND → A favored history、本 candidate に **slight positive boost**
 *     (restoring direction、ただし candidate 固有 A/B 寄りは不明なので global adjustment)
 *   - bias < -BALANCE_BAND → B favored history、同 logic
 *
 * Note: 本実装では fairness は **per-candidate ではなく overall** に作用、
 * 全候補に同じ score を attach (relative ordering 変えず、fairnessNotes で明示)。
 * 将来 (AD5+) per-candidate pair preference fit が確定すれば、direction 別 score 可能。
 */
function computePairFairness(
  fairness: ActivityRankingFairnessState | undefined,
): { score: number; reason: ActivityFairnessReasonCode } {
  if (fairness === undefined) {
    return { score: 0, reason: "fairness_bias_unknown_neutral" };
  }
  const bias = fairness.recentBias;
  if (Math.abs(bias) < PROVISIONAL_FAIRNESS_BALANCE_BAND) {
    return { score: 0, reason: "fairness_bias_balanced" };
  }
  if (bias > 0) {
    // A favored historically、restoring direction でわずか positive
    return { score: 0.1, reason: "fairness_bias_a_favored_history" };
  }
  return { score: 0.1, reason: "fairness_bias_b_favored_history" };
}

// ─────────────────────────────────────────────
// Helper: novelty / comfort balance (Pareto mix value、pure)
// ─────────────────────────────────────────────

/**
 * Novelty / comfort balance score.
 *
 * AD3 noveltyFit は完全一致重視。AD4 では **Pareto mix value** を加味:
 *   - mix candidate (novelty ↔ familiar) → +0.5 (diversity bonus)
 *   - 完全一致 → 既存 AD3 noveltyFit で carry、本 axis では 0
 *   - 反対方向 → 0 (AD3 で penalty 済)
 */
function computeNoveltyComfortBalance(
  noveltyFit: number,
): { score: number; reasonCode: ActivityRankingExplanationCode } {
  // noveltyFit = 0.3 (AD3 Pareto mix 値) ならば diversity bonus
  if (noveltyFit > 0.2 && noveltyFit < 0.5) {
    return { score: 0.5, reasonCode: "novelty_comfort_mix" };
  }
  if (noveltyFit >= 0.5) {
    return { score: 0, reasonCode: "novelty_seeker_match" };
  }
  return { score: 0, reasonCode: "comfort_seeker_match" };
}

// ─────────────────────────────────────────────
// Helper: cognitive load fit (pure)
// ─────────────────────────────────────────────

function computeCognitiveLoadFit(
  currentLoad: CognitiveLoadLevel,
  candidateLoad: CognitiveLoadLevel,
  ceiling: CognitiveLoadLevel,
): { score: number; exceedsCeiling: boolean; reason: ActivityRankingExplanationCode } {
  const sum = currentLoad + candidateLoad;
  if (sum > ceiling) {
    return { score: -1, exceedsCeiling: true, reason: "low_cognitive_load_match" };
  }
  // 合計が ceiling 以下: load が低いほど positive
  const headroom = ceiling - sum;
  const score = Math.min(headroom / ceiling, 1);
  return { score, exceedsCeiling: false, reason: "low_cognitive_load_match" };
}

// ─────────────────────────────────────────────
// Helper: uncertainty label (AD3 weather + AD3 confidence base、pure)
// ─────────────────────────────────────────────

function deriveUncertaintyLabel(
  candidate: ActivityScoredCandidate,
  intentWeatherCode: ActivityWeatherCodeAD4 | undefined,
): ActivityUncertaintyLabel {
  const totalScore = candidate.scoreBreakdown.totalScore;
  // weather=unknown は uncertainty raise
  const weatherUnknown = intentWeatherCode === undefined || intentWeatherCode === "unknown";

  if (totalScore >= 0.75 && !weatherUnknown) return "high_confidence";
  if (totalScore >= 0.5) return "mid_confidence";
  if (totalScore >= 0.25) return "low_confidence";
  return "info_lacking";
}

// ─────────────────────────────────────────────
// Helper: Pareto domination check (pure)
// ─────────────────────────────────────────────

/**
 * Candidate a が b を Pareto dominates するか判定.
 *
 * 全 axis で a >= b、かつ 1 axis 以上で a > b。
 *
 * 評価 axis (7 = AD4 全 axis):
 *   fatigueFit, weatherFit, budgetFit, noveltyFit, pairFit,
 *   taxonomyAlignment, antiRepetition
 *
 * Note: pairFairness と noveltyComfortBalance は AD4 で全候補に同方向の adjustment
 * となり Pareto dominance に影響しない、または candidate 別差ない。
 * cognitiveLoadFit / redLineSafety は blocking 評価で別途処理 (Pareto 除外済)。
 */
function paretoDominate(a: ActivityRankingScoreBreakdown, b: ActivityRankingScoreBreakdown): boolean {
  const axes: (keyof ActivityRankingScoreBreakdown)[] = [
    "fatigueFit",
    "weatherFit",
    "budgetFit",
    "noveltyFit",
    "pairFit",
    "taxonomyAlignment",
    "antiRepetition",
  ];
  let atLeastOneStrictlyBetter = false;
  for (const axis of axes) {
    if (a[axis] < b[axis]) return false;
    if (a[axis] > b[axis]) atLeastOneStrictlyBetter = true;
  }
  return atLeastOneStrictlyBetter;
}

// ─────────────────────────────────────────────
// Helper: Pareto front computation (pure)
// ─────────────────────────────────────────────

interface Scored {
  seedId: string;
  candidate: ActivityScoredCandidate;
  breakdown: ActivityRankingScoreBreakdown;
}

/**
 * Pareto front rank.
 *
 * 各 candidate に paretoFront 番号 (1=top) を assign:
 *   - front 1: dominated されない候補集合
 *   - front 2: front 1 を除いた後 dominated されない集合
 *   - ...
 */
function computeParetoFronts(scoredList: Scored[]): Scored[] {
  const remaining = [...scoredList];
  let front = 1;
  while (remaining.length > 0) {
    const current: Scored[] = [];
    for (const a of remaining) {
      const dominated = remaining.some((b) => b !== a && paretoDominate(b.breakdown, a.breakdown));
      if (!dominated) {
        current.push(a);
      }
    }
    for (const c of current) {
      c.breakdown.paretoFront = front;
      // remove from remaining
      const idx = remaining.indexOf(c);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    front++;
    // safety break (避けるべき infinite loop、defensive)
    if (front > scoredList.length + 1) break;
  }
  return scoredList;
}

// ─────────────────────────────────────────────
// Helper: weighted ranked score (pure)
// ─────────────────────────────────────────────

/**
 * Provisional weights (AD5/AD6 phase で calibrate).
 *
 * Note: Pareto front rank が primary、本 weighted score は tie-break / display 用。
 */
const RANKING_WEIGHTS = {
  fatigueFit: 0.12,
  weatherFit: 0.12,
  budgetFit: 0.10,
  noveltyFit: 0.10,
  pairFit: 0.10,
  taxonomyAlignment: 0.10,
  pairFairness: 0.10,
  noveltyComfortBalance: 0.10,
  cognitiveLoadFit: 0.08,
  antiRepetition: 0.08,
} as const;

function computeRankedScore(breakdown: ActivityRankingScoreBreakdown): number {
  const raw =
    breakdown.fatigueFit * RANKING_WEIGHTS.fatigueFit +
    breakdown.weatherFit * RANKING_WEIGHTS.weatherFit +
    breakdown.budgetFit * RANKING_WEIGHTS.budgetFit +
    breakdown.noveltyFit * RANKING_WEIGHTS.noveltyFit +
    breakdown.pairFit * RANKING_WEIGHTS.pairFit +
    breakdown.taxonomyAlignment * RANKING_WEIGHTS.taxonomyAlignment +
    breakdown.pairFairness * RANKING_WEIGHTS.pairFairness +
    breakdown.noveltyComfortBalance * RANKING_WEIGHTS.noveltyComfortBalance +
    breakdown.cognitiveLoadFit * RANKING_WEIGHTS.cognitiveLoadFit +
    breakdown.antiRepetition * RANKING_WEIGHTS.antiRepetition;
  // raw range: roughly -1 to +1 (axes max +1 each、weights sum = 1)
  // Normalize to 0-1
  return Math.min(Math.max((raw + 1) / 2, 0), 1);
}

// ─────────────────────────────────────────────
// Helper: explanation reason code 集約 (pure)
// ─────────────────────────────────────────────

function collectExplanationReasons(
  breakdown: ActivityRankingScoreBreakdown,
  pairFairnessReason: ActivityFairnessReasonCode,
  noveltyMixReason: ActivityRankingExplanationCode,
  antiRepReason: ActivityFairnessReasonCode,
): ActivityRankingExplanationCode[] {
  const reasons: ActivityRankingExplanationCode[] = [];
  if (breakdown.paretoFront === 1) reasons.push("top_pareto_front");
  else if (breakdown.paretoFront === 2) reasons.push("second_pareto_front");

  // novelty / comfort
  reasons.push(noveltyMixReason);

  // fairness
  if (pairFairnessReason === "fairness_bias_a_favored_history") reasons.push("fairness_lean_to_a");
  else if (pairFairnessReason === "fairness_bias_b_favored_history") reasons.push("fairness_lean_to_b");
  else if (pairFairnessReason === "fairness_bias_balanced") reasons.push("fairness_balanced");

  // fatigue
  if (breakdown.fatigueFit > 0.5) reasons.push("fatigue_friendly");

  // weather
  if (breakdown.weatherFit > 0.4) reasons.push("weather_safe");

  // budget
  if (breakdown.budgetFit > 0.5) reasons.push("budget_match");

  // cognitive load — positive headroom (sum < ceiling) で low_cognitive_load_match
  if (breakdown.cognitiveLoadFit > 0) reasons.push("low_cognitive_load_match");

  // anti-repetition
  if (antiRepReason === "anti_repetition_recent_none") reasons.push("no_recent_repetition");
  else if (
    antiRepReason === "anti_repetition_recent_low" ||
    antiRepReason === "anti_repetition_recent_mid"
  ) {
    reasons.push("slight_recent_repetition");
  }

  // balanced (all axes >= 0)
  const allPositive =
    breakdown.fatigueFit >= 0 &&
    breakdown.weatherFit >= 0 &&
    breakdown.budgetFit >= 0 &&
    breakdown.noveltyFit >= 0 &&
    breakdown.pairFit >= 0 &&
    breakdown.taxonomyAlignment >= 0;
  if (allPositive) reasons.push("balanced_score");

  return reasons;
}

// ─────────────────────────────────────────────
// Helper: infer weather code from candidate AD3 reason codes (pure)
// ─────────────────────────────────────────────

function inferWeatherFromDailyContext(daily: ActivityRankingDailyContext): ActivityWeatherCodeAD4 {
  return daily.weather ?? "unknown";
}

// ─────────────────────────────────────────────
// Main ranking (pure function、deterministic)
// ─────────────────────────────────────────────

/**
 * AD4 Activity multi-axis ranking pure function.
 *
 * **本関数は純関数**: 同じ input → 同じ output、副作用なし、`Math.random` 不使用、
 * external state 参照なし、現在時刻参照なし。
 *
 * **Pareto-style multi-axis ranking**:
 *   1. AD3 output から ActivityScoredCandidate を取得
 *   2. AD4 5 新規 axis 計算 (pairFairness / noveltyComfortBalance / cognitiveLoadFit / antiRepetition / redLineSafety)
 *   3. Pareto front 計算 (front 1, 2, ...)
 *   4. weighted ranked score 計算 (tie-break / display)
 *   5. Pareto front 番号 + rankedScore で sort (deterministic tie-break: seedId)
 *   6. cognitive load ceiling block / handoff target block
 *   7. max ranked count 制限
 *
 * @param input AD3 generator output + daily / fairness / history / cognitive load
 * @returns Pareto-ranked candidates + score breakdown + fairness notes + blocked list
 */
export function rankActivityCandidates(input: ActivityRankingInput): ActivityRankingOutput {
  const maxRankedCount = input.maxRankedCount ?? PROVISIONAL_MAX_RANKED_COUNT;
  const cognitiveLoadCeiling = input.cognitiveLoadCeiling ?? PROVISIONAL_COGNITIVE_LOAD_CEILING;
  const currentLoad = input.cognitiveLoadLevel ?? 1;
  const reasonCodes: ActivityRankingReasonCode[] = [];
  const fairnessNotes: ActivityFairnessNote[] = [];
  const blockedCandidates: ActivityRankingBlockedCandidate[] = [];
  const uncertaintyLabels: Record<string, ActivityUncertaintyLabel> = {};
  const scoreBreakdown: Record<string, ActivityRankingScoreBreakdown> = {};

  const candidates = input.generatorOutput.candidates;

  // 1. Empty / fail-closed
  if (candidates.length === 0) {
    reasonCodes.push("empty_input");
    reasonCodes.push("no_candidates_provided");
    reasonCodes.push("fail_closed");
    return {
      rankedCandidates: [],
      scoreBreakdown,
      fairnessNotes,
      blockedCandidates,
      uncertaintyLabels,
      reasonCodes,
      rankingVersion: RANKING_VERSION,
    };
  }

  // 2. AD4 5 axis 計算
  const fairnessAdj = computePairFairness(input.fairness);
  const intentWeatherCode = inferWeatherFromDailyContext(input.daily);

  type AD4Scored = {
    seedId: string;
    candidate: ActivityScoredCandidate;
    breakdown: ActivityRankingScoreBreakdown;
    explanationBaseReasons: ActivityRankingExplanationCode[];
    pairFairnessReason: ActivityFairnessReasonCode;
    antiRepReason: ActivityFairnessReasonCode;
    blocked?: ActivityRankingBlockedReasonCode;
  };

  const ad4Scored: AD4Scored[] = candidates.map((c) => {
    const candidateLoad = deriveCognitiveLoad(c.taxonomy);
    const antiRep = computeAntiRepetition(c.name, input.recentHistory);
    const noveltyMix = computeNoveltyComfortBalance(c.scoreBreakdown.noveltyFit);
    const loadFit = computeCognitiveLoadFit(currentLoad, candidateLoad, cognitiveLoadCeiling);

    // Red-line safety = 0 (本 PR 入力 AD3 output には red-line 含まれず、AD3 で blocked 済)
    // Safety 評価: 候補が AD3 で accepted されている = red-line OK
    const redLineSafety = 0;

    const breakdown: ActivityRankingScoreBreakdown = {
      fatigueFit: c.scoreBreakdown.fatigueFit,
      weatherFit: c.scoreBreakdown.weatherFit,
      budgetFit: c.scoreBreakdown.budgetFit,
      noveltyFit: c.scoreBreakdown.noveltyFit,
      pairFit: c.scoreBreakdown.pairFit,
      taxonomyAlignment: c.scoreBreakdown.taxonomyAlignment,
      pairFairness: fairnessAdj.score,
      noveltyComfortBalance: noveltyMix.score,
      cognitiveLoadFit: loadFit.score,
      antiRepetition: antiRep.score,
      redLineSafety,
      paretoFront: 0, // will be assigned
      rankedScore: 0, // will be assigned
    };

    return {
      seedId: c.seedId,
      candidate: c,
      breakdown,
      explanationBaseReasons: [],
      pairFairnessReason: fairnessAdj.reason,
      antiRepReason: antiRep.reason,
      blocked: loadFit.exceedsCeiling ? "cognitive_load_ceiling_exceeded" : undefined,
    };
  });

  // 3. blocked 分離 (cognitive load ceiling / saturation cooldown)
  const cooldownSet = new Set(input.fairness?.cooldownActivities ?? []);
  for (const s of ad4Scored) {
    // cognitive load ceiling
    if (s.blocked === "cognitive_load_ceiling_exceeded") {
      blockedCandidates.push({
        seedId: s.seedId,
        blockedReasonCode: "cognitive_load_ceiling_exceeded",
      });
      fairnessNotes.push({ seedId: s.seedId, reasonCode: s.antiRepReason });
      uncertaintyLabels[s.seedId] = deriveUncertaintyLabel(s.candidate, intentWeatherCode);
      continue;
    }
    // saturation cooldown
    if (cooldownSet.has(s.candidate.name)) {
      blockedCandidates.push({
        seedId: s.seedId,
        blockedReasonCode: "above_max_rank_count",
      });
      fairnessNotes.push({
        seedId: s.seedId,
        reasonCode: "saturation_cooldown_active",
      });
      s.blocked = "above_max_rank_count";
      uncertaintyLabels[s.seedId] = deriveUncertaintyLabel(s.candidate, intentWeatherCode);
    }
  }

  // saturation 通常 blocked の handle 後、Pareto 対象は blocked === undefined のみ
  const eligibleForPareto = ad4Scored.filter((s) => s.blocked === undefined);

  if (eligibleForPareto.length === 0) {
    reasonCodes.push("all_blocked");
    // fairnessNotes / blockedCandidates / uncertaintyLabels は既に attach 済
    return {
      rankedCandidates: [],
      scoreBreakdown: ad4Scored.reduce<Record<string, ActivityRankingScoreBreakdown>>((acc, s) => {
        acc[s.seedId] = s.breakdown;
        return acc;
      }, {}),
      fairnessNotes,
      blockedCandidates,
      uncertaintyLabels,
      reasonCodes,
      rankingVersion: RANKING_VERSION,
    };
  }

  // 4. Pareto front 計算
  const paretoScored: Scored[] = eligibleForPareto.map((s) => ({
    seedId: s.seedId,
    candidate: s.candidate,
    breakdown: s.breakdown,
  }));
  computeParetoFronts(paretoScored);

  // 5. ranked score 計算 (Pareto front 同位の tie-break で使う)
  for (const s of paretoScored) {
    s.breakdown.rankedScore = computeRankedScore(s.breakdown);
  }

  reasonCodes.push("pareto_ranking_applied");
  if (fairnessAdj.score !== 0) reasonCodes.push("fairness_adjustment_applied");
  if (input.recentHistory !== undefined && input.recentHistory.length > 0) {
    reasonCodes.push("anti_repetition_applied");
  }
  if (cognitiveLoadCeiling > 0) reasonCodes.push("cognitive_load_ceiling_active");

  // 6. Sort: paretoFront 昇順 → rankedScore 降順 → seedId 昇順 (deterministic tie-break)
  paretoScored.sort((a, b) => {
    if (a.breakdown.paretoFront !== b.breakdown.paretoFront) {
      return a.breakdown.paretoFront - b.breakdown.paretoFront;
    }
    if (a.breakdown.rankedScore !== b.breakdown.rankedScore) {
      return b.breakdown.rankedScore - a.breakdown.rankedScore;
    }
    return a.seedId.localeCompare(b.seedId);
  });

  // 7. maxRankedCount 制限
  const limited = paretoScored.slice(0, maxRankedCount);
  if (paretoScored.length > maxRankedCount) {
    for (const excluded of paretoScored.slice(maxRankedCount)) {
      blockedCandidates.push({
        seedId: excluded.seedId,
        blockedReasonCode: "above_max_rank_count",
      });
    }
    reasonCodes.push("max_count_reached");
  }
  if (limited.length === 1) reasonCodes.push("single_candidate_only");

  // 8. rankedCandidates 構築 (with rank, explanation reasons, uncertainty)
  const rankedCandidates: ActivityRankedCandidate[] = limited.map((s, idx) => {
    const original = ad4Scored.find((x) => x.seedId === s.seedId);
    const antiRepReason = original?.antiRepReason ?? "anti_repetition_recent_none";
    const pairFairnessReason = original?.pairFairnessReason ?? "fairness_bias_unknown_neutral";
    const noveltyMix = computeNoveltyComfortBalance(s.breakdown.noveltyFit);
    const explanationReasonCodes = collectExplanationReasons(
      s.breakdown,
      pairFairnessReason,
      noveltyMix.reasonCode,
      antiRepReason,
    );
    if (idx > 0 && limited[idx - 1].breakdown.rankedScore === s.breakdown.rankedScore) {
      explanationReasonCodes.push("tie_break_by_seed_id");
    }

    const uncertaintyLabel = deriveUncertaintyLabel(s.candidate, intentWeatherCode);
    uncertaintyLabels[s.seedId] = uncertaintyLabel;

    fairnessNotes.push({ seedId: s.seedId, reasonCode: pairFairnessReason });
    if (antiRepReason !== "anti_repetition_recent_none") {
      fairnessNotes.push({ seedId: s.seedId, reasonCode: antiRepReason });
    }

    return {
      seedId: s.seedId,
      name: s.candidate.name,
      taxonomy: s.candidate.taxonomy,
      scoreBreakdown: s.breakdown,
      rank: idx + 1,
      uncertaintyLabel,
      explanationReasonCodes,
    };
  });

  // 9. scoreBreakdown record 構築 (全 ad4Scored の breakdown)
  for (const s of ad4Scored) {
    scoreBreakdown[s.seedId] = s.breakdown;
    if (uncertaintyLabels[s.seedId] === undefined) {
      uncertaintyLabels[s.seedId] = deriveUncertaintyLabel(s.candidate, intentWeatherCode);
    }
  }

  // 10. tie-break notice
  for (let i = 1; i < limited.length; i++) {
    if (
      limited[i].breakdown.paretoFront === limited[i - 1].breakdown.paretoFront &&
      limited[i].breakdown.rankedScore === limited[i - 1].breakdown.rankedScore
    ) {
      reasonCodes.push("deterministic_tie_break_applied");
      break;
    }
  }

  return {
    rankedCandidates,
    scoreBreakdown,
    fairnessNotes,
    blockedCandidates,
    uncertaintyLabels,
    reasonCodes,
    rankingVersion: RANKING_VERSION,
  };
}

// ─────────────────────────────────────────────
// Re-export referenced types (caller convenience)
// ─────────────────────────────────────────────

export type { ActivityHandoffTarget, ActivityFatigueLevel };
