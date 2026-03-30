// lib/stargazer/predictionLearningLoop.ts
// 予測学習ループ — フィードバックから予測精度を学習し、次の予測を改善する
//
// 設計思想:
// "予測が外れたとき、それはシステムの失敗ではなく、新しい情報"
// "カテゴリごとの精度を追跡し、得意分野を伸ばし、苦手分野を別角度から攻める"

import { safeSetItem } from "./localStorageHelper";
import type { Prediction, PredictionFeedback } from "./predictionEngine";
import { loadPredictions } from "./predictionEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CategoryAccuracy {
  category: string;
  attempts: number;
  correct: number;
  partial: number;
  wrong: number;
  rate: number;
  trend: "improving" | "stable" | "declining";
  bestDayOfWeek: number | null;
  worstDayOfWeek: number | null;
}

export interface AxisCombinationAccuracy {
  /** 例: "introvert_vs_extrovert+cautious_vs_bold" */
  axisPair: string;
  attempts: number;
  correct: number;
  rate: number;
}

export interface PredictionLearningState {
  /** 全体の精度統計 */
  overallRate: number;
  overallTrend: "improving" | "stable" | "declining";
  /** カテゴリ別精度 */
  categoryAccuracies: CategoryAccuracy[];
  /** 軸組み合わせの精度 */
  axisCombinations: AxisCombinationAccuracy[];
  /** 推奨: 信頼度を上げるべきカテゴリ */
  highConfidenceCategories: string[];
  /** 推奨: 別角度で攻めるべきカテゴリ */
  lowConfidenceCategories: string[];
  /** 推奨: 信頼度調整係数 (カテゴリ -> 0.5-1.5) */
  confidenceAdjustments: Record<string, number>;
  /** 直近の学習イベント数 */
  totalFeedbackEvents: number;
  /** 最終更新 */
  lastUpdated: number;
}

interface FeedbackEvent {
  predictionId: string;
  feedback: PredictionFeedback;
  category: string;
  basedOn: string;
  dayOfWeek: number;
  timestamp: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LEARNING_STATE_KEY = "stargazer_prediction_learning_v1";
const FEEDBACK_EVENTS_KEY = "stargazer_prediction_feedback_v1";
const MAX_FEEDBACK_EVENTS = 200;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feedback Recording
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 予測へのフィードバックを記録し、学習状態を更新する。
 */
export function updateLearningFromFeedback(
  predictionId: string,
  feedback: PredictionFeedback,
): void {
  if (typeof window === "undefined") return;

  const predictions = loadPredictions();
  const prediction = predictions.find((p) => p.id === predictionId);
  if (!prediction) return;

  // フィードバックイベントを記録
  const event: FeedbackEvent = {
    predictionId,
    feedback,
    category: prediction.category,
    basedOn: prediction.basedOn,
    dayOfWeek: new Date(prediction.createdAt).getDay(),
    timestamp: Date.now(),
  };

  const events = loadFeedbackEvents();
  events.push(event);

  // 上限を超えたら古いものを削除
  const trimmed = events.slice(-MAX_FEEDBACK_EVENTS);
  safeSetItem(FEEDBACK_EVENTS_KEY, JSON.stringify(trimmed));

  // 学習状態を再計算
  rebuildLearningState(trimmed);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Learning State Computation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function rebuildLearningState(events: FeedbackEvent[]): void {
  if (events.length === 0) return;

  // -- カテゴリ別精度 --
  const categoryMap = new Map<
    string,
    { correct: number; partial: number; wrong: number; byDay: Map<number, { correct: number; total: number }> }
  >();

  for (const e of events) {
    if (!categoryMap.has(e.category)) {
      categoryMap.set(e.category, { correct: 0, partial: 0, wrong: 0, byDay: new Map() });
    }
    const cat = categoryMap.get(e.category)!;
    if (e.feedback === "correct") cat.correct++;
    else if (e.feedback === "partially") cat.partial++;
    else cat.wrong++;

    // 曜日別
    if (!cat.byDay.has(e.dayOfWeek)) {
      cat.byDay.set(e.dayOfWeek, { correct: 0, total: 0 });
    }
    const day = cat.byDay.get(e.dayOfWeek)!;
    day.total++;
    if (e.feedback === "correct") day.correct++;
    else if (e.feedback === "partially") day.correct += 0.5;
  }

  const categoryAccuracies: CategoryAccuracy[] = [];
  for (const [category, stats] of categoryMap) {
    const attempts = stats.correct + stats.partial + stats.wrong;
    const rate = attempts > 0 ? (stats.correct + stats.partial * 0.5) / attempts : 0;

    // 曜日別の最良・最悪
    let bestDay: number | null = null;
    let bestDayRate = -1;
    let worstDay: number | null = null;
    let worstDayRate = 2;
    for (const [day, dayStats] of stats.byDay) {
      if (dayStats.total < 2) continue;
      const dayRate = dayStats.correct / dayStats.total;
      if (dayRate > bestDayRate) { bestDayRate = dayRate; bestDay = day; }
      if (dayRate < worstDayRate) { worstDayRate = dayRate; worstDay = day; }
    }

    // トレンド: 前半 vs 後半
    const catEvents = events.filter((e) => e.category === category);
    const trend = computeTrend(catEvents);

    categoryAccuracies.push({
      category,
      attempts,
      correct: stats.correct,
      partial: stats.partial,
      wrong: stats.wrong,
      rate: Math.round(rate * 1000) / 1000,
      trend,
      bestDayOfWeek: bestDay,
      worstDayOfWeek: worstDay,
    });
  }

  // -- 軸組み合わせの精度 --
  const axisMap = new Map<string, { correct: number; total: number }>();
  for (const e of events) {
    // basedOn から軸ペアを抽出 (例: "introvert_vs_extrovert軸と..." -> 軸ID)
    const axisIds = extractAxisIds(e.basedOn);
    if (axisIds.length === 0) continue;
    const key = axisIds.sort().join("+");
    if (!axisMap.has(key)) axisMap.set(key, { correct: 0, total: 0 });
    const pair = axisMap.get(key)!;
    pair.total++;
    if (e.feedback === "correct") pair.correct++;
    else if (e.feedback === "partially") pair.correct += 0.5;
  }

  const axisCombinations: AxisCombinationAccuracy[] = [];
  for (const [axisPair, stats] of axisMap) {
    axisCombinations.push({
      axisPair,
      attempts: stats.total,
      correct: stats.correct,
      rate: stats.total > 0 ? Math.round((stats.correct / stats.total) * 1000) / 1000 : 0,
    });
  }

  // -- 信頼度調整係数 --
  const confidenceAdjustments: Record<string, number> = {};
  const highConfidenceCategories: string[] = [];
  const lowConfidenceCategories: string[] = [];

  for (const cat of categoryAccuracies) {
    if (cat.attempts < 3) {
      confidenceAdjustments[cat.category] = 1.0; // データ不足: 調整なし
      continue;
    }
    if (cat.rate >= 0.7) {
      // 高精度: 信頼度を上げる
      confidenceAdjustments[cat.category] = Math.min(1.4, 1.0 + (cat.rate - 0.5) * 0.8);
      highConfidenceCategories.push(cat.category);
    } else if (cat.rate <= 0.3) {
      // 低精度: 信頼度を下げ、別角度で攻める
      confidenceAdjustments[cat.category] = Math.max(0.5, 0.7 - (0.3 - cat.rate));
      lowConfidenceCategories.push(cat.category);
    } else {
      confidenceAdjustments[cat.category] = 0.8 + cat.rate * 0.4;
    }
  }

  // -- 全体精度 --
  const totalCorrect = events.filter((e) => e.feedback === "correct").length;
  const totalPartial = events.filter((e) => e.feedback === "partially").length;
  const overallRate = events.length > 0
    ? (totalCorrect + totalPartial * 0.5) / events.length
    : 0;
  const overallTrend = computeTrend(events);

  const state: PredictionLearningState = {
    overallRate: Math.round(overallRate * 1000) / 1000,
    overallTrend,
    categoryAccuracies,
    axisCombinations,
    highConfidenceCategories,
    lowConfidenceCategories,
    confidenceAdjustments,
    totalFeedbackEvents: events.length,
    lastUpdated: Date.now(),
  };

  safeSetItem(LEARNING_STATE_KEY, JSON.stringify(state));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// State Access
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 現在の予測学習状態を取得する。
 * 予測生成時にこの状態を参照して信頼度やカテゴリ選択を調整する。
 */
export function getPredictionLearningState(): PredictionLearningState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEARNING_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PredictionLearningState;
  } catch {
    return null;
  }
}

/**
 * 指定カテゴリの信頼度調整係数を取得する。
 * 予測の confidence に乗算して使用。
 */
export function getConfidenceAdjustment(category: string): number {
  const state = getPredictionLearningState();
  if (!state) return 1.0;
  return state.confidenceAdjustments[category] ?? 1.0;
}

/**
 * 低精度カテゴリの代替角度を提案する。
 * 予測生成時に使用: 同じカテゴリで異なるアプローチを試みる。
 */
export function suggestAlternativeAngle(category: string): string | null {
  const state = getPredictionLearningState();
  if (!state) return null;

  const catAccuracy = state.categoryAccuracies.find((c) => c.category === category);
  if (!catAccuracy || catAccuracy.rate > 0.4) return null;

  // 精度が低い場合、高精度カテゴリのアプローチを借用
  if (state.highConfidenceCategories.length > 0) {
    return state.highConfidenceCategories[0];
  }
  return null;
}

/**
 * 避けるべき曜日を提案する。
 * 特定カテゴリの予測精度が特定曜日で著しく低い場合、その曜日を避ける。
 */
export function shouldAvoidCategoryOnDay(
  category: string,
  dayOfWeek: number,
): boolean {
  const state = getPredictionLearningState();
  if (!state) return false;

  const catAccuracy = state.categoryAccuracies.find((c) => c.category === category);
  if (!catAccuracy) return false;

  return catAccuracy.worstDayOfWeek === dayOfWeek && catAccuracy.rate < 0.3;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function loadFeedbackEvents(): FeedbackEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FEEDBACK_EVENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FeedbackEvent[];
  } catch {
    return [];
  }
}

function computeTrend(
  events: FeedbackEvent[],
): "improving" | "stable" | "declining" {
  if (events.length < 6) return "stable";

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const mid = Math.floor(sorted.length / 2);
  const earlier = sorted.slice(0, mid);
  const recent = sorted.slice(mid);

  const rateOf = (evts: FeedbackEvent[]) => {
    if (evts.length === 0) return 0;
    let score = 0;
    for (const e of evts) {
      if (e.feedback === "correct") score += 1;
      else if (e.feedback === "partially") score += 0.5;
    }
    return score / evts.length;
  };

  const diff = rateOf(recent) - rateOf(earlier);
  if (diff > 0.1) return "improving";
  if (diff < -0.1) return "declining";
  return "stable";
}

/**
 * basedOn テキストから軸IDを抽出する。
 * 例: "introvert_vs_extrovert軸の曜日パターン" -> ["introvert_vs_extrovert"]
 */
function extractAxisIds(basedOn: string): string[] {
  const ids: string[] = [];
  // "_vs_" を含むトークンを軸IDとして抽出
  const words = basedOn.split(/[軸と\s,]/);
  for (const w of words) {
    if (w.includes("_vs_") || w.includes("_")) {
      const cleaned = w.replace(/[^a-z_]/g, "");
      if (cleaned.length > 3) ids.push(cleaned);
    }
  }
  return ids;
}
