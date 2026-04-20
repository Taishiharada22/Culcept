/**
 * Intent 用プロファイル取得（共通ヘルパー）
 *
 * intent-check / intent-translate 両APIで使用。
 * 11軸全て揃っている場合のみプロファイルを返す。
 *
 * データソース優先順位:
 *   1. personality_dimensions（確定値）
 *   2. stargazer_axis_snapshots（フォールバック、同一軸は平均値）
 *
 * 同一軸に複数の観測値がある場合は平均値を採用する。
 */

import type { IntentTranslationProfile } from "./types";
import { INTENT_TRANSLATION_AXES } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchIntentProfile(
  supabase: any,
  userId: string,
): Promise<IntentTranslationProfile | null> {
  const requiredAxes = INTENT_TRANSLATION_AXES.length; // 11

  // ── 1. personality_dimensions（確定観測） ──
  const { data: pdRows } = await supabase
    .from("personality_dimensions")
    .select("dimension, score")
    .eq("user_id", userId)
    .in("dimension", INTENT_TRANSLATION_AXES);

  const scores: Record<string, number> = {};

  // personality_dimensions が11軸全部揃っていればそれで確定
  if (pdRows && pdRows.length >= requiredAxes) {
    for (const row of pdRows as Array<{ dimension: string; score: number }>) {
      scores[row.dimension] = row.score;
    }
    return buildProfile(userId, scores);
  }

  // ── 2. stargazer_axis_snapshots（フォールバック） ──
  const { data: snapshots } = await supabase
    .from("stargazer_axis_snapshots")
    .select("axis_id, score")
    .eq("user_id", userId)
    .in("axis_id", INTENT_TRANSLATION_AXES)
    .order("created_at", { ascending: false });

  if (!snapshots || snapshots.length === 0) {
    // personality_dimensions にも部分的にしかない場合
    if (pdRows) {
      for (const row of pdRows as Array<{ dimension: string; score: number }>) {
        scores[row.dimension] = row.score;
      }
    }
    return Object.keys(scores).length >= requiredAxes
      ? buildProfile(userId, scores)
      : null;
  }

  // ── personality_dimensions の確定値を先に入れる ──
  if (pdRows) {
    for (const row of pdRows as Array<{ dimension: string; score: number }>) {
      scores[row.dimension] = row.score;
    }
  }

  // ── snapshots を軸ごとに集計 → 平均値を算出 ──
  const snapshotBuckets: Record<string, number[]> = {};
  for (const s of snapshots as Array<{ axis_id: string; score: number }>) {
    if (!(s.axis_id in scores)) {
      // personality_dimensions にない軸のみ snapshot から取る
      if (!snapshotBuckets[s.axis_id]) {
        snapshotBuckets[s.axis_id] = [];
      }
      snapshotBuckets[s.axis_id].push(s.score);
    }
  }

  // 軸ごとの平均値をスコアに反映
  for (const [axis, values] of Object.entries(snapshotBuckets)) {
    scores[axis] = values.reduce((a, b) => a + b, 0) / values.length;
  }

  if (Object.keys(scores).length < requiredAxes) return null;

  return buildProfile(userId, scores);
}

/** スコア辞書から IntentTranslationProfile を構築 */
function buildProfile(
  userId: string,
  scores: Record<string, number>,
): IntentTranslationProfile {
  return {
    userId,
    direct_vs_diplomatic: scores.direct_vs_diplomatic ?? 0,
    attachment_style: scores.attachment_style ?? 0,
    reassurance_need: scores.reassurance_need ?? 0,
    emotional_variability: scores.emotional_variability ?? 0,
    conflict_style: scores.conflict_style ?? 0,
    public_private_gap: scores.public_private_gap ?? 0,
    intimacy_pace: scores.intimacy_pace ?? 0,
    boundary_awareness: scores.boundary_awareness ?? 0,
    self_disclosure_depth: scores.self_disclosure_depth ?? 0,
    emotional_regulation: scores.emotional_regulation ?? 0,
    relational_investment: scores.relational_investment ?? 0,
  };
}
