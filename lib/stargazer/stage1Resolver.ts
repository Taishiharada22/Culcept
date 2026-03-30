// lib/stargazer/stage1Resolver.ts
// Stage 1: Surface Observation スコアリング
// 多肢選択回答 → 45軸スコア → 軸スコア解決

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXIS_KEYS, createEmptyAxisScores } from "./traitAxes";
import { STAGE1_QUESTIONS } from "./stage1Questions";
import {
  type ResolvedResult,
} from "./typeResolver";
import { resolveReactionType } from "./reactionTypes";

// ── 回答データ ──

export interface Stage1Answer {
  questionId: string;
  selectedOptionId: string;
  responseTimeMs: number;
}

// ── スコアリング ──

/**
 * Stage 1 多肢選択回答から45軸スコアを算出
 * 各選択肢の axisMappings.weight を軸ごとに累積 → 重み付き平均 → clamp [-1,1]
 */
export function calculateStage1AxisScores(
  answers: Stage1Answer[]
): Record<TraitAxisKey, number> {
  const scores = createEmptyAxisScores();
  const weights: Record<string, number> = {};
  for (const key of TRAIT_AXIS_KEYS) weights[key] = 0;

  for (const answer of answers) {
    const question = STAGE1_QUESTIONS.find((q) => q.id === answer.questionId);
    if (!question) continue;

    const option = question.options.find(
      (o) => o.id === answer.selectedOptionId
    );
    if (!option) continue;

    for (const mapping of option.axisMappings) {
      scores[mapping.key] += mapping.weight;
      weights[mapping.key] += Math.abs(mapping.weight);
    }
  }

  // 重み付き平均化 + clamp [-1, 1]
  for (const key of TRAIT_AXIS_KEYS) {
    if (weights[key] > 0) {
      scores[key] = Math.max(-1, Math.min(1, scores[key] / weights[key]));
    }
  }

  return scores;
}

/**
 * 各軸の confidence を算出（Stage 1 版）
 * 回答数と重みの合計に基づく
 */
export function calculateStage1AxisConfidences(
  answers: Stage1Answer[]
): Record<TraitAxisKey, number> {
  const confidences = createEmptyAxisScores();
  const totalWeight: Record<string, number> = {};
  const answerCount: Record<string, number> = {};

  for (const key of TRAIT_AXIS_KEYS) {
    totalWeight[key] = 0;
    answerCount[key] = 0;
  }

  for (const answer of answers) {
    const question = STAGE1_QUESTIONS.find((q) => q.id === answer.questionId);
    if (!question) continue;

    const option = question.options.find(
      (o) => o.id === answer.selectedOptionId
    );
    if (!option) continue;

    for (const mapping of option.axisMappings) {
      totalWeight[mapping.key] += Math.abs(mapping.weight);
      answerCount[mapping.key] += 1;
    }
  }

  for (const key of TRAIT_AXIS_KEYS) {
    const countFactor = Math.min(1, (answerCount[key] || 0) * 0.25);
    const weightFactor = Math.min(1, (totalWeight[key] || 0) * 0.5);
    confidences[key] = countFactor * weightFactor;
  }

  return confidences;
}

// ── Stage 1 軸スコア解決 ──

/**
 * Stage 1 回答から軸スコア + 確信度を解決
 * (旧12星座タイプマッチングは除去済み)
 */
export function resolveStage1(answers: Stage1Answer[]): ResolvedResult {
  const axisScores = calculateStage1AxisScores(answers);
  const axisConfidences = calculateStage1AxisConfidences(answers);

  // 全体 confidence — 回答数ベース
  const answerRatio = Math.min(1, answers.length / 24);
  const confidence = Math.min(1, answerRatio * 0.7);

  const reactionType = resolveReactionType(axisScores);

  return {
    reactionType,
    confidence,
    axisScores,
    axisConfidences,
  };
}

/**
 * Stage 1 回答から branchKeys を抽出
 * Stage 2 のプローブ選択に使用
 */
export function extractBranchKeys(
  answers: Stage1Answer[]
): Record<string, string> {
  const branchKeys: Record<string, string> = {};

  for (const answer of answers) {
    const question = STAGE1_QUESTIONS.find((q) => q.id === answer.questionId);
    if (!question) continue;

    const option = question.options.find(
      (o) => o.id === answer.selectedOptionId
    );
    if (!option?.branchKey) continue;

    branchKeys[answer.questionId] = option.branchKey;
  }

  return branchKeys;
}
