"use client";

import { motion } from "framer-motion";

interface Props {
  name: string;
  value: number; // 0-100
  count: number;
  avgLow?: number;
  avgHigh?: number;
}

export default function GaugeMetric({
  name,
  value,
  count,
  avgLow = 35,
  avgHigh = 65,
}: Props) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className="py-4 border-b border-white/[0.04] last:border-0">
      {/* ラベル行 */}
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-body text-base font-semibold text-white/90">
          {name}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono-sg text-base font-semibold text-amber-300 tabular-nums">
            {clamped.toFixed(0)}
          </span>
          <span className="font-mono-sg text-xs text-white/30 tabular-nums">
            {count}件
          </span>
        </div>
      </div>

      {/* 低/高ラベル（ゲージの外） */}
      <div className="flex justify-between text-[10px] font-mono-sg text-white/25 mb-1">
        <span>低</span>
        <span>高</span>
      </div>

      {/* ゲージ本体 — テキストなし、クリーン */}
      <div className="relative h-8 rounded-lg bg-white/[0.03] overflow-hidden">
        {/* 目盛り（25%, 50%, 75%のみ） */}
        {[25, 50, 75].map((tick) => (
          <div
            key={tick}
            className="absolute top-0 h-full w-px bg-white/[0.06]"
            style={{ left: `${tick}%` }}
          />
        ))}

        {/* 平均帯 */}
        <div
          className="absolute top-1 bottom-1 rounded bg-white/[0.08]"
          style={{ left: `${avgLow}%`, width: `${avgHigh - avgLow}%` }}
        />

        {/* ダイヤモンドマーカー */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
          style={{ left: `${clamped}%` }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {/* グロー */}
          <div className="absolute inset-[-6px] rounded-full bg-amber-400/25 blur-sm" />
          {/* ダイヤモンド型 */}
          <div className="w-3 h-3 rotate-45 rounded-sm bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
        </motion.div>
      </div>
    </div>
  );
}
