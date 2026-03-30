import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeSelfStateReport } from "@/lib/orbiter/selfStateReport";
import { computeAxisDistribution } from "@/lib/stargazer/fluctuationEngine";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { TRAIT_AXIS_KEYS } from "@/lib/stargazer/traitAxes";

/**
 * GET /api/orbiter/self-state
 * ユーザーの SelfStateReport を計算して返す。
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const userId = auth.user.id;

    // 並列取得: observation state + recent snapshots (14日分)
    const fourteenDaysAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [obsStateResult, snapshotsResult] = await Promise.all([
      supabaseAdmin
        .from("stargazer_sessions")
        .select("observation_state")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("stargazer_axis_snapshots")
        .select("axis_id, score, session_date")
        .eq("user_id", userId)
        .gte("session_date", fourteenDaysAgo)
        .order("session_date", { ascending: false }),
    ]);

    // observation_state からの current state 抽出
    const obsState = obsStateResult.data?.observation_state;
    const currentState = obsState
      ? {
          energy: obsState.energy ?? "moderate",
          emotion: obsState.emotion ?? "neutral",
          social: obsState.social ?? "neutral",
        }
      : null;

    // AxisDistribution を計算
    const snapshots = snapshotsResult.data ?? [];
    const snapshotsByAxis = new Map<string, typeof snapshots>();
    for (const snap of snapshots) {
      const arr = snapshotsByAxis.get(snap.axis_id) ?? [];
      arr.push(snap);
      snapshotsByAxis.set(snap.axis_id, arr);
    }

    const distributions = [];
    for (const axisId of TRAIT_AXIS_KEYS) {
      const axisSnapshots = snapshotsByAxis.get(axisId);
      if (!axisSnapshots || axisSnapshots.length < 2) continue;

      const dist = computeAxisDistribution(
        axisId as TraitAxisKey,
        axisSnapshots.map((s) => ({
          axis_id: s.axis_id as TraitAxisKey,
          score: s.score,
          session_date: s.session_date,
        })),
      );
      if (dist) distributions.push(dist);
    }

    const report = computeSelfStateReport({
      distributions,
      currentState,
      recentSnapshots: snapshots,
    });

    return NextResponse.json({ ok: true, selfStateReport: report });
  } catch (err: any) {
    console.error("[orbiter/self-state] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
