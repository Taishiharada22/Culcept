"use client";

/**
 * MonthGridView — Full month grid (6×7 = 42 cells) presentational component
 *   (Plan 月ビュー Phase 2-A+ M2 → M3-b polish)
 *
 * 取り込んだ月を俯瞰し、**各日の勤務/休みコードを読める**確認面。
 * M3-b polish（CEO 2026-06-04）: dot 中心 → 原稿コード chip 中心へ。
 *
 * 不変原則:
 *   - presentational のみ（props で受領。内部 fetch / 現在時刻参照 / 内部 state なし）
 *   - **shift dictionary に依存しない**汎用カレンダー部品。勤務コードの逆引きは
 *     getAnchorChip resolver を props で注入して受ける（辞書と疎結合）。
 *   - 視覚 token は CalendarTab / glassmorphism と整合
 *   - DB / API / VLM / network 不接触
 *
 * cell 表示（A+C）:
 *   - 日付数字 + 種別コード chip（E/N/L/G/E-18 = 勤務 / H/BD/HREQ = 休み）+ 薄い背景 tint
 *   - 勤務 = sky / 公休 H = rose / 希望休 HREQ = violet / 休み BD = slate / 既定 = slate
 *   - selected = **ring（全面 gradient 塗りにしない＝コードが消えない）** / today = thin border
 */

import { useMemo } from "react";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { DayIndicatorViewModel } from "@/lib/plan/dayIndicatorView";
import type { MonthGridChip, MonthGridChipTone } from "@/lib/plan/monthGridChip";

import type { MonthGrid } from "../tabs/_monthGrid";
import { anchorsForDay, formatJpDate, WEEKDAY_LABELS } from "../tabs/_helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// chip 導出（辞書非依存。勤務の逆引きは props resolver）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 休み indicator → chip。原稿コード（rawCode）優先、無ければ variant 既定（公/希/休）。 */
function offChip(vm: DayIndicatorViewModel): MonthGridChip {
  const tone: MonthGridChipTone =
    vm.variant === "public_holiday"
      ? "public_holiday"
      : vm.variant === "requested_off"
        ? "requested_off"
        : "off";
  const fallback =
    vm.variant === "public_holiday" ? "公" : vm.variant === "requested_off" ? "希" : "休";
  const label = vm.rawCode && vm.rawCode.trim() !== "" ? vm.rawCode.trim() : fallback;
  return { label, tone };
}

/** resolver 不一致 anchor の汎用 fallback（辞書非依存。無理にコード化しない）。 */
function fallbackAnchorChip(anchor: ExternalAnchor): MonthGridChip {
  const t = anchor.title.trim();
  const label = t.length === 0 ? "予定" : t.length <= 4 ? t : t.slice(0, 4);
  return { label, tone: "default" };
}

function chipToneClasses(tone: MonthGridChipTone): string {
  switch (tone) {
    case "work":
      return "bg-sky-100 text-sky-700";
    case "public_holiday":
      return "bg-rose-100 text-rose-600";
    case "requested_off":
      return "bg-violet-100 text-violet-600";
    case "off":
      return "bg-slate-100 text-slate-500";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

/** cell 背景 tint（C 補助。かなり薄く・うるさくしない）。 */
function cellTintClasses(tone: MonthGridChipTone | null): string {
  switch (tone) {
    case "work":
      return "bg-sky-50";
    case "public_holiday":
      return "bg-rose-50";
    case "requested_off":
      return "bg-violet-50";
    case "off":
      return "bg-slate-50";
    default:
      return "";
  }
}

/** cell 全体の class。selected = ring（全面塗りにしない）/ today = thin border。 */
function cellClasses(
  inCurrentMonth: boolean,
  isToday: boolean,
  isSelected: boolean,
  primaryTone: MonthGridChipTone | null
): string {
  const base =
    "w-full min-h-[50px] flex flex-col items-center justify-start gap-0.5 rounded-lg py-1 transition border";
  const tint = inCurrentMonth ? cellTintClasses(primaryTone) : "";
  const ring = isSelected
    ? " ring-2 ring-indigo-500 border-indigo-300"
    : isToday
      ? " border-indigo-300"
      : " border-transparent";
  const dim = inCurrentMonth ? "" : " opacity-50";
  return `${base} ${tint}${ring}${dim} hover:bg-slate-50`;
}

function numberClasses(
  inCurrentMonth: boolean,
  isToday: boolean
): string {
  if (!inCurrentMonth) return "text-xs leading-none text-slate-300";
  if (isToday) return "text-xs leading-none font-bold text-indigo-700";
  return "text-xs leading-none font-medium text-slate-700";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MonthGridViewProps {
  /** M1 buildMonthGrid 出力（6×7 = 42 cell） */
  grid: MonthGrid;
  /** 勤務 anchor（全件。cell ごとに anchorsForDay で該当日抽出） */
  anchors: ExternalAnchor[];
  /** 休み / 希望休（iso → ViewModel。rawCode を含む） */
  dayIndicatorByIso: ReadonlyMap<string, DayIndicatorViewModel>;
  /** 選択中の日（"YYYY-MM-DD"） */
  selectedIso: string;
  /** 今日（"YYYY-MM-DD"。現在時刻は props で受ける = pure） */
  todayIso: string;
  /** cell tap callback（leading/trailing 含め iso を渡すのみ） */
  onSelectDate: (iso: string) => void;
  /**
   * 勤務 anchor → 原稿コード chip の resolver（辞書を使う側が注入）。
   * 未指定 or null 返却なら短縮 title / 予定 に fallback。MonthGridView は辞書非依存。
   */
  getAnchorChip?: (anchor: ExternalAnchor) => MonthGridChip | null;
  /** B-1: シフト取込（shift_image）由来 source の id 集合。cell 単位の「取込」marker 用。未指定なら marker なし。 */
  importedShiftSourceIds?: ReadonlySet<string>;
}

export function MonthGridView({
  grid,
  anchors,
  dayIndicatorByIso,
  selectedIso,
  todayIso,
  onSelectDate,
  getAnchorChip,
  importedShiftSourceIds,
}: MonthGridViewProps) {
  // iso → cell chips。grid / anchors / indicators / resolver 変化時のみ計算
  // （selectedIso / todayIso 変化では再計算しない）。将来は month-level index 化の seam。
  const chipsByIso = useMemo(() => {
    const map = new Map<string, MonthGridChip[]>();
    for (const cell of grid.cells) {
      const chips: MonthGridChip[] = [];
      const ind = dayIndicatorByIso.get(cell.iso);
      if (ind) chips.push(offChip(ind));
      for (const a of anchorsForDay(anchors, cell.date)) {
        chips.push(getAnchorChip?.(a) ?? fallbackAnchorChip(a));
      }
      if (chips.length > 0) map.set(cell.iso, chips);
    }
    return map;
  }, [grid, anchors, dayIndicatorByIso, getAnchorChip]);

  // B-1: cell 単位の「シフト取込（shift_image）由来あり」判定。
  //   per-chip ではなく per-cell（過密回避）。anchor は anchorsForDay 経由（recurring/validity 継承）。
  const importedIsoSet = useMemo(() => {
    const set = new Set<string>();
    const hasImportedSources =
      importedShiftSourceIds != null && importedShiftSourceIds.size > 0;
    for (const cell of grid.cells) {
      if (dayIndicatorByIso.get(cell.iso)?.sourceType === "shift_image") {
        set.add(cell.iso);
        continue;
      }
      if (
        hasImportedSources &&
        anchorsForDay(anchors, cell.date).some((a) =>
          importedShiftSourceIds!.has(a.sourceId)
        )
      ) {
        set.add(cell.iso);
      }
    }
    return set;
  }, [grid, anchors, dayIndicatorByIso, importedShiftSourceIds]);

  return (
    <div data-testid="plan-month-grid">
      {/* ── Weekday labels (Sun-first、日 = 赤、土 = 青) ── */}
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
              const chips = chipsByIso.get(cell.iso) ?? [];
              const primaryTone = chips.length > 0 ? chips[0].tone : null;
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
                  className={cellClasses(
                    cell.inCurrentMonth,
                    isToday,
                    isSelected,
                    primaryTone
                  )}
                >
                  <span className={numberClasses(cell.inCurrentMonth, isToday)}>
                    {cell.dayOfMonth}
                  </span>
                  {chips.map((chip, ci) => (
                    <span
                      key={ci}
                      data-testid={`plan-month-grid-chip-${cell.iso}`}
                      data-tone={chip.tone}
                      className={`px-1 py-px rounded text-[10px] leading-tight font-semibold ${chipToneClasses(chip.tone)}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                  {/* B-1: cell 単位の控えめな「取込」由来表示（box なし・muted・per-cell） */}
                  {importedIsoSet.has(cell.iso) && (
                    <span
                      data-testid={`plan-month-grid-imported-${cell.iso}`}
                      data-imported-source="shift_image"
                      className="text-[8px] leading-none font-medium text-slate-400"
                      title="シフト取込"
                      aria-label="シフト取込"
                    >
                      取込
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
