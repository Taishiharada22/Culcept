// ============================================================
// Context Score Aggregation
// 友達 / 恋愛 / Orbiter / 共創 それぞれ別に集計
// ============================================================

import type {
  ContextType,
  ContextScoreResult,
  QuestionScoreEntry,
  UserQuestionResponse,
} from "./types";
import { ALL_CONTEXTS } from "./types";
import { QUESTION_MASTER, QUESTION_MAP } from "./questionMaster";
import { computeQuestionScore, computeQuestionFinalWeight } from "./scoring";

/**
 * 文脈別スコアの算出
 *
 * contextScore(context) =
 *   sum(questionScore for all questions under context)
 *   / sum(maxPossibleQuestionScore under context)
 *   * 100
 *
 * 同じ相手でも以下のような結果が出る:
 * - 友達 91
 * - 恋愛 74
 * - Orbiter 82
 */
export function computeContextScores(
  responsesA: UserQuestionResponse[],
  responsesB: UserQuestionResponse[],
): ContextScoreResult {
  // 両者が回答した質問のみを対象にする
  const responseMapA = new Map(responsesA.map((r) => [r.questionId, r]));
  const responseMapB = new Map(responsesB.map((r) => [r.questionId, r]));

  const sharedQuestionIds = QUESTION_MASTER.filter(
    (q) => responseMapA.has(q.id) && responseMapB.has(q.id),
  ).map((q) => q.id);

  const scoresByContext: Record<ContextType, number> = {
    friend: 0,
    romance: 0,
    orbiter: 0,
    cocreation: 0,
  };

  const maxByContext: Record<ContextType, number> = {
    friend: 0,
    romance: 0,
    orbiter: 0,
    cocreation: 0,
  };

  const questionBreakdown: QuestionScoreEntry[] = [];

  for (const qId of sharedQuestionIds) {
    const question = QUESTION_MAP.get(qId);
    if (!question) continue;

    const respA = responseMapA.get(qId)!;
    const respB = responseMapB.get(qId)!;

    const entry: QuestionScoreEntry = {
      questionId: qId,
      questionTitle: question.title,
      category: question.category,
      scores: { friend: 0, romance: 0, orbiter: 0, cocreation: 0 },
      effectiveWeights: { friend: 0, romance: 0, orbiter: 0, cocreation: 0 },
    };

    for (const ctx of ALL_CONTEXTS) {
      const result = computeQuestionScore(question, respA, respB, ctx);

      const effectiveWeight =
        (computeQuestionFinalWeight(question, respA, ctx) +
          computeQuestionFinalWeight(question, respB, ctx)) /
        2;

      scoresByContext[ctx] += result.rawScore;
      maxByContext[ctx] += result.maxPossible;

      entry.scores[ctx] = result.score;
      entry.effectiveWeights[ctx] = effectiveWeight;
    }

    questionBreakdown.push(entry);
  }

  // 0..100に変換
  const scores: Record<ContextType, number> = {
    friend: maxByContext.friend > 0
      ? Math.round((scoresByContext.friend / maxByContext.friend) * 100)
      : 0,
    romance: maxByContext.romance > 0
      ? Math.round((scoresByContext.romance / maxByContext.romance) * 100)
      : 0,
    orbiter: maxByContext.orbiter > 0
      ? Math.round((scoresByContext.orbiter / maxByContext.orbiter) * 100)
      : 0,
    cocreation: maxByContext.cocreation > 0
      ? Math.round((scoresByContext.cocreation / maxByContext.cocreation) * 100)
      : 0,
  };

  // bestContextを決定
  const bestContext = (
    Object.entries(scores) as [ContextType, number][]
  ).sort((a, b) => b[1] - a[1])[0][0];

  return {
    friend: scores.friend,
    romance: scores.romance,
    orbiter: scores.orbiter,
    cocreation: scores.cocreation,
    bestContext,
    questionBreakdown,
  };
}

/**
 * 特定の文脈のみのスコアを算出（軽量版）
 */
export function computeSingleContextScore(
  responsesA: UserQuestionResponse[],
  responsesB: UserQuestionResponse[],
  context: ContextType,
): number {
  const responseMapA = new Map(responsesA.map((r) => [r.questionId, r]));
  const responseMapB = new Map(responsesB.map((r) => [r.questionId, r]));

  let totalScore = 0;
  let totalMax = 0;

  for (const question of QUESTION_MASTER) {
    const respA = responseMapA.get(question.id);
    const respB = responseMapB.get(question.id);
    if (!respA || !respB) continue;

    const result = computeQuestionScore(question, respA, respB, context);
    totalScore += result.rawScore;
    totalMax += result.maxPossible;
  }

  return totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
}
