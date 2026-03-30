// GET /api/genome-card/preview?userId=xxx — 公開レベルのGenome Cardプレビュー
// Rendezvous詳細画面からGenomeCardPreviewコンポーネントが呼び出す
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId");
    if (!targetUserId) {
      return NextResponse.json(
        { error: "userId required" },
        { status: 400 },
      );
    }

    // プロフィール
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", targetUserId)
      .maybeSingle();

    // Stargazer アーキタイプ
    const { data: coreStar } = await supabase
      .from("stargazer_core_star")
      .select("archetype_label")
      .eq("user_id", targetUserId)
      .maybeSingle();

    // パーソナルカラー
    const { data: styleVector } = await supabase
      .from("user_style_vector")
      .select("pc_season")
      .eq("user_id", targetUserId)
      .maybeSingle();

    // 性格特性 Top 3
    const { data: dimensions } = await supabase
      .from("personality_dimensions")
      .select("dimension, score, confidence")
      .eq("user_id", targetUserId)
      .order("confidence", { ascending: false })
      .limit(3);

    // Sync level
    const { data: syncLevel } = await supabase
      .from("personality_sync_level")
      .select("overall_sync")
      .eq("user_id", targetUserId)
      .maybeSingle();

    const LABEL_MAP: Record<string, string> = {
      quality_vs_quantity: "質重視",
      tradition_vs_novelty: "革新性",
      individual_vs_social: "社交性",
      plan_vs_spontaneous: "計画性",
      cautious_vs_bold: "慎重さ",
      analytical_vs_intuitive: "分析力",
      introvert_vs_extrovert: "外向性",
      independence_vs_harmony: "自律性",
      direct_vs_diplomatic: "率直さ",
      minimal_vs_maximal: "ミニマル",
      function_vs_expression: "表現性",
      classic_vs_trendy: "トレンド感度",
      emotional_stable_vs_volatile: "感情安定",
      change_embrace_vs_resist: "変化受容",
      stress_external_vs_internal: "ストレス対処",
    };

    const topTraits = (dimensions ?? []).map((d, i) => ({
      id: `trait-${i}`,
      label: LABEL_MAP[d.dimension as string] ?? (d.dimension as string),
      score: Math.round(Number(d.score) * 100),
    }));

    const card = {
      userId: targetUserId,
      displayName: profile?.display_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      archetypeLabel: (coreStar?.archetype_label as string) ?? null,
      pcSeason: (styleVector?.pc_season as string) ?? null,
      topTraits,
      summaryLine: null, // プレビューではサマリー非表示
      completeness: syncLevel
        ? Math.min(100, Math.round(Number(syncLevel.overall_sync) * 100))
        : 0,
    };

    return NextResponse.json({ ok: true, card });
  } catch (error) {
    console.error("[genome-card/preview] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
