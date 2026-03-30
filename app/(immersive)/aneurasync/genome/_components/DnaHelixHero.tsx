"use client";

import { motion } from "framer-motion";
import type { GenomeStrand } from "@/lib/aneurasync/personaGenome";

/** DNA strand colors matching the design system */
const STRAND_COLORS: Record<string, { main: string; glow: string }> = {
  physical: { main: "#6366f1", glow: "rgba(99,102,241,0.35)" },
  personality: { main: "#8b5cf6", glow: "rgba(139,92,246,0.35)" },
  behavioral: { main: "#ec4899", glow: "rgba(236,72,153,0.35)" },
  social: { main: "#14b8a6", glow: "rgba(20,184,166,0.35)" },
};

const STRAND_LABELS: Record<string, string> = {
  physical: "フィジカル",
  personality: "パーソナリティ",
  behavioral: "ビヘイビア",
  social: "ソーシャル",
};

interface DnaHelixHeroProps {
  strands: GenomeStrand[];
  overallLabel: string;
  overallDescription: string;
  completeness: number;
}

/**
 * Animated DNA Double Helix — each base pair rung represents a real data point.
 * 4 strands interleave vertically. Confidence controls opacity, value controls width.
 */
export default function DnaHelixHero({
  strands,
  overallLabel,
  overallDescription,
  completeness,
}: DnaHelixHeroProps) {
  // Interleave base pairs from 4 strands into a single vertical sequence
  const allPairs = interleaveStrands(strands);
  const totalPairs = allPairs.length;

  // SVG dimensions — bold, dramatic helix
  const svgW = 220;
  const pairSpacing = 18;
  const svgH = Math.max(320, totalPairs * pairSpacing + 60);
  const cx = svgW / 2;
  const amplitude = 80;
  const freq = (Math.PI * 2) / 8; // one full twist every 8 base pairs
  const paddingY = 30;

  function yPos(i: number) {
    return paddingY + i * pairSpacing;
  }

  function leftX(i: number) {
    return cx + Math.sin(i * freq) * amplitude;
  }

  function rightX(i: number) {
    return cx - Math.sin(i * freq) * amplitude;
  }

  // Build backbone SVG paths
  const leftPath = allPairs
    .map((_, i) => `${i === 0 ? "M" : "L"} ${leftX(i).toFixed(1)},${yPos(i).toFixed(1)}`)
    .join(" ");
  const rightPath = allPairs
    .map((_, i) => `${i === 0 ? "M" : "L"} ${rightX(i).toFixed(1)},${yPos(i).toFixed(1)}`)
    .join(" ");

  return (
    <div className="relative rounded-[32px] border border-white/85 bg-white/76 px-7 py-10 shadow-[0_18px_48px_rgba(148,163,184,0.14)] ring-1 ring-slate-200/55 backdrop-blur-xl sm:px-8">
      {/* Title */}
      <div className="mb-6 text-center">
        <h2
          className="text-[2.2rem] font-semibold tracking-[-0.02em] text-slate-900 sm:text-[2.6rem]"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {overallLabel || "Persona Genome"}
        </h2>
        <p className="mt-2 text-sm text-slate-500">{overallDescription}</p>
        <div className="mx-auto mt-3 flex items-center justify-center gap-2">
          <span className="rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-1.5 text-sm font-black text-white shadow-[0_10px_24px_rgba(168,85,247,0.28),0_0_16px_rgba(168,85,247,0.15)]">
            {completeness}%
          </span>
          <span className="text-xs text-slate-400">完成度</span>
        </div>
      </div>

      {/* DNA Helix SVG */}
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="mx-auto block"
        style={{ maxWidth: 480, width: "100%" }}
        aria-label="DNA二重螺旋の可視化"
      >
        <defs>
          {Object.entries(STRAND_COLORS).map(([id, c]) => (
            <linearGradient key={id} id={`helix-grad-${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={c.main} stopOpacity="0.9" />
              <stop offset="100%" stopColor={c.main} stopOpacity="0.5" />
            </linearGradient>
          ))}
          <filter id="helix-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Left backbone */}
        <motion.path
          d={leftPath}
          fill="none"
          stroke="rgba(139,92,246,0.5)"
          strokeWidth={3}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        />
        {/* Right backbone */}
        <motion.path
          d={rightPath}
          fill="none"
          stroke="rgba(139,92,246,0.5)"
          strokeWidth={3}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* Base pair rungs */}
        {allPairs.map((pair, i) => {
          const y = yPos(i);
          const lx = leftX(i);
          const rx = rightX(i);
          const color = STRAND_COLORS[pair.strandId] ?? STRAND_COLORS.physical;
          const hasData = pair.confidence > 0;

          return (
            <motion.g
              key={pair.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.04, duration: 0.4 }}
            >
              {/* Rung line */}
              <line
                x1={lx}
                y1={y}
                x2={rx}
                y2={y}
                stroke={color.main}
                strokeWidth={hasData ? 2.5 + pair.value * 2 : 1.5}
                strokeOpacity={hasData ? 0.4 + pair.confidence * 0.45 : 0.12}
                strokeDasharray={hasData ? "none" : "4 5"}
                strokeLinecap="round"
              />

              {/* Left node */}
              <circle
                cx={lx}
                cy={y}
                r={hasData ? 5 + pair.value * 2.5 : 3.5}
                fill={color.main}
                fillOpacity={hasData ? 0.65 + pair.confidence * 0.3 : 0.15}
              />

              {/* Right node */}
              <circle
                cx={rx}
                cy={y}
                r={hasData ? 5 + pair.value * 2.5 : 3.5}
                fill={color.main}
                fillOpacity={hasData ? 0.65 + pair.confidence * 0.3 : 0.15}
              />

              {/* Center glow for high confidence */}
              {pair.confidence > 0.5 && (
                <circle
                  cx={(lx + rx) / 2}
                  cy={y}
                  r={5}
                  fill={color.main}
                  fillOpacity={0.85}
                  style={{
                    animation: `genome-pulse ${2.5 + (i % 4) * 0.3}s ease-in-out infinite`,
                    animationDelay: `${(i % 6) * 0.4}s`,
                  }}
                  filter="url(#helix-glow)"
                />
              )}
            </motion.g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        {strands.map((strand) => {
          const color = STRAND_COLORS[strand.id];
          return (
            <div key={strand.id} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color?.main }}
              />
              <span className="text-[13px] text-slate-500">
                {STRAND_LABELS[strand.id] ?? strand.label}
              </span>
              <span className="text-[10px] text-slate-400">
                {strand.basePairs.length}bp
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Interleave base pairs from 4 strands in round-robin order */
function interleaveStrands(
  strands: GenomeStrand[],
): Array<{ id: string; strandId: string; label: string; value: number; confidence: number }> {
  const result: Array<{ id: string; strandId: string; label: string; value: number; confidence: number }> = [];
  const maxLen = Math.max(...strands.map((s) => s.basePairs.length), 0);

  for (let i = 0; i < maxLen; i++) {
    for (const strand of strands) {
      const bp = strand.basePairs[i];
      if (bp) {
        result.push({
          id: bp.id,
          strandId: strand.id,
          label: bp.label,
          value: bp.value,
          confidence: bp.confidence,
        });
      }
    }
  }
  return result;
}
