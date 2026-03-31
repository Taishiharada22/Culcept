import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isCeoEmail } from "@/lib/auth/isCeo";

export const runtime = "nodejs";

/**
 * CEO ダッシュボード用: フィードバック集計 + 昇格判断データ
 *
 * GET /api/ceo/feedback?range=7|30
 *
 * Returns:
 * - summary: 全体の👍/👎率、回答数、フィードバック率
 * - by_feature: 機能別サマリー
 * - recent_texts: 自由記載一覧（新着順）
 * - danger_signals: 頻出ネガティブキーワード
 * - promotion: Gemini協調の昇格判断データ
 */
export async function GET(request: NextRequest) {
  try {
    // 認証: セッションからCEO判定
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isCeoEmail(user.email ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // データ取得: service_role でRLSバイパス（全ユーザーのデータを集計するため）
    const db = supabaseAdmin;

    const url = new URL(request.url);
    const rangeDays = parseInt(url.searchParams.get("range") ?? "7", 10);
    const range = [7, 30].includes(rangeDays) ? rangeDays : 7;
    const since = new Date();
    since.setDate(since.getDate() - range);
    const sinceISO = since.toISOString();

    // 1. フィードバック全件取得（期間内）— service_role でRLSバイパス
    const { data: feedbacks, error: fbErr } = await db
      .from("stargazer_alter_feedback")
      .select("id, user_id, session_id, response_id, rating, free_text, target_feature, response_metadata, created_at")
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false })
      .limit(500);

    if (fbErr) {
      console.error("[ceo-feedback] Query failed:", fbErr.message);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    const items = feedbacks ?? [];
    const positiveCount = items.filter(f => f.rating === "positive").length;
    const negativeCount = items.filter(f => f.rating === "negative").length;
    const totalFeedback = items.length;

    // 2. 同期間のAlter応答数（feedback率の分母）
    const { count: totalResponses } = await db
      .from("stargazer_analytics")
      .select("id", { count: "exact", head: true })
      .eq("event", "home_alter_judgment")
      .gte("created_at", sinceISO);

    // 3. 機能別サマリー
    const byFeature: Record<string, { positive: number; negative: number; total: number }> = {};
    for (const f of items) {
      const key = f.target_feature ?? "alter";
      if (!byFeature[key]) byFeature[key] = { positive: 0, negative: 0, total: 0 };
      byFeature[key].total++;
      if (f.rating === "positive") byFeature[key].positive++;
      else byFeature[key].negative++;
    }

    // 4. 自由記載一覧（最新50件）
    const recentTexts = items
      .filter(f => f.free_text)
      .slice(0, 50)
      .map(f => ({
        id: f.id,
        user_id: f.user_id,
        session_id: f.session_id,
        response_id: f.response_id,
        rating: f.rating,
        text: f.free_text,
        feature: f.target_feature,
        created_at: f.created_at,
      }));

    // 5. 危険シグナル: ネガティブフィードバックの頻出キーワード
    const dangerKeywords = ["不気味", "決めつけ", "遅い", "的外れ", "怖い", "見透かし", "断定", "ずれ"];
    const dangerCounts: Record<string, number> = {};
    for (const f of items.filter(f => f.rating === "negative" && f.free_text)) {
      for (const kw of dangerKeywords) {
        if (f.free_text!.includes(kw)) {
          dangerCounts[kw] = (dangerCounts[kw] ?? 0) + 1;
        }
      }
    }

    // 6. Gemini協調の昇格判断データ
    // Phase 0 成功率 + レイテンシ
    const { data: readingEvents } = await db
      .from("stargazer_analytics")
      .select("metadata")
      .eq("event", "home_alter_judgment")
      .gte("created_at", sinceISO)
      .not("metadata->utterance_reading", "is", null)
      .limit(500);

    let readingSuccessCount = 0;
    let readingFailCount = 0;
    const latencies: number[] = [];
    for (const ev of readingEvents ?? []) {
      const ur = (ev.metadata as any)?.utterance_reading;
      if (!ur) continue;
      if (ur.phase === "A_active") {
        readingSuccessCount++;
        if (typeof ur.latency_ms === "number") latencies.push(ur.latency_ms);
      } else if (ur.phase === "failed") {
        readingFailCount++;
      }
    }
    latencies.sort((a, b) => a - b);
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : null;
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : null;

    // Disagreement 一致率
    const { data: disagreementEvents } = await db
      .from("stargazer_analytics")
      .select("metadata")
      .eq("event", "utterance_reading_disagreement")
      .gte("created_at", sinceISO)
      .limit(200);

    const agreementRates = (disagreementEvents ?? [])
      .map(e => (e.metadata as any)?.agreement_rate)
      .filter((r): r is number => typeof r === "number");
    const avgAgreement = agreementRates.length > 0
      ? agreementRates.reduce((s, v) => s + v, 0) / agreementRates.length
      : null;

    // 不気味/決めつけフィードバック数
    const creepyCount = items
      .filter(f => f.rating === "negative" && f.free_text)
      .filter(f => ["不気味", "決めつけ", "見透かし", "怖い"].some(kw => f.free_text!.includes(kw)))
      .length;

    const readingTotal = readingSuccessCount + readingFailCount;
    const readingSuccessRate = readingTotal > 0 ? readingSuccessCount / readingTotal : null;
    const negativeRate = totalFeedback > 0 ? negativeCount / totalFeedback : null;

    // 昇格条件チェック（Phase A → B）
    const promotionChecks = {
      phase_0_success_rate: { value: readingSuccessRate, threshold: 0.95, pass: readingSuccessRate !== null && readingSuccessRate >= 0.95 },
      latency_p50: { value: p50, threshold: 1500, pass: p50 !== null && p50 <= 1500 },
      latency_p95: { value: p95, threshold: 3000, pass: p95 !== null && p95 <= 3000 },
      disagreement_agreement: { value: avgAgreement, threshold: 0.70, pass: avgAgreement !== null && avgAgreement >= 0.70 },
      negative_rate: { value: negativeRate, threshold: 0.15, pass: negativeRate !== null && negativeRate <= 0.15 },
      creepy_count: { value: creepyCount, threshold: 3, pass: creepyCount <= 3 },
      sample_size: { value: totalFeedback, threshold: 50, pass: totalFeedback >= 50 },
      reading_sample_size: { value: readingTotal, threshold: 100, pass: readingTotal >= 100 },
    };
    const allPass = Object.values(promotionChecks).every(c => c.pass);
    // サンプル不足時（n<10）は stop signal を発動しない（統計的に無意味）
    const hasMinSample = totalFeedback >= 10 || readingTotal >= 10;
    const hasStopSignal = hasMinSample && (
      (readingSuccessRate !== null && readingSuccessRate < 0.80) ||
      (p95 !== null && p95 > 5000) ||
      (negativeRate !== null && negativeRate > 0.30) ||
      creepyCount >= 5
    );

    return NextResponse.json({
      range_days: range,
      summary: {
        total_responses: totalResponses ?? 0,
        total_feedback: totalFeedback,
        positive: positiveCount,
        negative: negativeCount,
        positive_rate: totalFeedback > 0 ? positiveCount / totalFeedback : null,
        negative_rate: negativeRate,
        feedback_rate: (totalResponses ?? 0) > 0 ? totalFeedback / (totalResponses ?? 1) : null,
      },
      by_feature: byFeature,
      recent_texts: recentTexts,
      danger_signals: dangerCounts,
      promotion: {
        current_phase: "A",
        checks: promotionChecks,
        recommendation: hasStopSignal ? "stop" : allPass ? "promote" : "hold",
        reading_stats: {
          success_count: readingSuccessCount,
          fail_count: readingFailCount,
          total: readingTotal,
          latency_p50: p50,
          latency_p95: p95,
          avg_agreement_rate: avgAgreement,
        },
      },
    });
  } catch (error) {
    console.error("[ceo-feedback] Unexpected error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
