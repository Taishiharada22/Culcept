/**
 * Plan CalendarTab — Month Grid pure model (Phase 2-A+ M1)
 *
 * 取り込んだ月を俯瞰する Full month grid (6×7 = 42 cells) の純ロジック。
 * 設計: Plan 月ビュー mini design（2026-06-03 CEO chat 承認、M1）。
 *
 * 既存 _helpers.ts の date primitive（getMonthStart / getLastDayOfMonth /
 * addDays / isoDate / clampDateToMonth）を再利用し、日付ロジックを再発明しない。
 * 特に cell.iso は isoDate（"YYYY-MM-DD"）= 既存 anchors / dayIndicators の
 * date key と完全に同形式（CEO 必須要件「date key 一致」を helper 流用で自動充足）。
 *
 * 不変原則:
 *   - すべて pure（副作用なし・現在時刻参照なし・入力 mutate なし）
 *   - timezone: UTC 内部に統一（Date.UTC / utcMidnight / isoDate）
 *   - 固定 6 週 = 42 cells（月によらず一定高。iOS Calendar 方式で月送り時に高さが跳ねない）
 *   - 週開始 = 日曜（Sun-first、日本ロケール標準。buildWeekStrip と統一）
 *   - UI / DB / API 非接触（M1 は dormant pure model。wire は M3 以降）
 */

import {
  addDays,
  clampDateToMonth,
  getLastDayOfMonth,
  getMonthStart,
  isoDate,
} from "./_helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** grid 固定行数（iOS Calendar 方式の一定高。月によらず常に 6 週） */
export const MONTH_GRID_ROWS = 6;
/** 1 週の日数（Sun-first） */
export const DAYS_PER_WEEK = 7;
/** grid 総 cell 数（6 × 7） */
export const MONTH_GRID_CELLS = MONTH_GRID_ROWS * DAYS_PER_WEEK; // 42

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 月 grid の 1 cell（leading / trailing 含む 42 cell の各日）。
 *
 * 注: 現状は WeekStripCell と構造が同一だが、M2 で表示専用フィールド
 * （dot 情報・isToday 等）を足す想定があるため別 interface として独立させる。
 */
export interface MonthGridCell {
  /** UTC midnight Date */
  date: Date;
  /** "YYYY-MM-DD"（isoDate）= 既存 anchors / dayIndicators の date key と同形式 */
  iso: string;
  /** 1-31 */
  dayOfMonth: number;
  /** false = leading / trailing（前月 / 翌月の日。薄色表示用） */
  inCurrentMonth: boolean;
}

/** buildMonthGrid の出力 */
export interface MonthGrid {
  /** 表示対象月の西暦年 */
  year: number;
  /** 表示対象月（0-indexed、UTCMonth 規約。getLastDayOfMonth / clampDateToMonth と統一） */
  month: number;
  /** 月初 1 日（UTC midnight） */
  monthStart: Date;
  /** 月末日（28 / 29 / 30 / 31、閏年対応） */
  lastDayOfMonth: number;
  /** 6 週 × 7 日 = 42 cell（flat、Sun-first 並び） */
  cells: MonthGridCell[];
  /** 6 行 × 7 cell（rendering 用。cells を 7 ずつ分割した同一参照） */
  weeks: MonthGridCell[][];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Builders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 対象月の Full month grid（6 × 7 = 42 cell、Sun-first）を組む。
 *
 * - grid 先頭 = 月初 1 日を含む週の日曜（leading = 前月末の数日。月初が日曜なら leading 0）
 * - 末尾 = 42 cell を満たすまで翌月へ（trailing）
 * - 月によらず常に 42 cell（一定高。月送りで高さが跳ねない）
 *
 * @param monthAnchor 対象月の任意の日（内部で getMonthStart 正規化。月初でなくてよい）
 *
 * @example
 *   buildMonthGrid(new Date(Date.UTC(2025, 5, 1)))  // 2025/6（月初=日曜）
 *   // cells[0].iso="2025-06-01"(当月) … cells[41].iso="2025-07-12"(trailing)
 */
export function buildMonthGrid(monthAnchor: Date): MonthGrid {
  const monthStart = getMonthStart(monthAnchor);
  const year = monthStart.getUTCFullYear();
  const month = monthStart.getUTCMonth(); // 0-indexed
  const lastDayOfMonth = getLastDayOfMonth(year, month);

  // grid 先頭 = 月初を含む週の日曜（dow 0=Sun）。leading を負方向に戻す。
  const firstDow = monthStart.getUTCDay();
  const gridStart = addDays(monthStart, -firstDow);

  const cells: MonthGridCell[] = Array.from(
    { length: MONTH_GRID_CELLS },
    (_, i) => {
      const date = addDays(gridStart, i);
      return {
        date,
        iso: isoDate(date),
        dayOfMonth: date.getUTCDate(),
        inCurrentMonth:
          date.getUTCMonth() === month && date.getUTCFullYear() === year,
      };
    }
  );

  // cells を 7 ずつ分割（同一参照。コピーしない）
  const weeks: MonthGridCell[][] = Array.from(
    { length: MONTH_GRID_ROWS },
    (_, w) => cells.slice(w * DAYS_PER_WEEK, w * DAYS_PER_WEEK + DAYS_PER_WEEK)
  );

  return { year, month, monthStart, lastDayOfMonth, cells, weeks };
}

/**
 * 月移動時に selectedDate の「日」を移動先月に clamp して返す。
 *
 * 例: selectedDate=1/31 → 2 月へ移動 → 2/28（非閏年）/ 2/29（閏年）。
 * 既存 clampDateToMonth を薄く wrap（再発明しない）。M3 の月送り state で使用想定。
 *
 * @param selectedDate 現在の選択日（UTC）
 * @param targetMonthAnchor 移動先月の任意の日（年・月のみ参照）
 *
 * @example
 *   clampSelectedDateToMonth(utc(2025,0,31), utc(2025,1,15)) // → 2025-02-28
 *   clampSelectedDateToMonth(utc(2028,0,31), utc(2028,1,10)) // → 2028-02-29（閏年）
 */
export function clampSelectedDateToMonth(
  selectedDate: Date,
  targetMonthAnchor: Date
): Date {
  return clampDateToMonth(
    targetMonthAnchor.getUTCFullYear(),
    targetMonthAnchor.getUTCMonth(),
    selectedDate.getUTCDate()
  );
}
