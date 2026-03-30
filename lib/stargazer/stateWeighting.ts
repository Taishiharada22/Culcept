// lib/stargazer/stateWeighting.ts
// 観測時の状態（エネルギー, 感情, 社会的文脈, 時間帯）に応じて
// 回答の「特性証拠力」を調整する
//
// 原理: 疲労時・強い感情下での回答は、安定的な特性よりも
// 一時的状態を反映しやすい。証拠力(precision)を下げることで、
// 特性推定への悪影響を抑える。
//
// 参考: Kahneman (2011) — System 1/System 2 and cognitive depletion
//       Schwarz & Clore (1983) — Mood as information
//       Baumeister et al. (1998) — Ego depletion and self-regulation

import type { TraitAxisKey } from "./traitAxes";

// ── 状態の型（既存の ObservationState と互換） ──

export interface ObservationStateInput {
  energy?: string;    // "very_low" | "low" | "moderate" | "high" | "very_high"
  emotion?: string;   // "calm" | "anxious" | "frustrated" | "joyful" | "sad" | "neutral"
  social?: string;    // "alone" | "few_people" | "many_people"
  timeOfDay?: string; // "morning" | "afternoon" | "evening" | "night" | "late_night"
}

// ── 軸カテゴリ分類 ──

/** 認知系軸: ホット・コグニション効果で影響を受けやすい */
const COGNITIVE_AXES: ReadonlySet<string> = new Set([
  "analytical_vs_intuitive",
  "plan_vs_spontaneous",
  "abstract_structuring",
  "decomposition",
  "cognitive_updating",
  "decision_tempo",
  "exploration_closure",
]);

/** 社会系軸: 社会的文脈の影響を受けやすい */
const SOCIAL_AXES: ReadonlySet<string> = new Set([
  "introvert_vs_extrovert",
  "individual_vs_social",
  "social_initiative",
  "stress_isolation_vs_social",
  "intimacy_pace",
  "independence_vs_harmony",
  "direct_vs_diplomatic",
  "friend_mode_fit",
]);

/** 感情系軸: 感情状態の直接的影響 */
const EMOTIONAL_AXES: ReadonlySet<string> = new Set([
  "emotional_regulation",
  "emotional_variability",
  "reassurance_need",
  "rumination_tendency",
  "shame_vs_guilt",
  "attachment_style",
]);

// ── メイン関数 ──

/**
 * 観測状態と軸に基づいて、証拠力の精度乗数を算出
 *
 * @param state  観測時の状態
 * @param axisId 対象軸
 * @returns 精度乗数 (0.3〜1.5)
 *          1.0 = 中立（状態の影響なし）
 *          <1.0 = 状態が特性推定を歪めるリスクあり
 *          >1.0 = 特定条件下で証拠力が高い
 */
export function computeStatePrecisionMultiplier(
  state: ObservationStateInput | null | undefined,
  axisId: TraitAxisKey,
): number {
  if (!state) return 1.0;

  let multiplier = 1.0;

  // ── エネルギーレベル ──
  // 極端なエネルギー状態は全軸の証拠力を下げる
  // (自己統制資源の枯渇 → 回答が特性を反映しにくい)
  switch (state.energy) {
    case "very_low":
      multiplier *= 0.65; // 強い疲労
      break;
    case "low":
      multiplier *= 0.82; // 軽い疲労
      break;
    case "very_high":
      multiplier *= 0.90; // 高揚状態 — やや不安定
      break;
    // "moderate", "high" → 1.0 (影響なし)
  }

  // ── 感情状態 × 認知系軸 ──
  // 強い感情下では認知的判断が歪む (ホット・コグニション)
  if (COGNITIVE_AXES.has(axisId)) {
    switch (state.emotion) {
      case "anxious":
        multiplier *= 0.70; // 不安 → 分析力低下
        break;
      case "frustrated":
        multiplier *= 0.72; // 苛立ち → 衝動的判断
        break;
      case "joyful":
        multiplier *= 0.80; // 喜び → 楽観バイアス
        break;
      case "sad":
        multiplier *= 0.78; // 悲しみ → 悲観バイアス
        break;
    }
  }

  // ── 感情状態 × 感情系軸 ──
  // 感情的な状態下での感情系軸の回答は、
  // 特性ではなく現在の状態を反映しやすい
  if (EMOTIONAL_AXES.has(axisId)) {
    switch (state.emotion) {
      case "anxious":
      case "frustrated":
      case "sad":
        multiplier *= 0.75; // ネガティブ感情 → 特性を過大評価しやすい
        break;
      case "joyful":
        multiplier *= 0.85; // ポジティブ感情 → 特性を過小評価しやすい
        break;
    }
  }

  // ── 社会的文脈 × 社会系軸 ──
  // 大人数の中にいる時の社会系回答は、場の影響を受けやすい
  if (SOCIAL_AXES.has(axisId)) {
    switch (state.social) {
      case "many_people":
        multiplier *= 0.82; // 社会的望ましさバイアス
        break;
      case "alone":
        // 一人の時の社会系回答は内省的で特性に近い
        multiplier *= 1.08; // 軽いボーナス
        break;
    }
  }

  // ── 時間帯 ──
  // 深夜の回答は注意力低下のリスク
  if (state.timeOfDay === "late_night") {
    multiplier *= 0.80; // 深夜: 全体的に証拠力低下
  }

  // 最終クランプ
  return Math.max(0.3, Math.min(1.5, multiplier));
}

// ── バッチ処理用 ──

/**
 * 複数の軸に対して一括で精度乗数を計算
 */
export function computeStatePrecisionMultipliers(
  state: ObservationStateInput | null | undefined,
  axisIds: TraitAxisKey[],
): Record<TraitAxisKey, number> {
  const result: Partial<Record<TraitAxisKey, number>> = {};
  for (const axisId of axisIds) {
    result[axisId] = computeStatePrecisionMultiplier(state, axisId);
  }
  return result as Record<TraitAxisKey, number>;
}
