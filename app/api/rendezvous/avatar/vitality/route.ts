import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildVitalityState } from "@/lib/rendezvous/avatarVitality";

// =============================================================================
// GET /api/rendezvous/avatar/vitality
// Returns the avatar's current vitality state (emotion, pulse, journey events).
// =============================================================================

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { data: events } = await supabaseAdmin
      .from("avatar_journey_events")
      .select("id, event_type, emotion_state, narrative_ja, candidate_id, time_slot, created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const mapped = (events || []).map((e: any) => ({
      id: e.id,
      eventType: e.event_type,
      emotion: e.emotion_state,
      narrative: e.narrative_ja,
      candidateId: e.candidate_id,
      timeSlot: e.time_slot,
      createdAt: e.created_at,
    }));

    const vitality = buildVitalityState(mapped);
    return NextResponse.json({ ok: true, vitality });
  } catch (err: unknown) {
    console.error("[rendezvous/avatar/vitality]", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
