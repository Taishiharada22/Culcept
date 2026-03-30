// app/stargazer/_components/LiveSkyPanel.tsx
// LIVE SKY — 15軸の観測ゲージ（ダイヤモンドマーカー + 中心ゼロ表示）
"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface DimensionDetail {
  id: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  category: string;
  labelLeft: string;
  labelRight: string;
}

interface Props {
  dimensions: DimensionDetail[];
  /** 表示する軸数の上限（デフォルト6） */
  maxDisplay?: number;
}

type Period = "today" | "7d" | "30d";

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "7d", label: "7日" },
  { key: "30d", label: "30日" },
];

export default function LiveSkyPanel({ dimensions, maxDisplay = 6 }: Props) {
  const [period, setPeriod] = useState<Period>("30d");
  const [showAll, setShowAll] = useState(false);

  // confidence × |score| でソートし、evidence がある軸を上位表示
  const sortedDimensions = [...dimensions]
    .filter((d) => d.evidenceCount > 0)
    .sort(
      (a, b) =>
        b.confidence * Math.abs(b.score) - a.confidence * Math.abs(a.score)
    );

  const displayDimensions = showAll
    ? sortedDimensions
    : sortedDimensions.slice(0, maxDisplay);

  if (displayDimensions.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: "rgba(74,222,128,0.6)",
              boxShadow: "0 0 8px rgba(74,222,128,0.3)",
              animation: "sg-glow-pulse 3s ease-in-out infinite",
            }}
          />
          <span
            className="font-mono-sg text-xs font-semibold tracking-[0.15em] uppercase"
            style={{ color: "rgba(100,105,130,0.6)" }}
          >
            LIVE SKY
          </span>
          <span
            className="font-mono-sg text-xs tabular-nums"
            style={{ color: "rgba(120,125,140,0.4)" }}
          >
            {sortedDimensions.length}軸
          </span>
        </div>

        {/* Period toggle */}
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className="font-body text-xs px-2.5 py-1 rounded-lg transition-all"
              style={
                period === opt.key
                  ? {
                      background: "rgba(190,170,110,0.1)",
                      border: "1px solid rgba(190,170,110,0.2)",
                      color: "rgba(170,150,90,0.85)",
                    }
                  : {
                      background: "transparent",
                      border: "1px solid rgba(160,170,200,0.12)",
                      color: "rgba(120,125,140,0.5)",
                    }
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Gauge list */}
      <motion.div
        className="rounded-xl p-5"
        style={{
          background: "rgba(255,255,255,0.7)",
          border: "1px solid rgba(160,170,200,0.12)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="space-y-5">
          {displayDimensions.map((dim, i) => {
            const isLeft = dim.score < 0;
            const label = isLeft ? dim.labelLeft : dim.labelRight;
            const absValue = Math.abs(dim.score);
            const pct = Math.round(absValue * 100);
            // 中心ゼロのマーカー位置: -1→0%, 0→50%, +1→100%
            const markerPos = ((dim.score + 1) / 2) * 100;

            return (
              <motion.div
                key={dim.id}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.22 }}
              >
                {/* Label + value + count */}
                <div className="flex items-baseline justify-between mb-2">
                  <span
                    className="font-body text-sm font-semibold"
                    style={{ color: "rgba(30,35,55,0.8)" }}
                  >
                    {label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono-sg text-sm font-semibold tabular-nums"
                      style={{ color: "rgba(170,150,90,0.85)" }}
                    >
                      {dim.score > 0 ? "+" : ""}
                      {dim.score.toFixed(2)}
                    </span>
                    <span
                      className="font-mono-sg text-xs tabular-nums"
                      style={{ color: "rgba(120,125,140,0.4)" }}
                    >
                      {dim.evidenceCount}件
                    </span>
                  </div>
                </div>

                {/* Gauge — center-zero */}
                <div className="relative h-3">
                  {/* Track */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ background: "rgba(0,0,0,0.04)" }}
                  />

                  {/* Center line */}
                  <div
                    className="absolute top-0 bottom-0 w-px left-1/2"
                    style={{ background: "rgba(160,170,200,0.2)" }}
                  />

                  {/* Fill bar (from center) */}
                  {dim.score >= 0 ? (
                    <motion.div
                      className="absolute top-0 bottom-0 rounded-r-full"
                      style={{
                        left: "50%",
                        background:
                          "linear-gradient(90deg, rgba(190,170,110,0.2), rgba(190,170,110,0.4))",
                      }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${absValue * 50}%` }}
                      viewport={{ once: true }}
                      transition={{
                        delay: 0.2 + i * 0.06,
                        duration: 0.4,
                        ease: "easeOut",
                      }}
                    />
                  ) : (
                    <motion.div
                      className="absolute top-0 bottom-0 rounded-l-full"
                      style={{
                        right: "50%",
                        background:
                          "linear-gradient(270deg, rgba(190,170,110,0.2), rgba(190,170,110,0.4))",
                      }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${absValue * 50}%` }}
                      viewport={{ once: true }}
                      transition={{
                        delay: 0.2 + i * 0.06,
                        duration: 0.4,
                        ease: "easeOut",
                      }}
                    />
                  )}

                  {/* Tick marks */}
                  {[0, 25, 50, 75, 100].map((tick) => (
                    <div
                      key={tick}
                      className="absolute top-0 bottom-0 w-px"
                      style={{
                        left: `${tick}%`,
                        background:
                          tick === 50
                            ? "rgba(160,170,200,0.2)"
                            : "rgba(160,170,200,0.06)",
                      }}
                    />
                  ))}

                  {/* Diamond marker */}
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2"
                    style={{
                      left: `${Math.max(3, Math.min(97, markerPos))}%`,
                    }}
                    initial={{ opacity: 0, scale: 0 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 + i * 0.06, duration: 0.18 }}
                  >
                    <div
                      className="w-3 h-3 -ml-1.5"
                      style={{
                        background: "rgba(190,170,110,0.9)",
                        transform: "rotate(45deg)",
                        boxShadow: "0 0 8px rgba(190,170,110,0.3)",
                      }}
                    />
                  </motion.div>
                </div>

                {/* Left / Right labels */}
                <div className="flex justify-between mt-1">
                  <span
                    className="font-body text-xs"
                    style={{ color: "rgba(120,125,140,0.4)" }}
                  >
                    {dim.labelLeft}
                  </span>
                  <span
                    className="font-body text-xs"
                    style={{ color: "rgba(120,125,140,0.4)" }}
                  >
                    {dim.labelRight}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Show all / collapse toggle */}
        {sortedDimensions.length > maxDisplay && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="w-full mt-4 pt-3 font-body text-xs text-center transition-all"
            style={{
              borderTop: "1px solid rgba(160,170,200,0.1)",
              color: "rgba(100,105,130,0.5)",
            }}
          >
            {showAll
              ? "主要軸のみ表示"
              : `全 ${sortedDimensions.length} 軸を表示`}
          </button>
        )}
      </motion.div>
    </div>
  );
}
