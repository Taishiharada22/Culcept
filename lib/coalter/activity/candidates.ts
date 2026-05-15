/**
 * CoAlter Activity Domain — Candidate Generator + Scorer (AD3 phase)
 *
 * 正本:
 *   - docs/coalter-activity-domain-mapping.md (PR #126、design completion)
 *   - docs/coalter-master-design.md v1.2 §13.4 (Activity reflection)
 *   - lib/coalter/activity/types.ts (Batch-C PR #131、AD1 phase)
 *   - lib/coalter/activity/intent.ts (PR #132、AD2 phase)
 *
 * 役割:
 *   AD2 (Activity intent extraction) の output と caller 提供 candidate seeds を
 *   入力に、Activity domain candidate を **filter + score + rank** する pure
 *   function。runtime 接続なし、production behavior 0 変化。
 *
 * **重要 — Seed-based 設計** (CEO 2026-05-15 制約):
 *   - 巨大 curated catalog / external API / Places 検索 / raw text parser は **本 file に含めない**
 *   - caller が `ActivityCandidateSeed[]` を提供、generator は filter + score + rank のみ
 *   - 純粋関数、決定論的
 *
 * 構造的安全設計 (Gap 4 D2 + AD2 継承):
 *   1. raw text leakage 構造的防止: input / output 全 string field は caller normalized、
 *      reasonCodes / blockedReasonCodes / missingCandidateInputs は **enum only**
 *   2. **provisional score**: scoring weights は AD4 phase で calibrate、本 PR は暫定値
 *   3. **fail-closed default**: seed なし / intent not eligible → empty candidates + missing inputs
 *   4. **deterministic**: 純関数、stateless、Math.random 不使用、external state 0
 *   5. **handoff seed 除外**: food / movie / travel handoff target 付き seed は **activity 候補に混ぜない**、blocked list に分離
 *   6. **red-line blocking**: redLineConflicts 非空 seed は score 計算前に除外
 *
 * 後続 phase (本 PR scope 外):
 *   - AD4: multi-axis ranking + fairness / novelty / cognitive load 統合 (別 PR)
 *   - AD5: UI presentation (Product Unit 連携、別 PR)
 *   - AD6: production observation + mode enum rollout (別 PR、CEO 戦略判断)
 *
 * 本 PR の不可触 (CEO 2026-05-15 制約):
 *   - Daily planner 接続 / DomainRouter 接続 / orchestrator 接続
 *   - ChatClient / UpperLayerMount / route / API / env / flags / migration
 *   - lib/coalter/activity/types.ts 既存 type touch (新 type は本 file local 定義)
 *   - lib/coalter/activity/intent.ts touch (AD2 output を read-only で受領)
 *   - Travel T2 / Daily Dispatch DD2 実装
 */

import type {
  ActivityCostBand,
  ActivityFatigueLevel,
  ActivityHandoffTarget,
  ActivityNoveltyLevel,
  ActivityPairCompatibility,
  ActivityTaxonomy,
} from "./types";
import type { ActivityIntentOutput, ActivityIntentMissingSlot } from "./intent";

// ─────────────────────────────────────────────
// generator version (AD4 calibration 用)
// ─────────────────────────────────────────────

/**
 * Generator version 文字列 (semver).
 *
 * 後続 phase で scoring logic 変更時 MINOR up、入出力 schema 変更時 MAJOR up。
 */
export const GENERATOR_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// provisional defaults (確定値ではない)
// ─────────────────────────────────────────────

/**
 * Provisional default score threshold (CEO 2026-05-15 補正済).
 *
 * candidate を accepted / blocked 分類する閾値。AD4/AD5 phase で実 data 観測後決定。
 */
export const PROVISIONAL_SCORE_THRESHOLD = 0.4;

/**
 * Provisional default max candidates (MVP: 2-3 案).
 *
 * PR #126 MVP scope (2-3 candidate 案) を反映。input.maxCandidates で override 可。
 */
export const PROVISIONAL_DEFAULT_MAX_CANDIDATES = 3;

// ─────────────────────────────────────────────
// ActivityCandidateSeed (caller 提供 candidate 基本属性)
// ─────────────────────────────────────────────

/**
 * Candidate seed.
 *
 * **caller 責任**:
 *   - seedId: unique identifier (PII 不含、e.g., uuid / hash)
 *   - name: normalized 短い名前 (PII 不含、e.g., "park_walk", "neighborhood_cafe")
 *   - taxonomy: 7 軸の部分 tag (generator は補完しない)
 *   - handoffTarget: 付いていれば activity 外、generator が blocked 分類
 *   - redLineConflicts: caller 抽出済の normalized code list (PII 不含)
 *
 * **構造的安全**:
 *   raw user text / raw place data を含めない。caller 側で抽出 + normalize した
 *   結果のみを受領 (型レベル enforcement)。
 */
export interface ActivityCandidateSeed {
  /** unique seed identifier (PII 不含) */
  seedId: string;
  /** normalized 短い名前 (caller 抽出済、PII 不含) */
  name: string;
  /** 7 軸 taxonomy 部分 tag */
  taxonomy: Partial<ActivityTaxonomy>;
  /** handoff target (food/movie/travel)、attach されていれば activity 外 */
  handoffTarget?: ActivityHandoffTarget;
  /** red-line conflict code list (caller normalized、PII 不含) */
  redLineConflicts?: string[];
}

// ─────────────────────────────────────────────
// Score breakdown (各 dimension の独立 score)
// ─────────────────────────────────────────────

/**
 * Score breakdown.
 *
 * 各 dimension は -1 to +1 range で個別 evaluate、`totalScore` は weighted sum 後
 * 0-1 normalized。
 *
 * **provisional weights** (AD4 phase で calibrate):
 *   - fatigueFit: 0.20
 *   - weatherFit: 0.20
 *   - budgetFit: 0.15
 *   - noveltyFit: 0.15
 *   - pairFit: 0.15
 *   - taxonomyAlignment: 0.15
 */
export interface ActivityScoreBreakdown {
  /** fatigue match score (-1 to +1) */
  fatigueFit: number;
  /** weather compatibility score (-1 to +1) */
  weatherFit: number;
  /** budget alignment score (-1 to +1) */
  budgetFit: number;
  /** novelty preference match score (-1 to +1) */
  noveltyFit: number;
  /** pair availability match score (-1 to +1) */
  pairFit: number;
  /** taxonomy alignment with intent (0 to +1) */
  taxonomyAlignment: number;
  /** weighted total score (0-1 normalized) */
  totalScore: number;
}

// ─────────────────────────────────────────────
// Scored candidate (accepted、ranked)
// ─────────────────────────────────────────────

/**
 * Scored candidate.
 *
 * accepted (score >= threshold) で blocked でない candidate、rank 順に並ぶ。
 */
export interface ActivityScoredCandidate {
  seedId: string;
  name: string;
  taxonomy: Partial<ActivityTaxonomy>;
  scoreBreakdown: ActivityScoreBreakdown;
  /** 1-based rank (1 = highest score) */
  rank: number;
  reasonCodes: ActivityCandidateReasonCode[];
}

// ─────────────────────────────────────────────
// Blocked candidate (handoff / red-line / score below threshold)
// ─────────────────────────────────────────────

/**
 * Blocked candidate (activity 候補に含めない、reason を明示).
 */
export interface ActivityBlockedCandidate {
  seedId: string;
  blockedReasonCodes: ActivityCandidateBlockedReasonCode[];
}

// ─────────────────────────────────────────────
// Generator input
// ─────────────────────────────────────────────

/**
 * Generator input.
 *
 * **構造的安全 (raw text leakage 防止)**:
 *   全 string field は caller normalized、generator は raw text を一切扱わない。
 */
export interface ActivityCandidateGeneratorInput {
  /** AD2 intent extraction の output (read-only) */
  intent: ActivityIntentOutput;
  /** caller が提供する candidate seeds */
  seeds: ActivityCandidateSeed[];
  /** 上限 candidate 数 (default: PROVISIONAL_DEFAULT_MAX_CANDIDATES = 3) */
  maxCandidates?: number;
  /** score threshold (default: PROVISIONAL_SCORE_THRESHOLD = 0.4) */
  scoreThreshold?: number;
}

// ─────────────────────────────────────────────
// Generator output
// ─────────────────────────────────────────────

/**
 * Generator output.
 *
 * - `candidates`: accepted + scored + ranked (1-based rank)
 * - `blockedCandidates`: handoff / red-line / below threshold で除外
 * - `missingCandidateInputs`: candidate 生成に不足な input (enum only)
 * - `reasonCodes`: overall reasons (raw text 不含、enum only)
 * - `needsMoreCandidates`: candidates.length < maxCandidates なら true
 * - `generatorVersion`: 本 generator version (calibration 用)
 */
export interface ActivityCandidateGeneratorOutput {
  candidates: ActivityScoredCandidate[];
  blockedCandidates: ActivityBlockedCandidate[];
  missingCandidateInputs: ActivityCandidateMissingInput[];
  reasonCodes: ActivityCandidateReasonCode[];
  needsMoreCandidates: boolean;
  generatorVersion: string;
}

// ─────────────────────────────────────────────
// Reason / Blocked / Missing enum (raw text 不可)
// ─────────────────────────────────────────────

/**
 * Overall / per-candidate reason codes.
 *
 * 将来 reason code 追加時は MINOR version up。
 */
export type ActivityCandidateReasonCode =
  // overall
  | "no_seeds_provided"
  | "intent_not_eligible"
  | "candidates_generated"
  | "max_candidates_reached"
  | "needs_more_candidates"
  | "all_blocked"
  // per-candidate scoring
  | "fatigue_match"
  | "fatigue_mismatch"
  | "weather_independent_safe"
  | "weather_compatible"
  | "weather_unknown_neutral"
  | "budget_in_range"
  | "budget_adjacent"
  | "budget_far"
  | "novelty_alignment"
  | "novelty_mix_pareto"
  | "novelty_mismatch"
  | "pair_optimal"
  | "pair_acceptable"
  | "pair_mismatch"
  | "taxonomy_alignment_high"
  | "taxonomy_alignment_medium"
  | "taxonomy_alignment_low"
  | "above_score_threshold"
  | "below_score_threshold"
  | "fail_closed";

/**
 * Blocked reason codes.
 */
export type ActivityCandidateBlockedReasonCode =
  | "handoff_seed_excluded"
  | "red_line_violation"
  | "weather_dependent_unfit"
  | "budget_overrun_severe"
  | "below_score_threshold";

/**
 * Missing input codes (candidate 生成不足).
 */
export type ActivityCandidateMissingInput =
  | "intent_not_eligible"
  | "no_seeds"
  | "too_few_eligible_seeds"
  | "missing_fatigue_signal"
  | "missing_budget_signal"
  | "missing_weather_signal"
  | "missing_pair_signal"
  | "missing_novelty_signal";

// ─────────────────────────────────────────────
// Helper: score each dimension (pure)
// ─────────────────────────────────────────────

/**
 * fatigueFit: intent suggestedTaxonomy.fatigueLevel vs seed.taxonomy.fatigueLevel.
 *
 *   - 一致 → +1.0
 *   - 差 1 → +0.5
 *   - 差 2 → -0.5
 *   - 差 3+ → -1.0
 *   - signal なし → 0 (neutral)
 */
function scoreFatigueFit(
  intentFatigue: ActivityFatigueLevel | undefined,
  seedFatigue: ActivityFatigueLevel | undefined,
): { score: number; reason: ActivityCandidateReasonCode } {
  if (intentFatigue === undefined || seedFatigue === undefined) {
    return { score: 0, reason: "fatigue_match" }; // neutral
  }
  const diff = Math.abs(intentFatigue - seedFatigue);
  if (diff === 0) return { score: 1.0, reason: "fatigue_match" };
  if (diff === 1) return { score: 0.5, reason: "fatigue_match" };
  if (diff === 2) return { score: -0.5, reason: "fatigue_mismatch" };
  return { score: -1.0, reason: "fatigue_mismatch" };
}

/**
 * weatherFit: weather code + seed.taxonomy.weatherDependency.
 *
 *   - weather=rainy + seed=weather_dependent → -1.0 (block 候補)
 *   - weather=rainy + seed=weather_independent → +0.5 (安全 indoor)
 *   - weather=sunny/cloudy + seed=weather_dependent → +1.0
 *   - weather=sunny/cloudy + seed=weather_independent → 0.5 (neutral、indoor も OK)
 *   - weather=unknown → 0 (neutral fail-closed)
 *   - seed.weatherDependency undefined → 0 (neutral)
 */
function scoreWeatherFit(
  weather: ActivityIntentOutput["suggestedTaxonomy"] | undefined,
  seedTaxonomy: Partial<ActivityTaxonomy>,
  intentWeatherCode: "sunny" | "rainy" | "cloudy" | "unknown" | undefined,
): { score: number; reason: ActivityCandidateReasonCode } {
  // seed.weatherDependency が undefined → neutral
  const seedDep = seedTaxonomy.weatherDependency;
  if (seedDep === undefined) {
    return { score: 0, reason: "weather_unknown_neutral" };
  }

  const wc = intentWeatherCode ?? "unknown";

  if (wc === "rainy") {
    if (seedDep === "weather_dependent") {
      return { score: -1.0, reason: "weather_unknown_neutral" }; // 実際は blocking
    }
    return { score: 0.5, reason: "weather_independent_safe" };
  }
  if (wc === "sunny" || wc === "cloudy") {
    if (seedDep === "weather_dependent") {
      return { score: 1.0, reason: "weather_compatible" };
    }
    return { score: 0.5, reason: "weather_independent_safe" };
  }
  // wc === "unknown"
  return { score: 0, reason: "weather_unknown_neutral" };
}

/**
 * budgetFit: intent.suggestedTaxonomy.costBand vs seed.taxonomy.costBand.
 *
 *   - 一致 → +1.0
 *   - 隣接 (free-low / low-medium / medium-high) → +0.5
 *   - 離れる (free-medium / low-high) → -0.5
 *   - 完全 mismatch (free-high) → -1.0
 *   - signal なし → 0
 */
const COST_BAND_ORDER: Record<ActivityCostBand, number> = {
  free: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function scoreBudgetFit(
  intentCost: ActivityCostBand | undefined,
  seedCost: ActivityCostBand | undefined,
): { score: number; reason: ActivityCandidateReasonCode } {
  if (intentCost === undefined || seedCost === undefined) {
    return { score: 0, reason: "budget_in_range" }; // neutral
  }
  const diff = Math.abs(COST_BAND_ORDER[intentCost] - COST_BAND_ORDER[seedCost]);
  if (diff === 0) return { score: 1.0, reason: "budget_in_range" };
  if (diff === 1) return { score: 0.5, reason: "budget_adjacent" };
  if (diff === 2) return { score: -0.5, reason: "budget_far" };
  return { score: -1.0, reason: "budget_far" };
}

/**
 * noveltyFit: intent.noveltyLevel vs seed.taxonomy.noveltyLevel.
 *
 * Pareto 観点 (PR #126 Idea 4): 完全一致だけでなく、Pareto mix も評価。
 *
 *   - 完全一致 → +1.0
 *   - novelty intent + familiar seed → +0.3 (Pareto mix candidate)
 *   - routine intent + familiar seed → +0.5 (cluster 一致)
 *   - novelty intent + routine seed → -0.5 (反対方向 mismatch)
 *   - signal なし → 0
 */
function scoreNoveltyFit(
  intentNovelty: ActivityNoveltyLevel | undefined,
  seedNovelty: ActivityNoveltyLevel | undefined,
): { score: number; reason: ActivityCandidateReasonCode } {
  if (intentNovelty === undefined || seedNovelty === undefined) {
    return { score: 0, reason: "novelty_alignment" }; // neutral
  }
  if (intentNovelty === seedNovelty) {
    return { score: 1.0, reason: "novelty_alignment" };
  }
  // adjacent: novelty-familiar / familiar-routine = Pareto mix candidate
  const isAdjacent =
    (intentNovelty === "novelty" && seedNovelty === "familiar") ||
    (intentNovelty === "familiar" && seedNovelty === "novelty") ||
    (intentNovelty === "routine" && seedNovelty === "familiar") ||
    (intentNovelty === "familiar" && seedNovelty === "routine");
  if (isAdjacent) {
    return { score: 0.3, reason: "novelty_mix_pareto" };
  }
  // 反対方向 (novelty <-> routine)
  return { score: -0.5, reason: "novelty_mismatch" };
}

/**
 * pairFit: pair availability + seed.taxonomy.pairCompatibility.
 */
function scorePairFit(
  intentPairCompat: ActivityPairCompatibility | undefined,
  seedPairCompat: ActivityPairCompatibility | undefined,
): { score: number; reason: ActivityCandidateReasonCode } {
  if (intentPairCompat === undefined && seedPairCompat === undefined) {
    return { score: 0, reason: "pair_acceptable" };
  }
  if (seedPairCompat === undefined) {
    return { score: 0, reason: "pair_acceptable" };
  }
  // seed が pair_compatible は universally acceptable
  if (seedPairCompat === "pair_compatible") {
    return { score: 1.0, reason: "pair_optimal" };
  }
  if (intentPairCompat === seedPairCompat) {
    return { score: 1.0, reason: "pair_optimal" };
  }
  // explicitly_pair seed + intent != explicitly_pair (e.g., solo_friendly)
  if (seedPairCompat === "explicitly_pair") {
    return { score: -1.0, reason: "pair_mismatch" };
  }
  return { score: 0.5, reason: "pair_acceptable" };
}

/**
 * taxonomyAlignment: 7 軸の一致 field 数 / total fields tested (0-1).
 *
 * intent.suggestedTaxonomy と seed.taxonomy で共通に value がある field のうち、
 * 一致した field の比率。
 */
function scoreTaxonomyAlignment(
  intentTaxonomy: Partial<ActivityTaxonomy>,
  seedTaxonomy: Partial<ActivityTaxonomy>,
): { score: number; reason: ActivityCandidateReasonCode } {
  const fields = [
    "indoorOutdoor",
    "durationBand",
    "costBand",
    "weatherDependency",
    "pairCompatibility",
    "noveltyLevel",
    "fatigueLevel",
  ] as const;
  let tested = 0;
  let matched = 0;
  for (const f of fields) {
    if (intentTaxonomy[f] !== undefined && seedTaxonomy[f] !== undefined) {
      tested++;
      if (intentTaxonomy[f] === seedTaxonomy[f]) matched++;
    }
  }
  if (tested === 0) return { score: 0, reason: "taxonomy_alignment_low" };
  const ratio = matched / tested;
  if (ratio >= 0.7) return { score: ratio, reason: "taxonomy_alignment_high" };
  if (ratio >= 0.4) return { score: ratio, reason: "taxonomy_alignment_medium" };
  return { score: ratio, reason: "taxonomy_alignment_low" };
}

// ─────────────────────────────────────────────
// Helper: blocked candidate 判定 (pure)
// ─────────────────────────────────────────────

/**
 * Blocked candidate を判定.
 *
 * 優先順:
 *   1. handoffTarget 付き → handoff_seed_excluded
 *   2. redLineConflicts 非空 → red_line_violation
 *   3. weather=rainy + seed=weather_dependent → weather_dependent_unfit
 *
 * Score below threshold はここでは扱わず、main function で別判定。
 */
function detectBlockedReasons(
  seed: ActivityCandidateSeed,
  intentWeatherCode: "sunny" | "rainy" | "cloudy" | "unknown" | undefined,
): ActivityCandidateBlockedReasonCode[] {
  const reasons: ActivityCandidateBlockedReasonCode[] = [];

  if (seed.handoffTarget !== undefined) {
    reasons.push("handoff_seed_excluded");
  }

  if (seed.redLineConflicts !== undefined && seed.redLineConflicts.length > 0) {
    reasons.push("red_line_violation");
  }

  if (intentWeatherCode === "rainy" && seed.taxonomy.weatherDependency === "weather_dependent") {
    reasons.push("weather_dependent_unfit");
  }

  return reasons;
}

// ─────────────────────────────────────────────
// Helper: missing inputs 検出 (pure)
// ─────────────────────────────────────────────

function detectMissingInputs(
  input: ActivityCandidateGeneratorInput,
  intentWeatherCode: "sunny" | "rainy" | "cloudy" | "unknown" | undefined,
): ActivityCandidateMissingInput[] {
  const missing: ActivityCandidateMissingInput[] = [];
  const intent = input.intent;

  if (intent.inferredActivityIntent !== "activity_eligible") {
    missing.push("intent_not_eligible");
  }
  if (input.seeds.length === 0) {
    missing.push("no_seeds");
  }

  const taxonomy = intent.suggestedTaxonomy;
  if (taxonomy.fatigueLevel === undefined) missing.push("missing_fatigue_signal");
  if (taxonomy.costBand === undefined) missing.push("missing_budget_signal");
  if (taxonomy.noveltyLevel === undefined) missing.push("missing_novelty_signal");
  if (intentWeatherCode === undefined || intentWeatherCode === "unknown") {
    missing.push("missing_weather_signal");
  }
  if (taxonomy.pairCompatibility === undefined) missing.push("missing_pair_signal");

  return missing;
}

// ─────────────────────────────────────────────
// Helper: scoring weights (provisional)
// ─────────────────────────────────────────────

const SCORING_WEIGHTS = {
  fatigueFit: 0.2,
  weatherFit: 0.2,
  budgetFit: 0.15,
  noveltyFit: 0.15,
  pairFit: 0.15,
  taxonomyAlignment: 0.15,
} as const;

// ─────────────────────────────────────────────
// Main generator (pure function、deterministic)
// ─────────────────────────────────────────────

/**
 * Activity candidate generator + scorer (pure function).
 *
 * **本関数は純関数**: 同じ input → 同じ output、副作用なし、`Math.random` 不使用、
 * 現在時刻参照なし、external state 参照なし。
 *
 * **構造的安全 (raw text leakage 防止)**:
 *   - input は AD2 output + caller normalized seeds のみ、raw user text 受領なし
 *   - output reasonCodes / blockedReasonCodes / missingCandidateInputs は **enum only**
 *
 * **Seed-based 設計**:
 *   - caller が seeds を提供、generator は filter + score + rank
 *   - 巨大 curated catalog / external API 不要
 *
 * **handoff seed 除外**:
 *   - food / movie / travel handoff target 付き seed は activity 候補に混ぜず blocked list へ
 *
 * **red-line blocking**:
 *   - redLineConflicts 非空 seed は score 計算前に除外
 *
 * @param input AD2 intent output + candidate seeds
 * @returns scored + ranked candidates + blocked list + missing inputs + reasons
 */
export function generateActivityCandidates(
  input: ActivityCandidateGeneratorInput,
): ActivityCandidateGeneratorOutput {
  const maxCandidates = input.maxCandidates ?? PROVISIONAL_DEFAULT_MAX_CANDIDATES;
  const threshold = input.scoreThreshold ?? PROVISIONAL_SCORE_THRESHOLD;
  const reasonCodes: ActivityCandidateReasonCode[] = [];
  const blockedCandidates: ActivityBlockedCandidate[] = [];

  // 1. AD2 intent から weather code を取り出す (suggestedTaxonomy には weather code 自体は含まれない、
  //    weatherDependency のみ。caller が intent.weather を別途渡せないため、本 PR では
  //    weatherDependency を proxy として scoring に使う)
  //    AD2 reasonCodes から weather signal を逆引き
  const intentWeatherCode = inferWeatherCodeFromIntentReasons(input.intent);

  // 2. Missing inputs 検出
  const missingCandidateInputs = detectMissingInputs(input, intentWeatherCode);

  // 3. intent not eligible → empty candidates
  if (input.intent.inferredActivityIntent !== "activity_eligible") {
    reasonCodes.push("intent_not_eligible");
    reasonCodes.push("fail_closed");
    return {
      candidates: [],
      blockedCandidates: [],
      missingCandidateInputs,
      reasonCodes,
      needsMoreCandidates: true,
      generatorVersion: GENERATOR_VERSION,
    };
  }

  // 4. seeds なし → empty candidates
  if (input.seeds.length === 0) {
    reasonCodes.push("no_seeds_provided");
    reasonCodes.push("fail_closed");
    return {
      candidates: [],
      blockedCandidates: [],
      missingCandidateInputs,
      reasonCodes,
      needsMoreCandidates: true,
      generatorVersion: GENERATOR_VERSION,
    };
  }

  // 5. 各 seed: blocked 判定 + scoring
  type SeedEvaluation = {
    seed: ActivityCandidateSeed;
    scored?: { breakdown: ActivityScoreBreakdown; candidateReasons: ActivityCandidateReasonCode[] };
    blocked?: ActivityCandidateBlockedReasonCode[];
  };

  const evaluations: SeedEvaluation[] = input.seeds.map((seed) => {
    const blockedReasons = detectBlockedReasons(seed, intentWeatherCode);
    if (blockedReasons.length > 0) {
      return { seed, blocked: blockedReasons };
    }

    // Scoring
    const intentTaxonomy = input.intent.suggestedTaxonomy;
    const f = scoreFatigueFit(intentTaxonomy.fatigueLevel, seed.taxonomy.fatigueLevel);
    const w = scoreWeatherFit(intentTaxonomy, seed.taxonomy, intentWeatherCode);
    const b = scoreBudgetFit(intentTaxonomy.costBand, seed.taxonomy.costBand);
    const n = scoreNoveltyFit(intentTaxonomy.noveltyLevel, seed.taxonomy.noveltyLevel);
    const p = scorePairFit(intentTaxonomy.pairCompatibility, seed.taxonomy.pairCompatibility);
    const t = scoreTaxonomyAlignment(intentTaxonomy, seed.taxonomy);

    // Weighted sum, normalize to 0-1
    const raw =
      f.score * SCORING_WEIGHTS.fatigueFit +
      w.score * SCORING_WEIGHTS.weatherFit +
      b.score * SCORING_WEIGHTS.budgetFit +
      n.score * SCORING_WEIGHTS.noveltyFit +
      p.score * SCORING_WEIGHTS.pairFit +
      t.score * SCORING_WEIGHTS.taxonomyAlignment;
    // raw range: roughly -1 to +1. Normalize to 0-1 with linear mapping: (raw + 1) / 2
    const totalScore = Math.min(Math.max((raw + 1) / 2, 0), 1);

    const breakdown: ActivityScoreBreakdown = {
      fatigueFit: f.score,
      weatherFit: w.score,
      budgetFit: b.score,
      noveltyFit: n.score,
      pairFit: p.score,
      taxonomyAlignment: t.score,
      totalScore,
    };

    const candidateReasons: ActivityCandidateReasonCode[] = [
      f.reason,
      w.reason,
      b.reason,
      n.reason,
      p.reason,
      t.reason,
    ];

    return { seed, scored: { breakdown, candidateReasons } };
  });

  // 6. Blocked / accepted 分類
  for (const ev of evaluations) {
    if (ev.blocked !== undefined) {
      blockedCandidates.push({
        seedId: ev.seed.seedId,
        blockedReasonCodes: ev.blocked,
      });
    }
  }

  // 7. accepted: threshold check + rank
  const acceptedCandidates: ActivityScoredCandidate[] = [];
  for (const ev of evaluations) {
    if (ev.scored === undefined) continue;
    if (ev.scored.breakdown.totalScore < threshold) {
      blockedCandidates.push({
        seedId: ev.seed.seedId,
        blockedReasonCodes: ["below_score_threshold"],
      });
      continue;
    }
    acceptedCandidates.push({
      seedId: ev.seed.seedId,
      name: ev.seed.name,
      taxonomy: ev.seed.taxonomy,
      scoreBreakdown: ev.scored.breakdown,
      rank: 0, // will be assigned after sort
      reasonCodes: [...ev.scored.candidateReasons, "above_score_threshold"],
    });
  }

  // 8. Sort by totalScore descending、tie-break by seedId (deterministic)
  acceptedCandidates.sort((a, b) => {
    if (b.scoreBreakdown.totalScore !== a.scoreBreakdown.totalScore) {
      return b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore;
    }
    // tie-break: seedId lexicographic
    return a.seedId.localeCompare(b.seedId);
  });

  // 9. maxCandidates 制限 + rank attach
  const limitedCandidates = acceptedCandidates.slice(0, maxCandidates);
  for (let i = 0; i < limitedCandidates.length; i++) {
    limitedCandidates[i].rank = i + 1;
  }

  // 10. overall reasonCodes
  if (limitedCandidates.length > 0) {
    reasonCodes.push("candidates_generated");
    if (limitedCandidates.length >= maxCandidates) {
      reasonCodes.push("max_candidates_reached");
    }
  } else {
    if (evaluations.every((e) => e.blocked !== undefined)) {
      reasonCodes.push("all_blocked");
    } else {
      reasonCodes.push("needs_more_candidates");
    }
  }

  const needsMoreCandidates = limitedCandidates.length < maxCandidates;
  if (needsMoreCandidates && limitedCandidates.length > 0) {
    reasonCodes.push("needs_more_candidates");
  }

  return {
    candidates: limitedCandidates,
    blockedCandidates,
    missingCandidateInputs,
    reasonCodes,
    needsMoreCandidates,
    generatorVersion: GENERATOR_VERSION,
  };
}

// ─────────────────────────────────────────────
// Helper: infer weather code from AD2 intent reasonCodes (pure)
// ─────────────────────────────────────────────

/**
 * AD2 intent output の reasonCodes から weather code を逆引き.
 *
 * AD2 output には raw weather code が含まれない (suggestedTaxonomy は taxonomy のみ)、
 * しかし reasonCodes (weather_dependent_warning / weather_independent_preferred /
 * weather_unknown_fallback) から weather context を復元できる。
 *
 * **構造的安全**:
 *   AD2 から direct に weather code を取得する API は存在しない (型レベルで強制)、
 *   reasonCodes 経由でのみ復元可能。caller が AD2 を skip して直接 raw weather を
 *   渡す path は **本 generator では受領しない** (raw text leakage 防止と同思想)。
 */
function inferWeatherCodeFromIntentReasons(
  intent: ActivityIntentOutput,
): "sunny" | "rainy" | "cloudy" | "unknown" | undefined {
  if (intent.reasonCodes.includes("weather_dependent_warning")) return "rainy";
  if (intent.reasonCodes.includes("weather_independent_preferred")) return "sunny"; // sunny or cloudy だが proxy で sunny
  if (intent.reasonCodes.includes("weather_unknown_fallback")) return "unknown";
  return undefined;
}
