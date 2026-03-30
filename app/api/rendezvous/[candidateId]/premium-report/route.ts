import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateInsight } from "@/lib/rendezvous/insightGenerator";
import type { RendezvousCategory, ReasonCode, CautionCode } from "@/lib/rendezvous/types";

/**
 * GET /api/rendezvous/[candidateId]/premium-report
 * プレミアム拡張互換性レポート
 * 通常のinsightに加え、詳細な10軸分析+長期予測+成長ヒントを返す
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Check premium status
    const { data: profile } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("is_premium")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!profile?.is_premium) {
      return NextResponse.json({ ok: false, error: "Premium required", isPremiumRequired: true }, { status: 403 });
    }

    // Fetch candidate
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, category, reason_codes, caution_codes, sync_percent, state")
      .eq("id", candidateId)
      .maybeSingle();

    if (!candidate) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const userId = auth.user.id;
    const counterpartId = candidate.user_a === userId ? candidate.user_b : candidate.user_a;

    // Fetch both users' matching vectors
    const [selfVectorRes, otherVectorRes] = await Promise.all([
      supabaseAdmin
        .from("rendezvous_matching_vectors")
        .select("vector")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("rendezvous_matching_vectors")
        .select("vector")
        .eq("user_id", counterpartId)
        .maybeSingle(),
    ]);

    const selfVector = selfVectorRes.data?.vector ?? {};
    const otherVector = otherVectorRes.data?.vector ?? {};

    const reasonCodes = (candidate.reason_codes ?? []) as ReasonCode[];
    const cautionCodes = (candidate.caution_codes ?? []) as CautionCode[];
    const category = (candidate.category ?? "friendship") as RendezvousCategory;

    // Generate extended insight
    const insight = generateInsight(
      selfVector,
      otherVector,
      reasonCodes,
      cautionCodes,
      category,
      candidate.sync_percent ?? 0,
    );

    // Premium extras: long-term forecast
    const longTermForecast = generateLongTermForecast(insight, category);

    return NextResponse.json({
      ok: true,
      insight,
      longTermForecast,
      syncPercent: candidate.sync_percent ?? 0,
    });
  } catch (err: any) {
    console.error("[premium-report] error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

function generateLongTermForecast(
  insight: ReturnType<typeof generateInsight>,
  category: RendezvousCategory,
) {
  const connectionStrength = insight.connectionPoints.length;
  const frictionCount = insight.frictionPoints.length;

  const stabilityScore = Math.min(100, Math.max(0,
    50 + connectionStrength * 15 - frictionCount * 10
  ));

  const forecasts: { timeframe: string; prediction: string; confidence: number }[] = [];

  if (category === "romantic") {
    forecasts.push(
      { timeframe: "1ヶ月後", prediction: stabilityScore > 60 ? "自然な信頼関係が育ち始める段階" : "お互いの距離感を探る段階", confidence: 0.7 },
      { timeframe: "3ヶ月後", prediction: stabilityScore > 70 ? "深い理解と安心感のある関係へ" : "価値観のすり合わせが鍵になる時期", confidence: 0.5 },
      { timeframe: "6ヶ月後", prediction: stabilityScore > 75 ? "安定した絆が形成される" : "互いの成長を認め合えるかが試される", confidence: 0.35 },
    );
  } else if (category === "friendship") {
    forecasts.push(
      { timeframe: "1ヶ月後", prediction: "共通の話題で自然な会話が増える", confidence: 0.7 },
      { timeframe: "3ヶ月後", prediction: stabilityScore > 60 ? "気軽に誘い合える関係に" : "適度な距離感の模索期", confidence: 0.5 },
    );
  } else if (category === "cocreation") {
    forecasts.push(
      { timeframe: "1ヶ月後", prediction: "アイデア交換でお互いの強みが見える", confidence: 0.7 },
      { timeframe: "3ヶ月後", prediction: stabilityScore > 60 ? "具体的なプロジェクトが動き始める" : "役割分担の明確化が必要", confidence: 0.5 },
    );
  } else {
    forecasts.push(
      { timeframe: "1ヶ月後", prediction: "緩やかな繋がりが安定する", confidence: 0.6 },
    );
  }

  return {
    stabilityScore,
    forecasts,
    growthAreas: insight.growthPotential ? [insight.growthPotential] : [],
  };
}
