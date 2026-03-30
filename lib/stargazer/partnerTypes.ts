// lib/stargazer/partnerTypes.ts
// 相手タブの型定義とユーティリティ

import type { TraitAxisKey } from "./traitAxes";

// ── Types ──

export type PartnerCategory =
  | "family"
  | "friend"
  | "romantic"
  | "spouse"
  | "colleague";

export interface PartnerProfile {
  id: string;
  category: PartnerCategory;
  nickname: string;
  observationCount: number;
  contextAxisScores?: Partial<Record<TraitAxisKey, number>>;
}

export const PARTNER_LABELS: Record<PartnerCategory, string> = {
  family: "家族",
  friend: "友達",
  romantic: "恋人",
  spouse: "配偶者",
  colleague: "仕事仲間",
};

export const PARTNER_ICONS: Record<PartnerCategory, string> = {
  family: "🏠",
  friend: "🌿",
  romantic: "💫",
  spouse: "💍",
  colleague: "💼",
};

export const PARTNER_COLORS: Record<PartnerCategory, string> = {
  family: "rgba(251,191,36,0.7)",
  friend: "rgba(74,222,128,0.7)",
  romantic: "rgba(244,114,182,0.7)",
  spouse: "rgba(244,114,182,0.7)",
  colleague: "rgba(96,165,250,0.7)",
};

// ── Relationship Categories (8 categories for Presence others view) ──

export type RelationshipCategory =
  | "family"       // 家族
  | "friend"       // 友達
  | "romantic"     // 恋人
  | "spouse"       // 配偶者
  | "colleague"    // 仕事相手
  | "stranger"     // 初対面
  | "close"        // 仲の良い相手
  | "distant";     // 距離のある相手

export const RELATIONSHIP_LABELS: Record<RelationshipCategory, string> = {
  family: "家族",
  friend: "友達",
  romantic: "恋人",
  spouse: "配偶者",
  colleague: "仕事相手",
  stranger: "初対面",
  close: "仲の良い相手",
  distant: "距離のある相手",
};

export const RELATIONSHIP_ICONS: Record<RelationshipCategory, string> = {
  family: "🏠",
  friend: "🌿",
  romantic: "💫",
  spouse: "💍",
  colleague: "💼",
  stranger: "👋",
  close: "🤝",
  distant: "🌙",
};

export const RELATIONSHIP_COLORS: Record<RelationshipCategory, string> = {
  family: "rgba(251,191,36,0.7)",
  friend: "rgba(74,222,128,0.7)",
  romantic: "rgba(244,114,182,0.7)",
  spouse: "rgba(244,114,182,0.7)",
  colleague: "rgba(96,165,250,0.7)",
  stranger: "rgba(156,163,175,0.7)",
  close: "rgba(167,139,250,0.7)",
  distant: "rgba(148,163,184,0.7)",
};

// ── Relationship Analysis ──

export interface RelationshipAnalysis {
  overallScore: number; // 0-100
  resonancePoints: string[]; // Things that align
  tensionPoints: string[]; // Potential friction
  shiftDescription: string; // How you change with them
  communicationAdvice: string; // Communication tips
}

/**
 * Analyze the relationship between self and a partner based on context scores
 */
export function analyzeRelationship(
  selfScores: Partial<Record<TraitAxisKey, number>>,
  partnerContextScores: Partial<Record<TraitAxisKey, number>>,
  category: PartnerCategory
): RelationshipAnalysis {
  const resonance: string[] = [];
  const tension: string[] = [];

  // Key axes for relationship analysis
  const relationalAxes: {
    axis: TraitAxisKey;
    leftLabel: string;
    rightLabel: string;
  }[] = [
    {
      axis: "introvert_vs_extrovert",
      leftLabel: "内向的",
      rightLabel: "外向的",
    },
    { axis: "direct_vs_diplomatic", leftLabel: "率直", rightLabel: "配慮的" },
    {
      axis: "independence_vs_harmony",
      leftLabel: "独立",
      rightLabel: "調和",
    },
    { axis: "intimacy_pace", leftLabel: "慎重", rightLabel: "積極的" },
    {
      axis: "boundary_awareness",
      leftLabel: "境界重視",
      rightLabel: "境界柔軟",
    },
    {
      axis: "emotional_variability",
      leftLabel: "安定的",
      rightLabel: "感情豊か",
    },
  ];

  let alignCount = 0;
  let totalChecked = 0;

  for (const { axis, leftLabel, rightLabel } of relationalAxes) {
    const selfScore = selfScores[axis];
    const partnerScore = partnerContextScores[axis];
    if (selfScore === undefined || partnerScore === undefined) continue;

    totalChecked++;
    const diff = Math.abs(selfScore - partnerScore);

    if (diff < 0.2) {
      // Aligned
      alignCount++;
      const side = selfScore < 0 ? leftLabel : rightLabel;
      resonance.push(`${side}の感覚が近い`);
    } else if (diff > 0.5) {
      // Tension
      const selfSide = selfScore < 0 ? leftLabel : rightLabel;
      const partnerSide = partnerScore < 0 ? leftLabel : rightLabel;
      tension.push(
        `あなたは${selfSide}、相手は${partnerSide}の傾向`
      );
    }
  }

  const overallScore = totalChecked > 0
    ? Math.round((alignCount / totalChecked) * 100)
    : 50;

  // Shift description
  const shiftAxes: TraitAxisKey[] = [
    "introvert_vs_extrovert",
    "direct_vs_diplomatic",
    "reassurance_need",
  ];
  const shifts: string[] = [];
  for (const axis of shiftAxes) {
    const selfScore = selfScores[axis];
    const contextScore = partnerContextScores[axis];
    if (
      selfScore !== undefined &&
      contextScore !== undefined &&
      Math.abs(selfScore - contextScore) > 0.2
    ) {
      const direction = contextScore > selfScore ? "やや強まる" : "やや弱まる";
      shifts.push(direction);
    }
  }

  const shiftDescription =
    shifts.length > 0
      ? `この人といると、あなたの一部が微妙に変化する。それは自然な適応。`
      : "この人との関係では、あなたは比較的自然体でいられるようだ。";

  // Communication advice based on category
  const adviceMap: Record<PartnerCategory, string> = {
    family:
      "家族には「当たり前」が生まれやすい。時々、相手を新鮮な目で見てみること。",
    friend:
      "友人関係は距離感が鍵。近づきすぎず、離れすぎない距離を意識的に保つこと。",
    romantic:
      "言葉にしないと伝わらないことがある。「察してほしい」は、時に壁になる。",
    spouse:
      "長い関係の中で生まれる「暗黙の了解」は、時にすれ違いの原因になる。確認を怠らないこと。",
    colleague:
      "仕事の関係では、期待値のすり合わせが最も重要。曖昧さを残さないこと。",
  };

  return {
    overallScore,
    resonancePoints: resonance.slice(0, 3),
    tensionPoints: tension.slice(0, 3),
    shiftDescription,
    communicationAdvice: adviceMap[category],
  };
}
