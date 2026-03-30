// app/stargazer/_components/DepthTransition.tsx
// 観測深度の遷移エフェクト — ページ遷移ではなく「深度の変化」
"use client";

import { useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ObservationDepth = "surface" | "middle" | "deep" | "alter";

interface Props {
  fromDepth: ObservationDepth;
  toDepth: ObservationDepth;
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Depth numeric mapping (brightness index)
// ---------------------------------------------------------------------------

const DEPTH_INDEX: Record<ObservationDepth, number> = {
  surface: 0,
  middle: 1,
  deep: 2,
  alter: 3,
};

const DEPTH_BG: Record<ObservationDepth, string> = {
  surface: "rgba(250,251,254,0.95)",
  middle: "rgba(230,232,245,0.95)",
  deep: "rgba(40,38,65,0.92)",
  alter: "rgba(15,12,30,0.95)",
};

const DEPTH_PARTICLE_COLOR: Record<ObservationDepth, string> = {
  surface: "rgba(190,200,230,0.5)",
  middle: "rgba(170,175,210,0.45)",
  deep: "rgba(140,130,190,0.4)",
  alter: "rgba(100,80,160,0.35)",
};

// ---------------------------------------------------------------------------
// Deterministic particle positions
// ---------------------------------------------------------------------------

interface Particle {
  id: string;
  x: number; // %
  size: number; // px
  delay: number; // seconds
  speed: number; // seconds for full traverse
}

const PARTICLES: Particle[] = Array.from({ length: 24 }, (_, i) => ({
  id: `dp-${i}`,
  x: ((i * 37 + 13) % 95) + 2,
  size: 1 + (i % 4) * 0.5,
  delay: (i % 8) * 0.04,
  speed: 0.5 + (i % 5) * 0.05,
}));

const DURATION_MS = 600;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DepthTransition({ fromDepth, toDepth, onComplete }: Props) {
  const goingDeeper = DEPTH_INDEX[toDepth] > DEPTH_INDEX[fromDepth];

  // Target background is the destination depth
  const targetBg = DEPTH_BG[toDepth];
  const particleColor = DEPTH_PARTICLE_COLOR[toDepth];

  // Particle direction: deeper = upward, shallower = downward
  const particleYFrom = goingDeeper ? 110 : -10;
  const particleYTo = goingDeeper ? -10 : 110;

  const handleAnimationComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // Auto-complete after duration
  useEffect(() => {
    const timer = setTimeout(handleAnimationComplete, DURATION_MS + 50);
    return () => clearTimeout(timer);
  }, [handleAnimationComplete]);

  const transitionKey = `${fromDepth}-${toDepth}`;

  // Memoize particles to avoid re-renders
  const particleElements = useMemo(
    () =>
      PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.size,
            background: particleColor,
          }}
          initial={{ top: `${particleYFrom}%`, opacity: 0 }}
          animate={{ top: `${particleYTo}%`, opacity: [0, 0.8, 0] }}
          transition={{
            duration: p.speed,
            delay: p.delay,
            ease: "easeInOut",
          }}
        />
      )),
    [particleColor, particleYFrom, particleYTo],
  );

  return (
    <AnimatePresence>
      <motion.div
        key={transitionKey}
        className="fixed inset-0 z-[100] pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION_MS / 1000, ease: "easeInOut" }}
      >
        {/* Background wash */}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.9, 0] }}
          transition={{ duration: DURATION_MS / 1000, ease: "easeInOut" }}
          style={{ background: targetBg }}
        />

        {/* Streaming particles */}
        <div className="absolute inset-0 overflow-hidden">{particleElements}</div>

        {/* Depth label flash */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: [0, 0.7, 0], scale: [0.9, 1, 1.05] }}
          transition={{ duration: DURATION_MS / 1000, ease: "easeOut" }}
        >
          <span
            className="font-display text-sm tracking-[0.3em] uppercase"
            style={{
              color: goingDeeper
                ? "rgba(180,175,220,0.6)"
                : "rgba(160,170,200,0.6)",
            }}
          >
            {depthLabel(toDepth)}
          </span>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function depthLabel(depth: ObservationDepth): string {
  switch (depth) {
    case "surface":
      return "表層";
    case "middle":
      return "中層";
    case "deep":
      return "深層";
    case "alter":
      return "最深部";
  }
}
