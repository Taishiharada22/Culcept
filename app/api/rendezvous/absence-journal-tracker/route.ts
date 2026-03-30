import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { generateAbsenceNarrative } from "@/lib/rendezvous/absenceTracker";

// =============================================================================
// GET /api/rendezvous/absence-journal-tracker
// Returns absence journal using the absenceTracker narrative engine
// =============================================================================

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const userId = user.id;
    const url = new URL(req.url);
    const lastVisit = url.searchParams.get("lastVisit");

    if (!lastVisit) {
      return NextResponse.json({ ok: true, journal: null });
    }

    const lastVisitDate = new Date(lastVisit);
    const now = new Date();
    const absentHours =
      (now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60);

    // Must be absent for at least 24 hours
    if (absentHours < 24) {
      return NextResponse.json({ ok: true, journal: null });
    }

    // Try to query real data from avatar_journey_events
    const { data: journeyRows, error: journeyError } = await supabase
      .from("avatar_journey_events")
      .select("event_type, candidate_id, created_at")
      .eq("user_id", userId)
      .gte("created_at", lastVisit)
      .lte("created_at", now.toISOString())
      .limit(200);

    let crossed = 0;
    let lingered = 0;
    let newConstellation = 0;

    if (!journeyError && journeyRows && journeyRows.length > 0) {
      for (const row of journeyRows) {
        switch (row.event_type) {
          case "conversation_started":
          case "explored":
          case "returned":
            crossed++;
            break;
          case "lingered":
          case "hesitated":
            lingered++;
            break;
          case "deep_moment":
          case "excited":
            newConstellation++;
            break;
        }
      }
    } else {
      // Fallback: try rendezvous_match_candidates
      const { data: candidates } = await supabase
        .from("rendezvous_match_candidates")
        .select("id, status, created_at")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .gte("created_at", lastVisit)
        .limit(100);

      if (candidates && candidates.length > 0) {
        crossed = candidates.length;
        lingered = candidates.filter(
          (c) =>
            c.status === "avatar_liked" ||
            c.status === "mutual" ||
            c.status === "matched",
        ).length;
        newConstellation = candidates.filter(
          (c) => c.status === "mutual" || c.status === "matched",
        ).length;
      } else {
        // Simulated fallback
        crossed = Math.max(1, Math.floor(absentHours / 8));
        lingered = Math.max(0, Math.floor(crossed * 0.3));
        newConstellation = crossed > 5 ? 1 : 0;
      }
    }

    const journal = generateAbsenceNarrative(absentHours, {
      crossed,
      lingered,
      newConstellation,
    });

    return NextResponse.json({ ok: true, journal });
  } catch (err: unknown) {
    console.error("[rendezvous/absence-journal-tracker]", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
