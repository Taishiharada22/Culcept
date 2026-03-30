import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  computeFourHorsemenProfile,
  classifyConflictStyle,
  computeBidResponsiveness,
  computeGrowthVsDestiny,
  type StargazerAxesPartial,
} from "./relationshipProcess";

/**
 * Stargazer 45軸 → partner_process_profiles を同期
 *
 * Stargazer profile 更新時に呼ぶ。
 * すでに axis_scores が手元にある場合は直接渡してもよい。
 * なければ DB から取得する。
 *
 * @returns 算出結果。Stargazer データがなければ null。
 */
export async function syncProcessProfile(
  userId: string,
  axisScores?: StargazerAxesPartial,
): Promise<{
  fourHorsemenProfile: ReturnType<typeof computeFourHorsemenProfile>;
  conflictStyleProfile: ReturnType<typeof classifyConflictStyle>;
  bidResponsiveness: number;
  growthVsDestiny: number;
  sourceSnapshotId: string | null;
} | null> {
  let scores = axisScores;
  let snapshotId: string | null = null;

  if (!scores) {
    const { data } = await supabaseAdmin
      .from("stargazer_profiles")
      .select("id, axis_scores")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data?.axis_scores) return null;
    scores = data.axis_scores as Record<string, number>;
    snapshotId = data.id;
  }

  // 6次元を算出
  const fourHorsemenProfile = computeFourHorsemenProfile(scores);
  const conflictStyleProfile = classifyConflictStyle(scores);
  const bidResponsiveness = computeBidResponsiveness(scores);
  const growthVsDestiny = computeGrowthVsDestiny(scores);

  // Upsert
  const { error } = await supabaseAdmin
    .from("partner_process_profiles")
    .upsert(
      {
        user_id: userId,
        four_horsemen_profile: fourHorsemenProfile as unknown as Record<string, unknown>,
        conflict_style_profile: conflictStyleProfile as unknown as Record<string, unknown>,
        bid_responsiveness: bidResponsiveness,
        growth_vs_destiny: growthVsDestiny,
        source_snapshot_id: snapshotId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("[syncProcessProfile] upsert error:", error.message);
    return null;
  }

  return {
    fourHorsemenProfile,
    conflictStyleProfile,
    bidResponsiveness,
    growthVsDestiny,
    sourceSnapshotId: snapshotId,
  };
}
