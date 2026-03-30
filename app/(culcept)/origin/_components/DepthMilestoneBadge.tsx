"use client";

import { motion } from "framer-motion";

interface Props {
  category: string;
  depth: number;
  onDismiss: () => void;
}

/**
 * カテゴリ深度3/4到達時のゴールデングロウバッジ
 */
export default function DepthMilestoneBadge({
  category,
  depth,
  onDismiss,
}: Props) {
  return (
    <motion.div
      className="fixed inset-0 z-[55] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDismiss}
    >
      <div className="absolute inset-0 bg-black/10" />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-3"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
      >
        {/* ゴールデングロウ */}
        <div className="relative h-24 w-24">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(245,158,11,0.5), transparent 70%)",
              animation: "sg-glow-pulse 1.5s ease-in-out infinite",
            }}
          />
          <div
            className="absolute inset-4 rounded-full border-2 border-amber-400/60"
            style={{
              background: "radial-gradient(circle, rgba(245,158,11,0.15), transparent)",
              animation: "sg-breathe 2s ease-in-out infinite",
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-3xl">
            {depth >= 4 ? "💎" : "⭐"}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200/50 bg-white/90 px-6 py-3 shadow-lg backdrop-blur-lg">
          <p className="text-center text-sm font-bold" style={{ color: "#3a2a1a" }}>
            {category}の深度 Lv.{depth}
          </p>
          <p className="mt-1 text-center text-xs text-gray-500">
            {depth >= 4
              ? "最深層に到達しました"
              : "深い理解に近づいています"}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
