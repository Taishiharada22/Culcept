import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { questionId, binaryChoice, responseTimeMs, confidenceSelfReport, reasonChipId, situationId } = body;

    if (!questionId || !binaryChoice) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Save observation
    const { error: insertError } = await supabase
      .from("stargazer_observations")
      .insert({
        user_id: user.id,
        question_id: questionId,
        answer: binaryChoice,
        response_time_ms: responseTimeMs || 0,
        confidence_self_report: confidenceSelfReport,
        reason_chip_id: reasonChipId,
        situation_id: situationId,
      });

    if (insertError) {
      console.error("Failed to save observation:", insertError);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    // Get updated count
    const { count } = await supabase
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    return NextResponse.json({
      ok: true,
      saved: true,
      observationCount: count || 0,
      message: "観測データを保存しました",
      dimensionsUpdated: [],
      liveSkyChanged: false,
    });
  } catch (error) {
    console.error("Failed to save observation:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
