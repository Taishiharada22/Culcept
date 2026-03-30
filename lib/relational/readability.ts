// ============================================================
// Feature 6: "理解しやすい人" (Readability)
// 自分の誤読されやすい軸を特定し、相手が正しく読めるかを判定
// ============================================================

import { TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { MisreadRisk, ReadabilityBonus, ReadabilityResult } from "./types";

// 極端なスコアの「よくある誤読」定義
interface MisreadEntry {
  axis: TraitAxisKey;
  extremeDirection: "negative" | "positive"; // score < 0 = negative, > 0 = positive
  threshold: number; // |score| がこれ以上で該当
  commonMisinterpretation: string;
  correctReading: string;
  // 相手がこの軸で理解できる条件
  understandCondition: (
    counterpartScore: number | undefined,
  ) => boolean;
  bonusNarrative: string;
}

const MISREAD_MAP: MisreadEntry[] = [
  {
    axis: "introvert_vs_extrovert",
    extremeDirection: "negative",
    threshold: 0.4,
    commonMisinterpretation: "冷たい・関心がない",
    correctReading: "内面が豊かで、一人で充電が必要なだけ",
    understandCondition: (cp) => cp !== undefined && cp < 0,
    bonusNarrative: "あなたの静けさを冷たさではなく、落ち着きと読む人",
  },
  {
    axis: "direct_vs_diplomatic",
    extremeDirection: "negative",
    threshold: 0.4,
    commonMisinterpretation: "きつい・攻撃的に見える",
    correctReading: "嘘をつけない誠実さの表れ",
    understandCondition: (cp) => cp !== undefined && cp < -0.1,
    bonusNarrative: "あなたの率直さを攻撃ではなく、誠実さと受け取る人",
  },
  {
    axis: "emotional_regulation",
    extremeDirection: "positive",
    threshold: 0.4,
    commonMisinterpretation: "感情がない・冷淡に見える",
    correctReading: "感情はあるが、出し方がコントロールされている",
    understandCondition: (cp) => cp !== undefined && cp > 0.1,
    bonusNarrative: "あなたの落ち着きを冷淡ではなく、成熟と感じる人",
  },
  {
    axis: "cautious_vs_bold",
    extremeDirection: "negative",
    threshold: 0.4,
    commonMisinterpretation: "消極的・自信がない",
    correctReading: "深く考えてから動く慎重さ",
    understandCondition: (cp) => cp !== undefined && cp < 0.1,
    bonusNarrative: "あなたの慎重さを弱さではなく、思慮深さと捉える人",
  },
  {
    axis: "cautious_vs_bold",
    extremeDirection: "positive",
    threshold: 0.45,
    commonMisinterpretation: "無謀・考えなしに見える",
    correctReading: "行動力が高く、経験から学ぶタイプ",
    understandCondition: (cp) => cp !== undefined && cp > 0,
    bonusNarrative: "あなたの大胆さを無謀ではなく、行動力と感じる人",
  },
  {
    axis: "minimal_vs_maximal",
    extremeDirection: "negative",
    threshold: 0.4,
    commonMisinterpretation: "こだわりがない・無関心に見える",
    correctReading: "本質に集中する研ぎ澄まされた美意識",
    understandCondition: (cp) => cp !== undefined && cp < 0.1,
    bonusNarrative: "あなたのミニマルさを無関心ではなく、美意識と感じる人",
  },
  {
    axis: "independence_vs_harmony",
    extremeDirection: "negative",
    threshold: 0.4,
    commonMisinterpretation: "協調性がない・自己中心的に見える",
    correctReading: "自分の軸を持ち、他者に依存しない強さ",
    understandCondition: (cp) => cp !== undefined && cp < 0.2,
    bonusNarrative: "あなたの独立心を自己中心ではなく、強さと読む人",
  },
  {
    axis: "perfectionist_vs_pragmatic",
    extremeDirection: "negative",
    threshold: 0.4,
    commonMisinterpretation: "細かすぎる・融通が利かない",
    correctReading: "妥協を許さないプロフェッショナリズム",
    understandCondition: (cp) => cp !== undefined && cp < 0.2,
    bonusNarrative: "あなたのこだわりを神経質ではなく、職人気質と受け取る人",
  },
  {
    axis: "plan_vs_spontaneous",
    extremeDirection: "positive",
    threshold: 0.4,
    commonMisinterpretation: "無計画・信頼できない",
    correctReading: "柔軟性が高く、変化に強い適応力",
    understandCondition: (cp) => cp !== undefined && cp > 0,
    bonusNarrative: "あなたの柔軟さを無計画ではなく、適応力と感じる人",
  },
  {
    axis: "quality_vs_quantity",
    extremeDirection: "negative",
    threshold: 0.4,
    commonMisinterpretation: "視野が狭い・頑固に見える",
    correctReading: "ひとつを深く掘り下げる集中力",
    understandCondition: (cp) => cp !== undefined && cp < 0.1,
    bonusNarrative: "あなたの深掘り志向を狭さではなく、情熱と読む人",
  },
];

export function computeMisreadRisks(
  selfScores: Partial<Record<TraitAxisKey, number>>,
): MisreadRisk[] {
  const risks: MisreadRisk[] = [];

  for (const entry of MISREAD_MAP) {
    const score = selfScores[entry.axis];
    if (score === undefined) continue;

    const isExtreme =
      entry.extremeDirection === "negative"
        ? score < -entry.threshold
        : score > entry.threshold;

    if (!isExtreme) continue;

    const axisDef = TRAIT_AXES.find((a) => a.id === entry.axis);
    const axisLabel =
      entry.extremeDirection === "negative"
        ? axisDef?.labelLeft ?? entry.axis
        : axisDef?.labelRight ?? entry.axis;

    risks.push({
      axis: entry.axis,
      axisLabel,
      selfScore: score,
      commonMisinterpretation: entry.commonMisinterpretation,
      correctReading: entry.correctReading,
    });
  }

  return risks;
}

export function computeReadabilityBonuses(
  selfScores: Partial<Record<TraitAxisKey, number>>,
  counterpartScores: Partial<Record<TraitAxisKey, number>>,
): ReadabilityResult {
  const misreadRisks = computeMisreadRisks(selfScores);
  const bonuses: ReadabilityBonus[] = [];

  for (const entry of MISREAD_MAP) {
    const score = selfScores[entry.axis];
    if (score === undefined) continue;

    const isExtreme =
      entry.extremeDirection === "negative"
        ? score < -entry.threshold
        : score > entry.threshold;

    if (!isExtreme) continue;

    const cpScore = counterpartScores[entry.axis];
    if (!entry.understandCondition(cpScore)) continue;

    const axisDef = TRAIT_AXES.find((a) => a.id === entry.axis);
    const axisLabel =
      entry.extremeDirection === "negative"
        ? axisDef?.labelLeft ?? entry.axis
        : axisDef?.labelRight ?? entry.axis;

    // ボーナススコア: 相手の軸がどれだけ「理解寄り」か
    const bonusScore = cpScore !== undefined ? Math.min(1, Math.abs(cpScore) * 0.8 + 0.2) : 0.3;

    bonuses.push({
      axis: entry.axis,
      axisLabel,
      bonusScore,
      narrative: entry.bonusNarrative,
    });
  }

  // 上位3つ
  bonuses.sort((a, b) => b.bonusScore - a.bonusScore);
  const topBonuses = bonuses.slice(0, 3);

  return {
    misreadRisks,
    bonuses: topBonuses,
    topBonusNarrative: topBonuses.length > 0 ? topBonuses[0].narrative : null,
  };
}
