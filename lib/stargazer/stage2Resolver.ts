// lib/stargazer/stage2Resolver.ts
// Stage 2: Neural Deep Probe スコアリング
// プローブ回答 → 軸スコア算出 → Stage 1 との統合

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXIS_KEYS, createEmptyAxisScores } from "./traitAxes";
import {
  PROBE_THEMES,
  PROBE_STEP_WEIGHTS,
  type ProbeThemeResult,
  type ProbeStep,
} from "./stage2Probes";

// ── 単一テーマのスコアリング ──

/**
 * 1つのプローブテーマの結果から軸スコアを算出
 * 5ステップのクロスバリデーション — Step 1 単独は低ウェイト
 */
export function scoreProbeTheme(
  result: ProbeThemeResult
): Partial<Record<TraitAxisKey, number>> {
  const theme = PROBE_THEMES.find((t) => t.id === result.themeId);
  if (!theme) return {};

  const deltas: Record<string, number> = {};
  const weights: Record<string, number> = {};

  for (const answer of result.answers) {
    const stepDef = theme.steps.find((s) => s.step === answer.step);
    if (!stepDef) continue;

    const option = stepDef.options.find(
      (o) => o.id === answer.selectedOptionId
    );
    if (!option) continue;

    const stepWeight = PROBE_STEP_WEIGHTS[answer.step];

    for (const mapping of option.axisMappings) {
      const key = mapping.key;
      deltas[key] = (deltas[key] ?? 0) + mapping.weight * stepWeight;
      weights[key] = (weights[key] ?? 0) + Math.abs(mapping.weight) * stepWeight;
    }
  }

  // 重み付き平均化 + clamp [-1, 1]
  const normalized: Partial<Record<TraitAxisKey, number>> = {};
  for (const key of Object.keys(deltas)) {
    if (weights[key] > 0) {
      normalized[key as TraitAxisKey] = Math.max(
        -1,
        Math.min(1, deltas[key] / weights[key])
      );
    }
  }

  return normalized;
}

// ── 複数テーマの統合 ──

/**
 * 複数プローブ結果を統合
 * 同じ軸が複数プローブで一致するとconfidence上昇
 */
export function mergeProbeResults(results: ProbeThemeResult[]): {
  scores: Partial<Record<TraitAxisKey, number>>;
  confidences: Partial<Record<TraitAxisKey, number>>;
} {
  const allDeltas: Record<string, number[]> = {};

  for (const result of results) {
    const themeScores = scoreProbeTheme(result);
    for (const [key, value] of Object.entries(themeScores)) {
      if (!allDeltas[key]) allDeltas[key] = [];
      allDeltas[key].push(value!);
    }
  }

  const scores: Partial<Record<TraitAxisKey, number>> = {};
  const confidences: Partial<Record<TraitAxisKey, number>> = {};

  for (const [key, values] of Object.entries(allDeltas)) {
    const axisKey = key as TraitAxisKey;

    // 平均スコア
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    scores[axisKey] = Math.max(-1, Math.min(1, avg));

    // Confidence: 観測回数 × 方向一致度
    const directionConsistency = calculateDirectionConsistency(values);
    const observationFactor = Math.min(1, values.length * 0.3);
    confidences[axisKey] = observationFactor * directionConsistency;
  }

  return { scores, confidences };
}

/**
 * 値の方向の一致度を計算 (0〜1)
 * 全て同じ符号なら 1.0、バラバラなら低い
 */
function calculateDirectionConsistency(values: number[]): number {
  if (values.length <= 1) return 0.5;

  const positiveCount = values.filter((v) => v > 0).length;
  const negativeCount = values.filter((v) => v < 0).length;
  const total = values.length;

  const majorityRatio = Math.max(positiveCount, negativeCount) / total;
  return majorityRatio;
}

// ── Stage 1 + Stage 2 統合 ──

/**
 * Stage 1 スコアと Stage 2 スコアを統合して最終スコアを算出
 *
 * - 既存15軸: Stage 1 をベースに、Stage 2 で観測があれば補正
 * - Stage 1 追加6軸: Stage 1 のスコアを維持
 * - Stage 2 専用12軸: Stage 2 のスコアをそのまま使用
 */
export function computeFinalScores(
  stage1Scores: Record<TraitAxisKey, number>,
  stage2Scores: Partial<Record<TraitAxisKey, number>>
): Record<TraitAxisKey, number> {
  const final = { ...stage1Scores };

  for (const [key, value] of Object.entries(stage2Scores)) {
    const axisKey = key as TraitAxisKey;
    if (value === undefined) continue;

    const existing = final[axisKey];
    if (existing !== undefined && existing !== 0) {
      // 両方にある軸: Stage 2（深い観測）に高い権威
      final[axisKey] = existing * 0.4 + value * 0.6;
    } else {
      // Stage 2 のみの軸
      final[axisKey] = value;
    }
  }

  // Clamp
  for (const key of TRAIT_AXIS_KEYS) {
    final[key] = Math.max(-1, Math.min(1, final[key]));
  }

  return final;
}

/**
 * Stage 2 の完了度を判定
 * 6テーマ中いくつ完了しているか
 */
export function getStage2Progress(
  completedThemeIds: string[]
): { completed: number; total: number; ratio: number } {
  const total = PROBE_THEMES.length;
  const completed = completedThemeIds.filter((id) =>
    PROBE_THEMES.some((t) => t.id === id)
  ).length;
  return { completed, total, ratio: total > 0 ? completed / total : 0 };
}
