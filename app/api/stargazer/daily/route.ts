import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get today's observation progress
    const today = new Date().toISOString().split("T")[0];
    const { data: todayObs } = await supabase
      .from("stargazer_observations")
      .select("id, question_id, answer, created_at")
      .eq("user_id", user.id)
      .gte("created_at", `${today}T00:00:00`)
      .order("created_at", { ascending: false });

    // Get total observation count
    const { count: totalCount } = await supabase
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    // Get available questions
    const { data: questions } = await supabase
      .from("stargazer_questions")
      .select("*")
      .order("sort_order", { ascending: true });

    // Determine phase
    const total = totalCount || 0;
    let phase: string;
    if (total === 0) phase = "core";
    else if (total < 15) phase = "initial";
    else if ((todayObs?.length || 0) >= 5) phase = "completed";
    else phase = "daily";

    // Get next question (not answered today)
    const answeredToday = new Set((todayObs || []).map((o) => o.question_id));
    const unanswered = (questions || []).filter((q) => !answeredToday.has(q.id));

    return NextResponse.json({
      ok: true,
      phase,
      todayCount: todayObs?.length || 0,
      totalCount: total,
      currentQuestion: unanswered[0] || null,
      remainingToday: Math.max(0, 5 - (todayObs?.length || 0)),
    });
  } catch (error) {
    console.error("Failed to get daily observations:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
