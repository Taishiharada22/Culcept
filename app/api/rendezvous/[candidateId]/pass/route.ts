import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getCounterpartId,
  normalizeUserPair,
  verifyCandidateBelongsToUser,
} from "@/lib/rendezvous/helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    // Auth via supabaseServer (user-scoped)
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const { candidateId } = await params;
    const userId = auth.user.id;

    // Use supabaseAdmin for all DB operations (cross-user reads, suppression inserts bypass RLS)
    const result = await verifyCandidateBelongsToUser(
      supabaseAdmin,
      candidateId,
      userId,
    );

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Candidate not found" },
        { status: 404 },
      );
    }

    const { candidate, myState } = result;
    const counterpartId = getCounterpartId(candidate, userId);
    const now = new Date().toISOString();

    // Cannot pass if already passed/expired
    if (myState.state === "passed" || myState.state === "expired") {
      return NextResponse.json(
        { ok: false, error: `Cannot pass from state: ${myState.state}` },
        { status: 400 },
      );
    }

    // Update my user_state to passed
    const { error: passErr } = await supabaseAdmin
      .from("rendezvous_user_states")
      .update({
        state: "passed",
        passed_at: now,
      })
      .eq("id", myState.id);

    if (passErr)
      return NextResponse.json(
        { ok: false, error: passErr.message },
        { status: 500 },
      );

    // Create suppression (pass_cooldown, 30 days) - requires admin (no RLS insert policy)
    const [userLow, userHigh] = normalizeUserPair(userId, counterpartId);
    const cooldownUntil = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await supabaseAdmin.from("rendezvous_suppressions").insert({
      user_low: userLow,
      user_high: userHigh,
      suppression_type: "pass_cooldown",
      until_at: cooldownUntil,
    });

    // Check if both users have passed (cross-user read requires admin)
    const { data: counterpartState } = await supabaseAdmin
      .from("rendezvous_user_states")
      .select("state")
      .eq("candidate_id", candidateId)
      .eq("user_id", counterpartId)
      .single();

    if (counterpartState?.state === "passed") {
      // Both passed -> dismiss candidate
      await supabaseAdmin
        .from("rendezvous_candidates")
        .update({ state: "dismissed" })
        .eq("id", candidateId);
    }

    // Log the event
    await supabaseAdmin.from("rendezvous_candidate_logs").insert({
      candidate_id: candidateId,
      event_type: "passed",
      payload: { user_id: userId },
    });

    // Orbiter Signal: Pass
    const seenAt = myState.seen_at
      ? new Date(myState.seen_at).getTime()
      : null;
    const timeToDecisionMs = seenAt ? Date.now() - seenAt : null;
    await supabaseAdmin
      .from("orbiter_signals")
      .insert({
        user_id: userId,
        candidate_id: candidateId,
        signal_type: "pass",
        payload: { decision: "pass", timeToDecisionMs },
      }); // fire-and-forget

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[rendezvous/pass] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
