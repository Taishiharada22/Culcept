"use client";

/**
 * CalendarTab — Compact Week Strip + Selected Day Agenda + FAB
 *   (W1-5 → W1-X3 → Phase 2-A で full refactor)
 *
 * 設計書:
 *   - docs/alter-plan-phase2-a-calendar-month-view-mini-design.md (Phase 2-A、本 refactor)
 *   - docs/alter-plan-w15-ui-mini-design.md §2 (週ビュー初版)
 *   - docs/alter-plan-w1x3-cell-add-mini-design.md (旧 cell + 導線、Phase 2-A で削除)
 *
 * 表示 (mock 整合):
 *   - 月 header: ◀ "X月 YYYY" ▶ (tap で月送り、selectedDate 同日維持 + 月末 clamp)
 *   - Weekday labels: 日 月 火 水 木 金 土 (Sun-first、日本標準)
 *   - Week strip (1 行 7 cells): 当週の日付、選択日 = 紫円、今日 = 太字
 *   - Selected day section: 選択日 anchor list、空なら「+ この日に予定を追加」 link
 *   - FAB: 右下 固定、紫 gradient、選択日 prefill で AddAnchorModal 起動
 *
 * 不変原則:
 *   - props signature 不変 (anchors / now / onAddRequest / onAnchorClick)
 *   - anchorsForDay 既存 helper 再利用 (recurring / exception_dates / validity 全継承)
 *   - PlanClient / Modal / API は完全不変
 *
 * 範囲外 (Phase 2-A+ / 2-B / 2-C / Phase 3 預け):
 *   - Full month grid (6×7) ビュー
 *   - 月内 swipe gesture (HomeSwipeContainer 衝突回避)
 *   - keyboard ← → nav (同上)
 *   - 空き日 → ALTER 提案 flow
 *   - anchor density indicator
 */

import { useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";

import { GlassBadge } from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

import type { AddRequest } from "../PlanClient";
import {
  addMonths,
  anchorsForDay,
  buildWeekStrip,
  clampDateToMonth,
  formatJpDate,
  formatJpYearMonth,
  formatTime,
  getMonthStart,
  isoDate,
  utcMidnight,
  type WeekStripCell,
} from "./_helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Weekday labels Sun-first (日本ロケール標準、CEO mock 整合) */
const WEEKDAY_LABELS_SUN_FIRST = ["日", "月", "火", "水", "木", "金", "土"] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CalendarTab({
  anchors,
  now,
  onAddRequest,
  onAnchorClick,
}: {
  anchors: ExternalAnchor[];
  /** test 用 inject、現在時刻 (default: new Date()) */
  now?: Date;
  /** Modal 起動 callback (FAB / SelectedDay link で共通) */
  onAddRequest?: (req: AddRequest) => void;
  /** anchor row click で AnchorDetailModal 起動 (W1-X5 既存) */
  onAnchorClick?: (anchor: ExternalAnchor) => void;
}) {
  const baseNow = now ?? new Date();
  const todayDate = utcMidnight(baseNow);
  const todayIso = isoDate(todayDate);
  const todayMonthStart = getMonthStart(baseNow);

  // ── state ──
  const [currentMonth, setCurrentMonth] = useState<Date>(() => todayMonthStart);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  /** 月送り animation の方向 (-1 = 前月、+1 = 翌月、0 = 初回) */
  const [slideDirection, setSlideDirection] = useState<-1 | 0 | 1>(0);

  const reducedMotion = useReducedMotion();

  // ── derived ──
  const selectedDateObj = new Date(selectedDate + "T00:00:00.000Z");
  const weekStrip = buildWeekStrip(selectedDateObj, currentMonth);
  const selectedDayAnchors = anchorsForDay(anchors, selectedDateObj);

  // ── handlers ──

  /**
   * 月送り (GPT 補正 3 反映):
   *   - 同日付存在 → 維持 (例: 1/15 → 2/15)
   *   - 存在しなければ月末 clamp (例: 1/31 → 2/28 or 2/29 閏年)
   */
  const handleMonthChange = (delta: number) => {
    const newMonth = addMonths(currentMonth, delta);
    const dayOfMonth = selectedDateObj.getUTCDate();
    const clampedDate = clampDateToMonth(
      newMonth.getUTCFullYear(),
      newMonth.getUTCMonth(),
      dayOfMonth
    );
    setSlideDirection(delta > 0 ? 1 : -1);
    setCurrentMonth(newMonth);
    setSelectedDate(isoDate(clampedDate));
  };

  const handleSelectDate = (iso: string) => setSelectedDate(iso);

  const handleAddForSelected = () => {
    onAddRequest?.({
      initial: { kind: "one_off", date: selectedDate },
      subtitle: `カレンダー / ${formatJpDate(selectedDateObj)} から`,
    });
  };

  /**
   * 「今日へ」 button (C3、Beyond 採用):
   *   - selectedDate ≠ today OR currentMonth ≠ today's month の時のみ表示
   *   - tap で currentMonth = 今月、selectedDate = 今日 にジャンプ
   *   - iOS / Google Calendar 標準機能、世界トップアプリ整合
   */
  const isCurrentMonthThisMonth =
    currentMonth.getUTCFullYear() === todayMonthStart.getUTCFullYear() &&
    currentMonth.getUTCMonth() === todayMonthStart.getUTCMonth();
  const showTodayButton =
    selectedDate !== todayIso || !isCurrentMonthThisMonth;

  const handleGoToday = () => {
    // 月送り animation 抑制 (jump 動作のため slideDirection = 0)
    setSlideDirection(0);
    setCurrentMonth(todayMonthStart);
    setSelectedDate(todayIso);
  };

  // ── animation variants (framer-motion、月送り 200ms slide) ──
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? "100%" : dir < 0 ? "-100%" : 0,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({
      x: dir > 0 ? "-100%" : dir < 0 ? "100%" : 0,
      opacity: 0,
    }),
  };
  const slideTransition = reducedMotion
    ? { duration: 0 }
    : { type: "tween" as const, duration: 0.2, ease: "easeOut" as const };

  return (
    <div data-testid="plan-calendar-tab" className="relative pb-24">
      {/* ── Month header ── */}
      <header className="flex items-center justify-between px-2 mb-3">
        <button
          type="button"
          onClick={() => handleMonthChange(-1)}
          aria-label="前月"
          data-testid="plan-calendar-prev-month"
          className="w-10 h-10 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h2
          className="text-xl font-semibold text-slate-900"
          data-testid="plan-calendar-month-label"
        >
          {formatJpYearMonth(currentMonth)}
        </h2>
        <button
          type="button"
          onClick={() => handleMonthChange(1)}
          aria-label="翌月"
          data-testid="plan-calendar-next-month"
          className="w-10 h-10 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 18l6-6-6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      {/* ── Weekday labels (Sun-first、日 = 赤、土 = 青、日本標準) ── */}
      <div className="grid grid-cols-7 mb-2 px-2">
        {WEEKDAY_LABELS_SUN_FIRST.map((label, i) => (
          <div
            key={label}
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

      {/* ── Week strip + Selected day (月送り animation で同時 slide、C3 polish) ── */}
      <div className="overflow-hidden relative">
        <AnimatePresence mode="wait" custom={slideDirection} initial={false}>
          <motion.div
            key={`${currentMonth.getUTCFullYear()}-${currentMonth.getUTCMonth()}`}
            custom={slideDirection}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
          >
            {/* Week strip (1 行 × 7 col) */}
            <div
              role="grid"
              aria-label={`${formatJpYearMonth(currentMonth)} の週`}
              className="grid grid-cols-7 gap-1 px-2 mb-6"
              data-testid="plan-calendar-week-strip"
            >
              {weekStrip.map((cell) => {
                const isSelected = cell.iso === selectedDate;
                const isToday = cell.iso === todayIso;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={`${formatJpDate(cell.date)} を選択`}
                    onClick={() => handleSelectDate(cell.iso)}
                    data-testid={`plan-calendar-day-${cell.iso}`}
                    className={cellClasses(cell, isToday, isSelected)}
                  >
                    <span className="text-sm font-medium">{cell.dayOfMonth}</span>
                  </button>
                );
              })}
            </div>

            {/* Selected day agenda section (slide animation 内、月送りで一緒に動く) */}
            <section data-testid="plan-calendar-selected-day" className="px-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-slate-800">
                  {formatJpDate(selectedDateObj)}
                </h3>
                {showTodayButton && (
                  <button
                    type="button"
                    onClick={handleGoToday}
                    aria-label="今日へ戻る"
                    data-testid="plan-calendar-go-today"
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    今日
                  </button>
                )}
              </div>

        {selectedDayAnchors.length === 0 ? (
          <div
            className="rounded-2xl bg-slate-50 px-4 py-6 text-center"
            data-testid="plan-calendar-empty-day"
          >
            <p className="text-sm text-slate-500 mb-3">予定なし</p>
            {onAddRequest && (
              <button
                type="button"
                onClick={handleAddForSelected}
                className="text-sm text-indigo-600 hover:underline"
                data-testid="plan-calendar-add-for-selected"
              >
                + この日に予定を追加
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {selectedDayAnchors.map((anchor) => {
              const handleAnchorClick = (
                e:
                  | React.MouseEvent<HTMLLIElement>
                  | React.KeyboardEvent<HTMLLIElement>
              ) => {
                if (!onAnchorClick) return;
                e.stopPropagation();
                onAnchorClick(anchor);
              };
              const clickable = !!onAnchorClick;
              return (
                <li
                  key={anchor.id}
                  {...(clickable
                    ? {
                        role: "button" as const,
                        tabIndex: 0,
                        "aria-label": `${anchor.title} の詳細を見る`,
                        onClick: handleAnchorClick,
                        onKeyDown: (e: React.KeyboardEvent<HTMLLIElement>) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleAnchorClick(e);
                          }
                        },
                      }
                    : {})}
                  data-testid={`plan-calendar-anchor-${anchor.id}`}
                  className={
                    "rounded-2xl border border-slate-200 bg-white p-3 " +
                    (clickable
                      ? "cursor-pointer transition hover:border-indigo-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      : "")
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-indigo-700">
                      {formatTime(anchor.startTime)}
                    </span>
                    {anchor.rigidity === "hard" && (
                      <GlassBadge variant="default" size="sm">
                        固定
                      </GlassBadge>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {anchor.title}
                  </p>
                  {anchor.locationText && (
                    <p className="text-xs text-slate-500">
                      {anchor.locationText}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
            </section>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── FAB (右下 fixed、紫 gradient、選択日 prefill) ── */}
      {/* CEO mock 整合、PR #214 containing block で pane 内に閉じ込まる */}
      {/* HomePaneIndicator (z-30、bottom-0) と重ねないよう bottom-20 配置 */}
      {onAddRequest && (
        <button
          type="button"
          onClick={handleAddForSelected}
          aria-label={`${formatJpDate(selectedDateObj)} に予定を追加`}
          data-testid="plan-calendar-fab"
          className="
            fixed bottom-20 right-6 z-30
            w-14 h-14 rounded-full
            bg-gradient-to-br from-indigo-500 to-purple-500
            text-white text-3xl font-light leading-none
            shadow-lg hover:shadow-xl active:scale-95
            transition-all
            flex items-center justify-center
          "
          style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          +
        </button>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Week strip cell の visual classes (mock 整合):
 *   - selected: 紫 gradient fill、円形 (mock 紫円)
 *   - today + not selected: indigo bold (selected と区別)
 *   - inCurrentMonth=false: 薄色 (text-slate-300)
 *   - 通常: text-slate-700
 *
 * a11y: hit area ≥ 44×44 (min-h-[44px])
 */
function cellClasses(
  cell: WeekStripCell,
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
  if (!cell.inCurrentMonth) {
    return base + " text-slate-300 hover:bg-slate-50";
  }
  return base + " text-slate-700 hover:bg-slate-100";
}
