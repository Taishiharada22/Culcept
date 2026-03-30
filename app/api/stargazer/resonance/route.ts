import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createEmptyAxisScores, TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
import {
  computeAllDistributions,
  detectFluctuationPatterns,
  type AxisSnapshot as FluctuationSnapshot,
} from "@/lib/stargazer/fluctuationEngine";
import { buildContradictionMap } from "@/lib/stargazer/contradictionMap";
import { buildThreeMirrorProfileFromSnapshots } from "@/lib/stargazer/threeMirrorAggregator";
import { buildPredictiveClone } from "@/lib/stargazer/predictiveClone";
import {
  computeResonanceNetwork,
  type ResonanceNetworkInput,
} from "@/lib/stargazer/resonanceNetwork";
import { todayJST } from "@/lib/stargazer/sharedRouteUtils";

export const runtime = "nodejs";

/**
 * GET /api/stargazer/resonance
 *
 * Returns:
 * - resonanceNetwork: Cross-engine resonance signals
 * - dominantResonancePath: Most active neural pathway
 * - networkNarrative: Japanese narrative of current state
 * - overallResonance: 0-1 score
 * - primaryActionHints: Data for getPrimaryAction()
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // ── 1. Fetch axis snapshots ──
    const { data: snapshots } = await supabase
      .from("stargazer_axis_snapshots")
      .select("axis_id, score, confidence, observation_layer, session_date, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json({
        ok: true,
        resonance: null,
        message: "観測データがまだありません",
        primaryActionHints: {
          observationCount: 0,
          phase: "new",
          hasVanishingInsight: false,
          vanishingInsightHoursLeft: 24,
          prophecyVerifiable: false,
          hasNewContradiction: false,
          contradictionCount: 0,
          streakDays: 0,
          streakAtRisk: false,
          streakHoursRemaining: 24,
        },
      });
    }

    // ── 2. Build axis scores ──
    const axisScores = createEmptyAxisScores();
    const latestByAxis = new Map<string, { score: number; date: string }>();
    for (const snap of snapshots) {
      if (!latestByAxis.has(snap.axis_id)) {
        latestByAxis.set(snap.axis_id, { score: snap.score, date: snap.session_date });
        const key = snap.axis_id as TraitAxisKey;
        if (key in axisScores) {
          axisScores[key] = snap.score;
        }
      }
    }

    // ── 3. Compute engine outputs ──

    // Fluctuation engine
    const fluctuationSnapshots: FluctuationSnapshot[] = snapshots.map((s) => ({
      axis_id: s.axis_id as TraitAxisKey,
      score: s.score,
      confidence: s.confidence ?? undefined,
      observation_layer: s.observation_layer ?? undefined,
      session_date: s.session_date,
    }));
    const distributions = computeAllDistributions(fluctuationSnapshots);
    const fluctuationPatterns = detectFluctuationPatterns(fluctuationSnapshots, distributions);

    // Three-mirror profile & contradiction map
    const threeMirrorProfile = buildThreeMirrorProfileFromSnapshots(snapshots as any[]);
    const contradictionMap = buildContradictionMap(threeMirrorProfile);

    // Predictive clone (basic context)
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "night" as const;
    const cloneResult = buildPredictiveClone(axisScores, { timeOfDay, energy: "moderate", social: "alone" });

    // ── 4. Compute resonance network ──
    const resonanceInput: ResonanceNetworkInput = {
      contradictionMap,
      distributions,
      fluctuationPatterns,
      cloneResult,
      recentInsights: [], // Will be populated from DB in future
      currentState: null,
      verifiedPredictions: undefined,
    };

    const resonance = computeResonanceNetwork(resonanceInput);

    // ── 5. Gather primary action hints ──
    const today = todayJST();

    // Check vanishing insight
    const { data: vanishingInsight } = await supabase
      .from("stargazer_vanishing_insights")
      .select("id, expires_at")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true })
      .limit(1);

    const hasVanishingInsight = (vanishingInsight?.length ?? 0) > 0;
    const vanishingInsightHoursLeft = hasVanishingInsight && vanishingInsight?.[0]?.expires_at
      ? Math.max(0, (new Date(vanishingInsight[0].expires_at).getTime() - Date.now()) / 3600000)
      : 24;

    // Check today's prophecy verification status
    const { data: prophecyData } = await supabase
      .from("stargazer_daily_prophecies")
      .select("id, verified_at, prophecy_date")
      .eq("user_id", user.id)
      .order("prophecy_date", { ascending: false })
      .limit(2);

    const yesterdayProphecy = prophecyData?.find(
      (p) => p.prophecy_date !== today && !p.verified_at
    );
    const prophecyVerifiable = !!yesterdayProphecy;

    // Check if new contradictions appeared since last check
    const hasNewContradiction = contradictionMap.entries.some(
      (e) => e.magnitude >= 0.4
    );

    // Streak info (simplified — full streak is client-side)
    const { data: recentObs } = await supabase
      .from("stargazer_axis_snapshots")
      .select("session_date")
      .eq("user_id", user.id)
      .gte("session_date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
      .order("session_date", { ascending: false });

    const uniqueDates = new Set(recentObs?.map((o) => o.session_date) ?? []);
    const hasToday = uniqueDates.has(today);
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const hoursRemaining = Math.max(0, (endOfDay.getTime() - now.getTime()) / 3600000);

    return NextResponse.json({
      ok: true,
      resonance: {
        overallResonance: resonance.overallResonance,
        dominantResonancePath: resonance.dominantResonancePath,
        networkNarrative: resonance.networkNarrative,
        generatedAt: resonance.generatedAt,
        // Contradiction → Fluctuation signals
        priorityAxes: resonance.contradictionToFluctuation.priorityAxes,
        trackingHints: resonance.contradictionToFluctuation.trackingHints.slice(0, 3),
        // Predictive → Aha signals
        predictionErrors: resonance.predictiveToAha.predictionErrors.slice(0, 3),
        // Aha → Contradiction feedback
        contradictionUpdates: resonance.ahaToContradiction.contradictionUpdates
          .filter((u) => u.status !== "unchanged")
          .slice(0, 3),
      },
      primaryActionHints: {
        observationCount: snapshots.length,
        phase: snapshots.length === 0 ? "new" : "observing",
        hasVanishingInsight,
        vanishingInsightHoursLeft,
        prophecyVerifiable,
        hasNewContradiction,
        contradictionCount: contradictionMap.totalContradictions,
        streakDays: uniqueDates.size,
        streakAtRisk: !hasToday && uniqueDates.size >= 3,
        streakHoursRemaining: hoursRemaining,
      },
    }, {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("[resonance] Error:", err);
    return NextResponse.json(
      { error: "共鳴ネットワークの計算中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
