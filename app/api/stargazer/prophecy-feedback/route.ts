import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";
import { truncateString } from "@/lib/stargazer/sharedRouteUtils";
import {
  mapToVerificationLevel,
  statusToLevel,
  calculateAccuracyStats,
  type VerifiedProphecy,
  type AccuracyStats,
} from "@/lib/stargazer/prophecyAccuracy";
import type { ProphecyCategory } from "@/lib/stargazer/dailyProphecy";

export const runtime = "nodejs";

/**
 * POST: 予測フィードバックを送信し、学習ループを更新する
 *
 * Body:
 *   - prophecyId: string (UUID)
 *   - feedback: "correct" | "partially" | "wrong"
 *   - actualBehavior?: string (自由記述)
 *
 * 既存の POST /api/stargazer/prophecy も検証エンドポイントとして機能するが、
 * このエンドポイントは学習ループ統合と精度統計の返却に特化する。
 */
export async function POST(request: NextRequest) {
  try {
    const tierCheck = await checkStargazerTier("prophecy");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    const supabase = await supabaseServer();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { prophecyId, feedback, actualBehavior } = body as {
      prophecyId: string;
      feedback: "correct" | "partially" | "wrong";
      actualBehavior?: string;
    };

    if (!prophecyId || typeof prophecyId !== "string") {
      return NextResponse.json({ error: "prophecyId が必要です" }, { status: 400 });
    }
    if (!feedback || !["correct", "partially", "wrong"].includes(feedback)) {
      return NextResponse.json(
        { error: "feedback は correct/partially/wrong のいずれかを指定してください" },
        { status: 400 },
      );
    }

    // UUID 形式の簡易チェック
    if (!/^[0-9a-f-]{36}$/i.test(prophecyId)) {
      return NextResponse.json({ error: "不正な prophecyId です" }, { status: 400 });
    }

    const safeBehavior = actualBehavior ? truncateString(actualBehavior, 2000) : null;

    // 対象の予言を取得
    const { data: prophecyRow, error: fetchError } = await supabase
      .from("stargazer_daily_prophecies")
      .select("id, category, prediction_text, metadata")
      .eq("id", prophecyId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !prophecyRow) {
      return NextResponse.json({ error: "予言が見つかりません" }, { status: 404 });
    }

    // feedback を verificationLevel と accuracyScore に変換
    const feedbackToAnswer: Record<string, string> = {
      correct: "exact",
      partially: "partial",
      wrong: "off",
    };
    const verificationLevel = feedbackToAnswer[feedback] ?? "off";

    const levelScoreMap: Record<string, number> = {
      exact: 1.0,
      close: 0.7,
      partial: 0.4,
      off: 0.1,
      opposite: 0.0,
    };
    const accuracyScore = levelScoreMap[verificationLevel] ?? 0;

    // 予言を更新
    const { error: updateError } = await supabase
      .from("stargazer_daily_prophecies")
      .update({
        verification_answer: feedback,
        actual_behavior: safeBehavior,
        accuracy_score: accuracyScore,
        verified_at: new Date().toISOString(),
      })
      .eq("id", prophecyId)
      .eq("user_id", userId);

    if (updateError) {
      console.error("[prophecy-feedback] Update failed:", updateError);
      return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
    }

    // 使用されたエンジンを記録
    const metadata = prophecyRow.metadata as Record<string, unknown> | null;
    const engineUsed = metadata?.engine ?? "template";

    console.info("[prophecy-feedback] フィードバック記録", {
      userId: userId.slice(0, 8),
      prophecyId: prophecyId.slice(0, 8),
      feedback,
      accuracyScore,
      engineUsed,
      category: prophecyRow.category,
    });

    // 全検証済み予言を取得して精度統計を再計算
    const { data: allVerified } = await supabase
      .from("stargazer_daily_prophecies")
      .select("id, prophecy_date, category, accuracy_score, verification_answer, verified_at, metadata")
      .eq("user_id", userId)
      .not("verified_at", "is", null)
      .order("prophecy_date", { ascending: true })
      .limit(200);

    let detailedStats: AccuracyStats | null = null;
    let engineBreakdown: Record<string, { total: number; correct: number; rate: number }> = {};

    if (allVerified && allVerified.length > 0) {
      const verifiedProphecies: VerifiedProphecy[] = allVerified.map(
        (row: Record<string, unknown>) => ({
          id: row.id as string,
          prophecyDate: row.prophecy_date as string,
          category: (row.category as ProphecyCategory) ?? "decision",
          verificationLevel: statusToLevel(
            row.verification_answer as string ?? "",
            Number(row.accuracy_score) || 0,
          ),
          accuracyScore: Number(row.accuracy_score) || 0,
          verifiedAt: row.verified_at as string,
        }),
      );

      detailedStats = calculateAccuracyStats(verifiedProphecies);

      // エンジン別の精度集計
      const engineMap = new Map<string, { total: number; correct: number }>();
      for (const row of allVerified) {
        const meta = row.metadata as Record<string, unknown> | null;
        const engine = (meta?.engine as string) ?? "template";
        if (!engineMap.has(engine)) engineMap.set(engine, { total: 0, correct: 0 });
        const stats = engineMap.get(engine)!;
        stats.total++;
        if (Number(row.accuracy_score) >= 0.5) stats.correct++;
      }
      for (const [engine, stats] of engineMap) {
        engineBreakdown[engine] = {
          total: stats.total,
          correct: stats.correct,
          rate: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) / 100 : 0,
        };
      }

      // カテゴリ別精度を更新
      const categoryStats: Record<string, { total: number; score: number }> = {};
      for (const row of allVerified) {
        const cat = row.category as string;
        if (!categoryStats[cat]) categoryStats[cat] = { total: 0, score: 0 };
        categoryStats[cat].total++;
        categoryStats[cat].score += Number(row.accuracy_score) || 0;
      }
      const categoryAccuracy: Record<string, number> = {};
      for (const [cat, data] of Object.entries(categoryStats)) {
        categoryAccuracy[cat] = data.total > 0 ? Math.round((data.score / data.total) * 100) / 100 : 0;
      }

      // 精度テーブルを更新
      const overallRate = allVerified.length > 0
        ? allVerified.reduce((sum, r) => sum + (Number(r.accuracy_score) || 0), 0) / allVerified.length
        : 0;

      const { error: accuracyError } = await supabase
        .from("stargazer_prediction_accuracy")
        .upsert({
          user_id: userId,
          total_predictions: allVerified.length,
          correct_predictions: allVerified.filter(r => Number(r.accuracy_score) >= 0.8).length,
          partial_predictions: allVerified.filter(r => {
            const s = Number(r.accuracy_score);
            return s >= 0.3 && s < 0.8;
          }).length,
          accuracy_percentage: Math.round(overallRate * 10000) / 100,
          streak_current: detailedStats.streak,
          streak_best: detailedStats.bestStreak,
          category_accuracy: categoryAccuracy,
          calculated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (accuracyError) {
        console.error("[prophecy-feedback] Accuracy upsert failed:", accuracyError);
      }
    }

    return NextResponse.json({
      ok: true,
      feedback,
      accuracyScore,
      verificationLevel,
      engineUsed,
      detailedStats,
      engineBreakdown,
    });
  } catch (error) {
    console.error("[prophecy-feedback] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
