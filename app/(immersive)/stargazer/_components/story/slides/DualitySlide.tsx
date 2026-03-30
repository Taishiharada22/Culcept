// Slide 3: DUALITY — 内部の二面性 / まだ定まりきっていない部分
"use client";

import { motion } from "framer-motion";
import type { DualitySlideData } from "../storyDataBuilder";

interface Props {
  data: DualitySlideData;
  onReady: () => void;
}

export default function DualitySlide({ data, onReady }: Props) {
  if (data.kind === "detected") {
    return <DetectedDuality data={data} onReady={onReady} />;
  }
  return <UndeterminedDuality data={data} onReady={onReady} />;
}

// ── 矛盾検出あり ──

function DetectedDuality({
  data,
  onReady,
}: {
  data: Extract<DualitySlideData, { kind: "detected" }>;
  onReady: () => void;
}) {
  const leftPercent = Math.round(((data.poles[0] + 1) / 2) * 100);
  const rightPercent = Math.round(((data.poles[1] + 1) / 2) * 100);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <motion.p
        className="text-xs tracking-widest uppercase mb-6"
        style={{ color: "rgba(255,255,255,0.4)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        内部の二面性
      </motion.p>

      {/* Split visual */}
      <div className="flex items-center gap-6 mb-8">
        {/* Left pole */}
        <motion.div
          className="text-right"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <p className="text-2xl font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
            {leftPercent}%
          </p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
            {data.labelLeft}
          </p>
        </motion.div>

        {/* Divider line */}
        <motion.div
          className="w-[1px] h-16"
          style={{ background: "rgba(255,255,255,0.2)" }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        />

        {/* Right pole */}
        <motion.div
          className="text-left"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <p className="text-2xl font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
            {rightPercent}%
          </p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
            {data.labelRight}
          </p>
        </motion.div>
      </div>

      {/* Insight text */}
      <motion.p
        className="text-sm leading-relaxed max-w-[300px]"
        style={{ color: "rgba(255,255,255,0.65)" }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        onAnimationComplete={onReady}
      >
        {data.insight}
      </motion.p>
    </div>
  );
}

// ── 矛盾未検出 — 中立表現 ──

function UndeterminedDuality({
  data,
  onReady,
}: {
  data: Extract<DualitySlideData, { kind: "undetermined" }>;
  onReady: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <motion.p
        className="text-xs tracking-widest uppercase mb-6"
        style={{ color: "rgba(255,255,255,0.4)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        まだ定まりきっていない部分
      </motion.p>

      {/* Axis labels */}
      <motion.div
        className="flex items-center gap-4 mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <span className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          {data.labelLeft}
        </span>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          ⇔
        </span>
        <span className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          {data.labelRight}
        </span>
      </motion.div>

      {/* Oscillation visual — dot near center */}
      <motion.div
        className="relative w-48 h-2 rounded-full mb-8 overflow-hidden"
        style={{ background: "rgba(255,255,255,0.1)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      >
        <div
          className="absolute top-0 bottom-0 w-[1px]"
          style={{ left: "50%", background: "rgba(255,255,255,0.2)" }}
        />
        <motion.div
          className="absolute top-[-2px] w-3 h-3 rounded-full"
          style={{
            background: "rgba(255,255,255,0.6)",
            left: `${50 + data.score * 40}%`,
            transform: "translateX(-50%)",
          }}
          animate={{ x: [-4, 4, -4] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* Explanation */}
      <motion.p
        className="text-sm leading-relaxed max-w-[280px]"
        style={{ color: "rgba(255,255,255,0.55)" }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        onAnimationComplete={onReady}
      >
        この領域はまだ揺れています。
        <br />
        観測を重ねることで、あなたの傾向が見えてきます。
      </motion.p>
    </div>
  );
}
