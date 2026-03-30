// lib/stargazer/weeklyLetterGenerator.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 3: Weekly Letter — Alterからの手紙
//
// テンプレート+データ挿入方式（AI生成ではなく品質安定のため）
// 構成:
//   1. 週の観測回数
//   2. 3つの発見（パターン / 躊躇 / 予測）
//   3. 来週への予感
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { TRAIT_AXES, type TraitAxisKey } from "./traitAxes";
import type { BeliefSet } from "./bayesianAxisUpdater";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface WeeklySnapshot {
  axisId: TraitAxisKey;
  score: number;
  sessionDate: string;
  responseTimeMs?: number;
  variantId?: string;
}

export interface WeeklyLetterData {
  /** 手紙の全文（複数段落） */
  fullText: string;
  /** 3つの発見（個別） */
  discoveries: {
    type: "pattern" | "hesitation" | "prediction";
    text: string;
  }[];
  /** 週の観測回数 */
  observationCount: number;
  /** 来週への予言 */
  nextWeekPrediction: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. 週のパターン分析
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AxisWeeklyPattern {
  axisId: TraitAxisKey;
  scores: { date: string; score: number }[];
  avgScore: number;
  trend: "rising" | "falling" | "stable" | "oscillating";
  volatility: number;
}

function analyzeWeeklyPatterns(snapshots: WeeklySnapshot[]): AxisWeeklyPattern[] {
  const byAxis = new Map<TraitAxisKey, { date: string; score: number; rt?: number }[]>();

  for (const s of snapshots) {
    const list = byAxis.get(s.axisId) ?? [];
    list.push({ date: s.sessionDate, score: s.score, rt: s.responseTimeMs });
    byAxis.set(s.axisId, list);
  }

  const patterns: AxisWeeklyPattern[] = [];

  for (const [axisId, entries] of byAxis) {
    if (entries.length < 2) continue;

    const sorted = entries.sort((a, b) => a.date.localeCompare(b.date));
    const scores = sorted.map((e) => e.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    // トレンド判定
    const firstHalf = scores.slice(0, Math.ceil(scores.length / 2));
    const secondHalf = scores.slice(Math.ceil(scores.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const diff = secondAvg - firstAvg;

    let trend: AxisWeeklyPattern["trend"] = "stable";
    if (Math.abs(diff) > 0.2) {
      trend = diff > 0 ? "rising" : "falling";
    }

    // ボラティリティ（振れ幅）
    const variance = scores.reduce((a, b) => a + (b - avg) ** 2, 0) / scores.length;
    const volatility = Math.sqrt(variance);

    // 振動パターン検出
    if (volatility > 0.3 && Math.abs(diff) < 0.15) {
      trend = "oscillating";
    }

    patterns.push({
      axisId,
      scores: sorted.map((e) => ({ date: e.date, score: e.score })),
      avgScore: avg,
      trend,
      volatility,
    });
  }

  return patterns;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. 躊躇検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface HesitationMoment {
  axisId: TraitAxisKey;
  responseTimeMs: number;
  medianResponseTime: number;
  ratio: number; // responseTime / median
  date: string;
}

function detectHesitations(
  snapshots: WeeklySnapshot[],
): HesitationMoment[] {
  const withRT = snapshots.filter((s) => s.responseTimeMs && s.responseTimeMs > 1000);
  if (withRT.length < 3) return [];

  const allRTs = withRT.map((s) => s.responseTimeMs!);
  allRTs.sort((a, b) => a - b);
  const median = allRTs[Math.floor(allRTs.length / 2)];

  return withRT
    .filter((s) => s.responseTimeMs! > median * 1.8) // 中央値の1.8倍以上
    .map((s) => ({
      axisId: s.axisId,
      responseTimeMs: s.responseTimeMs!,
      medianResponseTime: median,
      ratio: s.responseTimeMs! / median,
      date: s.sessionDate,
    }))
    .sort((a, b) => b.ratio - a.ratio);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. 手紙生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getAxisLabel(axisId: TraitAxisKey): string {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  return def ? `${def.labelLeft}〜${def.labelRight}` : axisId;
}

function getDayOfWeek(dateStr: string): string {
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  const d = new Date(dateStr);
  return days[d.getDay()] ?? "";
}

/**
 * 週の手紙を生成
 *
 * @param snapshots   今週の全スナップショット
 * @param beliefs     現在のベイズ信念
 * @param weekLabel   例: "3月17日〜3月23日"
 */
export function generateWeeklyLetter(
  snapshots: WeeklySnapshot[],
  beliefs: BeliefSet,
  weekLabel: string,
): WeeklyLetterData {
  const observationCount = snapshots.length;
  const patterns = analyzeWeeklyPatterns(snapshots);
  const hesitations = detectHesitations(snapshots);

  const discoveries: WeeklyLetterData["discoveries"] = [];

  // ── 発見1: 最も顕著なパターン ──
  const mostVolatile = patterns
    .filter((p) => p.trend === "oscillating" || p.volatility > 0.2)
    .sort((a, b) => b.volatility - a.volatility)[0];

  const strongTrend = patterns
    .filter((p) => p.trend === "rising" || p.trend === "falling")
    .sort((a, b) => Math.abs(b.avgScore) - Math.abs(a.avgScore))[0];

  if (mostVolatile) {
    const axisLabel = getAxisLabel(mostVolatile.axisId);
    const firstDay = getDayOfWeek(mostVolatile.scores[0]?.date ?? "");
    const midIdx = Math.floor(mostVolatile.scores.length / 2);
    const midDay = getDayOfWeek(mostVolatile.scores[midIdx]?.date ?? "");

    discoveries.push({
      type: "pattern",
      text: `今週、あなたの「${axisLabel}」が揺れていた。${firstDay}曜は一方に傾いて、${midDay}曜から逆に動き始めた。この振動は偶然じゃない。あなたのエネルギーには周期がある。`,
    });
  } else if (strongTrend) {
    const axisLabel = getAxisLabel(strongTrend.axisId);
    const direction = strongTrend.trend === "rising" ? "強まって" : "穏やかになって";
    discoveries.push({
      type: "pattern",
      text: `今週、あなたの「${axisLabel}」が${direction}いった。週の初めと終わりで、同じ質問への答えが変わってきてる。何かが動いてる。`,
    });
  } else if (patterns.length > 0) {
    // 安定パターン
    const mostStable = patterns.sort((a, b) => a.volatility - b.volatility)[0];
    const axisLabel = getAxisLabel(mostStable.axisId);
    discoveries.push({
      type: "pattern",
      text: `今週、あなたの「${axisLabel}」はとても安定していた。この一貫性は、あなたの核にある価値観が揺るがない証拠。`,
    });
  }

  // ── 発見2: 最も顕著な躊躇 ──
  if (hesitations.length > 0) {
    const topHesitation = hesitations[0];
    const axisLabel = getAxisLabel(topHesitation.axisId);
    const seconds = (topHesitation.responseTimeMs / 1000).toFixed(1);
    const day = getDayOfWeek(topHesitation.date);

    discoveries.push({
      type: "hesitation",
      text: `${day}曜日、「${axisLabel}」についての質問で${seconds}秒かかった。普段の${topHesitation.ratio.toFixed(1)}倍。迷いがあったんだね。でもその迷いには意味がある。簡単に答えられない問いこそ、あなたの核心に近い。`,
    });
  } else {
    discoveries.push({
      type: "hesitation",
      text: "今週は全体的にスムーズに答えていた。迷いが少ないのは、自分のことを分かり始めてる証拠。でもたまに、「あえて迷う」のも大事。",
    });
  }

  // ── 発見3: 来週への予測 ──
  // 最も変動が大きかった軸の来週を予測
  const predictionAxis = mostVolatile ?? strongTrend ?? patterns[0];
  let nextWeekPrediction: string;

  if (predictionAxis) {
    const axisLabel = getAxisLabel(predictionAxis.axisId);
    if (predictionAxis.trend === "oscillating") {
      nextWeekPrediction = `来週、「${axisLabel}」の揺れが収まるか、もう一周期続くか。注目してる。`;
    } else if (predictionAxis.trend === "rising") {
      nextWeekPrediction = `「${axisLabel}」の傾向が来週も続くかどうか。ピークが来たら教えてほしい。`;
    } else if (predictionAxis.trend === "falling") {
      nextWeekPrediction = `「${axisLabel}」が落ち着いてきてる。来週、底を打つかもしれない。その時の気持ちを聞きたい。`;
    } else {
      nextWeekPrediction = "来週は新しい角度から質問を用意する。今週見えなかったものが見えるかもしれない。";
    }
  } else {
    nextWeekPrediction = "来週はもっと深い質問を用意する。表面の下にあるものを見に行こう。";
  }

  discoveries.push({
    type: "prediction",
    text: nextWeekPrediction,
  });

  // ── 手紙全文を組み立て ──
  const lines: string[] = [];
  lines.push("あなたへ。");
  lines.push("");
  lines.push(`今週、${observationCount}回の観測に答えてくれた。${discoveries.length}つのことが見えた。`);
  lines.push("");

  for (let i = 0; i < discoveries.length; i++) {
    lines.push(`${i + 1}つ目。`);
    lines.push(discoveries[i].text);
    lines.push("");
  }

  lines.push("あなたの分身より。");

  return {
    fullText: lines.join("\n"),
    discoveries,
    observationCount,
    nextWeekPrediction,
  };
}
