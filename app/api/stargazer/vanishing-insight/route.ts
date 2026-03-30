import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";
import {
  generateAIVanishingInsight,
  type VanishingInsightContext,
  type AIVanishingInsight,
} from "@/lib/stargazer/aiVanishingInsight";
import {
  buildInsightPreference,
  preferenceToPromptContext,
} from "@/lib/stargazer/insightPersonalizer";

export const runtime = "nodejs";

/**
 * POST: AI 駆動の消えるインサイトを生成する
 *
 * Body:
 *   - axisScores: Record<string, number>
 *   - observationCount: number
 *   - previousInsight?: string | null
 */
export async function POST(request: NextRequest) {
  try {
    const tierCheck = await checkStargazerTier("prophecy");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const {
      axisScores,
      observationCount,
      previousInsight,
    } = body as {
      axisScores?: Record<string, number>;
      observationCount?: number;
      previousInsight?: string | null;
    };

    if (!axisScores || typeof axisScores !== "object" || Object.keys(axisScores).length < 3) {
      return NextResponse.json(
        { error: "軸スコアが不足しています（最低3軸必要）" },
        { status: 400 },
      );
    }

    const supabase = await supabaseServer();

    // 追加コンテキストの取得を試みる（失敗しても続行）
    let contradictions: VanishingInsightContext["contradictions"];
    let behavioralInsights: VanishingInsightContext["behavioralInsights"];
    let detectedPatterns: VanishingInsightContext["detectedPatterns"];

    try {
      const [
        { data: contradictionRows },
        { data: patternRows },
      ] = await Promise.all([
        supabase
          .from("stargazer_contradictions")
          .select("type, description, severity")
          .eq("user_id", userId)
          .order("severity", { ascending: false })
          .limit(3),
        supabase
          .from("stargazer_behavioral_signals")
          .select("signal_type, value, context")
          .eq("user_id", userId)
          .order("recorded_at", { ascending: false })
          .limit(5),
      ]);

      if (contradictionRows) {
        contradictions = contradictionRows.map((r: Record<string, unknown>) => ({
          axisA: "",
          axisB: "",
          type: r.type as "temporal" | "cross_axis" | "self_report_vs_behavior" | "stated_vs_chosen",
          description: r.description as string,
          severity: Number(r.severity) || 0,
          insightPotential: "",
          probeQuestion: "",
        }));
      }

      // パターンは簡易形式で渡す (behavioralInsights として)
      if (patternRows && patternRows.length > 0) {
        behavioralInsights = patternRows.map((r: Record<string, unknown>) => ({
          category: "hesitation_pattern" as const,
          description: `${r.signal_type}: ${r.value}`,
          evidence: (r.context as string) ?? "",
          confidence: 0.6,
          affectedAxes: [] as string[],
          userSurpriseFactor: 0.5,
        }));
      }
    } catch {
      // コンテキスト取得失敗は無視
    }

    // ユーザー嗜好プロファイルを構築（失敗しても続行）
    let preferenceContext = "";
    try {
      const pref = await buildInsightPreference(userId, supabase);
      preferenceContext = preferenceToPromptContext(pref);
    } catch (prefError) {
      console.warn("[vanishing-insight] Preference loading failed, continuing:", prefError);
    }

    // AI 生成を試行
    const context: VanishingInsightContext = {
      userId,
      axisScores,
      observationCount: observationCount ?? 0,
      contradictions,
      behavioralInsights,
      detectedPatterns,
      previousInsight: previousInsight ?? null,
      preferenceContext: preferenceContext || undefined,
    };

    const aiInsight: AIVanishingInsight | null = await generateAIVanishingInsight(context);

    if (!aiInsight) {
      // AI 失敗 — クライアント側でテンプレートにフォールバック
      return NextResponse.json({ ok: false, reason: "AI生成失敗" });
    }

    console.info("[vanishing-insight] AI インサイト生成成功", {
      userId: userId.slice(0, 8),
      depth: aiInsight.depth,
      surpriseScore: aiInsight.surpriseScore,
      expiresInHours: Math.round((aiInsight.expiresAt - Date.now()) / (60 * 60 * 1000)),
    });

    // DBに保存（反応記録のため）
    const { error: insertError } = await supabase
      .from("stargazer_vanishing_insights")
      .insert({
        id: aiInsight.id,
        user_id: userId,
        insight: aiInsight.insight,
        depth: aiInsight.depth,
        surprise_score: aiInsight.surpriseScore,
        based_on: aiInsight.basedOn ?? null,
        chain_reference: aiInsight.chainReference ?? null,
        generated_at: new Date(aiInsight.generatedAt).toISOString(),
        expires_at: new Date(aiInsight.expiresAt).toISOString(),
      });

    if (insertError) {
      // 保存失敗してもインサイト自体は返す（UX優先）
      console.warn("[vanishing-insight] DB insert failed:", insertError.message);
    }

    return NextResponse.json({
      ok: true,
      insight: {
        id: aiInsight.id,
        insight: aiInsight.insight,
        depth: aiInsight.depth,
        surpriseScore: aiInsight.surpriseScore,
        basedOn: aiInsight.basedOn,
        chainReference: aiInsight.chainReference,
        generatedAt: aiInsight.generatedAt,
        expiresAt: aiInsight.expiresAt,
      },
    });
  } catch (error) {
    console.error("[vanishing-insight] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PATCH /api/stargazer/vanishing-insight
 * ユーザーの反応を記録する。
 * Body: { insightId: string, reaction: "resonated" | "surprising" | "expected" | "unclear" }
 */
export async function PATCH(request: NextRequest) {
  try {
    const tierCheck = await checkStargazerTier("prophecy");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    const body = await request.json() as {
      insightId?: string;
      reaction?: string;
    };

    const VALID_REACTIONS = ["resonated", "surprising", "expected", "unclear"] as const;
    if (!body.insightId || !body.reaction || !VALID_REACTIONS.includes(body.reaction as typeof VALID_REACTIONS[number])) {
      return NextResponse.json({ error: "insightId と reaction は必須です" }, { status: 400 });
    }

    const supabase = await supabaseServer();

    const { error } = await supabase
      .from("stargazer_vanishing_insights")
      .update({
        user_reaction: body.reaction,
        reacted_at: new Date().toISOString(),
      })
      .eq("id", body.insightId)
      .eq("user_id", userId);

    if (error) {
      // テーブル未作成（PGRST205）の場合はクライアント側 localStorage で保持するため 200 を返す
      if (error.code === "PGRST205") {
        return NextResponse.json({ ok: true, fallback: "localStorage" });
      }
      console.error("[vanishing-insight] Reaction save failed:", error);
      return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[vanishing-insight] PATCH error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
