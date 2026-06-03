"use client";

/**
 * MonthGridView — Full month grid (6×7 = 42 cells) presentational component
 *   (Plan 月ビュー Phase 2-A+ M2)
 *
 * 取り込んだ月を俯瞰する月 grid の「見た目だけ」。CalendarTab には未接続
 * （接続 / flag / 月送り state / shift import 導線は M3 以降）。
 *
 * 設計: Plan 月ビュー mini design + M2 mini design（2026-06-03 CEO chat 承認）。
 *
 * 不変原則:
 *   - presentational のみ（props で受領。内部 fetch なし・現在時刻参照なし・内部 state なし）
 *   - M1 buildMonthGrid 出力（grid）+ anchors / dayIndicators を props で受ける
 *   - 既存 _helpers.ts の anchorsForDay / formatJpDate / WEEKDAY_LABELS を再利用
 *   - 視覚 token は CalendarTab week strip cell（cellClasses）を mirror（同じ世界観）
 *   - DB / API / VLM / network 不接触
 *
 * dot 配色（CEO 決定 A）:
 *   - 勤務・予定あり（timed anchor 存在）= sky-500（active tone、rest 系と分離）
 *   - 公休 H   = rose-400 / 希望休 HREQ = violet-300 / 休み BD = slate-300（既存色に整合）
 *
 * leading/trailing cell tap（CEO 決定 B）: onSelectDate(iso) のみ。月遷移は M3。
 */

import { useMemo } from "react";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { DayIndicatorViewModel } from "@/lib/plan/dayIndicatorView";

import type { MonthGrid } from "../tabs/_monthGrid";
import { anchorsForDay, formatJpDate, WEEKDAY_LABELS } from "../tabs/_helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dot / cell class helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 休み / 希望休 dot の色。CalendarTab の dayIndicatorDotClass を mirror。
 * （DRY follow-up: M3 で CalendarTab と共有 helper へ抽出可。M2 は非接触のため複製）
 */
function dayIndicatorDotClass(vm: DayIndicatorViewModel): string {
  if (vm.variant === "public_holiday") return "bg-rose-400";
  if (vm.variant === "requested_off") return "bg-violet-300";
  return "bg-slate-300"; // off / 既定
}

/**
 * cell の class。CalendarTab cellClasses を mirror（rounded-full / aspect-square /
 * 選択 gradient / today 強調 / 非当月 淡色）。優先: selected > today > !inCurrentMonth > default。
 */
function monthCellClasses(
  inCurrentMonth: boolean,
  isToday: boolean,
  isSelected: boolean
): string {
  const base =
    "w-full aspect-square min-h-[44px] flex items-center justify-center rounded-full transition";
  if (isSelected) {
    return (
      base +
      " bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow-sm"
    );
  }
  if (isToday) {
    return base + " text-indigo-700 font-bold hover:bg-indigo-50";
  }
  if (!inCurrentMonth) {
    return base + " text-slate-300 hover:bg-slate-50";
  }
  return base + " text-slate-700 hover:bg-slate-100";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MonthGridViewProps {
  /** M1 buildMonthGrid 出力（6×7 = 42 cell） */
  grid: MonthGrid;
  /** 予定 dot 判定用（全件。cell ごとに anchorsForDay で存在判定） */
  anchors: ExternalAnchor[];
  /** 休み / 希望休 dot（iso → ViewModel。既存 dayIndicatorsByDate 出力） */
  dayIndicatorByIso: ReadonlyMap<string, DayIndicatorViewModel>;
  /** 選択中の日（"YYYY-MM-DD"） */
  selectedIso: string;
  /** 今日（"YYYY-MM-DD"。現在時刻は props で受ける = pure） */
  todayIso: string;
  /** cell tap callback（leading/trailing 含め iso を渡すのみ） */
  onSelectDate: (iso: string) => void;
}

export function MonthGridView({
  grid,
  anchors,
  dayIndicatorByIso,
  selectedIso,
  todayIso,
  onSelectDate,
}: MonthGridViewProps) {
  // 予定 dot: iso → hasAnchor を grid / anchors 変化時のみ計算。
  // selectedIso / todayIso 変化では再計算しない（月送り以外の再 render を軽くする）。
  // 将来データ増大時はこの buildAnchoredIsoSet 部分を month-level index に差し替える seam。
  const anchoredIsoSet = useMemo(() => {
    const set = new Set<string>();
    for (const cell of grid.cells) {
      if (anchorsForDay(anchors, cell.date).length > 0) set.add(cell.iso);
    }
    return set;
  }, [grid, anchors]);

  return (
    <div data-testid="plan-month-grid">
      {/* ── Weekday labels (Sun-first、日 = 赤、土 = 青、日本標準) ── */}
      <div className="grid grid-cols-7 mb-2 px-2">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            data-testid={`plan-month-grid-weekday-${label}`}
            className={
              "text-center text-xs font-medium py-1 " +
              (i === 0
                ? "text-rose-500"
                : i === 6
                  ? "text-blue-500"
                  : "text-slate-500")
            }
          >
            {label}
          </div>
        ))}
      </div>

      {/* ── 6 週 × 7 列 grid ── */}
      <div
        role="grid"
        aria-label={`${grid.year}年${grid.month + 1}月のカレンダー`}
        className="px-2"
        data-testid="plan-month-grid-body"
      >
        {grid.weeks.map((week, wi) => (
          <div key={wi} role="row" className="grid grid-cols-7 gap-1 mb-1">
            {week.map((cell) => {
              const isSelected = cell.iso === selectedIso;
              const isToday = cell.iso === todayIso;
              const hasAnchor = anchoredIsoSet.has(cell.iso);
              const indicator = dayIndicatorByIso.get(cell.iso);
              return (
                <button
                  key={cell.iso}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${formatJpDate(cell.date)} を選択`}
                  data-testid={`plan-month-grid-day-${cell.iso}`}
                  data-in-current-month={cell.inCurrentMonth}
                  onClick={() => onSelectDate(cell.iso)}
                  className={monthCellClasses(
                    cell.inCurrentMonth,
                    isToday,
                    isSelected
                  )}
                >
                  <span className="flex flex-col items-center leading-none">
                    <span className="text-sm font-medium">
                      {cell.dayOfMonth}
                    </span>
                    {(hasAnchor || indicator) && (
                      <span className="mt-0.5 flex items-center gap-0.5">
                        {hasAnchor && (
                          <span
                            data-testid={`plan-month-grid-anchor-dot-${cell.iso}`}
                            className="h-1 w-1 rounded-full bg-sky-500"
                            aria-hidden="true"
                          />
                        )}
                        {indicator && (
                          <span
                            data-testid={`plan-month-grid-indicator-dot-${cell.iso}`}
                            className={`h-1 w-1 rounded-full ${dayIndicatorDotClass(indicator)}`}
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
