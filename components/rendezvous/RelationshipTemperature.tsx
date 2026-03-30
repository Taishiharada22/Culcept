"use client";

/**
 * RelationshipTemperature
 * 関係の「温度」を水平グラデーションバーで視覚化。
 * 冷 ← → 温 のスケールにインジケータードットを配置。
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";

type Props = {
  direction: "rising" | "stable" | "cooling";
  magnitude?: number; // 0..1
};

const DIRECTION_LABELS: Record<Props["direction"], string> = {
  rising: "温まっています",
  stable: "安定しています",
  cooling: "少し距離が生まれています",
};

const DIRECTION_POSITION: Record<Props["direction"], number> = {
  cooling: 0.2,
  stable: 0.5,
  rising: 0.8,
};

const DIRECTION_DOT_COLOR: Record<Props["direction"], string> = {
  rising: "#F59E0B",
  stable: "#8B5CF6",
  cooling: "#6366F1",
};

export default function RelationshipTemperature({
  direction,
  magnitude,
}: Props) {
  const [showInfo, setShowInfo] = useState(false);

  // Adjust position slightly based on magnitude
  const basePos = DIRECTION_POSITION[direction];
  const adjustedPos =
    magnitude != null
      ? direction === "rising"
        ? basePos + magnitude * 0.15
        : direction === "cooling"
          ? basePos - magnitude * 0.15
          : basePos
      : basePos;
  const position = Math.max(0.05, Math.min(0.95, adjustedPos));
  const dotColor = DIRECTION_DOT_COLOR[direction];

  return (
    <GlassCard padding="sm" hoverEffect={false}>
      <div style={{ padding: "4px 0" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "rgba(30,30,60,0.35)",
                fontFamily: "'JetBrains Mono','SF Mono',monospace",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              関係の温度
            </span>
            <span
              onClick={() => setShowInfo((v) => !v)}
              style={{
                fontSize: 12,
                color: "rgba(30,30,60,0.3)",
                cursor: "pointer",
                userSelect: "none",
                lineHeight: 1,
              }}
            >
              &#9432;
            </span>
            {showInfo && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  width: 220,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.96)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(99,102,241,0.1)",
                  boxShadow: "0 4px 16px rgba(30,30,60,0.1)",
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: "rgba(30,30,60,0.6)",
                  zIndex: 20,
                }}
              >
                この指標は、会話の頻度、深さ、返信速度の変化から関係の温度を表しています
              </div>
            )}
          </div>
        </div>

        {/* Temperature bar */}
        <div style={{ position: "relative", height: 28, marginBottom: 8 }}>
          {/* Gradient bar */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              transform: "translateY(-50%)",
              height: 6,
              borderRadius: 3,
              background:
                "linear-gradient(to right, #6366F1, #8B5CF6, #F59E0B, #EF4444)",
              opacity: 0.6,
            }}
          />

          {/* End labels */}
          <span
            style={{
              position: "absolute",
              left: 0,
              top: -2,
              fontSize: 14,
            }}
          >
            ❄️
          </span>
          <span
            style={{
              position: "absolute",
              right: 0,
              top: -2,
              fontSize: 14,
            }}
          >
            🔥
          </span>

          {/* Indicator dot */}
          <motion.div
            initial={{ left: "50%" }}
            animate={{
              left: `${position * 100}%`,
              scale: [1, 1.2, 1],
            }}
            transition={{
              left: { duration: 0.8, ease: "easeOut" },
              scale: {
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              },
            }}
            style={{
              position: "absolute",
              top: "50%",
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: dotColor,
              border: "2.5px solid white",
              boxShadow: `0 2px 8px ${dotColor}40, 0 0 0 3px ${dotColor}15`,
              transform: "translate(-50%, -50%)",
              zIndex: 2,
            }}
          />
        </div>

        {/* Direction label */}
        <p
          style={{
            fontSize: 12,
            color: "rgba(30,30,60,0.5)",
            fontWeight: 500,
            textAlign: "center",
            margin: 0,
          }}
        >
          {DIRECTION_LABELS[direction]}
        </p>
      </div>
    </GlassCard>
  );
}
