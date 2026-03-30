// ============================================================
// ベイジアンウェイト適応
// スワイプ結果からパーソナライズされたマッチングウェイトを学習
// ============================================================

import type { CategoryWeights, RendezvousCategory } from "./types";

export type SwipeOutcome = {
  direction: "like" | "pass" | "save" | "mute";
  category: RendezvousCategory;
  dimensionsAtSwipe: Record<string, number>;
  createdAt: string;
};

const MIN_SWIPES_FOR_PERSONALIZATION = 20;
const MAX_SINGLE_WEIGHT = 0.30;
const MIN_SINGLE_WEIGHT = 0.03;
const LEARNING_RATE = 0.15; // 指数移動平均のα

/**
 * ユーザーのスワイプパターンからパーソナライズされたウェイトを算出
 *
 * アルゴリズム:
 * 1. likeしたカード群とpassしたカード群の各次元の平均を比較
 * 2. likeカードで高くpassカードで低い次元 → ウェイトを増加
 * 3. 指数移動平均で徐々に学習（急激な変化を防止）
 */
export function computePersonalizedWeights(
  baseWeights: CategoryWeights,
  outcomes: SwipeOutcome[],
  previousWeights?: CategoryWeights,
): CategoryWeights | null {
  if (outcomes.length < MIN_SWIPES_FOR_PERSONALIZATION) {
    return null; // データ不足: ベースウェイトを使用
  }

  const likes = outcomes.filter((o) => o.direction === "like");
  const passes = outcomes.filter((o) => o.direction === "pass");

  if (likes.length < 5 || passes.length < 5) {
    return null; // 偏りすぎ: パーソナライズ不可
  }

  const DIMENSION_KEYS: (keyof CategoryWeights)[] = [
    "conversation", "distance", "depth", "initiative",
    "emotional", "conflict", "stability", "categoryAffinity",
  ];

  const DIMENSION_FIT_MAP: Record<keyof CategoryWeights, string> = {
    conversation: "conversationFit",
    distance: "distanceFit",
    depth: "depthFit",
    initiative: "initiativeFit",
    emotional: "emotionalFit",
    conflict: "conflictFit",
    stability: "stabilityFit",
    categoryAffinity: "categoryAffinity",
  };

  // 各次元のlike vs pass差分を計算
  const deltas: Record<string, number> = {};
  for (const key of DIMENSION_KEYS) {
    const fitKey = DIMENSION_FIT_MAP[key];
    const likeAvg = average(likes.map((o) => o.dimensionsAtSwipe[fitKey] ?? 0.5));
    const passAvg = average(passes.map((o) => o.dimensionsAtSwipe[fitKey] ?? 0.5));
    deltas[key] = likeAvg - passAvg; // 正: likeで高い（重要）、負: passで高い（不要）
  }

  // ウェイト調整
  const starting = previousWeights ?? baseWeights;
  const raw: Record<string, number> = {};

  for (const key of DIMENSION_KEYS) {
    const delta = deltas[key] ?? 0;
    // delta > 0 → この次元はユーザーにとって重要 → ウェイトを上げる
    const adjustment = delta * LEARNING_RATE;
    raw[key] = starting[key] + adjustment;
  }

  // 正規化（合計=1.0、各ウェイトが min/max 制約内）
  return normalizeWeights(raw, DIMENSION_KEYS);
}

/**
 * ウェイトを正規化: 合計1.0、各値がmin-max制約内
 */
function normalizeWeights(
  raw: Record<string, number>,
  keys: (keyof CategoryWeights)[],
): CategoryWeights {
  // クランプ
  for (const key of keys) {
    raw[key] = Math.max(MIN_SINGLE_WEIGHT, Math.min(MAX_SINGLE_WEIGHT, raw[key]));
  }

  // 合計1.0に正規化
  const sum = keys.reduce((s, k) => s + raw[k], 0);
  const result: Record<string, number> = {};
  for (const key of keys) {
    result[key] = raw[key] / sum;
  }

  return result as unknown as CategoryWeights;
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0.5;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
