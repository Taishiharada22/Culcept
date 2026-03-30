"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

const TYPE_LABELS: Record<string, { icon: string; label: string }> = {
  contradiction: { icon: "⚡", label: "矛盾検出" },
  axis_shift: { icon: "🔄", label: "軸変化" },
  pattern: { icon: "🔮", label: "パターン" },
};

interface MicroMomentProps {
  moment: {
    type: string;
    title: string;
    body: string;
    source: string;
    icon: string;
    magnitude?: number;
  } | null;
}

export default function MicroMoment({ moment }: MicroMomentProps) {
  if (!moment) {
    return (
      <div className="rounded-2xl border border-dashed border-violet-200/60 bg-gradient-to-r from-violet-50/50 to-fuchsia-50/50 p-6 text-center dark:border-violet-700/40 dark:from-violet-950/20 dark:to-fuchsia-950/20">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          今日はまだ気づきがありません
        </p>
        <Link
          href="/stargazer"
          className="mt-3 inline-block rounded-full bg-violet-100 px-4 py-1.5 text-xs font-bold text-violet-600 no-underline transition hover:bg-violet-200 dark:bg-violet-900 dark:text-violet-400"
        >
          観測すると、今日の気づきが現れます →
        </Link>
      </div>
    );
  }

  const typeInfo = TYPE_LABELS[moment.type] ?? { icon: moment.icon, label: moment.type };

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl p-[2px]"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
    >
      {/* Animated gradient border */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-violet-400 via-fuchsia-400 via-amber-300 to-violet-400"
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
        style={{ backgroundSize: "200% 100%" }}
      />

      {/* Pulsing glow */}
      <motion.div
        className="absolute inset-0"
        animate={{
          boxShadow: [
            `0 0 ${16 + (moment.magnitude ?? 0.5) * 16}px rgba(139,92,246,${0.08 + (moment.magnitude ?? 0.5) * 0.14}), 0 0 ${40 + (moment.magnitude ?? 0.5) * 40}px rgba(236,72,153,${0.04 + (moment.magnitude ?? 0.5) * 0.08})`,
            `0 0 ${24 + (moment.magnitude ?? 0.5) * 24}px rgba(139,92,246,${0.14 + (moment.magnitude ?? 0.5) * 0.18}), 0 0 ${60 + (moment.magnitude ?? 0.5) * 40}px rgba(236,72,153,${0.08 + (moment.magnitude ?? 0.5) * 0.12})`,
            `0 0 ${16 + (moment.magnitude ?? 0.5) * 16}px rgba(139,92,246,${0.08 + (moment.magnitude ?? 0.5) * 0.14}), 0 0 ${40 + (moment.magnitude ?? 0.5) * 40}px rgba(236,72,153,${0.04 + (moment.magnitude ?? 0.5) * 0.08})`,
          ],
        }}
        transition={{ duration: 3.5 - (moment.magnitude ?? 0.5) * 1.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Inner card */}
      <div className="relative rounded-2xl bg-gradient-to-br from-white via-white to-violet-50/60 p-6 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/40">
        {/* Top: type icon + label */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-base">{typeInfo.icon}</span>
          <span className="rounded-full bg-violet-100 px-3 py-0.5 text-xs font-bold uppercase tracking-[0.15em] text-violet-600 dark:bg-violet-900 dark:text-violet-400">
            {typeInfo.label}
          </span>
        </div>

        {/* Title */}
        {moment.title && (
          <h3 className="mb-2 text-base font-bold text-slate-900 dark:text-white">
            {moment.title}
          </h3>
        )}

        {/* Body */}
        <p className="text-sm font-bold leading-8 text-slate-800 dark:text-slate-200">
          {moment.body}
        </p>

        {/* Signal magnitude bar */}
        {moment.magnitude != null && moment.magnitude > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs text-slate-400">シグナル強度</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400"
                initial={{ width: 0 }}
                animate={{ width: `${moment.magnitude * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
              />
            </div>
          </div>
        )}

        {/* Source */}
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          検出元: {moment.source}
        </p>
      </div>
    </motion.div>
  );
}
