/**
 * CoAlter L1: 個人理解 — 双方のプロフィールロード
 *
 * 既存の Intent Translation の fetchIntentProfile パターンを転用しつつ、
 * CoAlter固有のデータ（意思決定傾向、好み・趣味、アーキタイプ情報）を追加。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoAlterPersonProfile } from "./types";

// CoAlterが使用する personality_dimensions の軸
const COALTER_AXES = [
  // コミュニケーションスタイル
  "direct_vs_diplomatic",
  "conflict_style",
  "attachment_style",
  "reassurance_need",
  "emotional_variability",
  // 意思決定傾向
  "novelty_vs_tradition",
  "risk_tolerance",
  "decisive_vs_deliberate",
] as const;

/**
 * 1ユーザーの CoAlterPersonProfile をロードする。
 *
 * データソース:
 * - personality_dimensions: 45軸スコア
 * - profiles: 表示名
 * - life_profile_entries: 好み・趣味・価値観
 * - stargazer_users_unseen_map: アーキタイプ情報
 */
export async function loadCoAlterProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<CoAlterPersonProfile> {
  // 並列で全データソースを取得
  const [dimResult, profileResult, lifeResult, archetypeResult] =
    await Promise.all([
      // personality_dimensions
      supabase
        .from("personality_dimensions")
        .select("dimension, score")
        .eq("user_id", userId)
        .in("dimension", [...COALTER_AXES]),

      // profiles（表示名）
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .single(),

      // life_profile_entries（好み・趣味・価値観）
      supabase
        .from("life_profile_entries")
        .select("category, label")
        .eq("user_id", userId)
        .eq("is_active", true)
        .in("category", ["interest", "value", "passion"]),

      // stargazer_users_unseen_map（アーキタイプ）
      supabase
        .from("stargazer_users_unseen_map")
        .select("archetype_code, core_fear, core_desire")
        .eq("user_id", userId)
        .single(),
    ]);

  // personality_dimensions → scores map
  const scores: Record<string, number> = {};
  if (dimResult.data) {
    for (const row of dimResult.data as Array<{
      dimension: string;
      score: number;
    }>) {
      scores[row.dimension] = row.score;
    }
  }

  // life_profile_entries → interests/values
  const interests: string[] = [];
  const values: string[] = [];
  if (lifeResult.data) {
    for (const row of lifeResult.data as Array<{
      category: string;
      label: string;
    }>) {
      if (row.category === "interest" || row.category === "passion") {
        interests.push(row.label);
      } else if (row.category === "value") {
        values.push(row.label);
      }
    }
  }

  return {
    userId,
    displayName: profileResult.data?.display_name ?? null,

    communicationStyle: {
      directVsDiplomatic: scores.direct_vs_diplomatic ?? null,
      conflictStyle: scores.conflict_style ?? null,
      attachmentStyle: scores.attachment_style ?? null,
      reassuranceNeed: scores.reassurance_need ?? null,
      emotionalVariability: scores.emotional_variability ?? null,
    },

    decisionStyle: {
      noveltyPreference: scores.novelty_vs_tradition ?? null,
      decisionSpeed: scores.decisive_vs_deliberate ?? null,
      riskTolerance: scores.risk_tolerance ?? null,
    },

    interests,
    values,

    archetypeCode: archetypeResult.data?.archetype_code ?? null,
    coreFear: archetypeResult.data?.core_fear ?? null,
    coreDesire: archetypeResult.data?.core_desire ?? null,
  };
}

/**
 * ペアの両方のプロフィールを並列ロードする。
 */
export async function loadPairProfiles(
  supabase: SupabaseClient,
  userAId: string,
  userBId: string,
): Promise<{ profileA: CoAlterPersonProfile; profileB: CoAlterPersonProfile }> {
  const [profileA, profileB] = await Promise.all([
    loadCoAlterProfile(supabase, userAId),
    loadCoAlterProfile(supabase, userBId),
  ]);
  return { profileA, profileB };
}
