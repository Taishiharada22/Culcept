"use client";
// components/ui/DepthTransition.tsx
// レベルアップ時のフルスクリーン「潜水」トランジション

import { motion, AnimatePresence } from "framer-motion";
import { type ObservationLevel } from "@/lib/ui/depthVisualSystem";

const DEPTH_COLORS: Record<ObservationLevel, { from: string; to: string; label: string }> = {
  0: { from: "#e8f4f8", to: "#d0e8ef", label: "水面" },
  1: { from: "#d5e5f0", to: "#a0c0dd", label: "浅い水中" },
  2: { from: "#c5d0e8", to: "#6a80b8", label: "深海" },
  3: { from: "#3a3560", to: "#18132e", label: "深淵" },
  4: { from: "#0e0a1a", to: "#060510", label: "宇宙" },
};

interface Props {
  fromLevel: ObservationLevel;
  toLevel: ObservationLevel;
  isActive: boolean;
  onComplete: () => void;
}

export default function DepthTransition({ fromLevel, toLevel, isActive, onComplete }: Props) {
  const target = DEPTH_COLORS[toLevel];

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          onAnimationComplete={() => {
            setTimeout(onComplete, 2000);
          }}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: `linear-gradient(180deg, ${target.from} 0%, ${target.to} 100%)`,
          }}
        >
          {/* 潜水アニメーション */}
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 1, ease: [0.22, 1, 0.36, 1] }}
            style={{ textAlign: "center" }}
          >
            <motion.div
              style={{ fontSize: 48, marginBottom: 16 }}
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              {["🌑", "🌒", "🌓", "🌔", "🌕"][toLevel]}
            </motion.div>
            <div style={{
              fontSize: 14, fontWeight: 700, letterSpacing: 2,
              color: toLevel >= 2 ? "#e8eef5" : "#1a3040",
            }}>
              {target.label}へ
            </div>
            <div style={{
              fontSize: 11, marginTop: 8, opacity: 0.6,
              color: toLevel >= 2 ? "#b0c0d8" : "#4a6575",
            }}>
              観測深度が上がりました
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
