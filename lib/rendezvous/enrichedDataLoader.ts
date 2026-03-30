import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { RendezvousCategory } from "./types";
import type { EnrichedEvaluationInput } from "./evaluateDirection";

// ── 中間型: 1ユーザー分の enriched データ ──

export type UserEnrichedData = {
  /** 理想のパートナープロフィール（カテゴリ別） */
  idealProfile: {
    desiredTraits?: Record<string, { preferred: number; importance: number }>;
    preferredFaceTypes?: string[];
    relationshipQualities?: Record<string, number>;
    valueAlignmentImportance?: number;
    preferredHeightMinCm?: number | null;
    preferredHeightMaxCm?: number | null;
    similarityPreference?: string;
  } | null;

  /** 顔タイプ分類 */
  faceType: {
    primaryType: string;
    secondaryType: string | null;
  } | null;

  /** Stargazer 'self' コンテキストの軸スコア */
  stargazerScores: Record<string, number> | null;

  /** Origin シグナル */
  originSignals: {
    coreValues?: string[];
    passionSignals?: { what: string }[];
  } | null;

  /** 身長 (cm) */
  heightCm: number | null;

  /** 趣味・好きなこと (tag keys) */
  hobbies: string[] | null;

  /** 体型分類 (JP 3type / 7type) */
  bodyType: { jp3type: string | null; jp7type: string | null } | null;

  /** パーソナルカラー */
  personalColor: { season4: string | null; undertone: string | null } | null;

  /** 髪の特徴 */
  hair: { length: string | null; texture: string | null; color: string | null } | null;

  /** 顔パーツ比較データ (nose / mouth の印象スコアを5段階ラベル化) */
  faceComparison: {
    nose: { height: string; sharpness: string; presence: string } | null;
    mouth: { thickness: string; corner: string; softness: string } | null;
  } | null;

  /** マッチング優先順位 (3軸: face / style / personality) */
  matchingPriority: { priorities: string[] } | null;

  /** 外見プリファレンス (理想パートナーから取得) */
  appearancePreferences: {
    preferred_body_types?: string[];
    preferred_personal_color_seasons?: string[];
    preferred_hair_features?: { length?: string[]; color?: string[] };
    appearance_priority_order?: string[];
  } | null;
};

// ── 顔パーツ印象スコア → 5段階ラベル変換 ──

function mapScoreToLabel(score: number, lowLabel: string, highLabel: string): string {
  if (score <= -0.6) return `かなり${lowLabel}`;
  if (score <= -0.2) return `やや${lowLabel}`;
  if (score <= 0.2) return "平均";
  if (score <= 0.6) return `やや${highLabel}`;
  return `かなり${highLabel}`;
}

/**
 * 複数ユーザーのenrichedデータをバッチ取得
 * cron ジョブから呼ぶことを想定（N+1回避）
 */
export async function batchLoadEnrichedData(
  userIds: string[],
  category: RendezvousCategory,
): Promise<Map<string, UserEnrichedData>> {
  if (!userIds.length) return new Map();

  const [
    idealRes, faceTypeRes, stargazerRes, measurementRes, originRes, profilesRes,
    bodyTypeRes, personalColorRes, hairRes, facePhenotypeRes,
  ] = await Promise.all([
      // 1. 理想パートナープロフィール (外見プリファレンス追加)
      supabaseAdmin
        .from("rendezvous_ideal_partner_profiles")
        .select(
          "user_id, desired_traits, preferred_face_types, relationship_qualities, value_alignment_importance, preferred_height_min_cm, preferred_height_max_cm, similarity_preference, source, matching_priority, preferred_body_types, preferred_personal_color_seasons, preferred_hair_features, appearance_priority_order",
        )
        .in("user_id", userIds)
        .eq("category", category),

      // 2. 顔タイプ分類
      supabaseAdmin
        .from("face_type_classifications")
        .select("user_id, primary_type, secondary_type")
        .in("user_id", userIds),

      // 3. Stargazer context='self'
      supabaseAdmin
        .from("stargazer_context_profiles")
        .select("user_id, axis_scores")
        .in("user_id", userIds)
        .eq("context", "self"),

      // 4. 身体計測（最新のstature=身長を取得）
      supabaseAdmin
        .from("user_body_measurements")
        .select("user_id, measurements")
        .in("user_id", userIds)
        .order("measured_at", { ascending: false }),

      // 5. Origin ライフプロフィール
      supabaseAdmin
        .from("life_profiles")
        .select("user_id, core_values, passion_signals")
        .in("user_id", userIds),

      // 6. Rendezvous プロフィール（趣味）
      supabaseAdmin
        .from("rendezvous_profiles")
        .select("user_id, hobbies")
        .in("user_id", userIds),

      // 7. 体型分類 (JP 3type / 7type)
      supabaseAdmin
        .from("user_style_vector")
        .select("user_id, jp_3type, jp_7type")
        .in("user_id", userIds),

      // 8. パーソナルカラー
      supabaseAdmin
        .from("user_personal_color_profiles")
        .select("user_id, labels")
        .in("user_id", userIds),

      // 9. 髪の特徴
      supabaseAdmin
        .from("hair_phenotype")
        .select("user_id, length, texture, color")
        .in("user_id", userIds),

      // 10. 顔パーツ特徴 (phenotype JSONB)
      supabaseAdmin
        .from("face_phenotype")
        .select("user_id, phenotype")
        .in("user_id", userIds),
    ]);

  // インデックス構築
  const idealMap = new Map<string, (typeof idealRes.data extends (infer T)[] | null ? T : never)>();
  for (const row of idealRes.data ?? []) {
    idealMap.set(row.user_id, row);
  }

  const faceTypeMap = new Map<string, { primaryType: string; secondaryType: string | null }>();
  for (const row of faceTypeRes.data ?? []) {
    faceTypeMap.set(row.user_id, {
      primaryType: row.primary_type,
      secondaryType: row.secondary_type,
    });
  }

  const stargazerMap = new Map<string, Record<string, number>>();
  for (const row of stargazerRes.data ?? []) {
    stargazerMap.set(row.user_id, row.axis_scores as Record<string, number>);
  }

  // 身長: 同一ユーザーの最新1件だけ
  const heightMap = new Map<string, number>();
  for (const row of measurementRes.data ?? []) {
    if (heightMap.has(row.user_id)) continue; // order by desc なので最初がlatest
    const m = row.measurements as Record<string, number> | null;
    if (m?.stature) heightMap.set(row.user_id, m.stature);
  }

  const originMap = new Map<string, { coreValues?: string[]; passionSignals?: { what: string }[] }>();
  for (const row of originRes.data ?? []) {
    originMap.set(row.user_id, {
      coreValues: (row.core_values as string[]) ?? undefined,
      passionSignals: (row.passion_signals as { what: string }[]) ?? undefined,
    });
  }

  const hobbiesMap = new Map<string, string[]>();
  for (const row of profilesRes.data ?? []) {
    const h = row.hobbies as string[] | null;
    if (h && h.length > 0) hobbiesMap.set(row.user_id, h);
  }

  // 体型
  const bodyTypeMap = new Map<string, { jp3type: string | null; jp7type: string | null }>();
  for (const row of bodyTypeRes.data ?? []) {
    bodyTypeMap.set(row.user_id, {
      jp3type: (row as Record<string, unknown>).jp_3type as string | null,
      jp7type: (row as Record<string, unknown>).jp_7type as string | null,
    });
  }

  // パーソナルカラー
  const personalColorMap = new Map<string, { season4: string | null; undertone: string | null }>();
  for (const row of personalColorRes.data ?? []) {
    const labels = row.labels as Record<string, string> | null;
    personalColorMap.set(row.user_id, {
      season4: labels?.season4 ?? labels?.season ?? null,
      undertone: labels?.undertone ?? null,
    });
  }

  // 髪の特徴
  const hairMap = new Map<string, { length: string | null; texture: string | null; color: string | null }>();
  for (const row of hairRes.data ?? []) {
    hairMap.set(row.user_id, {
      length: (row as Record<string, unknown>).length as string | null,
      texture: (row as Record<string, unknown>).texture as string | null,
      color: (row as Record<string, unknown>).color as string | null,
    });
  }

  // 顔パーツ比較データ
  type FaceComparisonData = {
    nose: { height: string; sharpness: string; presence: string } | null;
    mouth: { thickness: string; corner: string; softness: string } | null;
  };
  const faceComparisonMap = new Map<string, FaceComparisonData>();
  for (const row of facePhenotypeRes.data ?? []) {
    const phenotype = row.phenotype as Record<string, unknown> | null;
    if (!phenotype) continue;

    const noseImpression = phenotype.nose_impression as Record<string, number> | null;
    const mouthImpression = phenotype.mouth_impression as Record<string, number> | null;

    faceComparisonMap.set(row.user_id, {
      nose: noseImpression
        ? {
            height: mapScoreToLabel(noseImpression.height ?? 0, "低い", "高い"),
            sharpness: mapScoreToLabel(noseImpression.sharpness ?? 0, "丸い", "シャープ"),
            presence: mapScoreToLabel(noseImpression.presence ?? 0, "控えめ", "存在感"),
          }
        : null,
      mouth: mouthImpression
        ? {
            thickness: mapScoreToLabel(mouthImpression.thickness ?? 0, "薄い", "厚い"),
            corner: mapScoreToLabel(mouthImpression.corner ?? 0, "下がり", "上がり"),
            softness: mapScoreToLabel(mouthImpression.softness ?? 0, "シャープ", "柔らかい"),
          }
        : null,
    });
  }

  // 結合
  const result = new Map<string, UserEnrichedData>();
  for (const uid of userIds) {
    const ideal = idealMap.get(uid);
    result.set(uid, {
      idealProfile: ideal
        ? {
            desiredTraits: ideal.desired_traits as Record<string, { preferred: number; importance: number }> | undefined,
            preferredFaceTypes: ideal.preferred_face_types as string[] | undefined,
            relationshipQualities: ideal.relationship_qualities as Record<string, number> | undefined,
            valueAlignmentImportance: ideal.value_alignment_importance as number | undefined,
            preferredHeightMinCm: ideal.preferred_height_min_cm as number | null | undefined,
            preferredHeightMaxCm: ideal.preferred_height_max_cm as number | null | undefined,
            similarityPreference: ideal.similarity_preference as string | undefined,
          }
        : null,
      faceType: faceTypeMap.get(uid) ?? null,
      stargazerScores: stargazerMap.get(uid) ?? null,
      originSignals: originMap.get(uid) ?? null,
      heightCm: heightMap.get(uid) ?? null,
      hobbies: hobbiesMap.get(uid) ?? null,
      bodyType: bodyTypeMap.get(uid) ?? null,
      personalColor: personalColorMap.get(uid) ?? null,
      hair: hairMap.get(uid) ?? null,
      faceComparison: faceComparisonMap.get(uid) ?? null,
      matchingPriority: (ideal?.matching_priority as { priorities: string[] } | null) ?? null,
      appearancePreferences: ideal
        ? {
            preferred_body_types: ideal.preferred_body_types as string[] | undefined,
            preferred_personal_color_seasons: ideal.preferred_personal_color_seasons as string[] | undefined,
            preferred_hair_features: ideal.preferred_hair_features as { length?: string[]; color?: string[] } | undefined,
            appearance_priority_order: ideal.appearance_priority_order as string[] | undefined,
          }
        : null,
    });
  }

  return result;
}

/**
 * バッチデータからペア用の EnrichedEvaluationInput を構成
 * A→B 方向: Aの理想 + Bの属性
 */
export function composeEnrichedPair(
  dataMap: Map<string, UserEnrichedData>,
  userA: string,
  userB: string,
): {
  enrichedAB: Partial<EnrichedEvaluationInput>;
  enrichedBA: Partial<EnrichedEvaluationInput>;
} {
  const dataA = dataMap.get(userA);
  const dataB = dataMap.get(userB);

  return {
    enrichedAB: composeOneDirection(dataA, dataB),
    enrichedBA: composeOneDirection(dataB, dataA),
  };
}

function composeOneDirection(
  self: UserEnrichedData | undefined,
  other: UserEnrichedData | undefined,
): Partial<EnrichedEvaluationInput> {
  const result: Partial<EnrichedEvaluationInput> = {};

  // Aの理想像
  if (self?.idealProfile) {
    result.selfIdealProfile = {
      desiredTraits: self.idealProfile.desiredTraits,
      preferredFaceTypes: self.idealProfile.preferredFaceTypes,
      relationshipQualities: self.idealProfile.relationshipQualities,
      valueAlignmentImportance: self.idealProfile.valueAlignmentImportance,
    };
    // ユーザーの類似/相補プリファレンスを渡す
    if (self.idealProfile.similarityPreference) {
      result.selfSimilarityPreference = self.idealProfile.similarityPreference;
    }
  }

  // ── フォールバック: idealProfileがない場合、Stargazerから自動推論 ──
  // 心理学の類似性仮説: 人は自分に近い特性を好む（Byrne, 1971）
  // + 安全軸は高い方を好む（boundary_respect等）
  if (!result.selfIdealProfile?.desiredTraits && self?.stargazerScores) {
    const scores = self.stargazerScores;
    const desiredTraits: Record<string, { preferred: number; importance: number }> = {};

    // 価値観・性格軸: 類似性（自分の値をpreferred に）
    const SIMILARITY_AXES = [
      "introvert_vs_extrovert", "individual_vs_social", "analytical_vs_intuitive",
      "change_embrace_vs_resist", "plan_vs_spontaneous", "independence_vs_harmony",
      "intimacy_pace", "emotional_variability", "social_initiative",
      "abstract_structuring", "decomposition", "cognitive_updating",
      "decision_tempo", "social_modeling", "exploration_closure",
    ];
    for (const axis of SIMILARITY_AXES) {
      if (scores[axis] !== undefined) {
        desiredTraits[axis] = { preferred: scores[axis], importance: 0.4 };
      }
    }

    // 安全軸: 高い方を好む（importance高め）
    const SAFETY_AXES = [
      "boundary_respect", "consent_maturity", "emotional_regulation",
      "rejection_response_maturity", "intent_stability",
    ];
    for (const axis of SAFETY_AXES) {
      desiredTraits[axis] = { preferred: 0.8, importance: 0.7 };
    }

    // リスク軸: 低い方を好む
    const RISK_AXES = [
      "escalation_risk", "pressure_risk", "control_tendency",
      "exclusivity_pressure", "public_private_gap",
    ];
    for (const axis of RISK_AXES) {
      desiredTraits[axis] = { preferred: -0.8, importance: 0.6 };
    }

    if (!result.selfIdealProfile) {
      result.selfIdealProfile = {};
    }
    result.selfIdealProfile.desiredTraits = desiredTraits;
  }

  // ── フォールバック: relationshipQualitiesも自動推論 ──
  if (!result.selfIdealProfile?.relationshipQualities && self?.stargazerScores) {
    const s = self.stargazerScores;
    const norm = (key: string) => {
      const v = s[key];
      return v !== undefined ? (v + 1) / 2 : 0.5; // -1~1 → 0~1
    };
    if (!result.selfIdealProfile) result.selfIdealProfile = {};
    result.selfIdealProfile.relationshipQualities = {
      intimacy: norm("intimacy_pace") * 0.7 + norm("emotional_openness") * 0.3,
      excitement: norm("stimulation_need") * 0.5 + norm("cautious_vs_bold") * 0.5,
      independence: norm("independence_vs_harmony"),
      depth: norm("depth_speed") * 0.6 + norm("emotional_openness") * 0.4,
      playfulness: norm("plan_vs_spontaneous") * 0.5 + norm("social_initiative") * 0.5,
      growth: norm("change_embrace_vs_resist") * 0.6 + norm("growth_mindset") * 0.4,
    };
  }

  // Bの顔タイプ
  if (other?.faceType) {
    result.otherFaceType = other.faceType;
  }

  // BのStargazerスコア
  if (other?.stargazerScores) {
    result.otherStargazerScores = other.stargazerScores;
  }

  // Originシグナル
  if (self?.originSignals) {
    result.selfOriginSignals = self.originSignals;
  }
  if (other?.originSignals) {
    result.otherOriginSignals = other.originSignals;
  }

  // 身長（身長好みのselfIdealProfileにも追加）
  if (other?.heightCm) {
    result.otherHeightCm = other.heightCm;
  }
  if (self?.idealProfile && result.selfIdealProfile) {
    result.selfIdealProfile.preferredHeightMinCm = self.idealProfile.preferredHeightMinCm;
    result.selfIdealProfile.preferredHeightMaxCm = self.idealProfile.preferredHeightMaxCm;
  }

  // 趣味
  if (self?.hobbies) result.selfHobbies = self.hobbies;
  if (other?.hobbies) result.otherHobbies = other.hobbies;

  // Phase 4: 体型・パーソナルカラー・髪・外見重視モード
  if (other?.bodyType?.jp3type && other?.bodyType?.jp7type) {
    result.otherBodyType = { jp3type: other.bodyType.jp3type, jp7type: other.bodyType.jp7type };
  }
  if (other?.personalColor?.season4 && other?.personalColor?.undertone) {
    result.otherPersonalColor = { season4: other.personalColor.season4, undertone: other.personalColor.undertone };
  }
  if (other?.hair?.length && other?.hair?.texture && other?.hair?.color) {
    result.otherHair = { length: other.hair.length, texture: other.hair.texture, color: other.hair.color };
  }
  if (self?.appearancePreferences) result.selfAppearancePreferences = self.appearancePreferences;
  if (self?.matchingPriority) result.selfMatchingPriority = self.matchingPriority as { priorities: ("face" | "style" | "personality")[] };

  // Vibe (雰囲気): 印象タイプ適合度
  // selfPreferredImpressionTypes = Aが好む顔/印象タイプ (preferredFaceTypes から取得)
  // otherImpressionType = Bの実際の印象タイプ (faceType.primaryType から取得)
  if (self?.idealProfile?.preferredFaceTypes?.length) {
    result.selfPreferredImpressionTypes = self.idealProfile.preferredFaceTypes;
  }
  if (other?.faceType?.primaryType) {
    result.otherImpressionType = other.faceType.primaryType;
  }

  return result;
}
