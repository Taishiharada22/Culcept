"use client";

/**
 * MemoryCrystalCard — 単一の記憶結晶カード
 * Glassmorphism + shimmer animation
 */

import { motion } from "framer-motion";
import type { MemoryCrystal } from "@/lib/rendezvous/memoryCrystals";

type Props = {
  crystal: MemoryCrystal;
  onClick?: () => void;
};

export default function MemoryCrystalCard({ crystal, onClick }: Props) {
  const detectedDate = new Date(crystal.detectedAt).toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <style>{`
        @keyframes rv-crystal-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
      <motion.div
        onClick={onClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 14,
          padding: "14px 16px",
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.10)",
          cursor: onClick ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Shimmer overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(90deg, transparent 0%, ${crystal.sparkColor}08 50%, transparent 100%)`,
            backgroundSize: "200% 100%",
            animation: "rv-crystal-shimmer 4s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />

        {/* Diamond icon with glow */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${crystal.sparkColor}15`,
            flexShrink: 0,
            position: "relative",
          }}
        >
          <span
            style={{
              fontSize: 18,
              filter: `drop-shadow(0 0 6px ${crystal.sparkColor})`,
            }}
          >
            💎
          </span>
        </div>

        {/* Text content */}
        <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: crystal.sparkColor,
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {crystal.name}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--rv-text-secondary, rgba(30,30,60,0.4))",
              marginTop: 2,
            }}
          >
            検出日: {detectedDate}
          </div>
        </div>
      </motion.div>
    </>
  );
}
