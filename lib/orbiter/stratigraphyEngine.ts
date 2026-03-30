// ============================================================
// Orbiter Phase 4: 判断の地層 (Decision Stratigraphy)
//
// ユーザーの判断の旅を「時代」に分け、名前をつける。
// 探索期 → 収束期 → 漂流期 → 深化期 → 結晶期
//
// 過去の時代を振り返ることで、ユーザーは自分の変化に気づく。
// 「あの時は探していた。今は、もう知っている。」
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { CandidateDecision } from "./crossPatternEngine";
import type { DeltaSnapshot } from "./deltaEngine";
import type {
  OrbiterDelta,
  EraType,
  DecisionEra,
  EraTransitionInsight,
  DecisionStratigraphy,
} from "./types";

// ── Constants ──

const MIN_DECISIONS = 6;
const WINDOW_SIZE = 5;
const LIKE_RATE_SHIFT_THRESHOLD = 0.2;
const TIME_SHIFT_RATIO = 0.4;

const ERA_LABELS: Record<EraType, string> = {
  exploration: "探索期",
  focus: "収束期",
  wandering: "漂流期",
  deepening: "深化期",
  crystallization: "結晶期",
};

const ERA_DESCRIPTIONS: Record<EraType, string> = {
  exploration: "広い視野で多くの候補を見ていた時期",
  focus: "好みが明確になり、絞り込んでいた時期",
  wandering: "基準が揺らぎ、方向を探していた時期",
  deepening: "慎重に、深く向き合っていた時期",
  crystallization: "判断の軸が定まり、確信を持っていた時期",
};

// ── Main ──

export function computeStratigraphy(params: {
  decisionHistory: CandidateDecision[];
  previousDeltaSnapshot: DeltaSnapshot | null;
  currentDeltaSnapshot: DeltaSnapshot | null;
  delta: OrbiterDelta | null;
}): DecisionStratigraphy | null {
  const { decisionHistory, delta } = params;

  if (decisionHistory.length < MIN_DECISIONS) return null;

  // Sort chronologically (oldest first)
  const sorted = [...decisionHistory].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // ── Sliding window segmentation ──

  const segments: WindowMetrics[] = [];
  for (let i = 0; i <= sorted.length - WINDOW_SIZE; i++) {
    const window = sorted.slice(i, i + WINDOW_SIZE);
    segments.push(computeWindowMetrics(window, i));
  }

  if (segments.length === 0) return null;

  // ── Find era boundaries ──

  const eraBoundaries: number[] = [0]; // always start with first segment
  for (let i = 1; i < segments.length; i++) {
    if (isEraBoundary(segments[i - 1], segments[i])) {
      eraBoundaries.push(i);
    }
  }

  // ── Classify each era ──

  const eras: DecisionEra[] = [];
  for (let e = 0; e < eraBoundaries.length; e++) {
    const startIdx = eraBoundaries[e];
    const endIdx = e + 1 < eraBoundaries.length
      ? eraBoundaries[e + 1]
      : segments.length;

    // Average metrics across segments in this era
    const eraSegments = segments.slice(startIdx, endIdx);
    const avgMetrics = averageMetrics(eraSegments);
    const eraType = classifyEra(avgMetrics);

    const startDate = sorted[startIdx].createdAt;
    const decisionCount = Math.min(
      endIdx - startIdx + WINDOW_SIZE - 1,
      sorted.length - startIdx,
    );

    eras.push({
      type: eraType,
      label: ERA_LABELS[eraType],
      index: e,
      startDate,
      decisionCount,
      characterization: ERA_DESCRIPTIONS[eraType],
      metrics: {
        likeRate: avgMetrics.likeRate,
        avgDecisionTimeMs: avgMetrics.avgDecisionTimeMs,
        topAxes: avgMetrics.topAxes,
      },
    });
  }

  if (eras.length === 0) return null;

  const currentEra = eras[eras.length - 1];

  // ── Detect era transition ──

  let latestTransition: EraTransitionInsight | null = null;
  if (eras.length >= 2) {
    const prev = eras[eras.length - 2];
    const curr = eras[eras.length - 1];
    if (prev.type !== curr.type) {
      latestTransition = buildTransitionInsight(prev, curr, delta);
    }
  }

  // ── Span days ──

  const firstDate = new Date(sorted[0].createdAt);
  const lastDate = new Date(sorted[sorted.length - 1].createdAt);
  const spanDays = Math.max(1, Math.round(
    (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
  ));

  return { eras, currentEra, latestTransition, spanDays };
}

// ── Window Metrics ──

interface WindowMetrics {
  likeRate: number;
  avgDecisionTimeMs: number | null;
  topAxes: TraitAxisKey[];
  axisVariety: number; // 0-1: how diverse the axes are
  avgVisitCount: number;
  segmentIndex: number;
}

function computeWindowMetrics(
  decisions: CandidateDecision[],
  segmentIndex: number,
): WindowMetrics {
  const likes = decisions.filter((d) => d.decision === "like");
  const likeRate = decisions.length > 0 ? likes.length / decisions.length : 0.5;

  const times = decisions
    .map((d) => d.timeToDecisionMs)
    .filter((t): t is number => t != null);
  const avgDecisionTimeMs = times.length > 0
    ? times.reduce((a, b) => a + b, 0) / times.length
    : null;

  // Extract top axes from liked candidates
  const axisAcc: Record<string, number> = {};
  for (const d of likes) {
    for (const [axis, score] of Object.entries(d.counterpartAxisScores)) {
      if (score == null) continue;
      axisAcc[axis] = (axisAcc[axis] ?? 0) + Math.abs(score);
    }
  }
  const topAxes = Object.entries(axisAcc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([axis]) => axis as TraitAxisKey);

  // Axis variety: unique axes across all decisions
  const allAxes = new Set<string>();
  for (const d of decisions) {
    for (const axis of Object.keys(d.counterpartAxisScores)) {
      allAxes.add(axis);
    }
  }
  const axisVariety = Math.min(1, allAxes.size / 10);

  const avgVisitCount = decisions.reduce((s, d) => s + d.visitCount, 0) / decisions.length;

  return { likeRate, avgDecisionTimeMs, topAxes, axisVariety, avgVisitCount, segmentIndex };
}

// ── Era Boundary Detection ──

function isEraBoundary(prev: WindowMetrics, curr: WindowMetrics): boolean {
  // Like rate shift
  if (Math.abs(curr.likeRate - prev.likeRate) > LIKE_RATE_SHIFT_THRESHOLD) return true;

  // Decision time shift
  if (prev.avgDecisionTimeMs != null && curr.avgDecisionTimeMs != null) {
    const ratio = curr.avgDecisionTimeMs / prev.avgDecisionTimeMs;
    if (ratio > 1 + TIME_SHIFT_RATIO || ratio < 1 - TIME_SHIFT_RATIO) return true;
  }

  // Top axes composition change (Jaccard < 0.5)
  if (prev.topAxes.length > 0 && curr.topAxes.length > 0) {
    const intersection = prev.topAxes.filter((a) => curr.topAxes.includes(a));
    const union = new Set([...prev.topAxes, ...curr.topAxes]);
    const jaccard = intersection.length / union.size;
    if (jaccard < 0.5) return true;
  }

  return false;
}

// ── Era Classification ──

function averageMetrics(segments: WindowMetrics[]): WindowMetrics {
  const n = segments.length;
  if (n === 0) return { likeRate: 0.5, avgDecisionTimeMs: null, topAxes: [], axisVariety: 0, avgVisitCount: 1, segmentIndex: 0 };

  const likeRate = segments.reduce((s, m) => s + m.likeRate, 0) / n;

  const validTimes = segments.filter((m) => m.avgDecisionTimeMs != null);
  const avgDecisionTimeMs = validTimes.length > 0
    ? validTimes.reduce((s, m) => s + m.avgDecisionTimeMs!, 0) / validTimes.length
    : null;

  const axisVariety = segments.reduce((s, m) => s + m.axisVariety, 0) / n;
  const avgVisitCount = segments.reduce((s, m) => s + m.avgVisitCount, 0) / n;

  // Aggregate top axes (most common across segments)
  const axisCounts: Record<string, number> = {};
  for (const seg of segments) {
    for (const axis of seg.topAxes) {
      axisCounts[axis] = (axisCounts[axis] ?? 0) + 1;
    }
  }
  const topAxes = Object.entries(axisCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([axis]) => axis as TraitAxisKey);

  // Check axis consistency (do top axes stay the same across segments?)
  const allTopAxes = segments.map((s) => s.topAxes);
  const axisConsistency = allTopAxes.length > 1
    ? allTopAxes.slice(1).reduce((acc, axes) => {
        const overlap = axes.filter((a) => allTopAxes[0].includes(a)).length;
        return acc + (allTopAxes[0].length > 0 ? overlap / allTopAxes[0].length : 0);
      }, 0) / (allTopAxes.length - 1)
    : 1;

  return {
    likeRate,
    avgDecisionTimeMs,
    topAxes,
    axisVariety,
    avgVisitCount,
    segmentIndex: segments[0].segmentIndex,
    // Store extra info for classification
    ...({ axisConsistency } as Record<string, number>),
  };
}

export function classifyEra(metrics: WindowMetrics): EraType {
  const { likeRate, avgDecisionTimeMs, avgVisitCount } = metrics;
  const axisConsistency = (metrics as unknown as Record<string, number>).axisConsistency ?? 0.5;

  // deepening: slow decisions + high revisit count
  if (avgDecisionTimeMs != null && avgDecisionTimeMs > 40_000 && avgVisitCount > 2) {
    return "deepening";
  }

  // crystallization: consistent axes + moderate like rate + fast decisions
  if (axisConsistency > 0.7 && likeRate >= 0.3 && likeRate <= 0.5 &&
      avgDecisionTimeMs != null && avgDecisionTimeMs < 20_000) {
    return "crystallization";
  }

  // focus: narrowing + consistent top axes
  if (likeRate >= 0.3 && likeRate <= 0.5 && axisConsistency > 0.5) {
    return "focus";
  }

  // exploration: broad, high like rate
  if (likeRate > 0.6) {
    return "exploration";
  }

  // wandering: low consistency, shifting axes
  if (axisConsistency < 0.3) {
    return "wandering";
  }

  // Default
  return likeRate < 0.3 ? "focus" : "exploration";
}

// ── Transition Insight ──

function buildTransitionInsight(
  fromEra: DecisionEra,
  toEra: DecisionEra,
  delta: OrbiterDelta | null,
): EraTransitionInsight {
  const retrospectives: Record<EraType, string> = {
    exploration: "あの時期は、可能性を広げていた。",
    focus: "あの時期は、自分の基準を確認していた。",
    wandering: "あの時期は、自分の基準を壊して作り直していた。",
    deepening: "あの時期は、一人ひとりと深く向き合っていた。",
    crystallization: "あの時期は、もう答えが見えていた。",
  };

  const triggers: Record<string, string> = {
    [`exploration_to_focus`]: "好みが見えてきた",
    [`exploration_to_wandering`]: "探索に疲れが出てきた",
    [`focus_to_deepening`]: "絞り込みから深掘りへ",
    [`focus_to_wandering`]: "基準が揺らぎ始めた",
    [`wandering_to_focus`]: "新しい基準が芽生えた",
    [`wandering_to_exploration`]: "リセットして再出発",
    [`deepening_to_crystallization`]: "深掘りが確信に変わった",
    [`deepening_to_wandering`]: "深く考えすぎて迷い始めた",
    [`crystallization_to_exploration`]: "確信から再び探索へ",
  };

  const key = `${fromEra.type}_to_${toEra.type}`;
  const trigger = triggers[key] ?? (delta?.narrative ?? "パターンが変化した");

  return {
    fromEra: fromEra.type,
    toEra: toEra.type,
    retrospective: retrospectives[fromEra.type],
    trigger,
  };
}

// ── DB Functions ──

export async function loadEraSnapshots(
  supabase: SupabaseClient,
  userId: string,
): Promise<DecisionEra[]> {
  const { data } = await supabase
    .from("orbiter_era_snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return [];

  return data.map((row, i) => ({
    type: row.era_type as EraType,
    label: ERA_LABELS[row.era_type as EraType] ?? row.era_type,
    index: i,
    startDate: row.start_date,
    decisionCount: row.decision_count,
    characterization: ERA_DESCRIPTIONS[row.era_type as EraType] ?? "",
    metrics: row.metrics as { likeRate: number; avgDecisionTimeMs: number | null; topAxes: TraitAxisKey[] },
  }));
}

export function persistEraSnapshot(
  supabase: SupabaseClient,
  era: {
    userId: string;
    eraType: string;
    startDate: string;
    decisionCount: number;
    metrics: unknown;
  },
): void {
  void (async () => {
    await supabase.from("orbiter_era_snapshots").insert({
      user_id: era.userId,
      era_type: era.eraType,
      start_date: era.startDate,
      decision_count: era.decisionCount,
      metrics: era.metrics,
    });
  })();
}
