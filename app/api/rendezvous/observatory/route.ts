import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  processEvent,
  aggregateAdjustments,
  blendWithExisting,
  detectPatterns,
} from "@/lib/rendezvous/implicitObservatory";
import type {
  ObservableEvent,
  AxisAdjustment,
  ObservationInsight,
} from "@/lib/rendezvous/implicitObservatory";
import type { MatchingVector } from "@/lib/rendezvous/types";

// ============================================================
// POST /api/rendezvous/observatory
// ============================================================

export async function POST(request: NextRequest) {
  try {
    // --- Auth ---
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    const userId = auth.user.id;

    // --- Parse body ---
    const body = await request.json();
    const events: ObservableEvent[] = body?.events;
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No events provided" },
        { status: 400 },
      );
    }

    // Cap at 200 events per request to prevent abuse
    const cappedEvents = events.slice(0, 200);

    // --- Process each event ---
    const allAdjustments: AxisAdjustment[] = [];
    const now = new Date().toISOString();

    const rowsToInsert = cappedEvents.map((event) => {
      const adjustments = processEvent(event);
      allAdjustments.push(...adjustments);
      return {
        user_id: userId,
        event_type: event.type,
        metadata: event.metadata,
        axis_adjustments: adjustments,
        processed_at: now,
        created_at: event.timestamp || now,
      };
    });

    // --- Store raw events ---
    const { error: insertErr } = await supabaseAdmin
      .from("rendezvous_observations")
      .insert(rowsToInsert);

    if (insertErr) {
      console.error("[observatory] insert error:", insertErr);
      return NextResponse.json(
        { ok: false, error: "Failed to store observations" },
        { status: 500 },
      );
    }

    // --- Aggregate and blend with existing vector ---
    if (allAdjustments.length > 0) {
      const observedDelta = aggregateAdjustments(allAdjustments);

      // Fetch current matching vector from preferences
      const { data: prefs, error: prefsErr } = await supabaseAdmin
        .from("rendezvous_preferences")
        .select("matching_vector")
        .eq("user_id", userId)
        .single();

      if (!prefsErr && prefs?.matching_vector) {
        const currentVector = prefs.matching_vector as MatchingVector;
        const updatedVector = blendWithExisting(currentVector, observedDelta);

        await supabaseAdmin
          .from("rendezvous_preferences")
          .update({
            matching_vector: updatedVector,
            updated_at: now,
          })
          .eq("user_id", userId);
      }
    }

    // --- Detect patterns from recent events ---
    // Fetch recent events for pattern detection (last 7 days)
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: recentRows } = await supabaseAdmin
      .from("rendezvous_observations")
      .select("event_type, metadata, created_at")
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: true })
      .limit(500);

    let insights: ObservationInsight[] = [];
    if (recentRows && recentRows.length >= 5) {
      const recentEvents: ObservableEvent[] = recentRows.map((r) => ({
        type: r.event_type as ObservableEvent["type"],
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        timestamp: r.created_at,
      }));
      insights = detectPatterns(recentEvents);
    }

    // --- Update observation summary ---
    const { data: existingSummary } = await supabaseAdmin
      .from("rendezvous_observation_summaries")
      .select("total_events_processed")
      .eq("user_id", userId)
      .single();

    const totalProcessed =
      (existingSummary?.total_events_processed ?? 0) + cappedEvents.length;

    // Build per-axis confidence map
    const axisConfidence: Record<string, number> = {};
    for (const adj of allAdjustments) {
      axisConfidence[adj.axis] = Math.max(
        axisConfidence[adj.axis] ?? 0,
        adj.confidence,
      );
    }

    await supabaseAdmin.from("rendezvous_observation_summaries").upsert(
      {
        user_id: userId,
        total_events_processed: totalProcessed,
        axis_confidence: axisConfidence,
        detected_patterns: insights,
        last_processed_at: now,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );

    return NextResponse.json({
      ok: true,
      processed: cappedEvents.length,
      insights,
    });
  } catch (err) {
    console.error("[observatory] unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
