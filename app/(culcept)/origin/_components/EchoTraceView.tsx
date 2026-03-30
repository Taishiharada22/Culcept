"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import type { EchoTimelineResult, EchoTrajectory } from "@/lib/origin/v7/echoTimeline";
import type { ExplorationAxis, LifePeriod } from "@/lib/origin/v7/types";
import { getPeriodLabel } from "@/lib/origin/v7/periods";

type Props = {
  echoTimeline: EchoTimelineResult;
  onHighlightChapters?: (chapterIds: string[]) => void;
  onStartExploration?: (axis?: ExplorationAxis) => void;
};

const STATUS_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  persistent: { text: "text-amber-600", bg: "bg-amber-50/40", border: "border-amber-200/50" },
  lost: { text: "text-gray-400", bg: "bg-gray-50/30", border: "border-gray-200/40" },
  emergent: { text: "text-emerald-500", bg: "bg-emerald-50/30", border: "border-emerald-200/50" },
};

const STATUS_LABELS: Record<string, string> = {
  persistent: "持続",
  lost: "喪失",
  emergent: "新生",
};

const IMPACT_LABELS: Record<string, string> = {
  self: "自己",
  interpersonal: "対人",
  societal: "社会",
};

const PERIOD_ORDER: Record<string, number> = {
  early_childhood: 0, elementary: 1, middle_school: 2, high_school: 3,
  late_teens: 4, early_twenties: 5, mid_twenties: 6, thirties: 7,
  forties_plus: 8, special_period: 9,
};

const ALL_PERIODS: LifePeriod[] = [
  "early_childhood", "elementary", "middle_school", "high_school",
  "late_teens", "early_twenties", "mid_twenties", "thirties",
  "forties_plus",
];

export default function EchoTraceView({
  echoTimeline,
  onHighlightChapters,
  onStartExploration,
}: Props) {
  const [selectedEcho, setSelectedEcho] = useState<string | null>(null);

  const trajectories = echoTimeline.trajectories;

  // 使用中のperiodの範囲を計算
  const periodRange = useMemo(() => {
    let minIdx = 9;
    let maxIdx = 0;
    for (const t of trajectories) {
      for (const a of t.appearances) {
        const idx = PERIOD_ORDER[a.period] ?? 0;
        if (idx < minIdx) minIdx = idx;
        if (idx > maxIdx) maxIdx = idx;
      }
    }
    return { min: minIdx, max: maxIdx };
  }, [trajectories]);

  if (trajectories.length === 0) return null;

  const visiblePeriods = ALL_PERIODS.filter((p) => {
    const idx = PERIOD_ORDER[p] ?? 0;
    return idx >= periodRange.min && idx <= periodRange.max;
  });

  const selected = trajectories.find((t) => t.echo === selectedEcho);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-3"
    >
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
        <span className="text-sm">🌊</span>
        残響の河
      </h3>

      {/* River SVG */}
      <div className="relative overflow-x-auto rounded-xl border border-amber-100/40 bg-white/20 px-2 py-3">
        {/* Period labels */}
        <div className="mb-1 flex">
          {visiblePeriods.map((p) => (
            <div key={p} className="flex-1 text-center text-[8px] text-gray-400">
              {getPeriodLabel(p).slice(0, 3)}
            </div>
          ))}
        </div>

        {/* Echo streams */}
        <div className="space-y-1">
          {trajectories.slice(0, 8).map((t) => (
            <EchoStream
              key={t.echo}
              trajectory={t}
              visiblePeriods={visiblePeriods}
              isSelected={selectedEcho === t.echo}
              onSelect={() => {
                setSelectedEcho(selectedEcho === t.echo ? null : t.echo);
                if (t.sourceChapterIds.length > 0) {
                  onHighlightChapters?.(t.sourceChapterIds);
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-2 rounded-xl border border-amber-100/40 bg-white/40 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-700">
                {selected.echo}
              </span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[8px] font-medium ${
                  STATUS_COLORS[selected.status].text
                } ${STATUS_COLORS[selected.status].bg}`}
              >
                {STATUS_LABELS[selected.status]}
              </span>
              <span className="rounded-full bg-gray-100/50 px-1.5 py-0.5 text-[8px] text-gray-400">
                影響: {IMPACT_LABELS[selected.impactRadius]}
              </span>
            </div>

            {/* Appearances */}
            <div className="mt-2 space-y-1">
              {selected.appearances.map((a, i) => (
                <div
                  key={`${a.period}-${i}`}
                  className="flex items-center gap-2 text-[10px]"
                >
                  <span className="text-gray-400">{getPeriodLabel(a.period)}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-600">{a.context}</span>
                  <span className="text-[9px] text-gray-300">
                    ({a.sourceType === "chapter" ? "章" : a.sourceType === "activity" ? "活動" : "転機"})
                  </span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="mt-2 flex gap-2">
              {selected.status === "lost" && onStartExploration && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onStartExploration()}
                  className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-medium text-rose-500"
                >
                  なぜ消えた？
                </motion.button>
              )}
              {selected.sourceChapterIds.length > 0 && (
                <button
                  onClick={() => onHighlightChapters?.(selected.sourceChapterIds)}
                  className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-medium text-amber-600"
                >
                  源流の章を見る
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/* ━━━ EchoStream ━━━ */

function EchoStream({
  trajectory,
  visiblePeriods,
  isSelected,
  onSelect,
}: {
  trajectory: EchoTrajectory;
  visiblePeriods: LifePeriod[];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const colors = STATUS_COLORS[trajectory.status];
  const periodSet = new Set(trajectory.appearances.map((a) => a.period));

  return (
    <motion.button
      onClick={onSelect}
      whileTap={{ scale: 0.98 }}
      className={`flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-all ${
        isSelected ? `${colors.bg} ${colors.border} border` : "hover:bg-white/30"
      }`}
    >
      {/* Echo name */}
      <span className={`w-16 shrink-0 truncate text-[10px] font-medium ${colors.text}`}>
        {trajectory.echo}
      </span>

      {/* Stream visualization */}
      <div className="flex flex-1 items-center">
        {visiblePeriods.map((period) => {
          const isPresent = periodSet.has(period);
          return (
            <div key={period} className="flex flex-1 items-center justify-center">
              {isPresent ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={`h-2 w-2 rounded-full ${
                    trajectory.status === "persistent"
                      ? "bg-amber-400"
                      : trajectory.status === "emergent"
                        ? "bg-emerald-400"
                        : "bg-gray-300"
                  }`}
                />
              ) : (
                <div className="h-px w-full bg-gray-100/50" />
              )}
            </div>
          );
        })}
      </div>

      {/* Status badge */}
      <span className={`shrink-0 text-[8px] ${colors.text}`}>
        {STATUS_LABELS[trajectory.status]}
      </span>
    </motion.button>
  );
}
