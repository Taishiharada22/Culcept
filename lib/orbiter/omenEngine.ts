// ============================================================
// Orbiter Phase 5: 予兆エンジン (Omen Engine)
//
// 変化が起きる前に、その兆しを検出する。
// 地層の境界、原理の揺らぎ、影への接近、パターンの溶解——
// Orbiter は過去を分析するだけでなく、未来を予見する。
//
// "何かが変わり始めている。まだ気づいていないかもしれないが。"
// ============================================================

import type {
  PrincipleMap,
  ArchetypeResonance,
  DecisionStratigraphy,
  AnomalyArchive,
  OrbiterDelta,
  OrbiterMaturity,
  OmenType,
  Omen,
  OmenForecast,
} from "./types";

// ── Constants ──

const MAX_OMENS = 2;
const ERA_BOUNDARY_WINDOW = 5;
const ERA_BOUNDARY_SATURATION = 0.8;
const PRINCIPLE_SHIFT_GAP = 0.4;
const SHADOW_PULL_THRESHOLD = 0.35;
const ANOMALY_COUNT_THRESHOLD = 3;

// ── Main ──

export function detectOmens(params: {
  principleMap: PrincipleMap | null;
  archetypeResonance: ArchetypeResonance | null;
  stratigraphy: DecisionStratigraphy | null;
  anomalyArchive: AnomalyArchive | null;
  delta: OrbiterDelta | null;
  maturity: OrbiterMaturity | null;
}): OmenForecast | null {
  // Need at least some data to detect omens
  const hasData =
    params.principleMap ||
    params.archetypeResonance ||
    params.stratigraphy ||
    params.anomalyArchive;
  if (!hasData) return null;

  const omens: Omen[] = [];

  // Detect each type independently
  const eraBoundary = detectEraBoundary(params.stratigraphy, params.delta);
  if (eraBoundary) omens.push(eraBoundary);

  const principleShift = detectPrincipleShift(params.principleMap);
  if (principleShift) omens.push(principleShift);

  const shadowApproach = detectShadowApproach(params.archetypeResonance);
  if (shadowApproach) omens.push(shadowApproach);

  const patternDissolution = detectPatternDissolution(params.anomalyArchive);
  if (patternDissolution) omens.push(patternDissolution);

  if (omens.length === 0) return null;

  // Sort by confidence, take top MAX_OMENS
  omens.sort((a, b) => b.confidence - a.confidence);
  const topOmens = omens.slice(0, MAX_OMENS);

  // Overall readiness: weighted average of top omen confidences
  const overallReadiness =
    topOmens.reduce((s, o) => s + o.confidence, 0) / topOmens.length;

  // Narrative from highest confidence omen
  const narrative = topOmens[0].prediction;

  return {
    omens: topOmens,
    overallReadiness,
    narrative,
  };
}

// ── Omen Detectors ──

function detectEraBoundary(
  stratigraphy: DecisionStratigraphy | null,
  delta: OrbiterDelta | null,
): Omen | null {
  if (!stratigraphy?.currentEra) return null;

  const currentEra = stratigraphy.currentEra;
  const saturation = currentEra.decisionCount / ERA_BOUNDARY_WINDOW;

  // Era is "full" and delta suggests movement
  const isShifting = delta?.overallDirection === "shifting";
  const isSaturated = saturation >= ERA_BOUNDARY_SATURATION;

  if (!isSaturated && !isShifting) return null;

  let confidence = 0;
  if (isSaturated && isShifting) confidence = 0.7;
  else if (isSaturated) confidence = 0.5;
  else if (isShifting) confidence = 0.4;

  const eraLabel = currentEra.label ?? currentEra.type;

  return {
    type: "era_boundary",
    signal: `「${eraLabel}」が${currentEra.decisionCount}回目に達した`,
    prediction: `選び方のフェーズが変わりつつある。次の5回で新しい時代が始まる可能性がある`,
    confidence,
    timeHorizon: "近い将来",
  };
}

function detectPrincipleShift(
  principleMap: PrincipleMap | null,
): Omen | null {
  if (!principleMap) return null;

  // Check for tension
  if (principleMap.tension && principleMap.tension.gap >= PRINCIPLE_SHIFT_GAP) {
    const tension = principleMap.tension;
    const axisLabel = principleMap.principles.find(
      (p) => p.axis === tension.axis,
    )?.label ?? tension.axis;

    return {
      type: "principle_shift",
      signal: `「${axisLabel}」の原理に${tension.gap.toFixed(1)}の乖離がある`,
      prediction: `判断原理が揺らいでいる。言動と行動の間で方向転換が起きようとしている`,
      confidence: Math.min(0.8, tension.gap),
      timeHorizon: "中期的に",
    };
  }

  // Check for counter-principles emerging
  const withCounter = principleMap.principles.filter(
    (p) => p.counterPrinciple != null,
  );
  if (withCounter.length >= 2) {
    return {
      type: "principle_shift",
      signal: `${withCounter.length}つの原理で反対の兆候が出ている`,
      prediction: `複数の判断原理が同時に揺らいでいる。価値観の再構成が始まっている可能性がある`,
      confidence: 0.5,
      timeHorizon: "中期的に",
    };
  }

  return null;
}

function detectShadowApproach(
  archetypeResonance: ArchetypeResonance | null,
): Omen | null {
  if (!archetypeResonance) return null;

  if (archetypeResonance.growthPull < SHADOW_PULL_THRESHOLD) return null;

  return {
    type: "shadow_approach",
    signal: `影の「${archetypeResonance.shadowName}」への引力が${(archetypeResonance.growthPull * 100).toFixed(0)}%`,
    prediction: `${archetypeResonance.growthKey}`,
    confidence: Math.min(0.8, archetypeResonance.growthPull * archetypeResonance.confidence),
    timeHorizon: "近い将来",
  };
}

function detectPatternDissolution(
  anomalyArchive: AnomalyArchive | null,
): Omen | null {
  if (!anomalyArchive) return null;

  const recentCount = anomalyArchive.recent.length;
  if (recentCount < ANOMALY_COUNT_THRESHOLD) return null;

  const hasShift = anomalyArchive.hasPatternShift;

  return {
    type: "pattern_dissolution",
    signal: `直近で${recentCount}件のパターン破壊を検出`,
    prediction: hasShift
      ? "パターンが溶け始めている。新しい自分が生まれようとしている"
      : "いつもと違う選択が増えている。何かが変わり始めている",
    confidence: hasShift ? 0.7 : 0.5,
    timeHorizon: "近い将来",
  };
}
