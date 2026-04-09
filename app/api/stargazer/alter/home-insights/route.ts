/**
 * GET /api/stargazer/alter/home-insights
 *
 * ContextReel 用インサイトカードを返す。
 * builder で3枚まで確定。UIでの追加フィルタ不要。
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";
import { deriveTrustLevel } from "@/lib/stargazer/alterUnderstanding";
import {
  buildInsightCards,
  type InsightDataSources,
  type SessionSummaryRow,
  type HypothesisRow,
  type CausalMapRow,
  type PatternRow,
  type ProphecyRow,
  type BlindSpotDropRow,
  type InnerWeatherRow,
} from "@/lib/stargazer/alterInsightCardBuilder";

export async function GET() {
  try {
    const tierCheck = await checkStargazerTier("alter");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    const supabase = await supabaseServer();

    // ── 並列クエリ: 観測データ(base) + Alterデータ(additive) ──
    const today = new Date().toISOString().split("T")[0]!;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]!;
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

    const [
      // 観測データ（base layer）
      observationCountResult,
      axisScoresResult,
      axisScoresFallbackResult,
      blindSpotResult,
      innerWeatherResult,
      todayProphecyResult,
      yesterdayProphecyResult,
      // Alter データ（additive layer）
      growthResult,
      summariesResult,
      hypothesesResult,
      causalResult,
      patternsResult,
      // 共通
      recentThemesResult,
      prophecyAccuracyResult,
    ] = await Promise.all([
      // ── BASE: 観測由来 ──
      // 1. Observation count
      supabase
        .from("stargazer_observations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      // 2a. Axis scores — primary (resolved_types)
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores")
        .eq("user_id", userId)
        .maybeSingle(),
      // 2b. Axis scores — fallback (profiles.dimensions)
      supabase
        .from("stargazer_profiles")
        .select("dimensions")
        .eq("user_id", userId)
        .maybeSingle(),
      // 3. Latest blind spot drop
      supabase
        .from("stargazer_blind_spot_drops")
        .select("id, drop_date, category, content_title, content_body, content_hint, source_axes, intensity, reaction, created_at")
        .eq("user_id", userId)
        .order("drop_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // 4. Today's inner weather
      supabase
        .from("stargazer_inner_weather")
        .select("id, weather_date, weather_type, energy_level, stress_level, emotional_tone, social_battery, stability, defense_active, weather_report, created_at")
        .eq("user_id", userId)
        .eq("weather_date", today)
        .limit(1)
        .maybeSingle(),
      // 5. Today's prophecy
      supabase
        .from("stargazer_daily_prophecies")
        .select("id, prophecy_date, prediction_text, prediction_category, prediction_confidence, verification_status, user_verification_text, created_at")
        .eq("user_id", userId)
        .eq("prophecy_date", today)
        .limit(1)
        .maybeSingle(),
      // 6. Yesterday's prophecy
      supabase
        .from("stargazer_daily_prophecies")
        .select("id, prophecy_date, prediction_text, prediction_category, prediction_confidence, verification_status, user_verification_text, created_at")
        .eq("user_id", userId)
        .eq("prophecy_date", yesterday)
        .limit(1)
        .maybeSingle(),
      // ── ADDITIVE: Alter会話由来 ──
      // 7. Growth state (trust + sessions)
      supabase
        .from("stargazer_alter_growth")
        .select("trust_level, sessions_completed, growth_state")
        .eq("user_id", userId)
        .single(),
      // 8. Session summaries (直近3)
      supabase
        .from("stargazer_alter_session_summaries")
        .select("id, session_id, summary_date, key_themes, contradictions_discovered, user_admissions, deepest_moment, follow_up_hooks, created_at")
        .eq("user_id", userId)
        .order("summary_date", { ascending: false })
        .limit(3),
      // 9. Hypotheses (active, limit 5)
      supabase
        .from("stargazer_alter_hypotheses")
        .select("id, hypothesis_type, content, evidence_summary, domains, confidence, status, required_trust, presented_count, created_at, last_evaluated")
        .eq("user_id", userId)
        .in("status", ["emerging", "strengthening", "stable"])
        .order("confidence", { ascending: false })
        .limit(5),
      // 10. Causal map (top 3)
      supabase
        .from("stargazer_alter_causal_map")
        .select("id, source_fact, target_axis, influence, hypothesis, confidence, evidence_count, contradiction_count, created_at")
        .eq("user_id", userId)
        .order("confidence", { ascending: false })
        .limit(3),
      // 11. Detected patterns (limit 3)
      supabase
        .from("stargazer_detected_patterns")
        .select("id, pattern_type, axis_id, description_ja, confidence, confirmation_count, surfaced, user_reaction, created_at")
        .eq("user_id", userId)
        .order("confidence", { ascending: false })
        .limit(3),
      // ── 共通 ──
      // 12. 直近3日の表示テーマ（theme dedup + novelty 用）
      supabase
        .from("stargazer_analytics")
        .select("metadata")
        .eq("user_id", userId)
        .eq("event", "home_insight_displayed")
        .gte("created_at", threeDaysAgo)
        .order("created_at", { ascending: false })
        .limit(30),
      // 13. Prophecy accuracy 集計（直近30日）
      supabase
        .from("stargazer_daily_prophecies")
        .select("verification_status")
        .eq("user_id", userId)
        .neq("verification_status", "pending")
        .gte("prophecy_date", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]!),
    ]);

    // ── Extract data ──
    const observationCount = observationCountResult.count ?? 0;
    const growth = growthResult.data;
    const growthSessions = growth?.sessions_completed ?? 0;
    const summariesCount = summariesResult.data?.length ?? 0;
    // D0 安全弁: growth が壊れていても既存ユーザーを初回扱いしない
    const sessionsCompleted = Math.max(growthSessions, summariesCount);
    const continuousTrust = growth?.trust_level ?? 0;
    const trustLevel = deriveTrustLevel(continuousTrust, sessionsCompleted).effectiveTrust;

    // D4: 直近3日の表示テーマを抽出
    const recentDisplayedThemes: string[] = (recentThemesResult.data ?? [])
      .map((row: any) => row.metadata?.theme as string)
      .filter(Boolean);

    const dataSources: InsightDataSources = {
      // 観測データ（base layer）
      observationCount,
      axisScores: (axisScoresResult.data?.axis_scores as Record<string, number>)
        ?? (axisScoresFallbackResult.data?.dimensions as Record<string, number>)
        ?? null,
      blindSpotDrop: (blindSpotResult.data as BlindSpotDropRow | null) ?? null,
      innerWeather: (innerWeatherResult.data as InnerWeatherRow | null) ?? null,
      todayProphecy: (todayProphecyResult.data as ProphecyRow | null) ?? null,
      yesterdayProphecy: (yesterdayProphecyResult.data as ProphecyRow | null) ?? null,
      prophecyAccuracy: (() => {
        const rows = prophecyAccuracyResult.data ?? [];
        if (rows.length === 0) return null;
        const correct = rows.filter((r: any) =>
          ["exact", "close"].includes(r.verification_status),
        ).length;
        return { total: rows.length, correct };
      })(),
      // Alter会話データ（additive layer）
      sessionsCompleted,
      trustLevel,
      sessionSummaries: (summariesResult.data ?? []) as SessionSummaryRow[],
      hypotheses: (hypothesesResult.data ?? []) as HypothesisRow[],
      causalMap: (causalResult.data ?? []) as CausalMapRow[],
      patterns: (patternsResult.data ?? []) as PatternRow[],
      recentDisplayedThemes,
    };

    // ── Build cards (3枚確定) ──
    const cards = buildInsightCards(dataSources);

    // D4: 表示したカードのテーマを記録（非同期、レスポンスをブロックしない）
    if (cards.length > 0) {
      const themeRecords = cards.map((c) => ({
        user_id: userId,
        event: "home_insight_displayed" as const,
        metadata: {
          card_id: c.id,
          card_type: c.type,
          theme: c.theme,
          pinned: c.pinned,
          // §7-A: sourceAxes トレーサビリティ
          ...(c.sourceAxes && c.sourceAxes.length > 0 ? { source_axes: c.sourceAxes } : {}),
        },
      }));
      supabase.from("stargazer_analytics").insert(themeRecords).then(() => {});
    }

    return NextResponse.json({
      ok: true,
      cards,
      observationCount,
      sessionsCompleted,
    });
  } catch (err) {
    console.error("[home-insights] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load insights" },
      { status: 500 },
    );
  }
}
