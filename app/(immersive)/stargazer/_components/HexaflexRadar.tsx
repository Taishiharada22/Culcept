// app/stargazer/_components/HexaflexRadar.tsx
// ACT Hexaflex — 6プロセス六角形レーダーチャート
"use client";

import { motion } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import type { HexaflexScore } from "@/lib/stargazer/actHexaflex";

interface Props {
  scores: HexaflexScore[];
  overallFlexibility?: number;
}

// 六角形の頂点計算（上から時計回り）
// プロセスの順序を意図的に配置: 上 = present_moment, 右上 = acceptance, ...
const PROCESS_ORDER = [
  "present_moment",
  "acceptance",
  "committed_action",
  "values",
  "self_as_context",
  "defusion",
] as const;

function hexVertex(index: number, radius: number, cx: number, cy: number) {
  // 上頂点から開始（-90度）
  const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function buildPolygonPoints(
  scores: HexaflexScore[],
  maxRadius: number,
  cx: number,
  cy: number,
): string {
  const scoreMap = new Map(scores.map((s) => [s.process, s.score]));

  return PROCESS_ORDER.map((process, i) => {
    const score = scoreMap.get(process) ?? 0.3;
    const { x, y } = hexVertex(i, score * maxRadius, cx, cy);
    return `${x},${y}`;
  }).join(" ");
}

export default function HexaflexRadar({ scores, overallFlexibility }: Props) {
  const cx = 140;
  const cy = 140;
  const maxR = 100;
  const labelR = 122;

  const scoreMap = new Map(scores.map((s) => [s.process, s]));
  const weakest2 = [...scores].sort((a, b) => a.score - b.score).slice(0, 2);

  const overall =
    overallFlexibility ??
    (scores.length > 0
      ? scores.reduce((s, sc) => s + sc.score, 0) / scores.length
      : 0);

  const polygonPoints = buildPolygonPoints(scores, maxR, cx, cy);

  // グリッドレベル: 0.25, 0.5, 0.75, 1.0
  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const flexLabel =
    overall >= 0.7
      ? "高い柔軟性"
      : overall >= 0.5
        ? "中程度の柔軟性"
        : "成長の余地あり";

  return (
    <FadeInView>
      <GlassCard variant="elevated" padding="lg">
        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2
              className="text-xl font-bold mb-1"
              style={{ color: "rgba(30,35,60,0.9)" }}
            >
              心理的柔軟性
            </h2>
            <p
              className="text-xs tracking-widest uppercase"
              style={{ color: "rgba(120,130,160,0.6)" }}
            >
              ACT Hexaflex
            </p>
          </div>
          <GlassBadge variant="warning">
            {(overall * 100).toFixed(0)}%
          </GlassBadge>
        </div>

        {/* SVG レーダーチャート */}
        <div className="flex justify-center mb-6">
          <svg
            width="280"
            height="280"
            viewBox="0 0 280 280"
            aria-label="ACT Hexaflex レーダーチャート"
          >
            {/* グリッド六角形 */}
            {gridLevels.map((level) => {
              const pts = PROCESS_ORDER.map((_, i) => {
                const { x, y } = hexVertex(i, level * maxR, cx, cy);
                return `${x},${y}`;
              }).join(" ");
              return (
                <polygon
                  key={level}
                  points={pts}
                  fill="none"
                  stroke="rgba(180,190,220,0.3)"
                  strokeWidth="1"
                />
              );
            })}

            {/* 放射状ライン */}
            {PROCESS_ORDER.map((_, i) => {
              const outer = hexVertex(i, maxR, cx, cy);
              return (
                <line
                  key={i}
                  x1={cx}
                  y1={cy}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="rgba(180,190,220,0.25)"
                  strokeWidth="1"
                />
              );
            })}

            {/* スコアポリゴン（アニメーション付き） */}
            <motion.polygon
              points={`${cx},${cy} `.repeat(6).trim()}
              animate={{ points: polygonPoints }}
              initial={{ points: `${cx},${cy} `.repeat(6).trim() }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
              fill="rgba(212,175,55,0.18)"
              stroke="rgba(212,175,55,0.75)"
              strokeWidth="2"
              strokeLinejoin="round"
            />

            {/* 頂点サークル */}
            {PROCESS_ORDER.map((process, i) => {
              const score = scoreMap.get(process)?.score ?? 0.3;
              const { x, y } = hexVertex(i, score * maxR, cx, cy);
              const isHigh = score > 0.7;

              return (
                <g key={process}>
                  {isHigh && (
                    <motion.circle
                      cx={x}
                      cy={y}
                      r={8}
                      fill="rgba(212,175,55,0.2)"
                      animate={{ r: [6, 10, 6] }}
                      transition={{
                        duration: 2.2,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.3,
                      }}
                    />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={4}
                    fill="rgba(212,175,55,0.9)"
                    stroke="white"
                    strokeWidth="1.5"
                  />
                </g>
              );
            })}

            {/* ラベル */}
            {PROCESS_ORDER.map((process, i) => {
              const { x, y } = hexVertex(i, labelR, cx, cy);
              const score = scoreMap.get(process)?.score ?? 0;

              // ラベルの水平アライメント
              let anchor: "start" | "middle" | "end" = "middle";
              if (x < cx - 10) anchor = "end";
              else if (x > cx + 10) anchor = "start";

              // ラベルの垂直オフセット
              let dy = "0.35em";
              if (y < cy - 10) dy = "-0.3em";
              else if (y > cy + 10) dy = "1.1em";

              const label = scoreMap.get(process)?.label ?? process;

              return (
                <g key={`label-${process}`}>
                  <text
                    x={x}
                    y={y}
                    textAnchor={anchor}
                    dy={dy}
                    fontSize="9.5"
                    fontWeight="600"
                    fill={
                      score > 0.7
                        ? "rgba(180,140,20,0.9)"
                        : "rgba(60,70,100,0.75)"
                    }
                    style={{ fontFamily: "sans-serif" }}
                  >
                    {label}
                  </text>
                  <text
                    x={x}
                    y={y}
                    dy={anchor === "middle" && y < cy ? "1.2em" : "2.1em"}
                    textAnchor={anchor}
                    fontSize="8"
                    fill="rgba(120,130,160,0.65)"
                    style={{ fontFamily: "sans-serif" }}
                  >
                    {(score * 100).toFixed(0)}%
                  </text>
                </g>
              );
            })}

            {/* 中央スコア */}
            <text
              x={cx}
              y={cy - 8}
              textAnchor="middle"
              fontSize="18"
              fontWeight="700"
              fill="rgba(180,140,20,0.85)"
              style={{ fontFamily: "sans-serif" }}
            >
              {(overall * 100).toFixed(0)}
            </text>
            <text
              x={cx}
              y={cy + 8}
              textAnchor="middle"
              fontSize="8"
              fill="rgba(100,110,140,0.7)"
              style={{ fontFamily: "sans-serif" }}
            >
              {flexLabel}
            </text>
          </svg>
        </div>

        {/* 全体スコアバー */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-xs font-medium"
              style={{ color: "rgba(60,70,100,0.75)" }}
            >
              総合的な心理的柔軟性
            </span>
            <span
              className="text-sm font-bold"
              style={{ color: "rgba(180,140,20,0.9)" }}
            >
              {flexLabel}
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: "rgba(180,190,220,0.2)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, rgba(212,175,55,0.6), rgba(212,175,55,0.9))",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${overall * 100}%` }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.5 }}
            />
          </div>
        </div>

        {/* 成長ヒント（下位2プロセス） */}
        {weakest2.length > 0 && (
          <div>
            <p
              className="text-xs font-semibold mb-3 uppercase tracking-wider"
              style={{ color: "rgba(120,130,160,0.6)" }}
            >
              成長のヒント
            </p>
            <div className="space-y-2">
              {weakest2.map((sc) => (
                <motion.div
                  key={sc.process}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.22, delay: 0.8 }}
                  className="rounded-2xl px-4 py-3"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(245,248,255,0.4) 100%)",
                    border: "1px solid rgba(180,190,220,0.25)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: "rgba(180,140,20,0.8)" }}
                    >
                      {sc.label}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "rgba(120,130,160,0.55)" }}
                    >
                      {(sc.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "rgba(60,70,100,0.7)" }}
                  >
                    {sc.growthHint}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </GlassCard>
    </FadeInView>
  );
}
