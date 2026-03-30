import type { ReasonCode, CautionCode, RendezvousCategory, MatchingVector } from "./types";

// ---------- Reason Text Map ----------

export const reasonTextMap: Record<ReasonCode, string> = {
  conversation_pace_close: "会話テンポが近い",
  distance_preference_aligned: "距離感の取り方が自然",
  depth_speed_aligned: "関係の深まり方が噛み合いやすい",
  emotional_temperature_close: "感情の受け止め方が近い",
  complementary_roles: "役割が補完し合いやすい",
  decision_style_aligned: "意思決定の進め方が近い",
  stable_connection_potential: "安心して続きやすい接続",
  light_connection_potential: "軽やかに会話が広がりやすい",
  community_blend_potential: "同じ場に自然に混ざりやすい",
  creative_role_fit: "共創時の役割が噛み合いやすい",
  life_rhythm_aligned: "生活リズムが自然に噛み合う",
  values_foundation_strong: "価値観の土台が近い",
  // Phase 1: 心理学的深度
  attachment_safety_aligned: "安心の築き方が自然に噛み合う",
  conflict_repair_compatible: "すれ違い時の修復力が相性良い",
  autonomy_respected: "お互いの自律性を自然に尊重し合える",
  // Phenotype
  appearance_affinity: "印象タイプに自然な親和性がある",
};

// ---------- Caution Text Map ----------

export const cautionTextMap: Record<CautionCode, string> = {
  silence_interpretation_gap: "沈黙の受け取り方に差が出やすい",
  decision_speed_gap: "決断の速さに温度差が出やすい",
  depth_progression_gap: "関係が深まる速度に少し違いがある",
  distance_need_gap: "一人時間の必要量に差がある",
  initiative_gap: "主導したいタイミングに違いがある",
  emotional_expression_gap: "感情表現の量に差がある",
  conflict_style_gap: "すれ違い時の向き合い方に違いがある",
  rhythm_gap: "日常のリズムに少し差がある",
  // Phase 1: 心理学的深度
  anxious_avoidant_risk: "安心の求め方に追跡-回避のパターンが起きやすい",
  repair_style_gap: "すれ違い後の修復アプローチに差がある",
  autonomy_tension: "自律性の感覚にズレが生じやすい",
};

// ---------- Reason Collection ----------

export function collectReasonCodes(input: {
  category: RendezvousCategory;
  conversationFit: number;
  distanceFit: number;
  depthFit: number;
  initiativeFit: number;
  emotionalFit: number;
  conflictFit: number;
  stabilityFit: number;
  categoryAffinity: number;
  // Phase 1: 心理学的深度（任意、後方互換）
  attachmentFit?: number;
  conflictRepairFit?: number;
  sdtFit?: number;
  // Phenotype
  appearanceFit?: number;
}): ReasonCode[] {
  const entries: Array<{ code: ReasonCode; score: number }> = [
    { code: "conversation_pace_close", score: input.conversationFit },
    { code: "distance_preference_aligned", score: input.distanceFit },
    { code: "depth_speed_aligned", score: input.depthFit },
    { code: "emotional_temperature_close", score: input.emotionalFit },
    { code: "decision_style_aligned", score: input.conflictFit },
    { code: "stable_connection_potential", score: input.stabilityFit },
  ];

  if (input.category === "cocreation") {
    entries.push({ code: "creative_role_fit", score: input.initiativeFit });
    entries.push({
      code: "complementary_roles",
      score: input.categoryAffinity,
    });
  }

  if (input.category === "community") {
    entries.push({
      code: "community_blend_potential",
      score: input.categoryAffinity,
    });
  }

  if (input.category === "friendship") {
    entries.push({
      code: "light_connection_potential",
      score: input.categoryAffinity,
    });
  }

  if (input.category === "partner") {
    entries.push({
      code: "life_rhythm_aligned",
      score: (input.stabilityFit + input.distanceFit) / 2,
    });
    entries.push({
      code: "values_foundation_strong",
      score: (input.emotionalFit + input.conflictFit + input.stabilityFit) / 3,
    });
  }

  // Phase 1: 心理学的深度の理由コード
  if (input.attachmentFit !== undefined) {
    entries.push({ code: "attachment_safety_aligned", score: input.attachmentFit });
  }
  if (input.conflictRepairFit !== undefined) {
    entries.push({ code: "conflict_repair_compatible", score: input.conflictRepairFit });
  }
  if (input.sdtFit !== undefined) {
    entries.push({ code: "autonomy_respected", score: input.sdtFit });
  }
  // Phenotype: 外見親和性
  if (input.appearanceFit !== undefined && input.appearanceFit > 0.5) {
    entries.push({ code: "appearance_affinity", score: input.appearanceFit });
  }

  return entries
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score >= 0.74)
    .slice(0, 3)
    .map((x) => x.code);
}

// ---------- Caution Collection ----------

/**
 * カテゴリ別 caution 閾値
 *
 * パートナー・ロマンティック: 厳しく（長期関係で小さな差が大きな摩擦になる）
 * 友達・コミュニティ: 寛容に（軽い関係性なので多少の差は問題にならない）
 * 共創: 中間（目的志向なので conflict と initiative だけ厳しく）
 */
type CautionThresholds = {
  distance: number;
  depth: number;
  initiative: number;
  emotional: number;
  conflict: number;
  silenceGap: number;
};

const CAUTION_THRESHOLDS: Record<RendezvousCategory, CautionThresholds> = {
  partner: {
    distance: 0.65,
    depth: 0.65,
    initiative: 0.60,
    emotional: 0.65,
    conflict: 0.65,
    silenceGap: 0.25,
  },
  romantic: {
    distance: 0.62,
    depth: 0.60,
    initiative: 0.58,
    emotional: 0.62,
    conflict: 0.58,
    silenceGap: 0.28,
  },
  friendship: {
    distance: 0.50,
    depth: 0.50,
    initiative: 0.48,
    emotional: 0.50,
    conflict: 0.48,
    silenceGap: 0.40,
  },
  cocreation: {
    distance: 0.48,
    depth: 0.48,
    initiative: 0.55,
    emotional: 0.48,
    conflict: 0.58,
    silenceGap: 0.38,
  },
  community: {
    distance: 0.45,
    depth: 0.45,
    initiative: 0.45,
    emotional: 0.45,
    conflict: 0.45,
    silenceGap: 0.42,
  },
};

export function collectCautionCodes(input: {
  category: RendezvousCategory;
  selfVector: MatchingVector;
  otherVector: MatchingVector;
  conversationFit: number;
  distanceFit: number;
  depthFit: number;
  initiativeFit: number;
  emotionalFit: number;
  conflictFit: number;
  stabilityFit: number;
  // Phase 1: 心理学的深度（任意、後方互換）
  attachmentFit?: number;
  conflictRepairFit?: number;
  sdtFit?: number;
}): CautionCode[] {
  const codes: Array<{ code: CautionCode; severity: number }> = [];
  const t = CAUTION_THRESHOLDS[input.category];

  if (input.distanceFit < t.distance) {
    codes.push({ code: "distance_need_gap", severity: 1 - input.distanceFit });
  }

  if (input.depthFit < t.depth) {
    codes.push({
      code: "depth_progression_gap",
      severity: 1 - input.depthFit,
    });
  }

  if (input.initiativeFit < t.initiative) {
    codes.push({
      code: "initiative_gap",
      severity: 1 - input.initiativeFit,
    });
  }

  if (input.emotionalFit < t.emotional) {
    codes.push({
      code: "emotional_expression_gap",
      severity: 1 - input.emotionalFit,
    });
  }

  if (input.conflictFit < t.conflict) {
    codes.push({
      code: "conflict_style_gap",
      severity: 1 - input.conflictFit,
    });
  }

  const silenceGap = Math.abs(
    input.selfVector.emotional_openness - input.otherVector.emotional_openness,
  );
  if (silenceGap > t.silenceGap) {
    codes.push({ code: "silence_interpretation_gap", severity: silenceGap });
  }

  // パートナー・ロマンティックでは stabilityFit も caution 対象
  if (
    (input.category === "partner" || input.category === "romantic") &&
    input.stabilityFit < 0.60
  ) {
    codes.push({ code: "rhythm_gap", severity: 1 - input.stabilityFit });
  }

  // Phase 1: 心理学的深度のcaution
  if (input.attachmentFit !== undefined && input.attachmentFit < 0.45) {
    codes.push({ code: "anxious_avoidant_risk", severity: 1 - input.attachmentFit });
  }
  if (input.conflictRepairFit !== undefined && input.conflictRepairFit < 0.50) {
    codes.push({ code: "repair_style_gap", severity: 1 - input.conflictRepairFit });
  }
  if (input.sdtFit !== undefined && input.sdtFit < 0.48) {
    codes.push({ code: "autonomy_tension", severity: 1 - input.sdtFit });
  }

  return codes
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 2)
    .map((x) => x.code);
}
