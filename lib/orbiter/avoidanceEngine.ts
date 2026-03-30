// ============================================================
// Orbiter Phase 4: 回避地図 (Avoidance Cartography)
//
// ユーザーの「ネガティブスペース」を可視化する。
// 何を選んだかではなく、何を一度も選ばなかったかが、
// ユーザーの無自覚な基準を浮き彫りにする。
//
// conscious avoidance:  即断pass (< 10s) — 本人も知っている
// unconscious avoidance: 長く見てからpass (> 30s) — 気づいていない
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { getAxisLabels } from "@/lib/stargazer/traitAxes";
import type { RendezvousPreferences } from "@/lib/rendezvous/types";
import type { LikeHistoryItem } from "./signalAccumulator";
import type {
  AttractionProfile,
  AvoidanceMap,
  AvoidanceAxis,
  AvoidanceParadox,
  AvoidanceQuality,
} from "./types";

// ── Thresholds ──

const MIN_DECISIONS = 10;
const MIN_PASS_SAMPLE = 3;
const CONSCIOUS_THRESHOLD_MS = 10_000;
const UNCONSCIOUS_THRESHOLD_MS = 30_000;
const AVOIDANCE_WEIGHT_THRESHOLD = 0.25;
const MAX_AXES = 5;

// ── Main ──

export function computeAvoidanceMap(params: {
  likeHistory: LikeHistoryItem[];
  statedPreferences: RendezvousPreferences | null;
  attractionProfile: AttractionProfile | null;
}): AvoidanceMap | null {
  const { likeHistory, statedPreferences, attractionProfile } = params;

  if (likeHistory.length < MIN_DECISIONS) return null;

  const passes = likeHistory.filter((h) => h.decision === "pass");
  if (passes.length < MIN_PASS_SAMPLE) return null;

  // ── Build avoidance axis weights ──

  const axisAcc: Record<string, { sum: number; count: number; timesMs: number[] }> = {};

  for (const p of passes) {
    for (const [axis, score] of Object.entries(p.counterpartAxisScores)) {
      if (score == null) continue;
      if (!axisAcc[axis]) axisAcc[axis] = { sum: 0, count: 0, timesMs: [] };
      axisAcc[axis].sum += score;
      axisAcc[axis].count += 1;
      if (p.timeToDecisionMs != null) {
        axisAcc[axis].timesMs.push(p.timeToDecisionMs);
      }
    }
  }

  // ── Filter to significant avoidance axes ──

  const rawAxes: AvoidanceAxis[] = [];

  for (const [axis, acc] of Object.entries(axisAcc)) {
    if (acc.count < MIN_PASS_SAMPLE) continue;

    const avgDirection = acc.sum / acc.count;
    const strength = Math.abs(avgDirection);

    if (strength < AVOIDANCE_WEIGHT_THRESHOLD) continue;

    // Determine conscious vs unconscious
    const avgTimeMs = acc.timesMs.length > 0
      ? acc.timesMs.reduce((a, b) => a + b, 0) / acc.timesMs.length
      : null;

    let quality: AvoidanceQuality = "conscious";
    if (avgTimeMs != null) {
      if (avgTimeMs > UNCONSCIOUS_THRESHOLD_MS) quality = "unconscious";
      else if (avgTimeMs < CONSCIOUS_THRESHOLD_MS) quality = "conscious";
      else quality = "conscious"; // middle ground → default to conscious
    }

    const labels = getAxisLabels(axis as TraitAxisKey);
    const axisLabel = labels
      ? `${labels.left} ↔ ${labels.right}`
      : axis;

    rawAxes.push({
      axis: axis as TraitAxisKey,
      axisLabel,
      strength: Math.min(1, strength),
      quality,
      sampleCount: acc.count,
      avoidedDirection: avgDirection,
    });
  }

  if (rawAxes.length === 0) return null;

  // Sort by strength, take top N
  const axes = rawAxes
    .sort((a, b) => b.strength - a.strength)
    .slice(0, MAX_AXES);

  // ── Detect paradoxes ──

  const paradoxes = detectParadoxes(axes, statedPreferences, attractionProfile);

  // ── Compute unconscious ratio ──

  const unconsciousCount = axes.filter((a) => a.quality === "unconscious").length;
  const unconsciousRatio = axes.length > 0 ? unconsciousCount / axes.length : 0;

  // ── Generate insight ──

  const insight = generateInsight(axes, paradoxes, unconsciousRatio);

  // ── Confidence ──

  const totalSamples = axes.reduce((s, a) => s + a.sampleCount, 0);
  const confidence = Math.min(0.9, 0.3 + totalSamples * 0.02);

  return { axes, paradoxes, unconsciousRatio, insight, confidence };
}

// ── Paradox Detection ──

function detectParadoxes(
  avoidanceAxes: AvoidanceAxis[],
  prefs: RendezvousPreferences | null,
  attraction: AttractionProfile | null,
): AvoidanceParadox[] {
  const paradoxes: AvoidanceParadox[] = [];

  if (!attraction?.instantAttraction) return paradoxes;

  // Check: is there an axis the user is attracted to BUT also avoids?
  for (const avAxis of avoidanceAxes) {
    const attractionMatch = attraction.instantAttraction.topAxes.find(
      (a) => a.axis === avAxis.axis && Math.sign(a.weight) === Math.sign(avAxis.avoidedDirection),
    );

    if (attractionMatch) {
      // The user is attracted to and avoids the same axis direction
      const labels = getAxisLabels(avAxis.axis);
      const dirLabel = avAxis.avoidedDirection > 0
        ? labels?.right ?? "right pole"
        : labels?.left ?? "left pole";

      paradoxes.push({
        axis: avAxis.axis,
        axisLabel: avAxis.axisLabel,
        statedDesire: `${dirLabel}に惹かれる傾向`,
        actualAvoidance: `${dirLabel}を実際には避けている`,
        narrative: `惹かれるのに避けている——${dirLabel}に対する両義的な感情がある。`,
      });
    }
  }

  // Check: stated preference conflicts with avoidance
  if (prefs && (prefs as Record<string, unknown>).desired_relation_types) {
    // Stated preference for similarity but avoids similar
    const simPref = (prefs as Record<string, unknown>).similarity_vs_complementarity;
    if (typeof simPref === "number" && simPref > 0.6) {
      // User wants similarity but may avoid people similar to themselves
      for (const avAxis of avoidanceAxes) {
        if (avAxis.quality === "unconscious" && !paradoxes.some((p) => p.axis === avAxis.axis)) {
          paradoxes.push({
            axis: avAxis.axis,
            axisLabel: avAxis.axisLabel,
            statedDesire: "似た人を求めている",
            actualAvoidance: `${avAxis.axisLabel}方向の人を無意識に避けている`,
            narrative: "似た人を求めると言いながら、ある種の類似性を無意識に避けている。",
          });
          break; // one paradox from stated prefs is enough
        }
      }
    }
  }

  return paradoxes;
}

// ── Insight Generation ──

function generateInsight(
  axes: AvoidanceAxis[],
  paradoxes: AvoidanceParadox[],
  unconsciousRatio: number,
): string | null {
  if (paradoxes.length > 0) {
    return paradoxes[0].narrative;
  }

  if (unconsciousRatio > 0.5) {
    const topUnconscious = axes.find((a) => a.quality === "unconscious");
    if (topUnconscious) {
      return `${topUnconscious.axisLabel}を無意識に避けている。理由を考えたことはある？`;
    }
  }

  if (axes.length > 0) {
    return `一度も選ばないタイプがある。それ自体が、ひとつの答えになっている。`;
  }

  return null;
}
