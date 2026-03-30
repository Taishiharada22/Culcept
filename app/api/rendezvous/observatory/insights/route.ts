import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/rendezvous/observatory/insights
 *
 * 暗黙的行動観測からのインサイトデータを返す。
 * ?candidateId= で特定候補のインサイトをフィルタ可能。
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const userId = auth.user.id;
    const candidateId = request.nextUrl.searchParams.get("candidateId");

    // Fetch recent observatory adjustments (last 30 days)
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    let query = supabaseAdmin
      .from("implicit_observatory_adjustments")
      .select("axis, delta, reason, created_at, candidate_id")
      .eq("user_id", userId)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false });

    if (candidateId) {
      query = query.eq("candidate_id", candidateId);
    }

    const { data: adjustments, error } = await query.limit(20);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    // Aggregate: group by axis, compute net delta
    const axisMap = new Map<
      string,
      { delta: number; reason: string; created_at: string; count: number }
    >();

    for (const adj of adjustments ?? []) {
      const existing = axisMap.get(adj.axis);
      if (existing) {
        existing.delta += adj.delta;
        existing.count++;
        // Keep most recent reason
        if (adj.created_at > existing.created_at) {
          existing.reason = adj.reason;
          existing.created_at = adj.created_at;
        }
      } else {
        axisMap.set(adj.axis, {
          delta: adj.delta,
          reason: adj.reason ?? "",
          created_at: adj.created_at,
          count: 1,
        });
      }
    }

    // Filter to significant adjustments (abs delta > 0.02)
    const significant = Array.from(axisMap.entries())
      .filter(([, v]) => Math.abs(v.delta) > 0.02)
      .map(([axis, v]) => ({
        axis,
        delta: v.delta,
        reason: v.reason,
        created_at: v.created_at,
        observations: v.count,
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return NextResponse.json({
      ok: true,
      adjustments: significant,
      totalObservations: adjustments?.length ?? 0,
    });
  } catch (err: any) {
    console.error("[observatory/insights] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
