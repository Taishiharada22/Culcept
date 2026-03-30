// lib/stargazer/valueActionGap.ts
// 価値-行動ギャップ分析 — 暗黙の価値観と実際の行動の乖離を検出

import type { TraitAxisKey } from "./traitAxes";
import type { ImplicitValue, ImplicitValuesResult } from "./implicitValuesExtractor";

export interface ValueActionGap {
  valueName: string;
  gapDescription: string;
  severity: "low" | "medium" | "high";
  /** 価値観が示唆する行動 */
  expectedBehavior: string;
  /** 実際の行動パターン */
  actualBehavior: string;
  /** ギャップの解釈 */
  interpretation: string;
}

/**
 * 価値観と行動の乖離を分析する
 * Three Mirrorsのself vs footprintの差分を使って、
 * 「言っていることとやっていることの違い」を検出する
 */
export function analyzeValueActionGaps(
  valuesResult: ImplicitValuesResult,
  selfScores: Partial<Record<TraitAxisKey, number>>,
  footprintScores: Partial<Record<TraitAxisKey, number>>,
): ValueActionGap[] {
  const gaps: ValueActionGap[] = [];

  for (const value of valuesResult.values.slice(0, 5)) {
    for (const sa of value.supportingAxes) {
      const selfScore = selfScores[sa.axis];
      const footScore = footprintScores[sa.axis];
      if (selfScore === undefined || footScore === undefined) continue;

      const diff = Math.abs(selfScore - footScore);
      if (diff < 0.25) continue; // No significant gap

      const severity: ValueActionGap["severity"] =
        diff > 0.5 ? "high" : diff > 0.35 ? "medium" : "low";

      gaps.push({
        valueName: value.name,
        gapDescription: `「${value.name}」を大切にしていると感じているが、行動パターンはそれとは異なる方向を示している。`,
        severity,
        expectedBehavior: value.manifestation,
        actualBehavior: `行動データは、自己認識とは ${(diff * 100).toFixed(0)}% の乖離を示している。`,
        interpretation:
          severity === "high"
            ? "この乖離は大きい。価値観と行動の間に壁がある可能性がある。何がその壁を作っているか、探索する価値がある。"
            : severity === "medium"
            ? "やや乖離がある。状況によって価値観通りに行動できる時とできない時がありそうだ。"
            : "小さな乖離。意識しなくても価値観に沿った行動ができている領域に近い。",
      });

      // 価値観ごとに1ギャップのみ収録（最初の支持軸で検出されたもの）
      break;
    }
  }

  return gaps.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}
