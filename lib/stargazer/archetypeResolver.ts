// lib/stargazer/archetypeResolver.ts
// 45 trait axes -> 4-axis archetype resolver
// 軸スコア(-1.0 ~ +1.0)から 24 アーキタイプ(3×2×2×2)を判定

import type { TraitAxisKey } from "./traitAxes";
import {
  type ArchetypeCode,
  type ArchetypeDef,
  type DualView,
  type CognitionCode,
  type EmotionCode,
  type SocialCode,
  type ExecutionCode,
  buildArchetypeCode,
  getArchetypeByCode,
  ARCHETYPE_DEFS,
} from "./archetypeTypes";
import type { BeliefSet } from "./bayesianAxisUpdater";
import {
  computeUncertaintyWeightedScore,
  computeBeliefBasedConfidence,
} from "./informationGain";

// Legacy re-exports for backwards compatibility
export type Layer1Code = CognitionCode;
export type Layer2Code = EmotionCode;
export type Layer3Code = SocialCode;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Cognition axis scores: A(分析), N(直感), S(体感) */
export interface CognitionScores {
  A: number;
  N: number;
  S: number;
}

/** Emotion axis scores: C(静), V(動) */
export interface EmotionScores {
  C: number;
  V: number;
}

/** Social axis scores: I(内向), E(外向) */
export interface SocialScores {
  I: number;
  E: number;
}

/** Execution axis scores: O(最適化), X(探索) */
export interface ExecutionScores {
  O: number;
  X: number;
}

// Legacy aliases
export type Layer1Scores = CognitionScores;
export type Layer2Scores = EmotionScores;
export type Layer3Scores = SocialScores;

/** Full archetype resolution result */
export interface ArchetypeResult {
  /** 4-letter archetype code e.g. "ACIO" */
  code: ArchetypeCode;
  /** Cognition axis: how you think */
  layer1: {
    code: CognitionCode;
    score: number;
    scores: Record<CognitionCode, number>;
  };
  /** Emotion axis: how emotions move */
  layer2: {
    code: EmotionCode;
    score: number;
    scores: Record<EmotionCode, number>;
  };
  /** Social axis: energy direction */
  layer3: {
    code: SocialCode;
    score: number;
    scores: Record<SocialCode, number>;
  };
  /** Execution axis: how you act */
  layer4: {
    code: ExecutionCode;
    score: number;
    scores: Record<ExecutionCode, number>;
  };
  /** Overall confidence 0-1 based on score separation */
  confidence: number;
  /** Top 3 archetype matches with scores */
  topMatches: { code: ArchetypeCode; score: number }[];
  /** 二面性フラグ（矛盾エンジンから） */
  dualityFlags?: { axis: string; strength: number }[];
  /** レイヤー間相互作用のインサイト */
  interactionInsights?: string[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Weight Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type WeightMap = Partial<Record<TraitAxisKey, number>>;

// --- Axis 1: Cognition Weights (3-way: A/N/S) ---

/** A (分析 / Analytical): データ・論理・構造で判断 */
const COGNITION_A_WEIGHTS: WeightMap = {
  analytical_vs_intuitive: -0.9,
  plan_vs_spontaneous: -0.7,
  abstract_structuring: 0.8,
  decomposition: 0.7,
  decision_tempo: -0.5,
  cognitive_updating: 0.4,
  exploration_closure: -0.6,
};

/** N (直感 / iNtuitive): パターン・閃き・文脈で判断 */
const COGNITION_N_WEIGHTS: WeightMap = {
  analytical_vs_intuitive: 0.9,
  tradition_vs_novelty: 0.7,
  exploration_closure: 0.5,
  cognitive_updating: 0.6,
  growth_mindset: 0.4,
  social_modeling: 0.3,
  abstract_structuring: 0.3,
};

/** S (体感 / Sensory): 身体感覚・五感・実体験で判断 */
const COGNITION_S_WEIGHTS: WeightMap = {
  function_vs_expression: 0.6,
  minimal_vs_maximal: 0.5,
  classic_vs_trendy: 0.4,
  plan_vs_spontaneous: 0.5,
  decision_tempo: 0.4,
  decomposition: -0.3,
  abstract_structuring: -0.5,
};

// --- Axis 2: Emotion Weights (binary: C/V) ---

/** C (静 / Calm): 感情は制御下、波は小さい */
const EMOTION_C_WEIGHTS: WeightMap = {
  emotional_regulation: 0.9,
  emotional_variability: -0.8,
  reassurance_need: -0.6,
  rumination_tendency: -0.4,
  shame_vs_guilt: -0.3,
  public_private_gap: -0.5,
  attachment_style: -0.4,
  relationship_mode_split: -0.5,
  locus_of_control: 0.3,
};

/** V (動 / Vivid): 感情がはっきり動く、喜怒哀楽が表に出る */
const EMOTION_V_WEIGHTS: WeightMap = {
  emotional_variability: 0.8,
  emotional_regulation: -0.9,
  reassurance_need: 0.6,
  rumination_tendency: 0.5,
  shame_vs_guilt: 0.4,
  public_private_gap: 0.5,
  attachment_style: 0.4,
  relationship_mode_split: 0.5,
  locus_of_control: -0.3,
};

// --- Axis 3: Social Weights (binary: I/E) ---

/** I (内向 / Internal): 一人の時間でエネルギー充電 */
const SOCIAL_I_WEIGHTS: WeightMap = {
  introvert_vs_extrovert: -0.9,
  individual_vs_social: -0.8,
  social_initiative: -0.7,
  stress_isolation_vs_social: -0.7,
  intimacy_pace: -0.5,
  direct_vs_diplomatic: 0.3,
  independence_vs_harmony: -0.5,
  boundary_awareness: 0.4,
  social_modeling: -0.3,
  friend_mode_fit: -0.4,
  fairness_sensitivity: 0.2,
};

/** E (外向 / External): 人といることでエネルギーが生まれる */
const SOCIAL_E_WEIGHTS: WeightMap = {
  introvert_vs_extrovert: 0.9,
  individual_vs_social: 0.8,
  social_initiative: 0.7,
  stress_isolation_vs_social: 0.7,
  intimacy_pace: 0.5,
  direct_vs_diplomatic: -0.3,
  independence_vs_harmony: 0.5,
  boundary_awareness: -0.3,
  social_modeling: 0.4,
  friend_mode_fit: 0.4,
  fairness_sensitivity: -0.2,
};

// --- Axis 4: Execution Weights (binary: O/X) ---

/** O (最適化 / Optimize): 最短距離、効率、合理性 */
const EXECUTION_O_WEIGHTS: WeightMap = {
  perfectionist_vs_pragmatic: -0.7,
  quality_vs_quantity: -0.6,
  change_embrace_vs_resist: -0.5,
  tradition_vs_novelty: -0.4,
  cautious_vs_bold: -0.5,
  plan_vs_spontaneous: -0.4,
  intent_stability: 0.5,
  control_tendency: 0.4,
  function_vs_expression: -0.3,
  growth_mindset: -0.2,
  locus_of_control: 0.3,
};

/** X (探索 / eXplore): 試行錯誤、発見、適応 */
const EXECUTION_X_WEIGHTS: WeightMap = {
  change_embrace_vs_resist: 0.7,
  growth_mindset: 0.6,
  tradition_vs_novelty: 0.5,
  cautious_vs_bold: 0.5,
  plan_vs_spontaneous: 0.5,
  exploration_closure: 0.5,
  cognitive_updating: 0.4,
  perfectionist_vs_pragmatic: 0.4,
  quality_vs_quantity: 0.3,
  intent_stability: -0.4,
  control_tendency: -0.3,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scoring Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function computeWeightedScore(
  axes: Partial<Record<TraitAxisKey, number>>,
  weights: WeightMap
): number {
  let score = 0;
  for (const [axis, weight] of Object.entries(weights) as [TraitAxisKey, number][]) {
    const axisValue = axes[axis] ?? 0;
    score += axisValue * weight;
  }
  return score;
}

/** Calculate Cognition scores: A, N, S */
export function calculateLayer1Scores(
  axes: Partial<Record<TraitAxisKey, number>>
): Record<CognitionCode, number> {
  return {
    A: computeWeightedScore(axes, COGNITION_A_WEIGHTS),
    N: computeWeightedScore(axes, COGNITION_N_WEIGHTS),
    S: computeWeightedScore(axes, COGNITION_S_WEIGHTS),
  };
}

/** Calculate Emotion scores: C, V */
export function calculateLayer2Scores(
  axes: Partial<Record<TraitAxisKey, number>>
): Record<EmotionCode, number> {
  return {
    C: computeWeightedScore(axes, EMOTION_C_WEIGHTS),
    V: computeWeightedScore(axes, EMOTION_V_WEIGHTS),
  };
}

/** Calculate Social scores: I, E */
export function calculateLayer3Scores(
  axes: Partial<Record<TraitAxisKey, number>>
): Record<SocialCode, number> {
  return {
    I: computeWeightedScore(axes, SOCIAL_I_WEIGHTS),
    E: computeWeightedScore(axes, SOCIAL_E_WEIGHTS),
  };
}

/** Calculate Execution scores: O, X */
export function calculateLayer4Scores(
  axes: Partial<Record<TraitAxisKey, number>>
): Record<ExecutionCode, number> {
  return {
    O: computeWeightedScore(axes, EXECUTION_O_WEIGHTS),
    X: computeWeightedScore(axes, EXECUTION_X_WEIGHTS),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Resolution Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface LayerResolution<T extends string> {
  winner: T;
  winnerScore: number;
  runnerUp: T;
  runnerUpScore: number;
  margin: number;
}

function resolveLayer<T extends string>(
  scores: Record<T, number>,
  codes: readonly T[]
): LayerResolution<T> {
  const sorted = [...codes].sort((a, b) => scores[b] - scores[a]);
  const winner = sorted[0];
  const runnerUp = sorted[1];
  const winnerScore = scores[winner];
  const runnerUpScore = scores[runnerUp];

  const denominator = Math.max(Math.abs(winnerScore), 0.01);
  const margin = Math.min(Math.max((winnerScore - runnerUpScore) / denominator, 0), 1);

  return { winner, winnerScore, runnerUp, runnerUpScore, margin };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Resolver
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const COGNITION_CODES: readonly CognitionCode[] = ["A", "N", "S"] as const;
const EMOTION_CODES: readonly EmotionCode[] = ["C", "V"] as const;
const SOCIAL_CODES: readonly SocialCode[] = ["I", "E"] as const;
const EXECUTION_CODES: readonly ExecutionCode[] = ["O", "X"] as const;

/**
 * Resolve 45 trait axes into a full ArchetypeResult.
 *
 * 1. Calculate weighted scores for each axis
 * 2. Pick the winner per axis -> 4-letter ArchetypeCode
 * 3. Compute confidence from score margins
 * 4. Generate top 3 matches by swapping the weakest margins
 */
export function resolveArchetype(
  axes: Partial<Record<TraitAxisKey, number>>
): ArchetypeResult {
  // Step 1: Calculate raw scores
  const cogScores = calculateLayer1Scores(axes);
  const emoScores = calculateLayer2Scores(axes);
  const socScores = calculateLayer3Scores(axes);
  const exeScores = calculateLayer4Scores(axes);

  // Step 2: Resolve each axis
  const cog = resolveLayer(cogScores, COGNITION_CODES);
  const emo = resolveLayer(emoScores, EMOTION_CODES);
  const soc = resolveLayer(socScores, SOCIAL_CODES);
  const exe = resolveLayer(exeScores, EXECUTION_CODES);

  // Step 3: Build the primary archetype code
  const primaryCode = buildArchetypeCode(cog.winner, emo.winner, soc.winner, exe.winner);

  // Step 4: Confidence = average of 4 axis margins, with data-volume penalty
  const avgMargin = (cog.margin + emo.margin + soc.margin + exe.margin) / 4;
  const axisCount = Object.keys(axes).filter((k) => axes[k as TraitAxisKey] !== undefined).length;
  const dataPenalty = Math.min(1, Math.sqrt(axisCount / 45) * 0.7 + 0.3);
  const confidence = Math.min(Math.max(avgMargin * dataPenalty, 0), 1);

  // Step 5: Top 3 matches
  const primaryScore = cog.winnerScore + emo.winnerScore + soc.winnerScore + exe.winnerScore;

  // Sort axes by margin ascending (smallest margin = most uncertain)
  const axisMargins = ([
    { axis: "cognition" as const, margin: cog.margin, runnerUp: cog.runnerUp },
    { axis: "emotion" as const, margin: emo.margin, runnerUp: emo.runnerUp },
    { axis: "social" as const, margin: soc.margin, runnerUp: soc.runnerUp },
    { axis: "execution" as const, margin: exe.margin, runnerUp: exe.runnerUp },
  ]).sort((a, b) => a.margin - b.margin);

  // #2: swap the axis with smallest margin to its runner-up
  const swap1 = axisMargins[0];
  const code2Cog = swap1.axis === "cognition" ? (swap1.runnerUp as CognitionCode) : cog.winner;
  const code2Emo = swap1.axis === "emotion" ? (swap1.runnerUp as EmotionCode) : emo.winner;
  const code2Soc = swap1.axis === "social" ? (swap1.runnerUp as SocialCode) : soc.winner;
  const code2Exe = swap1.axis === "execution" ? (swap1.runnerUp as ExecutionCode) : exe.winner;
  const code2 = buildArchetypeCode(code2Cog, code2Emo, code2Soc, code2Exe);
  const score2 = (swap1.axis === "cognition" ? cogScores[code2Cog] : cog.winnerScore)
    + (swap1.axis === "emotion" ? emoScores[code2Emo] : emo.winnerScore)
    + (swap1.axis === "social" ? socScores[code2Soc] : soc.winnerScore)
    + (swap1.axis === "execution" ? exeScores[code2Exe] : exe.winnerScore);

  // #3: swap the axis with second-smallest margin to its runner-up
  const swap2 = axisMargins[1];
  const code3Cog = swap2.axis === "cognition" ? (swap2.runnerUp as CognitionCode) : cog.winner;
  const code3Emo = swap2.axis === "emotion" ? (swap2.runnerUp as EmotionCode) : emo.winner;
  const code3Soc = swap2.axis === "social" ? (swap2.runnerUp as SocialCode) : soc.winner;
  const code3Exe = swap2.axis === "execution" ? (swap2.runnerUp as ExecutionCode) : exe.winner;
  const code3 = buildArchetypeCode(code3Cog, code3Emo, code3Soc, code3Exe);
  const score3 = (swap2.axis === "cognition" ? cogScores[code3Cog] : cog.winnerScore)
    + (swap2.axis === "emotion" ? emoScores[code3Emo] : emo.winnerScore)
    + (swap2.axis === "social" ? socScores[code3Soc] : soc.winnerScore)
    + (swap2.axis === "execution" ? exeScores[code3Exe] : exe.winnerScore);

  // Normalize scores
  const maxScore = primaryScore || 1;
  const topMatches: { code: ArchetypeCode; score: number }[] = [
    { code: primaryCode, score: primaryScore / maxScore },
    { code: code2, score: score2 / maxScore },
    { code: code3, score: score3 / maxScore },
  ];

  return {
    code: primaryCode,
    layer1: {
      code: cog.winner,
      score: cog.winnerScore,
      scores: cogScores,
    },
    layer2: {
      code: emo.winner,
      score: emo.winnerScore,
      scores: emoScores,
    },
    layer3: {
      code: soc.winner,
      score: soc.winnerScore,
      scores: socScores,
    },
    layer4: {
      code: exe.winner,
      score: exe.winnerScore,
      scores: exeScores,
    },
    confidence,
    topMatches,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Dual Archetype Resolution (Three Mirror System)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ズレの種類 */
export type ArchetypeDivergenceType =
  | "same"
  | "cognition_differs"
  | "emotion_differs"
  | "social_differs"
  | "execution_differs"
  | "multi_differs";

/** 主観 vs 客観のアーキタイプ比較結果 */
export interface DualArchetypeResult {
  subjective: ArchetypeResult;
  objective: ArchetypeResult;
  isSame: boolean;
  divergenceType: ArchetypeDivergenceType;
  layerDifferences: {
    layer1Differs: boolean;
    layer2Differs: boolean;
    layer3Differs: boolean;
    layer4Differs: boolean;
  };
  subjectiveDualView?: DualView;
  objectiveDualView?: DualView;
  divergenceInsight: string;
}

export function resolveArchetypeDual(
  subjectiveAxes: Partial<Record<TraitAxisKey, number>>,
  objectiveAxes: Partial<Record<TraitAxisKey, number>>
): DualArchetypeResult {
  const subjective = resolveArchetype(subjectiveAxes);
  const objective = resolveArchetype(objectiveAxes);

  const layer1Differs = subjective.layer1.code !== objective.layer1.code;
  const layer2Differs = subjective.layer2.code !== objective.layer2.code;
  const layer3Differs = subjective.layer3.code !== objective.layer3.code;
  const layer4Differs = subjective.layer4.code !== objective.layer4.code;

  const isSame = !layer1Differs && !layer2Differs && !layer3Differs && !layer4Differs;

  let divergenceType: ArchetypeDivergenceType;
  const diffCount = [layer1Differs, layer2Differs, layer3Differs, layer4Differs].filter(Boolean).length;
  if (diffCount === 0) {
    divergenceType = "same";
  } else if (diffCount >= 2) {
    divergenceType = "multi_differs";
  } else if (layer1Differs) {
    divergenceType = "cognition_differs";
  } else if (layer2Differs) {
    divergenceType = "emotion_differs";
  } else if (layer3Differs) {
    divergenceType = "social_differs";
  } else {
    divergenceType = "execution_differs";
  }

  const subjectiveDef = getArchetypeByCode(subjective.code);
  const objectiveDef = getArchetypeByCode(objective.code);

  const divergenceInsight = generateDivergenceInsight(
    subjective,
    objective,
    divergenceType,
    subjectiveDef,
    objectiveDef
  );

  return {
    subjective,
    objective,
    isSame,
    divergenceType,
    layerDifferences: { layer1Differs, layer2Differs, layer3Differs, layer4Differs },
    subjectiveDualView: subjectiveDef?.dualView,
    objectiveDualView: objectiveDef?.dualView,
    divergenceInsight,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Uncertainty-Weighted Archetype Resolution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 不確実性を考慮したアーキタイプ判定
 *
 * 従来の resolveArchetype は mu 値のみ使用 → precision 0.5 も 50 も同じ扱い。
 * この関数は各軸の precision を使って:
 *   1. 低確信軸の影響を減衰（uncertaintyWeight）
 *   2. confidence を precision coverage で補正
 *   3. 結果の解釈可能性を向上（「まだ分からない」を正しく表現）
 *
 * @param axes     軸スコア (mu 値)
 * @param beliefs  軸のベイズ信念 (precision を使用)
 * @returns 不確実性を反映した ArchetypeResult
 */
export function resolveArchetypeWithUncertainty(
  axes: Partial<Record<TraitAxisKey, number>>,
  beliefs: BeliefSet,
): ArchetypeResult {
  // Step 1: 不確実性加重でレイヤースコアを計算
  const cogScores: Record<CognitionCode, number> = {
    A: computeUncertaintyWeightedScore(axes, beliefs, COGNITION_A_WEIGHTS),
    N: computeUncertaintyWeightedScore(axes, beliefs, COGNITION_N_WEIGHTS),
    S: computeUncertaintyWeightedScore(axes, beliefs, COGNITION_S_WEIGHTS),
  };
  const emoScores: Record<EmotionCode, number> = {
    C: computeUncertaintyWeightedScore(axes, beliefs, EMOTION_C_WEIGHTS),
    V: computeUncertaintyWeightedScore(axes, beliefs, EMOTION_V_WEIGHTS),
  };
  const socScores: Record<SocialCode, number> = {
    I: computeUncertaintyWeightedScore(axes, beliefs, SOCIAL_I_WEIGHTS),
    E: computeUncertaintyWeightedScore(axes, beliefs, SOCIAL_E_WEIGHTS),
  };
  const exeScores: Record<ExecutionCode, number> = {
    O: computeUncertaintyWeightedScore(axes, beliefs, EXECUTION_O_WEIGHTS),
    X: computeUncertaintyWeightedScore(axes, beliefs, EXECUTION_X_WEIGHTS),
  };

  // Step 2: Resolve each layer
  const cog = resolveLayer(cogScores, COGNITION_CODES);
  const emo = resolveLayer(emoScores, EMOTION_CODES);
  const soc = resolveLayer(socScores, SOCIAL_CODES);
  const exe = resolveLayer(exeScores, EXECUTION_CODES);

  // Step 3: Build archetype code
  const primaryCode = buildArchetypeCode(cog.winner, emo.winner, soc.winner, exe.winner);

  // Step 4: 不確実性ベースの confidence
  // margin × precision coverage (beliefs の精度が低いと confidence が下がる)
  const layerWeights = [
    COGNITION_A_WEIGHTS, EMOTION_C_WEIGHTS, SOCIAL_I_WEIGHTS, EXECUTION_O_WEIGHTS,
  ];
  const layerMargins = [cog.margin, emo.margin, soc.margin, exe.margin];
  const confidence = computeBeliefBasedConfidence(beliefs, layerWeights, layerMargins);

  // Step 5: Top 3 matches (same logic as original)
  const primaryScore = cog.winnerScore + emo.winnerScore + soc.winnerScore + exe.winnerScore;
  const axisMargins = ([
    { axis: "cognition" as const, margin: cog.margin, runnerUp: cog.runnerUp },
    { axis: "emotion" as const, margin: emo.margin, runnerUp: emo.runnerUp },
    { axis: "social" as const, margin: soc.margin, runnerUp: soc.runnerUp },
    { axis: "execution" as const, margin: exe.margin, runnerUp: exe.runnerUp },
  ]).sort((a, b) => a.margin - b.margin);

  const swap1 = axisMargins[0];
  const code2Cog = swap1.axis === "cognition" ? (swap1.runnerUp as CognitionCode) : cog.winner;
  const code2Emo = swap1.axis === "emotion" ? (swap1.runnerUp as EmotionCode) : emo.winner;
  const code2Soc = swap1.axis === "social" ? (swap1.runnerUp as SocialCode) : soc.winner;
  const code2Exe = swap1.axis === "execution" ? (swap1.runnerUp as ExecutionCode) : exe.winner;
  const code2 = buildArchetypeCode(code2Cog, code2Emo, code2Soc, code2Exe);
  const score2 = (swap1.axis === "cognition" ? cogScores[code2Cog] : cog.winnerScore)
    + (swap1.axis === "emotion" ? emoScores[code2Emo] : emo.winnerScore)
    + (swap1.axis === "social" ? socScores[code2Soc] : soc.winnerScore)
    + (swap1.axis === "execution" ? exeScores[code2Exe] : exe.winnerScore);

  const swap2 = axisMargins[1];
  const code3Cog = swap2.axis === "cognition" ? (swap2.runnerUp as CognitionCode) : cog.winner;
  const code3Emo = swap2.axis === "emotion" ? (swap2.runnerUp as EmotionCode) : emo.winner;
  const code3Soc = swap2.axis === "social" ? (swap2.runnerUp as SocialCode) : soc.winner;
  const code3Exe = swap2.axis === "execution" ? (swap2.runnerUp as ExecutionCode) : exe.winner;
  const code3 = buildArchetypeCode(code3Cog, code3Emo, code3Soc, code3Exe);
  const score3 = (swap2.axis === "cognition" ? cogScores[code3Cog] : cog.winnerScore)
    + (swap2.axis === "emotion" ? emoScores[code3Emo] : emo.winnerScore)
    + (swap2.axis === "social" ? socScores[code3Soc] : soc.winnerScore)
    + (swap2.axis === "execution" ? exeScores[code3Exe] : exe.winnerScore);

  const maxScore = primaryScore || 1;
  const topMatches: { code: ArchetypeCode; score: number }[] = [
    { code: primaryCode, score: primaryScore / maxScore },
    { code: code2, score: score2 / maxScore },
    { code: code3, score: score3 / maxScore },
  ];

  return {
    code: primaryCode,
    layer1: { code: cog.winner, score: cog.winnerScore, scores: cogScores },
    layer2: { code: emo.winner, score: emo.winnerScore, scores: emoScores },
    layer3: { code: soc.winner, score: soc.winnerScore, scores: socScores },
    layer4: { code: exe.winner, score: exe.winnerScore, scores: exeScores },
    confidence,
    topMatches,
  };
}

function generateDivergenceInsight(
  subjective: ArchetypeResult,
  objective: ArchetypeResult,
  divergenceType: ArchetypeDivergenceType,
  subjectiveDef: ArchetypeDef | undefined,
  objectiveDef: ArchetypeDef | undefined
): string {
  if (divergenceType === "same") {
    return "自分が語る自分と、行動・投影が映す自分が一致しています。自己認識の精度が高い状態です。";
  }

  const subName = subjectiveDef?.name ?? subjective.code;
  const objName = objectiveDef?.name ?? objective.code;

  switch (divergenceType) {
    case "cognition_differs":
      return `自分では「${subName}」として考えていますが、行動データは「${objName}」の認知パターンを示しています。考え方の自己認識にズレがあり、ここに自己理解を深める鍵があります。`;
    case "emotion_differs":
      return `認知スタイルは一致していますが、感情の動き方に主観と客観のズレがあります。自分では「${subName}」型の感情パターンだと思っていますが、実際は「${objName}」型の反応が観測されています。`;
    case "social_differs":
      return `認知と感情は一致していますが、対人エネルギーの方向にズレがあります。「${subName}」のように振る舞うと思っていますが、実際は「${objName}」の社交パターンを示しています。`;
    case "execution_differs":
      return `基本的な傾向は一致していますが、実行スタイルにズレがあります。「${subName}」のように動くと思っていますが、実際は「${objName}」のパターンで動いています。`;
    case "multi_differs":
      return `自分が語る自分（${subName}）と、行動が映す自分（${objName}）に複数の軸でズレがあります。これは複雑で豊かな内面構造の表れです。このズレの探索が、最も深い自己発見につながります。`;
    default:
      return "";
  }
}
