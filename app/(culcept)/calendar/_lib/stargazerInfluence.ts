/**
 * Stargazer 影響度計測
 *
 * Calendar提案がどの程度 Stargazer のデータ（ペルソナ・満足度・心理適応・ギャップ）
 * に基づいているかを定量化する。
 *
 * 計測対象:
 *  1. Persona影響 — PCカラー・スタイル軸がアイテム選択スコアに与える差分
 *  2. 満足度学習影響 — 過去の着用満足度がスコアに与える差分
 *  3. 心理適応影響 — ストレス・ムード等によるSYNCスコア調整
 *  4. ギャップ影響 — クローゼット不足が提案に与える影響
 *
 * 使い方: computeStargazerInfluence() に現在のコンテキストを渡すと
 *         0-100のスコアと内訳を返す。
 */

import type { CalendarPersonaProfile } from "./personaBoost";
import { candidatePersonaBoost } from "./personaBoost";
import type { SatisfactionProfile } from "./types";
import type { OutfitAdaptation, ObservationContext } from "./aneurasyncIntegration";
import type { GapAnalysis } from "./wardrobeGapDetector";
import type { WardrobeItem } from "@/app/my-style/_lib/types";
import { satisfactionItemBoost } from "./satisfactionLearner";

/* ── 影響度の内訳 ── */
export interface StargazerInfluence {
  /** 総合影響度 0-100 (0=データなし, 100=全面的に効いている) */
  totalScore: number;
  /** 各データソースの影響度 0-100 */
  dimensions: {
    persona: number;       // PCカラー・スタイル軸
    satisfaction: number;  // 満足度学習
    adaptation: number;    // 心理状態適応
    gap: number;           // クローゼット分析
  };
  /** 効いているデータソースの数 (0-4) */
  activeCount: number;
  /** 一言サマリー */
  summary: string;
}

/* ── 影響度レベル ── */
export type InfluenceLevel = "none" | "low" | "medium" | "high";

export function getInfluenceLevel(score: number): InfluenceLevel {
  if (score <= 5) return "none";
  if (score <= 30) return "low";
  if (score <= 60) return "medium";
  return "high";
}

/* ── メイン計測関数 ── */
export function computeStargazerInfluence(ctx: {
  persona: CalendarPersonaProfile | null;
  satisfaction: SatisfactionProfile | null;
  adaptation: OutfitAdaptation | null;
  observation: ObservationContext | null;
  gap: GapAnalysis | null;
  /** 提案に含まれるアイテム (影響度の具体性を高める) */
  proposalItems?: WardrobeItem[];
}): StargazerInfluence {
  const dims = {
    persona: measurePersonaInfluence(ctx.persona, ctx.proposalItems),
    satisfaction: measureSatisfactionInfluence(ctx.satisfaction, ctx.proposalItems),
    adaptation: measureAdaptationInfluence(ctx.adaptation, ctx.observation),
    gap: measureGapInfluence(ctx.gap),
  };

  const active = Object.values(dims).filter(v => v > 5);
  const activeCount = active.length;

  // 加重平均 (persona と satisfaction は実際にスコアリングに影響するので重め)
  const weights = { persona: 0.35, satisfaction: 0.30, adaptation: 0.20, gap: 0.15 };
  const totalScore = Math.round(
    dims.persona * weights.persona +
    dims.satisfaction * weights.satisfaction +
    dims.adaptation * weights.adaptation +
    dims.gap * weights.gap,
  );

  return {
    totalScore,
    dimensions: dims,
    activeCount,
    summary: buildSummary(dims, activeCount),
  };
}

/* ── 1. Persona影響 ── */
function measurePersonaInfluence(
  persona: CalendarPersonaProfile | null,
  items?: WardrobeItem[],
): number {
  if (!persona || persona.completeness < 10) return 0;

  let score = 0;

  // PCシーズンの有無 (配色ブーストが効く)
  if (persona.pcSeason4) score += 25;

  // スタイル軸の偏り (中立でなければ効いている)
  const axes = persona.styleAxis;
  const axisMagnitude =
    Math.abs(axes.minimal_vs_maximal) +
    Math.abs(axes.classic_vs_trendy) +
    Math.abs(axes.cautious_vs_bold) +
    Math.abs(axes.function_vs_expression);
  // 4軸合計の最大値は4.0。0.25以上の偏りがあれば効いていると見なす
  score += Math.min(25, Math.round(axisMagnitude * 15));

  // completeness による重み (データが充実しているほど信頼性UP)
  score = Math.round(score * Math.min(1, persona.completeness / 60));

  // 実際のアイテムへのブースト差分 (具体的な影響)
  if (items && items.length > 0) {
    const totalBoost = items.reduce((sum, item) => sum + candidatePersonaBoost(persona, item), 0);
    const avgBoost = totalBoost / items.length;
    // candidatePersonaBoost は最大 7 (pcColor 3 + silhouette 2 + material 2)
    score += Math.min(50, Math.round((avgBoost / 7) * 50));
  }

  return Math.min(100, score);
}

/* ── 2. 満足度学習影響 ── */
function measureSatisfactionInfluence(
  satisfaction: SatisfactionProfile | null,
  items?: WardrobeItem[],
): number {
  if (!satisfaction || satisfaction.dataPoints < 5) return 0;

  let score = 0;

  // データ量ベースの基礎スコア
  score += Math.min(30, Math.round(satisfaction.dataPoints * 2));

  // 実際のアイテムに対するブースト差分
  if (items && items.length > 0) {
    let boostSum = 0;
    let hasData = 0;
    for (const item of items) {
      const boost = satisfactionItemBoost(satisfaction, item.id);
      if (boost !== 0) {
        boostSum += Math.abs(boost);
        hasData++;
      }
    }
    if (hasData > 0) {
      // satisfactionItemBoost は -25〜+8 の範囲
      const avgImpact = boostSum / items.length;
      score += Math.min(70, Math.round(avgImpact * 7));
    }
  }

  return Math.min(100, score);
}

/* ── 3. 心理適応影響 ── */
function measureAdaptationInfluence(
  adaptation: OutfitAdaptation | null,
  observation: ObservationContext | null,
): number {
  if (!adaptation || !observation) return 0;
  if (observation.confidence < 0.2) return 0;

  // 各シフトの絶対値が大きいほど影響が大きい
  const formalityImpact = Math.abs(adaptation.formalityShift) * 30;
  const colorImpact = Math.abs(adaptation.colorIntensityShift) * 25;
  const comfortImpact = Math.abs(adaptation.comfortPriority - 0.5) * 40; // 0.5がニュートラル
  const noveltyImpact = Math.abs(adaptation.noveltyTolerance - 0.5) * 20;

  const rawScore = formalityImpact + colorImpact + comfortImpact + noveltyImpact;

  // confidence で重み付け
  return Math.min(100, Math.round(rawScore * observation.confidence));
}

/* ── 4. ギャップ影響 ── */
function measureGapInfluence(gap: GapAnalysis | null): number {
  if (!gap) return 0;
  if (gap.gaps.length === 0) return 0;

  const highCount = gap.gaps.filter(g => g.severity === "high").length;
  const mediumCount = gap.gaps.filter(g => g.severity === "medium").length;

  // high があるほど提案に影響 (不足カテゴリを避ける)
  let score = highCount * 30 + mediumCount * 15;

  // overallScore が低いほどギャップの影響が大きい
  if (gap.overallScore < 50) score += 20;

  return Math.min(100, score);
}

/* ── サマリー生成 ── */
function buildSummary(
  dims: StargazerInfluence["dimensions"],
  activeCount: number,
): string {
  if (activeCount === 0) return "パーソナルデータなし";

  // 最も影響の大きい軸を特定
  const sorted = Object.entries(dims)
    .filter(([, v]) => v > 5)
    .sort(([, a], [, b]) => b - a);

  const labels: Record<string, string> = {
    persona: "パーソナルカラー・スタイル軸",
    satisfaction: "満足度学習",
    adaptation: "心理状態",
    gap: "クローゼット分析",
  };

  if (sorted.length === 1) {
    return `${labels[sorted[0][0]]}が主に反映`;
  }
  return `${labels[sorted[0][0]]}と${labels[sorted[1][0]]}が反映`;
}
