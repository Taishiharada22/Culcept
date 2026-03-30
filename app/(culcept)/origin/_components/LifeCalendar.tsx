"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import type { LifeCalendarGrid } from "@/lib/origin/v7/lifeCalendarEngine";
import type { LifeCalendarCell, LifePeriod } from "@/lib/origin/v7/types";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Props
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type Props = {
  grid: LifeCalendarGrid | null;
  onCellClick: (year: number, month: number) => void;
  onSaveBirthDate?: (year: number, month: number) => void;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Period Metadata
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type PeriodMeta = {
  id: LifePeriod;
  label: string;
  emoji: string;
  ageRange: { min: number; max: number };
  accentColor: string;
};

const PERIOD_META: PeriodMeta[] = [
  { id: "early_childhood", label: "幼少期", emoji: "🧒", ageRange: { min: 0, max: 6 }, accentColor: "text-pink-400" },
  { id: "elementary", label: "小学生", emoji: "🎒", ageRange: { min: 7, max: 12 }, accentColor: "text-orange-400" },
  { id: "middle_school", label: "中学生", emoji: "📖", ageRange: { min: 13, max: 15 }, accentColor: "text-amber-500" },
  { id: "high_school", label: "高校生", emoji: "🏫", ageRange: { min: 16, max: 18 }, accentColor: "text-yellow-500" },
  { id: "late_teens", label: "10代後半", emoji: "🌱", ageRange: { min: 18, max: 20 }, accentColor: "text-lime-500" },
  { id: "early_twenties", label: "20代前半", emoji: "🔥", ageRange: { min: 21, max: 25 }, accentColor: "text-emerald-500" },
  { id: "mid_twenties", label: "20代後半", emoji: "🌊", ageRange: { min: 26, max: 29 }, accentColor: "text-teal-500" },
  { id: "thirties", label: "30代", emoji: "🏔️", ageRange: { min: 30, max: 39 }, accentColor: "text-sky-500" },
  { id: "forties_plus", label: "40代〜", emoji: "🌅", ageRange: { min: 40, max: 120 }, accentColor: "text-violet-500" },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Depth Styling
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function depthStyle(depth: number): string {
  switch (depth) {
    case -1:
      return "bg-transparent border border-dashed border-stone-200/60";
    case 0:
      return "bg-stone-100/40";
    case 1:
      return "bg-amber-100";
    case 2:
      return "bg-amber-200";
    case 3:
      return "bg-amber-300";
    case 4:
      return "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.4)]";
    default:
      return "bg-stone-100/40";
  }
}

const DEPTH_LEGEND: { depth: number; label: string; style: string }[] = [
  { depth: -1, label: "対象外", style: "bg-transparent border border-dashed border-stone-300" },
  { depth: 0, label: "未探索", style: "bg-stone-100/60" },
  { depth: 1, label: "💬 マイクロ回答", style: "bg-amber-100" },
  { depth: 2, label: "📝 記憶あり", style: "bg-amber-200" },
  { depth: 3, label: "💎 複合探索", style: "bg-amber-300" },
  { depth: 4, label: "✨ 深く探索済", style: "bg-amber-400 shadow-[0_0_4px_rgba(245,158,11,0.3)]" },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Cell Emoji Indicator
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function cellEmoji(cell: LifeCalendarCell): string | null {
  if (cell.explorationDepth <= 0) return null;
  if (cell.memoryGemIds.length > 0) return "💎";
  if (cell.chapterIds.length > 0) return "📝";
  if (cell.microQuestionIds.length > 0) return "💬";
  return null;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Helper: group year rows into periods
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type PeriodLane = {
  period: PeriodMeta;
  yearRows: { year: number; cells: LifeCalendarCell[]; yearIdx: number }[];
};

function buildPeriodLanes(
  grid: LifeCalendarGrid,
): PeriodLane[] {
  const lanes: PeriodLane[] = [];
  let currentPeriodIdx = 0;
  let currentLane: PeriodLane | null = null;

  for (let yearIdx = 0; yearIdx < grid.cells.length; yearIdx++) {
    const year = grid.birthYear + yearIdx;
    const age = year - grid.birthYear;
    const row = grid.cells[yearIdx];

    // Find matching period
    let matchedPeriod: PeriodMeta | undefined;
    for (let i = currentPeriodIdx; i < PERIOD_META.length; i++) {
      const p = PERIOD_META[i];
      if (age >= p.ageRange.min && age <= p.ageRange.max) {
        matchedPeriod = p;
        currentPeriodIdx = i;
        break;
      }
    }
    if (!matchedPeriod) {
      // Ages beyond defined periods go to last period
      matchedPeriod = PERIOD_META[PERIOD_META.length - 1];
    }

    if (!currentLane || currentLane.period.id !== matchedPeriod.id) {
      currentLane = { period: matchedPeriod, yearRows: [] };
      lanes.push(currentLane);
    }
    currentLane.yearRows.push({ year, cells: row, yearIdx });
  }

  return lanes;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Birth Date Input Form
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function BirthDateForm({
  onSave,
}: {
  onSave: (year: number, month: number) => void;
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(1995);
  const [month, setMonth] = useState<number>(1);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (year >= 1920 && year <= 2020 && month >= 1 && month <= 12) {
        onSave(year, month);
      }
    },
    [year, month, onSave],
  );

  const yearOptions = useMemo(() => {
    const opts: number[] = [];
    for (let y = currentYear - 5; y >= 1940; y--) opts.push(y);
    return opts;
  }, [currentYear]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="mx-auto max-w-md"
    >
      <div className="rounded-3xl border border-amber-200/50 bg-white/70 p-8 shadow-lg shadow-amber-100/30 backdrop-blur-xl">
        {/* Header illustration */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200/60">
          <span className="text-3xl">📅</span>
        </div>

        <h3 className="mb-2 text-center text-lg font-bold text-stone-800">
          人生カレンダーを作る
        </h3>
        <p className="mb-6 text-center text-sm leading-relaxed text-stone-500">
          あなたの人生を月単位で可視化し、
          <br />
          記憶のかけらを灯していきます
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Year/Month in a row */}
          <div className="flex gap-3">
            {/* Year */}
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-semibold tracking-wide text-stone-500 uppercase">
                生まれた年
              </label>
              <div className="relative">
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full appearance-none rounded-xl border border-amber-200/60 bg-white/90 px-4 py-3.5 text-center text-lg font-medium text-stone-800 outline-none transition-all focus:border-amber-400 focus:ring-2 focus:ring-amber-200/40"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}年
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-stone-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Month */}
            <div className="w-28">
              <label className="mb-1.5 block text-xs font-semibold tracking-wide text-stone-500 uppercase">
                月
              </label>
              <div className="relative">
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="w-full appearance-none rounded-xl border border-amber-200/60 bg-white/90 px-4 py-3.5 text-center text-lg font-medium text-stone-800 outline-none transition-all focus:border-amber-400 focus:ring-2 focus:ring-amber-200/40"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m}月
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-stone-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Preview text */}
          <div className="rounded-xl bg-amber-50/60 px-4 py-3 text-center">
            <p className="text-sm text-stone-500">
              {currentYear - year}歳
              <span className="mx-2 text-stone-300">|</span>
              約 {((currentYear - year) * 12).toLocaleString()} ヶ月の人生
            </p>
          </div>

          {/* Submit */}
          <motion.button
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-3.5 font-bold text-white shadow-md shadow-amber-200/40 transition-shadow hover:shadow-lg hover:shadow-amber-300/40"
          >
            カレンダーを生成する
          </motion.button>
        </form>
      </div>
    </motion.div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Progress Header
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function ProgressHeader({
  grid,
}: {
  grid: LifeCalendarGrid;
}) {
  const { exploredDays, totalMonths, exploredMonths } = grid;
  const totalDaysApprox = totalMonths * 30;
  const pct = totalMonths > 0 ? Math.round((exploredMonths / totalMonths) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="rounded-2xl border border-amber-100/50 bg-white/60 p-5 backdrop-blur-sm"
    >
      {/* Motivational copy */}
      <p className="mb-3 text-center text-sm leading-relaxed text-stone-600">
        あなたの{" "}
        <span className="font-bold text-amber-600">
          {totalDaysApprox.toLocaleString()}
        </span>{" "}
        日のうち、
        <span className="font-bold text-amber-600">
          {exploredDays.toLocaleString()}
        </span>{" "}
        日分の記憶が灯っています
      </p>

      {/* Progress bar */}
      <div className="relative mx-auto mb-2 h-3 max-w-xs overflow-hidden rounded-full bg-stone-100/80">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, 2)}%` }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
        {/* Shimmer effect */}
        <motion.div
          className="absolute inset-y-0 left-0 w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
          }}
          animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: 1.5 }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-center gap-4 text-xs text-stone-500">
        <span>
          探索率{" "}
          <span className="font-bold text-amber-600">{pct}%</span>
        </span>
        <span className="text-stone-300">|</span>
        <span>
          探索月{" "}
          <span className="font-semibold text-stone-700">
            {exploredMonths}
          </span>{" "}
          / {totalMonths}
        </span>
      </div>
    </motion.div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Tooltip
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type TooltipState = {
  cell: LifeCalendarCell;
  x: number;
  y: number;
} | null;

function CellTooltip({ tooltip }: { tooltip: TooltipState }) {
  return (
    <AnimatePresence>
      {tooltip && (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-none fixed z-50 rounded-lg border border-amber-200/50 bg-white/95 px-3 py-2 shadow-lg shadow-amber-100/20 backdrop-blur-md"
          style={{ left: tooltip.x, top: tooltip.y - 50 }}
        >
          <p className="text-xs font-semibold text-stone-700">
            {tooltip.cell.year}年{tooltip.cell.month}月
          </p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-stone-500">
            {tooltip.cell.memoryGemIds.length > 0 && (
              <span>💎 {tooltip.cell.memoryGemIds.length}</span>
            )}
            {tooltip.cell.microQuestionIds.length > 0 && (
              <span>💬 {tooltip.cell.microQuestionIds.length}</span>
            )}
            {tooltip.cell.chapterIds.length > 0 && (
              <span>📝 {tooltip.cell.chapterIds.length}</span>
            )}
            {tooltip.cell.explorationDepth === 0 && (
              <span className="text-stone-400">未探索</span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Swim Lane Component
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function SwimLane({
  lane,
  laneIdx,
  selectedCell,
  onCellClick,
  onCellHover,
  onCellLeave,
}: {
  lane: PeriodLane;
  laneIdx: number;
  selectedCell: { year: number; month: number } | null;
  onCellClick: (year: number, month: number) => void;
  onCellHover: (cell: LifeCalendarCell, e: React.MouseEvent) => void;
  onCellLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-0"
      initial={{ opacity: 0, x: -16 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.4, delay: laneIdx * 0.08 }}
    >
      {/* Period label sidebar */}
      <div className="mb-1 flex shrink-0 items-center gap-1.5 sm:mb-0 sm:w-24 sm:flex-col sm:items-end sm:justify-start sm:gap-0.5 sm:pr-2 sm:pt-0.5 md:w-28">
        <span className="text-base sm:text-lg">{lane.period.emoji}</span>
        <span className={`text-[11px] font-bold sm:text-xs ${lane.period.accentColor}`}>
          {lane.period.label}
        </span>
        <span className="text-[9px] text-stone-400 sm:text-[10px]">
          {lane.period.ageRange.min}〜{lane.period.ageRange.max > 100 ? "" : lane.period.ageRange.max}歳
        </span>
      </div>

      {/* Year rows in this lane */}
      <div className="flex-1 space-y-px overflow-x-auto">
        {lane.yearRows.map(({ year, cells, yearIdx }) => {
          const showYearLabel = yearIdx === 0 || year % 5 === 0;
          return (
            <div key={year} className="flex items-center">
              {/* Year label */}
              <div className="w-8 shrink-0 pr-1 text-right text-[9px] font-medium tabular-nums text-stone-400 sm:w-10 sm:text-[10px]">
                {showYearLabel ? year : ""}
              </div>

              {/* 12 month cells */}
              <div className="flex gap-px">
                {cells.map((cell) => {
                  const isDashed = cell.explorationDepth === -1;
                  const isSelected =
                    selectedCell?.year === cell.year &&
                    selectedCell?.month === cell.month;
                  const emoji = cellEmoji(cell);

                  return (
                    <motion.button
                      key={`${cell.year}-${cell.month}`}
                      type="button"
                      className={`relative flex h-[18px] w-[18px] items-center justify-center rounded-[3px] text-[7px] leading-none transition-all sm:h-5 sm:w-5 sm:rounded-sm sm:text-[8px] ${
                        isDashed
                          ? "pointer-events-none cursor-default bg-transparent border border-dashed border-stone-200/60"
                          : `${depthStyle(cell.explorationDepth)} cursor-pointer hover:ring-2 hover:ring-amber-400/50 active:scale-90`
                      } ${
                        isSelected && !isDashed
                          ? "ring-2 ring-amber-500 ring-offset-1"
                          : ""
                      }`}
                      onClick={() => {
                        if (!isDashed) onCellClick(cell.year, cell.month);
                      }}
                      onMouseEnter={(e) => {
                        if (!isDashed) onCellHover(cell, e);
                      }}
                      onMouseLeave={onCellLeave}
                      whileHover={isDashed ? {} : { scale: 1.35, zIndex: 10 }}
                      whileTap={isDashed ? {} : { scale: 0.85 }}
                    >
                      {emoji && !isDashed && (
                        <span className="pointer-events-none select-none">
                          {emoji}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Dive CTA (floating)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function DiveCTA({
  cell,
  onDive,
}: {
  cell: { year: number; month: number } | null;
  onDive: (year: number, month: number) => void;
}) {
  return (
    <AnimatePresence>
      {cell && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
        >
          <motion.button
            type="button"
            className="flex items-center gap-2 rounded-full border border-amber-200/60 bg-white/90 px-5 py-3 shadow-xl shadow-amber-200/30 backdrop-blur-lg transition-colors hover:bg-amber-50/90"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onDive(cell.year, cell.month)}
          >
            <span className="text-lg">🔮</span>
            <span className="text-sm font-bold text-stone-700">
              {cell.year}年{cell.month}月の記憶ダイブを始める
            </span>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Main Component
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default function LifeCalendar({ grid, onCellClick, onSaveBirthDate }: Props) {
  const [selectedCell, setSelectedCell] = useState<{
    year: number;
    month: number;
  } | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  // Build swim lanes from grid
  const lanes = useMemo(() => {
    if (!grid) return [];
    return buildPeriodLanes(grid);
  }, [grid]);

  const handleCellClick = useCallback(
    (year: number, month: number) => {
      setSelectedCell((prev) =>
        prev?.year === year && prev?.month === month ? null : { year, month },
      );
      onCellClick(year, month);
    },
    [onCellClick],
  );

  const handleCellHover = useCallback(
    (cell: LifeCalendarCell, e: React.MouseEvent) => {
      setTooltip({ cell, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleCellLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  /* ── No grid: birth date form ── */
  if (!grid) {
    return onSaveBirthDate ? (
      <BirthDateForm onSave={onSaveBirthDate} />
    ) : null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-5"
    >
      {/* ── Progress Header ── */}
      <ProgressHeader grid={grid} />

      {/* ── Swim Lane Grid ── */}
      <div className="overflow-hidden rounded-2xl border border-amber-100/50 bg-white/50 shadow-inner shadow-amber-50/40 backdrop-blur-sm">
        {/* Month header */}
        <div className="flex items-center border-b border-amber-100/30 bg-white/30 px-2 py-1.5 sm:px-0">
          <div className="hidden w-24 shrink-0 sm:block md:w-28" />
          <div className="w-8 shrink-0 sm:w-10" />
          <div className="flex gap-px">
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className="flex h-[18px] w-[18px] items-center justify-center text-[8px] font-medium text-stone-400 sm:h-5 sm:w-5 sm:text-[9px]"
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Period swim lanes */}
        <div className="space-y-0 divide-y divide-amber-100/30 p-2 sm:p-3">
          {lanes.map((lane, idx) => (
            <div key={lane.period.id} className={idx > 0 ? "pt-2" : ""}>
              <SwimLane
                lane={lane}
                laneIdx={idx}
                selectedCell={selectedCell}
                onCellClick={handleCellClick}
                onCellHover={handleCellHover}
                onCellLeave={handleCellLeave}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-2 pt-1">
        {DEPTH_LEGEND.map(({ depth, label, style }) => (
          <div key={depth} className="flex items-center gap-1.5">
            <div
              className={`h-3 w-3 rounded-sm ${style}`}
            />
            <span className="text-[10px] text-stone-500">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Floating Dive CTA ── */}
      <DiveCTA cell={selectedCell} onDive={handleCellClick} />

      {/* ── Tooltip ── */}
      <CellTooltip tooltip={tooltip} />
    </motion.div>
  );
}
