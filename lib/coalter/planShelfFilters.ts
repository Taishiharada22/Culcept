/**
 * CoAlter Plan Shelf — 日付フィルタ・カウント・グルーピング（pure helpers）
 *
 * Phase 1.5.1 — UI コンポーネント（CoAlterShelfPanel / CoAlterPlanCalendar）と
 * ユニットテストから共有する純粋関数群。
 *
 * - target_date >= today でフィルタ
 * - 今日/週内のカウント
 * - 今日/明日/今週/来週/以降 にグルーピング
 *
 * 日付は `YYYY-MM-DD` の ISO ローカル文字列で扱う（文字列比較で時系列が一致）。
 */

import type { PlanItem } from "./planShelf";

/** Date → "YYYY-MM-DD" */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface ShelfDateRefs {
  todayStr: string;
  tomorrowStr: string;
  /** 今週の土曜日（含む） */
  weekEndStr: string;
  /** 翌週の土曜日（含む） */
  nextWeekEndStr: string;
}

/** 基準日（デフォルト `new Date()`）から、Shelf で使う日付境界文字列を作る */
export function buildDateRefs(base: Date = new Date()): ShelfDateRefs {
  const todayStr = toDateStr(base);
  const tmr = new Date(base);
  tmr.setDate(tmr.getDate() + 1);
  const tomorrowStr = toDateStr(tmr);

  const weekEnd = new Date(base);
  const dayOfWeek = base.getDay(); // 0=Sun … 6=Sat
  const daysUntilSat = (6 - dayOfWeek + 7) % 7;
  weekEnd.setDate(weekEnd.getDate() + daysUntilSat);
  const weekEndStr = toDateStr(weekEnd);

  const nextWeekEnd = new Date(weekEnd);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
  const nextWeekEndStr = toDateStr(nextWeekEnd);

  return { todayStr, tomorrowStr, weekEndStr, nextWeekEndStr };
}

/**
 * target_date >= today のアイテムのみ残す。
 * 過去日付は完全に除外される（Shelf は "今日から先" を映す台）。
 */
export function filterUpcoming(items: PlanItem[], refs: ShelfDateRefs): PlanItem[] {
  return items.filter((i) => i.targetDate >= refs.todayStr);
}

/**
 * 今日/週内のカウント（アップカミング前提、過去含めない）。
 * weekCount は today〜今週土曜（含む）の件数。
 */
export function countShelfSummary(items: PlanItem[], refs: ShelfDateRefs) {
  const { todayStr, weekEndStr } = refs;
  let today = 0;
  let week = 0;
  for (const item of items) {
    if (item.targetDate === todayStr) today += 1;
    if (item.targetDate >= todayStr && item.targetDate <= weekEndStr) week += 1;
  }
  return { todayCount: today, weekCount: week };
}

export interface ShelfGroups {
  today: PlanItem[];
  tomorrow: PlanItem[];
  thisWeek: PlanItem[];
  nextWeek: PlanItem[];
  later: PlanItem[];
}

/**
 * アイテムを日付グループに振り分ける。
 * - today: today
 * - tomorrow: tomorrow
 * - thisWeek: (tomorrow, weekEnd]
 * - nextWeek: (weekEnd, nextWeekEnd]
 * - later: > nextWeekEnd
 */
export function groupByDateBuckets(items: PlanItem[], refs: ShelfDateRefs): ShelfGroups {
  const { todayStr, tomorrowStr, weekEndStr, nextWeekEndStr } = refs;
  const groups: ShelfGroups = {
    today: [],
    tomorrow: [],
    thisWeek: [],
    nextWeek: [],
    later: [],
  };
  for (const item of items) {
    const d = item.targetDate;
    if (d === todayStr) groups.today.push(item);
    else if (d === tomorrowStr) groups.tomorrow.push(item);
    else if (d <= weekEndStr) groups.thisWeek.push(item);
    else if (d <= nextWeekEndStr) groups.nextWeek.push(item);
    else groups.later.push(item);
  }
  return groups;
}
