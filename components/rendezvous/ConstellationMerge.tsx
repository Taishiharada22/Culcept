"use client";

/**
 * ConstellationMerge
 * マッチ啓示後の星座マージアニメーション
 * 3フェーズ: 出現 (0-1s) → 接近 (1-2s) → 合体+金色バースト (2-3s)
 */

import { useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getConstellationMergeConfig } from "@/lib/rendezvous/atmosphere";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  onComplete: () => void;
};

type StarPos = {
  cx: number;
  cy: number;
  r: number;
  delay: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a cluster of star positions around a center point */
function generateCluster(
  centerX: number,
  centerY: number,
  count: number,
  seed: number,
): StarPos[] {
  return Array.from({ length: count }, (_, i) => {
    // Deterministic pseudo-random from seed + index
    const angle = ((seed * 7 + i * 137.5) % 360) * (Math.PI / 180);
    const dist = 15 + ((seed + i * 11) % 25);
    return {
      cx: centerX + Math.cos(angle) * dist,
      cy: centerY + Math.sin(angle) * dist,
      r: 1.5 + ((i * 3 + seed) % 3),
      delay: i * 0.06,
    };
  });
}

/** Generate merged constellation pattern at center */
function generateMergedPattern(
  centerX: number,
  centerY: number,
  count: number,
): StarPos[] {
  return Array.from({ length: count }, (_, i) => {
    // Spread in a balanced constellation
    const angle = (i / count) * Math.PI * 2 + Math.PI / 6;
    const ring = i % 2 === 0 ? 18 : 10;
    return {
      cx: centerX + Math.cos(angle) * ring,
      cy: centerY + Math.sin(angle) * ring,
      r: 2 + (i % 3),
      delay: i * 0.04,
    };
  });
}

// ---------------------------------------------------------------------------
// SVG Glow Filter
// ---------------------------------------------------------------------------

function GlowFilter() {
  return (
    <defs>
      <filter id="constellation-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="burst-glow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConstellationMerge({ onComplete }: Props) {
  const config = getConstellationMergeConfig();
  const svgW = 300;
  const svgH = 200;
  const cx = svgW / 2;
  const cy = svgH / 2;

  // Stable random positions
  const starsA = useMemo(
    () => generateCluster(cx - 80, cy, config.starCountA, 17),
    [cx, cy, config.starCountA],
  );
  const starsB = useMemo(
    () => generateCluster(cx + 80, cy, config.starCountB, 53),
    [cx, cy, config.starCountB],
  );
  const mergedStars = useMemo(
    () => generateMergedPattern(cx, cy, config.starCountA + config.starCountB),
    [cx, cy, config.starCountA, config.starCountB],
  );

  // Call onComplete after 3s
  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const timer = setTimeout(handleComplete, config.durationMs);
    return () => clearTimeout(timer);
  }, [handleComplete, config.durationMs]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 15, 30, 0.85)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        fontFamily: "'Noto Sans JP', sans-serif",
      }}
    >
      {/* Label */}
      <motion.p
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 0.6, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "rgba(255, 215, 0, 0.7)",
          letterSpacing: "2px",
          marginBottom: 24,
        }}
      >
        星座が交わる
      </motion.p>

      {/* SVG Canvas */}
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ overflow: "visible", flexShrink: 0 }}
      >
        <GlowFilter />

        {/* Phase 1 (0-1s): Two clusters appear */}
        {starsA.map((s, i) => (
          <motion.circle
            key={`a-${i}`}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            fill="rgba(255, 255, 255, 0.85)"
            filter="url(#constellation-glow)"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.9, 0.7, 0],
              scale: [0, 1, 1, 0.5],
              cx: [s.cx, s.cx, cx + (s.cx - (cx - 80)) * 0.3, cx],
              cy: [s.cy, s.cy, cy + (s.cy - cy) * 0.5, cy],
            }}
            transition={{
              duration: 3,
              delay: s.delay,
              times: [0, 0.33, 0.66, 1],
              ease: "easeInOut",
            }}
          />
        ))}

        {starsB.map((s, i) => (
          <motion.circle
            key={`b-${i}`}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            fill={config.mergeColor}
            filter="url(#constellation-glow)"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.9, 0.7, 0],
              scale: [0, 1, 1, 0.5],
              cx: [s.cx, s.cx, cx + (s.cx - (cx + 80)) * 0.3, cx],
              cy: [s.cy, s.cy, cy + (s.cy - cy) * 0.5, cy],
            }}
            transition={{
              duration: 3,
              delay: s.delay,
              times: [0, 0.33, 0.66, 1],
              ease: "easeInOut",
            }}
          />
        ))}

        {/* Phase 3 (2-3s): Merged constellation appears */}
        {mergedStars.map((s, i) => (
          <motion.circle
            key={`m-${i}`}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            fill={config.burstColor}
            filter="url(#constellation-glow)"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0, 0, 1],
              scale: [0, 0, 0, 1],
            }}
            transition={{
              duration: 3,
              delay: s.delay,
              times: [0, 0.5, 0.65, 1],
              ease: "easeOut",
            }}
          />
        ))}

        {/* Phase 3: Golden burst ring */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={5}
          fill="none"
          stroke={config.burstColor}
          strokeWidth={2}
          filter="url(#burst-glow)"
          initial={{ r: 5, opacity: 0, strokeWidth: 3 }}
          animate={{
            r: [5, 5, 5, 60],
            opacity: [0, 0, 0.8, 0],
            strokeWidth: [3, 3, 2, 0.5],
          }}
          transition={{
            duration: 3,
            times: [0, 0.6, 0.7, 1],
            ease: "easeOut",
          }}
        />

        {/* Phase 3: Inner glow */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={10}
          fill={config.burstColor}
          filter="url(#burst-glow)"
          initial={{ opacity: 0, r: 3 }}
          animate={{
            opacity: [0, 0, 0.6, 0.2],
            r: [3, 3, 15, 8],
          }}
          transition={{
            duration: 3,
            times: [0, 0.6, 0.75, 1],
            ease: "easeOut",
          }}
        />

        {/* Connecting lines between merged stars */}
        {mergedStars.slice(0, -1).map((s, i) => {
          const next = mergedStars[(i + 1) % mergedStars.length];
          return (
            <motion.line
              key={`line-${i}`}
              x1={s.cx}
              y1={s.cy}
              x2={next.cx}
              y2={next.cy}
              stroke={`${config.burstColor}60`}
              strokeWidth={0.8}
              initial={{ opacity: 0, pathLength: 0 }}
              animate={{
                opacity: [0, 0, 0, 0.5],
                pathLength: [0, 0, 0, 1],
              }}
              transition={{
                duration: 3,
                delay: i * 0.02,
                times: [0, 0.5, 0.7, 1],
                ease: "easeOut",
              }}
            />
          );
        })}
      </svg>

      {/* Bottom label */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 0.5, y: 0 }}
        transition={{ delay: 2.2, duration: 0.6 }}
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "rgba(255, 215, 0, 0.5)",
          letterSpacing: "1.5px",
          marginTop: 20,
        }}
      >
        新しい星座が生まれた
      </motion.p>
    </motion.div>
  );
}
