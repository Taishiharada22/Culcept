// app/stargazer/_components/ScoreRing.tsx
// 精密な観測精度リング — SVGベースの円形プログレス
"use client";

import { motion } from "framer-motion";

interface Props {
  /** 0–100 */
  value: number;
  /** リングの直径 (px) */
  size?: number;
  /** ストローク幅 */
  strokeWidth?: number;
  /** メインカラー (hex or rgba) */
  color?: string;
  /** トラックカラー */
  trackColor?: string;
  /** 中央に表示するラベル */
  label?: string;
  /** 中央のサブラベル */
  subLabel?: string;
  /** ラベルの色 */
  labelColor?: string;
  /** アニメーション遅延 (s) */
  delay?: number;
  /** ダーク背景用かライト背景用か */
  variant?: "dark" | "light";
}

export default function ScoreRing({
  value,
  size = 120,
  strokeWidth = 4,
  color = "rgba(201, 169, 110, 0.8)",
  trackColor,
  label,
  subLabel,
  labelColor,
  delay = 0,
  variant = "dark",
}: Props) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - progress / 100);

  const defaultTrack =
    variant === "dark" ? "rgba(160,170,200,0.1)" : "rgba(0,0,0,0.06)";
  const defaultLabelColor =
    variant === "dark" ? "rgba(30,35,55,0.85)" : "rgba(30,40,60,0.85)";

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* グロー */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${color.replace(/[\d.]+\)$/, "0.08)")} 0%, transparent 70%)`,
          filter: "blur(8px)",
          animation: "sg-glow-pulse 4s ease-in-out infinite",
        }}
      />

      <svg
        width={size}
        height={size}
        className="relative z-10"
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* トラック */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor || defaultTrack}
          strokeWidth={strokeWidth}
        />
        {/* プログレス */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{
            duration: 1.5,
            delay,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      </svg>

      {/* 中央テキスト */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
        <motion.span
          className="font-mono-sg font-semibold tabular-nums"
          style={{
            color: labelColor || defaultLabelColor,
            fontSize: size * 0.22,
            lineHeight: 1,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.5, duration: 0.25 }}
        >
          {label ?? `${Math.round(progress)}`}
        </motion.span>
        {subLabel && (
          <motion.span
            className="font-body mt-0.5"
            style={{
              color:
                variant === "dark"
                  ? "rgba(120,125,140,0.5)"
                  : "rgba(100,110,130,0.6)",
              fontSize: size * 0.09,
              letterSpacing: "0.08em",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay + 0.7, duration: 0.25 }}
          >
            {subLabel}
          </motion.span>
        )}
      </div>
    </div>
  );
}
