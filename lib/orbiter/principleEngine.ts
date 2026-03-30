// ============================================================
// Orbiter Phase 5: 判断原理マップ (Decision Principle Map)
//
// 「何を選んだか」ではなく「なぜそう選ぶのか」。
// 行動データから5つの判断公理を抽出する。
//
// 嗜好(preference)ではなく構造的法則(principle):
//   安全 ↔ 冒険 / 密着 ↔ 距離 / 類似 ↔ 補完
//   直感 ↔ 熟考 / 安定 ↔ 成長
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { LikeHistoryItem } from "./signalAccumulator";
import type {
  AttractionProfile,
  BreakpointTrigger,
  CrossCandidatePattern,
  UserJudgmentProfile,
  AvoidanceMap,
  CrossDomainResonance,
  DecisionStratigraphy,
  AnomalyArchive,
  PrincipleAxis,
  DecisionPrinciple,
  PrincipleTension,
  PrincipleMap,
} from "./types";

// ── Constants ──

const MIN_DECISIONS = 8;
const TENSION_GAP_THRESHOLD = 0.4;
const COUNTER_PRINCIPLE_RATIO = 0.3;

// ── Axis labels ──

const PRINCIPLE_LABELS: Record<PrincipleAxis, string> = {
  safety_adventure: "安全 ↔ 冒険",
  closeness_distance: "密着 ↔ 距離",
  similarity_complement: "類似 ↔ 補完",
  intuition_deliberation: "直感 ↔ 熟考",
  stability_growth: "安定 ↔ 成長",
};

// ── Main ──

export function computePrincipleMap(params: {
  likeHistory: LikeHistoryItem[];
  attractionProfile: AttractionProfile | null;
  avoidanceMap: AvoidanceMap | null;
  crossPatterns: CrossCandidatePattern[];
  breakpointTriggers: BreakpointTrigger[];
  selfAxisScores: Partial<Record<TraitAxisKey, number>>;
  judgmentProfile: UserJudgmentProfile | null;
  resonance: CrossDomainResonance | null;
  stratigraphy: DecisionStratigraphy | null;
  anomalyArchive: AnomalyArchive | null;
}): PrincipleMap | null {
  const { likeHistory } = params;
  if (likeHistory.length < MIN_DECISIONS) return null;

  const likes = likeHistory.filter((h) => h.decision === "like");
  const passes = likeHistory.filter((h) => h.decision === "pass");
  const totalDecisions = likeHistory.length;

  const principles: DecisionPrinciple[] = [
    computeSafetyAdventure(params, likes, passes, totalDecisions),
    computeClosenessDistance(params, likes, passes, totalDecisions),
    computeSimilarityComplement(params, likes, totalDecisions),
    computeIntuitionDeliberation(params, likeHistory, totalDecisions),
    computeStabilityGrowth(params, likes, totalDecisions),
  ];

  // Find dominant principle (highest confidence with significant score magnitude)
  const ranked = [...principles].sort(
    (a, b) => Math.abs(b.score) * b.confidence - Math.abs(a.score) * a.confidence,
  );
  const dominantPrinciple = ranked[0].axis;

  // Detect tension (stated vs actual divergence)
  const tension = detectTension(params, principles);

  // Build narrative
  const dom = principles.find((p) => p.axis === dominantPrinciple)!;
  const domDirection = dom.score > 0
    ? dom.label.split(" ↔ ")[1]
    : dom.label.split(" ↔ ")[0];
  let narrative = `あなたは「${domDirection}」を軸に判断している`;
  if (tension) {
    narrative += `。ただし${tension.insight}`;
  }

  const avgConfidence =
    principles.reduce((s, p) => s + p.confidence, 0) / principles.length;

  return {
    principles,
    dominantPrinciple,
    tension,
    narrative,
    confidence: avgConfidence,
  };
}

// ── Axis Computers ──

function computeSafetyAdventure(
  params: {
    crossPatterns: CrossCandidatePattern[];
    breakpointTriggers: BreakpointTrigger[];
    avoidanceMap: AvoidanceMap | null;
  },
  likes: LikeHistoryItem[],
  passes: LikeHistoryItem[],
  total: number,
): DecisionPrinciple {
  let score = 0;
  let evidenceParts: string[] = [];
  let sampleCount = 0;

  // Friction tolerance from cross patterns
  const frictionPattern = params.crossPatterns.find(
    (p) => p.type === "friction_tolerance",
  );
  if (frictionPattern) {
    score += frictionPattern.confidence > 0.5 ? 0.3 : -0.2;
    evidenceParts.push("摩擦耐性パターンあり");
    sampleCount++;
  }

  // Breakpoint sensitivity average: high sensitivity → safety (-), low → adventure (+)
  if (params.breakpointTriggers.length > 0) {
    const avgSensitivity =
      params.breakpointTriggers.reduce((s, t) => s + t.sensitivityScore, 0) /
      params.breakpointTriggers.length;
    score += (0.5 - avgSensitivity) * 0.6; // high sensitivity → negative
    evidenceParts.push(`平均感度${avgSensitivity.toFixed(2)}`);
    sampleCount++;
  }

  // Avoidance: high divergence candidates avoided → safety
  if (params.avoidanceMap && params.avoidanceMap.axes.length > 0) {
    const avgAvoidStrength =
      params.avoidanceMap.axes.reduce((s, a) => s + a.strength, 0) /
      params.avoidanceMap.axes.length;
    score += -avgAvoidStrength * 0.4;
    sampleCount++;
  }

  score = clamp(score, -1, 1);
  const confidence = Math.min(1, sampleCount / 3);
  const direction = score > 0 ? "冒険" : "安全";
  const exceptions = score > 0
    ? passes.filter((p) => (p.timeToDecisionMs ?? 30000) > 30000).length
    : likes.filter((l) => (l.timeToDecisionMs ?? 30000) < 5000).length;

  return {
    axis: "safety_adventure",
    label: PRINCIPLE_LABELS.safety_adventure,
    score,
    confidence,
    evidence: evidenceParts.length > 0
      ? `${direction}寄り (${evidenceParts.join("、")})`
      : `${direction}寄りの判断傾向`,
    exceptions,
    counterPrinciple:
      exceptions / total > COUNTER_PRINCIPLE_RATIO
        ? `${score > 0 ? "安全" : "冒険"}への抑圧された欲求がある`
        : null,
  };
}

function computeClosenessDistance(
  params: {
    selfAxisScores: Partial<Record<TraitAxisKey, number>>;
    attractionProfile: AttractionProfile | null;
  },
  likes: LikeHistoryItem[],
  passes: LikeHistoryItem[],
  total: number,
): DecisionPrinciple {
  let score = 0;
  let sampleCount = 0;

  // Check boundary_respect and reassurance_need in liked candidates
  const closenessAxes: TraitAxisKey[] = [
    "boundary_respect" as TraitAxisKey,
    "reassurance_need" as TraitAxisKey,
    "intimacy_pace" as TraitAxisKey,
  ];

  if (likes.length > 0) {
    const avgCloseness = closenessAxes.reduce((sum, axis) => {
      const values = likes
        .map((l) => l.counterpartAxisScores[axis])
        .filter((v): v is number => v != null);
      if (values.length === 0) return sum;
      return sum + values.reduce((s, v) => s + v, 0) / values.length;
    }, 0) / closenessAxes.length;
    score += avgCloseness * 0.5;
    sampleCount++;
  }

  // Long detail views → closeness seeking
  const longViewLikes = likes.filter(
    (l) => (l.timeToDecisionMs ?? 0) > 45000,
  );
  if (longViewLikes.length > likes.length * 0.3) {
    score += 0.2;
    sampleCount++;
  }

  // Fast passes on emotionally intense → distance seeking
  const fastPasses = passes.filter(
    (p) => (p.timeToDecisionMs ?? 30000) < 10000,
  );
  if (fastPasses.length > passes.length * 0.4 && passes.length >= 3) {
    score -= 0.2;
    sampleCount++;
  }

  score = clamp(score, -1, 1);
  const confidence = Math.min(1, sampleCount / 3);
  const direction = score > 0 ? "密着" : "距離";
  const exceptions = score > 0
    ? fastPasses.length
    : longViewLikes.length;

  return {
    axis: "closeness_distance",
    label: PRINCIPLE_LABELS.closeness_distance,
    score,
    confidence,
    evidence: `${direction}を求める判断パターン`,
    exceptions,
    counterPrinciple:
      exceptions / Math.max(total, 1) > COUNTER_PRINCIPLE_RATIO
        ? `${score > 0 ? "距離" : "密着"}への隠れた志向がある`
        : null,
  };
}

function computeSimilarityComplement(
  params: {
    resonance: CrossDomainResonance | null;
    attractionProfile: AttractionProfile | null;
    selfAxisScores: Partial<Record<TraitAxisKey, number>>;
  },
  likes: LikeHistoryItem[],
  total: number,
): DecisionPrinciple {
  let score = 0;
  let sampleCount = 0;

  // Resonance theme directly maps
  if (params.resonance?.overallTheme) {
    if (params.resonance.overallTheme === "complementary_seeker") {
      score += 0.5;
    } else if (params.resonance.overallTheme === "similarity_seeker") {
      score -= 0.5;
    }
    sampleCount += 2;
  }

  // Attraction topAxes vs selfAxisScores sign comparison
  const topAxes = params.attractionProfile?.instantAttraction?.topAxes ?? [];
  if (topAxes.length > 0) {
    let sameSign = 0;
    let diffSign = 0;
    for (const aw of topAxes) {
      const selfVal = params.selfAxisScores[aw.axis];
      if (selfVal == null) continue;
      if (Math.sign(aw.weight) === Math.sign(selfVal)) {
        sameSign++;
      } else {
        diffSign++;
      }
    }
    const totalCompared = sameSign + diffSign;
    if (totalCompared > 0) {
      score += ((diffSign - sameSign) / totalCompared) * 0.4;
      sampleCount++;
    }
  }

  score = clamp(score, -1, 1);
  const confidence = Math.min(1, sampleCount / 3);
  const direction = score > 0 ? "補完" : "類似";
  const exceptions = Math.floor(
    likes.length * (score > 0 ? 0.2 : 0.2),
  );

  return {
    axis: "similarity_complement",
    label: PRINCIPLE_LABELS.similarity_complement,
    score,
    confidence,
    evidence: `${direction}を求める傾向`,
    exceptions,
    counterPrinciple:
      exceptions / Math.max(total, 1) > COUNTER_PRINCIPLE_RATIO
        ? `${score > 0 ? "類似" : "補完"}への無自覚な引力がある`
        : null,
  };
}

function computeIntuitionDeliberation(
  params: {
    judgmentProfile: UserJudgmentProfile | null;
    crossPatterns: CrossCandidatePattern[];
  },
  likeHistory: LikeHistoryItem[],
  total: number,
): DecisionPrinciple {
  let score = 0;
  let sampleCount = 0;

  // Average decision time
  const avgTime = params.judgmentProfile?.avgDecisionTimeMs;
  if (avgTime != null) {
    if (avgTime < 15000) {
      score -= 0.4; // Fast → intuition (-1 side)
    } else if (avgTime > 45000) {
      score += 0.4; // Slow → deliberation (+1 side)
    } else {
      score += ((avgTime - 30000) / 30000) * 0.3;
    }
    sampleCount++;
  }

  // Decision style from cross patterns
  const stylePattern = params.crossPatterns.find(
    (p) => p.type === "decision_style",
  );
  if (stylePattern) {
    // "直感型" in narrative → intuition, "熟考型" → deliberation
    if (stylePattern.narrative.includes("直感")) {
      score -= 0.3;
    } else if (
      stylePattern.narrative.includes("熟考") ||
      stylePattern.narrative.includes("慎重")
    ) {
      score += 0.3;
    }
    sampleCount++;
  }

  // Revisit frequency: high revisits → deliberation
  const revisitors = likeHistory.filter(
    (l) =>
      likeHistory.filter((h) => h.candidateId === l.candidateId).length > 1,
  );
  if (revisitors.length > likeHistory.length * 0.3) {
    score += 0.2;
    sampleCount++;
  }

  score = clamp(score, -1, 1);
  const confidence = Math.min(1, sampleCount / 3);
  const direction = score > 0 ? "熟考" : "直感";
  const fastDecisions = likeHistory.filter(
    (l) => (l.timeToDecisionMs ?? 30000) < 10000,
  ).length;
  const slowDecisions = likeHistory.filter(
    (l) => (l.timeToDecisionMs ?? 0) > 45000,
  ).length;
  const exceptions = score > 0 ? fastDecisions : slowDecisions;

  return {
    axis: "intuition_deliberation",
    label: PRINCIPLE_LABELS.intuition_deliberation,
    score,
    confidence,
    evidence: `${direction}型の判断スタイル`,
    exceptions,
    counterPrinciple:
      exceptions / Math.max(total, 1) > COUNTER_PRINCIPLE_RATIO
        ? `${score > 0 ? "直感" : "熟考"}に切り替わる瞬間がある`
        : null,
  };
}

function computeStabilityGrowth(
  params: {
    stratigraphy: DecisionStratigraphy | null;
    anomalyArchive: AnomalyArchive | null;
    selfAxisScores: Partial<Record<TraitAxisKey, number>>;
  },
  likes: LikeHistoryItem[],
  total: number,
): DecisionPrinciple {
  let score = 0;
  let sampleCount = 0;

  // Current era type
  const era = params.stratigraphy?.currentEra;
  if (era) {
    const eraScoreMap: Record<string, number> = {
      exploration: 0.4,
      focus: -0.1,
      wandering: 0.1,
      deepening: -0.2,
      crystallization: -0.5,
    };
    score += eraScoreMap[era.type] ?? 0;
    sampleCount++;
  }

  // Anomaly frequency: more anomalies → growth direction
  if (params.anomalyArchive) {
    const anomalyRate =
      params.anomalyArchive.totalCount / Math.max(total, 1);
    if (anomalyRate > 0.2) {
      score += 0.3;
    } else if (anomalyRate > 0.1) {
      score += 0.15;
    }
    sampleCount++;
  }

  // Likes outside comfort zone: check if liked candidates differ from self
  if (likes.length >= 3) {
    let outsideComfort = 0;
    for (const like of likes) {
      let diffCount = 0;
      let comparedCount = 0;
      for (const [axis, selfVal] of Object.entries(params.selfAxisScores)) {
        const counterVal = like.counterpartAxisScores[axis as TraitAxisKey];
        if (counterVal == null || selfVal == null) continue;
        comparedCount++;
        if (Math.abs(counterVal - selfVal) > 0.4) diffCount++;
      }
      if (comparedCount > 0 && diffCount / comparedCount > 0.4) {
        outsideComfort++;
      }
    }
    const outsideRatio = outsideComfort / likes.length;
    score += outsideRatio * 0.4;
    sampleCount++;
  }

  score = clamp(score, -1, 1);
  const confidence = Math.min(1, sampleCount / 3);
  const direction = score > 0 ? "成長" : "安定";
  const exceptions = Math.floor(likes.length * 0.15);

  return {
    axis: "stability_growth",
    label: PRINCIPLE_LABELS.stability_growth,
    score,
    confidence,
    evidence: `${direction}志向の判断構造`,
    exceptions,
    counterPrinciple:
      exceptions / Math.max(total, 1) > COUNTER_PRINCIPLE_RATIO
        ? `${score > 0 ? "安定" : "成長"}への隠れた欲求がある`
        : null,
  };
}

// ── Tension Detection ──

function detectTension(
  params: {
    attractionProfile: AttractionProfile | null;
    avoidanceMap: AvoidanceMap | null;
  },
  principles: DecisionPrinciple[],
): PrincipleTension | null {
  // Check attraction divergences as stated vs actual signal
  const divergences = params.attractionProfile?.divergences ?? [];
  if (divergences.length === 0) return null;

  // Find the principle with the largest implied divergence
  const simCompPrinciple = principles.find(
    (p) => p.axis === "similarity_complement",
  );
  const statedPref =
    params.attractionProfile?.statedPreferences?.similarityVsComplementarity;

  if (simCompPrinciple && statedPref != null) {
    // statedPref: 0-1 (0=similarity, 1=complementarity)
    const stated = statedPref * 2 - 1; // → -1..+1
    const actual = simCompPrinciple.score;
    const gap = Math.abs(stated - actual);
    if (gap >= TENSION_GAP_THRESHOLD) {
      const statedLabel = stated > 0 ? "補完" : "類似";
      const actualLabel = actual > 0 ? "補完" : "類似";
      return {
        axis: "similarity_complement",
        stated,
        actual,
        gap,
        insight: `「${statedLabel}を求める」と言いながら、実際は「${actualLabel}」を選んでいる`,
      };
    }
  }

  // Also check avoidance paradoxes
  if (params.avoidanceMap?.paradoxes.length) {
    const paradox = params.avoidanceMap.paradoxes[0];
    // Map paradox to closest principle axis
    const safetyPrinciple = principles.find(
      (p) => p.axis === "safety_adventure",
    );
    if (safetyPrinciple) {
      return {
        axis: "safety_adventure",
        stated: -safetyPrinciple.score,
        actual: safetyPrinciple.score,
        gap: Math.abs(safetyPrinciple.score) * 2,
        insight: paradox.narrative,
      };
    }
  }

  return null;
}

// ── Helpers ──

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
