import type { RendezvousCategory, MatchingVector, EvaluationResult } from "./types";
import { similarityScore } from "./similarityScore";
import type { RelationshipProcessVector } from "./relationshipProcess";
import type { LifePlanFitResult } from "./lifePlanVector";

// ---------- Category Thresholds ----------

const CATEGORY_THRESHOLDS: Record<RendezvousCategory, number> = {
  romantic: 0.72,
  friendship: 0.68,
  cocreation: 0.70,
  community: 0.66,
  partner: 0.78, // 最も高い閾値。人生を共にする相手には妥協しない
};

export function getThreshold(category: RendezvousCategory): number {
  return CATEGORY_THRESHOLDS[category];
}

export function isMutual(
  scoreAB: number,
  scoreBA: number,
  category: RendezvousCategory,
): boolean {
  const threshold = CATEGORY_THRESHOLDS[category];
  return scoreAB >= threshold && scoreBA >= threshold;
}

// ---------- Category Guards ----------

export function romanticGuard(result: EvaluationResult): boolean {
  return (
    (result.dimensions.distanceFit ?? 0) >= 0.55 &&
    (result.dimensions.depthFit ?? 0) >= 0.55 &&
    (result.dimensions.emotionalFit ?? 0) >= 0.55
  );
}

export function friendshipGuard(input: {
  selfVector: MatchingVector;
  otherVector: MatchingVector;
}): boolean {
  return (
    similarityScore(
      input.selfVector.conversation_temperature,
      input.otherVector.conversation_temperature,
    ) >= 0.45
  );
}

export function cocreationGuard(result: EvaluationResult): boolean {
  return (
    (result.dimensions.categoryAffinity ?? 0) >= 0.60 &&
    (result.dimensions.initiativeFit ?? 0) >= 0.50
  );
}

export function communityGuard(input: {
  selfVector: MatchingVector;
  otherVector: MatchingVector;
}): boolean {
  const socialGap = Math.abs(
    input.selfVector.social_energy - input.otherVector.social_energy,
  );
  return socialGap <= 0.65;
}

/**
 * パートナーガード — 最も厳格な品質保証（8次元）
 *
 * 結婚前提では「1つだけ高い」では不十分。
 * 全次元が一定水準を超える必要がある。
 *
 * Layer 1: MatchingVector ベースの行動互換性（5次元）
 * ① 距離感 ≥ 0.60: 同居で毎日影響する
 * ② 深さ ≥ 0.58: 関係の深め方が噛み合わないと長続きしない
 * ③ 感情 ≥ 0.60: 感情表現の差は長期で最も摩擦を生む
 * ④ 衝突 ≥ 0.55: 衝突解決スタイルの不一致は離婚の最大因子
 * ⑤ 安定性 ≥ 0.55: 安定欲求の差はストレスの根源になる
 *
 * Layer 1.5: Relationship Process（2次元）
 * ⑥ Four Horsemen リスク ≤ 0.75: Gottman 離婚予測の最強因子
 * ⑦ 修復能力 ≥ 0.30: 修復できないカップルは長期関係困難
 *
 * Layer 2: Life Plan（1次元）
 * ⑧ 人生設計適合度 ≥ 0.35: 人生設計の根本的不一致は致命的
 */
export function partnerGuard(
  result: EvaluationResult,
  processVector?: RelationshipProcessVector,
  lifePlanFit?: LifePlanFitResult,
): boolean {
  // Layer 1: 行動互換性（5次元）
  const layer1Pass =
    (result.dimensions.distanceFit ?? 0) >= 0.60 &&
    (result.dimensions.depthFit ?? 0) >= 0.58 &&
    (result.dimensions.emotionalFit ?? 0) >= 0.60 &&
    (result.dimensions.conflictFit ?? 0) >= 0.55 &&
    (result.dimensions.stabilityFit ?? 0) >= 0.55;

  if (!layer1Pass) return false;

  // Layer 1.5: Relationship Process（2次元）
  // processVector が提供されている場合のみチェック（後方互換）
  if (processVector) {
    // ⑥ Four Horsemen リスクが非常に高い → ブロック
    if (processVector.fourHorsemenRisk > 0.75) return false;
    // ⑦ 修復能力が両者とも低い → 長期関係困難
    if (processVector.repairCapacity < 0.30) return false;
  }

  // Layer 2: Life Plan（1次元）
  // lifePlanFit が提供されている場合のみチェック（後方互換）
  if (lifePlanFit) {
    // ⑧ 人生設計の総合適合度が最低水準を下回る → ブロック
    if (lifePlanFit.total < 0.35) return false;
  }

  return true;
}
