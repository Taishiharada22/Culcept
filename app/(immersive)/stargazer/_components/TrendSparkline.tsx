// app/stargazer/_components/TrendSparkline.tsx
// Spotify Wrapped / Oura Ring 級のインラインスパークライン
"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

export interface TrendSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showDots?: boolean;
  showTrend?: boolean;
  label?: string;
  highlightMinMax?: boolean;
  animated?: boolean;
}

// Catmull-Rom to Bezier conversion for smooth curves
function catmullRomToBezier(
  points: [number, number][],
): string {
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

export default function TrendSparkline({
  data,
  width = 120,
  height = 40,
  color = "#8B5CF6",
  showDots = false,
  showTrend = false,
  label,
  highlightMinMax = true,
  animated = true,
}: TrendSparklineProps) {
  const paddingX = 4;
  const paddingY = 4;

  const { points, minIdx, maxIdx, trendPath, curvePath, areaPath } = useMemo(() => {
    if (data.length === 0) return { points: [], minIdx: -1, maxIdx: -1, trendPath: "", curvePath: "", areaPath: "" };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const pts: [number, number][] = data.map((v, i) => {
      const x = paddingX + (i / Math.max(data.length - 1, 1)) * (width - paddingX * 2);
      const y = paddingY + (1 - (v - min) / range) * (height - paddingY * 2);
      return [x, y];
    });

    let mnIdx = 0;
    let mxIdx = 0;
    data.forEach((v, i) => {
      if (v < data[mnIdx]) mnIdx = i;
      if (v > data[mxIdx]) mxIdx = i;
    });

    // Trend line (simple linear regression)
    let tp = "";
    if (data.length >= 2) {
      const n = data.length;
      const sumX = data.reduce((s, _, i) => s + i, 0);
      const sumY = data.reduce((s, v) => s + v, 0);
      const sumXY = data.reduce((s, v, i) => s + i * v, 0);
      const sumXX = data.reduce((s, _, i) => s + i * i, 0);
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      const y1 = paddingY + (1 - (intercept - min) / range) * (height - paddingY * 2);
      const y2 = paddingY + (1 - (slope * (n - 1) + intercept - min) / range) * (height - paddingY * 2);
      tp = `M ${paddingX},${y1} L ${width - paddingX},${y2}`;
    }

    const cp = catmullRomToBezier(pts);

    // Area path (closed at bottom)
    const ap = pts.length >= 2
      ? `${cp} L ${pts[pts.length - 1][0]},${height} L ${pts[0][0]},${height} Z`
      : "";

    return { points: pts, minIdx: mnIdx, maxIdx: mxIdx, trendPath: tp, curvePath: cp, areaPath: ap };
  }, [data, width, height, paddingX, paddingY]);

  const uid = useMemo(() => `spark-${Math.random().toString(36).slice(2, 8)}`, []);

  if (data.length === 0) return null;

  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      {label && (
        <span className="text-[10px] text-slate-400 font-medium leading-none">{label}</span>
      )}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <defs>
          <linearGradient id={`${uid}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Area fill */}
        {areaPath && (
          <motion.path
            d={areaPath}
            fill={`url(#${uid}-grad)`}
            initial={animated ? { opacity: 0 } : undefined}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: 0.3 }}
          />
        )}

        {/* Main curve */}
        {curvePath && (
          <motion.path
            d={curvePath}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={animated ? { pathLength: 0, opacity: 0 } : undefined}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        )}

        {/* Trend line overlay */}
        {showTrend && trendPath && (
          <motion.path
            d={trendPath}
            fill="none"
            stroke={color}
            strokeWidth={1}
            strokeOpacity={0.3}
            strokeDasharray="3 3"
            initial={animated ? { opacity: 0 } : undefined}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.22 }}
          />
        )}

        {/* Dots */}
        {showDots &&
          points.map(([x, y], i) => (
            <motion.circle
              key={i}
              cx={x}
              cy={y}
              r={2}
              fill={color}
              initial={animated ? { scale: 0, opacity: 0 } : undefined}
              animate={{ scale: 1, opacity: 0.7 }}
              transition={{ delay: 0.2 + i * 0.04 }}
            />
          ))}

        {/* Highlight min/max */}
        {highlightMinMax && points.length > 2 && (
          <>
            {/* Max */}
            <motion.circle
              cx={points[maxIdx][0]}
              cy={points[maxIdx][1]}
              r={3}
              fill={color}
              stroke="white"
              strokeWidth={1.5}
              initial={animated ? { scale: 0 } : undefined}
              animate={{ scale: 1 }}
              transition={{ delay: 0.6, type: "spring", stiffness: 300 }}
            />
            {/* Min */}
            <motion.circle
              cx={points[minIdx][0]}
              cy={points[minIdx][1]}
              r={3}
              fill="white"
              stroke={color}
              strokeWidth={1.5}
              initial={animated ? { scale: 0 } : undefined}
              animate={{ scale: 1 }}
              transition={{ delay: 0.7, type: "spring", stiffness: 300 }}
            />
          </>
        )}
      </svg>
    </div>
  );
}
