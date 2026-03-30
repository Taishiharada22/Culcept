import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";
import {
  buildAxisScores,
  calcObservationDepth,
  todayJST,
} from "@/lib/stargazer/sharedRouteUtils";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import {
  generateMultipleResonances,
  type GhostResonanceInput,
} from "@/lib/stargazer/ghostResonance";

export const runtime = "nodejs";

/**
 * GET /api/stargazer/ghost-resonance
 * ユーザーのパターンデータからゴースト共鳴を生成して返す。
 */
export async function GET() {
  try {
    const tierCheck = await checkStargazerTier("ghost_resonance");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId, isBetaTester } = tierCheck;

    const supabase = await supabaseServer();

    const [{ data: profile }, { data: resolvedTypeRow }] = await Promise.all([
      supabase
        .from("stargazer_profiles")
        .select("dimensions, total_sessions")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const { axisScores, hasEvidence } = buildAxisScores(
      profile?.dimensions ?? null,
      resolvedTypeRow?.axis_scores ?? null,
      isBetaTester,
    );

    if (!hasEvidence) {
      return NextResponse.json({
        ok: true,
        resonances: [],
        message: "観測データがまだ不足しています",
      });
    }

    const archetype = resolveArchetype(axisScores);
    const shadowCode =
      getArchetypeByCode(archetype.code)?.shadowCode ?? archetype.code;
    const observationDepth = calcObservationDepth(
      Number(profile?.total_sessions) || 0,
    );

    const input: GhostResonanceInput = {
      archetypeCode: archetype.code,
      shadowCode,
      axisScores,
      observationDepth,
      dateSeed: todayJST(),
    };

    const resonances = generateMultipleResonances(input, 3);

    return NextResponse.json({
      ok: true,
      resonances: resonances.map((r) => ({
        id: r.id,
        ghost_pattern_hash: r.patternHash,
        pattern_name: r.patternName,
        category: r.category,
        ghost_insight: r.insight,
        resonance_context: r.resonanceContext,
        pattern_similarity: r.similarity,
        ghost_population: Math.floor(r.similarity * 50) + 5,
      })),
    });
  } catch (error) {
    console.error("[ghost-resonance] GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/stargazer/ghost-resonance
 * ユーザーの共鳴リアクションを記録する。
 * Body: { resonanceId: string, reaction: string }
 */
export async function POST(req: NextRequest) {
  try {
    const tierCheck = await checkStargazerTier("ghost_resonance");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    let body: { resonanceId?: string; reaction?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.resonanceId || !body.reaction) {
      return NextResponse.json(
        { error: "resonanceId と reaction は必須です" },
        { status: 400 },
      );
    }

    // observations テーブルに記録（汎用的な行動ログとして）
    const supabase = await supabaseServer();
    const { error } = await supabase
      .from("stargazer_observations")
      .insert({
        user_id: userId,
        observation_type: "ghost_resonance_reaction",
        payload: {
          resonanceId: body.resonanceId,
          reaction: body.reaction,
          timestamp: new Date().toISOString(),
        },
      });

    if (error) {
      // テーブルやカラム不在でも黙って成功扱い
      if (error.code === "PGRST205" || error.code === "42P01") {
        return NextResponse.json({ ok: true, fallback: true });
      }
      console.warn("[ghost-resonance] Reaction save failed:", error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ghost-resonance] POST error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
