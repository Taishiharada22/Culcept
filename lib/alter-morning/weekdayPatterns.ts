/**
 * Weekday Pattern Tracker — 曜日別パターン学習（Phase 4）
 *
 * Morning Protocolの利用データから曜日別の傾向を蓄積する。
 *
 * 記録するもの:
 * - プラン作成回数（曜日別）
 * - タスク完了/途中/中止の比率（曜日別）
 * - 連続プラン作成日数（ストリーク）
 *
 * 用途:
 * - ProactiveInsightEngine がパターンからインサイトを生成
 * - 「金曜はいつも調子いいね」「月曜は軽めにする？」等
 */

import type { WeekdayRecord, WeekdayPatternStore } from "./types";
import { todayJST, dayOfWeekJST } from "./dateUtils";

const STORAGE_KEY = "alter_morning_weekday_v1";
const CURRENT_VERSION = 1;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Load / Save
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function emptyRecord(): WeekdayRecord {
  return { planCount: 0, taskTotal: 0, taskCompleted: 0, taskPartial: 0, taskSkipped: 0 };
}

function emptyStore(): WeekdayPatternStore {
  return {
    weekdays: [emptyRecord(), emptyRecord(), emptyRecord(), emptyRecord(), emptyRecord(), emptyRecord(), emptyRecord()],
    totalPlans: 0,
    currentStreak: 0,
    lastPlanDate: null,
    version: CURRENT_VERSION,
  };
}

export function loadWeekdayStore(): WeekdayPatternStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as WeekdayPatternStore;
    if (parsed.version !== CURRENT_VERSION) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function saveWeekdayStore(store: WeekdayPatternStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* storage full */ }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 記録関数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const today = todayJST;
const dayOfWeek = dayOfWeekJST;

/**
 * プランが確定された時に呼ぶ。
 * 曜日別プラン回数・タスク数を記録し、ストリークを更新する。
 */
export function recordPlanCreated(itemCount: number): void {
  const store = loadWeekdayStore();
  const dow = dayOfWeek();
  const todayStr = today();

  // 同日に複数回プラン作成した場合は重複カウントしない
  if (store.lastPlanDate === todayStr) return;

  const rec = { ...store.weekdays[dow] };
  rec.planCount += 1;
  rec.taskTotal += itemCount;

  const weekdays = [...store.weekdays] as WeekdayPatternStore["weekdays"];
  weekdays[dow] = rec;

  // ストリーク計算: 前日の翌日 = 今日なら継続、それ以外はリセット
  let streak = 1;
  if (store.lastPlanDate) {
    const lastDate = new Date(store.lastPlanDate);
    const nextDay = new Date(lastDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split("T")[0];
    if (nextDayStr === todayStr) {
      streak = store.currentStreak + 1;
    }
  }

  saveWeekdayStore({
    ...store,
    weekdays,
    totalPlans: store.totalPlans + 1,
    currentStreak: streak,
    lastPlanDate: todayStr,
  });
}

/**
 * フォローアップでタスクの進捗が報告された時に呼ぶ。
 */
export function recordTaskOutcome(status: "done" | "partial" | "skipped"): void {
  const store = loadWeekdayStore();
  const dow = dayOfWeek();

  const rec = { ...store.weekdays[dow] };
  switch (status) {
    case "done":
      rec.taskCompleted += 1;
      break;
    case "partial":
      rec.taskPartial += 1;
      break;
    case "skipped":
      rec.taskSkipped += 1;
      break;
  }

  const weekdays = [...store.weekdays] as WeekdayPatternStore["weekdays"];
  weekdays[dow] = rec;

  saveWeekdayStore({ ...store, weekdays });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 分析関数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export interface WeekdayAnalysis {
  /** 曜日名（"月", "火", ...） */
  label: string;
  /** 曜日インデックス（0-6） */
  dow: number;
  /** 完了率（0-1）。データ不足の場合は null */
  completionRate: number | null;
  /** この曜日のプラン回数 */
  planCount: number;
  /** この曜日の平均タスク数 */
  avgTasks: number;
}

/**
 * 全曜日の分析結果を返す。
 */
export function getWeekdayAnalysis(store: WeekdayPatternStore): WeekdayAnalysis[] {
  return store.weekdays.map((rec, i) => {
    const responded = rec.taskCompleted + rec.taskPartial + rec.taskSkipped;
    return {
      label: WEEKDAY_LABELS[i],
      dow: i,
      completionRate: responded >= 2 ? rec.taskCompleted / responded : null,
      planCount: rec.planCount,
      avgTasks: rec.planCount > 0 ? rec.taskTotal / rec.planCount : 0,
    };
  });
}

/**
 * 全体の完了率を返す（比較基準用）。
 */
export function getOverallCompletionRate(store: WeekdayPatternStore): number | null {
  let totalCompleted = 0;
  let totalResponded = 0;
  for (const rec of store.weekdays) {
    totalCompleted += rec.taskCompleted;
    totalResponded += rec.taskCompleted + rec.taskPartial + rec.taskSkipped;
  }
  return totalResponded >= 3 ? totalCompleted / totalResponded : null;
}
