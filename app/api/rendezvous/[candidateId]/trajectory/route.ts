import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildTrajectoryInfo,
  milestoneToSignal,
  nudgeFeedbackToSignal,
  type ScoreSignal,
} from "@/lib/rendezvous/livingScore";

/**
 * GET /api/rendezvous/[candidateId]/trajectory
 * Living Score + スパークライン + 方向性を返す
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify access
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, overall_score, state")
      .eq("id", candidateId)
      .single();

    if (!candidate)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (candidate.user_a !== user.id && candidate.user_b !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Gather signals from multiple sources
    const signals: ScoreSignal[] = [];

    // 1. Score history
    const { data: history } = await supabaseAdmin
      .from("rendezvous_score_history")
      .select("score, computed_at")
      .eq("candidate_id", candidateId)
      .order("computed_at", { ascending: false })
      .limit(14);

    // 2. Chat milestones → signals
    const { data: milestones } = await supabaseAdmin
      .from("rendezvous_chat_milestones")
      .select("milestone_type, reached_at")
      .eq("candidate_id", candidateId);

    for (const m of milestones ?? []) {
      signals.push(milestoneToSignal(m.milestone_type, m.reached_at));
    }

    // 3. Nudge feedback → signals
    const { data: nudges } = await supabaseAdmin
      .from("rendezvous_growth_nudges")
      .select("feedback, created_at")
      .eq("candidate_id", candidateId)
      .eq("user_id", user.id)
      .not("feedback", "is", null);

    for (const n of nudges ?? []) {
      if (n.feedback === "helpful" || n.feedback === "not_relevant") {
        signals.push(nudgeFeedbackToSignal(n.feedback, n.created_at));
      }
    }

    const trajectory = buildTrajectoryInfo(
      candidate.overall_score ?? 0.7,
      signals,
      (history ?? []).map((h) => ({
        score: Number(h.score),
        computed_at: h.computed_at,
      })),
    );

    return NextResponse.json({ ok: true, trajectory });
  } catch (err: any) {
    console.error("[trajectory] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
