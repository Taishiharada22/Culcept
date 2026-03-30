// Slide 4: UNOBSERVED — まだ観測が薄い領域
"use client";

import { motion } from "framer-motion";
import type { UnobservedSlideData } from "../storyDataBuilder";

interface Props {
  data: UnobservedSlideData;
  onReady: () => void;
}

export default function UnobservedSlide({ data, onReady }: Props) {
  const coveragePercent = data.totalCount > 0
    ? Math.round((data.observedCount / data.totalCount) * 100)
    : 0;

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <motion.p
        className="text-xs tracking-widest uppercase mb-6"
        style={{ color: "rgba(255,255,255,0.4)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        まだ観測が薄い領域
      </motion.p>

      {/* Coverage ring */}
      <motion.div
        className="relative w-24 h-24 mb-8"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {/* Track */}
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="6"
          />
          {/* Fill */}
          <motion.circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 42}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
            animate={{
              strokeDashoffset: 2 * Math.PI * 42 * (1 - coveragePercent / 100),
            }}
            transition={{ delay: 0.4, duration: 1, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>
            {data.observedCount}/{data.totalCount}
          </span>
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            次元
          </span>
        </div>
      </motion.div>

      {/* Unobserved areas list */}
      <div className="space-y-3 mb-8 w-full max-w-[260px]">
        {data.areas.map((area, i) => (
          <motion.div
            key={area.axisId}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: "rgba(255,255,255,0.05)" }}
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ delay: 0.6 + i * 0.15, duration: 0.5 }}
          >
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              {CATEGORY_ICONS[area.category] || "◇"}
            </span>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              {area.labelLeft} ⇔ {area.labelRight}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Next suggestion */}
      {data.nextSuggestion && (
        <motion.p
          className="text-xs"
          style={{ color: "rgba(255,255,255,0.4)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.4 }}
          onAnimationComplete={onReady}
        >
          次に観るべきポイント: {data.nextSuggestion.label}
        </motion.p>
      )}
      {!data.nextSuggestion && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.01 }}
          transition={{ delay: 1.2 }}
          onAnimationComplete={onReady}
        />
      )}
    </div>
  );
}

const CATEGORY_ICONS: Record<string, string> = {
  core: "◆",
  relational: "◇",
  emotional: "○",
  motion: "▷",
  aesthetic: "□",
  safety: "△",
  relational_deep: "◇",
  depth: "●",
  cognitive: "⬡",
};
