// lib/stargazer/traitEvolution.ts
// 時系列変化追跡 — 特性がどう変化してきたかを分析する
// 心理学的根拠: 発達心理学（変容は段階的に起きる）、Prochaska（変容ステージモデル）

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ── Types ──

export interface TraitSnapshot {
  /** スナップショット取得日 */
  date: string;
  /** 軸スコア */
  axisScores: Partial<Record<TraitAxisKey, number>>;
  /** 観測回数（この時点での累計） */
  totalObservations: number;
}

export interface AxisEvolution {
  axis: TraitAxisKey;
  axisLabel: string;
  /** 変化の方向: positive = 右寄り, negative = 左寄り, stable = 安定 */
  direction: "positive" | "negative" | "stable" | "oscillating";
  /** 変化量（最初→最新のスコア差） */
  totalShift: number;
  /** 変化の速度（1日あたりのスコア変化） */
  velocity: number;
  /** 変動幅（全期間の標準偏差） */
  volatility: number;
  /** 変化の解釈 */
  interpretation: string;
  /** 変化の深層仮説 */
  hypothesis: string;
  /** スナップショットデータ */
  points: { date: string; score: number }[];
}

export interface TraitEvolutionResult {
  /** 最も変化した軸（トップ3） */
  mostChanged: AxisEvolution[];
  /** 最も安定した軸（トップ3） */
  mostStable: AxisEvolution[];
  /** 全体的な変化サマリー */
  summary: string;
  /** 変容ステージ（Prochaska） */
  changeStage: "pre_contemplation" | "contemplation" | "preparation" | "action" | "maintenance";
  changeStageLabel: string;
  changeStageDescription: string;
  /** 変化が加速している軸 */
  accelerating: AxisEvolution[];
}

// ── Analysis ──

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.abs(db - da) / (1000 * 60 * 60 * 24);
}

function interpretDirection(
  axis: TraitAxisKey,
  totalShift: number,
  volatility: number,
): { direction: AxisEvolution["direction"]; interpretation: string; hypothesis: string } {
  const def = TRAIT_AXES.find((a) => a.id === axis);
  const leftLabel = def?.labelLeft ?? "左";
  const rightLabel = def?.labelRight ?? "右";
  const absShift = Math.abs(totalShift);

  if (volatility > 0.2 && absShift < 0.15) {
    return {
      direction: "oscillating",
      interpretation: `「${leftLabel}↔${rightLabel}」の間で揺れ続けている。まだ定まっていない領域。この揺れ自体が、あなたがこの軸で「答えを探している」証拠。`,
      hypothesis: "この軸は、状況や感情の状態によって変動しやすい。一つの答えに落ち着くのではなく、状況に応じて使い分けるタイプかもしれない。",
    };
  }

  if (absShift < 0.1) {
    return {
      direction: "stable",
      interpretation: `この特性は安定している。観測を重ねてもブレない、あなたの核のひとつ。`,
      hypothesis: "早い段階で確立された特性か、環境に左右されにくいアイデンティティの一部。",
    };
  }

  const shiftLabel = totalShift > 0 ? rightLabel : leftLabel;
  return {
    direction: totalShift > 0 ? "positive" : "negative",
    interpretation: `「${shiftLabel}」の方向に変化している。${absShift > 0.3 ? "顕著な" : "緩やかな"}シフトが起きている。`,
    hypothesis: absShift > 0.3
      ? `意識的または無意識的に「${shiftLabel}」を選ぶ場面が増えている。生活環境の変化や内面の成長が影響している可能性がある。`
      : `小さな変化が積み重なっている。本人は気づいていないかもしれないが、ゆっくりと自分の立ち位置が動いている。`,
  };
}

function inferChangeStage(
  evolutions: AxisEvolution[],
  totalObservations: number,
): {
  stage: TraitEvolutionResult["changeStage"];
  label: string;
  description: string;
} {
  const changedCount = evolutions.filter(
    (e) => Math.abs(e.totalShift) > 0.15,
  ).length;
  const oscillatingCount = evolutions.filter(
    (e) => e.direction === "oscillating",
  ).length;

  if (totalObservations < 5) {
    return {
      stage: "pre_contemplation",
      label: "観測開始期",
      description: "まだ自分の変化のパターンが見えてくる前の段階。観測を重ねることで、変化の輪郭が浮かび上がってくる。",
    };
  }

  if (oscillatingCount > changedCount) {
    return {
      stage: "contemplation",
      label: "探索期",
      description: "複数の軸で揺れが見られる。自分の中で「本当はどうしたいか」を探っている段階。この揺れは迷いではなく、深い自己探索の証。",
    };
  }

  if (changedCount >= 3) {
    return {
      stage: "action",
      label: "変容期",
      description: "複数の特性が同時に動いている。あなたの内面で大きな再編成が起きている。この時期の変化は、後から振り返ると転機だったと気づくことが多い。",
    };
  }

  if (changedCount >= 1) {
    return {
      stage: "preparation",
      label: "準備期",
      description: "一部の特性に変化の兆しが見える。まだ大きな変容の手前だが、内面では準備が始まっている。",
    };
  }

  return {
    stage: "maintenance",
    label: "安定期",
    description: "特性が安定している。あなたのアイデンティティがしっかりと定まっている時期。安定は停滞ではない——深く根を張っている状態。",
  };
}

/**
 * 複数のスナップショットから特性の時系列変化を分析する
 */
export function analyzeTraitEvolution(
  snapshots: TraitSnapshot[],
): TraitEvolutionResult | null {
  if (snapshots.length < 2) return null;

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalDays = daysBetween(first.date, last.date);

  if (totalDays < 1) return null;

  // Analyze each axis
  const evolutions: AxisEvolution[] = [];

  for (const axisDef of TRAIT_AXES) {
    const axisId = axisDef.id as TraitAxisKey;
    const points: { date: string; score: number }[] = [];

    for (const snap of sorted) {
      const score = snap.axisScores[axisId];
      if (score !== undefined) {
        points.push({ date: snap.date, score });
      }
    }

    if (points.length < 2) continue;

    const scores = points.map((p) => p.score);
    const totalShift = scores[scores.length - 1] - scores[0];
    const velocity = totalShift / totalDays;
    const volatility = stdDev(scores);

    const { direction, interpretation, hypothesis } = interpretDirection(
      axisId,
      totalShift,
      volatility,
    );

    evolutions.push({
      axis: axisId,
      axisLabel: `${axisDef.labelLeft} ↔ ${axisDef.labelRight}`,
      direction,
      totalShift,
      velocity,
      volatility,
      interpretation,
      hypothesis,
      points,
    });
  }

  if (evolutions.length === 0) return null;

  // Sort by absolute change
  const byChange = [...evolutions].sort(
    (a, b) => Math.abs(b.totalShift) - Math.abs(a.totalShift),
  );
  const byStability = [...evolutions].sort(
    (a, b) => a.volatility - b.volatility,
  );

  // Find accelerating axes (recent velocity > overall velocity)
  const accelerating: AxisEvolution[] = [];
  if (sorted.length >= 3) {
    const midpoint = Math.floor(sorted.length / 2);
    for (const evo of evolutions) {
      const recentPoints = evo.points.slice(midpoint);
      if (recentPoints.length < 2) continue;
      const recentShift =
        recentPoints[recentPoints.length - 1].score - recentPoints[0].score;
      const recentDays = daysBetween(
        recentPoints[0].date,
        recentPoints[recentPoints.length - 1].date,
      );
      if (recentDays < 1) continue;
      const recentVelocity = Math.abs(recentShift / recentDays);
      if (recentVelocity > Math.abs(evo.velocity) * 1.5 && recentVelocity > 0.01) {
        accelerating.push(evo);
      }
    }
  }

  const changeStageInfo = inferChangeStage(evolutions, last.totalObservations);

  // Summary
  const mostChanged = byChange.slice(0, 3);
  const changedLabels = mostChanged
    .filter((e) => Math.abs(e.totalShift) > 0.1)
    .map((e) => `「${e.axisLabel}」`)
    .join("、");

  const summary = changedLabels
    ? `${Math.round(totalDays)}日間の観測で、${changedLabels}に変化が見られます。現在は「${changeStageInfo.label}」のフェーズにいます。`
    : `${Math.round(totalDays)}日間の観測を通じて、あなたの特性は安定しています。核となるアイデンティティが確立されている状態です。`;

  return {
    mostChanged: byChange.slice(0, 3),
    mostStable: byStability.slice(0, 3),
    summary,
    changeStage: changeStageInfo.stage,
    changeStageLabel: changeStageInfo.label,
    changeStageDescription: changeStageInfo.description,
    accelerating,
  };
}
