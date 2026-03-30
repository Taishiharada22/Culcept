/**
 * Temporal Matching Engine
 * ユーザーの「現在地」ではなく「行き先」に基づいてマッチングする。
 * 未来の自分への「橋」となる人を見つける。
 */

import type { MatchingVector, RendezvousCategory } from "./types";

// ============================================================
// Types
// ============================================================

export type FutureSelf = {
  /** 推定された未来のベクトル (3ヶ月後) */
  projectedVector: Partial<MatchingVector>;
  /** 変化の確信度 */
  confidence: number;
  /** 推定される成長テーマ */
  growthTheme: GrowthTheme;
  /** 日本語の未来描写 */
  futureNarrative: string;
};

export type GrowthTheme =
  | "opening_up"
  | "finding_depth"
  | "gaining_courage"
  | "finding_peace"
  | "embracing_chaos"
  | "building_bridges"
  | "discovering_voice"
  | "letting_go";

export type TemporalMatch = {
  candidateId: string;
  /** この人は、あなたの未来の自分への「橋」*/
  bridgeScore: number;
  bridgeType: BridgeType;
  bridgeLabel: string;
  bridgeNarrative: string;
  /** どの軸であなたの未来に近づくか */
  bridgeAxes: {
    axis: string;
    label: string;
    currentGap: number;
    futureAlignment: number;
  }[];
};

export type BridgeType =
  | "already_there"
  | "walking_together"
  | "pulling_forward"
  | "mirror_of_future"
  | "catalyst_of_change";

// ============================================================
// Constants
// ============================================================

const GROWTH_THEME_LABELS: Record<GrowthTheme, string> = {
  opening_up: "心を開いていく",
  finding_depth: "深さを見つけていく",
  gaining_courage: "勇気を得ていく",
  finding_peace: "安らぎを見つけていく",
  embracing_chaos: "混沌を受け入れていく",
  building_bridges: "橋を架けていく",
  discovering_voice: "声を見つけていく",
  letting_go: "手放していく",
};

const BRIDGE_TYPE_LABELS: Record<BridgeType, string> = {
  already_there: "すでにそこにいる人",
  walking_together: "一緒に歩いている人",
  pulling_forward: "前に引っ張る人",
  mirror_of_future: "未来の鏡",
  catalyst_of_change: "変化の触媒",
};

const AXIS_LABELS: Record<string, string> = {
  conversation_temperature: "会話の温度",
  distance_need: "距離感",
  depth_speed: "深さの速度",
  stability_need: "安定への欲求",
  stimulation_need: "刺激への欲求",
  initiative: "主体性",
  emotional_openness: "感情の開放度",
  conflict_directness: "衝突への直接性",
  social_energy: "社交エネルギー",
  structure_preference: "構造への好み",
};

const MATCHING_VECTOR_KEYS: (keyof MatchingVector)[] = [
  "conversation_temperature",
  "distance_need",
  "depth_speed",
  "stability_need",
  "stimulation_need",
  "initiative",
  "emotional_openness",
  "conflict_directness",
  "social_energy",
  "structure_preference",
];

// ============================================================
// Project future self from historical vector changes
// ============================================================

export function projectFutureSelf(
  snapshots: { vector: Partial<MatchingVector>; timestamp: string }[],
  currentVector: MatchingVector,
  monthsAhead: number = 3,
): FutureSelf {
  // Need at least 3 snapshots for meaningful projection
  if (snapshots.length < 3) {
    return {
      projectedVector: { ...currentVector },
      confidence: 0.1,
      growthTheme: detectGrowthTheme(snapshots),
      futureNarrative: "まだ十分なデータがありません。あなたの軌跡がもう少し蓄積されると、未来の姿が見えてきます。",
    };
  }

  // Sort by timestamp ascending
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const projectedVector: Partial<MatchingVector> = {};
  let totalConfidence = 0;
  let axisCount = 0;

  for (const key of MATCHING_VECTOR_KEYS) {
    const values: { t: number; v: number }[] = [];
    const firstTime = new Date(sorted[0].timestamp).getTime();

    for (const snap of sorted) {
      const val = snap.vector[key];
      if (val !== undefined) {
        const t =
          (new Date(snap.timestamp).getTime() - firstTime) /
          (1000 * 60 * 60 * 24 * 30); // months
        values.push({ t, v: val });
      }
    }

    if (values.length < 2) {
      (projectedVector as Record<string, number>)[key] = currentVector[key];
      continue;
    }

    // Linear regression
    const { slope, intercept, rSquared } = linearRegression(values);

    // Project forward
    const lastT = values[values.length - 1].t;
    const futureT = lastT + monthsAhead;
    let projected = slope * futureT + intercept;

    // Clip to 0..1
    projected = Math.max(0, Math.min(1, projected));

    (projectedVector as Record<string, number>)[key] = projected;
    totalConfidence += rSquared;
    axisCount++;
  }

  // Overall confidence: average R-squared, scaled by data point count
  const dataPointFactor = Math.min(1, snapshots.length / 10);
  const confidence =
    axisCount > 0
      ? Math.min(0.95, (totalConfidence / axisCount) * dataPointFactor)
      : 0.1;

  const growthTheme = detectGrowthTheme(sorted);
  const futureNarrative = generateFutureNarrative(
    currentVector,
    projectedVector as MatchingVector,
    growthTheme,
    confidence,
  );

  return {
    projectedVector,
    confidence: Math.round(confidence * 100) / 100,
    growthTheme,
    futureNarrative,
  };
}

// ============================================================
// Find temporal matches
// ============================================================

export function findTemporalMatches(
  myFutureSelf: FutureSelf,
  myCurrentVector: MatchingVector,
  candidates: {
    id: string;
    vector: MatchingVector;
    category: RendezvousCategory;
  }[],
): TemporalMatch[] {
  const results: TemporalMatch[] = [];

  for (const candidate of candidates) {
    const bridgeType = detectBridgeType(
      myCurrentVector,
      myFutureSelf,
      candidate.vector,
    );

    if (!bridgeType) continue;

    const bridgeAxes = computeBridgeAxes(
      myCurrentVector,
      myFutureSelf.projectedVector as MatchingVector,
      candidate.vector,
    );

    const bridgeScore = computeBridgeScore(
      bridgeType,
      bridgeAxes,
      myFutureSelf.confidence,
    );

    // Only include meaningful matches
    if (bridgeScore < 30) continue;

    const bridgeNarrative = generateBridgeNarrative(
      bridgeType,
      bridgeAxes,
      myFutureSelf.growthTheme,
    );

    results.push({
      candidateId: candidate.id,
      bridgeScore,
      bridgeType,
      bridgeLabel: BRIDGE_TYPE_LABELS[bridgeType],
      bridgeNarrative,
      bridgeAxes,
    });
  }

  // Sort by bridge score descending
  results.sort((a, b) => b.bridgeScore - a.bridgeScore);
  return results.slice(0, 20);
}

// ============================================================
// Detect growth theme from vector trajectory
// ============================================================

export function detectGrowthTheme(
  snapshots: { vector: Partial<MatchingVector>; timestamp: string }[],
): GrowthTheme {
  if (snapshots.length < 2) return "finding_depth";

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const first = sorted[0].vector;
  const last = sorted[sorted.length - 1].vector;

  // Compute deltas for each axis
  const deltas: { key: string; delta: number }[] = [];
  for (const key of MATCHING_VECTOR_KEYS) {
    const v0 = first[key] ?? 0.5;
    const v1 = last[key] ?? 0.5;
    deltas.push({ key, delta: v1 - v0 });
  }

  // Sort by absolute delta
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const strongest = deltas[0];

  if (!strongest || Math.abs(strongest.delta) < 0.05) return "finding_depth";

  // Map dominant change to theme
  const key = strongest.key;
  const dir = strongest.delta > 0 ? "up" : "down";

  if (key === "emotional_openness" && dir === "up") return "opening_up";
  if (key === "emotional_openness" && dir === "down") return "finding_peace";
  if (key === "depth_speed" && dir === "up") return "finding_depth";
  if (key === "depth_speed" && dir === "down") return "letting_go";
  if (key === "initiative" && dir === "up") return "gaining_courage";
  if (key === "initiative" && dir === "down") return "finding_peace";
  if (key === "stimulation_need" && dir === "up") return "embracing_chaos";
  if (key === "stimulation_need" && dir === "down") return "finding_peace";
  if (key === "social_energy" && dir === "up") return "building_bridges";
  if (key === "social_energy" && dir === "down") return "finding_depth";
  if (key === "conflict_directness" && dir === "up") return "discovering_voice";
  if (key === "conflict_directness" && dir === "down") return "finding_peace";
  if (key === "stability_need" && dir === "down") return "embracing_chaos";
  if (key === "distance_need" && dir === "down") return "opening_up";
  if (key === "conversation_temperature" && dir === "up") return "opening_up";
  if (key === "structure_preference" && dir === "down") return "letting_go";

  return "finding_depth";
}

// ============================================================
// Internal helpers
// ============================================================

function linearRegression(
  points: { t: number; v: number }[],
): { slope: number; intercept: number; rSquared: number } {
  const n = points.length;
  let sumT = 0;
  let sumV = 0;
  let sumTT = 0;
  let sumTV = 0;

  for (const { t, v } of points) {
    sumT += t;
    sumV += v;
    sumTT += t * t;
    sumTV += t * v;
  }

  const denominator = n * sumTT - sumT * sumT;
  if (Math.abs(denominator) < 1e-10) {
    return { slope: 0, intercept: sumV / n, rSquared: 0 };
  }

  const slope = (n * sumTV - sumT * sumV) / denominator;
  const intercept = (sumV - slope * sumT) / n;

  // R-squared
  const meanV = sumV / n;
  let ssRes = 0;
  let ssTot = 0;
  for (const { t, v } of points) {
    const predicted = slope * t + intercept;
    ssRes += (v - predicted) ** 2;
    ssTot += (v - meanV) ** 2;
  }

  const rSquared = ssTot > 1e-10 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { slope, intercept, rSquared };
}

function vectorDistance(
  a: Partial<MatchingVector>,
  b: Partial<MatchingVector>,
): number {
  let sum = 0;
  let count = 0;
  for (const key of MATCHING_VECTOR_KEYS) {
    const va = (a as Record<string, number>)[key];
    const vb = (b as Record<string, number>)[key];
    if (va !== undefined && vb !== undefined) {
      sum += (va - vb) ** 2;
      count++;
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : 1;
}

function detectBridgeType(
  myCurrentVector: MatchingVector,
  myFutureSelf: FutureSelf,
  otherVector: MatchingVector,
): BridgeType | null {
  const futureVector = myFutureSelf.projectedVector as MatchingVector;
  const distToFuture = vectorDistance(otherVector, futureVector);
  const distToCurrent = vectorDistance(otherVector, myCurrentVector);

  // Count axes where other is ahead of me in my growth direction
  let aheadCount = 0;
  let sameDirectionCount = 0;
  let differenceOnChangingAxes = 0;
  let changingAxesCount = 0;

  for (const key of MATCHING_VECTOR_KEYS) {
    const myCurrent = myCurrentVector[key];
    const myFuture = (futureVector as Record<string, number>)[key] ?? myCurrent;
    const other = otherVector[key];
    const myDelta = myFuture - myCurrent;

    if (Math.abs(myDelta) < 0.05) continue;

    changingAxesCount++;
    const otherRelative = other - myCurrent;

    // Same direction?
    if (Math.sign(otherRelative) === Math.sign(myDelta)) {
      sameDirectionCount++;
      // Ahead?
      if (Math.abs(otherRelative) > Math.abs(myDelta) * 0.3) {
        aheadCount++;
      }
    }

    differenceOnChangingAxes += Math.abs(other - myCurrent);
  }

  // already_there: other's current is close to my projected future
  if (distToFuture < 0.15) return "already_there";

  // mirror_of_future: close to projected AND high confidence axes
  if (distToFuture < 0.2 && myFutureSelf.confidence > 0.4) return "mirror_of_future";

  // walking_together: same direction on 3+ axes
  if (sameDirectionCount >= 3) return "walking_together";

  // pulling_forward: 0.1-0.3 ahead on growing axes
  if (aheadCount >= 2 && distToCurrent > 0.1 && distToCurrent < 0.3)
    return "pulling_forward";

  // catalyst_of_change: very different but on axes I'm actively changing
  if (
    changingAxesCount >= 2 &&
    differenceOnChangingAxes / changingAxesCount > 0.2
  )
    return "catalyst_of_change";

  // No significant temporal bridge
  return null;
}

function computeBridgeAxes(
  myCurrentVector: MatchingVector,
  myFutureVector: MatchingVector,
  otherVector: MatchingVector,
): { axis: string; label: string; currentGap: number; futureAlignment: number }[] {
  const axes: {
    axis: string;
    label: string;
    currentGap: number;
    futureAlignment: number;
  }[] = [];

  for (const key of MATCHING_VECTOR_KEYS) {
    const myCurrent = myCurrentVector[key];
    const myFuture = (myFutureVector as Record<string, number>)[key] ?? myCurrent;
    const other = otherVector[key];

    const currentGap = Math.abs(myCurrent - other);
    const futureAlignment = 1 - Math.abs(myFuture - other);

    // Only include axes with meaningful bridge potential
    if (futureAlignment > 0.7 && currentGap > 0.1) {
      axes.push({
        axis: key,
        label: AXIS_LABELS[key] ?? key,
        currentGap: Math.round(currentGap * 100) / 100,
        futureAlignment: Math.round(futureAlignment * 100) / 100,
      });
    }
  }

  axes.sort((a, b) => b.futureAlignment - a.futureAlignment);
  return axes.slice(0, 5);
}

function computeBridgeScore(
  bridgeType: BridgeType,
  bridgeAxes: { currentGap: number; futureAlignment: number }[],
  confidence: number,
): number {
  // Base score from bridge type
  const typeScores: Record<BridgeType, number> = {
    already_there: 85,
    mirror_of_future: 80,
    pulling_forward: 75,
    walking_together: 70,
    catalyst_of_change: 65,
  };

  let score = typeScores[bridgeType];

  // Boost from bridge axes alignment
  if (bridgeAxes.length > 0) {
    const avgAlignment =
      bridgeAxes.reduce((sum, a) => sum + a.futureAlignment, 0) /
      bridgeAxes.length;
    score += (avgAlignment - 0.7) * 30; // up to +9
  }

  // Scale by confidence
  score = score * (0.5 + confidence * 0.5);

  return Math.round(Math.max(0, Math.min(100, score)));
}

function generateFutureNarrative(
  current: MatchingVector,
  projected: MatchingVector,
  theme: GrowthTheme,
  confidence: number,
): string {
  const themeLabel = GROWTH_THEME_LABELS[theme];

  if (confidence < 0.2) {
    return `あなたの軌跡はまだ描かれ始めたばかり。「${themeLabel}」という兆しが見えます。`;
  }

  // Find the most changing axis
  let maxDelta = 0;
  let maxAxis = "";
  for (const key of MATCHING_VECTOR_KEYS) {
    const delta = Math.abs(
      (projected as Record<string, number>)[key] - current[key],
    );
    if (delta > maxDelta) {
      maxDelta = delta;
      maxAxis = key;
    }
  }

  const axisLabel = AXIS_LABELS[maxAxis] ?? maxAxis;

  if (confidence > 0.6) {
    return `3ヶ月後のあなたは、「${themeLabel}」道を歩んでいるでしょう。特に「${axisLabel}」の変化が顕著です。この成長を加速させる出会いがあなたを待っています。`;
  }

  return `あなたの内面は「${themeLabel}」方向へ動いています。「${axisLabel}」の変化が鍵になりそうです。`;
}

function generateBridgeNarrative(
  bridgeType: BridgeType,
  bridgeAxes: { axis: string; label: string; futureAlignment: number }[],
  growthTheme: GrowthTheme,
): string {
  const themeLabel = GROWTH_THEME_LABELS[growthTheme];
  const axesText =
    bridgeAxes.length > 0
      ? bridgeAxes
          .slice(0, 2)
          .map((a) => `「${a.label}」`)
          .join("と")
      : "複数の軸";

  const narratives: Record<BridgeType, string> = {
    already_there: `この人は、あなたが「${themeLabel}」先にたどり着いた姿に近い存在です。${axesText}において、あなたの未来と今の彼らが重なります。`,
    walking_together: `あなたと同じ「${themeLabel}」方向へ歩んでいる人です。${axesText}で同じ風を感じながら、互いに励まし合える関係になるでしょう。`,
    pulling_forward: `あなたの「${themeLabel}」道を、少し先から照らしてくれる存在です。${axesText}において、あなたの一歩先を歩いています。`,
    mirror_of_future: `この人と出会うことで、未来のあなた自身を垣間見ることができるかもしれません。${axesText}が、その鏡となるでしょう。`,
    catalyst_of_change: `この人の存在が、あなたの「${themeLabel}」を加速させる触媒になりえます。${axesText}での違いが、新しい可能性を開くでしょう。`,
  };

  return narratives[bridgeType];
}
