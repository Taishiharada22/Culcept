// app/api/stargazer/trajectory/route.ts
// 軌道API — 軸ごとの変化履歴データ

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  buildTrajectory,
  findVolatileAxes,
} from "@/lib/stargazer/trajectoryQuery";
import { CONTINUOUS_OBSERVATION_AXES } from "@/lib/stargazer/questionVariants";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

export async function GET(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const axisParam = url.searchParams.get("axis");
    const daysParam = url.searchParams.get("days") || "30";
    const volatileOnly = url.searchParams.get("volatile") === "true";

    const days = Math.min(90, Math.max(7, parseInt(daysParam, 10) || 30));
    const since = new Date();
    since.setDate(since.getDate() - days);

    // 特定の軸のみ
    if (axisParam) {
      const { data: snapshots } = await supabase
        .from("stargazer_axis_snapshots")
        .select("score, session_date, context")
        .eq("user_id", user.id)
        .eq("axis_id", axisParam)
        .gte("session_date", since.toISOString().split("T")[0])
        .order("session_date", { ascending: true });

      const trajectory = buildTrajectory(
        axisParam as TraitAxisKey,
        snapshots || []
      );

      return NextResponse.json({ ok: true, trajectory });
    }

    // 全軸
    const { data: allSnapshots } = await supabase
      .from("stargazer_axis_snapshots")
      .select("axis_id, score, session_date, context")
      .eq("user_id", user.id)
      .gte("session_date", since.toISOString().split("T")[0])
      .order("session_date", { ascending: true });

    const grouped: Record<string, typeof allSnapshots> = {};
    for (const snap of allSnapshots || []) {
      if (!grouped[snap.axis_id]) grouped[snap.axis_id] = [];
      grouped[snap.axis_id]!.push(snap);
    }

    const trajectories = CONTINUOUS_OBSERVATION_AXES.map((axisId) =>
      buildTrajectory(axisId, grouped[axisId] || [])
    );

    if (volatileOnly) {
      const volatile = findVolatileAxes(trajectories);
      return NextResponse.json({ ok: true, trajectories: volatile });
    }

    // 日次状態も返す
    const { data: dailyStates } = await supabase
      .from("stargazer_daily_states")
      .select("*")
      .eq("user_id", user.id)
      .gte("observation_date", since.toISOString().split("T")[0])
      .order("observation_date", { ascending: true });

    return NextResponse.json({
      ok: true,
      trajectories,
      dailyStates: dailyStates || [],
    });
  } catch (error) {
    console.error("Failed to get trajectory:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
