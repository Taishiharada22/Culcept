// lib/stargazer/trajectoryQuery.ts
// 軌道データクエリ — 軸の変化履歴と傾向分析

import type { TraitAxisKey } from "./traitAxes";

export interface TrajectoryPoint {
  date: string;
  score: number;
  context?: string;
}

export interface AxisTrajectory {
  axisId: TraitAxisKey;
  dataPoints: TrajectoryPoint[];
  trend: "stable" | "rising" | "falling" | "oscillating";
  variance: number;
  contextSplits: Record<string, number>;
  latestScore: number;
  latestDate: string;
}

/**
 * スナップショットデータから軌道を構築
 */
export function buildTrajectory(
  axisId: TraitAxisKey,
  snapshots: { score: number; session_date: string; context: string | null }[]
): AxisTrajectory {
  if (snapshots.length === 0) {
    return {
      axisId,
      dataPoints: [],
      trend: "stable",
      variance: 0,
      contextSplits: {},
      latestScore: 0,
      latestDate: "",
    };
  }

  // 日付順にソート
  const sorted = [...snapshots].sort((a, b) =>
    a.session_date.localeCompare(b.session_date)
  );

  const dataPoints: TrajectoryPoint[] = sorted.map((s) => ({
    date: s.session_date,
    score: Number(s.score),
    context: s.context || undefined,
  }));

  // 分散
  const scores = dataPoints.map((d) => d.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;

  // トレンド判定
  const trend = detectTrend(scores);

  // コンテキスト別平均
  const contextSplits: Record<string, number> = {};
  const contextGroups: Record<string, number[]> = {};
  for (const dp of dataPoints) {
    const ctx = dp.context || "global";
    if (!contextGroups[ctx]) contextGroups[ctx] = [];
    contextGroups[ctx].push(dp.score);
  }
  for (const [ctx, group] of Object.entries(contextGroups)) {
    contextSplits[ctx] = group.reduce((a, b) => a + b, 0) / group.length;
  }

  const latest = sorted[sorted.length - 1];

  return {
    axisId,
    dataPoints,
    trend,
    variance,
    contextSplits,
    latestScore: Number(latest.score),
    latestDate: latest.session_date,
  };
}

/**
 * トレンド検出 — 直近のスコア傾向
 */
function detectTrend(
  scores: number[]
): "stable" | "rising" | "falling" | "oscillating" {
  if (scores.length < 3) return "stable";

  const half = Math.floor(scores.length / 2);
  const firstHalf = scores.slice(0, half);
  const secondHalf = scores.slice(half);

  const firstMean =
    firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondMean =
    secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const diff = secondMean - firstMean;

  // 振動検出: 連続する差分の符号変化が多い
  let signChanges = 0;
  for (let i = 1; i < scores.length - 1; i++) {
    const prev = scores[i] - scores[i - 1];
    const next = scores[i + 1] - scores[i];
    if (prev * next < 0) signChanges++;
  }
  const oscillationRate = signChanges / Math.max(1, scores.length - 2);

  if (oscillationRate > 0.5) return "oscillating";
  if (Math.abs(diff) < 0.1) return "stable";
  return diff > 0 ? "rising" : "falling";
}

/**
 * 揺らぎの大きい軸を検出
 */
export function findVolatileAxes(
  trajectories: AxisTrajectory[],
  threshold = 0.05
): AxisTrajectory[] {
  return trajectories
    .filter((t) => t.variance > threshold && t.dataPoints.length >= 3)
    .sort((a, b) => b.variance - a.variance);
}

/**
 * 差分バッジ用テキスト生成
 */
export function getDeltaBadgeText(trajectory: AxisTrajectory): string | null {
  if (trajectory.dataPoints.length < 2) return null;

  const points = trajectory.dataPoints;
  const latest = points[points.length - 1].score;
  const previous = points[points.length - 2].score;
  const diff = latest - previous;

  if (Math.abs(diff) < 0.05) return null;

  const sign = diff > 0 ? "+" : "";
  return `前回比 ${sign}${diff.toFixed(2)}`;
}
