// app/api/sns/presence/metamorphosis/route.ts
// 変化データ — 軌道、変容法則、予測的分身

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { buildTrajectory, type AxisTrajectory } from "@/lib/stargazer/trajectoryQuery";
import {
  analyzeMetamorphosisLaw,
  type CyclicalPattern,
  type TriggerPattern,
  type ResilienceProfile,
  type TransformationVector,
} from "@/lib/stargazer/metamorphosisLaw";
import {
  buildPredictiveClone,
  type ClonePrediction,
  type PredictiveCloneResult,
} from "@/lib/stargazer/predictiveClone";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

export interface TrajectoryTriggerLink {
  axisId: string;
  trend: string;
  linkedTriggers: { trigger: string; direction: string; magnitude: number }[];
  linkedCycles: { cycleType: string; description: string }[];
}

export interface MetamorphosisResponse {
  ok: boolean;
  hasData: boolean;
  trajectories: AxisTrajectory[];
  cyclicalPatterns: CyclicalPattern[];
  triggerPatterns: TriggerPattern[];
  resilience: ResilienceProfile | null;
  transformationVectors: TransformationVector[];
  predictions: ClonePrediction[];
  cloneAccuracy: number;
  cloneSummary: string;
  trajectoryTriggerLinks: TrajectoryTriggerLink[];
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 軸スナップショット（時系列データ）
    const { data: axisSnapshots } = await supabase
      .from("stargazer_axis_snapshots")
      .select("axis_id, score, session_date, context, observation_layer")
      .eq("user_id", user.id)
      .order("session_date", { ascending: true })
      .limit(500);

    // 軸スコア（現在値）
    const { data: resolvedType } = await supabase
      .from("stargazer_resolved_types")
      .select("axis_scores")
      .eq("user_id", user.id)
      .single();

    const axisScores = (resolvedType?.axis_scores ?? {}) as Record<string, number>;

    if (!axisSnapshots || axisSnapshots.length < 2) {
      return NextResponse.json({
        ok: true,
        hasData: false,
        trajectories: [],
        cyclicalPatterns: [],
        triggerPatterns: [],
        resilience: null,
        transformationVectors: [],
        predictions: [],
        cloneAccuracy: 0,
        cloneSummary: "",
        trajectoryTriggerLinks: [],
      } satisfies MetamorphosisResponse);
    }

    // ━━━━━━ 軌道構築 ━━━━━━
    const axisIds = [...new Set(axisSnapshots.map((s) => s.axis_id))] as TraitAxisKey[];
    const trajectories: AxisTrajectory[] = axisIds.map((axisId) => {
      const data = axisSnapshots.filter((s) => s.axis_id === axisId);
      return buildTrajectory(axisId, data);
    });

    // ━━━━━━ 変容法則分析 ━━━━━━
    const timePoints = axisSnapshots.map((s) => ({
      axisId: s.axis_id as TraitAxisKey,
      score: Number(s.score),
      date: s.session_date,
      context: s.context ?? undefined,
    }));

    const metamorphosis = analyzeMetamorphosisLaw(timePoints);

    // ━━━━━━ 予測的分身 ━━━━━━
    // 各軸の分散を計算
    const axisVariance: Partial<Record<TraitAxisKey, number>> = {};
    for (const t of trajectories) {
      axisVariance[t.axisId] = t.variance;
    }

    const cloneResult: PredictiveCloneResult = buildPredictiveClone(
      axisScores as Record<TraitAxisKey, number>,
      undefined,
      axisVariance
    );

    // ━━━━━━ 軌道↔トリガー クロスリンク ━━━━━━
    const trajectoryTriggerLinks: TrajectoryTriggerLink[] = trajectories
      .filter((t) => t.trend === "rising" || t.trend === "falling")
      .map((t) => ({
        axisId: t.axisId,
        trend: t.trend,
        linkedTriggers: metamorphosis.triggerPatterns
          .filter((tp) => tp.affectedAxes?.includes(t.axisId))
          .map((tp) => ({
            trigger: tp.trigger,
            direction: tp.direction ?? t.trend,
            magnitude: tp.magnitude ?? 0,
          })),
        linkedCycles: metamorphosis.cyclicalPatterns
          .filter((cp) => cp.axisId === t.axisId)
          .map((cp) => ({
            cycleType: cp.cycleType ?? "unknown",
            description: cp.description ?? "",
          })),
      }))
      .filter((link) => link.linkedTriggers.length > 0 || link.linkedCycles.length > 0);

    return NextResponse.json({
      ok: true,
      hasData: true,
      trajectories,
      cyclicalPatterns: metamorphosis.cyclicalPatterns,
      triggerPatterns: metamorphosis.triggerPatterns,
      resilience: metamorphosis.resilience,
      transformationVectors: metamorphosis.transformationVectors,
      predictions: cloneResult.predictions,
      cloneAccuracy: cloneResult.cloneAccuracy,
      cloneSummary: cloneResult.cloneSummary,
      trajectoryTriggerLinks,
    } satisfies MetamorphosisResponse);
  } catch (error) {
    console.error("Metamorphosis API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
