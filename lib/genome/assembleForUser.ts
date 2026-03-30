// lib/genome/assembleForUser.ts
// 既存 /api/aneurasync/genome/route.ts のクエリ+組立ロジックを共有関数に抽出

import {
  assemblePersonaGenome,
  buildGenomeVisualizationData,
  buildSelfPerception,
  buildOthersPerception,
  computeMirrorGaps,
  buildEvolutionTimeline,
  type GenomeAssemblyInput,
  type DimensionScore,
  type PersonalityInsight,
  type SyncLevel,
  type OrbitSnapshotRow,
  type PersonaGenome,
  type GenomeVisualizationData,
  type MirrorModeResult,
  type EvolutionTimeline,
} from "@/lib/aneurasync/personaGenome";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GenomeAssemblyResult {
  genome: PersonaGenome;
  visualization: GenomeVisualizationData;
  mirror: MirrorModeResult;
  evolution: EvolutionTimeline;
  /** cardFront/cardBack 用の追加データ */
  cardExtras: {
    latestCuriosity: string | null;
    lastObservedAt: string | null;
  };
}

/**
 * 指定ユーザーの PersonaGenome を DB から組み立てる
 * 既存 route.ts のロジックを抽出したもの
 */
export async function assembleGenomeForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<GenomeAssemblyResult> {
  // ─── Parallel queries to existing tables ───
  const [
    bodyProfileRes,
    styleVectorRes,
    dimensionsRes,
    insightsRes,
    syncLevelRes,
    coreStarRes,
    tasteLayersRes,
    prefProfileRes,
    orbitSnapshotsRes,
    swipeCountRes,
    preMatchesRes,
    feedbackRes,
    facePhenotypeRes,
    latestObsRes,
  ] = await Promise.all([
    supabase.from("body_profile")
      .select("jp_3type, jp_7type, cfv, quality_score")
      .eq("user_id", userId).maybeSingle(),
    supabase.from("user_style_vector")
      .select("pc_season, pc_base, jp_3type, jp_7type")
      .eq("user_id", userId).maybeSingle(),
    supabase.from("personality_dimensions")
      .select("dimension, category, score, confidence, evidence_count")
      .eq("user_id", userId),
    supabase.from("personality_insights")
      .select("id, insight_type, content, source, dimension, confidence, extracted_at")
      .eq("user_id", userId)
      .order("extracted_at", { ascending: false }).limit(20),
    supabase.from("personality_sync_level")
      .select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("stargazer_core_star")
      .select("archetype_code, archetype_label")
      .eq("user_id", userId).maybeSingle(),
    supabase.from("taste_layers_cache")
      .select("layer_7d, layer_30d, layer_180d")
      .eq("user_id", userId).maybeSingle(),
    supabase.from("pref_profile")
      .select("silhouette, material")
      .eq("user_id", userId).maybeSingle(),
    supabase.from("stargazer_orbit_snapshots")
      .select("id, user_id, captured_at, archetype_code, archetype_label, drift_index, summary, core_traits_snapshot")
      .eq("user_id", userId)
      .order("captured_at", { ascending: true }).limit(52),
    supabase.from("swipe_events")
      .select("action").eq("user_id", userId),
    supabase.from("pre_matches")
      .select("internal_score").eq("target_id", userId).limit(50),
    supabase.from("match_feedback_events")
      .select("action").eq("partner_user_id", userId),
    supabase.from("face_phenotype")
      .select("phenotype").eq("user_id", userId).maybeSingle(),
    // cardFront用: 最新の観測データ
    supabase.from("stargazer_observations")
      .select("question_text, answer_text, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // ─── Process dimensions (with fallback to stargazer_axis_snapshots) ───
  let dimensions: DimensionScore[] = (dimensionsRes.data || []).map((d: Record<string, unknown>) => ({
    dimension: d.dimension as string,
    category: d.category as string,
    score: Number(d.score),
    confidence: Number(d.confidence),
    evidenceCount: Number(d.evidence_count ?? 0),
  }));

  if (dimensions.length === 0) {
    const axisFallback = await supabase
      .from("stargazer_axis_snapshots")
      .select("axis_id, score")
      .eq("user_id", userId);
    if (axisFallback.data && axisFallback.data.length > 0) {
      const grouped = new Map<string, { scores: number[] }>();
      for (const row of axisFallback.data) {
        const d = row.axis_id as string;
        if (!grouped.has(d)) grouped.set(d, { scores: [] });
        grouped.get(d)!.scores.push(Number(row.score));
      }
      dimensions = Array.from(grouped.entries()).map(([dim, { scores }]) => ({
        dimension: dim,
        category: deriveDimensionCategory(dim),
        score: scores.reduce((a, b) => a + b, 0) / scores.length,
        confidence: Math.min(scores.length / 10, 1.0),
        evidenceCount: scores.length,
      }));
    }
  }

  // ─── Process insights ───
  const insights: PersonalityInsight[] = (insightsRes.data || []).map((i: Record<string, unknown>) => ({
    id: i.id as string,
    insightType: i.insight_type as string,
    content: i.content as string,
    source: i.source as string,
    dimension: i.dimension as string | undefined,
    confidence: Number(i.confidence),
    extractedAt: i.extracted_at as string,
  }));

  // ─── Process sync level (with fallback to stargazer_profiles) ───
  const syncData = syncLevelRes.data;
  let syncLevel: SyncLevel | null = syncData ? {
    overallSync: Number(syncData.overall_sync ?? 0),
    fashionSync: Number(syncData.fashion_sync ?? 0),
    valuesSync: Number(syncData.values_sync ?? 0),
    socialSync: Number(syncData.social_sync ?? 0),
    decisionSync: Number(syncData.decision_sync ?? 0),
    emotionalSync: Number(syncData.emotional_sync ?? 0),
    totalAnswers: Number(syncData.total_answers ?? 0),
    totalInsights: Number(syncData.total_insights ?? 0),
    streakCurrent: Number(syncData.streak_current ?? 0),
    streakBest: Number(syncData.streak_best ?? 0),
    lastSessionAt: syncData.last_session_at as string | null,
  } : null;

  if (!syncLevel) {
    const profileFallback = await supabase
      .from("stargazer_profiles")
      .select("session_count, stage, observation_count")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileFallback.data) {
      const p = profileFallback.data;
      const sessionCount = Number(p.session_count ?? 0);
      const obsCount = Number(p.observation_count ?? 0);
      syncLevel = {
        overallSync: Math.min(sessionCount / 20, 1.0),
        fashionSync: 0, valuesSync: 0, socialSync: 0,
        decisionSync: 0, emotionalSync: 0,
        totalAnswers: obsCount, totalInsights: sessionCount,
        streakCurrent: 0, streakBest: 0, lastSessionAt: null,
      };
    }
  }

  // ─── Process swipe stats ───
  const swipeRows = swipeCountRes.data ?? [];
  const swipeTotal = swipeRows.length;
  let swipeLikes = 0, swipeSaves = 0, swipePurchase = 0;
  for (const row of swipeRows) {
    const a = (row as Record<string, unknown>).action;
    if (a === "like" || a === "super_like") swipeLikes++;
    if (a === "save") swipeSaves++;
    if (a === "purchase_intent") swipePurchase++;
  }

  // ─── Process pre_matches as target ───
  const matchScoresAsTarget = (preMatchesRes.data ?? []).map((m: Record<string, unknown>) => ({
    people_fit_to_me: Number(m.internal_score ?? 0) * 100,
  }));

  // ─── Process feedback stats ───
  const fbRows = feedbackRes.data ?? [];
  let fbSave = 0, fbSkip = 0;
  for (const row of fbRows) {
    const a = (row as Record<string, unknown>).action;
    if (a === "save" || a === "buy") fbSave++;
    if (a === "skip" || a === "reject") fbSkip++;
  }

  // ─── Archetype resolution ───
  let archetypeCode: string | null = null;
  let archetypeLabel: string | null = null;

  // 1. stargazer_profiles.archetype_code を優先
  const profileArchFallback = await supabase
    .from("stargazer_profiles")
    .select("archetype_code, archetype_label")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileArchFallback.data) {
    archetypeCode = (profileArchFallback.data.archetype_code as string) ?? null;
    archetypeLabel = (profileArchFallback.data.archetype_label as string) ?? null;
  }

  // 2. Fallback: archetype_code from core_star
  if (!archetypeCode) {
    archetypeCode = (coreStarRes.data?.archetype_code as string) ?? null;
    archetypeLabel = (coreStarRes.data?.archetype_label as string) ?? null;
  }

  // ─── Process orbit snapshots (with fallback) ───
  let orbitSnapshots: OrbitSnapshotRow[] = (orbitSnapshotsRes.data ?? []).map((s: Record<string, unknown>) => ({
    id: s.id as string,
    user_id: s.user_id as string,
    captured_at: s.captured_at as string,
    archetype_code: s.archetype_code as string,
    archetype_label: s.archetype_label as string,
    drift_index: Number(s.drift_index ?? 0),
    summary: (s.summary as string) ?? null,
    core_traits_snapshot: (s.core_traits_snapshot as Record<string, number>) ?? null,
  }));

  if (orbitSnapshots.length === 0) {
    const axisTimelineFallback = await supabase
      .from("stargazer_axis_snapshots")
      .select("created_at, session_date, axis_id, score")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (axisTimelineFallback.data && axisTimelineFallback.data.length > 0) {
      const archCode = archetypeCode ?? "unknown";
      const archLabel = archetypeLabel ?? "不明";

      const dailyBuckets = new Map<string, { rows: { dimension: string; score: number }[]; date: string }>();
      for (const row of axisTimelineFallback.data) {
        const dateKey = (row.session_date as string) ?? new Date(row.created_at as string).toISOString().slice(0, 10);
        if (!dailyBuckets.has(dateKey)) {
          dailyBuckets.set(dateKey, { rows: [], date: new Date(row.created_at as string).toISOString() });
        }
        dailyBuckets.get(dateKey)!.rows.push({
          dimension: row.axis_id as string,
          score: Number(row.score),
        });
      }

      let buckets = dailyBuckets;
      if (dailyBuckets.size > 20) {
        buckets = new Map<string, { rows: { dimension: string; score: number }[]; date: string }>();
        for (const [, bucket] of dailyBuckets) {
          const d = new Date(bucket.date);
          const isoWeek = getISOWeekKey(d);
          if (!buckets.has(isoWeek)) {
            buckets.set(isoWeek, { rows: [], date: bucket.date });
          }
          buckets.get(isoWeek)!.rows.push(...bucket.rows);
        }
      }

      let prevTraits: Record<string, number> = {};
      let snapIndex = 0;
      for (const [, bucket] of buckets) {
        const traits: Record<string, number> = {};
        const dimScores = new Map<string, number[]>();
        for (const r of bucket.rows) {
          if (!dimScores.has(r.dimension)) dimScores.set(r.dimension, []);
          dimScores.get(r.dimension)!.push(r.score);
        }
        for (const [dim, scores] of dimScores) {
          traits[dim] = scores.reduce((a, b) => a + b, 0) / scores.length;
        }

        let drift = 0;
        if (snapIndex > 0) {
          for (const dim of Object.keys(traits)) {
            if (prevTraits[dim] !== undefined) {
              drift += Math.abs(traits[dim] - prevTraits[dim]);
            }
          }
        }

        orbitSnapshots.push({
          id: `synth-snap-${snapIndex}`,
          user_id: userId,
          captured_at: bucket.date,
          archetype_code: archCode,
          archetype_label: archLabel,
          drift_index: Math.round(drift * 100) / 100,
          summary: null,
          core_traits_snapshot: traits,
        });

        prevTraits = traits;
        snapIndex++;
      }
    }
  }

  // ─── Assemble PersonaGenome ───
  const assemblyInput: GenomeAssemblyInput = {
    userId,
    bodyProfile: bodyProfileRes.data as GenomeAssemblyInput["bodyProfile"],
    styleVector: styleVectorRes.data as GenomeAssemblyInput["styleVector"],
    dimensions,
    insights,
    syncLevel,
    archetypeCode: archetypeCode,
    archetypeLabel: archetypeLabel,
    tasteLayers: tasteLayersRes.data as GenomeAssemblyInput["tasteLayers"],
    prefProfile: prefProfileRes.data as GenomeAssemblyInput["prefProfile"],
    swipeStats: swipeTotal > 0 ? {
      total: swipeTotal, likes: swipeLikes, saves: swipeSaves, purchaseIntents: swipePurchase,
    } : null,
    topStyleTags: [],
    matchScoresAsTarget,
    feedbackStats: fbRows.length > 0 ? {
      saveCount: fbSave, skipCount: fbSkip, totalEvents: fbRows.length,
    } : null,
    orbitSnapshots,
    facePhenotype: facePhenotypeRes.data?.phenotype as GenomeAssemblyInput["facePhenotype"] ?? null,
  };

  const genome = assemblePersonaGenome(assemblyInput);
  const visualization = buildGenomeVisualizationData(genome);
  const selfPerception = buildSelfPerception(genome);
  const othersPerception = buildOthersPerception(genome);
  const mirror = computeMirrorGaps(selfPerception, othersPerception, genome.social.hasSocial);
  const evolution = buildEvolutionTimeline(orbitSnapshots);

  // ─── cardFront/cardBack 用データ ───
  const latestObs = latestObsRes.data;

  // ジャーニー統計: 観測数、ストリーク、次元カバー率、安定度
  const dimsCovered = new Set(dimensions.map((d) => d.dimension)).size;
  const stabilityScore = orbitSnapshots.length >= 2
    ? Math.max(0, 1 - (orbitSnapshots.reduce((sum, s) => sum + (s.drift_index ?? 0), 0) / orbitSnapshots.length) / 10)
    : 0.5;
  const firstObsDate = orbitSnapshots.length > 0 ? orbitSnapshots[0].captured_at : null;

  const cardExtras = {
    latestCuriosity: latestObs?.answer_text as string ?? null,
    lastObservedAt: (syncLevel?.lastSessionAt ?? latestObs?.created_at as string) ?? null,
    journeyStats: {
      totalObservations: syncLevel?.totalAnswers ?? 0,
      currentStreak: syncLevel?.streakCurrent ?? 0,
      bestStreak: syncLevel?.streakBest ?? 0,
      dimensionsCovered: dimsCovered,
      stability: stabilityScore,
      firstObservedAt: firstObsDate,
    },
  };

  return { genome, visualization, mirror, evolution, cardExtras };
}

// ─── Helpers ───

function deriveDimensionCategory(dim: string): string {
  const map: Record<string, string> = {
    quality_vs_quantity: "values",
    tradition_vs_novelty: "values",
    individual_vs_social: "social",
    plan_vs_spontaneous: "decision",
    cautious_vs_bold: "decision",
    analytical_vs_intuitive: "cognition",
    introvert_vs_extrovert: "social",
    independence_vs_harmony: "social",
    direct_vs_diplomatic: "social",
    minimal_vs_maximal: "style",
    function_vs_expression: "style",
    classic_vs_trendy: "style",
    emotional_stable_vs_volatile: "emotional",
    change_embrace_vs_resist: "values",
    stress_external_vs_internal: "emotional",
  };
  return map[dim] ?? "general";
}

function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
