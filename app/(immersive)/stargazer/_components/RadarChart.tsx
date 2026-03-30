// app/stargazer/_components/RadarChart.tsx
// カスタムSVGレーダーチャート — ライブラリ不要
// Enhanced: animated transitions, ghost overlay, hover interactions, pulse on changes,
//           responsive maxAxes, type average ghost line
"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { RadarDimension } from "@/lib/stargazer/radarAggregation";

interface RadarChartProps {
  dimensions: RadarDimension[];
  size?: number;
  color?: string;
  strokeColor?: string;
  overlayDimensions?: RadarDimension[];
  overlayColor?: string;
  animated?: boolean;
  /** Ghost overlay showing past state (dashed outline) */
  ghostDimensions?: RadarDimension[];
  ghostColor?: string;
  ghostLabel?: string;
  /** Indices of axes with recent changes — shown with pulse effect */
  changedAxes?: number[];
  /** Enable hover interactions showing exact values */
  interactive?: boolean;
  /** Max number of axes to show (sorted by absolute score). Set for mobile. */
  maxAxes?: number;
  /** Optional average scores for the user's type — draws a ghost polygon */
  averageScores?: Record<string, number>;
  /** Label for the average ghost line legend */
  averageLabel?: string;
}

export default function RadarChart({
  dimensions,
  size = 280,
  color = "rgba(201,169,110,0.15)",
  strokeColor = "rgba(201,169,110,0.6)",
  overlayDimensions,
  overlayColor = "rgba(96,165,250,0.4)",
  animated = true,
  ghostDimensions,
  ghostColor = "rgba(160,170,200,0.35)",
  ghostLabel = "以前",
  changedAxes,
  interactive = true,
  maxAxes,
  averageScores,
  averageLabel = "タイプ平均",
}: RadarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showAllAxes, setShowAllAxes] = useState(false);
  const padding = 58;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;

  // Apply maxAxes filtering — sort by absolute score, keep top N
  const { visibleDimensions, visibleGhostDimensions, visibleOverlayDimensions, isTruncated, visibleChangedAxes, averageDimensions } = useMemo(() => {
    let visDims = dimensions;
    let visGhost = ghostDimensions;
    let visOverlay = overlayDimensions;
    let visChanged = changedAxes;
    let truncated = false;

    if (maxAxes && maxAxes < dimensions.length && !showAllAxes) {
      // Create indexed pairs, sort by absolute score descending, take top N
      const indexed = dimensions.map((d, i) => ({ dim: d, origIdx: i }));
      indexed.sort((a, b) => Math.abs(b.dim.score) - Math.abs(a.dim.score));
      const topN = indexed.slice(0, maxAxes);
      // Restore original order for consistent display
      topN.sort((a, b) => a.origIdx - b.origIdx);

      const origIndices = topN.map((t) => t.origIdx);
      visDims = topN.map((t) => t.dim);
      visGhost = ghostDimensions
        ? origIndices.map((oi) => ghostDimensions[oi]).filter(Boolean)
        : undefined;
      visOverlay = overlayDimensions
        ? origIndices.map((oi) => overlayDimensions[oi]).filter(Boolean)
        : undefined;
      visChanged = changedAxes
        ? changedAxes
            .map((ci) => origIndices.indexOf(ci))
            .filter((i) => i >= 0)
        : undefined;
      truncated = true;
    }

    // Build average dimensions from averageScores prop
    let avgDims: RadarDimension[] | undefined;
    if (averageScores) {
      avgDims = visDims.map((d) => ({
        ...d,
        score: averageScores[d.key] ?? d.score,
      }));
    }

    return {
      visibleDimensions: visDims,
      visibleGhostDimensions: visGhost,
      visibleOverlayDimensions: visOverlay,
      isTruncated: truncated,
      visibleChangedAxes: visChanged,
      averageDimensions: avgDims,
    };
  }, [dimensions, ghostDimensions, overlayDimensions, changedAxes, maxAxes, showAllAxes, averageScores]);

  const total = visibleDimensions.length;

  // Calculate point positions
  function getPoint(index: number, score: number): [number, number] {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const r = radius * (score / 100);
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  // Generate polygon points string
  function getPolygonPoints(dims: RadarDimension[]): string {
    return dims
      .map((d, i) => {
        const [x, y] = getPoint(i, d.score);
        return `${x},${y}`;
      })
      .join(" ");
  }

  // Grid circles
  const gridLevels = [33, 66, 100];

  // Grid circle paths
  function getGridPath(level: number): string {
    const points = Array.from({ length: total }, (_, i) => {
      const [x, y] = getPoint(i, level);
      return `${x},${y}`;
    });
    return `M ${points.join(" L ")} Z`;
  }

  // Axis lines from center to edge
  function getAxisLine(index: number): string {
    const [x, y] = getPoint(index, 100);
    return `M ${cx},${cy} L ${x},${y}`;
  }

  // Label positions (slightly outside the chart)
  function getLabelPos(index: number): { x: number; y: number; anchor: "start" | "middle" | "end" } {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const labelR = radius + 28;
    const x = cx + labelR * Math.cos(angle);
    const y = cy + labelR * Math.sin(angle);

    // Text anchor based on position
    let anchor: "start" | "middle" | "end" = "middle";
    if (Math.cos(angle) > 0.3) anchor = "start";
    else if (Math.cos(angle) < -0.3) anchor = "end";

    return { x, y: y + 4, anchor };
  }

  const changedSet = useMemo(() => new Set(visibleChangedAxes ?? []), [visibleChangedAxes]);

  const mainPoints = getPolygonPoints(visibleDimensions);
  const overlayPoints = visibleOverlayDimensions
    ? getPolygonPoints(visibleOverlayDimensions)
    : null;
  const ghostPoints = visibleGhostDimensions
    ? getPolygonPoints(visibleGhostDimensions)
    : null;
  const averagePoints = averageDimensions
    ? getPolygonPoints(averageDimensions)
    : null;

  const handleToggleAllAxes = useCallback(() => setShowAllAxes((v) => !v), []);

  // Unique ID for gradient defs
  const uid = useMemo(() => `rc-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div>
    <svg
      viewBox={`${-padding} ${-padding} ${size + padding * 2} ${size + padding * 2}`}
      width={size}
      height={size}
      className="mx-auto"
      style={{ overflow: "visible" }}
    >
      <defs>
        <radialGradient id={`${uid}-fill`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.18} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.04} />
        </radialGradient>
        {/* Shadow filter for hover tooltip */}
        <filter id={`${uid}-shadow`}>
          <feDropShadow dx={0} dy={1} stdDeviation={3} floodOpacity={0.1} />
        </filter>
      </defs>

      {/* Grid circles */}
      {gridLevels.map((level) => (
        <path
          key={level}
          d={getGridPath(level)}
          fill="none"
          stroke="rgba(160,170,200,0.12)"
          strokeWidth={1}
        />
      ))}

      {/* Grid scale labels */}
      {[
        { level: 33, label: "弱" },
        { level: 66, label: "中" },
        { level: 100, label: "強" },
      ].map(({ level, label }) => {
        const y = cy - radius * (level / 100);
        return (
          <text
            key={`scale-${level}`}
            x={cx + 3}
            y={y - 3}
            textAnchor="start"
            fill="rgba(140,150,180,0.45)"
            fontSize={8}
            fontFamily="var(--font-mono), monospace"
          >
            {label}
          </text>
        );
      })}

      {/* Axis lines */}
      {visibleDimensions.map((_, i) => (
        <path
          key={`axis-${i}`}
          d={getAxisLine(i)}
          stroke={hoveredIndex === i ? "rgba(160,170,200,0.2)" : "rgba(160,170,200,0.08)"}
          strokeWidth={hoveredIndex === i ? 1.5 : 1}
          style={{ transition: "stroke 0.2s, stroke-width 0.2s" }}
        />
      ))}

      {/* Ghost overlay (past state) */}
      {ghostPoints && (
        <motion.polygon
          points={ghostPoints}
          fill="none"
          stroke={ghostColor}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeDasharray="5 4"
          initial={animated ? { opacity: 0 } : undefined}
          animate={{ opacity: 0.6 }}
          transition={{ duration: 0.25, delay: 0.3 }}
        />
      )}

      {/* Main data polygon */}
      {animated ? (
        <motion.polygon
          points={mainPoints}
          fill={`url(#${uid}-fill)`}
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeLinejoin="round"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
      ) : (
        <polygon
          points={mainPoints}
          fill={`url(#${uid}-fill)`}
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}

      {/* Overlay polygon (partner comparison) */}
      {overlayPoints && (
        <motion.polygon
          points={overlayPoints}
          fill={overlayColor.replace(/[\d.]+\)$/, "0.08)")}
          stroke={overlayColor}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeDasharray="4 3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.22, delay: 0.4 }}
        />
      )}

      {/* Average type ghost polygon */}
      {averagePoints && (
        <motion.polygon
          points={averagePoints}
          fill="rgba(139,92,246,0.04)"
          stroke="rgba(139,92,246,0.35)"
          strokeWidth={1.2}
          strokeLinejoin="round"
          strokeDasharray="3 3"
          initial={animated ? { opacity: 0 } : undefined}
          animate={{ opacity: 0.15 }}
          transition={{ duration: 0.25, delay: 0.35 }}
        />
      )}

      {/* Data points */}
      {visibleDimensions.map((d, i) => {
        const [px, py] = getPoint(i, d.score);
        const isChanged = changedSet.has(i);
        const isHovered = hoveredIndex === i;

        return (
          <g
            key={`point-${i}`}
            onMouseEnter={interactive ? () => setHoveredIndex(i) : undefined}
            onMouseLeave={interactive ? () => setHoveredIndex(null) : undefined}
            onTouchStart={interactive ? () => setHoveredIndex(i) : undefined}
            onTouchEnd={interactive ? () => setHoveredIndex(null) : undefined}
            style={interactive ? { cursor: "pointer" } : undefined}
          >
            {/* Pulse ring for recently changed axes */}
            {isChanged && (
              <motion.circle
                cx={px}
                cy={py}
                r={6}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1}
                animate={{ r: [5, 10, 5], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}

            <motion.circle
              cx={px}
              cy={py}
              r={isHovered ? 5 : 3}
              fill={isChanged ? strokeColor : (isHovered ? strokeColor : strokeColor)}
              stroke={isHovered ? "white" : "none"}
              strokeWidth={isHovered ? 2 : 0}
              initial={animated ? { opacity: 0, scale: 0 } : undefined}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + i * 0.05, type: "spring", stiffness: 200 }}
            />

            {/* Invisible larger hit area for touch/hover */}
            {interactive && (
              <circle
                cx={px}
                cy={py}
                r={16}
                fill="transparent"
              />
            )}
          </g>
        );
      })}

      {/* Labels */}
      {visibleDimensions.map((d, i) => {
        const pos = getLabelPos(i);
        const isHovered = hoveredIndex === i;
        const isChanged = changedSet.has(i);
        return (
          <text
            key={`label-${i}`}
            x={pos.x}
            y={pos.y}
            textAnchor={pos.anchor}
            fill={isHovered ? strokeColor : "rgba(58,64,88,0.88)"}
            fontSize={isHovered ? 13 : 12.5}
            fontWeight={isHovered || isChanged ? 700 : 600}
            fontFamily="var(--font-body), system-ui, sans-serif"
            style={{ transition: "fill 0.2s, font-size 0.2s, font-weight 0.2s" }}
          >
            {d.label}
          </text>
        );
      })}

      {/* Score values (small, near points) — hidden when hovering to avoid overlap */}
      {visibleDimensions.map((d, i) => {
        const [px, py] = getPoint(i, d.score);
        if (d.score < 10) return null;
        if (hoveredIndex === i) return null; // tooltip shows the value instead
        return (
          <text
            key={`score-${i}`}
            x={px}
            y={py - 8}
            textAnchor="middle"
            fill="rgba(124,100,46,0.82)"
            fontSize={10}
            fontFamily="var(--font-mono), monospace"
          >
            {d.score}
          </text>
        );
      })}

      {/* Hover tooltip */}
      <AnimatePresence>
        {interactive && hoveredIndex !== null && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {(() => {
              const d = visibleDimensions[hoveredIndex];
              const ghost = visibleGhostDimensions?.[hoveredIndex];
              const tooltipW = 100;
              const tooltipH = ghost ? 42 : 28;
              const tx = cx - tooltipW / 2;
              const ty = cy - tooltipH / 2;

              return (
                <>
                  <rect
                    x={tx} y={ty}
                    width={tooltipW} height={tooltipH}
                    rx={8}
                    fill="rgba(255,255,255,0.95)"
                    stroke="rgba(160,170,200,0.2)"
                    strokeWidth={1}
                    filter={`url(#${uid}-shadow)`}
                  />
                  <text
                    x={cx} y={cy - (ghost ? 4 : 0)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="rgba(40,40,60,0.88)"
                    fontSize={13}
                    fontWeight={700}
                  >
                    {d.label}: {d.score}
                  </text>
                  {ghost && (
                    <text
                      x={cx} y={cy + 12}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="rgba(140,140,160,0.65)"
                      fontSize={10}
                    >
                      {ghostLabel}: {ghost.score}
                    </text>
                  )}
                </>
              );
            })()}
          </motion.g>
        )}
      </AnimatePresence>

      {/* Legend row */}
      {(visibleGhostDimensions || averageDimensions) && (() => {
        let xCursor = -padding + 8;
        const legendY = size + padding - 8;
        const lineY = legendY - 4;
        const items: React.ReactNode[] = [];

        // "あなた" solid line
        items.push(
          <g key="legend-you">
            <line x1={xCursor} y1={lineY} x2={xCursor + 16} y2={lineY}
              stroke={strokeColor} strokeWidth={1.5} />
            <text x={xCursor + 20} y={legendY} fill="rgba(80,85,100,0.7)" fontSize={10}>
              あなた
            </text>
          </g>
        );
        xCursor += 68;

        // Average dashed line
        if (averageDimensions) {
          items.push(
            <g key="legend-avg">
              <line x1={xCursor} y1={lineY} x2={xCursor + 16} y2={lineY}
                stroke="rgba(139,92,246,0.35)" strokeWidth={1.2} strokeDasharray="3 3" />
              <text x={xCursor + 20} y={legendY} fill="rgba(140,140,160,0.6)" fontSize={10}>
                {averageLabel}
              </text>
            </g>
          );
          xCursor += 80;
        }

        // Ghost dashed line
        if (visibleGhostDimensions) {
          items.push(
            <g key="legend-ghost">
              <line x1={xCursor} y1={lineY} x2={xCursor + 16} y2={lineY}
                stroke={ghostColor} strokeWidth={1.5} strokeDasharray="4 3" />
              <text x={xCursor + 20} y={legendY} fill="rgba(140,140,160,0.6)" fontSize={10}>
                {ghostLabel}
              </text>
            </g>
          );
        }

        return <>{items}</>;
      })()}
    </svg>

    {/* チャートの読み方 */}
    <p className="text-[10px] text-center mt-1" style={{ color: "rgba(120,130,160,0.55)" }}>
      外側ほど傾向が強い ・ 中心 = ニュートラル
    </p>

    {/* Toggle button for truncated/expandable axes */}
    {maxAxes && maxAxes < dimensions.length && (
      <div className="flex justify-center mt-2">
        <motion.button
          onClick={handleToggleAllAxes}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{
            background: "rgba(148,163,184,0.08)",
            color: "rgba(100,105,130,0.7)",
            border: "1px solid rgba(148,163,184,0.12)",
          }}
          whileTap={{ scale: 0.96 }}
        >
          {showAllAxes ? "上位のみ表示" : `全軸を見る (${dimensions.length}軸)`}
        </motion.button>
      </div>
    )}
    </div>
  );
}
