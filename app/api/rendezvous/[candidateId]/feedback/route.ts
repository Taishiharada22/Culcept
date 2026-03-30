import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/rendezvous/[candidateId]/feedback
 * Submit match quality feedback (positive / neutral / negative).
 * Stored in orbiter_signals for algorithm learning.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { sentiment, milestone } = body;

    if (!sentiment || !["positive", "neutral", "negative"].includes(sentiment)) {
      return NextResponse.json(
        { error: "sentiment (positive/neutral/negative) required" },
        { status: 400 },
      );
    }

    // Verify candidate belongs to this user
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b")
      .eq("id", candidateId)
      .single();

    if (!candidate) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (candidate.user_a !== user.id && candidate.user_b !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Insert signal for algorithm learning
    await supabaseAdmin.from("orbiter_signals").insert({
      user_id: user.id,
      candidate_id: candidateId,
      signal_type: "match_quality_feedback",
      payload: {
        sentiment,
        milestone: milestone ?? "manual",
        timestamp: new Date().toISOString(),
      },
    });

    // Log for analytics
    await supabaseAdmin.from("rendezvous_candidate_logs").insert({
      candidate_id: candidateId,
      event_type: "quality_feedback",
      payload: {
        user_id: user.id,
        sentiment,
        milestone: milestone ?? "manual",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[rendezvous/feedback] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
