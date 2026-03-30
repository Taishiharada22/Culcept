"use client";

/**
 * JourneyTimeline
 * SVGスパークライン + マイルストーンドット
 * 関係スコアの推移をベジェ曲線で描画、ストロークアニメーション付き
 */

import { useMemo, useId } from "react";
import { motion } from "framer-motion";

type TimelinePoint = {
  date: string;
  score: number; // 0-1 living score
  milestone?: string; // optional milestone label
};

type Props = {
  points: TimelinePoint[];
  color?: string;
  height?: number;
};

/**
 * Quadratic bezier smooth path through points
 */
function buildSmoothPath(
  coords: { x: number; y: number }[],
): string {
  if (coords.length < 2) return "";
  let d = `M ${coords[0].x},${coords[0].y}`;

  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;

    if (i === 0) {
      // First segment: straight to midpoint
      d += ` Q ${curr.x},${curr.y} ${midX},${midY}`;
    } else {
      d += ` Q ${curr.x},${curr.y} ${midX},${midY}`;
    }
  }

  // End at last point
  const last = coords[coords.length - 1];
  const prev = coords[coords.length - 2];
  d += ` Q ${last.x},${last.y} ${last.x},${last.y}`;

  return d;
}

export default function JourneyTimeline({
  points,
  color = "#6366F1",
  height = 80,
}: Props) {
  const uid = useId().replace(/:/g, "_");

  const { coords, milestones, viewW } = useMemo(() => {
    if (points.length < 2) return { coords: [], milestones: [], viewW: 300 };

    const padding = 12;
    const w = 300;
    const chartW = w - padding * 2;
    const chartH = height - padding * 2 - 10; // leave room for labels

    const cs = points.map((p, i) => ({
      x: padding + (i / (points.length - 1)) * chartW,
      y: padding + chartH - p.score * chartH,
      score: p.score,
      milestone: p.milestone,
      date: p.date,
    }));

    const ms = cs.filter((c) => c.milestone);

    return { coords: cs, milestones: ms, viewW: w };
  }, [points, height]);

  if (coords.length < 2) return null;

  const pathD = buildSmoothPath(coords);

  // Closed fill path
  const fillD = `${pathD} L ${coords[coords.length - 1].x},${height - 6} L ${coords[0].x},${height - 6} Z`;

  return (
    <svg
      viewBox={`0 0 ${viewW} ${height}`}
      width="100%"
      height={height}
      style={{ display: "block" }}
    >
      <defs>
        {/* Gradient fill below the line */}
        <linearGradient id={`jt-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.1} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Fill area */}
      <path d={fillD} fill={`url(#jt-fill-${uid})`} />

      {/* Animated line with stroke-dashoffset draw */}
      <motion.path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />

      {/* Milestone dots */}
      {milestones.map((m, i) => (
        <g key={i}>
          {/* Dot */}
          <motion.circle
            cx={m.x}
            cy={m.y}
            r={3}
            fill={color}
            stroke="#fff"
            strokeWidth={1.5}
            initial={{ r: 0 }}
            animate={{ r: 3 }}
            transition={{ delay: 0.6 + i * 0.15 }}
          />
          {/* Label below */}
          <motion.text
            x={m.x}
            y={m.y + 14}
            textAnchor="middle"
            fill="rgba(30,30,60,0.45)"
            fontSize={7}
            fontWeight={600}
            fontFamily="system-ui, sans-serif"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 + i * 0.15 }}
          >
            {m.milestone}
          </motion.text>
        </g>
      ))}

      {/* End point dot */}
      <motion.circle
        cx={coords[coords.length - 1].x}
        cy={coords[coords.length - 1].y}
        r={3.5}
        fill={color}
        stroke="#fff"
        strokeWidth={1.5}
        initial={{ r: 0 }}
        animate={{ r: 3.5 }}
        transition={{ delay: 1 }}
      />
    </svg>
  );
}
