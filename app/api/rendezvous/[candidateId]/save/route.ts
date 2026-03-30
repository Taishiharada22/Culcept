import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyCandidateBelongsToUser } from "@/lib/rendezvous/helpers";

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

    // Use supabaseAdmin for all DB operations (cross-user reads bypass RLS)
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

    const { myState } = result;
    const now = new Date().toISOString();

    // Cannot save if already passed or expired
    if (myState.state === "passed" || myState.state === "expired") {
      return NextResponse.json(
        { ok: false, error: `Cannot save from state: ${myState.state}` },
        { status: 400 },
      );
    }

    // Update my user_state to saved
    const { error: saveErr } = await supabaseAdmin
      .from("rendezvous_user_states")
      .update({
        state: "saved",
        saved_at: now,
      })
      .eq("id", myState.id);

    if (saveErr)
      return NextResponse.json(
        { ok: false, error: saveErr.message },
        { status: 500 },
      );

    // Log the event
    await supabaseAdmin.from("rendezvous_candidate_logs").insert({
      candidate_id: candidateId,
      event_type: "saved",
      payload: { user_id: userId },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[rendezvous/save] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
