// Slide 2: CORE TRAIT — 最も強く出ている特性
"use client";

import { motion } from "framer-motion";
import type { CoreTraitSlideData } from "../storyDataBuilder";

interface Props {
  data: CoreTraitSlideData;
  onReady: () => void;
}

export default function CoreTraitSlide({ data, onReady }: Props) {
  const isLeft = data.score < 0;
  const barPercent = Math.min(95, Math.max(5, data.percent));

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      {/* Heading */}
      <motion.p
        className="text-xs tracking-widest uppercase mb-8"
        style={{ color: "rgba(255,255,255,0.4)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        最も強く出ている特性
      </motion.p>

      {/* Dominant label */}
      <motion.p
        className="text-3xl font-bold mb-10"
        style={{ color: "rgba(255,255,255,0.95)" }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {data.dominantLabel}
      </motion.p>

      {/* Axis bar */}
      <div className="w-full max-w-[280px] space-y-3">
        {/* Labels */}
        <div className="flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
          <motion.span
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            {data.labelLeft}
          </motion.span>
          <motion.span
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            {data.labelRight}
          </motion.span>
        </div>

        {/* Bar track */}
        <div
          className="relative h-2 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          {/* Center marker */}
          <div
            className="absolute top-0 bottom-0 w-[1px]"
            style={{ left: "50%", background: "rgba(255,255,255,0.2)" }}
          />

          {/* Score fill */}
          <motion.div
            className="absolute top-0 bottom-0 rounded-full"
            style={{
              background: "rgba(255,255,255,0.7)",
              left: isLeft ? `${50 - barPercent / 2}%` : "50%",
              width: "0%",
            }}
            animate={{
              width: `${barPercent / 2}%`,
            }}
            transition={{ delay: 0.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={onReady}
          />
        </div>

        {/* Percent */}
        <motion.p
          className="text-center text-sm"
          style={{ color: "rgba(255,255,255,0.4)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0, duration: 0.4 }}
        >
          {data.percent}%
        </motion.p>
      </div>
    </div>
  );
}
