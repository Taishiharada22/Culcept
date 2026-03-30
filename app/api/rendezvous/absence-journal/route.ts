import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildAbsenceJournal,
  generateWelcomeBack,
  shouldShowJournal,
} from "@/lib/rendezvous/absenceJournal";
import type { JourneyEvent } from "@/lib/rendezvous/avatarVitality";

// =============================================================================
// GET /api/rendezvous/absence-journal
// Returns absence journal + welcome back ritual for returning users
// =============================================================================

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const userId = auth.user.id;

    // Get lastVisit from query param (stored client-side in localStorage)
    const url = new URL(req.url);
    const lastVisit = url.searchParams.get("lastVisit");

    // Check if journal should be shown
    if (!shouldShowJournal(lastVisit)) {
      return NextResponse.json({
        ok: true,
        showJournal: false,
        journal: null,
        welcomeBack: null,
      });
    }

    const absenceStart = lastVisit!;
    const absenceEnd = new Date().toISOString();

    // Query avatar_journey_events during the absence period
    const { data: eventsRaw } = await supabaseAdmin
      .from("avatar_journey_events")
      .select("id, event_type, emotion_state, narrative_ja, candidate_id, time_slot, created_at")
      .eq("user_id", userId)
      .gte("created_at", absenceStart)
      .lte("created_at", absenceEnd)
      .order("created_at", { ascending: true })
      .limit(100);

    const events: JourneyEvent[] = (eventsRaw ?? []).map((e: any) => ({
      id: e.id,
      eventType: e.event_type,
      emotion: e.emotion_state,
      narrative: e.narrative_ja ?? "",
      candidateId: e.candidate_id ?? undefined,
      timeSlot: e.time_slot ?? "",
      createdAt: e.created_at,
    }));

    // Build journal and welcome back ritual
    const journal = buildAbsenceJournal(events, absenceStart, absenceEnd);
    const welcomeBack = generateWelcomeBack(
      journal,
      journal.period.durationHours,
    );

    return NextResponse.json({
      ok: true,
      showJournal: true,
      journal,
      welcomeBack,
    });
  } catch (err: unknown) {
    console.error("[rendezvous/absence-journal]", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
