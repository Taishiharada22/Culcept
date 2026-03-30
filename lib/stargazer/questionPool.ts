import "server-only";

// lib/stargazer/questionPool.ts
// プール選択ロジック — 多次元質問プールから最適な質問を選択

import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuestionVariant } from "./questionVariants";
import { ALL_QUESTION_VARIANTS } from "./questionVariants";
import type {
  QuestionSelectionCriteria,
  SubjectContext,
  EnergyTarget,
  PoolQuestion,
} from "./questionPoolTypes";
import type { BeliefSet } from "./bayesianAxisUpdater";
import { computeSingleAxisEIG, estimateEvidencePrecision } from "./informationGain";

// ═══ State → Dimension Mapping ═══

interface ObservationStateInput {
  energy?: string;
  emotion?: string;
  social?: string;
}

/**
 * Map user's current observation state to pool dimensions.
 * Used to select context-appropriate questions.
 */
export function mapStateToPoolDimensions(state: ObservationStateInput | null): {
  energyTarget: EnergyTarget;
  preferredSubjects: SubjectContext[];
} {
  if (!state) {
    return { energyTarget: "neutral", preferredSubjects: ["self"] };
  }

  // Map energy
  let energyTarget: EnergyTarget = "neutral";
  switch (state.energy) {
    case "very_high":
    case "high":
      energyTarget = "high_energy";
      break;
    case "moderate":
      energyTarget = "neutral";
      break;
    case "low":
    case "very_low":
      energyTarget = "low_energy";
      break;
  }

  if (state.emotion === "anxious" || state.emotion === "frustrated") {
    energyTarget = "stressed";
  } else if (state.emotion === "calm" || state.emotion === "joyful") {
    energyTarget = "relaxed";
  } else if (state.emotion === "tired" && energyTarget === "neutral") {
    energyTarget = "low_energy";
  }

  // Map social context to preferred subjects
  let preferredSubjects: SubjectContext[] = ["self"];
  switch (state.social) {
    case "many_people":
      preferredSubjects = [
        "self",
        "coworkers",
        "acquaintances",
        "strangers",
        "authority",
      ];
      break;
    case "few_people":
      preferredSubjects = [
        "self",
        "friends",
        "romantic_partner",
        "family",
        "coworkers",
      ];
      break;
    case "alone":
      preferredSubjects = ["self", "family", "romantic_partner"];
      break;
  }

  return { energyTarget, preferredSubjects };
}

// ═══ Recently Shown Keys ═══

/**
 * Get question keys the user has seen in the last N days.
 */
export async function getRecentlyShownKeys(
  userId: string,
  days: number,
  supabase: SupabaseClient,
): Promise<string[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data } = await supabase
    .from("stargazer_question_shown")
    .select("question_key")
    .eq("user_id", userId)
    .gte("shown_at", cutoff.toISOString().split("T")[0]);

  if (!data || data.length === 0) return [];
  return data.map((row) => row.question_key);
}

// ═══ Record Usage ═══

/**
 * Record that a pool question was served to a user.
 * The RPC keeps question_pool.times_shown in sync.
 */
export async function recordQuestionServed(
  userId: string,
  questionKey: string,
  supabase: SupabaseClient,
  shownAtDate?: string,
  options?: {
    deliverySource?: string | null;
    servedContext?: Record<string, unknown> | null;
  },
): Promise<void> {
  const today = shownAtDate ?? new Date().toISOString().split("T")[0];
  const { error } = await supabase.rpc("record_pool_question_shown", {
    p_user_id: userId,
    p_question_key: questionKey,
    p_shown_at: today,
    p_delivery_source: options?.deliverySource ?? null,
    p_served_context: options?.servedContext ?? {},
  });

  if (!error) return;

  console.warn(
    "[questionPool] RPC record_pool_question_shown unavailable, using fallback:",
    error.message,
  );

  const enrichedFallback = await supabase.from("stargazer_question_shown").upsert(
    {
      user_id: userId,
      question_key: questionKey,
      shown_at: today,
      answered: false,
      delivery_source: options?.deliverySource ?? null,
      served_context: options?.servedContext ?? {},
    },
    { onConflict: "user_id,question_key,shown_at" },
  );

  if (!enrichedFallback.error) return;

  await supabase.from("stargazer_question_shown").upsert(
    {
      user_id: userId,
      question_key: questionKey,
      shown_at: today,
      answered: false,
    },
    { onConflict: "user_id,question_key,shown_at" },
  );
}

// ═══ Pool Selection ═══

interface RankedCandidate {
  variant: QuestionVariant;
  score: number;
}

/**
 * Select questions from the pool matching criteria.
 * Falls back to hardcoded variants if pool is empty/insufficient.
 */
export async function selectFromPool(
  criteria: QuestionSelectionCriteria,
  supabase: SupabaseClient,
): Promise<QuestionVariant[]> {
  const limit = criteria.limit ?? 5;
  const minQuality = criteria.minQuality ?? 0.2;

  // Query pool for this axis
  let query = supabase
    .from("stargazer_question_pool")
    .select("question_key, variant_json, subject, energy_target, phrasing_style, angle, quality_score, times_shown, question_status, primary_lens_id")
    .eq("axis_id", criteria.axisId)
    .eq("is_active", true)
    .gte("quality_score", minQuality)
    .order("quality_score", { ascending: false })
    .limit(200); // fetch enough candidates for scoring

  if (criteria.layer) {
    query = query.eq("observation_layer", criteria.layer);
  }
  // Lens filter: hard requirement for deep questions, soft preference for state/context
  if (criteria.preferredLensIds?.length && criteria.layer !== "state" && criteria.layer !== "context_bound") {
    query = query.in("primary_lens_id", criteria.preferredLensIds);
  }
  if (criteria.preferredProbeTypes?.length) {
    query = query.in("probe_type", criteria.preferredProbeTypes);
  }
  if (criteria.maxDepth) {
    query = query.lte("depth_score", criteria.maxDepth);
  }

  const { data: poolRows, error } = await query;

  if (error || !poolRows || poolRows.length === 0) {
    return []; // Caller falls back to hardcoded
  }

  // Exclude recently shown
  const excludeSet = new Set(criteria.excludeQuestionKeys ?? []);

  // Score each candidate
  const candidates: RankedCandidate[] = [];

  for (const row of poolRows) {
    if (excludeSet.has(row.question_key)) continue;

    const variant = row.variant_json as QuestionVariant;
    if (!variant || !variant.prompt) continue;

    let matchScore = 0;

    // Quality weight (0-0.4)
    matchScore += (row.quality_score ?? 0.5) * 0.4;

    // Subject match (0-0.25)
    if (criteria.preferredSubjects?.includes(row.subject)) {
      matchScore += 0.25;
    } else if (row.subject === "self") {
      matchScore += 0.1; // self is always somewhat relevant
    }

    // Energy match (0-0.15)
    if (criteria.preferredEnergy && row.energy_target === criteria.preferredEnergy) {
      matchScore += 0.15;
    } else if (row.energy_target === "neutral") {
      matchScore += 0.05;
    }

    // Style diversity bonus (0-0.1)
    if (criteria.preferredStyles?.includes(row.phrasing_style)) {
      matchScore += 0.1;
    }

    // Angle match bonus (0-0.1)
    if (criteria.preferredAngles?.includes(row.angle)) {
      matchScore += 0.1;
    }

    // Novelty bonus: less-shown questions get a boost (0-0.1)
    const timesShown = row.times_shown ?? 0;
    matchScore += Math.max(0, 0.1 - timesShown * 0.005);

    // Lens match bonus for state/context (0-0.1)
    if (criteria.preferredLensIds?.length) {
      const lensId = row.primary_lens_id as string | null;
      if (lensId && criteria.preferredLensIds.includes(lensId)) {
        matchScore += 0.1;
      }
    }

    // Cooling penalty
    const statusPenalty = (row as Record<string, unknown>).question_status === "cooling" ? 0.5 : 1.0;
    matchScore *= statusPenalty;

    candidates.push({ variant, score: matchScore });
  }

  if (candidates.length === 0) return [];

  // Sort by score descending, then add deterministic daily shuffle for variety
  const today = new Date().toISOString().split("T")[0];
  candidates.sort((a, b) => {
    const diff = b.score - a.score;
    if (Math.abs(diff) > 0.05) return diff;
    // Tie-break with daily hash
    const seed = criteria.userSeed ?? "";
    return (
      dailyHash(`${seed}:${a.variant.id}:${today}`) -
      dailyHash(`${seed}:${b.variant.id}:${today}`)
    );
  });

  // Ensure axis diversity: max 1 question per axis (though criteria already filters by axis)
  // Select top N
  return candidates.slice(0, limit).map((c) => c.variant);
}

/**
 * Select questions across multiple axes from the pool.
 * This is the main entry point for the daily orchestrator.
 */
export async function selectMultiAxisFromPool(
  axisIds: string[],
  targetCount: number,
  excludeKeys: string[],
  preferredEnergy: EnergyTarget | undefined,
  preferredSubjects: SubjectContext[] | undefined,
  supabase: SupabaseClient,
  userSeed?: string,
  preferredLensIds?: string[],
  beliefs?: BeliefSet,
): Promise<QuestionVariant[]> {
  const selected: QuestionVariant[] = [];
  const usedAxes = new Set<string>();

  // EIG ベース: beliefs がある場合は情報利得順で軸を並べ替え
  // フォールバック: daily hash で variety を確保
  const today = new Date().toISOString().split("T")[0];
  const shuffled = beliefs
    ? [...axisIds].sort((a, b) => {
        const aKey = a as import("./traitAxes").TraitAxisKey;
        const bKey = b as import("./traitAxes").TraitAxisKey;
        const aPrec = beliefs[aKey]?.precision ?? 0.5;
        const bPrec = beliefs[bKey]?.precision ?? 0.5;
        const evid = estimateEvidencePrecision(0.4);
        const aEIG = computeSingleAxisEIG(aPrec, evid);
        const bEIG = computeSingleAxisEIG(bPrec, evid);
        // EIG 降順（最大利得の軸を先頭に）
        return bEIG - aEIG;
      })
    : [...axisIds].sort(
        (a, b) =>
          dailyHash(`${userSeed ?? ""}:${a}:${today}`) -
          dailyHash(`${userSeed ?? ""}:${b}:${today}`),
      );

  for (const axisId of shuffled) {
    if (selected.length >= targetCount) break;
    if (usedAxes.has(axisId)) continue;

    const results = await selectFromPool(
      {
        axisId: axisId as import("./traitAxes").TraitAxisKey,
        layer: "state",
        preferredSubjects,
        preferredEnergy,
        preferredLensIds,
        excludeQuestionKeys: excludeKeys,
        minQuality: 0.2,
        limit: 1,
        userSeed,
      },
      supabase,
    );

    if (results.length > 0) {
      selected.push(results[0]);
      usedAxes.add(axisId);
    }
  }

  // Second pass: fill remaining slots (allow same axis if needed)
  if (selected.length < targetCount) {
    for (const axisId of shuffled) {
      if (selected.length >= targetCount) break;

      const results = await selectFromPool(
        {
          axisId: axisId as import("./traitAxes").TraitAxisKey,
          layer: "context_bound",
          preferredSubjects: preferredSubjects?.filter((s) => s !== "self"),
          preferredEnergy,
          preferredLensIds,
          excludeQuestionKeys: [
            ...excludeKeys,
            ...selected.map((s) => s.id),
          ],
          minQuality: 0.2,
          limit: 1,
          userSeed,
        },
        supabase,
      );

      if (results.length > 0) {
        selected.push(results[0]);
      }
    }
  }

  return selected;
}

// ═══ Pool Statistics ═══

export async function getPoolStats(supabase: SupabaseClient): Promise<{
  totalActive: number;
  byAxis: Record<string, number>;
  bySubject: Record<string, number>;
  byStyle: Record<string, number>;
  byLens: Record<string, number>;
  byProbeType: Record<string, number>;
  byDepth: Record<number, number>;
  avgQuality: number;
}> {
  const { data } = await supabase
    .from("stargazer_question_pool")
    .select("axis_id, subject, phrasing_style, quality_score, primary_lens_id, probe_type, depth_score")
    .eq("is_active", true);

  if (!data || data.length === 0) {
    return {
      totalActive: 0,
      byAxis: {},
      bySubject: {},
      byStyle: {},
      byLens: {},
      byProbeType: {},
      byDepth: {},
      avgQuality: 0,
    };
  }

  const byAxis: Record<string, number> = {};
  const bySubject: Record<string, number> = {};
  const byStyle: Record<string, number> = {};
  const byLens: Record<string, number> = {};
  const byProbeType: Record<string, number> = {};
  const byDepth: Record<number, number> = {};
  let totalQuality = 0;

  for (const row of data) {
    byAxis[row.axis_id] = (byAxis[row.axis_id] || 0) + 1;
    bySubject[row.subject] = (bySubject[row.subject] || 0) + 1;
    byStyle[row.phrasing_style] = (byStyle[row.phrasing_style] || 0) + 1;
    totalQuality += row.quality_score ?? 0.5;

    const lensId = row.primary_lens_id as string | null;
    if (lensId) {
      byLens[lensId] = (byLens[lensId] || 0) + 1;
    }
    const probeType = (row.probe_type as string) ?? "surface";
    byProbeType[probeType] = (byProbeType[probeType] || 0) + 1;
    const depth = (row.depth_score as number) ?? 1;
    byDepth[depth] = (byDepth[depth] || 0) + 1;
  }

  return {
    totalActive: data.length,
    byAxis,
    bySubject,
    byStyle,
    byLens,
    byProbeType,
    byDepth,
    avgQuality: totalQuality / data.length,
  };
}

// ═══ Helpers ═══

function dailyHash(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// ═══ Adaptive Weighted Estimation (AWE): 標準誤差 & 情報利得 ═══
// 注: 本システムは IRT (項目応答理論) そのものではなく、
// 標準誤差に基づく適応型重み付け推定を行う独自アルゴリズムである。

export interface AxisStandardError {
  axisId: string;
  se: number;
  observationCount: number;
  isLowPrecision: boolean;
}

/**
 * Calculate standard error for a single axis.
 * SE = σ / √n where σ is std deviation of scores and n is observation count.
 * If n < 2, returns SE = 1.0 (maximum uncertainty).
 */
export function calcAxisSE(observations: number[]): number {
  if (observations.length < 2) return 1.0;
  const n = observations.length;
  const mean = observations.reduce((s, v) => s + v, 0) / n;
  const variance = observations.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  return stdDev / Math.sqrt(n);
}

/**
 * Calculate SE for all axes given score history.
 * Returns sorted by SE descending (least precise first).
 */
export function calcAllAxisSE(
  scoreHistory: Record<string, number[]>,
): AxisStandardError[] {
  const results: AxisStandardError[] = [];
  for (const [axisId, scores] of Object.entries(scoreHistory)) {
    const se = calcAxisSE(scores);
    results.push({
      axisId,
      se,
      observationCount: scores.length,
      isLowPrecision: se > 0.3,
    });
  }
  return results.sort((a, b) => b.se - a.se);
}

/**
 * Expected information gain if we ask a question targeting this axis.
 * Higher SE axes yield more information gain.
 * Formula: informationGain = SE² (variance reduction proportional to current uncertainty)
 */
export function expectedInfoGain(
  axisId: string,
  axisSEMap: Record<string, number>,
): number {
  const se = axisSEMap[axisId] ?? 0.5;
  return se * se;
}

/**
 * Enhanced scoring that adds information gain to the standard match score.
 * Used by dailyOrchestrator to prioritize axes with high uncertainty.
 */
export function addInfoGainToScore(
  baseScore: number,
  axisId: string,
  axisSEMap: Record<string, number>,
  infoGainWeight: number = 0.2,
): number {
  const gain = expectedInfoGain(axisId, axisSEMap);
  return baseScore + gain * infoGainWeight;
}
