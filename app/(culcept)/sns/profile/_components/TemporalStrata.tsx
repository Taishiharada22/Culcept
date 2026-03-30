// app/sns/profile/_components/TemporalStrata.tsx
// 時間の地層 — 軸ごとの変遷スパークライン
"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

/* ────────────────────────────────────────────── types */

interface TrajectoryData {
  axisId: string;
  dataPoints: { date: string; score: number; context?: string }[];
  trend: "stable" | "rising" | "falling" | "oscillating";
  variance: number;
  latestScore: number;
  latestDate: string;
}

interface TrajectoryTriggerLink {
  axisId: string;
  trend: string;
  linkedTriggers: { trigger: string; direction: string; magnitude: number }[];
  linkedCycles: { cycleType: string; description: string }[];
}

export interface TemporalStrataProps {
  trajectories: TrajectoryData[];
  trajectoryTriggerLinks?: TrajectoryTriggerLink[];
}

/* ────────────────────────────────────────────── constants */

const TREND_META: Record<
  TrajectoryData["trend"],
  { icon: string; label: string; stroke: string }
> = {
  rising: { icon: "\uD83D\uDCC8", label: "上昇", stroke: "#10b981" },
  falling: { icon: "\uD83D\uDCC9", label: "下降", stroke: "#f59e0b" },
  oscillating: { icon: "\u26A1", label: "揺動", stroke: "#f43f5e" },
  stable: { icon: "\u2500", label: "安定", stroke: "#94a3b8" },
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-white/70 bg-white/72 shadow-lg shadow-black/8 backdrop-blur-xl p-4";

/* ────────────────────────────────────────────── sparkline */

function Sparkline({
  points,
  stroke,
}: {
  points: { date: string; score: number }[];
  stroke: string;
}) {
  const WIDTH = 120;
  const HEIGHT = 40;
  const PAD = 4;

  const d = useMemo(() => {
    if (points.length < 2) return "";
    const scores = points.map((p) => p.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1;

    return points
      .map((p, i) => {
        const x = PAD + ((WIDTH - PAD * 2) * i) / (points.length - 1);
        const y = HEIGHT - PAD - ((p.score - min) / range) * (HEIGHT - PAD * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points]);

  if (!d) return null;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="shrink-0"
    >
      <motion.path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />
    </svg>
  );
}

/* ────────────────────────────────────────────── variance dot */

function VarianceDot({ variance }: { variance: number }) {
  const color =
    variance < 0.15
      ? "bg-emerald-400"
      : variance < 0.35
        ? "bg-amber-400"
        : "bg-rose-400";

  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      title={`分散: ${(variance * 100).toFixed(0)}%`}
    />
  );
}

/* ────────────────────────────────────────────── main */

export default function TemporalStrata({ trajectories, trajectoryTriggerLinks }: TemporalStrataProps) {
  const top6 = useMemo(
    () =>
      [...(trajectories ?? [])]
        .sort((a, b) => b.variance - a.variance)
        .slice(0, 6),
    [trajectories],
  );

  if (!trajectories || trajectories.length === 0) return null;

  return (
    <section className="space-y-4">
      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-lg font-bold text-slate-800">時間の地層</h2>
        <p className="text-xs text-slate-500">
          あなたのパーソナリティの変遷
        </p>
      </motion.div>

      {/* grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {top6.map((t, idx) => {
          const meta = TREND_META[t.trend];
          const link = trajectoryTriggerLinks?.find((l) => l.axisId === t.axisId);

          return (
            <motion.div
              key={t.axisId}
              className={CARD}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08, duration: 0.45 }}
            >
              {/* row: label + trend */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-slate-700 truncate">
                  {t.axisId}
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <span>{meta.icon}</span>
                  <span>{meta.label}</span>
                </span>
              </div>

              {/* row: sparkline + score + variance */}
              <div className="flex items-center gap-3">
                <Sparkline points={t.dataPoints} stroke={meta.stroke} />

                <div className="flex flex-col items-end gap-1 ml-auto">
                  <span className="text-base font-bold text-slate-800">
                    {t.latestScore.toFixed(1)}
                  </span>
                  <VarianceDot variance={t.variance} />
                </div>
              </div>

              {/* Linked triggers & cycles */}
              {link && (link.linkedTriggers.length > 0 || link.linkedCycles.length > 0) && (
                <div className="mt-2 pt-2 border-t border-slate-100/60 space-y-1.5">
                  {link.linkedTriggers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {link.linkedTriggers.slice(0, 3).map((tr, ti) => (
                        <span
                          key={ti}
                          className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200/60 px-2 py-0.5 text-[10px] text-amber-700"
                        >
                          ⚡ {tr.trigger}
                        </span>
                      ))}
                    </div>
                  )}
                  {link.linkedCycles.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {link.linkedCycles.slice(0, 2).map((cy, ci) => (
                        <span
                          key={ci}
                          className="inline-flex items-center rounded-full bg-sky-50 border border-sky-200/60 px-2 py-0.5 text-[10px] text-sky-700"
                        >
                          🔄 {cy.cycleType}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
