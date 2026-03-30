import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// POST /api/rendezvous/[candidateId]/deepening/complete
// 深化ミッション完了を記録
// =============================================================================

export async function POST(
  req: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { candidateId } = await params;
    const body = await req.json();
    const { missionId } = body as { missionId: string };

    if (!missionId) {
      return NextResponse.json({ ok: false, error: "Missing missionId" }, { status: 400 });
    }

    // 候補の参加者確認
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b")
      .eq("id", candidateId)
      .single();

    if (!candidate) {
      return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });
    }

    const isA = candidate.user_a === auth.user.id;
    const isB = candidate.user_b === auth.user.id;
    if (!isA && !isB) {
      return NextResponse.json({ ok: false, error: "Not a participant" }, { status: 403 });
    }

    const field = isA ? "completed_by_a" : "completed_by_b";

    const { error } = await supabaseAdmin
      .from("rendezvous_deepening_missions")
      .update({ [field]: true })
      .eq("id", missionId)
      .eq("candidate_id", candidateId);

    if (error) {
      console.error("[deepening/complete] Error:", error);
      return NextResponse.json({ ok: false, error: "Failed to complete" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, completed: true });
  } catch (err) {
    console.error("[deepening/complete] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
