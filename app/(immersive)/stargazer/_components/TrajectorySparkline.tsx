// app/stargazer/_components/TrajectorySparkline.tsx
// 軌道スパークライン — 120×40px SVG
// 安定=ゴールド、変動中=アンバー、揺れ大=ローズ
"use client";

import { useMemo } from "react";
import type { AxisTrajectory } from "@/lib/stargazer/trajectoryQuery";

interface Props {
  trajectory: AxisTrajectory;
  width?: number;
  height?: number;
}

export default function TrajectorySparkline({
  trajectory,
  width = 120,
  height = 40,
}: Props) {
  const { points, strokeColor, fillColor } = useMemo(() => {
    const data = trajectory.dataPoints;
    if (data.length < 2) return { points: "", strokeColor: "", fillColor: "" };

    const padding = 4;
    const w = width - padding * 2;
    const h = height - padding * 2;

    // -1 to +1 range
    const pts = data.map((d, i) => {
      const x = padding + (i / Math.max(1, data.length - 1)) * w;
      const y = padding + ((1 - d.score) / 2) * h; // -1 maps to bottom, +1 to top
      return `${x},${y}`;
    });

    // Color based on variance/trend
    let stroke: string;
    let fill: string;
    if (trajectory.trend === "oscillating" || trajectory.variance > 0.08) {
      stroke = "rgba(244,114,182,0.7)";  // rose
      fill = "rgba(244,114,182,0.08)";
    } else if (trajectory.variance > 0.03) {
      stroke = "rgba(190,170,110,0.7)";   // muted gold
      fill = "rgba(190,170,110,0.08)";
    } else {
      stroke = "rgba(120,125,140,0.5)";  // neutral
      fill = "rgba(120,125,140,0.05)";
    }

    return {
      points: pts.join(" "),
      strokeColor: stroke,
      fillColor: fill,
    };
  }, [trajectory, width, height]);

  if (trajectory.dataPoints.length < 2) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width, height }}
      >
        <span
          className="font-mono-sg text-[9px]"
          style={{ color: "rgba(120,125,140,0.4)" }}
        >
          —
        </span>
      </div>
    );
  }

  // Build area polygon (fill under the line)
  const padding = 4;
  const firstX = padding;
  const lastX = padding + ((trajectory.dataPoints.length - 1) / Math.max(1, trajectory.dataPoints.length - 1)) * (width - padding * 2);
  const bottomY = height - padding;
  const areaPoints = `${firstX},${bottomY} ${points} ${lastX},${bottomY}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
    >
      {/* Area fill */}
      <polygon points={areaPoints} fill={fillColor} />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Latest point dot */}
      {trajectory.dataPoints.length > 0 && (() => {
        const lastPt = points.split(" ").pop()?.split(",");
        if (!lastPt) return null;
        return (
          <circle
            cx={parseFloat(lastPt[0])}
            cy={parseFloat(lastPt[1])}
            r="2.5"
            fill={strokeColor}
          />
        );
      })()}
    </svg>
  );
}
