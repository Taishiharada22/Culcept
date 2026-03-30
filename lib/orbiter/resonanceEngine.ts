// ============================================================
// Orbiter Phase 4: 越境共鳴 (Cross-Domain Resonance)
//
// Stargazerの性格軸 × Orbiterの判断パターン。
// 別のシステムが、同じ答えを別の角度から出している時——
// それは偶然ではなく、ユーザーの深層構造が浮かび上がっている。
//
// "あなたの性格は分析的。でも選ぶのはいつも直感的な人。
//  ——自分にないものを求めているのか、それとも？"
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { getAxisLabels } from "@/lib/stargazer/traitAxes";
import type {
  AttractionProfile,
  BreakpointTrigger,
  CrossCandidatePattern,
  AvoidanceMap,
  ResonanceInsight,
  ResonanceCorrelation,
  CrossDomainResonance,
} from "./types";

// ── Constants ──

const MIN_ATTRACTION_AXES = 2;
const SELF_SCORE_EXTREME_THRESHOLD = 0.4;
const MAX_INSIGHTS = 3;

// Caution code → Stargazer safety axis mapping
const CAUTION_TO_SAFETY_AXIS: Record<string, TraitAxisKey> = {
  conflict_style_gap: "escalation_risk" as TraitAxisKey,
  distance_need_gap: "boundary_respect" as TraitAxisKey,
  emotional_expression_gap: "emotional_regulation" as TraitAxisKey,
  depth_progression_gap: "intimacy_pace" as TraitAxisKey,
  initiative_gap: "social_initiative" as TraitAxisKey,
};

// ── Main ──

export function computeResonance(params: {
  selfAxisScores: Partial<Record<TraitAxisKey, number>>;
  attractionProfile: AttractionProfile | null;
  avoidanceMap: AvoidanceMap | null;
  crossPatterns: CrossCandidatePattern[];
  breakpointTriggers: BreakpointTrigger[];
}): CrossDomainResonance | null {
  const {
    selfAxisScores,
    attractionProfile,
    avoidanceMap,
    crossPatterns,
    breakpointTriggers,
  } = params;

  if (!attractionProfile?.instantAttraction) return null;

  const topAxes = attractionProfile.instantAttraction.topAxes;
  if (topAxes.length < MIN_ATTRACTION_AXES) return null;

  const insights: ResonanceInsight[] = [];

  // ── 1. Complementary vs Similarity Detection ──

  let complementaryCount = 0;
  let similarityCount = 0;

  for (const aw of topAxes.slice(0, 5)) {
    const selfScore = selfAxisScores[aw.axis];
    if (selfScore == null) continue;

    const labels = getAxisLabels(aw.axis);
    const axisLabel = labels ? `${labels.left} ↔ ${labels.right}` : aw.axis;

    // Same sign = seeking similar; opposite sign = seeking complementary
    if (Math.sign(selfScore) !== Math.sign(aw.weight) && Math.abs(selfScore) > 0.2 && Math.abs(aw.weight) > 0.2) {
      complementaryCount++;

      if (insights.length < MAX_INSIGHTS) {
        const selfPole = selfScore > 0
          ? labels?.right ?? "right"
          : labels?.left ?? "left";
        const attractedPole = aw.weight > 0
          ? labels?.right ?? "right"
          : labels?.left ?? "left";

        insights.push({
          source: "stargazer",
          correlation: "complementary_seeking",
          stargazerAxis: aw.axis,
          stargazerAxisLabel: axisLabel,
          selfScore,
          attractionWeight: aw.weight,
          insight: `自分は「${selfPole}」寄りなのに、「${attractedPole}」の人に惹かれている。`,
          confidence: Math.min(0.8, aw.confidence * 0.7 + 0.2),
        });
      }
    } else if (Math.sign(selfScore) === Math.sign(aw.weight) && Math.abs(selfScore) > 0.2) {
      similarityCount++;

      // Only report similarity if it's a dominant pattern
      if (similarityCount >= 3 && insights.length < MAX_INSIGHTS && !insights.some((i) => i.correlation === "similarity_seeking")) {
        insights.push({
          source: "stargazer",
          correlation: "similarity_seeking",
          stargazerAxis: aw.axis,
          stargazerAxisLabel: axisLabel,
          selfScore,
          attractionWeight: aw.weight,
          insight: "自分と似たタイプに一貫して惹かれている。",
          confidence: Math.min(0.75, aw.confidence * 0.6 + 0.2),
        });
      }
    }
  }

  // ── 2. Safety-Friction Link Detection ──

  let safetyFrictionLink = false;

  for (const trigger of breakpointTriggers) {
    if (trigger.sensitivityScore < 0.6) continue;

    const safetyAxis = CAUTION_TO_SAFETY_AXIS[trigger.cautionCode];
    if (!safetyAxis) continue;

    const selfScore = selfAxisScores[safetyAxis];
    if (selfScore == null || Math.abs(selfScore) < SELF_SCORE_EXTREME_THRESHOLD) continue;

    safetyFrictionLink = true;

    if (insights.length < MAX_INSIGHTS) {
      const labels = getAxisLabels(safetyAxis);
      const axisLabel = labels ? `${labels.left} ↔ ${labels.right}` : safetyAxis;
      const cautionLabel = trigger.cautionCode.replace(/_/g, " ");

      insights.push({
        source: "stargazer_safety",
        correlation: "safety_friction_link",
        stargazerAxis: safetyAxis,
        stargazerAxisLabel: axisLabel,
        orbiterPattern: trigger.cautionCode,
        selfScore,
        attractionWeight: trigger.sensitivityScore,
        insight: `${cautionLabel}への敏感さは、あなた自身の${axisLabel}傾向と繋がっている。`,
        confidence: Math.min(0.75, trigger.sensitivityScore * 0.6 + 0.2),
      });
    }
  }

  // ── 3. Unexpected Correlation: Self-Avoidance ──

  if (avoidanceMap) {
    for (const avAxis of avoidanceMap.axes) {
      const selfScore = selfAxisScores[avAxis.axis];
      if (selfScore == null) continue;

      // If the user strongly has this axis trait AND avoids it in others
      if (
        Math.abs(selfScore) > SELF_SCORE_EXTREME_THRESHOLD &&
        Math.sign(selfScore) === Math.sign(avAxis.avoidedDirection)
      ) {
        if (insights.length < MAX_INSIGHTS) {
          insights.push({
            source: "cross_domain",
            correlation: "unexpected_correlation",
            stargazerAxis: avAxis.axis,
            stargazerAxisLabel: avAxis.axisLabel,
            orbiterPattern: "avoidance",
            selfScore,
            attractionWeight: -avAxis.strength,
            insight: "自分の中にあるものを、他者の中で避けている。",
            confidence: Math.min(0.7, avAxis.strength * 0.5 + (avoidanceMap?.confidence ?? 0.5) * 0.3),
          });
        }
        break; // one self-avoidance insight is enough
      }
    }
  }

  if (insights.length === 0) return null;

  // Sort by confidence
  insights.sort((a, b) => b.confidence - a.confidence);

  // Determine overall theme
  let overallTheme: CrossDomainResonance["overallTheme"] = null;
  if (complementaryCount > similarityCount && complementaryCount >= 2) {
    overallTheme = "complementary_seeker";
  } else if (similarityCount > complementaryCount && similarityCount >= 2) {
    overallTheme = "similarity_seeker";
  } else if (complementaryCount > 0 && similarityCount > 0) {
    overallTheme = "complex";
  }

  return {
    insights: insights.slice(0, MAX_INSIGHTS),
    overallTheme,
    safetyFrictionLink,
  };
}
