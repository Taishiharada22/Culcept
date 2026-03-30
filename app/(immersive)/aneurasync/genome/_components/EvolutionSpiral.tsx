"use client";

import { motion } from "framer-motion";
import type { EvolutionTimeline, EvolutionSnapshot } from "@/lib/aneurasync/personaGenome";

interface EvolutionSpiralProps {
  evolution: EvolutionTimeline;
}

/**
 * Archimedean spiral timeline — each point on the spiral represents a weekly snapshot.
 * Constellation changes are highlighted with larger markers.
 */
export default function EvolutionSpiral({ evolution }: EvolutionSpiralProps) {
  const { snapshots, cards, stability, overallDrift, currentStreak } = evolution;
  const total = snapshots.length;

  // SVG dimensions
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;

  // Spiral parameters
  const a = 22; // starting radius
  const b = 7; // growth per radian
  const turnsPerSnapshot = 0.5; // half turn per snapshot

  function spiralPoint(index: number): { x: number; y: number } {
    const theta = index * Math.PI * turnsPerSnapshot;
    const r = a + b * theta;
    return {
      x: cx + r * Math.cos(theta - Math.PI / 2),
      y: cy + r * Math.sin(theta - Math.PI / 2),
    };
  }

  // Build spiral SVG path with quadratic curves for smoothness
  const pathSegments = 200;
  const maxTheta = total > 0 ? total * Math.PI * turnsPerSnapshot : Math.PI * 3;
  const spiralPathD = Array.from({ length: pathSegments + 1 }, (_, i) => {
    const theta = (i / pathSegments) * maxTheta;
    const r = a + b * theta;
    const x = cx + r * Math.cos(theta - Math.PI / 2);
    const y = cy + r * Math.sin(theta - Math.PI / 2);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  // Compute path length approximation for dash animation
  const approxPathLen = (() => {
    let len = 0;
    for (let i = 1; i <= pathSegments; i++) {
      const t0 = ((i - 1) / pathSegments) * maxTheta;
      const t1 = (i / pathSegments) * maxTheta;
      const r0 = a + b * t0;
      const r1 = a + b * t1;
      const x0 = r0 * Math.cos(t0), y0 = r0 * Math.sin(t0);
      const x1 = r1 * Math.cos(t1), y1 = r1 * Math.sin(t1);
      len += Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
    }
    return Math.ceil(len);
  })();

  return (
    <div>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block w-full"
        style={{ maxWidth: size }}
        role="img"
        aria-label="パーソナリティの進化スパイラル"
      >
        <defs>
          <linearGradient id="evo-spiral-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#ec4899" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.7" />
          </linearGradient>
          <filter id="evo-glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background spiral track */}
        <path
          d={spiralPathD}
          fill="none"
          stroke="rgba(148,163,184,0.1)"
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Animated colored spiral */}
        <path
          d={spiralPathD}
          fill="none"
          stroke="url(#evo-spiral-grad)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={approxPathLen}
          strokeDashoffset={approxPathLen}
          style={{
            animation: `genome-spiral-draw 2.5s cubic-bezier(0.22, 1, 0.36, 1) forwards`,
          }}
        />

        {/* Snapshot markers */}
        {snapshots.map((snap, i) => {
          const { x, y } = spiralPoint(i);
          const card = i > 0 ? cards[i - 1] : null;
          const archetypeChanged = card?.archetypeChanged ?? false;
          const hasHighDrift = snap.driftIndex > 2;

          return (
            <motion.g
              key={snap.capturedAt}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + i * 0.08, type: "spring", stiffness: 300, damping: 25 }}
            >
              {/* Glow for archetype changes */}
              {archetypeChanged && (
                <circle
                  cx={x}
                  cy={y}
                  r={12}
                  fill="none"
                  stroke="rgba(236,72,153,0.3)"
                  strokeWidth={1.5}
                  style={{ animation: "genome-breathe 3s ease-in-out infinite" }}
                />
              )}

              {/* Main marker */}
              <circle
                cx={x}
                cy={y}
                r={archetypeChanged ? 5 : hasHighDrift ? 4 : 3}
                fill={
                  archetypeChanged
                    ? "#ec4899"
                    : hasHighDrift
                      ? "#8b5cf6"
                      : "rgba(139,92,246,0.6)"
                }
                filter={archetypeChanged ? "url(#evo-glow)" : undefined}
              />

              {/* Branch lines for changed dimensions */}
              {card?.changedDimensions.slice(0, 2).map((dim, j) => {
                const angle = j === 0 ? -0.6 : 0.6;
                const branchLen = 10 + Math.abs(dim.delta) * 8;
                return (
                  <line
                    key={dim.dimension}
                    x1={x}
                    y1={y}
                    x2={x + Math.cos(angle) * branchLen}
                    y2={y + Math.sin(angle) * branchLen}
                    stroke={
                      dim.direction === "increased"
                        ? "rgba(139,92,246,0.3)"
                        : "rgba(236,72,153,0.3)"
                    }
                    strokeWidth={1}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Constellation change label */}
              {archetypeChanged && card && (
                <text
                  x={x + 10}
                  y={y - 8}
                  fontSize={9}
                  fill="rgba(236,72,153,0.8)"
                  fontWeight={600}
                >
                  {card.toSnapshot.archetypeLabel ?? ""}
                </text>
              )}

              {/* Week label for every 4th snapshot */}
              {i % 4 === 0 && (
                <text
                  x={x + 8}
                  y={y + 4}
                  fontSize={8}
                  fill="rgba(100,110,130,0.4)"
                >
                  W{i + 1}
                </text>
              )}
            </motion.g>
          );
        })}

        {/* Center label */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill="rgba(58,64,88,0.6)"
        >
          {total > 0 ? `${total}週` : ""}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fontSize={9}
          fill="rgba(148,163,184,0.6)"
        >
          {total > 0 ? "の観測" : ""}
        </text>
      </svg>

      {/* Stats footer */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <StatCard
          label="安定度"
          value={`${Math.round(stability * 100)}%`}
          color={stability > 0.7 ? "#14b8a6" : stability > 0.4 ? "#f59e0b" : "#ef4444"}
        />
        <StatCard
          label="全体ドリフト"
          value={overallDrift.toFixed(1)}
          color="#8b5cf6"
        />
        <StatCard
          label="連続期間"
          value={`${currentStreak}週`}
          color="#6366f1"
        />
      </div>

      {/* Recent changes */}
      {cards.length > 0 && (
        <div className="mt-5 space-y-2">
          {cards.slice(-3).reverse().map((card, idx) => (
            <div
              key={`${card.period}-${idx}`}
              className="rounded-[22px] border border-white/85 bg-white/70 px-5 py-4 shadow-sm backdrop-blur-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  {card.periodLabel}
                </span>
                {card.archetypeChanged && (
                  <span className="rounded-full bg-pink-50 px-3 py-1 text-[11px] font-bold text-pink-500">
                    タイプ変化
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">{card.summary}</p>
              {card.changedDimensions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {card.changedDimensions.slice(0, 3).map((dim) => (
                    <span
                      key={dim.dimension}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500"
                    >
                      {dim.label} {dim.direction === "increased" ? "↑" : "↓"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/85 bg-white/70 p-4 text-center shadow-sm backdrop-blur-sm">
      <div className="text-xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] font-medium text-slate-400">{label}</div>
    </div>
  );
}
