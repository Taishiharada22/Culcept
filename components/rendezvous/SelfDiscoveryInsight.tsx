"use client";

/**
 * SelfDiscoveryInsight — 発見の深さ
 * Displays the highest-significance self-insight as a subtle card.
 * Swipeable to dismiss, appears with slide-down animation.
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import type { SelfInsight, SelfInsightType } from "@/lib/rendezvous/selfDiscovery";

type Props = {
  insights: SelfInsight[];
};

const TYPE_COLORS: Record<SelfInsightType, string> = {
  time_pattern: "#F59E0B",
  topic_tendency: "#8B5CF6",
  response_rhythm: "#EC4899",
  emotional_openness: "#EF4444",
  depth_acceleration: "#6366F1",
};

export default function SelfDiscoveryInsight({ insights }: Props) {
  const [dismissed, setDismissed] = useState(false);

  const topInsight = useMemo(() => {
    const valid = insights.filter((i) => i.significance >= 0.3);
    if (valid.length === 0) return null;
    return valid.reduce((best, cur) =>
      cur.significance > best.significance ? cur : best,
    );
  }, [insights]);

  if (!topInsight || dismissed) return null;

  const dotColor = TYPE_COLORS[topInsight.type] ?? "#6366F1";

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 80 || Math.abs(info.offset.y) > 40) {
      setDismissed(true);
    }
  };

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={handleDragEnd}
          style={{
            margin: "0 16px",
            padding: "10px 14px",
            background: "rgba(255, 255, 255, 0.75)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderRadius: 12,
            border: "1px solid rgba(99, 102, 241, 0.08)",
            boxShadow: "0 2px 12px rgba(30, 30, 60, 0.04)",
            position: "relative",
            cursor: "grab",
            touchAction: "pan-y",
          }}
        >
          {/* Close button */}
          <button
            onClick={() => setDismissed(true)}
            style={{
              position: "absolute",
              top: 6,
              right: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              color: "rgba(30, 30, 60, 0.25)",
              padding: "2px 4px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            {/* Colored dot */}
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: dotColor,
                marginTop: 5,
                flexShrink: 0,
                boxShadow: `0 0 6px ${dotColor}40`,
              }}
            />

            <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
              {/* Title */}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#1E1E3C",
                  marginBottom: 2,
                }}
              >
                {topInsight.title}
              </div>

              {/* Body */}
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(30, 30, 60, 0.6)",
                  lineHeight: 1.5,
                  marginBottom: 4,
                }}
              >
                {topInsight.body}
              </div>

              {/* Subtext */}
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255, 255, 255, 0.5)",
                  fontStyle: "italic",
                  lineHeight: 1.4,
                  // Use dark text since background is light
                  // Override: subtext should be subtle
                  ...(typeof window !== "undefined"
                    ? { color: "rgba(30, 30, 60, 0.35)" }
                    : {}),
                }}
              >
                {topInsight.subtext}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
