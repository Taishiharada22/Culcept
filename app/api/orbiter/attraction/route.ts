import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeAttractionProfile } from "@/lib/orbiter/attractionDiscovery";
import { loadLikeHistory } from "@/lib/orbiter/signalAccumulator";

/**
 * GET /api/orbiter/attraction
 * ユーザーの AttractionProfile を計算して返す。
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const userId = auth.user.id;

    // 並列取得: preferences + like history
    const [prefsResult, likeHistory] = await Promise.all([
      supabaseAdmin
        .from("rendezvous_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      loadLikeHistory(supabaseAdmin, userId),
    ]);

    const profile = computeAttractionProfile({
      statedPreferences: prefsResult.data ?? null,
      likeHistory,
    });

    return NextResponse.json({ ok: true, attractionProfile: profile });
  } catch (err: any) {
    console.error("[orbiter/attraction] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
