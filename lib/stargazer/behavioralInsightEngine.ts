// lib/stargazer/behavioralInsightEngine.ts
// 行動信号インサイトエンジン
//
// 収集された行動信号（応答時間、スクロール停止、回答変更、戻り操作など）を
// 実際のインサイトに変換する。現状、信号は収集されているが洞察生成に使われていない。
// このエンジンがそのギャップを埋める。
//
// 核心思想:
// 行動は嘘をつけない。口で「私は決断力がある」と言える人でも、
// 毎回回答に15秒かかっていたら、それは「慎重」のサイン。
// この乖離こそが最も価値のあるインサイト。

import { TRAIT_AXES, getAxisLabels, type TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BehavioralSignal {
  type: "response_time" | "scroll_pause" | "back_navigation" | "option_hover" | "answer_change";
  /** シグナルの生の値 (ms, count, etc.) */
  value: number;
  /** 質問ID */
  questionId: string;
  /** 対象の軸 */
  axisId: string;
  /** タイムスタンプ (ISO) */
  timestamp: string;
}

export interface BehavioralInsightInput {
  /** 収集された行動信号 */
  signals: BehavioralSignal[];
  /** 現在の軸スコア */
  axisScores: Record<string, number>;
  /** アーキタイプコード */
  archetypeCode: string;
}

export type InsightCategory =
  | "hesitation_pattern"
  | "avoidance_zone"
  | "emotional_trigger"
  | "decision_style"
  | "self_deception";

export interface BehavioralInsight {
  /** インサイトのカテゴリ */
  category: InsightCategory;
  /** 人間向けの説明 (日本語, 1-2文) */
  description: string;
  /** 根拠となるデータの説明 */
  evidence: string;
  /** 確信度 (0-1) */
  confidence: number;
  /** 影響を受ける軸 */
  affectedAxes: string[];
  /** ユーザーにとっての意外性 (0-1, 高いほど本人が気づいていない可能性が高い) */
  userSurpriseFactor: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Statistical Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function coefficientOfVariation(arr: number[]): number {
  const m = mean(arr);
  if (m === 0) return 0;
  return stdDev(arr) / Math.abs(m);
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

function axisLabel(axisId: string): string {
  const labels = getAxisLabels(axisId as TraitAxisKey);
  if (!labels) return axisId;
  return `${labels.left}/${labels.right}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Hesitation Pattern Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 応答時間が平均の1.5倍以上の質問を軸ごとにグループ化し、
 * 特定の軸に集中しているかを検出する。
 */
function detectHesitationPatterns(input: BehavioralInsightInput): BehavioralInsight[] {
  const responseTimeSignals = input.signals.filter(s => s.type === "response_time");
  if (responseTimeSignals.length < 5) return [];

  const allTimes = responseTimeSignals.map(s => s.value);
  const avgTime = mean(allTimes);
  const threshold = avgTime * 1.5;

  // 遅い回答を軸ごとにグループ化
  const slowByAxis: Record<string, number[]> = {};
  const totalByAxis: Record<string, number> = {};

  for (const signal of responseTimeSignals) {
    if (!totalByAxis[signal.axisId]) totalByAxis[signal.axisId] = 0;
    totalByAxis[signal.axisId]++;

    if (signal.value > threshold) {
      if (!slowByAxis[signal.axisId]) slowByAxis[signal.axisId] = [];
      slowByAxis[signal.axisId].push(signal.value);
    }
  }

  const insights: BehavioralInsight[] = [];

  for (const [axisId, slowTimes] of Object.entries(slowByAxis)) {
    const total = totalByAxis[axisId] ?? 0;
    if (slowTimes.length < 2 || total < 3) continue;

    const slowRate = slowTimes.length / total;
    if (slowRate < 0.4) continue;

    const avgSlowTime = mean(slowTimes);
    const ratio = avgSlowTime / avgTime;
    const label = axisLabel(axisId);

    // 確信度: サンプル数と遅延の大きさで決定
    const confidence = Math.min(1.0,
      Math.min(1.0, slowTimes.length / 5) * Math.min(1.0, ratio / 2.0) * 0.85
    );

    insights.push({
      category: "hesitation_pattern",
      description: `「${label}」に関する質問で、回答に平均${Math.round(ratio * 100) / 100}倍の時間をかけている。この領域に整理できていない感情や、言語化しにくい葛藤がある。`,
      evidence: `${total}回中${slowTimes.length}回（${Math.round(slowRate * 100)}%）が平均応答時間を大幅に超過。平均${Math.round(avgSlowTime)}msに対し通常は${Math.round(avgTime)}ms`,
      confidence,
      affectedAxes: [axisId],
      userSurpriseFactor: 0.7, // 自分の躊躇には気づきにくい
    });
  }

  return insights;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Avoidance Zone Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 特定の軸で一貫して中央値（スコア ~0）かつ応答が速い場合、
 * 「考えたくないから無難に答えている」可能性を検出。
 */
function detectAvoidanceZones(input: BehavioralInsightInput): BehavioralInsight[] {
  const responseTimeSignals = input.signals.filter(s => s.type === "response_time");
  if (responseTimeSignals.length < 5) return [];

  const allTimes = responseTimeSignals.map(s => s.value);
  const avgTime = mean(allTimes);
  const fastThreshold = avgTime * 0.7;

  const insights: BehavioralInsight[] = [];

  // 軸ごとに: スコアの中央寄り度合い + 応答速度を評価
  const byAxis = groupBy(responseTimeSignals, s => s.axisId);

  for (const [axisId, signals] of Object.entries(byAxis)) {
    if (signals.length < 2) continue;

    const score = input.axisScores[axisId];
    if (score === undefined) continue;

    const isNeutralScore = Math.abs(score) < 0.2;
    const axisTimes = signals.map(s => s.value);
    const axisAvgTime = mean(axisTimes);
    const isFastResponse = axisAvgTime < fastThreshold;

    if (!isNeutralScore || !isFastResponse) continue;

    const label = axisLabel(axisId);
    const confidence = Math.min(1.0,
      Math.min(1.0, signals.length / 4) * 0.7
    );

    insights.push({
      category: "avoidance_zone",
      description: `「${label}」について、毎回素早く中間的な回答を選んでいる。この領域に向き合いたくない、あるいは考えること自体を避けている可能性がある。`,
      evidence: `軸スコア${Math.round(score * 100) / 100}（ほぼ中央）、平均応答時間${Math.round(axisAvgTime)}ms（全体平均${Math.round(avgTime)}msの${Math.round(axisAvgTime / avgTime * 100)}%）`,
      confidence,
      affectedAxes: [axisId],
      userSurpriseFactor: 0.85, // 回避は最も自覚しにくい
    });
  }

  return insights;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Answer Change Pattern Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 回答を変更するパターンを検出。
 * 変更の頻度、変更する軸の偏り、最初の直感と最終回答の差分を分析。
 */
function detectAnswerChangePatterns(input: BehavioralInsightInput): BehavioralInsight[] {
  const changeSignals = input.signals.filter(s => s.type === "answer_change");
  if (changeSignals.length < 3) return [];

  const insights: BehavioralInsight[] = [];
  const totalQuestions = new Set(input.signals.filter(s => s.type === "response_time").map(s => s.questionId)).size;

  if (totalQuestions < 5) return [];

  const changeRate = changeSignals.length / totalQuestions;

  // 全体的な変更率が高い場合
  if (changeRate > 0.3) {
    insights.push({
      category: "emotional_trigger",
      description: `回答の${Math.round(changeRate * 100)}%で、一度選んだ答えを変更している。最初の直感を信用できない、あるいは「正しい自分」を演出しようとする傾向がある。`,
      evidence: `${totalQuestions}問中${changeSignals.length}回の回答変更（変更率${Math.round(changeRate * 100)}%）`,
      confidence: Math.min(1.0, changeSignals.length / 8) * 0.75,
      affectedAxes: [...new Set(changeSignals.map(s => s.axisId))],
      userSurpriseFactor: 0.8,
    });
  }

  // 軸ごとの変更偏り
  const changeByAxis = groupBy(changeSignals, s => s.axisId);

  for (const [axisId, axisChanges] of Object.entries(changeByAxis)) {
    if (axisChanges.length < 2) continue;

    const axisTotal = input.signals.filter(
      s => s.type === "response_time" && s.axisId === axisId
    ).length;
    if (axisTotal < 2) continue;

    const axisChangeRate = axisChanges.length / axisTotal;
    if (axisChangeRate < 0.5) continue;

    const label = axisLabel(axisId);
    insights.push({
      category: "emotional_trigger",
      description: `「${label}」の質問で繰り返し回答を変えている。この領域で「こうありたい自分」と「実際の自分」が衝突している。`,
      evidence: `${axisTotal}問中${axisChanges.length}回の変更（${Math.round(axisChangeRate * 100)}%）。他の軸より有意に高い`,
      confidence: Math.min(1.0, axisChanges.length / 4) * 0.8,
      affectedAxes: [axisId],
      userSurpriseFactor: 0.75,
    });
  }

  return insights;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Decision Style Analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全体的な回答パターンから意思決定スタイルを分析。
 * - 速い/遅い
 * - 一貫/ばらつき
 * - 端寄り/中央寄り
 */
function analyzeDecisionStyle(input: BehavioralInsightInput): BehavioralInsight[] {
  const responseTimeSignals = input.signals.filter(s => s.type === "response_time");
  if (responseTimeSignals.length < 8) return [];

  const insights: BehavioralInsight[] = [];
  const allTimes = responseTimeSignals.map(s => s.value);
  const avgTime = mean(allTimes);
  const cv = coefficientOfVariation(allTimes);

  // 速度プロファイル
  const medianTime = median(allTimes);

  // スコアの端寄り/中央寄り傾向
  const scores = Object.values(input.axisScores);
  const edgeScores = scores.filter(s => Math.abs(s) > 0.6);
  const centerScores = scores.filter(s => Math.abs(s) < 0.2);
  const edgeRatio = scores.length > 0 ? edgeScores.length / scores.length : 0;
  const centerRatio = scores.length > 0 ? centerScores.length / scores.length : 0;

  // 速度の一貫性 vs ばらつき
  if (cv > 0.8) {
    // 大きなばらつき = 質問によって反応が極端に違う
    const fastQuestions = responseTimeSignals.filter(s => s.value < avgTime * 0.5);
    const slowQuestions = responseTimeSignals.filter(s => s.value > avgTime * 2.0);

    if (fastQuestions.length >= 2 && slowQuestions.length >= 2) {
      const fastAxes = [...new Set(fastQuestions.map(s => s.axisId))];
      const slowAxes = [...new Set(slowQuestions.map(s => s.axisId))];

      insights.push({
        category: "decision_style",
        description: `回答速度の差が極端に大きい。即答できる領域と、立ち止まる領域がはっきり分かれている。確信と迷いの境界線に自己理解のヒントがある。`,
        evidence: `応答時間の変動係数${Math.round(cv * 100) / 100}。最速群の平均${Math.round(mean(fastQuestions.map(s => s.value)))}ms vs 最遅群の平均${Math.round(mean(slowQuestions.map(s => s.value)))}ms`,
        confidence: Math.min(1.0, responseTimeSignals.length / 12) * 0.7,
        affectedAxes: [...new Set([...fastAxes, ...slowAxes])],
        userSurpriseFactor: 0.6,
      });
    }
  } else if (cv < 0.3 && medianTime < 2500) {
    // 一貫して速い = 直感型
    insights.push({
      category: "decision_style",
      description: `ほぼ全ての質問に迷いなく即答している。直感を信じるタイプだが、即答できること自体が「深く考えていない」サインの場合もある。`,
      evidence: `応答時間の中央値${Math.round(medianTime)}ms、変動係数${Math.round(cv * 100) / 100}（非常に一貫した速度）`,
      confidence: Math.min(1.0, responseTimeSignals.length / 10) * 0.65,
      affectedAxes: [],
      userSurpriseFactor: 0.5,
    });
  } else if (cv < 0.3 && medianTime > 6000) {
    // 一貫して遅い = 熟慮型
    insights.push({
      category: "decision_style",
      description: `全ての質問にじっくり時間をかけている。慎重で思慮深いが、「正解を探す」姿勢が自己観測を歪めている可能性もある。`,
      evidence: `応答時間の中央値${Math.round(medianTime)}ms、変動係数${Math.round(cv * 100) / 100}（一貫して熟慮）`,
      confidence: Math.min(1.0, responseTimeSignals.length / 10) * 0.65,
      affectedAxes: [],
      userSurpriseFactor: 0.45,
    });
  }

  // 端寄り vs 中央寄り
  if (edgeRatio > 0.6) {
    insights.push({
      category: "decision_style",
      description: `多くの軸で極端な回答を選ぶ傾向がある。自分の特徴を強く自覚している一方で、グレーゾーンを認めにくい可能性がある。`,
      evidence: `${scores.length}軸中${edgeScores.length}軸（${Math.round(edgeRatio * 100)}%）でスコアが極端（|score| > 0.6）`,
      confidence: Math.min(1.0, scores.length / 10) * 0.6,
      affectedAxes: [],
      userSurpriseFactor: 0.55,
    });
  } else if (centerRatio > 0.5) {
    insights.push({
      category: "decision_style",
      description: `多くの軸で中間的な回答を選んでいる。「どちらでもある」が本心の場合と、「深く考えたくない」が本心の場合がある。どちらだろう？`,
      evidence: `${scores.length}軸中${centerScores.length}軸（${Math.round(centerRatio * 100)}%）でスコアが中央寄り（|score| < 0.2）`,
      confidence: Math.min(1.0, scores.length / 10) * 0.6,
      affectedAxes: [],
      userSurpriseFactor: 0.65,
    });
  }

  return insights;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Self-Deception Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 自己申告スコアと行動信号の乖離を検出。
 *
 * 例: 「大胆」とスコアしているが、応答時間は常に長い → 実は慎重
 * 例: 「計画的」とスコアしているが、セッション利用時間がランダム → 実は即興的
 */
function detectSelfDeception(input: BehavioralInsightInput): BehavioralInsight[] {
  const responseTimeSignals = input.signals.filter(s => s.type === "response_time");
  if (responseTimeSignals.length < 5) return [];

  const insights: BehavioralInsight[] = [];
  const allTimes = responseTimeSignals.map(s => s.value);
  const avgTime = mean(allTimes);
  const changeSignals = input.signals.filter(s => s.type === "answer_change");
  const backNavSignals = input.signals.filter(s => s.type === "back_navigation");

  // パターン1: 「大胆」スコアだが応答が遅い
  const boldScore = input.axisScores["cautious_vs_bold"];
  if (boldScore !== undefined && boldScore > 0.4) {
    const avgTimeForBold = mean(
      responseTimeSignals.filter(s => s.axisId === "cautious_vs_bold").map(s => s.value)
    );
    if (avgTimeForBold > avgTime * 1.8 && responseTimeSignals.filter(s => s.axisId === "cautious_vs_bold").length >= 2) {
      insights.push({
        category: "self_deception",
        description: `「大胆」寄りと自覚しているが、この領域の質問に最も時間がかかっている。本当は慎重なのに「大胆でありたい」と思っている可能性がある。`,
        evidence: `「慎重/大胆」のスコア${Math.round(boldScore * 100) / 100}（大胆寄り）だが、この軸の平均応答時間${Math.round(avgTimeForBold)}msは全体平均${Math.round(avgTime)}msの${Math.round(avgTimeForBold / avgTime * 100)}%`,
        confidence: 0.7,
        affectedAxes: ["cautious_vs_bold"],
        userSurpriseFactor: 0.9,
      });
    }
  }

  // パターン2: 「完璧主義ではない」スコアだが回答変更が多い
  const perfScore = input.axisScores["perfectionist_vs_pragmatic"];
  if (perfScore !== undefined && perfScore > 0.3) {
    const totalQuestions = new Set(responseTimeSignals.map(s => s.questionId)).size;
    const changeRate = totalQuestions > 0 ? changeSignals.length / totalQuestions : 0;
    if (changeRate > 0.25) {
      insights.push({
        category: "self_deception",
        description: `「実用・前進重視」と答えているが、回答の${Math.round(changeRate * 100)}%で選択を変えている。完璧を求める傾向が行動に現れている。`,
        evidence: `「完成度重視/実用・前進重視」スコア${Math.round(perfScore * 100) / 100}だが、回答変更率${Math.round(changeRate * 100)}%`,
        confidence: 0.65,
        affectedAxes: ["perfectionist_vs_pragmatic"],
        userSurpriseFactor: 0.85,
      });
    }
  }

  // パターン3: 「独立」スコアだが戻り操作が多い（他者の反応を気にする行動）
  const indepScore = input.axisScores["independence_vs_harmony"];
  if (indepScore !== undefined && indepScore < -0.3) {
    const backNavCount = backNavSignals.length;
    const totalQuestions = new Set(responseTimeSignals.map(s => s.questionId)).size;
    const backRate = totalQuestions > 0 ? backNavCount / totalQuestions : 0;
    if (backRate > 0.2 && backNavCount >= 3) {
      insights.push({
        category: "self_deception",
        description: `「独立」寄りと答えているが、回答後に頻繁に戻って確認している。他者からどう見えるかを気にする傾向が行動に出ている。`,
        evidence: `「独立/調和」スコア${Math.round(indepScore * 100) / 100}（独立寄り）だが、戻り操作率${Math.round(backRate * 100)}%（${backNavCount}回）`,
        confidence: 0.6,
        affectedAxes: ["independence_vs_harmony"],
        userSurpriseFactor: 0.9,
      });
    }
  }

  // パターン4: 極端なスコア + 極端に長い応答時間 = 確信があるように見せている
  for (const [axisId, score] of Object.entries(input.axisScores)) {
    if (Math.abs(score) < 0.7) continue;

    const axisTimes = responseTimeSignals
      .filter(s => s.axisId === axisId)
      .map(s => s.value);
    if (axisTimes.length < 2) continue;

    const axisAvgTime = mean(axisTimes);
    if (axisAvgTime < avgTime * 2.0) continue;

    const label = axisLabel(axisId);
    const side = score > 0
      ? (getAxisLabels(axisId as TraitAxisKey)?.right ?? "正側")
      : (getAxisLabels(axisId as TraitAxisKey)?.left ?? "負側");

    insights.push({
      category: "self_deception",
      description: `「${label}」で「${side}」の確信的スコアを出しているが、回答には平均の${Math.round(axisAvgTime / avgTime * 10) / 10}倍の時間がかかっている。強い確信の裏に、認めたくない迷いがある。`,
      evidence: `スコア${Math.round(score * 100) / 100}（極端）だが応答時間${Math.round(axisAvgTime)}ms（全体平均${Math.round(avgTime)}msの${Math.round(axisAvgTime / avgTime * 100)}%）`,
      confidence: Math.min(1.0, axisTimes.length / 4) * 0.65,
      affectedAxes: [axisId],
      userSurpriseFactor: 0.92,
    });
  }

  return insights;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 行動信号から包括的なインサイトを生成する。
 *
 * 5つの分析を並行実行し、確信度と意外性で並べて返す。
 * 最大10件を返す。
 *
 * 使い方:
 * 1. セッション終了時、または十分なシグナルが集まった時点で呼ぶ
 * 2. confidence >= 0.5 のインサイトのみをユーザーに表示
 * 3. userSurpriseFactor が高いものを優先表示（ユーザーが知らないことほど価値がある）
 */
export function generateBehavioralInsights(
  input: BehavioralInsightInput,
): BehavioralInsight[] {
  if (input.signals.length < 5) return [];

  const allInsights: BehavioralInsight[] = [
    ...detectHesitationPatterns(input),
    ...detectAvoidanceZones(input),
    ...detectAnswerChangePatterns(input),
    ...analyzeDecisionStyle(input),
    ...detectSelfDeception(input),
  ];

  // 重複排除: 同じカテゴリ + 同じ軸の組み合わせは最も confidence が高いものだけ残す
  const deduped = new Map<string, BehavioralInsight>();
  for (const insight of allInsights) {
    const key = `${insight.category}:${insight.affectedAxes.sort().join(",")}`;
    const existing = deduped.get(key);
    if (!existing || existing.confidence < insight.confidence) {
      deduped.set(key, insight);
    }
  }

  // ソート: userSurpriseFactor * confidence の降順（意外性 x 確信度）
  return [...deduped.values()]
    .sort((a, b) =>
      (b.userSurpriseFactor * b.confidence) - (a.userSurpriseFactor * a.confidence)
    )
    .slice(0, 10);
}

/**
 * インサイトの重要度ラベルを返す（UI表示用）
 */
export function getInsightImportanceLabel(insight: BehavioralInsight): {
  level: "critical" | "high" | "medium" | "low";
  label: string;
} {
  const score = insight.userSurpriseFactor * insight.confidence;
  if (score >= 0.7) return { level: "critical", label: "重要な発見" };
  if (score >= 0.5) return { level: "high", label: "注目すべきパターン" };
  if (score >= 0.3) return { level: "medium", label: "興味深い傾向" };
  return { level: "low", label: "参考情報" };
}

/**
 * 特定のカテゴリのインサイトのみをフィルタする。
 */
export function filterInsightsByCategory(
  insights: BehavioralInsight[],
  category: InsightCategory,
): BehavioralInsight[] {
  return insights.filter(i => i.category === category);
}
