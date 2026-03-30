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

    // Use supabaseAdmin for all DB operations (suppression inserts, cross-user ops bypass RLS)
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

    const { candidate } = result;
    const counterpartId = getCounterpartId(candidate, userId);
    const [userLow, userHigh] = normalizeUserPair(userId, counterpartId);

    // Step 1: Create block record
    const { error: blockErr } = await supabaseAdmin
      .from("rendezvous_blocks")
      .upsert(
        {
          blocker_user_id: userId,
          blocked_user_id: counterpartId,
        },
        { onConflict: "blocker_user_id,blocked_user_id" },
      );

    if (blockErr)
      return NextResponse.json(
        { ok: false, error: blockErr.message },
        { status: 500 },
      );

    // Step 2: Close all active candidates between these two users
    // Candidates where (user_a, user_b) match the pair in either order
    // Since user_a < user_b constraint, we use normalized pair
    const { error: closeErr } = await supabaseAdmin
      .from("rendezvous_candidates")
      .update({ state: "dismissed" })
      .eq("user_a", userLow)
      .eq("user_b", userHigh)
      .not("state", "in", "(expired,dismissed)");

    if (closeErr) {
      console.error(
        "[rendezvous/block] failed to close candidates:",
        closeErr,
      );
    }

    // Step 3: Create hide_forever suppression - requires admin (no RLS insert policy)
    const { error: suppressErr } = await supabaseAdmin
      .from("rendezvous_suppressions")
      .insert({
        user_low: userLow,
        user_high: userHigh,
        suppression_type: "hide_forever",
        until_at: null, // forever
      });

    if (suppressErr) {
      console.error(
        "[rendezvous/block] failed to create suppression:",
        suppressErr,
      );
    }

    // Log the event
    await supabaseAdmin.from("rendezvous_candidate_logs").insert({
      candidate_id: candidateId,
      event_type: "blocked",
      payload: { blocker: userId, blocked: counterpartId },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[rendezvous/block] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
