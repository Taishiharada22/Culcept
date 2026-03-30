// ============================================================
// UserFeatureVector 生成ロジック
// 回答群から共通特徴量を生成する
// ============================================================

import type {
  UserFeatureVector,
  UserQuestionResponse,
  FeatureKey,
} from "./types";
import { QUESTION_MAP } from "./questionMaster";

/**
 * ユーザーの全回答から特徴量ベクトルを生成
 *
 * 各質問のfeatureMappingに基づいて、回答値 × contribution で
 * 特徴量を算出し、0..1に正規化する
 */
export function buildFeatureVector(
  userId: string,
  responses: UserQuestionResponse[],
): UserFeatureVector {
  const featureAccum = new Map<FeatureKey, { sum: number; weight: number }>();

  for (const resp of responses) {
    const question = QUESTION_MAP.get(resp.questionId);
    if (!question) continue;

    // 回答値を0..1に正規化
    const rawValue =
      typeof resp.answerValue === "number"
        ? resp.answerValue
        : parseFloat(String(resp.answerValue)) || 3;
    const sMin = question.scaleMin ?? 1;
    const sMax = question.scaleMax ?? 5;
    const normalizedAnswer = Math.max(
      0,
      Math.min(1, (rawValue - sMin) / (sMax - sMin)),
    );

    for (const mapping of question.featureMapping) {
      const existing = featureAccum.get(mapping.featureKey) ?? {
        sum: 0,
        weight: 0,
      };

      // contribution: -1..1
      // positiveなら回答が高いほど特徴量が高い
      // negativeなら回答が高いほど特徴量が低い
      const contribution = mapping.contribution;
      const absContribution = Math.abs(contribution);

      const featureValue =
        contribution >= 0 ? normalizedAnswer : 1 - normalizedAnswer;

      existing.sum += featureValue * absContribution;
      existing.weight += absContribution;
      featureAccum.set(mapping.featureKey, existing);
    }
  }

  // 重み付き平均で0..1に落とし込む
  const features: Partial<Record<FeatureKey, number>> = {};
  for (const [key, { sum, weight }] of featureAccum) {
    if (weight > 0) {
      features[key] = Math.max(0, Math.min(1, sum / weight));
    }
  }

  return {
    userId,
    features,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 特徴量ベクトル同士の類似度を算出（コサイン類似度ベース）
 */
export function featureVectorSimilarity(
  vecA: UserFeatureVector,
  vecB: UserFeatureVector,
): number {
  const allKeys = new Set([
    ...Object.keys(vecA.features),
    ...Object.keys(vecB.features),
  ]) as Set<FeatureKey>;

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const key of allKeys) {
    const a = vecA.features[key] ?? 0.5; // 未回答は中立
    const b = vecB.features[key] ?? 0.5;
    dotProduct += a * b;
    magA += a * a;
    magB += b * b;
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}
