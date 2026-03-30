import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/rendezvous/[candidateId]/constellation
 * 二人のマッチングベクトル（10軸）を返す — ConstellationOverlap 用
 */

const MATCHING_AXES = [
  "conversation_temperature",
  "distance_need",
  "depth_speed",
  "stability_need",
  "stimulation_need",
  "initiative",
  "emotional_openness",
  "conflict_directness",
  "social_energy",
  "structure_preference",
] as const;

type MatchingVector = Record<string, number>;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;

  /* ---------- Auth ---------- */
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  /* ---------- Verify candidate belongs to user ---------- */
  const { data: candidate, error: candErr } = await supabaseAdmin
    .from("rendezvous_candidates")
    .select("id, user_a, user_b, category")
    .eq("id", candidateId)
    .single();

  if (candErr || !candidate) {
    return NextResponse.json(
      { ok: false, error: "candidate_not_found" },
      { status: 404 },
    );
  }

  const isUserA = candidate.user_a === user.id;
  const isUserB = candidate.user_b === user.id;

  if (!isUserA && !isUserB) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const myUserId = user.id;
  const theirUserId = isUserA ? candidate.user_b : candidate.user_a;

  /* ---------- Load matching vectors ---------- */
  async function loadVector(userId: string): Promise<MatchingVector> {
    const { data } = await supabaseAdmin
      .from("rendezvous_matching_vectors")
      .select("axis, value")
      .eq("user_id", userId);

    const vec: MatchingVector = {};
    for (const axis of MATCHING_AXES) {
      vec[axis] = 0.5; // default mid-point
    }
    if (data) {
      for (const row of data) {
        if (MATCHING_AXES.includes(row.axis as (typeof MATCHING_AXES)[number])) {
          vec[row.axis] = Math.max(0, Math.min(1, row.value ?? 0.5));
        }
      }
    }
    return vec;
  }

  const [myVector, theirVector] = await Promise.all([
    loadVector(myUserId),
    loadVector(theirUserId),
  ]);

  return NextResponse.json({
    ok: true,
    myVector,
    theirVector,
    category: candidate.category as string,
  });
}
