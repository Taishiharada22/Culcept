import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeProfileStrength } from "@/lib/rendezvous/profileStrength";

export const runtime = "nodejs";

/**
 * GET /api/rendezvous/profile-strength
 * プロフィール強度を算出（10項目 × 重み付き）
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 並行でデータ取得
    const [
      profileRes,
      prefsRes,
      photosRes,
      stargazerRes,
      attachmentRes,
      progressiveRes,
      originRes,
      activityRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("rendezvous_profiles")
        .select("bio, enabled_categories")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("rendezvous_preferences")
        .select("matching_vector")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("rendezvous_photos")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabaseAdmin
        .from("stargazer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .eq("context", "self")
        .maybeSingle(),
      supabaseAdmin
        .from("rendezvous_attachment_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("rendezvous_progressive_answers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabaseAdmin
        .from("origin_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("rendezvous_swipe_outcomes")
        .select("id")
        .eq("user_id", user.id)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle(),
    ]);

    const profile = profileRes.data;
    const prefs = prefsRes.data;
    const bio = (profile?.bio as string) ?? "";
    const enabledCategories = (profile?.enabled_categories as string[]) ?? [];

    const result = computeProfileStrength({
      hasPhoto: (photosRes.count ?? 0) > 0,
      photoCount: photosRes.count ?? 0,
      hasBio: bio.length > 0,
      bioLength: bio.length,
      hasEnabledCategories: enabledCategories.length > 0,
      enabledCategoryCount: enabledCategories.length,
      hasMatchingVector: !!prefs?.matching_vector,
      hasStargazerProfile: !!stargazerRes.data,
      hasAttachmentProfile: !!attachmentRes.data,
      hasProgressiveAnswers: (progressiveRes.count ?? 0) > 0,
      progressiveAnswerCount: progressiveRes.count ?? 0,
      hasOriginProfile: !!originRes.data,
      hasDailyActivity: !!activityRes.data,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("[rendezvous/profile-strength] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
