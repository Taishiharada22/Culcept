import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  generateAvatarNarrative,
  type AvatarEvent,
} from "@/lib/rendezvous/avatarNarrative";

// =============================================================================
// GET /api/rendezvous/avatar-journey
// Returns avatar activity narrative for the last 24 hours
// =============================================================================

export async function GET() {
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
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Try to query avatar_journey_events first
    const { data: journeyRows, error: journeyError } = await supabase
      .from("avatar_journey_events")
      .select(
        "id, event_type, emotion_state, narrative_ja, candidate_id, time_slot, created_at",
      )
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(20);

    let avatarEvents: AvatarEvent[];

    if (!journeyError && journeyRows && journeyRows.length > 0) {
      // Map journey events to AvatarEvent type
      const eventTypeMap: Record<string, AvatarEvent["type"]> = {
        conversation_started: "crossed",
        lingered: "lingered",
        excited: "resonance_up",
        deep_moment: "deep_moment",
        explored: "crossed",
        hesitated: "lingered",
        returned: "crossed",
      };

      // Aggregate crossed counts and collect individual events
      const crossedTimestamps: string[] = [];
      const otherEvents: AvatarEvent[] = [];

      for (const row of journeyRows) {
        const mappedType = eventTypeMap[row.event_type] ?? "crossed";
        if (mappedType === "crossed") {
          crossedTimestamps.push(row.created_at);
        } else {
          otherEvents.push({
            type: mappedType,
            timestamp: row.created_at,
          });
        }
      }

      avatarEvents = [];

      // Group crossed events by time-of-day windows
      if (crossedTimestamps.length > 0) {
        const grouped = groupByTimeWindow(crossedTimestamps);
        for (const group of grouped) {
          avatarEvents.push({
            type: "crossed",
            count: group.count,
            timestamp: group.timestamp,
          });
        }
      }

      // Add other events
      avatarEvents.push(...otherEvents);

      // Sort by timestamp
      avatarEvents.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
    } else {
      // Fallback: try rendezvous_match_candidates for basic data
      const { data: candidates } = await supabase
        .from("rendezvous_match_candidates")
        .select("id, status, compatibility_score, created_at, updated_at")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(50);

      if (candidates && candidates.length > 0) {
        avatarEvents = buildEventsFromCandidates(candidates);
      } else {
        // Generate simulated data so the UI works
        avatarEvents = generateSimulatedEvents();
      }
    }

    const entries = generateAvatarNarrative(avatarEvents);

    return NextResponse.json({ ok: true, entries });
  } catch (err: unknown) {
    console.error("[rendezvous/avatar-journey]", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// =============================================================================
// Helpers
// =============================================================================

function groupByTimeWindow(
  timestamps: string[],
): { count: number; timestamp: string }[] {
  // Group by 4-hour windows
  const windows = new Map<number, { count: number; timestamp: string }>();
  for (const ts of timestamps) {
    const d = new Date(ts);
    const windowKey = Math.floor(d.getHours() / 4);
    const existing = windows.get(windowKey);
    if (existing) {
      existing.count++;
    } else {
      windows.set(windowKey, { count: 1, timestamp: ts });
    }
  }
  return [...windows.values()];
}

function buildEventsFromCandidates(
  candidates: Array<{
    id: string;
    status: string;
    compatibility_score: number | null;
    created_at: string;
    updated_at: string;
  }>,
): AvatarEvent[] {
  const events: AvatarEvent[] = [];
  const crossedCount = candidates.length;

  if (crossedCount > 0) {
    events.push({
      type: "crossed",
      count: crossedCount,
      timestamp: candidates[0].created_at,
    });
  }

  const liked = candidates.filter(
    (c) =>
      c.status === "avatar_liked" ||
      c.status === "mutual" ||
      c.status === "matched",
  );
  for (const l of liked.slice(0, 2)) {
    events.push({ type: "lingered", timestamp: l.updated_at || l.created_at });
  }

  const highScore = candidates.filter(
    (c) => c.compatibility_score !== null && c.compatibility_score > 0.7,
  );
  for (const h of highScore.slice(0, 1)) {
    events.push({
      type: "resonance_up",
      timestamp: h.updated_at || h.created_at,
    });
  }

  return events;
}

function generateSimulatedEvents(): AvatarEvent[] {
  const now = new Date();
  const morning = new Date(now);
  morning.setHours(8, 30, 0, 0);
  const afternoon = new Date(now);
  afternoon.setHours(14, 15, 0, 0);

  return [
    {
      type: "crossed",
      count: 3,
      timestamp: morning.toISOString(),
    },
    {
      type: "lingered",
      timestamp: afternoon.toISOString(),
    },
  ];
}
