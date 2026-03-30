/**
 * Vector Refinement Engine — underivable 次元を埋めるターゲット質問生成
 * AI不要。RendezvousVectorPreview → VectorGapExploration[] の純関数。
 */

import type { RendezvousVectorPreview } from "./secondSelfBridge";
import type { TargetedResponse } from "./types";
import { DIMENSION_PROMPTS, type TargetedPrompt } from "./vectorRefinementData";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   出力型
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type VectorGapExploration = {
  dimension: string;
  dimensionLabel: string;
  currentValue: number;
  confidence: "none" | "low" | "medium";
  explorationPrompts: TargetedPrompt[];
};

export type VectorRefinementResult = {
  gaps: VectorGapExploration[];
  totalUnderivable: number;
  totalLowConfidence: number;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   次元ラベル
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const DIMENSION_LABELS: Record<string, string> = {
  conversation_temperature: "会話温度",
  distance_need: "距離感",
  depth_speed: "深まり速度",
  stability_need: "安定志向",
  stimulation_need: "刺激志向",
  initiative: "主導性",
  emotional_openness: "感情開示",
  conflict_directness: "衝突対処",
  social_energy: "社交性",
  structure_preference: "構造志向",
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   メイン関数
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function deriveVectorGaps(
  preview: RendezvousVectorPreview,
  existingResponses?: TargetedResponse[],
): VectorRefinementResult {
  const answeredDimensions = new Set(
    (existingResponses ?? []).map((r) => r.dimension),
  );

  const gaps: VectorGapExploration[] = [];

  // underivable 次元 → confidence: "none"
  for (const dim of preview.underivableDimensions) {
    // 既に回答済みならスキップ
    if (answeredDimensions.has(dim)) continue;

    const prompts = DIMENSION_PROMPTS[dim] ?? [];
    if (prompts.length === 0) continue;

    gaps.push({
      dimension: dim,
      dimensionLabel: DIMENSION_LABELS[dim] ?? dim,
      currentValue: getVectorValue(preview, dim),
      confidence: "none",
      explorationPrompts: prompts,
    });
  }

  // derived でも低信頼度の次元 → confidence: "low"
  // 値が 0.5（デフォルト中間値）に近い derived 次元は低信頼
  for (const dim of preview.derivedDimensions) {
    if (answeredDimensions.has(dim)) continue;

    const value = getVectorValue(preview, dim);
    if (Math.abs(value - 0.5) < 0.1) {
      const prompts = DIMENSION_PROMPTS[dim] ?? [];
      if (prompts.length === 0) continue;

      gaps.push({
        dimension: dim,
        dimensionLabel: DIMENSION_LABELS[dim] ?? dim,
        currentValue: value,
        confidence: "low",
        explorationPrompts: prompts,
      });
    }
  }

  // ソート: none → low、同じ信頼度内ではプロンプト数が多い順
  gaps.sort((a, b) => {
    const confOrder = { none: 0, low: 1, medium: 2 };
    const confDiff = confOrder[a.confidence] - confOrder[b.confidence];
    if (confDiff !== 0) return confDiff;
    return b.explorationPrompts.length - a.explorationPrompts.length;
  });

  return {
    gaps,
    totalUnderivable: preview.underivableDimensions.length,
    totalLowConfidence: gaps.filter((g) => g.confidence === "low").length,
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TargetedResponse → ベクトル値適用
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function applyTargetedResponses(
  baseVector: RendezvousVectorPreview,
  responses: TargetedResponse[],
): RendezvousVectorPreview {
  const result = { ...baseVector };
  const newDerived = new Set(result.derivedDimensions);
  const newUnderivable = new Set(result.underivableDimensions);

  for (const resp of responses) {
    const dim = resp.dimension as keyof RendezvousVectorPreview;
    if (dim in result && typeof result[dim] === "number") {
      // 既存の導出値と回答値をブレンド
      const existingValue = result[dim] as number;
      const wasUnderivable = newUnderivable.has(resp.dimension);

      if (wasUnderivable) {
        // underivable → 回答値をそのまま採用
        (result as Record<string, unknown>)[dim] = resp.dimensionEffect;
      } else {
        // derived → 既存値と回答値の加重平均 (既存 0.4 : 回答 0.6)
        (result as Record<string, unknown>)[dim] =
          Math.round((existingValue * 0.4 + resp.dimensionEffect * 0.6) * 100) / 100;
      }

      // underivable → derived に昇格
      newUnderivable.delete(resp.dimension);
      newDerived.add(resp.dimension);
    }
  }

  result.derivedDimensions = Array.from(newDerived);
  result.underivableDimensions = Array.from(newUnderivable);

  return result;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ヘルパー
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function getVectorValue(preview: RendezvousVectorPreview, dim: string): number {
  switch (dim) {
    case "conversation_temperature": return preview.conversation_temperature;
    case "distance_need": return preview.distance_need;
    case "depth_speed": return preview.depth_speed;
    case "stability_need": return preview.stability_need;
    case "stimulation_need": return preview.stimulation_need;
    case "initiative": return preview.initiative;
    case "emotional_openness": return preview.emotional_openness;
    case "conflict_directness": return preview.conflict_directness;
    case "social_energy": return preview.social_energy;
    case "structure_preference": return preview.structure_preference;
    default: return 0.5;
  }
}
