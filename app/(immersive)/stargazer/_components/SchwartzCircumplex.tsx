"use client";

// app/stargazer/_components/SchwartzCircumplex.tsx
// シュワルツ価値観円環 — 10カテゴリの円形セグメント可視化

import { useRef } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SG_GOLD_RGB = "176,144,80";

// Schwartz の円環理論では隣接カテゴリが類似、対角が対立
// 時計回りの順序（0度=上から開始）
const SCHWARTZ_ORDER = [
  "self_direction",
  "stimulation",
  "hedonism",
  "achievement",
  "power",
  "security",
  "conformity",
  "tradition",
  "benevolence",
  "universalism",
] as const;

// カテゴリごとの色相（円環構造に沿ったグラデーション）
const CATEGORY_HUE: Record<string, number> = {
  self_direction: 45,   // amber
  stimulation:    25,   // orange
  hedonism:       0,    // warm red
  achievement:    330,  // rose
  power:          290,  // purple
  security:       220,  // indigo
  conformity:     200,  // blue
  tradition:      170,  // teal
  benevolence:    140,  // green
  universalism:   80,   // yellow-green
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SchwartzCircumplexProps {
  /** 各カテゴリのスコア (0-1) */
  scores: Array<{ category: string; label: string; score: number }>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 極座標 → デカルト座標 */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/** セグメントの SVG path を生成（扇形） */
function segmentPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const s1 = polar(cx, cy, innerR, startAngle);
  const s2 = polar(cx, cy, outerR, startAngle);
  const e1 = polar(cx, cy, outerR, endAngle);
  const e2 = polar(cx, cy, innerR, endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${s1.x} ${s1.y}`,
    `L ${s2.x} ${s2.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${e1.x} ${e1.y}`,
    `L ${e2.x} ${e2.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${s1.x} ${s1.y}`,
    "Z",
  ].join(" ");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function SchwartzCircumplex({ scores }: SchwartzCircumplexProps) {
  const svgSize = 320;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const innerR = 44;   // ドーナツの穴
  const maxR = 128;    // スコア 1.0 時の外径
  const labelR = 142;  // ラベル位置

  const COUNT = SCHWARTZ_ORDER.length;
  const GAP_DEG = 2; // セグメント間のギャップ（度）
  const sliceDeg = 360 / COUNT;

  // カテゴリ名 → スコア マップ
  const scoreMap = Object.fromEntries(scores.map((s) => [s.category, s.score]));
  const labelMap = Object.fromEntries(scores.map((s) => [s.category, s.label]));

  return (
    <GlassCard
      variant="default"
      padding="none"
      hoverEffect={false}
      className="overflow-hidden"
    >
      <div className="p-5 sm:p-6">
        {/* Title */}
        <div className="mb-4">
          <p
            className="font-serif text-xs tracking-[0.18em] mb-0.5"
            style={{ color: `rgba(${SG_GOLD_RGB},0.45)` }}
          >
            VALUE CIRCUMPLEX
          </p>
          <h3
            className="font-serif text-base font-semibold"
            style={{ color: "rgba(30,35,55,0.85)" }}
          >
            シュワルツ価値観円環
          </h3>
        </div>

        {/* SVG Chart */}
        <div className="flex justify-center">
          <svg
            width={svgSize}
            height={svgSize}
            viewBox={`0 0 ${svgSize} ${svgSize}`}
            className="w-full max-w-[320px]"
            aria-label="シュワルツ価値観円環チャート"
          >
            {/* Background rings */}
            {[0.25, 0.5, 0.75, 1.0].map((frac) => (
              <circle
                key={frac}
                cx={cx}
                cy={cy}
                r={innerR + (maxR - innerR) * frac}
                fill="none"
                stroke={`rgba(${SG_GOLD_RGB},0.07)`}
                strokeWidth={1}
              />
            ))}

            {/* Center glow */}
            <circle
              cx={cx}
              cy={cy}
              r={innerR - 2}
              fill={`rgba(${SG_GOLD_RGB},0.04)`}
            />

            {/* Segments */}
            {SCHWARTZ_ORDER.map((cat, i) => {
              const score = scoreMap[cat] ?? 0;
              const startAngle = i * sliceDeg + GAP_DEG / 2;
              const endAngle = (i + 1) * sliceDeg - GAP_DEG / 2;
              const outerR = innerR + (maxR - innerR) * Math.max(score, 0.05);
              const hue = CATEGORY_HUE[cat] ?? 45;
              const alpha = 0.25 + score * 0.6;

              const pathD = segmentPath(cx, cy, innerR, outerR, startAngle, endAngle);
              // ラベル配置: セグメント中央角
              const midAngle = (startAngle + endAngle) / 2;
              const labelPos = polar(cx, cy, labelR, midAngle);
              const label = labelMap[cat] ?? cat;

              // テキストアンカー: 右半円=start, 左半円=end, 真上下=middle
              const normAngle = ((midAngle % 360) + 360) % 360;
              const textAnchor =
                normAngle > 15 && normAngle < 165
                  ? "start"
                  : normAngle > 195 && normAngle < 345
                  ? "end"
                  : "middle";

              return (
                <g key={cat}>
                  <motion.path
                    d={pathD}
                    fill={`hsla(${hue}, 55%, 52%, ${alpha})`}
                    stroke={`hsla(${hue}, 60%, 60%, 0.3)`}
                    strokeWidth={0.5}
                    initial={{ scale: 0, originX: `${cx}px`, originY: `${cy}px` }}
                    animate={{ scale: 1 }}
                    transition={{
                      delay: 0.1 + i * 0.06,
                      duration: 0.25,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    style={{ transformOrigin: `${cx}px ${cy}px` }}
                  />

                  {/* Score glow dot at outer edge */}
                  {score > 0.3 && (
                    <motion.circle
                      cx={polar(cx, cy, outerR - 3, midAngle).x}
                      cy={polar(cx, cy, outerR - 3, midAngle).y}
                      r={2.5}
                      fill={`hsla(${hue}, 70%, 70%, 0.85)`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 + i * 0.06, duration: 0.22 }}
                    />
                  )}

                  {/* Label */}
                  <motion.text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor={textAnchor}
                    dominantBaseline="middle"
                    fontSize={9.5}
                    fontFamily="serif"
                    fill={
                      score > 0.5
                        ? `hsla(${hue}, 50%, 30%, 0.85)`
                        : "rgba(100,110,140,0.55)"
                    }
                    fontWeight={score > 0.5 ? "600" : "400"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 + i * 0.05, duration: 0.22 }}
                  >
                    {label}
                  </motion.text>
                </g>
              );
            })}

            {/* Center label */}
            <text
              x={cx}
              y={cy - 5}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontFamily="serif"
              fill={`rgba(${SG_GOLD_RGB},0.45)`}
              letterSpacing="0.08em"
            >
              価値観
            </text>
            <text
              x={cx}
              y={cy + 8}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={7.5}
              fontFamily="sans-serif"
              fill={`rgba(${SG_GOLD_RGB},0.3)`}
              letterSpacing="0.05em"
            >
              VALUES
            </text>
          </svg>
        </div>

        {/* Legend: top 3 categories */}
        {(() => {
          const top3 = [...scores]
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .filter((s) => s.score > 0);
          if (top3.length === 0) return null;
          return (
            <motion.div
              className="mt-4 flex flex-wrap gap-2 justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.22 }}
            >
              {top3.map((s) => {
                const hue = CATEGORY_HUE[s.category] ?? 45;
                return (
                  <span
                    key={s.category}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                    style={{
                      background: `hsla(${hue}, 55%, 52%, 0.1)`,
                      border: `1px solid hsla(${hue}, 55%, 52%, 0.25)`,
                      color: `hsla(${hue}, 50%, 30%, 0.85)`,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: `hsla(${hue}, 55%, 52%, 0.8)` }}
                    />
                    {s.label}
                    <span
                      className="font-mono tabular-nums opacity-60"
                      style={{ fontSize: "0.65rem" }}
                    >
                      {Math.round(s.score * 100)}%
                    </span>
                  </span>
                );
              })}
            </motion.div>
          );
        })()}
      </div>
    </GlassCard>
  );
}
