// ============================================================
// Feature 2: 化学反応マップ (Style Chemistry Map)
// 2人の軸を共鳴・補完・摩擦・未知の4象限に分類
// ============================================================

import { TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
import {
  similarityScore as simScore,
  complementScore as compScore,
} from "@/lib/rendezvous/similarityScore";
import type { ChemistryAxisItem, ChemistryQuadrant, StyleChemistryMap } from "./types";

// safety / relational_deep は相手に見せない
const ALLOWED_CATEGORIES = new Set(["core", "relational", "emotional", "motion", "aesthetic"]);

const QUADRANT_LABELS: Record<ChemistryQuadrant, string> = {
  resonance: "共鳴",
  complement: "補完",
  friction: "摩擦",
  unknown: "未知",
};

// 正規化: -1..+1 → 0..1
function normalize(score: number): number {
  return (score + 1) / 2;
}

function buildSummary(
  dominant: ChemistryQuadrant,
  resonanceCount: number,
  complementCount: number,
  frictionCount: number,
): string {
  if (dominant === "resonance") {
    if (resonanceCount >= 5) return "多くの軸で共鳴しやすく、自然体でいられる関係";
    return "いくつかの共通する感覚があり、安心感が生まれやすい";
  }
  if (dominant === "complement") {
    if (complementCount >= 4) return "互いに持っていないものを補い合える関係";
    return "違いが良い方向に作用しやすい組み合わせ";
  }
  if (dominant === "friction") {
    if (frictionCount >= 4) return "価値観の違いが多いが、新しい視点を得やすい関係";
    return "一部に温度差があるが、意識すれば成長の種になる";
  }
  return "まだ観測が足りず、関係の全体像が見えていない";
}

export function computeStyleChemistryMap(
  selfScores: Partial<Record<TraitAxisKey, number>>,
  counterpartScores: Partial<Record<TraitAxisKey, number>>,
  selfConfidence?: Partial<Record<TraitAxisKey, number>>,
): StyleChemistryMap | null {
  const resonance: ChemistryAxisItem[] = [];
  const complement: ChemistryAxisItem[] = [];
  const friction: ChemistryAxisItem[] = [];
  const unknown: ChemistryAxisItem[] = [];

  let classifiedCount = 0;

  for (const axisDef of TRAIT_AXES) {
    if (!ALLOWED_CATEGORIES.has(axisDef.category)) continue;

    const selfVal = selfScores[axisDef.id];
    const cpVal = counterpartScores[axisDef.id];
    if (selfVal === undefined || cpVal === undefined) continue;

    const selfNorm = normalize(selfVal);
    const cpNorm = normalize(cpVal);
    const sim = simScore(selfNorm, cpNorm);
    const comp = compScore(selfNorm, cpNorm);
    const confidence = selfConfidence?.[axisDef.id] ?? 0.5;

    // 日本語ラベル (左右のうちself寄りの方)
    const axisLabel =
      selfVal < 0 ? axisDef.labelLeft : axisDef.labelRight;

    const item: ChemistryAxisItem = {
      axis: axisDef.id,
      axisLabel,
      quadrant: "unknown",
      selfScore: selfVal,
      counterpartScore: cpVal,
      similarity: sim,
      complement: comp,
    };

    // 分類
    if (confidence < 0.3) {
      item.quadrant = "unknown";
      unknown.push(item);
    } else if (sim >= 0.72) {
      item.quadrant = "resonance";
      resonance.push(item);
    } else if (comp >= 0.72) {
      item.quadrant = "complement";
      complement.push(item);
    } else if (sim < 0.45 && comp < 0.45) {
      item.quadrant = "friction";
      friction.push(item);
    } else if (sim >= comp) {
      item.quadrant = "resonance";
      resonance.push(item);
    } else {
      item.quadrant = "complement";
      complement.push(item);
    }

    classifiedCount++;
  }

  if (classifiedCount < 3) return null;

  // 各象限をsimilarity/complementの高い順にソート
  resonance.sort((a, b) => b.similarity - a.similarity);
  complement.sort((a, b) => b.complement - a.complement);
  friction.sort((a, b) => {
    const scoreA = Math.min(a.similarity, a.complement);
    const scoreB = Math.min(b.similarity, b.complement);
    return scoreA - scoreB; // 低い方がより摩擦
  });

  // dominant判定
  const counts: Record<ChemistryQuadrant, number> = {
    resonance: resonance.length,
    complement: complement.length,
    friction: friction.length,
    unknown: unknown.length,
  };
  const dominantQuadrant = (
    Object.entries(counts) as [ChemistryQuadrant, number][]
  ).sort((a, b) => b[1] - a[1])[0][0];

  return {
    resonance,
    complement,
    friction,
    unknown,
    dominantQuadrant,
    summary: buildSummary(
      dominantQuadrant,
      resonance.length,
      complement.length,
      friction.length,
    ),
  };
}
