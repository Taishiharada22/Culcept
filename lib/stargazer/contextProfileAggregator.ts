import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TRAIT_AXIS_KEYS, type TraitAxisKey } from "./traitAxes";

// ============================================================
// Stargazer Context-Stratified Profile Aggregator
// stargazer_axis_snapshots から context 別に集計し、
// stargazer_context_profiles にupsert
// ============================================================

type AxisSnapshot = {
  axis_id: string;
  score: number;
  context: string | null;
  session_date: string;
};

/**
 * 指定ユーザーの全context別プロファイルを再集計
 */
export async function aggregateContextProfiles(userId: string): Promise<void> {
  // 全スナップショットを取得
  const { data: snapshots, error } = await supabaseAdmin
    .from("stargazer_axis_snapshots")
    .select("axis_id, score, context, session_date")
    .eq("user_id", userId)
    .order("session_date", { ascending: false });

  if (error || !snapshots || snapshots.length === 0) return;

  // context別にグループ化
  const contextGroups = new Map<string, AxisSnapshot[]>();

  for (const snap of snapshots) {
    const ctx = snap.context ?? "self";
    if (!contextGroups.has(ctx)) contextGroups.set(ctx, []);
    contextGroups.get(ctx)!.push({
      axis_id: snap.axis_id,
      score: Number(snap.score),
      context: ctx,
      session_date: snap.session_date,
    });
  }

  // 各contextごとに軸スコアを集計
  for (const [context, snaps] of contextGroups) {
    const axisScores = aggregateAxisScores(snaps);
    const observationCount = snaps.length;

    await supabaseAdmin
      .from("stargazer_context_profiles")
      .upsert(
        {
          user_id: userId,
          context,
          axis_scores: axisScores,
          observation_count: observationCount,
          last_updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,context" },
      );
  }
}

/**
 * スナップショット配列から軸別の加重平均スコアを算出
 * 新しい観測ほど重みが大きい（指数減衰）
 */
function aggregateAxisScores(
  snapshots: AxisSnapshot[],
): Record<string, number> {
  const DECAY_RATE = 0.95; // 1日あたりの減衰率
  const now = Date.now();

  // 軸別にスナップショットを集める
  const byAxis = new Map<string, { score: number; weight: number }[]>();

  for (const snap of snapshots) {
    if (!TRAIT_AXIS_KEYS.includes(snap.axis_id as TraitAxisKey)) continue;

    const daysSince = Math.max(
      0,
      (now - new Date(snap.session_date).getTime()) / (1000 * 60 * 60 * 24),
    );
    const weight = Math.pow(DECAY_RATE, daysSince);

    if (!byAxis.has(snap.axis_id)) byAxis.set(snap.axis_id, []);
    byAxis.get(snap.axis_id)!.push({ score: snap.score, weight });
  }

  // 加重平均
  const result: Record<string, number> = {};

  for (const [axisId, entries] of byAxis) {
    const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
    if (totalWeight === 0) continue;

    const weightedSum = entries.reduce(
      (sum, e) => sum + e.score * e.weight,
      0,
    );
    result[axisId] = Math.round((weightedSum / totalWeight) * 1000) / 1000;
  }

  return result;
}

/**
 * 特定contextのプロファイルを取得
 */
export async function getContextProfile(
  userId: string,
  context: string,
): Promise<Record<string, number> | null> {
  const { data } = await supabaseAdmin
    .from("stargazer_context_profiles")
    .select("axis_scores")
    .eq("user_id", userId)
    .eq("context", context)
    .maybeSingle();

  if (!data) return null;
  return data.axis_scores as Record<string, number>;
}

/**
 * ユーザーの全contextプロファイルを取得
 */
export async function getAllContextProfiles(
  userId: string,
): Promise<Record<string, Record<string, number>>> {
  const { data } = await supabaseAdmin
    .from("stargazer_context_profiles")
    .select("context, axis_scores")
    .eq("user_id", userId);

  if (!data) return {};

  const result: Record<string, Record<string, number>> = {};
  for (const row of data) {
    result[row.context] = row.axis_scores as Record<string, number>;
  }
  return result;
}
