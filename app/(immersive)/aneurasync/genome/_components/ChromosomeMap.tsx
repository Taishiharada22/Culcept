"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GenomeStrand, GenomeBasePair } from "@/lib/aneurasync/personaGenome";

const STRAND_COLORS: Record<string, { main: string; light: string; text: string }> = {
  physical: { main: "#6366f1", light: "rgba(99,102,241,0.10)", text: "#4f46e5" },
  personality: { main: "#8b5cf6", light: "rgba(139,92,246,0.10)", text: "#7c3aed" },
  behavioral: { main: "#ec4899", light: "rgba(236,72,153,0.10)", text: "#db2777" },
  social: { main: "#14b8a6", light: "rgba(20,184,166,0.10)", text: "#0d9488" },
};

interface ChromosomeMapProps {
  strand: GenomeStrand;
  index: number;
}

/**
 * Chromosome banding visualization for a single DNA strand.
 * Each segment = one base pair, width proportional to value, opacity to confidence.
 */
export default function ChromosomeMap({ strand, index }: ChromosomeMapProps) {
  const [selectedBp, setSelectedBp] = useState<GenomeBasePair | null>(null);
  const color = STRAND_COLORS[strand.id] ?? STRAND_COLORS.physical;
  const pairs = strand.basePairs;

  // Compute total value for proportional widths
  const totalValue = pairs.reduce((sum, bp) => sum + Math.max(bp.value, 0.1), 0);

  const trackW = 280;
  const barH = 32;
  const centromereX = trackW * 0.35; // centromere position (like real chromosomes)

  // Build segments
  let cumX = 0;
  const segments = pairs.map((bp) => {
    const w = (Math.max(bp.value, 0.1) / totalValue) * trackW;
    const x = cumX;
    cumX += w;
    return { bp, x, w };
  });

  return (
    <motion.div
      role="listitem"
      className="rounded-[28px] border border-white/85 bg-white/76 p-6 shadow-[0_18px_48px_rgba(148,163,184,0.14)] ring-1 ring-slate-200/55 backdrop-blur-xl"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.5 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-2.5 rounded-full"
            style={{ background: color.main }}
          />
          <div>
            <div
              className="text-lg font-semibold text-slate-900"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {strand.label}
            </div>
            <div className="text-xs text-slate-400">{pairs.length} 塩基対</div>
          </div>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-bold"
          style={{ backgroundColor: color.light, color: color.text }}
        >
          Chr.{index + 1}
        </span>
      </div>

      {/* Chromosome bar */}
      <div className="mt-4 flex justify-center">
        <svg
          viewBox={`-4 -4 ${trackW + 8} ${barH + 8}`}
          className="w-full"
          style={{ maxWidth: trackW + 8 }}
        >
          {/* Background track with chromosome shape */}
          <rect
            x={0}
            y={0}
            width={trackW}
            height={barH}
            rx={barH / 2}
            fill="rgba(148,163,184,0.06)"
            stroke="rgba(148,163,184,0.12)"
            strokeWidth={1}
          />

          {/* Centromere pinch */}
          <ellipse
            cx={centromereX}
            cy={barH / 2}
            rx={3}
            ry={barH / 2 + 2}
            fill="rgba(148,163,184,0.08)"
          />

          {/* Banding segments */}
          {segments.map((seg, i) => {
            const isSelected = selectedBp?.id === seg.bp.id;
            const hasData = seg.bp.confidence > 0;

            return (
              <motion.rect
                key={seg.bp.id}
                role="button"
                aria-label={`${seg.bp.label}: ${Math.round(seg.bp.value * 100)}%`}
                x={seg.x + 1}
                y={2}
                width={Math.max(seg.w - 2, 1)}
                height={barH - 4}
                rx={2}
                fill={color.main}
                fillOpacity={hasData ? 0.15 + seg.bp.confidence * 0.55 : 0.06}
                stroke={isSelected ? color.main : "none"}
                strokeWidth={isSelected ? 1.5 : 0}
                style={{ cursor: "pointer" }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.2 + i * 0.04, duration: 0.35 }}
                onClick={() => setSelectedBp(isSelected ? null : seg.bp)}
              />
            );
          })}
        </svg>
      </div>

      {/* Selected base pair detail */}
      <AnimatePresence mode="wait">
        {selectedBp && (
          <motion.div
            key={selectedBp.id}
            className="mt-4 rounded-2xl p-5 shadow-sm"
            style={{ backgroundColor: color.light }}
            aria-expanded={true}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="text-center text-sm font-semibold text-slate-700">
              {selectedBp.label}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-slate-400">{selectedBp.leftLabel}</span>
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-white/80">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${selectedBp.value * 100}%`,
                      background: color.main,
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
              <span className="text-xs text-slate-400">{selectedBp.rightLabel}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span className="text-sm font-semibold" style={{ color: color.text }}>値: {Math.round(selectedBp.value * 100)}%</span>
              <span>信頼度: {Math.round(selectedBp.confidence * 100)}%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chips: top categories */}
      {pairs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from(new Set(pairs.map((bp) => bp.category)))
            .slice(0, 4)
            .map((cat) => (
              <span
                key={cat}
                className="rounded-full px-3 py-1.5 text-[11px] font-medium"
                style={{ backgroundColor: color.light, color: color.text }}
              >
                {cat}
              </span>
            ))}
        </div>
      )}
    </motion.div>
  );
}
