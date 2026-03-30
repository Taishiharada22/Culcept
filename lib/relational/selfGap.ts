// ============================================================
// Feature 5: 今の自分 vs 本来の自分のズレ可視化
// Stargazer context別axis_snapshotsの比較
// ============================================================

import { TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { SelfGapItem, SelfGapResult } from "./types";

// safety軸は表示OK (自分だけが見るため)
const EXCLUDED_CATEGORIES = new Set<string>([]);

// framing判定: ストレス時にどちら方向にシフトするか
function classifyFraming(
  axisDef: (typeof TRAIT_AXES)[number],
  normalScore: number,
  stressedScore: number,
): "protective" | "adaptive" | "authentic" {
  const gap = Math.abs(normalScore - stressedScore);
  if (gap < 0.15) return "authentic";

  // ストレス時に内向・慎重・孤立方向にシフト → protective
  const protectiveAxes: TraitAxisKey[] = [
    "introvert_vs_extrovert",
    "cautious_vs_bold",
    "stress_isolation_vs_social",
    "individual_vs_social",
    "boundary_awareness",
  ];

  if (protectiveAxes.includes(axisDef.id)) {
    // negative方向にシフト = より内向/慎重 → protective
    if (stressedScore < normalScore) return "protective";
  }

  return "adaptive";
}

// 日本語解釈テンプレート
function generateInterpretation(
  axisDef: (typeof TRAIT_AXES)[number],
  normalScore: number,
  stressedScore: number,
  framing: "protective" | "adaptive" | "authentic",
): string {
  const normalLabel = normalScore < 0 ? axisDef.labelLeft : axisDef.labelRight;
  const stressedLabel = stressedScore < 0 ? axisDef.labelLeft : axisDef.labelRight;

  if (framing === "authentic") {
    return `${normalLabel}な傾向は、状態に関わらず安定している`;
  }

  if (framing === "protective") {
    return `普段は${normalLabel}だが、疲れると${stressedLabel}に寄り、自分を守る`;
  }

  // adaptive
  if (normalLabel === stressedLabel) {
    return `${normalLabel}な傾向がストレス時にさらに強まる`;
  }
  return `普段は${normalLabel}だが、負荷がかかると${stressedLabel}に適応する`;
}

export function computeSelfGap(
  contextScores: Record<string, Partial<Record<TraitAxisKey, number>>>,
): SelfGapResult {
  const normalScores = contextScores["normal"] ?? {};
  // stressed と tired を統合して「非通常」スコアとする
  const stressedScores = contextScores["stressed"] ?? {};
  const tiredScores = contextScores["tired"] ?? {};

  // stressed 優先、なければ tired を使う
  const nonNormalScores: Partial<Record<TraitAxisKey, number>> = {};
  for (const key of Object.keys({ ...stressedScores, ...tiredScores }) as TraitAxisKey[]) {
    nonNormalScores[key] = stressedScores[key] ?? tiredScores[key];
  }

  const items: SelfGapItem[] = [];

  for (const axisDef of TRAIT_AXES) {
    if (EXCLUDED_CATEGORIES.has(axisDef.category)) continue;

    const normalVal = normalScores[axisDef.id];
    const stressedVal = nonNormalScores[axisDef.id];
    if (normalVal === undefined || stressedVal === undefined) continue;

    const gap = Math.abs(normalVal - stressedVal);
    if (gap < 0.15) continue; // 差が小さい軸は除外

    const framing = classifyFraming(axisDef, normalVal, stressedVal);
    const interpretation = generateInterpretation(
      axisDef,
      normalVal,
      stressedVal,
      framing,
    );

    const axisLabel = normalVal < 0 ? axisDef.labelLeft : axisDef.labelRight;

    items.push({
      axis: axisDef.id,
      axisLabel,
      normalScore: normalVal,
      stressedScore: stressedVal,
      gap,
      interpretation,
      framing,
    });
  }

  // gap降順ソート、上位5件
  items.sort((a, b) => b.gap - a.gap);
  const topItems = items.slice(0, 5);

  // 全体ナラティブ
  let overallNarrative: string;
  if (topItems.length === 0) {
    overallNarrative =
      "まだ文脈別の観測が十分ではありません。日常と負荷時の両方で観測を続けると、あなたの変化パターンが見えてきます。";
  } else {
    const protectiveCount = topItems.filter((i) => i.framing === "protective").length;
    const adaptiveCount = topItems.filter((i) => i.framing === "adaptive").length;

    if (protectiveCount > adaptiveCount) {
      overallNarrative =
        "疲れた時は自分を守る方向に変化する傾向があります。これは健全な自己防衛のサインです。";
    } else if (adaptiveCount > protectiveCount) {
      overallNarrative =
        "負荷がかかると環境に適応しようとする傾向があります。柔軟さの表れですが、無理をしていないか確認してみてください。";
    } else {
      overallNarrative =
        "状態によっていくつかの面が変化します。どちらも「あなた」であり、状況に応じた自然な反応です。";
    }
  }

  return {
    items: topItems,
    overallNarrative,
    mostShiftedAxis: topItems.length > 0 ? topItems[0].axis : null,
  };
}
