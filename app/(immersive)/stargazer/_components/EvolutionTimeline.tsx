// app/stargazer/_components/EvolutionTimeline.tsx
// 進化タイムライン — カスタムSVG折れ線グラフ + Framer Motion
"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import { hapticLight } from "@/lib/rendezvous/haptics";
import { getAxisLabels } from "@/lib/stargazer/traitAxes";

/** 軸IDを日本語の短縮ラベルに変換 */
function axisToJapanese(axisId: string): string {
  const labels = getAxisLabels(axisId as never);
  if (!labels) return axisId;
  // "ゆっくり距離を縮める" ↔ "早く距離を縮める" → "距離感"のように短縮
  const left = labels.left;
  const right = labels.right;
  // 共通部分を抽出するか、左ラベルの最初の数文字を使用
  if (left.length <= 8) return left;
  return `${left.slice(0, 6)}…`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineEvent {
  type: "contradiction" | "milestone" | "shift";
  label: string;
}

interface HistoryEntry {
  date: string;
  scores: Record<string, number>;
  events?: TimelineEvent[];
}

export interface EvolutionTimelineProps {
  /** 日付ごとの軸スコア履歴 */
  history: HistoryEntry[];
  /** 表示する軸（省略時は全軸） */
  visibleAxes?: string[];
  /** コンパクトモード */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AXIS_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F59E0B", // amber
  "#10B981", // emerald
  "#6366F1", // indigo
  "#EF4444", // red
  "#14B8A6", // teal
  "#F97316", // orange
  "#A855F7", // purple
];

const EVENT_ICONS: Record<TimelineEvent["type"], { color: string; symbol: string }> = {
  contradiction: { color: "#EF4444", symbol: "!" },
  milestone:     { color: "#10B981", symbol: "\u2605" },
  shift:         { color: "#F59E0B", symbol: "\u2194" },
};

const EVENT_LABELS: Record<TimelineEvent["type"], string> = {
  contradiction: "\u77DB\u76FE\u767A\u898B",
  milestone:     "\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3",
  shift:         "\u5927\u304D\u306A\u5909\u5316",
};

type RangeKey = "7d" | "30d" | "all";
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d",  label: "7\u65E5" },
  { key: "30d", label: "30\u65E5" },
  { key: "all", label: "\u5168\u671F\u9593" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAxisColor(axis: string, index: number): string {
  if (!AXIS_COLORS[axis]) {
    AXIS_COLORS[axis] = COLOR_PALETTE[index % COLOR_PALETTE.length];
  }
  return AXIS_COLORS[axis];
}

/** Catmull-Rom spline for smooth curves (reused pattern from TrendSparkline) */
function catmullRomPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0][0]},${points[0][1]} L ${points[1][0]},${points[1][1]}`;
  }

  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const tension = 6;
    const cp1x = p1[0] + (p2[0] - p0[0]) / tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) / tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) / tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) / tension;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EvolutionTimeline({
  history,
  visibleAxes,
  compact = false,
}: EvolutionTimelineProps) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hiddenAxes, setHiddenAxes] = useState<Set<string>>(new Set());
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // -- Filter history by range ---
  const filtered = useMemo(() => {
    if (history.length === 0) return [];
    const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (range === "all") return sorted;

    const days = range === "7d" ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffMs = cutoff.getTime();
    return sorted.filter((h) => new Date(h.date).getTime() >= cutoffMs);
  }, [history, range]);

  // -- Derive axes ---
  const allAxes = useMemo(() => {
    const set = new Set<string>();
    for (const entry of history) {
      for (const key of Object.keys(entry.scores)) set.add(key);
    }
    const axes = Array.from(set);
    if (visibleAxes) return axes.filter((a) => visibleAxes.includes(a));
    return axes;
  }, [history, visibleAxes]);

  const activeAxes = useMemo(
    () => allAxes.filter((a) => !hiddenAxes.has(a)),
    [allAxes, hiddenAxes],
  );

  // -- Dimensions ---
  const width = compact ? 340 : 600;
  const height = compact ? 180 : 280;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 36;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  // -- Scales ---
  const { xScale, yScale, gridYValues, xLabelEntries } = useMemo(() => {
    const n = filtered.length;
    const xS = (i: number) =>
      n <= 1 ? paddingLeft + chartW / 2 : paddingLeft + (i / (n - 1)) * chartW;

    // Y: 0-100 fixed range for personality scores
    const yS = (v: number) => paddingTop + chartH - (v / 100) * chartH;

    // Grid lines
    const gridY = [0, 25, 50, 75, 100];

    // X labels: pick up to ~6 evenly distributed
    const maxLabels = compact ? 4 : 7;
    const step = Math.max(1, Math.ceil(n / maxLabels));
    const labels: { idx: number; label: string }[] = [];
    for (let i = 0; i < n; i += step) {
      labels.push({ idx: i, label: formatDate(filtered[i].date) });
    }
    // always include last
    if (n > 0 && (labels.length === 0 || labels[labels.length - 1].idx !== n - 1)) {
      labels.push({ idx: n - 1, label: formatDate(filtered[n - 1].date) });
    }

    return { xScale: xS, yScale: yS, gridYValues: gridY, xLabelEntries: labels };
  }, [filtered, chartW, chartH, paddingLeft, paddingTop, compact]);

  // -- Line paths per axis ---
  const linePaths = useMemo(() => {
    const result: Record<string, { path: string; points: [number, number][] }> = {};
    for (const axis of activeAxes) {
      const pts: [number, number][] = filtered.map((entry, i) => [
        xScale(i),
        yScale(entry.scores[axis] ?? 0),
      ]);
      result[axis] = { path: catmullRomPath(pts), points: pts };
    }
    return result;
  }, [filtered, activeAxes, xScale, yScale]);

  // -- Events with positions ---
  const eventMarkers = useMemo(() => {
    const markers: Array<{
      x: number;
      y: number;
      event: TimelineEvent;
      dateLabel: string;
    }> = [];
    filtered.forEach((entry, i) => {
      if (!entry.events?.length) return;
      entry.events.forEach((ev) => {
        markers.push({
          x: xScale(i),
          y: paddingTop - 2,
          event: ev,
          dateLabel: formatDateFull(entry.date),
        });
      });
    });
    return markers;
  }, [filtered, xScale, paddingTop]);

  // -- Touch / hover interaction ---
  const getIdxFromClientX = useCallback(
    (clientX: number): number | null => {
      if (!svgRef.current || filtered.length === 0) return null;
      const rect = svgRef.current.getBoundingClientRect();
      const relX = clientX - rect.left;
      const ratio = (relX - (paddingLeft * rect.width) / width) / ((chartW * rect.width) / width);
      const idx = Math.round(ratio * (filtered.length - 1));
      if (idx < 0 || idx >= filtered.length) return null;
      return idx;
    },
    [filtered, paddingLeft, chartW, width],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const idx = getIdxFromClientX(e.clientX);
      setHoveredIdx(idx);
    },
    [getIdxFromClientX],
  );

  const handlePointerLeave = useCallback(() => {
    setHoveredIdx(null);
  }, []);

  // -- Toggle axis visibility ---
  const toggleAxis = (axis: string) => {
    setHiddenAxes((prev) => {
      const next = new Set(prev);
      if (next.has(axis)) next.delete(axis);
      else next.add(axis);
      return next;
    });
  };

  // -- Unique id for SVG defs ---
  const uid = useMemo(() => `evo-${Math.random().toString(36).slice(2, 8)}`, []);

  // -- Empty state ---
  if (history.length === 0) {
    return (
      <GlassCard padding="md">
        <p className="text-center text-slate-400 text-sm py-8">
          \u307E\u3060\u89B3\u6E2C\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding={compact ? "sm" : "md"} hoverEffect={false}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-slate-800">
          {"\u9032\u5316\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3"}
        </h3>

        {/* Range selector */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/80 border border-slate-200/50">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { setRange(opt.key); hapticLight(); }}
              aria-pressed={range === opt.key}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${
                range === opt.key
                  ? "bg-white text-violet-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Chart */}
      <div
        ref={containerRef}
        className="relative overflow-x-auto"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={compact ? 180 : 280}
          className="select-none"
          role="img"
          aria-label="進化タイムライン: 性格軸スコアの変遷"
          style={{ minWidth: compact ? 340 : 400, touchAction: "pan-y" }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onTouchMove={(e) => {
            const touch = e.touches[0];
            if (touch && svgRef.current) {
              const rect = svgRef.current.getBoundingClientRect();
              const x = touch.clientX - rect.left;
              const ratio = x / rect.width;
              const svgX = ratio * width;
              if (filtered.length > 0) {
                const pw = width - paddingLeft - paddingRight;
                const idx = Math.round(((svgX - paddingLeft) / pw) * (filtered.length - 1));
                const clamped = Math.max(0, Math.min(filtered.length - 1, idx));
                if (clamped !== hoveredIdx) hapticLight();
                setHoveredIdx(clamped);
              }
            }
          }}
          onTouchEnd={() => setHoveredIdx(null)}
        >
          <defs>
            {/* Area gradient per axis */}
            {activeAxes.map((axis, ai) => {
              const c = getAxisColor(axis, allAxes.indexOf(axis));
              return (
                <linearGradient
                  key={`${uid}-grad-${axis}`}
                  id={`${uid}-grad-${axis}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={c} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={c} stopOpacity={0.0} />
                </linearGradient>
              );
            })}
            {/* Glow filter */}
            <filter id={`${uid}-glow`}>
              <feGaussianBlur stdDeviation={2} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Shadow */}
            <filter id={`${uid}-shadow`}>
              <feDropShadow dx={0} dy={1} stdDeviation={3} floodOpacity={0.12} />
            </filter>
          </defs>

          {/* Grid horizontal lines */}
          {gridYValues.map((v) => (
            <g key={`grid-${v}`}>
              <line
                x1={paddingLeft}
                y1={yScale(v)}
                x2={paddingLeft + chartW}
                y2={yScale(v)}
                stroke="rgba(148,163,184,0.15)"
                strokeWidth={1}
              />
              <text
                x={paddingLeft - 6}
                y={yScale(v) + 4}
                textAnchor="end"
                fill="rgba(148,163,184,0.5)"
                fontSize={10}
                fontFamily="var(--font-mono, monospace)"
              >
                {v}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {xLabelEntries.map(({ idx, label }) => (
            <text
              key={`xlabel-${idx}`}
              x={xScale(idx)}
              y={height - 6}
              textAnchor="middle"
              fill="rgba(148,163,184,0.6)"
              fontSize={10}
              fontFamily="var(--font-body, system-ui)"
            >
              {label}
            </text>
          ))}

          {/* Area fills under each line */}
          {activeAxes.map((axis) => {
            const line = linePaths[axis];
            if (!line || line.points.length < 2) return null;
            const first = line.points[0];
            const last = line.points[line.points.length - 1];
            const areaPath = `${line.path} L ${last[0]},${paddingTop + chartH} L ${first[0]},${paddingTop + chartH} Z`;
            return (
              <motion.path
                key={`area-${axis}`}
                d={areaPath}
                fill={`url(#${uid}-grad-${axis})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.3 }}
              />
            );
          })}

          {/* Line paths with draw animation */}
          {activeAxes.map((axis, ai) => {
            const line = linePaths[axis];
            if (!line || line.points.length < 2) return null;
            const c = getAxisColor(axis, allAxes.indexOf(axis));
            return (
              <motion.path
                key={`line-${axis}`}
                d={line.path}
                fill="none"
                stroke={c}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#${uid}-glow)`}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  pathLength: { duration: 1.2, ease: "easeInOut", delay: ai * 0.15 },
                  opacity: { duration: 0.18, delay: ai * 0.15 },
                }}
              />
            );
          })}

          {/* Data point dots (last point highlighted) */}
          {activeAxes.map((axis, ai) => {
            const line = linePaths[axis];
            if (!line || line.points.length === 0) return null;
            const c = getAxisColor(axis, allAxes.indexOf(axis));
            const lastPt = line.points[line.points.length - 1];
            return (
              <motion.circle
                key={`dot-last-${axis}`}
                cx={lastPt[0]}
                cy={lastPt[1]}
                r={4}
                fill={c}
                stroke="white"
                strokeWidth={2}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 1.0 + ai * 0.1, type: "spring", stiffness: 300 }}
              />
            );
          })}

          {/* Event markers */}
          {eventMarkers.map((m, i) => {
            const info = EVENT_ICONS[m.event.type];
            return (
              <g key={`event-${i}`}>
                {/* Vertical indicator line */}
                <line
                  x1={m.x}
                  y1={paddingTop}
                  x2={m.x}
                  y2={paddingTop + chartH}
                  stroke={info.color}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  opacity={0.3}
                />
                {/* Pulse ring */}
                <motion.circle
                  cx={m.x}
                  cy={m.y}
                  r={8}
                  fill="none"
                  stroke={info.color}
                  strokeWidth={1}
                  animate={{ r: [7, 12, 7], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}
                />
                {/* Event dot */}
                <motion.circle
                  cx={m.x}
                  cy={m.y}
                  r={8}
                  fill={info.color}
                  opacity={0.9}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 1.2 + i * 0.1, type: "spring", stiffness: 400 }}
                />
                <text
                  x={m.x}
                  y={m.y + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={9}
                  fontWeight={700}
                >
                  {info.symbol}
                </text>
              </g>
            );
          })}

          {/* Hover crosshair + tooltip */}
          <AnimatePresence>
            {hoveredIdx !== null && filtered[hoveredIdx] && (
              <motion.g
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {/* Vertical crosshair */}
                <line
                  x1={xScale(hoveredIdx)}
                  y1={paddingTop}
                  x2={xScale(hoveredIdx)}
                  y2={paddingTop + chartH}
                  stroke="rgba(100,116,139,0.25)"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />

                {/* Dots on each axis at this index */}
                {activeAxes.map((axis) => {
                  const c = getAxisColor(axis, allAxes.indexOf(axis));
                  const val = filtered[hoveredIdx].scores[axis] ?? 0;
                  const y = yScale(val);
                  return (
                    <circle
                      key={`hover-dot-${axis}`}
                      cx={xScale(hoveredIdx)}
                      cy={y}
                      r={5}
                      fill={c}
                      stroke="white"
                      strokeWidth={2}
                    />
                  );
                })}

                {/* Tooltip card */}
                {(() => {
                  const entry = filtered[hoveredIdx];
                  const tooltipW = 140;
                  const lineH = 16;
                  const headerH = 20;
                  const eventsH = entry.events?.length ? entry.events.length * lineH + 4 : 0;
                  const tooltipH = headerH + activeAxes.length * lineH + eventsH + 16;
                  const rawX = xScale(hoveredIdx);
                  // Flip tooltip if too close to right edge
                  const tx = rawX + tooltipW + 10 > width ? rawX - tooltipW - 10 : rawX + 10;
                  const ty = Math.max(4, Math.min(paddingTop, height - tooltipH - 4));

                  return (
                    <g>
                      <rect
                        x={tx}
                        y={ty}
                        width={tooltipW}
                        height={tooltipH}
                        rx={12}
                        fill="rgba(255,255,255,0.92)"
                        stroke="rgba(148,163,184,0.2)"
                        strokeWidth={1}
                        filter={`url(#${uid}-shadow)`}
                      />
                      {/* Date header */}
                      <text
                        x={tx + 10}
                        y={ty + 16}
                        fill="rgba(51,65,85,0.9)"
                        fontSize={11}
                        fontWeight={700}
                      >
                        {formatDateFull(entry.date)}
                      </text>

                      {/* Axis scores */}
                      {activeAxes.map((axis, ai) => {
                        const c = getAxisColor(axis, allAxes.indexOf(axis));
                        const val = entry.scores[axis] ?? 0;
                        return (
                          <g key={`tt-${axis}`}>
                            <circle
                              cx={tx + 14}
                              cy={ty + headerH + 12 + ai * lineH}
                              r={3}
                              fill={c}
                            />
                            <text
                              x={tx + 22}
                              y={ty + headerH + 15 + ai * lineH}
                              fill="rgba(71,85,105,0.85)"
                              fontSize={10}
                              fontWeight={500}
                            >
                              {axisToJapanese(axis)}
                            </text>
                            <text
                              x={tx + tooltipW - 10}
                              y={ty + headerH + 15 + ai * lineH}
                              textAnchor="end"
                              fill="rgba(51,65,85,0.9)"
                              fontSize={10}
                              fontWeight={700}
                              fontFamily="var(--font-mono, monospace)"
                            >
                              {typeof val === "number" ? val.toFixed(2) : val}
                            </text>
                          </g>
                        );
                      })}

                      {/* Events */}
                      {entry.events?.map((ev, ei) => {
                        const info = EVENT_ICONS[ev.type];
                        const baseY = ty + headerH + 12 + activeAxes.length * lineH + 4 + ei * lineH;
                        return (
                          <g key={`tt-ev-${ei}`}>
                            <circle cx={tx + 14} cy={baseY} r={3} fill={info.color} />
                            <text
                              x={tx + 22}
                              y={baseY + 3}
                              fill={info.color}
                              fontSize={9}
                              fontWeight={600}
                            >
                              {ev.label}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}
              </motion.g>
            )}
          </AnimatePresence>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
        {allAxes.map((axis, ai) => {
          const c = getAxisColor(axis, ai);
          const isHidden = hiddenAxes.has(axis);
          return (
            <button
              key={axis}
              onClick={() => toggleAxis(axis)}
              className={`flex items-center gap-1.5 text-xs font-medium transition-all duration-200 ${
                isHidden ? "opacity-35 line-through" : "opacity-100"
              }`}
            >
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: c }}
              />
              <span className="text-slate-600">{axisToJapanese(axis)}</span>
            </button>
          );
        })}

        {/* Event legend */}
        {eventMarkers.length > 0 && (
          <span className="ml-2 flex items-center gap-3">
            {(["contradiction", "milestone", "shift"] as const).map((type) => {
              const hasType = eventMarkers.some((m) => m.event.type === type);
              if (!hasType) return null;
              const info = EVENT_ICONS[type];
              return (
                <span key={type} className="flex items-center gap-1 text-[10px] text-slate-400">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: info.color }}
                  />
                  {EVENT_LABELS[type]}
                </span>
              );
            })}
          </span>
        )}
      </div>
    </GlassCard>
  );
}
