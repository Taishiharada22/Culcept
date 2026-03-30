"use client";

/**
 * ResonanceBurst
 * 収束時にReasonCode[]に基づく発光ラインを表示
 * 共鳴する軸の数と種類に応じた視覚演出
 */

import { motion } from "framer-motion";
import type { ReasonCode } from "@/lib/rendezvous/types";

type Props = {
  reasonCodes: ReasonCode[];
  size?: number;
  color?: string;
  delay?: number;
};

const REASON_GLOW_COLORS: Partial<Record<ReasonCode, string>> = {
  conversation_pace_close: "#22C55E",
  distance_preference_aligned: "#6366F1",
  depth_speed_aligned: "#8B5CF6",
  emotional_temperature_close: "#EC4899",
  complementary_roles: "#F59E0B",
  decision_style_aligned: "#06B6D4",
  stable_connection_potential: "#10B981",
  light_connection_potential: "#60A5FA",
  creative_role_fit: "#F97316",
};

export default function ResonanceBurst({
  reasonCodes,
  size = 200,
  color = "#6366F1",
  delay = 0,
}: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const lineCount = Math.min(reasonCodes.length, 8);

  if (lineCount === 0) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
      {/* Central burst glow */}
      <motion.circle
        cx={cx}
        cy={cy}
        r={lineCount * 4 + 8}
        fill="none"
        stroke={color}
        strokeWidth={0.5}
        initial={{ r: 0, opacity: 0 }}
        animate={{ r: lineCount * 4 + 8, opacity: [0, 0.4, 0.15] }}
        transition={{ duration: 1.2, delay: delay, ease: "easeOut" }}
      />

      {/* Resonance lines radiating outward */}
      {reasonCodes.slice(0, 8).map((code, i) => {
        const angle = (i / lineCount) * Math.PI * 2 - Math.PI / 2;
        const innerR = 12;
        const outerR = size * 0.38;
        const x1 = cx + innerR * Math.cos(angle);
        const y1 = cy + innerR * Math.sin(angle);
        const x2 = cx + outerR * Math.cos(angle);
        const y2 = cy + outerR * Math.sin(angle);
        const lineColor = REASON_GLOW_COLORS[code] ?? color;

        return (
          <motion.line
            key={code}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={lineColor}
            strokeWidth={1.5}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.7, 0.3] }}
            transition={{
              duration: 0.8,
              delay: delay + 0.3 + i * 0.08,
              ease: "easeOut",
            }}
          />
        );
      })}

      {/* Outer ring pulse */}
      <motion.circle
        cx={cx}
        cy={cy}
        fill="none"
        stroke={color}
        strokeWidth={1}
        initial={{ r: 0, opacity: 0 }}
        animate={{
          r: [0, size * 0.4, size * 0.45],
          opacity: [0, 0.3, 0],
        }}
        transition={{
          duration: 1.5,
          delay: delay + 0.8,
          ease: "easeOut",
        }}
      />
    </svg>
  );
}
