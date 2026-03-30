// ============================================================
// Rendezvous Scoring Engine
// finalWeight合成 / answerCompatibility / questionScore算出
// ============================================================

import type {
  ContextType,
  QuestionMaster,
  UserQuestionResponse,
  MatchingPattern,
} from "./types";
import {
  DEFAULT_ADJUSTMENT_FACTOR,
  MIN_ADJUSTMENT_FACTOR,
  MAX_ADJUSTMENT_FACTOR,
} from "./constants";

// ---------- Weight Synthesis ----------

/**
 * rigidityに基づいた実効adjustmentFactorを算出
 * rigidity高い → adjustmentFactor小さい（システム重み優先）
 * rigidity低い → adjustmentFactor大きい（ユーザー重み反映）
 */
export function effectiveAdjustmentFactor(rigidity: number): number {
  return lerp(MAX_ADJUSTMENT_FACTOR, MIN_ADJUSTMENT_FACTOR, rigidity);
}

/**
 * システム重みとユーザー重みの合成
 *
 * finalWeight = clamp(1, 5, round(systemWeight + (userWeight - 3) * adjustmentFactor))
 *
 * 期待挙動:
 * - system 3 / user 5 -> final 4
 * - system 5 / user 2 -> final 4前後
 * - system 2 / user 5 -> final 3前後
 */
export function computeFinalWeight(
  systemWeight: number,
  userWeight: number,
  rigidity: number,
): number {
  const adjFactor = effectiveAdjustmentFactor(rigidity);
  const raw = systemWeight + (userWeight - 3) * adjFactor;
  return clamp(1, 5, Math.round(raw));
}

/**
 * 特定のcontextにおける、ある質問のfinalWeightを算出
 */
export function computeQuestionFinalWeight(
  question: QuestionMaster,
  response: UserQuestionResponse,
  context: ContextType,
): number {
  const systemW = question.systemWeights[context];
  const userW = response.importanceByContext[context];
  return computeFinalWeight(systemW, userW, question.rigidity);
}

// ---------- Answer Compatibility ----------

/**
 * scale回答の値を0..1に正規化（1-5スケール → 0..1）
 */
export function normalizeScaleValue(
  value: number,
  min: number = 1,
  max: number = 5,
): number {
  return clamp(0, 1, (value - min) / (max - min));
}

/**
 * similarity型の相性判定: 近いほど高い
 */
export function similarityCompatibility(
  valueA: number,
  valueB: number,
  scaleMin: number = 1,
  scaleMax: number = 5,
): number {
  const normA = normalizeScaleValue(valueA, scaleMin, scaleMax);
  const normB = normalizeScaleValue(valueB, scaleMin, scaleMax);
  return Math.max(0, 1 - Math.abs(normA - normB));
}

/**
 * complementary型の相性判定: 補完し合うほど高い
 */
export function complementaryCompatibility(
  valueA: number,
  valueB: number,
  scaleMin: number = 1,
  scaleMax: number = 5,
): number {
  const normA = normalizeScaleValue(valueA, scaleMin, scaleMax);
  const normB = normalizeScaleValue(valueB, scaleMin, scaleMax);
  // 理想は normA + normB ≈ 1.0（片方が高ければもう片方が低い）
  const idealDist = Math.abs(normA + normB - 1);
  return Math.max(0, 1 - idealDist);
}

/**
 * importance_dependent型の相性判定:
 * 重要度が高い場合はsimilarityに近く、
 * 重要度が低い場合は影響度を下げる
 */
export function importanceDependentCompatibility(
  valueA: number,
  valueB: number,
  importanceA: number,
  importanceB: number,
  scaleMin: number = 1,
  scaleMax: number = 5,
): number {
  const sim = similarityCompatibility(valueA, valueB, scaleMin, scaleMax);
  // 双方の重要度の平均を0..1に変換
  const avgImportance = normalizeScaleValue(
    (importanceA + importanceB) / 2,
    1,
    5,
  );
  // 重要度が高い → simをそのまま返す
  // 重要度が低い → 0.5（中立）に近づく
  return sim * avgImportance + 0.5 * (1 - avgImportance);
}

/**
 * 質問タイプに応じたanswerCompatibility算出
 */
export function computeAnswerCompatibility(
  question: QuestionMaster,
  responseA: UserQuestionResponse,
  responseB: UserQuestionResponse,
  context: ContextType,
): number {
  const valA =
    typeof responseA.answerValue === "number"
      ? responseA.answerValue
      : parseFloat(String(responseA.answerValue)) || 3;
  const valB =
    typeof responseB.answerValue === "number"
      ? responseB.answerValue
      : parseFloat(String(responseB.answerValue)) || 3;

  const sMin = question.scaleMin ?? 1;
  const sMax = question.scaleMax ?? 5;

  switch (question.matchingPattern) {
    case "similarity":
      return similarityCompatibility(valA, valB, sMin, sMax);

    case "complementary":
      return complementaryCompatibility(valA, valB, sMin, sMax);

    case "importance_dependent":
      return importanceDependentCompatibility(
        valA,
        valB,
        responseA.importanceByContext[context],
        responseB.importanceByContext[context],
        sMin,
        sMax,
      );
  }
}

// ---------- Flexibility Modifier ----------

/**
 * flexibilityModifier:
 * 柔軟性が高いほどズレの減点を弱める
 *
 * flexibilityModifier = 1 - incompatibilityPenalty * (1 - flexAvg)
 */
export function computeFlexibilityModifier(
  answerCompatibility: number,
  flexA: number = 3,
  flexB: number = 3,
): number {
  const flexAvg = normalizeScaleValue((flexA + flexB) / 2, 1, 5);
  const incompatibilityPenalty = Math.max(0, 1 - answerCompatibility);
  return 1 - incompatibilityPenalty * (1 - flexAvg);
}

// ---------- Question Score ----------

/**
 * 各設問のスコア算出
 *
 * questionScore =
 *   answerCompatibility *
 *   finalWeightA *
 *   finalWeightB *
 *   flexibilityModifier
 *
 * 正規化して 0..1 に落とし込む
 */
export function computeQuestionScore(
  question: QuestionMaster,
  responseA: UserQuestionResponse,
  responseB: UserQuestionResponse,
  context: ContextType,
): {
  score: number; // 0..1 正規化済み
  rawScore: number;
  maxPossible: number;
  answerCompatibility: number;
  finalWeightA: number;
  finalWeightB: number;
  flexibilityModifier: number;
} {
  const answerCompat = computeAnswerCompatibility(
    question,
    responseA,
    responseB,
    context,
  );

  const finalWeightA = computeQuestionFinalWeight(question, responseA, context);
  const finalWeightB = computeQuestionFinalWeight(question, responseB, context);

  const flexA = responseA.flexibilityByContext?.[context] ?? 3;
  const flexB = responseB.flexibilityByContext?.[context] ?? 3;
  const flexMod = computeFlexibilityModifier(answerCompat, flexA, flexB);

  const rawScore = answerCompat * finalWeightA * finalWeightB * flexMod;
  const maxPossible = 5 * 5; // 最大 finalWeightA=5 * finalWeightB=5 * 1.0 * 1.0

  return {
    score: clamp(0, 1, rawScore / maxPossible),
    rawScore,
    maxPossible,
    answerCompatibility: answerCompat,
    finalWeightA,
    finalWeightB,
    flexibilityModifier: flexMod,
  };
}

// ---------- Helpers ----------

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
