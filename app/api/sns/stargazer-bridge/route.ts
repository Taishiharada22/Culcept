// app/api/sns/stargazer-bridge/route.ts
// Stargazer データを Presence の「相手から見た私」タブ用に変換する API

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  generateAllCategoryNarratives,
  type RelationshipCategoryView,
} from "@/lib/stargazer/relationshipNarratives";
import { aggregateRadarDimensions, type RadarDimension } from "@/lib/stargazer/radarAggregation";

export interface SourceHint {
  axis: string;
  source: "home_robot" | "stargazer" | "daily_observation";
  observationCount: number;
  lastObserved: string | null;
}

export interface OthersViewData {
  categories: RelationshipCategoryView[];
  selfRadar: RadarDimension[];
  lastUpdated: string;
  sourceHints?: SourceHint[];
  evidenceSummary?: {
    totalObservations: number;
    activeAxes: number;
    dataQuality: "low" | "medium" | "high";
  };
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

    // 1. Stargazer profile から軸スコアを取得
    const { data: profile } = await supabase
      .from("stargazer_profiles")
      .select("dimensions")
      .eq("user_id", user.id)
      .single();

    // 2. resolved_types からコンテキストスコアを取得
    const { data: resolvedType } = await supabase
      .from("stargazer_resolved_types")
      .select("axis_scores, context_faces, updated_at")
      .eq("user_id", user.id)
      .single();

    const axisScores = resolvedType?.axis_scores || profile?.dimensions || {};
    const contextScoresMap = resolvedType?.context_faces || {};

    // 軸スコアがない場合はフォールバック
    if (Object.keys(axisScores).length === 0) {
      return NextResponse.json({
        ok: true,
        hasData: false,
        categories: [],
        selfRadar: [],
        lastUpdated: new Date().toISOString(),
      });
    }

    // 3. 全8カテゴリのナラティブ生成
    const categories = generateAllCategoryNarratives(axisScores, contextScoresMap);

    // 4. 自分のレーダーチャートデータ
    const selfRadar = aggregateRadarDimensions(axisScores);

    // 5. sourceHints — 各軸の観測データソースと品質を提供
    const axisKeys = Object.keys(axisScores);
    const { data: observations } = await supabase
      .from("stargazer_observations")
      .select("axis_id, source, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    const sourceHints: SourceHint[] = axisKeys.map((axis) => {
      const axisObs = observations?.filter((o) => o.axis_id === axis) ?? [];
      const latest = axisObs[0];
      return {
        axis,
        source: (latest?.source as SourceHint["source"]) ?? "stargazer",
        observationCount: axisObs.length,
        lastObserved: latest?.created_at ?? null,
      };
    });

    const totalObservations = observations?.length ?? 0;
    const activeAxes = axisKeys.length;
    const dataQuality: "low" | "medium" | "high" =
      totalObservations >= 30 ? "high" : totalObservations >= 10 ? "medium" : "low";

    const result: OthersViewData & { ok: true; hasData: true } = {
      ok: true,
      hasData: true,
      categories,
      selfRadar,
      lastUpdated: resolvedType?.updated_at || new Date().toISOString(),
      sourceHints,
      evidenceSummary: { totalObservations, activeAxes, dataQuality },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to generate others view:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
