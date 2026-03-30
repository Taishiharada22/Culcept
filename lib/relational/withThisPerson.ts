// ============================================================
// Feature 1: "相手の前での自分" (With this person, your style becomes...)
// 相手によって引き出される・抑えられる自分の側面を導出
// ============================================================

import { TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { similarityScore } from "@/lib/rendezvous/similarityScore";
import type { TraitInfluence, WithThisPersonResult } from "./types";

// safety / relational_deep カテゴリは相手に見せない
const ALLOWED_CATEGORIES = new Set(["core", "relational", "emotional", "motion", "aesthetic"]);

const INFLUENCE_NARRATIVES: Partial<
  Record<TraitAxisKey, { amplified: string; suppressed: string; pulled: string }>
> = {
  introvert_vs_extrovert: {
    amplified: "この相手とは、あなたの社交的なエネルギーが共鳴しやすい",
    suppressed: "この相手の静けさに、あなたの外向性がやや穏やかになる",
    pulled: "この相手の前では、あなたの中の外向的な面が引き出されやすい",
  },
  individual_vs_social: {
    amplified: "この相手とは、一人の深みを共有しやすい",
    suppressed: "この相手の集団性に、あなたの独立心がやや控えめになる",
    pulled: "この相手の前では、あなたの中のチーム感覚が引き出されやすい",
  },
  cautious_vs_bold: {
    amplified: "この相手とは、あなたの大胆さが自然に発揮される",
    suppressed: "この相手の慎重さに、あなたの冒険心がやや落ち着く",
    pulled: "この相手の前では、あなたの慎重な面が引き出されやすい",
  },
  analytical_vs_intuitive: {
    amplified: "この相手とは、あなたの直感的な判断が活きやすい",
    suppressed: "この相手の分析性に、あなたの直感がやや抑えられる",
    pulled: "この相手の前では、あなたの中の論理的な面が出やすい",
  },
  change_embrace_vs_resist: {
    amplified: "この相手とは、変化を楽しむ感覚が共鳴する",
    suppressed: "この相手の安定志向に、あなたの変化欲がやや穏やかになる",
    pulled: "この相手の前では、あなたの安定を求める面が出やすい",
  },
  plan_vs_spontaneous: {
    amplified: "この相手とは、あなたの計画性が自然に発揮される",
    suppressed: "この相手の即興性に、あなたの計画的な面がやや緩む",
    pulled: "この相手の前では、あなたの中の自由な面が引き出されやすい",
  },
  tradition_vs_novelty: {
    amplified: "この相手とは、新しいものへの感度が共鳴する",
    suppressed: "この相手のクラシックさに、あなたの先進性がやや抑えられる",
    pulled: "この相手の前では、あなたの中の伝統を大切にする面が出やすい",
  },
  independence_vs_harmony: {
    amplified: "この相手とは、あなたの独立した姿勢が自然に出る",
    suppressed: "この相手の調和志向に、あなたの独立性がやや控えめになる",
    pulled: "この相手の前では、あなたの調和を大切にする面が引き出される",
  },
  direct_vs_diplomatic: {
    amplified: "この相手とは、あなたの率直さが自然に発揮される",
    suppressed: "この相手の配慮深さに、あなたの直接的な面がやや抑えられる",
    pulled: "この相手の前では、あなたの配慮深い面が引き出される",
  },
  stress_isolation_vs_social: {
    amplified: "この相手とは、ストレス時の過ごし方が共鳴しやすい",
    suppressed: "この相手の回復スタイルに、あなたの対処法がやや変化する",
    pulled: "この相手の前では、疲れた時に人と過ごす面が出やすい",
  },
  function_vs_expression: {
    amplified: "この相手とは、あなたの表現への感度が共鳴する",
    suppressed: "この相手の合理性に、あなたの表現欲がやや控えめになる",
    pulled: "この相手の前では、あなたの中の実用的な面が引き出される",
  },
  minimal_vs_maximal: {
    amplified: "この相手とは、あなたのミニマルな美意識が共鳴する",
    suppressed: "この相手の装飾性に、あなたのシンプルさがやや緩む",
    pulled: "この相手の前では、あなたの中の華やかな面が引き出される",
  },
  perfectionist_vs_pragmatic: {
    amplified: "この相手とは、あなたの完成度へのこだわりが共鳴する",
    suppressed: "この相手の実用主義に、あなたの完璧主義がやや和らぐ",
    pulled: "この相手の前では、あなたの柔軟で前進する面が出やすい",
  },
  quality_vs_quantity: {
    amplified: "この相手とは、あなたの深さへのこだわりが共鳴する",
    suppressed: "この相手の広がり志向に、あなたの深掘り性がやや緩む",
    pulled: "この相手の前では、あなたの中の広がりを楽しむ面が出やすい",
  },
  classic_vs_trendy: {
    amplified: "この相手とは、あなたのクラシックな審美が共鳴する",
    suppressed: "この相手のトレンド感度に、あなたのクラシック性がやや緩む",
    pulled: "この相手の前では、あなたの中のトレンドへの好奇心が引き出される",
  },
  intimacy_pace: {
    amplified: "この相手とは、距離の縮め方のリズムが近い",
    suppressed: "この相手のペースに、あなたの距離感がやや調整される",
    pulled: "この相手の前では、あなたの中の距離を縮めたい面が出やすい",
  },
  reassurance_need: {
    amplified: "この相手とは、安心の確認の仕方が共鳴する",
    suppressed: "この相手の自立性に、あなたの確認欲がやや控えめになる",
    pulled: "この相手の前では、あなたの安心を求める面が自然に出やすい",
  },
  emotional_variability: {
    amplified: "この相手とは、感情の波のリズムが近い",
    suppressed: "この相手の安定性に、あなたの感情の幅がやや落ち着く",
    pulled: "この相手の前では、あなたの感情が豊かに動きやすい",
  },
  social_initiative: {
    amplified: "この相手とは、距離を縮めるイニシアチブが共鳴する",
    suppressed: "この相手の受容性に、あなたの積極性がやや穏やかになる",
    pulled: "この相手の前では、あなたの中の受容的な面が出やすい",
  },
  boundary_awareness: {
    amplified: "この相手とは、境界線への感度が共鳴する",
    suppressed: "この相手の柔軟さに、あなたの境界意識がやや緩む",
    pulled: "この相手の前では、あなたの中の境界を明確にする面が引き出される",
  },
  emotional_regulation: {
    amplified: "この相手とは、感情の整え方が共鳴する",
    suppressed: "この相手の感情表現に、あなたの制御性がやや緩む",
    pulled: "この相手の前では、あなたの感情が自然に出やすい",
  },
};

// Stargazer軸スコアは -1..+1 だが、similarity系は 0..1 で動作する
// 内部比較には正規化した値を使用
function normalizeScore(score: number): number {
  return (score + 1) / 2; // -1..+1 → 0..1
}

export function computeWithThisPerson(
  selfScores: Partial<Record<TraitAxisKey, number>>,
  counterpartScores: Partial<Record<TraitAxisKey, number>>,
): WithThisPersonResult | null {
  const candidates: Array<{
    axis: TraitAxisKey;
    axisLabel: string;
    selfScore: number;
    counterpartScore: number;
    direction: "amplified" | "suppressed" | "pulled";
    narrative: string;
    interestScore: number;
  }> = [];

  for (const axisDef of TRAIT_AXES) {
    if (!ALLOWED_CATEGORIES.has(axisDef.category)) continue;

    const selfVal = selfScores[axisDef.id];
    const cpVal = counterpartScores[axisDef.id];
    if (selfVal === undefined || cpVal === undefined) continue;

    const selfNorm = normalizeScore(selfVal);
    const cpNorm = normalizeScore(cpVal);
    const sim = similarityScore(selfNorm, cpNorm);
    const gap = Math.abs(selfVal - cpVal);

    const templates = INFLUENCE_NARRATIVES[axisDef.id];
    if (!templates) continue;

    // 判定ロジック
    let direction: "amplified" | "suppressed" | "pulled";
    let interestScore: number;

    if (sim >= 0.7 && Math.abs(selfVal) > 0.3 && Math.abs(cpVal) > 0.3) {
      // 同方向に強い → amplified
      direction = "amplified";
      interestScore = sim * Math.max(Math.abs(selfVal), Math.abs(cpVal));
    } else if (gap >= 0.4 && selfVal * cpVal < 0) {
      // 逆方向に大きなgap → suppressed
      direction = "suppressed";
      interestScore = gap * 0.9;
    } else if (gap >= 0.3 && Math.abs(cpVal) > Math.abs(selfVal)) {
      // 相手の方が極端 → pulled
      direction = "pulled";
      interestScore = gap * Math.abs(cpVal);
    } else {
      continue; // 特筆すべき影響なし
    }

    const axisLabel =
      selfVal < 0 ? axisDef.labelLeft : axisDef.labelRight;

    candidates.push({
      axis: axisDef.id,
      axisLabel,
      selfScore: selfVal,
      counterpartScore: cpVal,
      direction,
      narrative: templates[direction],
      interestScore,
    });
  }

  if (candidates.length === 0) return null;

  // 上位3つを選出
  candidates.sort((a, b) => b.interestScore - a.interestScore);
  const top = candidates.slice(0, 3);

  return {
    influences: top.map((c) => ({
      axis: c.axis,
      axisLabel: c.axisLabel,
      selfScore: c.selfScore,
      counterpartScore: c.counterpartScore,
      direction: c.direction,
      narrative: c.narrative,
    })),
    summaryNarratives: top.map((c) => c.narrative),
  };
}
