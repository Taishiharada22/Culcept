// Slide U3: DRIFT — 変化の軌跡
"use client";

import { motion } from "framer-motion";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

export interface DriftSlideData {
  axisId: TraitAxisKey;
  labelLeft: string;
  labelRight: string;
  previousScore: number; // -1 to 1
  currentScore: number;  // -1 to 1
  previousDate: string;
  currentDate: string;
}

interface Props {
  data: DriftSlideData;
  onReady: () => void;
}

export default function DriftSlide({ data, onReady }: Props) {
  const prevPercent = Math.round(((data.previousScore + 1) / 2) * 100);
  const currPercent = Math.round(((data.currentScore + 1) / 2) * 100);
  const delta = currPercent - prevPercent;
  const direction = delta > 0 ? data.labelRight : data.labelLeft;

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <motion.p
        className="text-xs tracking-widest uppercase mb-8"
        style={{ color: "rgba(255,255,255,0.4)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        変化の軌跡
      </motion.p>

      {/* Axis labels */}
      <motion.div
        className="flex items-center gap-3 mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
          {data.labelLeft}
        </span>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>⇔</span>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
          {data.labelRight}
        </span>
      </motion.div>

      {/* Score transition visual */}
      <div className="relative w-56 h-3 rounded-full mb-8" style={{ background: "rgba(255,255,255,0.08)" }}>
        {/* Center line */}
        <div
          className="absolute top-0 bottom-0 w-[1px]"
          style={{ left: "50%", background: "rgba(255,255,255,0.15)" }}
        />

        {/* Previous position (ghost) */}
        <motion.div
          className="absolute top-[-3px] w-4 h-4 rounded-full border"
          style={{
            borderColor: "rgba(255,255,255,0.2)",
            background: "transparent",
            left: `${prevPercent}%`,
            transform: "translateX(-50%)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        />

        {/* Current position — animates from prev to current */}
        <motion.div
          className="absolute top-[-3px] w-4 h-4 rounded-full"
          style={{
            background: "rgba(255,255,255,0.7)",
            transform: "translateX(-50%)",
          }}
          initial={{ left: `${prevPercent}%`, opacity: 0 }}
          animate={{ left: `${currPercent}%`, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {/* Delta display */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.4 }}
      >
        <p className="text-2xl font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
          {delta > 0 ? "+" : ""}{delta}%
        </p>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
          {direction}寄りへ
        </p>
      </motion.div>

      {/* Date range */}
      <motion.p
        className="text-xs"
        style={{ color: "rgba(255,255,255,0.35)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.3 }}
        onAnimationComplete={onReady}
      >
        {formatShortDate(data.previousDate)} → {formatShortDate(data.currentDate)}
      </motion.p>
    </div>
  );
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return iso.slice(5, 10);
  }
}
