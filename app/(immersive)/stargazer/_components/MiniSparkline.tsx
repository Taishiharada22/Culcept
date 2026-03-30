// app/(immersive)/stargazer/_components/MiniSparkline.tsx
// 精度トレンド用ミニスパークライン — SVGベース、外部ライブラリ不要
"use client";

import { useMemo } from "react";

export interface MiniSparklineProps {
  /** Array of 2-30 numeric values (e.g., accuracy percentages 0-1 or 0-100) */
  values: number[];
  /** SVG width in px (default 80) */
  width?: number;
  /** SVG height in px (default 24) */
  height?: number;
  /** Stroke/dot color (default gold) */
  color?: string;
}

export default function MiniSparkline({
  values,
  width = 80,
  height = 24,
  color = "rgba(201,169,110,0.8)",
}: MiniSparklineProps) {
  const pathData = useMemo(() => {
    if (values.length < 2) return null;

    const px = 3;
    const py = 3;
    const w = width - px * 2;
    const h = height - py * 2;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points: [number, number][] = values.map((v, i) => [
      px + (i / (values.length - 1)) * w,
      py + (1 - (v - min) / range) * h,
    ]);

    // Polyline path
    const linePath = points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x},${y}`)
      .join(" ");

    // Area fill polygon (closed shape under the line)
    const firstX = points[0][0];
    const lastX = points[points.length - 1][0];
    const bottomY = height - py;
    const areaPath = `M ${firstX},${bottomY} ${points.map(([x, y]) => `L ${x},${y}`).join(" ")} L ${lastX},${bottomY} Z`;

    // Last point coordinates
    const lastPoint = points[points.length - 1];

    return { linePath, areaPath, lastPoint };
  }, [values, width, height]);

  if (!pathData) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width, height }}
      >
        <span
          className="text-[9px]"
          style={{ color: "rgba(120,125,140,0.4)" }}
        >
          --
        </span>
      </div>
    );
  }

  // Derive fill color from stroke color with low opacity
  const fillColor = color.replace(/[\d.]+\)$/, "0.08)");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block shrink-0"
      aria-hidden="true"
    >
      {/* Gradient fill area */}
      <defs>
        <linearGradient
          id={`sparkline-grad-${width}-${height}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={color} stopOpacity={0.12} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path
        d={pathData.areaPath}
        fill={`url(#sparkline-grad-${width}-${height})`}
      />
      {/* Line */}
      <path
        d={pathData.linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point highlight dot */}
      <circle
        cx={pathData.lastPoint[0]}
        cy={pathData.lastPoint[1]}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}
