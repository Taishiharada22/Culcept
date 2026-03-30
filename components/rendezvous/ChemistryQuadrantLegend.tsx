"use client";

/**
 * ChemistryQuadrantLegend
 * 共鳴/補完/摩擦/未知の分布を色バーとして表示
 */

import { motion } from "framer-motion";
import type { ChemistryQuadrant } from "@/lib/relational/types";

type QuadrantCount = {
  quadrant: ChemistryQuadrant;
  count: number;
};

type Props = {
  counts: QuadrantCount[];
  onQuadrantTap?: (quadrant: ChemistryQuadrant) => void;
  activeQuadrant?: ChemistryQuadrant | null;
};

const QUADRANT_META: Record<
  ChemistryQuadrant,
  { color: string; label: string; emoji: string }
> = {
  resonance: { color: "#22C55E", label: "共鳴", emoji: "✦" },
  complement: { color: "#6366F1", label: "補完", emoji: "⟡" },
  friction: { color: "#F59E0B", label: "摩擦", emoji: "△" },
  unknown: { color: "#94A3B8", label: "未知", emoji: "?" },
};

export default function ChemistryQuadrantLegend({
  counts,
  onQuadrantTap,
  activeQuadrant,
}: Props) {
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  if (total === 0) return null;

  return (
    <div>
      {/* Bar */}
      <div
        style={{
          display: "flex",
          height: 8,
          borderRadius: 4,
          overflow: "hidden",
          gap: 1,
        }}
      >
        {counts
          .filter((c) => c.count > 0)
          .map((c) => {
            const meta = QUADRANT_META[c.quadrant];
            const pct = (c.count / total) * 100;
            const isActive = activeQuadrant === c.quadrant;

            return (
              <motion.div
                key={c.quadrant}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{
                  background: meta.color,
                  opacity: isActive ? 1 : activeQuadrant ? 0.3 : 0.7,
                  cursor: onQuadrantTap ? "pointer" : undefined,
                  transition: "opacity 0.2s",
                }}
                onClick={() => onQuadrantTap?.(c.quadrant)}
              />
            );
          })}
      </div>

      {/* Labels */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        {counts
          .filter((c) => c.count > 0)
          .map((c) => {
            const meta = QUADRANT_META[c.quadrant];
            const isActive = activeQuadrant === c.quadrant;

            return (
              <div
                key={c.quadrant}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: onQuadrantTap ? "pointer" : undefined,
                  opacity: isActive ? 1 : activeQuadrant ? 0.4 : 0.8,
                  transition: "opacity 0.2s",
                }}
                onClick={() => onQuadrantTap?.(c.quadrant)}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: meta.color,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: isActive ? meta.color : "rgba(30,30,60,0.5)",
                    fontWeight: isActive ? 700 : 400,
                  }}
                >
                  {meta.label} {c.count}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
