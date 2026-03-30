import type { EvaluationInput, EvaluationResult, DealbreakerProfile, CategoryWeights, MatchingVector } from "./types";
import { similarityScore, mixedFitScore } from "./similarityScore";
import { computeAxisFitWithStrategy, analyzeStrategyBalance } from "./similarityComplementarityMatrix";
import { getCategoryWeights } from "./categoryWeights";
import { computeCategoryAffinity } from "./categoryAffinity";
import { computeProfileBoost } from "./profileBoost";
import { collectReasonCodes, collectCautionCodes } from "./buildReasons";
import type { AttachmentProfile } from "./attachmentProfile";
import { computeAttachmentCompatibility } from "./attachmentProfile";
import type { ConflictRepairProfile } from "./conflictRepair";
import { computeConflictRepairCompatibility } from "./conflictRepair";
import type { SDTProfile } from "./sdtAxes";
import { computeSDTCompatibility } from "./sdtAxes";

// ── 新データソース型定義 ──

export type EnrichedEvaluationInput = {
  /** Aの「カテゴリ別理想像」 */
  selfIdealProfile?: {
    desiredTraits?: Record<string, { preferred: number; importance: number }>;
    preferredFaceTypes?: string[];
    relationshipQualities?: Record<string, number>;
    valueAlignmentImportance?: number;
    preferredHeightMinCm?: number | null;
    preferredHeightMaxCm?: number | null;
  };
  /** BのStargazer context別プロファイル（'self' context） */
  otherStargazerScores?: Record<string, number>;
  /** Bの顔タイプ */
  otherFaceType?: { primaryType: string; secondaryType?: string | null };
  /** Bの身長 (cm) */
  otherHeightCm?: number | null;
  /** AのOriginシグナル */
  selfOriginSignals?: { coreValues?: string[]; passionSignals?: { what: string }[] };
  /** BのOriginシグナル */
  otherOriginSignals?: { coreValues?: string[]; passionSignals?: { what: string }[] };
  // ── Phase 2: 学習済みウェイト ──
  /** パーソナライズされたウェイト（DB rendezvous_personalized_weights から取得） */
  personalizedWeights?: CategoryWeights;
  // ── Phase 1: 心理学的深度 ──
  /** Aのアタッチメントプロファイル */
  selfAttachmentProfile?: AttachmentProfile;
  /** Bのアタッチメントプロファイル */
  otherAttachmentProfile?: AttachmentProfile;
  /** Aの葛藤修復プロファイル */
  selfConflictRepairProfile?: ConflictRepairProfile;
  /** Bの葛藤修復プロファイル */
  otherConflictRepairProfile?: ConflictRepairProfile;
  /** AのSDTプロファイル */
  selfSDTProfile?: SDTProfile;
  /** BのSDTプロファイル */
  otherSDTProfile?: SDTProfile;
  /** Aの類似/相補プリファレンス (カテゴリ別: "similar"|"complementary"|"mixed"|"no_preference") */
  selfSimilarityPreference?: string;
  /** Aの趣味タグ */
  selfHobbies?: string[];
  /** Bの趣味タグ */
  otherHobbies?: string[];

  // ── Phase 4: 外見データ ──
  /** Bの体型分類 */
  otherBodyType?: { jp3type: string; jp7type: string } | null;
  /** Bのパーソナルカラー */
  otherPersonalColor?: { season4: string; undertone: string } | null;
  /** Bの髪の特徴 */
  otherHair?: { length: string; texture: string; color: string } | null;
  /** Aの外見プリファレンス */
  selfAppearancePreferences?: {
    preferred_body_types?: string[];
    preferred_personal_color_seasons?: string[];
    preferred_hair_features?: { length?: string[]; color?: string[] };
    appearance_priority_order?: string[];
  } | null;
  /** Aのマッチング優先順位 (顔/スタイル/性格 の3軸) */
  selfMatchingPriority?: MatchingPriority | null;
  // ── Vibe (雰囲気) データ ──
  /** Aが好む印象タイプ (e.g. ["lumiere", "bloom", "aurora"]) */
  selfPreferredImpressionTypes?: string[] | null;
  /** Bの実際の印象タイプ (e.g. "bloom") */
  otherImpressionType?: string | null;
};

/**
 * A→B の一方向評価
 * selfPreferences/selfVector = A の情報
 * otherVector = B の情報
 */
export function evaluateDirection(
  input: EvaluationInput & {
    /** プロフィール詳細（profileBoost用、任意） */
    selfProfile?: DealbreakerProfile;
    otherProfile?: DealbreakerProfile;
  } & Partial<EnrichedEvaluationInput>,
): EvaluationResult {
  const { selfPreferences, selfVector, otherVector, category } = input;

  const complementPref =
    selfPreferences.similarity_vs_complementarity ?? 0.2;

  // ユーザーのカテゴリ別「似た人/違う人」プリファレンス
  const simPref = input.selfSimilarityPreference;

  // ── Similarity-Complementarity Matrix: 軸ごとの戦略に基づくスコアリング ──
  // 価値観軸は類似、アプローチ軸は相補、文脈軸はカテゴリ依存（Gottman研究）
  // ユーザーの明示的な好み（similar/complementary/mixed）でオーバーライド
  const conversationFit = computeAxisFitWithStrategy("conversation_temperature", selfVector.conversation_temperature, otherVector.conversation_temperature, category, simPref).score;
  const distanceFit = computeAxisFitWithStrategy("distance_need", selfVector.distance_need, otherVector.distance_need, category, simPref).score;
  const depthFit = computeAxisFitWithStrategy("depth_speed", selfVector.depth_speed, otherVector.depth_speed, category, simPref).score;
  const initiativeFit = computeAxisFitWithStrategy("initiative", selfVector.initiative, otherVector.initiative, category, simPref).score;
  const emotionalFit = computeAxisFitWithStrategy("emotional_openness", selfVector.emotional_openness, otherVector.emotional_openness, category, simPref).score;
  const conflictFit = computeAxisFitWithStrategy("conflict_directness", selfVector.conflict_directness, otherVector.conflict_directness, category, simPref).score;
  const stabilityFit = computeAxisFitWithStrategy("stability_need", selfVector.stability_need, otherVector.stability_need, category, simPref).score;

  const rawCategoryAffinity = computeCategoryAffinity({
    category,
    selfVector,
    otherVector,
  });

  // プロフィール属性ブースト（ライフスタイル・エリア・会いやすさ）
  const profileBoost = computeProfileBoost({
    category,
    profileA: input.selfProfile,
    profileB: input.otherProfile,
  });

  // categoryAffinity = ベクトル親和性 70% + プロフィール属性 30%
  const categoryAffinity = rawCategoryAffinity * 0.7 + profileBoost * 0.3;

  // パーソナライズウェイトがあればベースとブレンド（70% personalized + 30% base）
  const baseWeights = getCategoryWeights(category);
  const weights: CategoryWeights = input.personalizedWeights
    ? blendWeights(baseWeights, input.personalizedWeights, 0.7)
    : baseWeights;

  // ── 既存ベクトルスコア ──
  const vectorTotal =
    conversationFit * weights.conversation +
    distanceFit * weights.distance +
    depthFit * weights.depth +
    initiativeFit * weights.initiative +
    emotionalFit * weights.emotional +
    conflictFit * weights.conflict +
    stabilityFit * weights.stability +
    categoryAffinity * weights.categoryAffinity;

  // ── 新データソース統合 ──
  const stargazerFit = computeStargazerFit(input);
  const relationshipQualityFit = computeRelationshipQualityFit(input);
  const originFit = computeOriginSignalFit(input);
  // Phase 4: 外見適合度 — 顔(face) と スタイル(style) を分離
  const hasExpandedAppearance = !!(
    input.selfAppearancePreferences?.preferred_body_types?.length ||
    input.selfAppearancePreferences?.preferred_personal_color_seasons?.length ||
    input.selfAppearancePreferences?.preferred_hair_features
  );
  // 顔カテゴリ: 顔タイプマッチのみ
  const faceTypeFit = computeFaceTypeFit(input);
  // スタイルカテゴリ: 体型 + 身長 + パーソナルカラー + 髪
  const styleFit = hasExpandedAppearance
    ? computeStyleFit(input)
    : computeHeightFit(input); // 拡張データなければ身長のみ
  const hobbyFit = computeHobbyFit(input);

  // ── Phase 1: 心理学的深度スコア ──
  const attachmentFit = computeAttachmentFitScore(input);
  const conflictRepairFit = computeConflictRepairFitScore(input);
  const sdtFit = computeSDTFitScore(input);

  const hasEnrichedData = !!(input.selfIdealProfile || input.otherStargazerScores || input.selfOriginSignals);
  const hasPsychologicalData = !!(
    input.selfAttachmentProfile && input.otherAttachmentProfile
  );

  // 新データがある場合: 重みを再配分
  // 心理学的データもある場合: さらに再配分
  // ない場合: 既存スコアのみ使用（後方互換）
  // 趣味データの有無
  const hasHobbyData = !!(input.selfHobbies?.length && input.otherHobbies?.length);

  // Phase 4+: マッチング優先順位に基づくウェイト配分
  // 3軸 (face / style / personality) の優先順位でカテゴリウェイトを決定
  const pw = getWeightsByPriority(input.selfMatchingPriority);

  let total: number;
  if (hasEnrichedData && hasPsychologicalData) {
    // フルスペック: 全データソース利用
    // personality = stargazer + attachment + conflict + sdt + relationship
    // face = faceTypeFit (顔タイプ + 顔比較)
    // style = bodyType + height + personalColor + hair (expandedAppearance)
    // vector = 行動ベクトル
    // other = origin + hobby + profile
    const personalityW = pw.personality;
    const faceW = pw.face;
    const styleW = pw.style;
    const vectorW = pw.vector;
    const otherW = pw.other;

    // personality 内訳: stargazer 36%, relationship 22%, attachment 24%, conflict 10%, sdt 8%
    const stargazerW = personalityW * 0.36;
    const relationshipW = personalityW * 0.22;
    const attachmentW = personalityW * 0.24;
    const conflictRepairW = personalityW * 0.10;
    const sdtW = personalityW * 0.08;

    // other 内訳: origin 50%, hobby 30%, profile 20%
    const originW = otherW * 0.50;
    const hobbyW = hasHobbyData ? otherW * 0.30 : 0;
    const profileW = otherW * 0.20;
    // 趣味データがなければ origin に再分配
    const adjustedOriginW = hasHobbyData ? originW : originW + otherW * 0.30;

    total =
      vectorTotal * vectorW +
      stargazerFit * stargazerW +
      relationshipQualityFit * relationshipW +
      originFit * adjustedOriginW +
      faceTypeFit * faceW +
      styleFit * styleW +
      profileBoost * profileW +
      attachmentFit * attachmentW +
      conflictRepairFit * conflictRepairW +
      sdtFit * sdtW +
      (hasHobbyData ? hobbyFit * hobbyW : 0);
  } else if (hasEnrichedData) {
    // enrichedデータあり、心理学データなし
    // personality からattachment/conflict/sdtを除外し、残りを再配分
    const personalityW = pw.personality;
    const faceW = pw.face;
    const styleW = pw.style;
    const vectorW = pw.vector;
    const otherW = pw.other;

    // 心理学なし → personality は stargazer + relationship のみ
    const stargazerW = personalityW * 0.60;
    const relationshipW = personalityW * 0.40;

    const originW = otherW * 0.50;
    const hobbyW = hasHobbyData ? otherW * 0.30 : 0;
    const profileW = otherW * 0.20;
    const adjustedOriginW = hasHobbyData ? originW : originW + otherW * 0.30;

    total =
      vectorTotal * vectorW +
      stargazerFit * stargazerW +
      relationshipQualityFit * relationshipW +
      originFit * adjustedOriginW +
      faceTypeFit * faceW +
      styleFit * styleW +
      profileBoost * profileW +
      (hasHobbyData ? hobbyFit * hobbyW : 0);
  } else if (hasPsychologicalData) {
    // enrichedデータなし、心理学データのみ
    total =
      vectorTotal * 0.70 +
      attachmentFit * 0.15 +
      conflictRepairFit * 0.08 +
      sdtFit * 0.07;
  } else {
    total = vectorTotal;
  }

  const reasonCodes = collectReasonCodes({
    category,
    conversationFit,
    distanceFit,
    depthFit,
    initiativeFit,
    emotionalFit,
    conflictFit,
    stabilityFit,
    categoryAffinity,
    // Phase 1: 心理学的深度
    attachmentFit,
    conflictRepairFit,
    sdtFit,
    // Phenotype
    appearanceFit: faceTypeFit,
  });

  const cautionCodes = collectCautionCodes({
    category,
    selfVector,
    otherVector,
    conversationFit,
    distanceFit,
    depthFit,
    initiativeFit,
    emotionalFit,
    conflictFit,
    stabilityFit,
    // Phase 1: 心理学的深度
    attachmentFit,
    conflictRepairFit,
    sdtFit,
  });

  return {
    total,
    dimensions: {
      conversationFit,
      distanceFit,
      depthFit,
      initiativeFit,
      emotionalFit,
      conflictFit,
      stabilityFit,
      categoryAffinity,
      // 新データソース（デバッグ/表示用）
      ...(hasEnrichedData ? { stargazerFit, relationshipQualityFit, originFit, faceTypeFit, styleFit } : {}),
      // Phase 1: 心理学的深度
      ...(hasPsychologicalData ? { attachmentFit, conflictRepairFit, sdtFit } : {}),
    },
    reasonCodes,
    cautionCodes,
  };
}

// ============================================================
// 新データソース計算関数
// ============================================================

/**
 * Stargazer 45軸適合度
 * Aの desired_traits vs Bの stargazer context profile
 */
function computeStargazerFit(input: Partial<EnrichedEvaluationInput>): number {
  if (!input.selfIdealProfile?.desiredTraits || !input.otherStargazerScores) return 0.5;

  const desired = input.selfIdealProfile.desiredTraits;
  const actual = input.otherStargazerScores;

  let weightedSum = 0;
  let totalImportance = 0;

  for (const [axisId, pref] of Object.entries(desired)) {
    if (actual[axisId] === undefined) continue;
    const importance = pref.importance ?? 0.5;
    // preferred は -1〜+1、actual も -1〜+1
    // ガウシアン類似度（σ=0.5）
    const diff = pref.preferred - actual[axisId];
    const fit = Math.exp(-(diff * diff) / 0.5);
    weightedSum += fit * importance;
    totalImportance += importance;
  }

  if (totalImportance === 0) return 0.5;
  return weightedSum / totalImportance;
}

/**
 * 求める関係性の質 vs 相手の特性
 * Aの relationship_qualities をBの特性（Stargazerベース）と比較
 */
function computeRelationshipQualityFit(input: Partial<EnrichedEvaluationInput>): number {
  if (!input.selfIdealProfile?.relationshipQualities || !input.otherStargazerScores) return 0.5;

  const qualities = input.selfIdealProfile.relationshipQualities;
  const other = input.otherStargazerScores;

  // 関係性の質 → Stargazer軸へのマッピング
  const QUALITY_AXIS_MAP: Record<string, { axes: string[]; direction: number }> = {
    intimacy: { axes: ["intimacy_pace", "emotional_openness", "reassurance_need"], direction: 1 },
    excitement: { axes: ["stimulation_need", "change_embrace_vs_resist", "cautious_vs_bold"], direction: 1 },
    independence: { axes: ["independence_vs_harmony", "boundary_awareness"], direction: -1 },
    depth: { axes: ["depth_speed", "emotional_openness"], direction: 1 },
    playfulness: { axes: ["plan_vs_spontaneous", "social_initiative"], direction: 1 },
    growth: { axes: ["change_embrace_vs_resist", "perfectionist_vs_pragmatic"], direction: 1 },
  };

  let totalFit = 0;
  let count = 0;

  for (const [quality, desired] of Object.entries(qualities)) {
    const mapping = QUALITY_AXIS_MAP[quality];
    if (!mapping) continue;

    // 対応する軸の平均を算出
    let axisAvg = 0;
    let axisCount = 0;
    for (const axis of mapping.axes) {
      if (other[axis] !== undefined) {
        axisAvg += other[axis] * mapping.direction;
        axisCount++;
      }
    }
    if (axisCount === 0) continue;
    axisAvg /= axisCount;

    // axisAvg を 0-1 に正規化（-1〜+1 → 0〜1）
    const normalizedAxis = (axisAvg + 1) / 2;
    // desired は既に 0-1
    const diff = desired - normalizedAxis;
    const fit = Math.exp(-(diff * diff) / 0.3);
    totalFit += fit;
    count++;
  }

  if (count === 0) return 0.5;
  return totalFit / count;
}

/**
 * Origin シグナル適合度（価値観・情熱の一致）
 */
function computeOriginSignalFit(input: Partial<EnrichedEvaluationInput>): number {
  if (!input.selfOriginSignals || !input.otherOriginSignals) return 0.5;

  let totalFit = 0;
  let components = 0;

  // coreValues Jaccard類似度
  const selfValues = new Set(input.selfOriginSignals.coreValues ?? []);
  const otherValues = new Set(input.otherOriginSignals.coreValues ?? []);
  if (selfValues.size > 0 && otherValues.size > 0) {
    const intersection = [...selfValues].filter((v) => otherValues.has(v)).length;
    const union = new Set([...selfValues, ...otherValues]).size;
    totalFit += union > 0 ? intersection / union : 0;
    components++;
  }

  // passionSignals カテゴリ重複
  const selfPassions = new Set(
    (input.selfOriginSignals.passionSignals ?? []).map((p) => p.what.toLowerCase()),
  );
  const otherPassions = new Set(
    (input.otherOriginSignals.passionSignals ?? []).map((p) => p.what.toLowerCase()),
  );
  if (selfPassions.size > 0 && otherPassions.size > 0) {
    const intersection = [...selfPassions].filter((p) => otherPassions.has(p)).length;
    const union = new Set([...selfPassions, ...otherPassions]).size;
    totalFit += union > 0 ? intersection / union : 0;
    components++;
  }

  if (components === 0) return 0.5;

  // valueAlignmentImportance で重み調整
  const importance = input.selfIdealProfile?.valueAlignmentImportance ?? 0.5;
  const rawFit = totalFit / components;
  // importance=1 → 100%反映、importance=0 → 0.5固定
  return 0.5 + (rawFit - 0.5) * importance * 2;
}

/**
 * 顔タイプ適合度（ソフトブースト）
 */
function computeFaceTypeFit(input: Partial<EnrichedEvaluationInput>): number {
  if (!input.selfIdealProfile?.preferredFaceTypes?.length || !input.otherFaceType) return 0.5;

  const preferred = input.selfIdealProfile.preferredFaceTypes;
  const otherPrimary = input.otherFaceType.primaryType;
  const otherSecondary = input.otherFaceType.secondaryType;

  // プライマリが好みに含まれる: 1.0
  if (preferred.includes(otherPrimary)) return 1.0;
  // セカンダリが好みに含まれる: 0.8
  if (otherSecondary && preferred.includes(otherSecondary)) return 0.8;
  // どちらも含まれない: 0.5（ペナルティなし、ブーストなし）
  return 0.5;
}

/**
 * 身長適合度（ソフトブースト）
 * 好み範囲内: 1.0、±5cm: 0.7、±10cm: 0.5、それ以上: 0.3
 * 好み未設定: 0.5（neutral）
 */
function computeHeightFit(input: Partial<EnrichedEvaluationInput>): number {
  const minH = input.selfIdealProfile?.preferredHeightMinCm;
  const maxH = input.selfIdealProfile?.preferredHeightMaxCm;
  const otherH = input.otherHeightCm;

  if (!minH && !maxH) return 0.5; // 好み未設定
  if (!otherH) return 0.5; // 相手の身長不明

  const lo = minH ?? 0;
  const hi = maxH ?? 300;

  if (otherH >= lo && otherH <= hi) return 1.0;

  const dist = otherH < lo ? lo - otherH : otherH - hi;
  if (dist <= 5) return 0.7;
  if (dist <= 10) return 0.5;
  return 0.3;
}

/**
 * 統合外見適合度: 顔タイプ (70%) + 身長 (30%)
 */
function computeAppearanceFit(input: Partial<EnrichedEvaluationInput>): number {
  const faceFit = computeFaceTypeFit(input);
  const heightFit = computeHeightFit(input);
  return faceFit * 0.7 + heightFit * 0.3;
}

// ============================================================
// Phase 1: 心理学的深度スコア計算
// ============================================================

/**
 * アタッチメント互換性スコア
 */
function computeAttachmentFitScore(input: Partial<EnrichedEvaluationInput>): number {
  if (!input.selfAttachmentProfile || !input.otherAttachmentProfile) return 0.5;
  return computeAttachmentCompatibility(
    input.selfAttachmentProfile,
    input.otherAttachmentProfile,
  );
}

/**
 * 葛藤修復互換性スコア
 */
function computeConflictRepairFitScore(input: Partial<EnrichedEvaluationInput>): number {
  if (!input.selfConflictRepairProfile || !input.otherConflictRepairProfile) return 0.5;
  return computeConflictRepairCompatibility(
    input.selfConflictRepairProfile,
    input.otherConflictRepairProfile,
  );
}

/**
 * SDT互換性スコア
 */
function computeSDTFitScore(input: Partial<EnrichedEvaluationInput>): number {
  if (!input.selfSDTProfile || !input.otherSDTProfile) return 0.5;
  return computeSDTCompatibility(input.selfSDTProfile, input.otherSDTProfile);
}

/**
 * 趣味・好きなことの一致度（Jaccard類似度）
 */
function computeHobbyFit(input: Partial<EnrichedEvaluationInput>): number {
  if (!input.selfHobbies?.length || !input.otherHobbies?.length) return 0.5;

  const selfSet = new Set(input.selfHobbies);
  const otherSet = new Set(input.otherHobbies);
  const intersection = [...selfSet].filter((h) => otherSet.has(h)).length;
  const union = new Set([...selfSet, ...otherSet]).size;

  if (union === 0) return 0.5;

  // Jaccard index をスコアにマッピング (0% match → 0.3, 100% match → 1.0)
  const jaccard = intersection / union;
  return 0.3 + jaccard * 0.7;
}

// ============================================================
// Phase 4: 外見詳細スコアリング
// ============================================================

/**
 * 体型適合度: selfの好み vs otherの体型
 */
function computeBodyTypeFit(selfPrefs: string[] | undefined, otherType: { jp3type: string } | null | undefined): number {
  if (!selfPrefs?.length || !otherType?.jp3type) return 0.5;
  const idx = selfPrefs.indexOf(otherType.jp3type);
  if (idx === 0) return 1.0;  // top choice
  if (idx === 1) return 0.85;
  if (idx === 2) return 0.7;
  return 0.4;  // not in preferences
}

/**
 * パーソナルカラー適合度: selfの好み vs otherのシーズン
 * 同じ色温度(warm/cool)なら部分点
 */
function computePersonalColorFit(selfPrefs: string[] | undefined, otherColor: { season4: string } | null | undefined): number {
  if (!selfPrefs?.length || !otherColor?.season4) return 0.5;
  const WARM_SEASONS = new Set(["spring", "autumn"]);
  const COOL_SEASONS = new Set(["summer", "winter"]);
  const idx = selfPrefs.indexOf(otherColor.season4);
  if (idx >= 0) return [1.0, 0.85, 0.7][idx] ?? 0.7;
  // Same temperature base gets partial credit
  const selfBase = selfPrefs[0] && WARM_SEASONS.has(selfPrefs[0]) ? "warm" : "cool";
  const otherBase = WARM_SEASONS.has(otherColor.season4) ? "warm" : "cool";
  return selfBase === otherBase ? 0.6 : 0.35;
}

/**
 * 髪の特徴適合度: selfの好み vs otherの髪
 * length と color をそれぞれ評価して平均
 */
function computeHairFit(selfPrefs: { length?: string[]; color?: string[] } | undefined, otherHair: { length: string; color: string } | null | undefined): number {
  if (!selfPrefs || !otherHair) return 0.5;
  let score = 0.5;
  let count = 0;
  if (selfPrefs.length?.length && otherHair.length) {
    const idx = selfPrefs.length.indexOf(otherHair.length);
    score += idx >= 0 ? ([0.5, 0.35, 0.2][idx] ?? 0.2) : 0;
    count++;
  }
  if (selfPrefs.color?.length && otherHair.color) {
    const idx = selfPrefs.color.indexOf(otherHair.color);
    score += idx >= 0 ? ([0.5, 0.35, 0.2][idx] ?? 0.2) : 0;
    count++;
  }
  return count > 0 ? Math.min(1, score) : 0.5;
}

/**
 * スタイル適合度: 体型 + 身長 + パーソナルカラー + 髪 (顔タイプを除く)
 * appearance_priority_order に基づいて動的にウェイト配分
 */
function computeStyleFit(input: Partial<EnrichedEvaluationInput>): number {
  const heightFit = computeHeightFit(input);
  const prefs = input.selfAppearancePreferences;
  const bodyTypeFit = computeBodyTypeFit(prefs?.preferred_body_types, input.otherBodyType ?? null);
  const personalColorFit = computePersonalColorFit(prefs?.preferred_personal_color_seasons, input.otherPersonalColor ?? null);
  const hairFit = computeHairFit(prefs?.preferred_hair_features, input.otherHair ?? null);

  // スタイルカテゴリ内のウェイト配分
  // bodyType: 35%, height: 25%, personalColor: 20%, hair: 20%
  return bodyTypeFit * 0.35 + heightFit * 0.25 + personalColorFit * 0.20 + hairFit * 0.20;
}

/**
 * 拡張版外見適合度: 顔タイプ + 身長 + 体型 + パーソナルカラー + 髪
 * appearance_priority_order に基づいて動的にウェイト配分
 * NOTE: レガシー関数 - 新システムでは computeStyleFit + computeFaceTypeFit を使用
 */
function computeExpandedAppearanceFit(input: Partial<EnrichedEvaluationInput>): number {
  const faceFit = computeFaceTypeFit(input);
  const heightFit = computeHeightFit(input);

  const prefs = input.selfAppearancePreferences;
  const bodyTypeFit = computeBodyTypeFit(prefs?.preferred_body_types, input.otherBodyType ?? null);
  const personalColorFit = computePersonalColorFit(prefs?.preferred_personal_color_seasons, input.otherPersonalColor ?? null);
  const hairFit = computeHairFit(prefs?.preferred_hair_features, input.otherHair ?? null);

  // 身長は常に 0.10 固定
  const HEIGHT_WEIGHT = 0.10;

  // priority_order に基づいてウェイト配分
  const priorityOrder = prefs?.appearance_priority_order;
  const PRIORITY_WEIGHTS = [0.35, 0.25, 0.20];

  const categoryScores: Record<string, number> = {
    face: faceFit,
    bodyType: bodyTypeFit,
    personalColor: personalColorFit,
    hair: hairFit,
  };

  let weightedSum = heightFit * HEIGHT_WEIGHT;
  let assignedWeight = HEIGHT_WEIGHT;

  if (priorityOrder?.length) {
    // 優先順位に基づいたウェイト割り当て
    for (let i = 0; i < Math.min(priorityOrder.length, PRIORITY_WEIGHTS.length); i++) {
      const cat = priorityOrder[i];
      if (cat && categoryScores[cat] !== undefined) {
        weightedSum += categoryScores[cat] * PRIORITY_WEIGHTS[i];
        assignedWeight += PRIORITY_WEIGHTS[i];
        delete categoryScores[cat]; // 割り当て済み
      }
    }
    // 残りのカテゴリに均等分配
    const remaining = Object.values(categoryScores);
    const remainingWeight = Math.max(0, 1.0 - assignedWeight);
    if (remaining.length > 0 && remainingWeight > 0) {
      const perCat = remainingWeight / remaining.length;
      for (const score of remaining) {
        weightedSum += score * perCat;
      }
    }
  } else {
    // priority_order 未設定: 均等分配 (身長以外)
    const cats = Object.values(categoryScores);
    const remainingWeight = 1.0 - HEIGHT_WEIGHT;
    const perCat = remainingWeight / cats.length;
    for (const score of cats) {
      weightedSum += score * perCat;
    }
  }

  return Math.max(0, Math.min(1, weightedSum));
}

// ============================================================
// Vibe (雰囲気) 適合度
// ============================================================

/**
 * Compute vibe/atmosphere compatibility.
 * Based on impression type alignment + Stargazer surface tendencies.
 *
 * Vibe is the "feeling" of being around someone -- distinct from personality (deep traits)
 * and face (physical appearance). It's about energy, warmth, tempo.
 */
function computeVibeFit(
  selfPreferredImpressionTypes: string[] | null,
  otherImpressionType: string | null,
  selfVector: MatchingVector | null,
  otherVector: MatchingVector | null,
): number {
  let score = 0.5; // baseline

  // 1. Impression type match (40% of vibe score)
  if (selfPreferredImpressionTypes && otherImpressionType) {
    const rank = selfPreferredImpressionTypes.indexOf(otherImpressionType);
    if (rank === 0) score += 0.2;
    else if (rank === 1) score += 0.14;
    else if (rank === 2) score += 0.08;
  }

  // 2. Energy/tempo alignment from matching vectors (30% of vibe score)
  if (selfVector && otherVector) {
    const tempDiff = Math.abs(selfVector.conversation_temperature - otherVector.conversation_temperature);
    score += (1 - tempDiff) * 0.15;

    const socialDiff = Math.abs(selfVector.social_energy - otherVector.social_energy);
    score += (1 - socialDiff) * 0.15;
  }

  // 3. Emotional openness compatibility (30% of vibe score)
  if (selfVector && otherVector) {
    const emotDiff = Math.abs(selfVector.emotional_openness - otherVector.emotional_openness);
    score += (1 - emotDiff) * 0.15;

    const stimDiff = Math.abs(selfVector.stimulation_need - otherVector.stimulation_need);
    score += (1 - stimDiff) * 0.15;
  }

  return Math.min(1, Math.max(0, score));
}

// ============================================================
// 4カテゴリ双方向スコアリング (顔 / 雰囲気 / スタイル / 性格)
// ============================================================

export interface CategoryScores {
  face: number;        // 0-100
  vibe: number;        // 0-100
  style: number;       // 0-100
  personality: number; // 0-100
  overall: number;     // 0-100
}

export interface BidirectionalScores {
  /** あなたから見た相性: How well the other person matches MY preferences */
  myView: CategoryScores;
  /** 相手から見た相性: How well I match the OTHER person's preferences */
  theirView: CategoryScores;
}

/**
 * 一方向の顔スコアを算出 (0-1)
 */
function computeFaceScoreFromInput(input: Partial<EnrichedEvaluationInput>): number {
  return computeFaceTypeFit(input);
}

/**
 * 一方向の雰囲気スコアを算出 (0-1)
 * EnrichedEvaluationInput + MatchingVector を使用
 */
function computeVibeScoreFromInput(
  input: Partial<EnrichedEvaluationInput>,
  selfVector: MatchingVector | null,
  otherVector: MatchingVector | null,
): number {
  // selfPreferredImpressionTypes / otherImpressionType は
  // EnrichedEvaluationInput の拡張フィールドから取得
  const selfPreferred = (input as any).selfPreferredImpressionTypes ?? null;
  const otherType = (input as any).otherImpressionType ?? null;
  return computeVibeFit(selfPreferred, otherType, selfVector, otherVector);
}

/**
 * 一方向のスタイルスコアを算出 (0-1)
 */
function computeStyleScoreFromInput(input: Partial<EnrichedEvaluationInput>): number {
  const hasExpanded = !!(
    input.selfAppearancePreferences?.preferred_body_types?.length ||
    input.selfAppearancePreferences?.preferred_personal_color_seasons?.length ||
    input.selfAppearancePreferences?.preferred_hair_features
  );
  return hasExpanded ? computeStyleFit(input) : computeHeightFit(input);
}

/**
 * 一方向の性格スコアを算出 (0-1)
 * stargazerFit + attachmentSafety + conflictRepair + sdtFit + relationshipQualityFit
 */
function computePersonalityScoreFromInput(input: Partial<EnrichedEvaluationInput>): number {
  const stargazerFit = computeStargazerFit(input);
  const attachmentFit = computeAttachmentFitScore(input);
  const conflictRepairFit = computeConflictRepairFitScore(input);
  const sdtFit = computeSDTFitScore(input);
  const relationshipQualityFit = computeRelationshipQualityFit(input);

  const hasPsych = !!(input.selfAttachmentProfile && input.otherAttachmentProfile);
  const hasStargazer = !!(input.selfIdealProfile?.desiredTraits || input.otherStargazerScores);

  if (hasPsych && hasStargazer) {
    // Full: stargazer 36%, relationship 22%, attachment 24%, conflict 10%, sdt 8%
    return (
      stargazerFit * 0.36 +
      relationshipQualityFit * 0.22 +
      attachmentFit * 0.24 +
      conflictRepairFit * 0.10 +
      sdtFit * 0.08
    );
  }
  if (hasStargazer) {
    return stargazerFit * 0.60 + relationshipQualityFit * 0.40;
  }
  if (hasPsych) {
    return attachmentFit * 0.50 + conflictRepairFit * 0.27 + sdtFit * 0.23;
  }
  return 0.5; // no data
}

/**
 * A-B 双方向の4カテゴリスコアを算出
 */
export function computeBidirectionalCategoryScores(
  inputAtoB: EnrichedEvaluationInput,
  inputBtoA: EnrichedEvaluationInput,
  vectorA: MatchingVector | null,
  vectorB: MatchingVector | null,
): BidirectionalScores {
  // A's view: how well B matches A's preferences
  const myView: CategoryScores = {
    face: Math.round(computeFaceScoreFromInput(inputAtoB) * 100),
    vibe: Math.round(computeVibeScoreFromInput(inputAtoB, vectorA, vectorB) * 100),
    style: Math.round(computeStyleScoreFromInput(inputAtoB) * 100),
    personality: Math.round(computePersonalityScoreFromInput(inputAtoB) * 100),
    overall: 0,
  };
  myView.overall = Math.round(
    myView.face * 0.20 + myView.vibe * 0.25 + myView.style * 0.20 + myView.personality * 0.35
  );

  // B's view: how well A matches B's preferences
  const theirView: CategoryScores = {
    face: Math.round(computeFaceScoreFromInput(inputBtoA) * 100),
    vibe: Math.round(computeVibeScoreFromInput(inputBtoA, vectorB, vectorA) * 100),
    style: Math.round(computeStyleScoreFromInput(inputBtoA) * 100),
    personality: Math.round(computePersonalityScoreFromInput(inputBtoA) * 100),
    overall: 0,
  };
  theirView.overall = Math.round(
    theirView.face * 0.20 + theirView.vibe * 0.25 + theirView.style * 0.20 + theirView.personality * 0.35
  );

  return { myView, theirView };
}

// ============================================================
// マッチング優先順位システム (3軸: face / style / personality)
// ============================================================

export type MatchingPriority = {
  priorities: ("face" | "style" | "personality")[];  // ordered by importance, 0-3 items
};

/**
 * 優先順位の並びに対応する全カテゴリウェイトを返す。
 *
 * priorities が空、または null の場合はデフォルト (バランス) を返す。
 * 6 通りの並び替えに対してハードコードされたウェイトテーブルを持ち、
 * 未知の組み合わせはデフォルトにフォールバックする。
 */
export type PriorityWeights = {
  personality: number;
  face: number;
  style: number;
  vector: number;
  other: number;
};

const DEFAULT_WEIGHTS: PriorityWeights = {
  personality: 0.45,
  face: 0.12,
  style: 0.13,
  vector: 0.20,
  other: 0.10,
};

/**
 * 優先順位キー (ソート済み文字列) → ウェイトマップ
 */
const PRIORITY_WEIGHT_TABLE: Record<string, PriorityWeights> = {
  // 性格 > 顔 > スタイル
  "personality,face,style": { personality: 0.50, face: 0.15, style: 0.10, vector: 0.15, other: 0.10 },
  // 性格 > スタイル > 顔
  "personality,style,face": { personality: 0.50, face: 0.10, style: 0.15, vector: 0.15, other: 0.10 },
  // 顔 > 性格 > スタイル
  "face,personality,style": { personality: 0.30, face: 0.25, style: 0.10, vector: 0.25, other: 0.10 },
  // 顔 > スタイル > 性格
  "face,style,personality": { personality: 0.30, face: 0.25, style: 0.20, vector: 0.15, other: 0.10 },
  // スタイル > 性格 > 顔
  "style,personality,face": { personality: 0.35, face: 0.10, style: 0.25, vector: 0.20, other: 0.10 },
  // スタイル > 顔 > 性格
  "style,face,personality": { personality: 0.30, face: 0.15, style: 0.25, vector: 0.20, other: 0.10 },
};

export function getWeightsByPriority(priority: MatchingPriority | null | undefined): PriorityWeights {
  if (!priority?.priorities?.length) return DEFAULT_WEIGHTS;
  const key = priority.priorities.join(",");
  return PRIORITY_WEIGHT_TABLE[key] ?? DEFAULT_WEIGHTS;
}

// ============================================================
// ウェイトブレンド
// ============================================================

/**
 * パーソナライズウェイトとベースウェイトをブレンド
 * ratio = パーソナライズの比率 (0.7 = 70%パーソナライズ + 30%ベース)
 */
function blendWeights(
  base: CategoryWeights,
  personalized: CategoryWeights,
  ratio: number,
): CategoryWeights {
  const keys: (keyof CategoryWeights)[] = [
    "conversation", "distance", "depth", "initiative",
    "emotional", "conflict", "stability", "categoryAffinity",
  ];
  const blended = {} as CategoryWeights;
  let sum = 0;
  for (const key of keys) {
    blended[key] = base[key] * (1 - ratio) + personalized[key] * ratio;
    sum += blended[key];
  }
  // 正規化（合計1.0に）
  if (sum > 0) {
    for (const key of keys) {
      blended[key] /= sum;
    }
  }
  return blended;
}
