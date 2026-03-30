// app/stargazer/_components/AxisOverviewPanel.tsx
// 15軸の可視化パネル — 主要6〜8軸を中心に表示 + 軌道スパークライン
"use client";

import { motion } from "framer-motion";
import { TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { AxisTrajectory } from "@/lib/stargazer/trajectoryQuery";
import { getDeltaBadgeText } from "@/lib/stargazer/trajectoryQuery";
import TrajectorySparkline from "./TrajectorySparkline";

interface Props {
  axisScores: Record<string, number>;
  /** 全軸を表示するか、主要軸のみか */
  showAll?: boolean;
  lightMode?: boolean;
  /** 軌道データ（あれば表示） */
  trajectories?: AxisTrajectory[];
}

export default function AxisOverviewPanel({
  axisScores,
  showAll = false,
  lightMode = true,
  trajectories,
}: Props) {
  const textPrimary = lightMode
    ? "rgba(30,40,60,0.85)"
    : "rgba(30,40,60,0.85)";
  const textSecondary = lightMode
    ? "rgba(60,70,90,0.6)"
    : "rgba(100,105,130,0.6)";
  const textTertiary = lightMode
    ? "rgba(80,90,110,0.4)"
    : "rgba(120,125,140,0.4)";
  const barTrack = lightMode ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.04)";
  const barFill = lightMode
    ? "rgba(160,145,110,0.5)"
    : "rgba(190,170,110,0.5)";
  const centerLine = lightMode
    ? "rgba(0,0,0,0.08)"
    : "rgba(160,170,200,0.15)";

  // スコアの絶対値が大きい順にソートして主要軸を決定
  const sortedAxes = [...TRAIT_AXES].sort((a, b) => {
    const scoreA = Math.abs(axisScores[a.id] ?? 0);
    const scoreB = Math.abs(axisScores[b.id] ?? 0);
    return scoreB - scoreA;
  });

  const displayAxes = showAll ? sortedAxes : sortedAxes.slice(0, 8);

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div
          className="h-px flex-1"
          style={{
            background: lightMode
              ? "linear-gradient(to right, rgba(160,145,110,0.15), transparent)"
              : "linear-gradient(to right, rgba(160,170,200,0.12), transparent)",
          }}
        />
        <span
          className="font-mono-sg text-xs tracking-[0.25em] uppercase font-medium"
          style={{ color: textTertiary }}
        >
          性格軸マップ
        </span>
        <div
          className="h-px flex-1"
          style={{
            background: lightMode
              ? "linear-gradient(to left, rgba(160,145,110,0.15), transparent)"
              : "linear-gradient(to left, rgba(160,170,200,0.12), transparent)",
          }}
        />
      </div>

      {/* 軸リスト */}
      <div className="space-y-3">
        {displayAxes.map((axis, i) => {
          const score = axisScores[axis.id] ?? 0;
          // -1〜1 を 0〜100% に変換（中央=50%）
          const pct = ((score + 1) / 2) * 100;

          return (
            <motion.div
              key={axis.id}
              initial={{ opacity: 0, x: -6 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.05 + i * 0.04 }}
            >
              {/* ラベル行 */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className="font-body text-xs"
                  style={{ color: textSecondary }}
                >
                  {axis.labelLeft}
                </span>
                <div className="flex items-center gap-1.5 mx-2">
                  <span
                    className="font-mono-sg text-xs tabular-nums"
                    style={{ color: textTertiary }}
                  >
                    {score > 0 ? "+" : ""}
                    {score.toFixed(2)}
                  </span>
                  {/* Delta badge */}
                  {(() => {
                    const traj = trajectories?.find((t) => t.axisId === axis.id);
                    if (!traj) return null;
                    const badge = getDeltaBadgeText(traj);
                    if (!badge) return null;
                    const isOscillating = traj.trend === "oscillating";
                    return (
                      <span
                        className="font-mono-sg text-[8px] px-1.5 py-0.5 rounded-full"
                        style={{
                          background: isOscillating
                            ? "rgba(244,114,182,0.12)"
                            : "rgba(190,170,110,0.12)",
                          color: isOscillating
                            ? "rgba(244,114,182,0.7)"
                            : "rgba(170,150,90,0.7)",
                        }}
                      >
                        {isOscillating ? "揺らぎ" : badge}
                      </span>
                    );
                  })()}
                </div>
                <span
                  className="font-body text-xs text-right"
                  style={{ color: textSecondary }}
                >
                  {axis.labelRight}
                </span>
              </div>
              {/* スパークライン */}
              {(() => {
                const traj = trajectories?.find((t) => t.axisId === axis.id);
                if (!traj || traj.dataPoints.length < 2) return null;
                return (
                  <div className="mb-1">
                    <TrajectorySparkline trajectory={traj} width={120} height={24} />
                  </div>
                );
              })()}

              {/* バー（中央が0、左が-1、右が+1） */}
              <div
                className="relative h-2 rounded-full overflow-hidden"
                style={{ background: barTrack }}
              >
                {/* 中央線 */}
                <div
                  className="absolute top-0 bottom-0 w-px left-1/2"
                  style={{ background: centerLine }}
                />

                {/* 値の表示 */}
                {score >= 0 ? (
                  <motion.div
                    className="absolute top-0 bottom-0 rounded-r-full"
                    style={{
                      left: "50%",
                      background: barFill,
                    }}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${(score / 1) * 50}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.04, duration: 0.25 }}
                  />
                ) : (
                  <motion.div
                    className="absolute top-0 bottom-0 rounded-l-full"
                    style={{
                      right: "50%",
                      background: barFill,
                    }}
                    initial={{ width: 0 }}
                    whileInView={{
                      width: `${(Math.abs(score) / 1) * 50}%`,
                    }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.04, duration: 0.25 }}
                  />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {!showAll && displayAxes.length < TRAIT_AXES.length && (
        <p
          className="font-body text-xs text-center mt-2"
          style={{ color: textTertiary }}
        >
          主要 {displayAxes.length} 軸を表示中（全 {TRAIT_AXES.length} 軸）
        </p>
      )}
    </div>
  );
}
