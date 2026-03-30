"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface ContradictionTheaterProps {
  contradictions: Array<{
    axisId: string;
    axisLabel: string;
    axisLabelLeft: string;
    axisLabelRight: string;
    divergenceType: string;
    magnitude: number;
    scores: { selfPortrait?: number; footprint?: number; shadowPlay?: number };
    meaning: string;
    insight: string;
    explorationPrompt: string;
  }>;
  summary: string;
  primaryTheme: string;
  totalContradictions: number;
  alignedAxes: number;
}

const MEANING_MAP: Record<string, { icon: string; label: string }> = {
  ideal_gap: { icon: "\uD83C\uDFAD", label: "理想と現実の距離" },
  protective_pattern: { icon: "\uD83D\uDEE1\uFE0F", label: "守りのパターン" },
  unconscious_value: { icon: "\uD83D\uDC41\uFE0F", label: "無自覚な価値基準" },
  contextual_self: { icon: "\uD83C\uDF0A", label: "状況で変わる自分" },
  growth_edge: { icon: "\uD83C\uDF31", label: "成長の最前線" },
  adaptation_mask: { icon: "\uD83C\uDFAA", label: "適応のマスク" },
};

const MIRRORS: Array<{
  key: keyof ContradictionTheaterProps["contradictions"][number]["scores"];
  icon: string;
  label: string;
}> = [
  { key: "selfPortrait", icon: "\uD83E\uDE9E", label: "自画像" },
  { key: "footprint", icon: "\uD83D\uDC63", label: "足跡" },
  { key: "shadowPlay", icon: "\uD83C\uDFAD", label: "影絵" },
];

function ScoreBar({ value }: { value: number | undefined }) {
  if (value === undefined) {
    return (
      <div className="flex h-24 w-full items-center justify-center">
        <span className="text-[10px] text-slate-300">N/A</span>
      </div>
    );
  }

  // Map -1..+1 to 0..100 percentage for the fill
  const pct = ((value + 1) / 2) * 100;
  const color =
    value > 0.3
      ? "bg-indigo-400"
      : value < -0.3
        ? "bg-rose-400"
        : "bg-slate-300";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-24 w-3 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          className={`absolute bottom-0 w-full rounded-full ${color}`}
          initial={{ height: 0 }}
          animate={{ height: `${pct}%` }}
          transition={{
            duration: 0.6,
            ease: EASE_OUT_EXPO,
          }}
        />
      </div>
      <span className="text-[10px] font-bold text-slate-500">
        {value > 0 ? "+" : ""}
        {value.toFixed(2)}
      </span>
    </div>
  );
}

export default function ContradictionTheater({
  contradictions,
  summary,
  primaryTheme,
  totalContradictions,
  alignedAxes,
}: ContradictionTheaterProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (contradictions.length === 0) {
    return (
      <div className="rounded-[30px] border border-white/70 bg-white/88 p-8 shadow-[0_18px_60px_rgba(133,129,180,0.14)] backdrop-blur-xl">
        <h3 className="mb-2 text-lg font-black text-slate-950">矛盾劇場</h3>
        <p className="text-sm text-slate-500">
          現在、3つの鏡の間に大きなズレは見つかっていません。あなたの自己認識は一貫しています。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[30px] border border-white/70 bg-white/88 p-6 shadow-[0_18px_60px_rgba(133,129,180,0.14)] backdrop-blur-xl">
      {/* Header */}
      <h3 className="text-lg font-black text-slate-950">矛盾劇場</h3>
      <p className="mt-1 text-xs text-slate-500">
        3つの鏡が映す、あなたの多面性
      </p>

      {/* Stats row */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <div className="flex flex-col items-center">
          <span className="text-2xl font-black text-rose-500">
            {totalContradictions}
          </span>
          <span className="text-[10px] font-bold text-slate-400">矛盾</span>
        </div>
        <span className="text-xl font-bold text-slate-300">vs</span>
        <div className="flex flex-col items-center">
          <span className="text-2xl font-black text-emerald-500">
            {alignedAxes}
          </span>
          <span className="text-[10px] font-bold text-slate-400">一致</span>
        </div>
      </div>

      {/* Primary theme badge */}
      <div className="mt-4 flex justify-center">
        <span className="rounded-full bg-gradient-to-r from-violet-100 to-fuchsia-100 px-4 py-1.5 text-xs font-black text-violet-700">
          {primaryTheme}
        </span>
      </div>

      {/* Contradiction cards */}
      <div className="mt-6 space-y-4">
        {contradictions.slice(0, 5).map((c, idx) => {
          const meaningEntry = MEANING_MAP[c.meaning] ?? {
            icon: "\u2753",
            label: c.meaning,
          };
          const isExpanded = expandedIdx === idx;

          return (
            <motion.div
              key={c.axisId}
              className="relative overflow-hidden rounded-[24px] border border-slate-100 bg-white/60 p-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * 0.08,
                duration: 0.4,
                ease: EASE_OUT_EXPO,
              }}
              style={
                c.magnitude > 0.6
                  ? {
                      boxShadow: `0 0 ${Math.round(c.magnitude * 30)}px rgba(239,68,68,${c.magnitude * 0.2})`,
                    }
                  : undefined
              }
            >
              {/* Axis label */}
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-black text-slate-950">
                  {c.axisLabel}
                </h4>
                <span className="text-[10px] text-slate-400">
                  {c.axisLabelLeft} ← → {c.axisLabelRight}
                </span>
              </div>

              {/* Three-mirror columns */}
              <div className="grid grid-cols-3 gap-3">
                {MIRRORS.map((m) => (
                  <div key={m.key} className="flex flex-col items-center gap-1">
                    <span className="text-sm">{m.icon}</span>
                    <span className="text-[10px] font-bold text-slate-500">
                      {m.label}
                    </span>
                    <ScoreBar value={c.scores[m.key]} />
                  </div>
                ))}
              </div>

              {/* Magnitude tension indicator */}
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <motion.div
                    className={`h-full rounded-full ${
                      c.magnitude > 0.6
                        ? "bg-rose-400"
                        : c.magnitude > 0.3
                          ? "bg-amber-400"
                          : "bg-slate-300"
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${c.magnitude * 100}%` }}
                    transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-400">
                  緊張度 {(c.magnitude * 100).toFixed(0)}%
                </span>
              </div>

              {/* Meaning badge */}
              <div className="mt-3 flex items-center gap-1.5">
                <span className="text-sm">{meaningEntry.icon}</span>
                <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold text-violet-600">
                  {meaningEntry.label}
                </span>
              </div>

              {/* Insight */}
              <p className="mt-3 text-xs leading-6 text-slate-600">
                {c.insight}
              </p>

              {/* Expandable exploration prompt */}
              <button
                type="button"
                className="mt-3 text-[11px] font-bold text-violet-500 hover:text-violet-700"
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              >
                {isExpanded ? "閉じる" : "探索のヒントを見る"}
              </button>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                    className="overflow-hidden"
                  >
                    <p className="mt-2 rounded-[16px] bg-violet-50/60 p-3 text-xs leading-6 text-violet-700">
                      {c.explorationPrompt}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Summary */}
      <p className="mt-6 text-xs leading-6 text-slate-500">{summary}</p>
    </div>
  );
}
