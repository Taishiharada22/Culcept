// ============================================================
// 季節/天気マッチング適応
// 環境要因に基づくウェイト微調整
// ============================================================

import type { CategoryWeights } from "./types";

type SeasonalModifier = Partial<Record<keyof CategoryWeights, number>>;

/**
 * 季節・天気に基づくウェイト修正係数を計算
 *
 * ルール:
 * - 各次元の修正は乗算的（±10%以内）
 * - 0.90 〜 1.10 の範囲
 * - 季節・天気の影響は微妙だが一貫性がある
 */
export function getSeasonalWeightModifier(
  date: Date,
  weather?: { condition: string; temperature?: number },
): SeasonalModifier {
  const month = date.getMonth() + 1;
  const hour = date.getHours();

  const modifier: SeasonalModifier = {};

  // ── 季節の影響 ──
  if (month >= 3 && month <= 5) {
    // 春: 新しい出会いへの開放性↑
    modifier.conversation = 1.05;
    modifier.depth = 0.97;
    modifier.categoryAffinity = 1.05;
  } else if (month >= 6 && month <= 8) {
    // 夏: 社交性↑、刺激欲求↑
    modifier.categoryAffinity = 1.08;
    modifier.stability = 0.95;
    modifier.conversation = 1.05;
  } else if (month >= 9 && month <= 11) {
    // 秋: 内省↑、深度重視↑
    modifier.depth = 1.08;
    modifier.emotional = 1.05;
    modifier.conversation = 0.97;
  } else {
    // 冬: 安定志向↑、温もり重視↑
    modifier.stability = 1.08;
    modifier.emotional = 1.07;
    modifier.distance = 0.95;
  }

  // ── 天気の影響 ──
  if (weather) {
    const condition = weather.condition.toLowerCase();

    if (condition.includes("rain") || condition.includes("雨")) {
      // 雨: 感情開放性↑、深い接続を求める
      modifier.emotional = (modifier.emotional ?? 1.0) * 1.05;
      modifier.depth = (modifier.depth ?? 1.0) * 1.03;
    }

    if (condition.includes("snow") || condition.includes("雪")) {
      // 雪: 安定感↑、温もり↑
      modifier.stability = (modifier.stability ?? 1.0) * 1.05;
      modifier.distance = (modifier.distance ?? 1.0) * 0.97;
    }

    if (condition.includes("clear") || condition.includes("sunny") || condition.includes("晴")) {
      // 晴れ: 活動的、社交的
      modifier.categoryAffinity = (modifier.categoryAffinity ?? 1.0) * 1.03;
      modifier.conversation = (modifier.conversation ?? 1.0) * 1.02;
    }
  }

  // ── 時間帯の影響 ──
  if (hour >= 22 || hour < 5) {
    // 深夜: 深度重視↑
    modifier.depth = (modifier.depth ?? 1.0) * 1.05;
    modifier.emotional = (modifier.emotional ?? 1.0) * 1.03;
  }

  // ±10%制約の適用
  for (const key of Object.keys(modifier) as (keyof SeasonalModifier)[]) {
    const val = modifier[key] ?? 1.0;
    modifier[key] = Math.max(0.90, Math.min(1.10, val));
  }

  return modifier;
}

/**
 * ベースウェイトに季節修正を適用
 */
export function applySeasonalModifier(
  baseWeights: CategoryWeights,
  modifier: SeasonalModifier,
): CategoryWeights {
  const result = { ...baseWeights };

  for (const [key, multiplier] of Object.entries(modifier)) {
    if (key in result && typeof multiplier === "number") {
      (result as Record<string, number>)[key] *= multiplier;
    }
  }

  // 合計1.0に正規化
  const keys = Object.keys(result) as (keyof CategoryWeights)[];
  const sum = keys.reduce((s, k) => s + result[k], 0);
  for (const key of keys) {
    result[key] = result[key] / sum;
  }

  return result;
}
