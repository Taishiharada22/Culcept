import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildGraduationData,
  generateStoryNarration,
} from "@/lib/rendezvous/graduationCeremony";
import type { RendezvousCandidate, RendezvousCategory } from "@/lib/rendezvous/types";

// ============================================================
// POST /api/rendezvous/graduation
// Initiate graduation ceremony for a candidate
// Body: { candidateId: string }
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
    const candidateId: string | undefined = body?.candidateId;
    if (!candidateId) {
      return NextResponse.json(
        { ok: false, error: "candidateId is required" },
        { status: 400 },
      );
    }

    // --- Fetch candidate ---
    const { data: candidate, error: candidateError } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("*")
      .eq("id", candidateId)
      .single();

    if (candidateError || !candidate) {
      return NextResponse.json(
        { ok: false, error: "Candidate not found" },
        { status: 404 },
      );
    }

    // Verify the user is part of this candidate pair
    const c = candidate as RendezvousCandidate;
    if (c.user_a !== userId && c.user_b !== userId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const category = c.category as RendezvousCategory;

    // --- Fetch milestones ---
    const { data: milestones } = await supabaseAdmin
      .from("rendezvous_milestones")
      .select("type, reached_at")
      .eq("candidate_id", candidateId)
      .order("reached_at", { ascending: true });

    const milestoneRows = (milestones ?? []).map((m: { type: string; reached_at: string }) => ({
      type: m.type,
      reachedAt: m.reached_at,
    }));

    // --- Fetch message count ---
    const { count: messageCount } = await supabaseAdmin
      .from("rendezvous_messages")
      .select("id", { count: "exact", head: true })
      .eq("candidate_id", candidateId);

    // --- Fetch activity count ---
    const { count: activityCount } = await supabaseAdmin
      .from("rendezvous_activities")
      .select("id", { count: "exact", head: true })
      .eq("candidate_id", candidateId);

    // --- Fetch season history ---
    const { data: seasons } = await supabaseAdmin
      .from("rendezvous_seasons")
      .select("season, started_at, ended_at")
      .eq("candidate_id", candidateId)
      .order("started_at", { ascending: true });

    const seasonHistory = (seasons ?? []).map(
      (s: { season: string; started_at: string; ended_at: string | null }) => ({
        season: s.season,
        startedAt: s.started_at,
        endedAt: s.ended_at,
      }),
    );

    // --- Fetch vector snapshots ---
    const { data: snapshots } = await supabaseAdmin
      .from("rendezvous_vector_snapshots")
      .select("vector, created_at")
      .eq("candidate_id", candidateId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const vectorSnapshots = (snapshots ?? []).map(
      (s: { vector: Record<string, number>; created_at: string }) => ({
        vector: s.vector,
        timestamp: s.created_at,
      }),
    );

    // --- Build graduation data ---
    const graduation = buildGraduationData(
      c,
      milestoneRows,
      messageCount ?? 0,
      activityCount ?? 0,
      seasonHistory,
      vectorSnapshots,
      category,
    );

    const story = generateStoryNarration(graduation, category);

    return NextResponse.json({ ok: true, graduation, story });
  } catch (err) {
    console.error("[graduation] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
