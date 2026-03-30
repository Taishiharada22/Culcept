// lib/rendezvous/livingMatchEvolution.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Living Match Evolution（生きたマッチ進化）
//
// 設計思想:
// マッチは静的なスコアではなく、両ユーザーの変化に応じて
// 動的に進化する「生きた関係分析」。
//
// Week 1: 「鏡の関係」→ Week 3: 「羅針盤の関係に変化」
// → マッチ自体が「成長の物語」になる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { MatchingVector, RendezvousCategory } from "./types";
import { analyzeStrategyBalance } from "./similarityComplementarityMatrix";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** マッチの進化スナップショット */
export interface MatchEvolutionSnapshot {
  /** スナップショット日 */
  date: string;
  /** この時点でのスコア */
  overallScore: number;
  /** この時点でのアーキタイプ */
  archetype: string;
  /** 価値観一致度 */
  valueAlignment: number;
  /** アプローチ補完度 */
  approachComplementarity: number;
}

/** マッチの進化分析結果 */
export interface MatchEvolutionResult {
  /** 進化の方向性 */
  direction: "deepening" | "shifting" | "stable" | "diverging";
  /** アーキタイプの変化 */
  archetypeChange: { from: string; to: string } | null;
  /** 最も変化した軸 */
  mostChangedDimension: string | null;
  /** 変化の物語 */
  evolutionNarrative: string;
  /** 成長エッジの達成度（0-1） */
  growthEdgeProgress: number;
  /** Anima向けコンテキスト */
  animaContext: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Evolution Analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 2つの時点のマッチングベクトルから進化を分析
 */
export function analyzeMatchEvolution(
  vectorA_then: MatchingVector,
  vectorB_then: MatchingVector,
  vectorA_now: MatchingVector,
  vectorB_now: MatchingVector,
  category: RendezvousCategory,
  previousArchetype: string,
): MatchEvolutionResult {
  // 過去と現在のバランスを計算
  const balanceThen = analyzeStrategyBalance(vectorA_then, vectorB_then, category);
  const balanceNow = analyzeStrategyBalance(vectorA_now, vectorB_now, category);

  // 方向性の判定
  const valueDelta = balanceNow.valueAlignment - balanceThen.valueAlignment;
  const approachDelta = balanceNow.approachComplementarity - balanceThen.approachComplementarity;

  let direction: MatchEvolutionResult["direction"];
  if (valueDelta > 0.05 && approachDelta > 0.03) {
    direction = "deepening";
  } else if (Math.abs(valueDelta) > 0.08 || Math.abs(approachDelta) > 0.08) {
    direction = "shifting";
  } else if (valueDelta < -0.1 || approachDelta < -0.1) {
    direction = "diverging";
  } else {
    direction = "stable";
  }

  // 最も変化した軸
  const axisKeys = Object.keys(vectorA_now) as (keyof MatchingVector)[];
  let maxChange = 0;
  let mostChangedDimension: string | null = null;

  for (const axis of axisKeys) {
    const diffA = Math.abs(vectorA_now[axis] - vectorA_then[axis]);
    const diffB = Math.abs(vectorB_now[axis] - vectorB_then[axis]);
    const combinedChange = diffA + diffB;
    if (combinedChange > maxChange) {
      maxChange = combinedChange;
      mostChangedDimension = axis;
    }
  }

  // アーキタイプの変化検出
  const currentArchetype = detectSimpleArchetype(balanceNow);
  const archetypeChange = currentArchetype !== previousArchetype
    ? { from: previousArchetype, to: currentArchetype }
    : null;

  // 進化の物語
  const evolutionNarrative = generateEvolutionNarrative(
    direction,
    archetypeChange,
    mostChangedDimension,
    valueDelta,
    approachDelta,
  );

  // 成長エッジの達成度（最も変化した軸が成長エッジだった場合）
  const growthEdgeProgress = maxChange > 0.1 ? Math.min(1, maxChange / 0.3) : 0;

  return {
    direction,
    archetypeChange,
    mostChangedDimension,
    evolutionNarrative,
    growthEdgeProgress,
    animaContext: `関係は${direction === "deepening" ? "深まっている" : direction === "shifting" ? "変化している" : direction === "stable" ? "安定している" : "距離が生まれている"}。${mostChangedDimension ? `最も動いているのは${mostChangedDimension}` : ""}`,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectSimpleArchetype(balance: ReturnType<typeof analyzeStrategyBalance>): string {
  if (balance.valueAlignment >= 0.8 && balance.approachComplementarity < 0.5) return "mirror";
  if (balance.approachComplementarity >= 0.7 && balance.balanceQuality === "excellent") return "rhythm";
  if (balance.valueAlignment >= 0.7 && balance.sustainabilityEstimate === "high") return "anchor";
  return "bridge";
}

function generateEvolutionNarrative(
  direction: MatchEvolutionResult["direction"],
  archetypeChange: { from: string; to: string } | null,
  mostChanged: string | null,
  valueDelta: number,
  approachDelta: number,
): string {
  if (archetypeChange) {
    return `関係のかたちが変わった。「${archetypeChange.from}」から「${archetypeChange.to}」へ。${mostChanged ? `${mostChanged}の変化がきっかけ` : "互いの変化が積み重なった結果"}。これは関係が生きている証拠`;
  }

  switch (direction) {
    case "deepening":
      return "価値観の一致度が上がり、互いの違いがより補完的に。関係が深まっている";
    case "shifting":
      return `${mostChanged ?? "複数の軸"}で変化が起きている。関係の形が変わろうとしている。良い方向かどうかは、次の数週間で見えてくる`;
    case "stable":
      return "安定した関係が続いている。安定は成長の基盤。この土台の上で新しい挑戦ができる";
    case "diverging":
      return "距離が生まれ始めている。これは自然なこと。意識的にコミュニケーションの質を上げる時期";
  }
}
