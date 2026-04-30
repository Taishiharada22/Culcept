// app/stargazer/_components/PatternVisualization.tsx
// Spotify Wrapped / Oura Ring 級のパターン可視化コンポーネント群
"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  FadeInView,
} from "@/components/ui/glassmorphism-design";

// ═══════════════════════════════════════════════════════════════════════════
// Shared types
// ═══════════════════════════════════════════════════════════════════════════

interface AxisDataPoint {
  key: string;
  label: string;
  score: number; // 0-100
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. AxisRadarEvolution — "then vs now" レーダー進化
// ═══════════════════════════════════════════════════════════════════════════

export interface AxisRadarEvolutionProps {
  current: AxisDataPoint[];
  past?: AxisDataPoint[];
  pastLabel?: string;
  currentLabel?: string;
  color?: string;
  pastColor?: string;
  size?: number;
  highlightThreshold?: number; // axis change >= this gets highlighted
}

export function AxisRadarEvolution({
  current,
  past,
  pastLabel = "1ヶ月前",
  currentLabel = "現在",
  color = "#8B5CF6",
  pastColor = "rgba(160,170,200,0.5)",
  size = 400,
  highlightThreshold = 15,
}: AxisRadarEvolutionProps) {
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null);
  const padding = 72;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const total = current.length;

  function getPoint(index: number, score: number): [number, number] {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const r = radius * (score / 100);
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function getPolygonPoints(dims: AxisDataPoint[]): string {
    return dims.map((d, i) => getPoint(i, d.score).join(",")).join(" ");
  }

  function getGridPath(level: number): string {
    const points = Array.from({ length: total }, (_, i) => getPoint(i, level).join(","));
    return `M ${points.join(" L ")} Z`;
  }

  // Compute significant changes
  const changes = useMemo(() => {
    if (!past) return [];
    return current.map((c, i) => {
      const p = past[i];
      if (!p) return { index: i, delta: 0, significant: false };
      const delta = c.score - p.score;
      return { index: i, delta, significant: Math.abs(delta) >= highlightThreshold };
    });
  }, [current, past, highlightThreshold]);

  const mainPoints = getPolygonPoints(current);
  const pastPoints = past ? getPolygonPoints(past) : null;

  return (
    <FadeInView>
      <div className="relative">
        <svg
          viewBox={`${-padding} ${-padding} ${size + padding * 2} ${size + padding * 2}`}
          width={size}
          height={size}
          className="mx-auto"
          style={{ overflow: "visible" }}
        >
          <defs>
            <radialGradient id="radar-evo-fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.1} />
            </radialGradient>
          </defs>

          {/* Grid */}
          {[25, 50, 75, 100].map((level) => (
            <path
              key={level}
              d={getGridPath(level)}
              fill="none"
              stroke="rgba(160,170,200,0.22)"
              strokeWidth={level === 50 ? 1.5 : 0.8}
            />
          ))}

          {/* Axis lines */}
          {current.map((_, i) => {
            const [x, y] = getPoint(i, 100);
            return (
              <line
                key={`axis-${i}`}
                x1={cx} y1={cy} x2={x} y2={y}
                stroke="rgba(160,170,200,0.18)"
                strokeWidth={1}
              />
            );
          })}

          {/* Past ghost polygon */}
          {pastPoints && (
            <motion.polygon
              points={pastPoints}
              fill="none"
              stroke={pastColor}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            />
          )}

          {/* Current polygon */}
          <motion.polygon
            points={mainPoints}
            fill="url(#radar-evo-fill)"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />

          {/* Data points with change indicators */}
          {current.map((d, i) => {
            const [px, py] = getPoint(i, d.score);
            const change = changes[i];
            const isSignificant = change?.significant;
            const isHovered = hoveredAxis === i;

            return (
              <g
                key={`point-${i}`}
                onMouseEnter={() => setHoveredAxis(i)}
                onMouseLeave={() => setHoveredAxis(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Pulse ring for significant changes */}
                {isSignificant && (
                  <motion.circle
                    cx={px} cy={py}
                    r={6}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    initial={{ r: 6 }}
                    animate={{ r: [6, 12, 6], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}

                <motion.circle
                  cx={px} cy={py}
                  r={isHovered ? 5 : 3.5}
                  fill={isSignificant ? color : "white"}
                  stroke={color}
                  strokeWidth={1.5}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3 + i * 0.05, type: "spring", stiffness: 200 }}
                />

                {/* Change arrow indicator */}
                {isSignificant && change && (
                  <motion.text
                    x={px}
                    y={py - 12}
                    textAnchor="middle"
                    fill={change.delta > 0 ? "#10B981" : "#EF4444"}
                    fontSize={10}
                    fontWeight={700}
                    initial={{ opacity: 0, y: py - 6 }}
                    animate={{ opacity: 1, y: py - 12 }}
                    transition={{ delay: 0.6 + i * 0.05 }}
                  >
                    {change.delta > 0 ? `+${change.delta}` : change.delta}
                  </motion.text>
                )}
              </g>
            );
          })}

          {/* Labels */}
          {current.map((d, i) => {
            const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
            const labelR = radius + 32;
            const x = cx + labelR * Math.cos(angle);
            const y = cy + labelR * Math.sin(angle);
            let anchor: "start" | "middle" | "end" = "middle";
            if (Math.cos(angle) > 0.3) anchor = "start";
            else if (Math.cos(angle) < -0.3) anchor = "end";

            const isHovered = hoveredAxis === i;

            return (
              <text
                key={`label-${i}`}
                x={x} y={y + 4}
                textAnchor={anchor}
                fill={isHovered ? color : "rgba(40,46,70,0.9)"}
                fontSize={isHovered ? 14 : 13}
                fontWeight={isHovered ? 700 : 600}
                style={{ transition: "fill 0.2s, font-weight 0.2s" }}
              >
                {d.label}
              </text>
            );
          })}

          {/* Hover tooltip */}
          <AnimatePresence>
            {hoveredAxis !== null && (
              <motion.g
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <rect
                  x={cx - 45} y={cy - 18}
                  width={90} height={36}
                  rx={8}
                  fill="rgba(255,255,255,0.95)"
                  stroke="rgba(160,170,200,0.2)"
                  strokeWidth={1}
                  filter="url(#shadow)"
                />
                <text x={cx} y={cy} textAnchor="middle" fill="rgba(40,40,60,0.88)" fontSize={12} fontWeight={600}>
                  {current[hoveredAxis].score}
                </text>
                {past && past[hoveredAxis] && (
                  <text x={cx} y={cy + 13} textAnchor="middle" fill="rgba(140,140,160,0.7)" fontSize={9}>
                    {pastLabel}: {past[hoveredAxis].score}
                  </text>
                )}
              </motion.g>
            )}
          </AnimatePresence>
        </svg>

        {/* Legend */}
        {past && (
          <div className="flex items-center justify-center gap-6 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-slate-500">{currentLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full border border-dashed" style={{ borderColor: pastColor }} />
              <span className="text-[10px] text-slate-400">{pastLabel}</span>
            </div>
          </div>
        )}
      </div>
    </FadeInView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. WeekdayHeatmap — 曜日別行動ヒートマップ
// ═══════════════════════════════════════════════════════════════════════════

export interface WeekdayHeatmapProps {
  /** 7 values (Mon..Sun), each 0..1 intensity */
  data: number[];
  /** Optional sparkline data per day (7 arrays) */
  sparklines?: number[][];
  color?: string;
  label?: string;
}

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

export function WeekdayHeatmap({
  data,
  sparklines,
  color = "#8B5CF6",
  label = "曜日別観測パターン",
}: WeekdayHeatmapProps) {
  const max = Math.max(...data, 0.01);
  const anomalyThreshold = useMemo(() => {
    const mean = data.reduce((s, v) => s + v, 0) / data.length;
    const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length);
    return mean + std * 1.2;
  }, [data]);

  return (
    <FadeInView>
      <GlassCard className="p-4">
        <p className="text-xs text-slate-400 font-medium mb-3">{label}</p>
        <div className="grid grid-cols-7 gap-1.5">
          {data.map((value, i) => {
            const intensity = value / max;
            const isAnomaly = value > anomalyThreshold;

            return (
              <motion.div
                key={i}
                className="flex flex-col items-center gap-1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                {/* Day label */}
                <span className="text-[10px] text-slate-400">{DAY_LABELS[i]}</span>

                {/* Heat cell */}
                <motion.div
                  className="relative w-full aspect-square rounded-lg flex items-center justify-center overflow-hidden"
                  style={{
                    backgroundColor: `${color}${Math.round(intensity * 255).toString(16).padStart(2, "0")}`,
                    border: isAnomaly ? `2px solid ${color}` : "1px solid rgba(200,200,210,0.15)",
                  }}
                  whileHover={{ scale: 1.1 }}
                >
                  {/* Inner sparkline */}
                  {sparklines && sparklines[i] && sparklines[i].length > 1 && (
                    <svg className="w-full h-full absolute inset-0" viewBox="0 0 40 40" preserveAspectRatio="none">
                      <polyline
                        points={sparklines[i]
                          .map((v, j) => {
                            const x = (j / (sparklines[i].length - 1)) * 40;
                            const spMax = Math.max(...sparklines[i], 0.01);
                            const y = 40 - (v / spMax) * 30 - 5;
                            return `${x},${y}`;
                          })
                          .join(" ")}
                        fill="none"
                        stroke={intensity > 0.5 ? "rgba(255,255,255,0.5)" : `${color}44`}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}

                  {/* Value */}
                  <span
                    className="relative z-10 text-[10px] font-bold"
                    style={{ color: intensity > 0.5 ? "white" : "rgba(80,80,100,0.6)" }}
                  >
                    {Math.round(value * 100)}
                  </span>
                </motion.div>

                {/* Anomaly indicator */}
                {isAnomaly && (
                  <motion.div
                    className="w-1 h-1 rounded-full"
                    style={{ backgroundColor: color }}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      </GlassCard>
    </FadeInView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. ContradictionWeb — 矛盾可視化ウェブ
// ═══════════════════════════════════════════════════════════════════════════

export interface ContradictionEdge {
  from: number;
  to: number;
  severity: number; // 0..1
  description: string;
}

export interface ContradictionWebProps {
  nodes: { key: string; label: string; score: number }[];
  edges: ContradictionEdge[];
  color?: string;
  size?: number;
}

export function ContradictionWeb({
  nodes,
  edges,
  color = "#8B5CF6",
  size = 320,
}: ContradictionWebProps) {
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<ContradictionEdge | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.35;

  const nodePositions = useMemo(() => {
    return nodes.map((_, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      return {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });
  }, [nodes.length, cx, cy, radius]);

  const activeEdges = useMemo(() => {
    if (selectedNode === null) return edges;
    return edges.filter((e) => e.from === selectedNode || e.to === selectedNode);
  }, [edges, selectedNode]);

  return (
    <FadeInView>
      <div className="relative">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          className="mx-auto"
        >
          {/* Edges */}
          {edges.map((edge, i) => {
            const from = nodePositions[edge.from];
            const to = nodePositions[edge.to];
            if (!from || !to) return null;
            const isActive = activeEdges.includes(edge);
            const isSelected = selectedEdge === edge;

            return (
              <motion.line
                key={`edge-${i}`}
                x1={from.x} y1={from.y}
                x2={to.x} y2={to.y}
                stroke={isSelected ? "#EF4444" : color}
                strokeWidth={1 + edge.severity * 3}
                strokeOpacity={isActive ? 0.3 + edge.severity * 0.5 : 0.08}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.25, delay: i * 0.06 }}
                onClick={() => setSelectedEdge(isSelected ? null : edge)}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {/* Animated pulse on active contradiction edges */}
          {activeEdges
            .filter((e) => e.severity > 0.5)
            .map((edge, i) => {
              const from = nodePositions[edge.from];
              const to = nodePositions[edge.to];
              if (!from || !to) return null;
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2;

              return (
                <motion.circle
                  key={`pulse-${i}`}
                  cx={midX} cy={midY}
                  r={3}
                  fill={color}
                  initial={{ r: 3 }}
                  animate={{ r: [3, 8, 3], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                />
              );
            })}

          {/* Nodes */}
          {nodes.map((node, i) => {
            const pos = nodePositions[i];
            const isSelected = selectedNode === i;
            const hasContradiction = edges.some(
              (e) => (e.from === i || e.to === i) && e.severity > 0.3,
            );

            return (
              <g
                key={`node-${i}`}
                onClick={() => setSelectedNode(isSelected ? null : i)}
                style={{ cursor: "pointer" }}
              >
                {/* Outer glow for contradiction nodes */}
                {hasContradiction && (
                  <motion.circle
                    cx={pos.x} cy={pos.y}
                    r={14}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    strokeOpacity={0.2}
                    initial={{ r: 14 }}
                    animate={{ r: [14, 20, 14] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  />
                )}

                <motion.circle
                  cx={pos.x} cy={pos.y}
                  r={isSelected ? 12 : 8}
                  fill={isSelected ? color : "rgba(255,255,255,0.9)"}
                  stroke={color}
                  strokeWidth={hasContradiction ? 2 : 1}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1 + i * 0.05, type: "spring" }}
                />

                {/* Label */}
                <text
                  x={pos.x}
                  y={pos.y + (i < nodes.length / 2 ? -16 : 22)}
                  textAnchor="middle"
                  fill={isSelected ? color : "rgba(58,64,88,0.7)"}
                  fontSize={10}
                  fontWeight={isSelected ? 700 : 500}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected edge detail */}
        <AnimatePresence>
          {selectedEdge && (
            <motion.div
              className="mt-3 mx-auto max-w-[280px]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <GlassCard className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border border-red-200 text-red-500 bg-red-50">
                    矛盾
                  </span>
                  <span className="text-[10px] text-slate-400">
                    強度: {Math.round(selectedEdge.severity * 100)}%
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {selectedEdge.description}
                </p>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </FadeInView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. GrowthTimeline — 成長タイムライン
// ═══════════════════════════════════════════════════════════════════════════

export interface GrowthMilestone {
  date: string;
  title: string;
  description: string;
  type: "observation" | "contradiction" | "milestone" | "insight";
  significance: number; // 0..1
}

export interface GrowthTimelineProps {
  milestones: GrowthMilestone[];
  color?: string;
}

const MILESTONE_ICONS: Record<GrowthMilestone["type"], { emoji: string; color: string }> = {
  observation: { emoji: "O", color: "#8B5CF6" },
  contradiction: { emoji: "!", color: "#EF4444" },
  milestone: { emoji: "M", color: "#F59E0B" },
  insight: { emoji: "I", color: "#10B981" },
};

const MILESTONE_TYPE_LABELS: Record<GrowthMilestone["type"], string> = {
  observation: "観測",
  contradiction: "矛盾検出",
  milestone: "達成",
  insight: "気づき",
};

export function GrowthTimeline({
  milestones,
  color = "#8B5CF6",
}: GrowthTimelineProps) {
  return (
    <FadeInView>
      <div className="relative pl-8">
        {/* Vertical connecting line */}
        <motion.div
          className="absolute left-[15px] top-0 bottom-0 w-[2px]"
          style={{ transformOrigin: "top", background: `linear-gradient(to bottom, ${color}22, ${color}44, ${color}22)` }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.4 }}
        />

        <div className="space-y-4">
          {milestones.map((milestone, i) => {
            const typeConfig = MILESTONE_ICONS[milestone.type];
            const nodeSize = 12 + milestone.significance * 8;

            return (
              <motion.div
                key={`${milestone.date}-${i}`}
                className="relative"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.12 }}
              >
                {/* Timeline node */}
                <motion.div
                  className="absolute -left-8 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                  style={{
                    width: nodeSize,
                    height: nodeSize,
                    top: `calc(50% - ${nodeSize / 2}px)`,
                    left: `${16 - nodeSize / 2 - 32}px`,
                    backgroundColor: typeConfig.color,
                    boxShadow: `0 0 12px ${typeConfig.color}44`,
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.12 + 0.1, type: "spring", stiffness: 300 }}
                >
                  {typeConfig.emoji}
                </motion.div>

                {/* Card */}
                <GlassCard className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border"
                          style={{
                            borderColor: `${typeConfig.color}30`,
                            color: typeConfig.color,
                            backgroundColor: `${typeConfig.color}08`,
                          }}
                        >
                          {MILESTONE_TYPE_LABELS[milestone.type]}
                        </span>
                        <span className="text-[10px] text-slate-400">{milestone.date}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-700">{milestone.title}</p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {milestone.description}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      </div>
    </FadeInView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Combined PatternVisualization
// ═══════════════════════════════════════════════════════════════════════════

export interface PatternVisualizationProps {
  radarCurrent: AxisDataPoint[];
  radarPast?: AxisDataPoint[];
  weekdayData: number[];
  weekdaySparklines?: number[][];
  contradictionNodes: { key: string; label: string; score: number }[];
  contradictionEdges: ContradictionEdge[];
  milestones: GrowthMilestone[];
  color?: string;
}

type VisTab = "radar" | "heatmap" | "web" | "timeline";

const VIS_TABS: { key: VisTab; label: string }[] = [
  { key: "radar", label: "進化" },
  { key: "heatmap", label: "曜日" },
  { key: "web", label: "矛盾" },
  { key: "timeline", label: "軌跡" },
];

export default function PatternVisualization({
  radarCurrent,
  radarPast,
  weekdayData,
  weekdaySparklines,
  contradictionNodes,
  contradictionEdges,
  milestones,
  color = "#8B5CF6",
}: PatternVisualizationProps) {
  const [activeTab, setActiveTab] = useState<VisTab>("radar");

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/40 backdrop-blur-sm border border-white/30">
        {VIS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex-1 relative py-1.5 text-xs font-medium rounded-lg transition-colors"
            style={{
              color: activeTab === tab.key ? color : "rgba(100,100,120,0.6)",
            }}
          >
            {activeTab === tab.key && (
              <motion.div
                layoutId="vis-tab-bg"
                className="absolute inset-0 rounded-lg"
                style={{
                  backgroundColor: `${color}10`,
                  border: `1px solid ${color}20`,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {activeTab === "radar" && (
            <AxisRadarEvolution
              current={radarCurrent}
              past={radarPast}
              color={color}
            />
          )}
          {activeTab === "heatmap" && (
            <WeekdayHeatmap
              data={weekdayData}
              sparklines={weekdaySparklines}
              color={color}
            />
          )}
          {activeTab === "web" && (
            <ContradictionWeb
              nodes={contradictionNodes}
              edges={contradictionEdges}
              color={color}
            />
          )}
          {activeTab === "timeline" && (
            <GrowthTimeline
              milestones={milestones}
              color={color}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
