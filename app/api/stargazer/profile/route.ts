import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get star map
    const { data: starMap } = await supabase
      .from("stargazer_star_maps")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // Get personality profile
    const { data: profile } = await supabase
      .from("stargazer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // Get resolved type
    const { data: resolvedType } = await supabase
      .from("stargazer_resolved_types")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // Get dimension details
    const { data: dimensions } = await supabase
      .from("stargazer_dimensions")
      .select("*")
      .eq("user_id", user.id)
      .order("score", { ascending: false });

    // Get observation stats
    const { data: observations } = await supabase
      .from("stargazer_observations")
      .select("response_time_ms, hesitation_score")
      .eq("user_id", user.id);

    const stats = observations && observations.length > 0
      ? {
          totalAnswered: observations.length,
          avgResponseTimeMs: observations.reduce((a, o) => a + (o.response_time_ms || 0), 0) / observations.length,
          fastAnswerCount: observations.filter((o) => (o.response_time_ms || 0) < 2000).length,
          slowAnswerCount: observations.filter((o) => (o.response_time_ms || 0) > 5000).length,
          avgHesitation: observations.reduce((a, o) => a + (o.hesitation_score || 0), 0) / observations.length,
        }
      : null;

    return NextResponse.json({
      ok: true,
      starMap: starMap || null,
      personalityProfile: profile || null,
      resolvedType: resolvedType || null,
      dimensionDetails: dimensions || [],
      observationStats: stats,
    });
  } catch (error) {
    console.error("Failed to get profile:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
