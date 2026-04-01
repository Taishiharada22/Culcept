import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  computeFourHorsemenProfile,
  classifyConflictStyle,
  computeBidResponsiveness,
  computeGrowthVsDestiny,
  computeCognitiveProfile,
  computeAxisCoverage,
  type StargazerAxesPartial,
} from "@/lib/rendezvous/relationshipProcess";

/**
 * Process Profile 同期 API
 *
 * POST /api/rendezvous/partner/process-profile
 *
 * Stargazer 45軸データから partner_process_profiles を自動算出・保存。
 * - Four Horsemen Profile (4次元リスク)
 * - Conflict Style Profile (3類型)
 * - Bid Responsiveness (応答傾向)
 * - Growth vs Destiny (成長/運命信念)
 *
 * 冪等: 同じ Stargazer データで呼べば同じ結果。
 * Stargazer 更新時に呼び出すことで再計算される。
 *
 * Response:
 *   { processProfile: {...}, stargazerSnapshotId?: string }
 */
export async function POST() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // Stargazer Profile を取得
    const { data: stargazerData, error: sgErr } = await supabaseAdmin
      .from("stargazer_profiles")
      .select("id, dimensions, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (sgErr) {
      return NextResponse.json({ error: sgErr.message }, { status: 500 });
    }

    if (!stargazerData || !stargazerData.dimensions) {
      return NextResponse.json(
        { error: "Stargazer profile not found. Complete Stargazer observation first." },
        { status: 404 },
      );
    }

    const scores: StargazerAxesPartial = stargazerData.dimensions as Record<string, number>;

    // データ充足率を計算
    const axisCoverage = computeAxisCoverage(scores);

    // 7次元を算出
    const fourHorsemenProfile = computeFourHorsemenProfile(scores);
    const conflictStyleProfile = classifyConflictStyle(scores);
    const bidResponsiveness = computeBidResponsiveness(scores);
    const growthVsDestiny = computeGrowthVsDestiny(scores);
    const cognitiveProfile = computeCognitiveProfile(scores);

    // Upsert partner_process_profiles
    const { error: upsertErr } = await supabaseAdmin
      .from("partner_process_profiles")
      .upsert(
        {
          user_id: userId,
          four_horsemen_profile: fourHorsemenProfile as unknown as Record<string, unknown>,
          conflict_style_profile: conflictStyleProfile as unknown as Record<string, unknown>,
          bid_responsiveness: bidResponsiveness,
          growth_vs_destiny: growthVsDestiny,
          cognitive_profile: cognitiveProfile as unknown as Record<string, unknown>,
          axis_coverage: axisCoverage,
          source_snapshot_id: stargazerData.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (upsertErr) {
      console.error("[partner/process-profile] upsert error:", upsertErr);
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      processProfile: {
        fourHorsemenProfile,
        conflictStyleProfile,
        bidResponsiveness,
        growthVsDestiny,
        cognitiveProfile,
      },
      axisCoverage,
      axisCoveragePercent: Math.round(axisCoverage * 100),
      sufficient: axisCoverage >= 0.3,
      stargazerSnapshotId: stargazerData.id,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[partner/process-profile] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/rendezvous/partner/process-profile
 *
 * 現在のキャッシュ済み Process Profile を返す
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: err } = await supabaseAdmin
      .from("partner_process_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({
        processProfile: null,
        message: "Process profile not yet computed. POST to sync from Stargazer.",
      });
    }

    return NextResponse.json({
      processProfile: {
        fourHorsemenProfile: profile.four_horsemen_profile,
        conflictStyleProfile: profile.conflict_style_profile,
        bidResponsiveness: profile.bid_responsiveness,
        growthVsDestiny: profile.growth_vs_destiny,
      },
      axisCoverage: profile.axis_coverage ?? 0,
      stargazerSnapshotId: profile.source_snapshot_id,
      updatedAt: profile.updated_at,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[partner/process-profile] GET error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
