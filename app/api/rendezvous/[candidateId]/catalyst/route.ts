import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { MatchingVector, RendezvousCategory } from "@/lib/rendezvous/types";
import {
  computeGrowthDirections,
  computeCatalystPotential,
} from "@/lib/rendezvous/growthCatalyst";

/**
 * GET /api/rendezvous/[candidateId]/catalyst
 * 成長触媒ポテンシャルを計算して返す
 * - 両ユーザーのマッチングベクトルと履歴スナップショットを取得
 * - リクエストユーザーの成長方向を推定
 * - 触媒ポテンシャルを算出
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch candidate record
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, category, state")
      .eq("id", candidateId)
      .single();

    if (!candidate)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (candidate.user_a !== user.id && candidate.user_b !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Determine self vs other
    const selfId = user.id;
    const otherId =
      candidate.user_a === selfId ? candidate.user_b : candidate.user_a;

    // Fetch both users' preferences (contains matching_vector)
    const [{ data: selfPrefs }, { data: otherPrefs }] = await Promise.all([
      supabaseAdmin
        .from("rendezvous_preferences")
        .select("matching_vector")
        .eq("user_id", selfId)
        .single(),
      supabaseAdmin
        .from("rendezvous_preferences")
        .select("matching_vector")
        .eq("user_id", otherId)
        .single(),
    ]);

    if (!selfPrefs?.matching_vector || !otherPrefs?.matching_vector) {
      return NextResponse.json(
        { error: "Matching vectors not available" },
        { status: 422 },
      );
    }

    const selfVector = selfPrefs.matching_vector as MatchingVector;
    const otherVector = otherPrefs.matching_vector as MatchingVector;

    // Fetch historical vector snapshots for growth direction computation
    // Uses rendezvous_score_history as proxy for vector evolution
    // and stargazer observation snapshots if available
    const { data: snapshots } = await supabaseAdmin
      .from("rendezvous_vector_snapshots")
      .select("vector, created_at")
      .eq("user_id", selfId)
      .order("created_at", { ascending: true })
      .limit(20);

    // Build snapshot data for growth direction computation
    const snapshotData =
      snapshots && snapshots.length >= 2
        ? snapshots.map((s) => ({
            vector: s.vector as Partial<MatchingVector>,
            timestamp: s.created_at as string,
          }))
        : [{ vector: selfVector, timestamp: new Date().toISOString() }];

    // Compute growth directions from historical data
    const growthDirections = computeGrowthDirections(snapshotData);

    // Compute catalyst potential
    const catalyst = computeCatalystPotential(
      selfVector,
      growthDirections,
      otherVector,
      candidate.category as RendezvousCategory,
    );

    return NextResponse.json({ ok: true, catalyst });
  } catch (err: unknown) {
    console.error("[catalyst] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
