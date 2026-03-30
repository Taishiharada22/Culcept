"use client";

import { motion } from "framer-motion";

type Props = {
  size: number;
  color: number;
  visual: number;
  preference: number;
};

const LABELS = ["サイズ", "カラー", "スタイル", "好み"];
const ANGLES = [0, 90, 180, 270]; // top, right, bottom, left

function polarToXY(angle: number, radius: number, cx: number, cy: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

export default function ScoreRadarChart({ size, color, visual, preference }: Props) {
  const cx = 100, cy = 100, maxR = 80;
  const scores = [size, color, visual, preference];
  const points = scores.map((s, i) => {
    const r = (s / 100) * maxR;
    return polarToXY(ANGLES[i], r, cx, cy);
  });
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";

  return (
    <div className="flex justify-center">
      <svg viewBox="0 0 200 200" className="h-44 w-44">
        {[0.25, 0.5, 0.75, 1].map(scale => {
          const r = maxR * scale;
          const gridPoints = ANGLES.map(a => polarToXY(a, r, cx, cy));
          const gridD = gridPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";
          return <path key={scale} d={gridD} fill="none" stroke="white" strokeOpacity={0.1} strokeWidth={0.5} />;
        })}

        {ANGLES.map((angle, i) => {
          const end = polarToXY(angle, maxR + 4, cx, cy);
          const labelPos = polarToXY(angle, maxR + 16, cx, cy);
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="white" strokeOpacity={0.15} strokeWidth={0.5} />
              <text x={labelPos.x} y={labelPos.y} textAnchor="middle" dominantBaseline="middle" fill="white" fillOpacity={0.5} fontSize={9}>
                {LABELS[i]}
              </text>
            </g>
          );
        })}

        <motion.path
          d={pathD}
          fill="rgba(56, 189, 248, 0.2)"
          stroke="rgb(56, 189, 248)"
          strokeWidth={1.5}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {points.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3}
            fill="rgb(56, 189, 248)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.1 }}
          />
        ))}
      </svg>
    </div>
  );
}
