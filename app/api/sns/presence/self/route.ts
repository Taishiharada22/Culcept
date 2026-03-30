// app/api/sns/presence/self/route.ts
// Presence Self Tab — SelfGap, companion insights, decision principles

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  computeAllDistributions,
  detectFluctuationPatterns,
  generateCompanionInsights as generateRichCompanionInsights,
  type AxisSnapshot as FluctuationAxisSnapshot,
} from "@/lib/stargazer/fluctuationEngine";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";

/* ──────────── Response Types ──────────── */

export interface SelfGapDimension {
  dimension: string;
  label: string;
  normalValue: number;
  stressedValue: number;
  gap: number;
}

export interface CompanionInsight {
  level: "notice" | "pattern" | "prediction";
  text: string;
  confidence: number;
}

export interface CompanionQuality {
  level: 1 | 2 | 3 | 4;
  levelLabel: string;
  insightDepth: "surface" | "pattern" | "predictive";
  axesCovered: number;
  totalAxes: number;
  stableAxesCount: number;
  volatileAxesCount: number;
}

export interface SelfResponse {
  ok: boolean;
  observationCount: number;
  dataQuality: "low" | "medium" | "high";
  selfGap: SelfGapDimension[] | null;
  companionInsights: CompanionInsight[];
  companionQuality: CompanionQuality | null;
  existentialEssence: string | null;
  existentialSections: { title: string; content: string }[];
}

/* ──────────── Constants ──────────── */

const STRESS_THRESHOLD = 0.3;

const GAP_DIMENSIONS: { key: string; label: string }[] = [
  { key: "selfAlignment", label: "自己整合" },
  { key: "interpersonalEnergy", label: "対人エネルギー" },
  { key: "boundarySense", label: "境界感覚" },
];

const DB_KEY_MAP: Record<string, string> = {
  selfAlignment: "self_alignment",
  interpersonalEnergy: "interpersonal_energy",
  boundarySense: "boundary_sense",
};

/* ──────────── Helpers ──────────── */

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

interface DailyStateRow {
  self_alignment: number | string | null;
  interpersonal_energy: number | string | null;
  emotional_temp: number | string | null;
  boundary_sense: number | string | null;
}

function computeSelfGap(
  rows: DailyStateRow[],
): SelfGapDimension[] | null {
  const normal: DailyStateRow[] = [];
  const stressed: DailyStateRow[] = [];

  for (const row of rows) {
    const temp = Number(row.emotional_temp) || 0;
    if (temp > STRESS_THRESHOLD) {
      stressed.push(row);
    } else {
      normal.push(row);
    }
  }

  // Need data in both groups to compute a meaningful gap
  if (normal.length === 0 || stressed.length === 0) return null;

  return GAP_DIMENSIONS.map(({ key, label }) => {
    const dbKey = DB_KEY_MAP[key] as keyof DailyStateRow;
    const normalVals = normal.map((r) => Number(r[dbKey]) || 0);
    const stressedVals = stressed.map((r) => Number(r[dbKey]) || 0);
    const normalValue = round3(avg(normalVals));
    const stressedValue = round3(avg(stressedVals));
    return {
      dimension: key,
      label,
      normalValue,
      stressedValue,
      gap: round3(Math.abs(normalValue - stressedValue)),
    };
  });
}

/* ──────────── Companion Insights ──────────── */

interface AxisSnapshot {
  axis_id: string;
  score: number | string;
  context: string | null;
  observation_state?: string | null;
  session_date?: string | null;
}

function deriveCompanionLevel(
  count: number,
): 1 | 2 | 3 | 4 {
  if (count >= 100) return 4;
  if (count >= 30) return 3;
  if (count >= 10) return 2;
  return 1;
}

function generateCompanionInsights(
  level: 1 | 2 | 3 | 4,
  snapshots: AxisSnapshot[],
): CompanionInsight[] {
  const insights: CompanionInsight[] = [];

  if (snapshots.length === 0) {
    insights.push({
      level: "notice",
      text: "まだ十分な観測データがありません。観測を続けることで、あなたの傾向が見えてきます。",
      confidence: 0.3,
    });
    return insights;
  }

  // Group scores by axis
  const byAxis = new Map<string, number[]>();
  for (const snap of snapshots) {
    const scores = byAxis.get(snap.axis_id) ?? [];
    scores.push(Number(snap.score) || 0);
    byAxis.set(snap.axis_id, scores);
  }

  // Level 1: Surface observations
  if (level >= 1) {
    // Find the most frequently observed axis
    let maxAxis = "";
    let maxCount = 0;
    for (const [axis, scores] of byAxis) {
      if (scores.length > maxCount) {
        maxCount = scores.length;
        maxAxis = axis;
      }
    }
    if (maxAxis) {
      const avgScore = round3(avg(byAxis.get(maxAxis)!));
      const direction = avgScore > 0 ? "高め" : avgScore < -0.2 ? "低め" : "中間";
      insights.push({
        level: "notice",
        text: `「${maxAxis}」の軸が最も多く観測されており、スコアは${direction}の傾向です。`,
        confidence: 0.4,
      });
    }
  }

  // Level 2: Pattern recognition
  if (level >= 2) {
    // Detect high-variance axes
    for (const [axis, scores] of byAxis) {
      if (scores.length < 3) continue;
      const mean = avg(scores);
      const variance = avg(scores.map((s) => (s - mean) ** 2));
      if (variance > 0.1) {
        insights.push({
          level: "pattern",
          text: `「${axis}」に大きなばらつきが見られます。状況によって揺れやすい軸かもしれません。`,
          confidence: 0.55,
        });
        break; // one pattern insight is enough
      }
    }

    // Detect context-dependent patterns
    const byContext = new Map<string, number[]>();
    for (const snap of snapshots) {
      const ctx = snap.context ?? "global";
      const scores = byContext.get(ctx) ?? [];
      scores.push(Number(snap.score) || 0);
      byContext.set(ctx, scores);
    }
    if (byContext.size > 1) {
      const contextAvgs = [...byContext.entries()].map(([ctx, scores]) => ({
        ctx,
        avg: avg(scores),
      }));
      const sorted = contextAvgs.sort((a, b) => b.avg - a.avg);
      if (sorted.length >= 2 && Math.abs(sorted[0].avg - sorted[sorted.length - 1].avg) > 0.2) {
        insights.push({
          level: "pattern",
          text: `文脈「${sorted[0].ctx}」では高スコア、「${sorted[sorted.length - 1].ctx}」では低スコアになりやすい傾向があります。`,
          confidence: 0.6,
        });
      }
    }
  }

  // Level 3: Deep insights
  if (level >= 3) {
    // Identify stable core axes (low variance + high confidence)
    const stableAxes: string[] = [];
    for (const [axis, scores] of byAxis) {
      if (scores.length < 5) continue;
      const mean = avg(scores);
      const variance = avg(scores.map((s) => (s - mean) ** 2));
      if (variance < 0.03 && Math.abs(mean) > 0.3) {
        stableAxes.push(axis);
      }
    }
    if (stableAxes.length > 0) {
      insights.push({
        level: "prediction",
        text: `${stableAxes.slice(0, 2).map((a) => `「${a}」`).join("と")}はあなたの安定した核のようです。状況が変わっても揺れにくい特徴です。`,
        confidence: 0.75,
      });
    }
  }

  // Level 4: Predictive understanding
  if (level >= 4) {
    // Detect trending axes (consistent direction over recent snapshots)
    for (const [axis, scores] of byAxis) {
      if (scores.length < 8) continue;
      const recent = scores.slice(0, 5);
      const older = scores.slice(5);
      const recentAvg = avg(recent);
      const olderAvg = avg(older);
      const diff = recentAvg - olderAvg;
      if (Math.abs(diff) > 0.15) {
        const direction = diff > 0 ? "上昇" : "下降";
        insights.push({
          level: "prediction",
          text: `「${axis}」が最近${direction}傾向にあります。この変化は内面の転換期を示している可能性があります。`,
          confidence: 0.8,
        });
        break;
      }
    }
  }

  return insights;
}

/* ──────────── GET Handler ──────────── */

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parallel queries ──
    const [
      dailyStatesResult,
      obsCountResult,
      axisSnapshotsResult,
      digestResult,
    ] = await Promise.all([
      // 1. Latest 30 daily states for SelfGap
      supabase
        .from("stargazer_daily_states")
        .select("self_alignment, interpersonal_energy, emotional_temp, boundary_sense")
        .eq("user_id", user.id)
        .order("observation_date", { ascending: false })
        .limit(30),

      // 2. Observation count for companion level
      supabase
        .from("stargazer_observations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),

      // 3. Axis snapshots for companion insights (recent 100)
      supabase
        .from("stargazer_axis_snapshots")
        .select("axis_id, score, context, observation_state, session_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),

      // 4. Existential digest for decision principles
      supabase
        .from("orbiter_existential_digests")
        .select("sections, essence")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    // ── Observation count & data quality ──
    const observationCount = obsCountResult.count ?? 0;
    const dataQuality: SelfResponse["dataQuality"] =
      observationCount > 30 ? "high" : observationCount >= 10 ? "medium" : "low";

    // ── SelfGap computation ──
    const dailyStates = dailyStatesResult.data as DailyStateRow[] | null;
    const selfGap = dailyStates && dailyStates.length > 0
      ? computeSelfGap(dailyStates)
      : null;

    // ── Companion insights (リッチ版 + フォールバック) ──
    const companionLevel = deriveCompanionLevel(observationCount);
    const axisSnapshots = (axisSnapshotsResult.data ?? []) as AxisSnapshot[];

    let companionInsights: CompanionInsight[];
    let companionQuality: CompanionQuality | null = null;

    if (axisSnapshots.length >= 5) {
      try {
        // リッチ版: fluctuationEngineの関数を使用
        const fluctSnapshots: FluctuationAxisSnapshot[] = axisSnapshots.map((s) => ({
          axis_id: s.axis_id as FluctuationAxisSnapshot["axis_id"],
          score: Number(s.score) || 0,
          session_date: s.session_date ?? new Date().toISOString().slice(0, 10),
          context: s.context,
          state: s.observation_state
            ? (typeof s.observation_state === "string"
              ? JSON.parse(s.observation_state)
              : s.observation_state)
            : undefined,
        }));
        const distributions = computeAllDistributions(fluctSnapshots);
        const patterns = detectFluctuationPatterns(fluctSnapshots, distributions);
        const richInsights = generateRichCompanionInsights(distributions, patterns);

        // リッチ版の結果をCompanionInsight形式に変換
        companionInsights = richInsights.map((i) => ({
          level: i.level,
          text: i.text,
          confidence: i.confidence,
        }));

        // Quality metrics 算出
        const axesInSnapshots = new Set(axisSnapshots.map((s) => s.axis_id));
        let stableCount = 0;
        let volatileCount = 0;
        for (const dist of distributions) {
          if (dist.stability > 0.7) stableCount++;
          if (dist.stability < 0.4) volatileCount++;
        }

        const hasPatterns = patterns.length > 0;
        const hasPrediction = richInsights.some((i) => i.level === "prediction");
        companionQuality = {
          level: companionLevel,
          levelLabel: companionLevel === 1 ? "表層" : companionLevel === 2 ? "パターン" : companionLevel === 3 ? "深層" : "予測",
          insightDepth: hasPrediction ? "predictive" : hasPatterns ? "pattern" : "surface",
          axesCovered: axesInSnapshots.size,
          totalAxes: TRAIT_AXES.length,
          stableAxesCount: stableCount,
          volatileAxesCount: volatileCount,
        };
      } catch {
        // フォールバック
        companionInsights = generateCompanionInsights(companionLevel, axisSnapshots);
      }
    } else {
      companionInsights = generateCompanionInsights(companionLevel, axisSnapshots);
    }

    // ── Existential digest ──
    const digest = digestResult.data;
    const existentialEssence: string | null = digest?.essence || null;
    const existentialSections: { title: string; content: string }[] =
      Array.isArray(digest?.sections) ? digest.sections : [];

    return NextResponse.json({
      ok: true,
      observationCount,
      dataQuality,
      selfGap,
      companionInsights,
      companionQuality,
      existentialEssence,
      existentialSections,
    } satisfies SelfResponse);
  } catch (error) {
    console.error("[Presence Self API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
