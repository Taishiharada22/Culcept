// AxisEvolutionChart.tsx
// 軸スコアの時系列推移チャート（カスタムSVG）
// RadarChart.tsx と同じパターンでフレームワーク非依存
"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";

interface TimePoint {
  axisId: string;
  score: number;
  date: string;
}

interface Props {
  timePoints: TimePoint[];
  /** 表示する軸（省略時は変化量top 5） */
  focusAxes?: TraitAxisKey[];
  /** 表示期間（日） */
  days?: number;
}

const CHART_W = 320;
const CHART_H = 160;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 12;
const PAD_B = 24;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

const AXIS_COLORS: Record<string, string> = {
  introvert_vs_extrovert: "rgba(96,165,250,0.8)",
  cautious_vs_bold: "rgba(251,146,60,0.8)",
  analytical_vs_intuitive: "rgba(168,85,247,0.8)",
  independence_vs_harmony: "rgba(52,211,153,0.8)",
  emotional_variability: "rgba(244,114,182,0.8)",
  plan_vs_spontaneous: "rgba(56,189,248,0.8)",
  direct_vs_diplomatic: "rgba(251,191,36,0.8)",
  function_vs_expression: "rgba(139,92,246,0.8)",
  change_embrace_vs_resist: "rgba(34,197,94,0.8)",
  stress_isolation_vs_social: "rgba(248,113,113,0.8)",
};

function getColor(axisId: string, idx: number): string {
  if (AXIS_COLORS[axisId]) return AXIS_COLORS[axisId];
  const fallback = [
    "rgba(140,120,60,0.7)", "rgba(96,165,250,0.7)",
    "rgba(244,114,182,0.7)", "rgba(52,211,153,0.7)", "rgba(251,146,60,0.7)",
  ];
  return fallback[idx % fallback.length];
}

export default function AxisEvolutionChart({ timePoints, focusAxes, days = 30 }: Props) {
  const [hoveredAxis, setHoveredAxis] = useState<string | null>(null);

  const { axes, dateRange, series } = useMemo(() => {
    if (!timePoints || timePoints.length === 0) return { axes: [], dateRange: { min: "", max: "" }, series: new Map() };

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const filtered = timePoints.filter((p) => p.date >= cutoffStr);
    if (filtered.length === 0) return { axes: [], dateRange: { min: "", max: "" }, series: new Map() };

    // 軸ごとにグループ化
    const byAxis = new Map<string, { date: string; score: number }[]>();
    for (const p of filtered) {
      if (!byAxis.has(p.axisId)) byAxis.set(p.axisId, []);
      byAxis.get(p.axisId)!.push({ date: p.date, score: p.score });
    }
    // 日付ソート
    for (const [, points] of byAxis) {
      points.sort((a, b) => a.date.localeCompare(b.date));
    }

    // focusAxes があればそれを使用、なければ変化量 top 5
    let selectedAxes: string[];
    if (focusAxes && focusAxes.length > 0) {
      selectedAxes = focusAxes.filter((a) => byAxis.has(a));
    } else {
      const axisVariance: { axisId: string; variance: number }[] = [];
      for (const [axisId, points] of byAxis) {
        if (points.length < 2) continue;
        const scores = points.map((p) => p.score);
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
        axisVariance.push({ axisId, variance });
      }
      selectedAxes = axisVariance
        .sort((a, b) => b.variance - a.variance)
        .slice(0, 5)
        .map((a) => a.axisId);
    }

    const dates = filtered.map((p) => p.date);
    const dateRange = {
      min: dates.reduce((a, b) => (a < b ? a : b)),
      max: dates.reduce((a, b) => (a > b ? a : b)),
    };

    return { axes: selectedAxes, dateRange, series: byAxis };
  }, [timePoints, focusAxes, days]);

  if (axes.length === 0) {
    return (
      <div style={{ padding: "20px 16px", textAlign: "center", color: "rgba(56,62,84,0.5)", fontSize: 13 }}>
        時系列データが蓄積されると、ここに変化のグラフが表示されます
      </div>
    );
  }

  // 日付 → X座標
  const minDate = new Date(dateRange.min).getTime();
  const maxDate = new Date(dateRange.max).getTime();
  const dateSpan = Math.max(1, maxDate - minDate);
  const toX = (date: string) => PAD_L + ((new Date(date).getTime() - minDate) / dateSpan) * PLOT_W;
  // スコア → Y座標 (-1 → bottom, +1 → top)
  const toY = (score: number) => PAD_T + PLOT_H * (1 - (score + 1) / 2);

  return (
    <div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        width="100%"
        style={{ maxWidth: CHART_W }}
        role="img"
        aria-label="軸スコアの時系列推移チャート"
      >
        {/* Zero line */}
        <line
          x1={PAD_L} y1={toY(0)} x2={CHART_W - PAD_R} y2={toY(0)}
          stroke="rgba(0,0,0,0.08)" strokeDasharray="4 4"
        />
        {/* +0.5 / -0.5 guides */}
        <line x1={PAD_L} y1={toY(0.5)} x2={CHART_W - PAD_R} y2={toY(0.5)} stroke="rgba(0,0,0,0.04)" />
        <line x1={PAD_L} y1={toY(-0.5)} x2={CHART_W - PAD_R} y2={toY(-0.5)} stroke="rgba(0,0,0,0.04)" />

        {/* Date labels */}
        <text x={PAD_L} y={CHART_H - 4} fontSize={9} fill="rgba(56,62,84,0.4)">
          {dateRange.min.slice(5)}
        </text>
        <text x={CHART_W - PAD_R} y={CHART_H - 4} fontSize={9} fill="rgba(56,62,84,0.4)" textAnchor="end">
          {dateRange.max.slice(5)}
        </text>

        {/* Lines */}
        {axes.map((axisId, idx) => {
          const points = series.get(axisId);
          if (!points || points.length < 2) return null;

          const isHovered = hoveredAxis === axisId;
          const isOtherHovered = hoveredAxis !== null && !isHovered;
          const color = getColor(axisId, idx);
          const d = points
            .map((p: { date: string; score: number }, i: number) => `${i === 0 ? "M" : "L"}${toX(p.date).toFixed(1)},${toY(p.score).toFixed(1)}`)
            .join(" ");

          return (
            <motion.path
              key={axisId}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={isHovered ? 2.5 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={isOtherHovered ? 0.2 : 1}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: "easeOut", delay: idx * 0.15 }}
              onPointerEnter={() => setHoveredAxis(axisId)}
              onPointerLeave={() => setHoveredAxis(null)}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 8, paddingLeft: 4 }}>
        {axes.map((axisId, idx) => {
          const axisDef = TRAIT_AXES.find((a) => a.id === axisId);
          const label = axisDef
            ? `${axisDef.labelLeft}⇔${axisDef.labelRight}`
            : axisId.replace(/_vs_|_/g, " ");
          const color = getColor(axisId, idx);
          const isHovered = hoveredAxis === axisId;

          return (
            <div
              key={axisId}
              style={{
                display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                opacity: hoveredAxis && !isHovered ? 0.3 : 1,
                transition: "opacity 0.2s",
              }}
              onPointerEnter={() => setHoveredAxis(axisId)}
              onPointerLeave={() => setHoveredAxis(null)}
            >
              <span
                style={{
                  width: 10, height: 3, borderRadius: 1, background: color, display: "inline-block",
                }}
              />
              <span style={{ fontSize: 10, color: "rgba(56,62,84,0.65)" }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
