// app/sns/profile/_components/CompanionLevel.tsx
// コンパニオンレベル — 観測深度の可視化
"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

/* ────────────────────────────────────────────── types */

interface CompanionQuality {
  level: 1 | 2 | 3 | 4;
  levelLabel: string;
  insightDepth: "surface" | "pattern" | "predictive";
  axesCovered: number;
  totalAxes: number;
  stableAxesCount: number;
  volatileAxesCount: number;
}

export interface CompanionLevelProps {
  observationCount: number;
  dataQuality: "low" | "medium" | "high";
  quality?: CompanionQuality | null;
}

/* ────────────────────────────────────────────── level config */

interface LevelDef {
  level: number;
  label: string;
  description: string;
  threshold: number;
  gradient: string;
  ring: string;
}

const LEVELS: LevelDef[] = [
  {
    level: 1,
    label: "表層",
    description: "観測を重ねると、パターン分析が解放されます",
    threshold: 0,
    gradient: "from-slate-300 to-slate-400",
    ring: "#94a3b8",
  },
  {
    level: 2,
    label: "パターン",
    description: "深層分析まであと少し。矛盾の構造が見えてきます",
    threshold: 10,
    gradient: "from-cyan-400 to-blue-500",
    ring: "#06b6d4",
  },
  {
    level: 3,
    label: "深層",
    description: "あなたの無意識の価値基準に触れ始めています",
    threshold: 30,
    gradient: "from-violet-500 to-purple-600",
    ring: "#8b5cf6",
  },
  {
    level: 4,
    label: "予測",
    description: "あなたの次の判断を高い精度で予測できる段階です",
    threshold: 100,
    gradient: "from-amber-400 to-orange-500",
    ring: "#f59e0b",
  },
];

/* ────────────────────────────────────────────── helpers */

function resolveLevelDef(count: number) {
  let def = LEVELS[0];
  for (const l of LEVELS) {
    if (count >= l.threshold) def = l;
  }
  return def;
}

function nextThreshold(count: number): number {
  for (const l of LEVELS) {
    if (count < l.threshold) return l.threshold;
  }
  // already at max level — return current threshold + 100 as "infinity" marker
  return LEVELS[LEVELS.length - 1].threshold + 100;
}

/* ────────────────────────────────────────────── ring */

function LevelRing({
  level,
  progress,
  ringColor,
}: {
  level: number;
  progress: number;
  ringColor: string;
}) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - Math.min(progress, 1));

  return (
    <div className="relative flex items-center justify-center w-28 h-28 mx-auto">
      <svg viewBox="0 0 104 104" className="w-full h-full -rotate-90">
        <circle
          cx={52}
          cy={52}
          r={R}
          fill="none"
          stroke="rgba(148,163,184,0.15)"
          strokeWidth={7}
        />
        <motion.circle
          cx={52}
          cy={52}
          r={R}
          fill="none"
          stroke={ringColor}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-[10px] text-slate-400 font-medium">Lv.</span>
        <span className="text-2xl font-bold text-slate-800">{level}</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────── quality badge */

const QUALITY_MAP: Record<
  CompanionLevelProps["dataQuality"],
  { label: string; cls: string }
> = {
  low: { label: "育成中", cls: "bg-violet-100 text-violet-500" },
  medium: { label: "安定中", cls: "bg-cyan-100 text-cyan-700" },
  high: { label: "高精度", cls: "bg-emerald-100 text-emerald-700" },
};

/* ────────────────────────────────────────────── main */

const CARD =
  "relative overflow-hidden rounded-2xl border border-white/70 bg-white/72 shadow-lg shadow-black/8 backdrop-blur-xl p-5";

const DEPTH_META: Record<string, { label: string; cls: string }> = {
  surface: { label: "表層", cls: "bg-slate-100 text-slate-600" },
  pattern: { label: "パターン", cls: "bg-cyan-100 text-cyan-700" },
  predictive: { label: "予測", cls: "bg-amber-100 text-amber-700" },
};

export default function CompanionLevel({
  observationCount,
  dataQuality,
  quality,
}: CompanionLevelProps) {
  const def = useMemo(
    () => resolveLevelDef(observationCount),
    [observationCount],
  );
  const next = useMemo(() => nextThreshold(observationCount), [observationCount]);
  const prevThreshold = def.threshold;
  const range = next - prevThreshold;
  const progress =
    range > 0 ? (observationCount - prevThreshold) / range : 1;

  const qualityBadge = QUALITY_MAP[dataQuality];

  return (
    <motion.div
      className={CARD}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* ring */}
      <LevelRing
        level={def.level}
        progress={progress}
        ringColor={def.ring}
      />

      {/* label */}
      <div className="text-center mt-3 space-y-1">
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs font-bold text-white bg-gradient-to-r ${def.gradient}`}
        >
          {def.label}
        </span>
        <p className="text-xs text-slate-500 leading-relaxed">
          {def.description}
        </p>
      </div>

      {/* progress bar to next level */}
      <div className="mt-4 space-y-1">
        <div className="flex justify-between text-[11px] text-slate-400">
          <span>観測数: {observationCount}</span>
          <span>
            次のレベルまで{" "}
            {observationCount >= LEVELS[LEVELS.length - 1].threshold
              ? "\u2014 \u6700\u9AD8\u30EC\u30D9\u30EB"
              : `${next - observationCount}`}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <motion.div
            className={`h-full rounded-full bg-gradient-to-r ${def.gradient}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress * 100, 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* data quality */}
      <div className="flex items-center justify-center gap-2 mt-3">
        <span className="text-[11px] text-slate-400">
          データ品質
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${qualityBadge.cls}`}
        >
          {qualityBadge.label}
        </span>
      </div>

      {/* Companion quality metrics */}
      {quality && (
        <div className="mt-4 pt-4 border-t border-slate-100/60 space-y-3">
          <h4 className="text-[11px] font-bold text-slate-500 text-center">
            理解の質
          </h4>

          {/* Insight depth badge */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-[11px] text-slate-400">洞察深度</span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${DEPTH_META[quality.insightDepth]?.cls ?? "bg-slate-100 text-slate-500"}`}>
              {DEPTH_META[quality.insightDepth]?.label ?? quality.insightDepth}
            </span>
          </div>

          {/* Axes coverage */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>軸カバレッジ</span>
              <span>{quality.axesCovered} / {quality.totalAxes}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-400"
                initial={{ width: 0 }}
                animate={{ width: `${quality.totalAxes > 0 ? (quality.axesCovered / quality.totalAxes) * 100 : 0}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              />
            </div>
          </div>

          {/* Stable / Volatile counts */}
          <div className="flex justify-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-slate-500">
                安定軸 {quality.stableAxesCount}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              <span className="text-[11px] text-slate-500">
                揺れ軸 {quality.volatileAxesCount}
              </span>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
