import "server-only";

// lib/stargazer/questionQuality.ts
// 品質追跡 — 質問ごとの情報量・回答速度・分散をatomic更新

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Update quality metrics after a pool question is answered.
 * Uses atomic SQL to avoid race conditions with concurrent users.
 */
export async function updateQuestionQuality(
  questionKey: string,
  userId: string,
  score: number,
  responseTimeMs: number,
  supabase: SupabaseClient,
  shownAt?: string,
): Promise<void> {
  // Atomic increment + running average update
  const { error } = await supabase.rpc("update_pool_question_metrics", {
    p_user_id: userId,
    p_question_key: questionKey,
    p_score: score,
    p_response_time_ms: responseTimeMs,
    p_shown_at: shownAt ?? new Date().toISOString().split("T")[0],
  });

  if (error) {
    // Fallback: simple update if RPC doesn't exist yet
    console.warn(
      "[questionQuality] RPC not available, using simple update:",
      error.message,
    );
    await supabase.from("stargazer_question_shown").upsert(
      {
        user_id: userId,
        question_key: questionKey,
        shown_at: shownAt ?? new Date().toISOString().split("T")[0],
        answered: true,
        score,
        response_time_ms: responseTimeMs,
      },
      { onConflict: "user_id,question_key,shown_at" },
    );
    await supabase
      .from("stargazer_question_pool")
      .update({ updated_at: new Date().toISOString() })
      .eq("question_key", questionKey);
  }
}

/**
 * Batch update quality scores based on accumulated metrics.
 * Call periodically (e.g., daily) to recalculate composite quality.
 */
export async function recalculateQualityScores(
  supabase: SupabaseClient,
): Promise<{ updated: number }> {
  // Fetch questions with enough data to calculate quality
  const { data } = await supabase
    .from("stargazer_question_pool")
    .select(
      "question_key, times_shown, times_answered, avg_response_time_ms, score_variance",
    )
    .eq("is_active", true)
    .gte("times_answered", 3); // Need at least 3 answers

  if (!data || data.length === 0) return { updated: 0 };

  let updated = 0;

  for (const row of data) {
    const quality = computeQualityScore({
      timesShown: row.times_shown ?? 0,
      timesAnswered: row.times_answered ?? 0,
      avgResponseTimeMs: row.avg_response_time_ms ?? 5000,
      scoreVariance: row.score_variance ?? 0,
    });

    const { error } = await supabase
      .from("stargazer_question_pool")
      .update({
        quality_score: Math.round(quality * 1000) / 1000,
        updated_at: new Date().toISOString(),
      })
      .eq("question_key", row.question_key);

    if (!error) updated++;
  }

  return { updated };
}

/**
 * Compute composite quality score (0-1).
 *
 * Components:
 * - completion_rate (0.2): answered/shown ratio — higher is better
 * - response_speed (0.2): faster answers → more intuitive question
 * - score_balance (0.4): variance in scores → question discriminates well
 * - base (0.2): default quality floor
 */
function computeQualityScore(metrics: {
  timesShown: number;
  timesAnswered: number;
  avgResponseTimeMs: number;
  scoreVariance: number;
}): number {
  // Completion rate: answered / shown (0-1)
  const completionRate =
    metrics.timesShown > 0 ? metrics.timesAnswered / metrics.timesShown : 0.5;

  // Response speed: normalize to 0-1 (3s = ideal, >10s = poor)
  const avgMs = metrics.avgResponseTimeMs || 5000;
  const speedScore = Math.max(0, Math.min(1, 1 - (avgMs - 3000) / 10000));

  // Score balance: variance in answers (0 = everyone picks same, higher = discriminating)
  // Max useful variance for [-1,1] range is ~0.5
  const balanceScore = Math.min(1, (metrics.scoreVariance ?? 0) / 0.5);

  // Base quality floor
  const baseScore = 0.5;

  return (
    completionRate * 0.2 +
    speedScore * 0.2 +
    balanceScore * 0.4 +
    baseScore * 0.2
  );
}

/**
 * Identify low-quality questions that should be deactivated.
 */
export async function identifyLowQualityQuestions(
  supabase: SupabaseClient,
  threshold = 0.2,
): Promise<string[]> {
  const { data } = await supabase
    .from("stargazer_question_pool")
    .select("question_key")
    .eq("is_active", true)
    .lt("quality_score", threshold)
    .gte("times_answered", 10); // Only deactivate well-tested questions

  return data?.map((row) => row.question_key) ?? [];
}
