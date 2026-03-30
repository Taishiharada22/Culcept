import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/rendezvous/[candidateId]/metamorphosis
 * Fetch undelivered metamorphosis signals for this candidate.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch undelivered signals
  const { data: signals, error } = await supabaseAdmin
    .from("relationship_metamorphosis_signals")
    .select("id, signal_type, direction, magnitude, whisper_ja, data_snapshot, created_at")
    .eq("candidate_id", candidateId)
    .eq("user_id", user.id)
    .is("delivered_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mark as delivered (fire-and-forget)
  if (signals && signals.length > 0) {
    const ids = signals.map((s) => s.id);
    void supabaseAdmin
      .from("relationship_metamorphosis_signals")
      .update({ delivered_at: new Date().toISOString() })
      .in("id", ids)
      .then(() => { /* fire-and-forget */ }, console.error);
  }

  return NextResponse.json({
    signals: (signals ?? []).map((s) => ({
      id: s.id,
      type: s.signal_type,
      direction: s.direction,
      magnitude: s.magnitude,
      whisperJa: s.whisper_ja,
      dataSnapshot: s.data_snapshot ?? {},
      createdAt: s.created_at,
    })),
  });
}

/**
 * PATCH /api/rendezvous/[candidateId]/metamorphosis
 * Acknowledge a metamorphosis signal.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const signalId = body?.signalId;

  if (!signalId) {
    return NextResponse.json(
      { error: "signalId required" },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from("relationship_metamorphosis_signals")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", signalId)
    .eq("candidate_id", candidateId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
