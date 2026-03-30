import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  projectFutureSelf,
  findTemporalMatches,
} from "@/lib/rendezvous/temporalMatching";
import type { MatchingVector, RendezvousCategory } from "@/lib/rendezvous/types";

// ============================================================
// GET /api/rendezvous/temporal
// Get temporal matches for the authenticated user
// Query: ?months=3 (optional, default 3)
// ============================================================

export async function GET(request: NextRequest) {
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

    const url = new URL(request.url);
    const monthsAhead = Math.min(
      12,
      Math.max(1, parseInt(url.searchParams.get("months") ?? "3", 10) || 3),
    );

    // --- Fetch user's current matching vector ---
    const { data: prefs, error: prefsError } = await supabaseAdmin
      .from("rendezvous_preferences")
      .select("matching_vector, desired_relation_types")
      .eq("user_id", userId)
      .single();

    if (prefsError || !prefs?.matching_vector) {
      return NextResponse.json(
        { ok: false, error: "Rendezvous profile not found. Complete onboarding first." },
        { status: 404 },
      );
    }

    const currentVector = prefs.matching_vector as MatchingVector;
    const desiredCategories = (prefs.desired_relation_types ?? []) as RendezvousCategory[];

    // --- Fetch user's vector snapshots (historical) ---
    const { data: snapshots } = await supabaseAdmin
      .from("rendezvous_vector_snapshots")
      .select("vector, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(50);

    const vectorSnapshots = (snapshots ?? []).map(
      (s: { vector: Record<string, number>; created_at: string }) => ({
        vector: s.vector as Partial<MatchingVector>,
        timestamp: s.created_at,
      }),
    );

    // --- Project future self ---
    const futureSelf = projectFutureSelf(
      vectorSnapshots,
      currentVector,
      monthsAhead,
    );

    // --- Fetch candidate pool ---
    // Get active rendezvous profiles with matching vectors
    const { data: candidateProfiles } = await supabaseAdmin
      .from("rendezvous_preferences")
      .select("user_id, matching_vector, desired_relation_types")
      .neq("user_id", userId)
      .limit(200);

    if (!candidateProfiles || candidateProfiles.length === 0) {
      return NextResponse.json({
        ok: true,
        futureSelf,
        matches: [],
      });
    }

    // Build candidates list with category assignment
    const candidates = candidateProfiles
      .filter(
        (p: { matching_vector: unknown }) =>
          p.matching_vector && typeof p.matching_vector === "object",
      )
      .map(
        (p: {
          user_id: string;
          matching_vector: MatchingVector;
          desired_relation_types: RendezvousCategory[];
        }) => {
          // Find best matching category between user's desired and candidate's desired
          const otherDesired = (p.desired_relation_types ?? []) as RendezvousCategory[];
          const sharedCategories = desiredCategories.filter((c) =>
            otherDesired.includes(c),
          );
          const category: RendezvousCategory =
            sharedCategories[0] ?? desiredCategories[0] ?? "friendship";

          return {
            id: p.user_id,
            vector: p.matching_vector as MatchingVector,
            category,
          };
        },
      );

    // --- Find temporal matches ---
    const matches = findTemporalMatches(futureSelf, currentVector, candidates);

    return NextResponse.json({ ok: true, futureSelf, matches });
  } catch (err) {
    console.error("[temporal] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
