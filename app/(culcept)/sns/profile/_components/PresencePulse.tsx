"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface PresencePulseProps {
  current: {
    selfAlignment: number;
    interpersonalEnergy: number;
    emotionalTemp: number;
    boundarySense: number;
    date: string;
  } | null;
  history7d: Array<{
    selfAlignment: number;
    interpersonalEnergy: number;
    emotionalTemp: number;
    boundarySense: number;
    date: string;
  }>;
  observationCount: number;
  dataQuality: "low" | "medium" | "high";
}

const QUALITY_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: "育成中", color: "bg-violet-100 text-violet-500 dark:bg-violet-900 dark:text-violet-400" },
  medium: { label: "安定中", color: "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400" },
  high: { label: "高精度", color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400" },
};

const METRIC_DOTS: Array<{
  key: string;
  label: string;
  colorFn: (v: number) => string;
}> = [
  {
    key: "selfAlignment",
    label: "自己整合",
    colorFn: (v) => (v > 0.3 ? "bg-indigo-400" : v < -0.3 ? "bg-rose-400" : "bg-slate-300"),
  },
  {
    key: "interpersonalEnergy",
    label: "対人エネルギー",
    colorFn: (v) => (v > 0.3 ? "bg-emerald-400" : v < -0.3 ? "bg-amber-400" : "bg-slate-300"),
  },
  {
    key: "emotionalTemp",
    label: "感情温度",
    colorFn: (v) => (v > 0.3 ? "bg-rose-400" : v < -0.3 ? "bg-sky-400" : "bg-slate-300"),
  },
  {
    key: "boundarySense",
    label: "境界感覚",
    colorFn: (v) => (v > 0.3 ? "bg-violet-400" : v < -0.3 ? "bg-orange-400" : "bg-slate-300"),
  },
];

function getGradient(current: PresencePulseProps["current"]) {
  if (!current) return "from-slate-200 to-slate-300";
  const { selfAlignment, emotionalTemp } = current;
  if (selfAlignment > 0.3 && emotionalTemp < 0) return "from-indigo-400 to-violet-500";
  if (selfAlignment < -0.3 && emotionalTemp > 0.3) return "from-amber-400 to-rose-500";
  return "from-slate-300 to-violet-400";
}

function dayCircleColor(day: PresencePulseProps["history7d"][number]) {
  const avg = (day.selfAlignment + day.interpersonalEnergy + day.boundarySense) / 3;
  if (avg > 0.3) return "bg-indigo-400";
  if (avg < -0.3) return "bg-amber-400";
  return "bg-slate-300";
}

/** Calculate consecutive observation days from history */
function calcStreak(history7d: PresencePulseProps["history7d"]): number {
  if (history7d.length === 0) return 0;
  let streak = 0;
  const sorted = [...history7d].sort((a, b) => b.date.localeCompare(a.date));
  const today = new Date().toISOString().slice(0, 10);
  for (const day of sorted) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - streak);
    if (day.date === expected.toISOString().slice(0, 10)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export default function PresencePulse({
  current,
  history7d,
  observationCount,
  dataQuality,
}: PresencePulseProps) {
  const gradient = getGradient(current);
  const quality = QUALITY_LABELS[dataQuality];
  const streak = calcStreak(history7d);

  return (
    <div>
      {/* Breathing circle */}
      <div className="flex flex-col items-center">
        <motion.div
          className={`relative flex h-44 w-44 items-center justify-center rounded-full bg-gradient-to-br ${gradient} shadow-lg`}
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          {current ? (
            <div className="grid grid-cols-2 gap-3">
              {METRIC_DOTS.map((m) => {
                const value = current[m.key as keyof typeof current] as number;
                return (
                  <div key={m.key} className="flex flex-col items-center gap-0.5">
                    <div
                      className={`h-4 w-4 rounded-full ${m.colorFn(value)} shadow-sm ring-2 ring-white/60`}
                    />
                    <span className="text-[8px] font-bold text-white/90 drop-shadow-sm">
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-4">
              <motion.span
                className="text-center text-xs font-bold text-white/80"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              >
                今日の観測が
                <br />
                まだありません
              </motion.span>
              <Link
                href="/stargazer"
                className="rounded-full bg-white/25 px-3 py-1.5 text-[10px] font-bold text-white no-underline backdrop-blur transition hover:bg-white/40"
              >
                観測する →
              </Link>
            </div>
          )}
        </motion.div>

        {/* Streak display */}
        {streak > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-1 dark:from-amber-950/40 dark:to-orange-950/30"
          >
            <span className="text-sm">🔥</span>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
              {streak}日連続観測中
            </span>
          </motion.div>
        )}

        {/* 7-day history */}
        <div className="mt-4 flex items-center gap-2">
          {history7d.slice(-7).map((day, i) => (
            <motion.div
              key={day.date}
              className={`h-5 w-5 rounded-full ${dayCircleColor(day)} shadow-sm`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                delay: i * 0.06,
                duration: 0.4,
                ease: EASE_OUT_EXPO,
              }}
              title={day.date}
            />
          ))}
          {history7d.length === 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              観測を始めると履歴が表示されます
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs font-bold text-slate-500">
            観測数: {observationCount}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${quality.color}`}
          >
            {quality.label}
          </span>
        </div>
      </div>
    </div>
  );
}
