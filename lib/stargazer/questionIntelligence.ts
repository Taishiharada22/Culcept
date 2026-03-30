// lib/stargazer/questionIntelligence.ts
// 質問知性ループ — 質問の有効性を追跡し、時間とともに質問を賢くする
//
// 設計思想:
// "20回目のセッションで、質問が的確すぎて怖い、と感じさせる"
// "効果の低い質問を淘汰し、高い質問を変奏し、盲点を狙う新質問を生む"

import { safeSetItem } from "./localStorageHelper";
import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface QuestionEffectiveness {
  questionId: string;
  axis: string;
  timesAsked: number;
  avgResponseTime: number;
  avgHesitation: number;
  /** 弁別力 (discriminative power): ユーザー間で回答がどれだけ異なるか (0=全員同じ, 1=最大分散) */
  discriminationPower: number;
  /** この質問が軸スコアをどれだけ動かすか */
  axisMovement: number;
  /** この質問が矛盾検出をどれだけ引き起こすか */
  contradictionTriggerRate: number;
  /** 総合的な有効性スコア (0-1) */
  effectivenessScore: number;
  /** 最終更新 */
  lastUpdated: number;
}

export interface WeakAxis {
  axisId: string;
  axisLabel: string;
  /** 質問の平均有効性 */
  avgEffectiveness: number;
  /** この軸の質問数 */
  questionCount: number;
  /** なぜ弱いか */
  reason: string;
}

export interface SmartQuestionSuggestion {
  /** 対象軸 */
  axisId: string;
  /** 生成すべき質問の方向性 */
  direction: string;
  /** 推奨される PhrasingStyle */
  suggestedStyle: string;
  /** 推奨される角度 */
  suggestedAngle: string;
  /** 過去に効果があったアプローチ */
  effectiveApproaches: string[];
  /** 避けるべきアプローチ */
  avoidApproaches: string[];
}

interface QuestionAnswerRecord {
  questionId: string;
  axis: string;
  score: number;
  responseTimeMs: number;
  previousAxisScore: number | null;
  newAxisScore: number | null;
  answerChanged: boolean;
  contradictionDetected: boolean;
  timestamp: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EFFECTIVENESS_KEY = "stargazer_question_effectiveness_v1";
const ANSWER_RECORDS_KEY = "stargazer_answer_records_v1";
const MAX_ANSWER_RECORDS = 500;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Answer Recording
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 質問への回答を記録し、有効性メトリクスを更新する。
 * 観測セッション中に各回答ごとに呼ばれる。
 */
export function recordQuestionAnswer(params: {
  questionId: string;
  axis: string;
  score: number;
  responseTimeMs: number;
  previousAxisScore?: number | null;
  newAxisScore?: number | null;
  answerChanged?: boolean;
  contradictionDetected?: boolean;
}): void {
  if (typeof window === "undefined") return;

  const record: QuestionAnswerRecord = {
    questionId: params.questionId,
    axis: params.axis,
    score: params.score,
    responseTimeMs: params.responseTimeMs,
    previousAxisScore: params.previousAxisScore ?? null,
    newAxisScore: params.newAxisScore ?? null,
    answerChanged: params.answerChanged ?? false,
    contradictionDetected: params.contradictionDetected ?? false,
    timestamp: Date.now(),
  };

  // 記録を保存
  const records = loadAnswerRecords();
  records.push(record);
  const trimmed = records.slice(-MAX_ANSWER_RECORDS);
  safeSetItem(ANSWER_RECORDS_KEY, JSON.stringify(trimmed));

  // 有効性を再計算
  rebuildEffectiveness(trimmed);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Effectiveness Computation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function rebuildEffectiveness(records: QuestionAnswerRecord[]): void {
  // 質問ごとにグループ化
  const byQuestion = new Map<string, QuestionAnswerRecord[]>();
  for (const r of records) {
    if (!byQuestion.has(r.questionId)) byQuestion.set(r.questionId, []);
    byQuestion.get(r.questionId)!.push(r);
  }

  const effectivenessMap: Record<string, QuestionEffectiveness> = {};

  for (const [questionId, qRecords] of byQuestion) {
    if (qRecords.length === 0) continue;

    const axis = qRecords[0].axis;
    const timesAsked = qRecords.length;

    // 平均応答時間
    const avgResponseTime =
      qRecords.reduce((sum, r) => sum + r.responseTimeMs, 0) / timesAsked;

    // 平均躊躇度 (応答時間の標準偏差 / 平均)
    const responseTimes = qRecords.map((r) => r.responseTimeMs);
    const rtMean = avgResponseTime;
    const rtVariance =
      responseTimes.reduce((sum, t) => sum + (t - rtMean) ** 2, 0) / timesAsked;
    const avgHesitation = rtMean > 0 ? Math.sqrt(rtVariance) / rtMean : 0;

    // 識別力: スコアの分散 (0=全員同じ回答, 高い=よく分散)
    const scores = qRecords.map((r) => r.score);
    const scoreMean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const scoreVariance =
      scores.reduce((sum, s) => sum + (s - scoreMean) ** 2, 0) / scores.length;
    // [-1, 1] の範囲で最大分散は 1.0、正規化
    const discriminationPower = Math.min(1, scoreVariance / 0.5);

    // 軸移動量: この質問前後で軸スコアがどれだけ動いたか
    const movements = qRecords
      .filter((r) => r.previousAxisScore != null && r.newAxisScore != null)
      .map((r) => Math.abs(r.newAxisScore! - r.previousAxisScore!));
    const axisMovement =
      movements.length > 0
        ? movements.reduce((sum, m) => sum + m, 0) / movements.length
        : 0;

    // 矛盾トリガー率
    const contradictions = qRecords.filter((r) => r.contradictionDetected).length;
    const contradictionTriggerRate = timesAsked > 0 ? contradictions / timesAsked : 0;

    // 総合有効性スコア
    const effectivenessScore = computeEffectivenessScore({
      discriminationPower,
      axisMovement,
      contradictionTriggerRate,
      avgHesitation,
      timesAsked,
    });

    effectivenessMap[questionId] = {
      questionId,
      axis,
      timesAsked,
      avgResponseTime: Math.round(avgResponseTime),
      avgHesitation: Math.round(avgHesitation * 1000) / 1000,
      discriminationPower: Math.round(discriminationPower * 1000) / 1000,
      axisMovement: Math.round(axisMovement * 1000) / 1000,
      contradictionTriggerRate: Math.round(contradictionTriggerRate * 1000) / 1000,
      effectivenessScore: Math.round(effectivenessScore * 1000) / 1000,
      lastUpdated: Date.now(),
    };
  }

  safeSetItem(EFFECTIVENESS_KEY, JSON.stringify(effectivenessMap));
}

function computeEffectivenessScore(params: {
  discriminationPower: number;
  axisMovement: number;
  contradictionTriggerRate: number;
  avgHesitation: number;
  timesAsked: number;
}): number {
  // 弁別力 (discriminative power) が最も重要 (0.35)
  const discriminationScore = params.discriminationPower * 0.35;

  // 軸を動かす力 (0.25)
  const movementScore = Math.min(1, params.axisMovement * 5) * 0.25;

  // 矛盾を引き出す力 (0.20) - 矛盾は深い情報を示す
  const contradictionScore = Math.min(1, params.contradictionTriggerRate * 5) * 0.20;

  // 適度な躊躇 (0.10) - 躊躇がある = 深い思考を促す（ただし過度は悪い）
  const hesitationScore =
    params.avgHesitation > 0.3 && params.avgHesitation < 1.5
      ? 0.10
      : params.avgHesitation >= 1.5
        ? 0.05
        : 0.02;

  // データ信頼性ボーナス (0.10) - 回答数が多いほど信頼性が高い
  const dataBonus = Math.min(0.10, (params.timesAsked / 20) * 0.10);

  return discriminationScore + movementScore + contradictionScore + hesitationScore + dataBonus;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Query API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 指定軸の質問を有効性順にランキングする。
 * セッションで次に出す質問を選ぶ際に使用。
 */
export function rankQuestionsByEffectiveness(
  axis: string,
): QuestionEffectiveness[] {
  const all = loadEffectiveness();
  return Object.values(all)
    .filter((q) => q.axis === axis)
    .sort((a, b) => b.effectivenessScore - a.effectivenessScore);
}

/**
 * 質問品質が低い軸（弱い軸）を特定する。
 * これらの軸にはより良い質問を生成する必要がある。
 */
export function identifyWeakAxes(): WeakAxis[] {
  const all = loadEffectiveness();
  const byAxis = new Map<string, QuestionEffectiveness[]>();

  for (const q of Object.values(all)) {
    if (!byAxis.has(q.axis)) byAxis.set(q.axis, []);
    byAxis.get(q.axis)!.push(q);
  }

  const weakAxes: WeakAxis[] = [];

  // まず、全軸の質問が存在するか確認
  for (const axisDef of TRAIT_AXES) {
    const axisQuestions = byAxis.get(axisDef.id) ?? [];

    const axisLabel = `${axisDef.labelLeft}/${axisDef.labelRight}`;

    if (axisQuestions.length === 0) {
      weakAxes.push({
        axisId: axisDef.id,
        axisLabel,
        avgEffectiveness: 0,
        questionCount: 0,
        reason: "この軸の観測データがありません",
      });
      continue;
    }

    const avgEffectiveness =
      axisQuestions.reduce((sum, q) => sum + q.effectivenessScore, 0) /
      axisQuestions.length;

    if (avgEffectiveness < 0.3) {
      weakAxes.push({
        axisId: axisDef.id,
        axisLabel,
        avgEffectiveness: Math.round(avgEffectiveness * 1000) / 1000,
        questionCount: axisQuestions.length,
        reason:
          avgEffectiveness < 0.1
            ? "質問の識別力がほぼゼロ。根本的に異なるアプローチが必要"
            : "質問の有効性が低い。角度を変えた質問が必要",
      });
    } else if (axisQuestions.length < 3) {
      weakAxes.push({
        axisId: axisDef.id,
        axisLabel,
        avgEffectiveness: Math.round(avgEffectiveness * 1000) / 1000,
        questionCount: axisQuestions.length,
        reason: "質問の種類が少なすぎる。多角的な質問が必要",
      });
    }
  }

  // 有効性が低い順にソート
  return weakAxes.sort((a, b) => a.avgEffectiveness - b.avgEffectiveness);
}

/**
 * 弱い軸に対するスマート質問の生成提案を作成する。
 * AI 質問生成のパラメータ最適化に使用。
 */
export function generateSmartQuestionSuggestion(
  weakAxis: WeakAxis,
): SmartQuestionSuggestion {
  const all = loadEffectiveness();
  const axisQuestions = Object.values(all).filter((q) => q.axis === weakAxis.axisId);

  // 高有効性の質問からパターンを学ぶ（全軸横断）
  const highEffective = Object.values(all)
    .filter((q) => q.effectivenessScore > 0.5)
    .sort((a, b) => b.effectivenessScore - a.effectivenessScore)
    .slice(0, 10);

  // 効果のあったアプローチを抽出
  const effectiveApproaches: string[] = [];
  if (highEffective.some((q) => q.contradictionTriggerRate > 0.2)) {
    effectiveApproaches.push("矛盾を引き出す二面的な質問");
  }
  if (highEffective.some((q) => q.avgHesitation > 0.5)) {
    effectiveApproaches.push("深い思考を促す日常的シナリオ");
  }
  if (highEffective.some((q) => q.discriminationPower > 0.5)) {
    effectiveApproaches.push("回答が分かれやすい具体的場面設定");
  }

  // 効果のなかったアプローチを抽出
  const avoidApproaches: string[] = [];
  const lowEffective = axisQuestions
    .filter((q) => q.effectivenessScore < 0.2)
    .slice(0, 5);
  if (lowEffective.some((q) => q.discriminationPower < 0.1)) {
    avoidApproaches.push("社会的望ましさが明白な質問");
  }
  if (lowEffective.some((q) => q.avgResponseTime < 2000)) {
    avoidApproaches.push("考えなくても答えられる表面的な質問");
  }

  // 推奨スタイルの決定
  let suggestedStyle = "scenario";
  let suggestedAngle = "hypothetical";
  if (weakAxis.avgEffectiveness < 0.1) {
    // 全く効果がない場合: 根本的に異なるアプローチ
    suggestedStyle = "projection";
    suggestedAngle = "projection_judgment";
  } else if (weakAxis.questionCount < 3) {
    // 質問数不足: バリエーションを増やす
    suggestedStyle = "memory_recall";
    suggestedAngle = "past_recall";
  }

  // 生成方向性のテキスト
  const axisDef = TRAIT_AXES.find((a) => a.id === weakAxis.axisId);
  const direction = axisDef
    ? `「${axisDef.labelLeft}」と「${axisDef.labelRight}」の間で、ユーザーが本当にどこに立っているかを明らかにする。直接聞くのではなく、日常の具体的な判断場面で自然にその軸が露出する質問を設計する`
    : `この軸の真の位置を、日常の判断場面から自然に引き出す`;

  return {
    axisId: weakAxis.axisId,
    direction,
    suggestedStyle,
    suggestedAngle,
    effectiveApproaches:
      effectiveApproaches.length > 0
        ? effectiveApproaches
        : ["具体的なシナリオベースの質問", "第三者視点からの投影的質問"],
    avoidApproaches:
      avoidApproaches.length > 0
        ? avoidApproaches
        : ["抽象的な自己評価質問"],
  };
}

/**
 * セッション内で次に出すべき質問を推薦する。
 * 高有効性質問の変奏 + 盲点軸の質問を組み合わせる。
 */
export function recommendNextQuestions(
  answeredQuestionIds: string[],
  targetAxisId?: string,
  limit: number = 5,
): { questionId: string; reason: string }[] {
  const all = loadEffectiveness();
  const answered = new Set(answeredQuestionIds);

  // 未回答の質問を有効性順に取得
  let candidates = Object.values(all)
    .filter((q) => !answered.has(q.questionId));

  if (targetAxisId) {
    candidates = candidates.filter((q) => q.axis === targetAxisId);
  }

  const sorted = candidates.sort(
    (a, b) => b.effectivenessScore - a.effectivenessScore,
  );

  const recommendations: { questionId: string; reason: string }[] = [];

  // 高有効性質問を優先
  for (const q of sorted.slice(0, Math.ceil(limit * 0.6))) {
    recommendations.push({
      questionId: q.questionId,
      reason:
        q.effectivenessScore > 0.5
          ? "高い識別力が証明済みの質問"
          : "一定の有効性がある質問",
    });
  }

  // 残りは弱い軸からの質問
  if (recommendations.length < limit) {
    const weakAxes = identifyWeakAxes();
    for (const wa of weakAxes.slice(0, limit - recommendations.length)) {
      const weakAxisQuestions = Object.values(all)
        .filter((q) => q.axis === wa.axisId && !answered.has(q.questionId))
        .sort((a, b) => b.effectivenessScore - a.effectivenessScore);

      if (weakAxisQuestions.length > 0) {
        recommendations.push({
          questionId: weakAxisQuestions[0].questionId,
          reason: `弱い軸「${wa.axisLabel}」のカバレッジ向上のため`,
        });
      }
    }
  }

  return recommendations.slice(0, limit);
}

/**
 * 質問の有効性サマリーを取得する。
 * 管理画面やデバッグに使用。
 */
export function getEffectivenessSummary(): {
  totalQuestions: number;
  avgEffectiveness: number;
  topQuestions: QuestionEffectiveness[];
  bottomQuestions: QuestionEffectiveness[];
  weakAxes: WeakAxis[];
} {
  const all = loadEffectiveness();
  const questions = Object.values(all);

  if (questions.length === 0) {
    return {
      totalQuestions: 0,
      avgEffectiveness: 0,
      topQuestions: [],
      bottomQuestions: [],
      weakAxes: [],
    };
  }

  const avgEffectiveness =
    questions.reduce((sum, q) => sum + q.effectivenessScore, 0) /
    questions.length;

  const sorted = [...questions].sort(
    (a, b) => b.effectivenessScore - a.effectivenessScore,
  );

  return {
    totalQuestions: questions.length,
    avgEffectiveness: Math.round(avgEffectiveness * 1000) / 1000,
    topQuestions: sorted.slice(0, 5),
    bottomQuestions: sorted.slice(-5).reverse(),
    weakAxes: identifyWeakAxes(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Persistence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function loadEffectiveness(): Record<string, QuestionEffectiveness> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(EFFECTIVENESS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, QuestionEffectiveness>;
  } catch {
    return {};
  }
}

function loadAnswerRecords(): QuestionAnswerRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ANSWER_RECORDS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QuestionAnswerRecord[];
  } catch {
    return [];
  }
}
