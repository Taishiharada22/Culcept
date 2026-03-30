// app/api/stargazer/three-mirrors/route.ts
// 三面鏡API — ThreeMirrorProfile / DualArchetype / ContradictionMap を返す

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  buildThreeMirrorProfileFromSnapshots,
  getMirrorCoverageStats,
  type AxisSnapshotRow,
} from "@/lib/stargazer/threeMirrorAggregator";
import {
  buildDualAxisScores,
  computeMirrorConfidence,
} from "@/lib/stargazer/threeMirrors";
import { resolveArchetypeDual } from "@/lib/stargazer/archetypeResolver";
import { buildContradictionMap } from "@/lib/stargazer/contradictionMap";

/**
 * GET: ユーザーの三面鏡プロファイルを取得
 * - ThreeMirrorProfile (各軸 × 各ミラーのスコア)
 * - DualArchetypeResult (主観 vs 客観のアーキタイプ比較)
 * - ContradictionMap (ミラー間の矛盾マップ)
 * - MirrorConfidence (確信度)
 * - CoverageStats (カバレッジ統計)
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 全軸スナップショットを取得
    const { data: snapshots, error } = await supabase
      .from("stargazer_axis_snapshots")
      .select("axis_id, score, observation_layer, variant_id, session_date, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[three-mirrors] Failed to fetch snapshots:", error);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    const typedSnapshots = (snapshots ?? []) as AxisSnapshotRow[];

    // Footprint は client-side (localStorage) なのでここでは空
    // Client側で buildClientThreeMirrorProfile() を使う方がベター
    const profile = buildThreeMirrorProfileFromSnapshots(typedSnapshots);

    // Dual Axis Scores
    const { subjective, objective } = buildDualAxisScores(profile);

    // Dual Archetype
    const dualArchetype = resolveArchetypeDual(subjective, objective);

    // Contradiction Map
    const contradictionMap = buildContradictionMap(profile);

    // Confidence
    const confidence = computeMirrorConfidence(profile);

    // Coverage Stats
    const coverageStats = getMirrorCoverageStats(profile);

    return NextResponse.json({
      ok: true,
      profile,
      dualArchetype,
      contradictionMap,
      confidence,
      coverageStats,
      subjectiveScores: subjective,
      objectiveScores: objective,
    });
  } catch (error) {
    console.error("[three-mirrors] Internal error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
