"use client";

/**
 * TrajectoryIndicator
 * SyncRingの横に配置する矢印インジケーター
 * ↑成長中 →安定 ↓冷却中
 */

import { motion } from "framer-motion";
import type { TrajectoryDirection } from "@/lib/rendezvous/livingScore";

type Props = {
  direction: TrajectoryDirection;
  label?: string;
};

const DIRECTION_META: Record<
  TrajectoryDirection,
  { icon: string; color: string; rotation: number; label: string }
> = {
  rising: { icon: "^", color: "#22C55E", rotation: 0, label: "成長中" },
  stable: { icon: "=", color: "#6366F1", rotation: 0, label: "安定" },
  cooling: { icon: "v", color: "#F59E0B", rotation: 0, label: "冷却中" },
};

export default function TrajectoryIndicator({ direction, label }: Props) {
  const meta = DIRECTION_META[direction];
  const displayLabel = label ?? meta.label;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 6px",
        borderRadius: 6,
        background: `${meta.color}10`,
        border: `1px solid ${meta.color}20`,
      }}
    >
      {/* Arrow */}
      <motion.svg
        width={10}
        height={10}
        viewBox="0 0 10 10"
        animate={
          direction === "rising"
            ? { y: [0, -1.5, 0] }
            : direction === "cooling"
              ? { y: [0, 1.5, 0] }
              : {}
        }
        transition={{
          repeat: Infinity,
          duration: 2,
          ease: "easeInOut",
        }}
      >
        {direction === "rising" && (
          <path d="M5 2 L8 6 L6 6 L6 8 L4 8 L4 6 L2 6 Z" fill={meta.color} />
        )}
        {direction === "stable" && (
          <>
            <line x1="2" y1="5" x2="8" y2="5" stroke={meta.color} strokeWidth={1.5} strokeLinecap="round" />
          </>
        )}
        {direction === "cooling" && (
          <path d="M5 8 L8 4 L6 4 L6 2 L4 2 L4 4 L2 4 Z" fill={meta.color} />
        )}
      </motion.svg>

      <span
        style={{
          fontSize: 8,
          fontWeight: 700,
          color: meta.color,
          letterSpacing: "0.3px",
        }}
      >
        {displayLabel}
      </span>
    </motion.div>
  );
}
