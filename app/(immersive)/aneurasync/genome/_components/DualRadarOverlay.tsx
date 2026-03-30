"use client";

import { motion } from "framer-motion";
import type { MirrorModeResult, MirrorPerceptionVector } from "@/lib/aneurasync/personaGenome";

const MIRROR_AXES: Array<{ key: keyof MirrorPerceptionVector; label: string }> = [
  { key: "expressiveness", label: "表現性" },
  { key: "boldness", label: "大胆さ" },
  { key: "socialOrientation", label: "社交性" },
  { key: "aestheticIntensity", label: "審美感度" },
  { key: "warmth", label: "温かさ" },
  { key: "practicality", label: "実用性" },
  { key: "consistency", label: "一貫性" },
];

interface DualRadarOverlayProps {
  mirror: MirrorModeResult;
  /** When true, gap insight cards and gap score are hidden (rendered externally). */
  hideGaps?: boolean;
}

export default function DualRadarOverlay({ mirror, hideGaps }: DualRadarOverlayProps) {
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const total = MIRROR_AXES.length;
  const padding = 52;

  function getPoint(index: number, score: number): [number, number] {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const r = radius * score;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function getPolygonPoints(vec: MirrorPerceptionVector): string {
    return MIRROR_AXES.map((axis, i) => {
      const [x, y] = getPoint(i, vec[axis.key]);
      return `${x},${y}`;
    }).join(" ");
  }

  function getLabelPos(index: number) {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const labelR = radius + 30;
    const x = cx + labelR * Math.cos(angle);
    const y = cy + labelR * Math.sin(angle);
    let anchor: "start" | "middle" | "end" = "middle";
    if (Math.cos(angle) > 0.3) anchor = "start";
    else if (Math.cos(angle) < -0.3) anchor = "end";
    return { x, y: y + 4, anchor };
  }

  const gridLevels = [0.33, 0.66, 1.0];

  function getGridPath(level: number): string {
    const points = Array.from({ length: total }, (_, i) => {
      const [x, y] = getPoint(i, level);
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")} Z`;
  }

  const selfPoints = getPolygonPoints(mirror.selfPerception);
  const othersPoints = getPolygonPoints(mirror.othersPerception);

  return (
    <div>
      <svg
        viewBox={`${-padding} ${-padding} ${size + padding * 2} ${size + padding * 2}`}
        className="mx-auto block w-full"
        style={{ maxWidth: size + padding * 2, overflow: "visible" }}
        role="img"
        aria-label="自己認識と他者認識のレーダーチャート"
      >
        {/* Grid */}
        {gridLevels.map((level) => (
          <path
            key={level}
            d={getGridPath(level)}
            fill="none"
            stroke="rgba(148,163,184,0.12)"
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {MIRROR_AXES.map((_, i) => {
          const [x, y] = getPoint(i, 1);
          return (
            <line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="rgba(148,163,184,0.08)"
              strokeWidth={1}
            />
          );
        })}

        {/* Gap highlight wedges */}
        {mirror.gaps
          .filter((g) => g.significance !== "low")
          .map((gap, gi) => {
            const axisIndex = MIRROR_AXES.findIndex((a) => a.key === gap.dimension);
            if (axisIndex < 0) return null;
            const [sx, sy] = getPoint(axisIndex, gap.selfScore);
            const [ox, oy] = getPoint(axisIndex, gap.othersScore);
            return (
              <line
                key={`gap-${gi}`}
                x1={sx}
                y1={sy}
                x2={ox}
                y2={oy}
                stroke="rgba(251,191,36,0.6)"
                strokeWidth={3}
                strokeLinecap="round"
                style={{
                  animation: `radar-gap-pulse 2.5s ease-in-out infinite`,
                  animationDelay: `${gi * 0.3}s`,
                }}
              />
            );
          })}

        {/* Self polygon (violet) */}
        <motion.polygon
          points={selfPoints}
          fill="rgba(139,92,246,0.12)"
          stroke="rgba(139,92,246,0.6)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* Others polygon (pink, dashed) */}
        <motion.polygon
          points={othersPoints}
          fill="rgba(236,72,153,0.08)"
          stroke="rgba(236,72,153,0.5)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeDasharray="6 3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        />

        {/* Self data points */}
        {MIRROR_AXES.map((axis, i) => {
          const [px, py] = getPoint(i, mirror.selfPerception[axis.key]);
          return (
            <motion.circle
              key={`self-${i}`}
              cx={px}
              cy={py}
              r={3.5}
              fill="rgba(139,92,246,0.8)"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + i * 0.05 }}
            />
          );
        })}

        {/* Others data points */}
        {MIRROR_AXES.map((axis, i) => {
          const [px, py] = getPoint(i, mirror.othersPerception[axis.key]);
          return (
            <motion.circle
              key={`others-${i}`}
              cx={px}
              cy={py}
              r={3}
              fill="rgba(236,72,153,0.7)"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.7 + i * 0.05 }}
            />
          );
        })}

        {/* Labels */}
        {MIRROR_AXES.map((axis, i) => {
          const pos = getLabelPos(i);
          return (
            <text
              key={`label-${i}`}
              x={pos.x}
              y={pos.y}
              textAnchor={pos.anchor}
              fill="rgba(58,64,88,0.85)"
              fontSize={13}
              fontWeight={600}
            >
              {axis.label}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-center gap-8 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-6 rounded-full bg-violet-500/60" />
          <span className="text-slate-500">自己認識</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-6 rounded-full"
            style={{
              background: "rgba(236,72,153,0.5)",
              backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 3px, white 3px, white 5px)",
            }}
          />
          <span className="text-slate-500">他者からの印象</span>
        </div>
      </div>

      {/* Gap insights */}
      {!hideGaps && mirror.gaps.filter((g) => g.significance !== "low").length > 0 && (
        <div className="mt-5 space-y-2">
          {mirror.gaps
            .filter((g) => g.significance !== "low")
            .slice(0, 3)
            .map((gap) => (
              <div
                key={gap.dimension}
                className="flex items-center gap-3 rounded-[20px] bg-amber-50/50 px-5 py-4 border border-amber-100/40"
              >
                <span className="text-lg">
                  {gap.significance === "high" ? "⚡" : "💡"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-700">
                    {gap.dimensionLabel}
                  </div>
                  <div className="text-xs text-slate-500">{gap.gapLabel}</div>
                </div>
                <span className="text-xs font-bold text-amber-600">
                  {Math.abs(Math.round(gap.gap * 100))}pt差
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Gap score summary */}
      {!hideGaps && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="text-sm text-slate-400">一致度</span>
          <span className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-1.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(139,92,246,0.2)]">
            {mirror.gapScore}/100
          </span>
        </div>
      )}
    </div>
  );
}
