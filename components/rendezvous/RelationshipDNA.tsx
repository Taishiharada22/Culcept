"use client";

/**
 * RelationshipDNA
 * 化学反応マップの全軸を1本の水平カラーセグメントストリップで表示
 * 共鳴=緑、補完=紫、摩擦=琥珀、未知=灰色
 */

import { motion } from "framer-motion";
import type { ChemistryQuadrant } from "@/lib/relational/types";

type Segment = {
  axis: string;
  axisLabel: string;
  quadrant: ChemistryQuadrant;
};

type Props = {
  segments: Segment[];
  summary: string;
  dominantQuadrant: ChemistryQuadrant;
};

const QUADRANT_COLORS: Record<ChemistryQuadrant, string> = {
  resonance: "#22C55E",
  complement: "#6366F1",
  friction: "#F59E0B",
  unknown: "#CBD5E1",
};

const DOMINANT_LABELS: Record<ChemistryQuadrant, string> = {
  resonance: "共鳴型",
  complement: "補完型",
  friction: "刺激型",
  unknown: "探索中",
};

export default function RelationshipDNA({
  segments,
  summary,
  dominantQuadrant,
}: Props) {
  if (segments.length === 0) return null;

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        background: "rgba(99,102,241,0.03)",
        border: "1px solid rgba(99,102,241,0.06)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "rgba(30,30,60,0.4)",
            letterSpacing: "0.5px",
          }}
        >
          RELATIONSHIP DNA
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: QUADRANT_COLORS[dominantQuadrant],
            background: `${QUADRANT_COLORS[dominantQuadrant]}10`,
            padding: "2px 8px",
            borderRadius: 6,
          }}
        >
          {DOMINANT_LABELS[dominantQuadrant]}
        </span>
      </div>

      {/* DNA Strip */}
      <div
        style={{
          display: "flex",
          height: 12,
          borderRadius: 6,
          overflow: "hidden",
          gap: 1,
        }}
      >
        {segments.map((seg, i) => (
          <motion.div
            key={seg.axis}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.4, delay: i * 0.03 }}
            style={{
              flex: 1,
              background: QUADRANT_COLORS[seg.quadrant],
              opacity: 0.7,
              transformOrigin: "left",
            }}
            title={`${seg.axisLabel}: ${seg.quadrant}`}
          />
        ))}
      </div>

      {/* Summary */}
      <p
        style={{
          fontSize: 11,
          color: "rgba(30,30,60,0.55)",
          lineHeight: 1.6,
          marginTop: 8,
          margin: "8px 0 0",
        }}
      >
        {summary}
      </p>
    </div>
  );
}
