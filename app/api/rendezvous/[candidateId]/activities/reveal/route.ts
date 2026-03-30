import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RouteCtx = { params: Promise<{ candidateId: string }> };

/**
 * POST /api/rendezvous/[candidateId]/activities/reveal
 * 同時開示: revealed = true にする
 */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { candidateId } = await ctx.params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify user is part of candidate
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b")
      .eq("id", candidateId)
      .single();

    if (!candidate || (candidate.user_a !== user.id && candidate.user_b !== user.id))
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const { activityId } = body as { activityId: string };

    // Verify activity exists and both answered
    const { data: activity } = await supabaseAdmin
      .from("rendezvous_activities")
      .select("*")
      .eq("id", activityId)
      .eq("candidate_id", candidateId)
      .single();

    if (!activity)
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });

    if (!activity.user_a_answer || !activity.user_b_answer)
      return NextResponse.json({ error: "Both answers required" }, { status: 400 });

    if (activity.revealed)
      return NextResponse.json({ ok: true, already: true });

    // Reveal
    const { error } = await supabaseAdmin
      .from("rendezvous_activities")
      .update({ revealed: true })
      .eq("id", activityId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[activities/reveal] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
