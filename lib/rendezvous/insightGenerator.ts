/**
 * Compatibility Insight Generator
 * マッチ後の深掘りインサイトを生成
 * Matching vector + Reason/Caution codes → 人間が読める洞察
 */

import type { MatchingVector, ReasonCode, CautionCode, RendezvousCategory } from "./types";

export type CompatibilityInsight = {
  overallNarrative: string;
  connectionPoints: { label: string; description: string; strength: number }[];
  frictionPoints: { label: string; description: string; severity: "low" | "medium" | "high" }[];
  communicationAdvice: string;
  growthPotential: string;
  radarAxes: { axis: string; self: number; other: number }[];
};

const AXIS_LABELS: Record<keyof MatchingVector, { ja: string; low: string; high: string }> = {
  conversation_temperature: { ja: "会話の温度", low: "穏やか", high: "活発" },
  distance_need: { ja: "距離感", low: "密接", high: "独立" },
  depth_speed: { ja: "深まりの速度", low: "ゆっくり", high: "早い" },
  stability_need: { ja: "安定性", low: "冒険的", high: "安定志向" },
  stimulation_need: { ja: "刺激欲求", low: "穏やか", high: "刺激的" },
  initiative: { ja: "主導性", low: "受容的", high: "主導的" },
  emotional_openness: { ja: "感情表現", low: "内に秘める", high: "オープン" },
  conflict_directness: { ja: "葛藤解決", low: "回避的", high: "直接的" },
  social_energy: { ja: "社交エネルギー", low: "内向的", high: "外向的" },
  structure_preference: { ja: "構造性", low: "柔軟", high: "計画的" },
};

const REASON_DESCRIPTIONS: Partial<Record<ReasonCode, string>> = {
  conversation_pace_close: "会話のリズムが自然に噛み合いやすい相手です",
  distance_preference_aligned: "お互いの心地よい距離感が似ています",
  depth_speed_aligned: "関係の深め方について共通する感覚を持っています",
  emotional_temperature_close: "感情の表現の仕方が近く、理解し合いやすいでしょう",
  complementary_roles: "互いの強みと弱みが補い合う関係です",
  decision_style_aligned: "判断の仕方やスタイルが似ていて、迷いが少ないでしょう",
  stable_connection_potential: "長く安定した繋がりを築ける可能性があります",
  light_connection_potential: "無理なく自然体でいられる関係が期待できます",
  creative_role_fit: "創造的な活動で、良いコンビネーションが生まれそうです",
};

const CAUTION_DESCRIPTIONS: Partial<Record<CautionCode, string>> = {
  silence_interpretation_gap: "沈黙の捉え方が異なるかもしれません。相手の沈黙を否定と受け取らないよう意識を",
  distance_need_gap: "距離感の好みに差があります。最初はお互いのペースを尊重しましょう",
  depth_progression_gap: "深まりたいスピードが違うかも。相手のペースも大切にしてください",
  initiative_gap: "どちらが主導するか、最初に少し探り合いが必要です",
  emotional_expression_gap: "感情表現のスタイルが異なります。言葉にしなくても伝わるとは限りません",
  conflict_style_gap: "意見のぶつかり方が異なります。対話の場を意識的に作ると良いでしょう",
  rhythm_gap: "生活リズムや反応のテンポに差があるかもしれません",
};

export function generateInsight(
  selfVector: MatchingVector,
  otherVector: MatchingVector,
  reasonCodes: ReasonCode[],
  cautionCodes: CautionCode[],
  category: RendezvousCategory,
  syncPercent: number,
): CompatibilityInsight {
  // Build radar axes
  const radarAxes = (Object.keys(AXIS_LABELS) as (keyof MatchingVector)[]).map((axis) => ({
    axis: AXIS_LABELS[axis].ja,
    self: Math.round(selfVector[axis] * 100),
    other: Math.round(otherVector[axis] * 100),
  }));

  // Connection points from reason codes
  const connectionPoints = reasonCodes
    .map((code) => {
      const desc = REASON_DESCRIPTIONS[code];
      if (!desc) return null;
      return {
        label: code.replace(/_/g, " "),
        description: desc,
        strength: 0.8 + Math.random() * 0.2,
      };
    })
    .filter(Boolean) as CompatibilityInsight["connectionPoints"];

  // Friction points from caution codes
  const frictionPoints = cautionCodes
    .map((code) => {
      const desc = CAUTION_DESCRIPTIONS[code];
      if (!desc) return null;
      return {
        label: code.replace(/_/g, " "),
        description: desc,
        severity: ("medium" as const),
      };
    })
    .filter(Boolean) as CompatibilityInsight["frictionPoints"];

  // Narrative
  const overallNarrative = generateNarrative(syncPercent, category, connectionPoints.length, frictionPoints.length);
  const communicationAdvice = generateCommunicationAdvice(selfVector, otherVector, category);
  const growthPotential = generateGrowthPotential(syncPercent, category);

  return {
    overallNarrative,
    connectionPoints,
    frictionPoints,
    communicationAdvice,
    growthPotential,
    radarAxes,
  };
}

function generateNarrative(
  sync: number,
  category: RendezvousCategory,
  connections: number,
  frictions: number,
): string {
  const catLabel = { romantic: "恋愛", friendship: "友情", cocreation: "共創", community: "繋がり", partner: "パートナー" }[category];

  if (sync >= 85) {
    return `${catLabel}の相性として非常に高い親和性が見られます。${connections}つの共鳴ポイントが自然な接続を支えています。`;
  }
  if (sync >= 72) {
    return `${catLabel}として良い相性です。共鳴する部分が多く、${frictions > 0 ? "少しの注意点を意識すれば" : ""}自然な関係が築けるでしょう。`;
  }
  return `${catLabel}として可能性のある相性です。異なる部分もありますが、互いを理解し合う姿勢が大切です。`;
}

function generateCommunicationAdvice(
  self: MatchingVector,
  other: MatchingVector,
  category: RendezvousCategory,
): string {
  const emotionalGap = Math.abs(self.emotional_openness - other.emotional_openness);
  const initiativeGap = Math.abs(self.initiative - other.initiative);

  if (emotionalGap > 0.3) {
    return "お互いの感情表現のスタイルが異なります。感じたことを言葉で伝える努力をすると、理解が深まります。";
  }
  if (initiativeGap > 0.3) {
    return "主導性のバランスが異なります。時には相手にリードを任せ、時には自分から踏み出してみましょう。";
  }
  return "コミュニケーションスタイルが近いので、自然体で話すのが一番です。無理に合わせようとしないでください。";
}

function generateGrowthPotential(sync: number, category: RendezvousCategory): string {
  if (sync >= 80) {
    return "この関係は安定した基盤の上で、お互いの成長を支え合える可能性があります。";
  }
  if (sync >= 68) {
    return "異なる部分がお互いの視野を広げてくれるでしょう。違いを受け入れることで、豊かな関係に育ちます。";
  }
  return "挑戦的な関係ですが、だからこそ得られる気づきがあります。お互いの違いを学びの機会として捉えましょう。";
}
