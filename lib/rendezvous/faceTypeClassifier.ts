import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  FacePhenotypeData,
  FaceShapeKey,
  EyeShapeKey,
  BrowShapeKey,
} from "@/types/face-phenotype";

// クライアントセーフな型・定数は faceTypes.ts から import + re-export
import type { FaceTypeId, FaceTypeInfo } from "./faceTypes";
export { FACE_TYPES } from "./faceTypes";
export type { FaceTypeId, FaceTypeInfo };

// ── 骨格タイプ → 直線/曲線スコア ──

const FACE_SHAPE_SCORES: Record<FaceShapeKey, number> = {
  oval: 0.3,              // やや曲線
  round: 0.8,             // 曲線
  oblong: -0.5,           // 直線
  square: -0.8,           // 直線
  heart: 0.2,             // やや曲線
  inverted_triangle: -0.3, // やや直線
};

const EYE_SHAPE_SCORES: Record<EyeShapeKey, number> = {
  armond: 0.0,     // 中間
  kirenaga: -0.6,  // 直線
  tsurime: -0.4,   // やや直線
  tareme: 0.6,     // 曲線
  marume: 0.8,     // 曲線
  yanagiba: -0.7,  // 直線
};

const BROW_SHAPE_SCORES: Record<BrowShapeKey, number> = {
  straight: -0.7,      // 直線
  soft_arch: 0.4,      // やや曲線
  high_arch: 0.2,      // やや曲線
  round: 0.7,          // 曲線
  flat: -0.5,          // 直線
  ascending: -0.3,     // やや直線
  thick_natural: 0.0,  // 中間
};

export type FaceClassificationResult = {
  primaryType: FaceTypeId;
  secondaryType: FaceTypeId | null;
  structureScore: number;   // -1(straight) to +1(curved)
  impressionScore: number;  // -1(fresh) to +1(deep)
  warmthScore: number;      // -1(cool) to +1(warm)
  confidence: number;       // 0-1
};

/**
 * FacePhenotypeData から顔タイプを分類
 */
export function classifyFaceType(
  phenotype: FacePhenotypeData,
): FaceClassificationResult {
  // ── 第1軸: 骨格印象（直線 ↔ 曲線）──
  let structureScore = 0;
  let structureFactors = 0;

  if (phenotype.face_shape?.primary) {
    structureScore += FACE_SHAPE_SCORES[phenotype.face_shape.primary as FaceShapeKey] ?? 0;
    structureFactors++;
  }
  if (phenotype.eye_shape?.primary) {
    structureScore += EYE_SHAPE_SCORES[phenotype.eye_shape.primary as EyeShapeKey] ?? 0;
    structureFactors++;
  }
  if (phenotype.brow_shape?.primary) {
    structureScore += BROW_SHAPE_SCORES[phenotype.brow_shape.primary as BrowShapeKey] ?? 0;
    structureFactors++;
  }

  if (structureFactors > 0) structureScore /= structureFactors;

  // ── 第2軸: 全体印象（フレッシュ ↔ ディープ）──
  let impressionScore = 0;
  let impressionFactors = 0;

  if (phenotype.face_impression) {
    const fi = phenotype.face_impression;

    // mature_youthful: -1(youthful=fresh) to +1(mature=deep)
    impressionScore += fi.mature_youthful ?? 0;
    impressionFactors++;

    // friendly_mysterious: -1(mysterious=deep) to +1(friendly=fresh) → 反転
    impressionScore += -(fi.friendly_mysterious ?? 0);
    impressionFactors++;

    // cute_cool: -1(cool=deep寄り) to +1(cute=fresh寄り) → 反転
    impressionScore += -(fi.cute_cool ?? 0) * 0.5;
    impressionFactors += 0.5;
  }

  if (impressionFactors > 0) impressionScore /= impressionFactors;

  // ── 温度軸（涼 ↔ 温）──
  let warmthScore = 0;
  let warmthFactors = 0;

  if (phenotype.face_impression) {
    const fi = phenotype.face_impression;

    // warm_cool: -1(cool) to +1(warm)
    warmthScore += fi.warm_cool ?? 0;
    warmthFactors++;

    // soft_sharp: -1(sharp=cool寄り) to +1(soft=warm寄り) × 0.5
    warmthScore += (fi.soft_sharp ?? 0) * 0.5;
    warmthFactors += 0.5;
  }

  // 口元の柔らかさも温度に影響
  if (phenotype.mouth_impression) {
    warmthScore += (phenotype.mouth_impression.softness ?? 0) * 0.3;
    warmthFactors += 0.3;
  }

  if (warmthFactors > 0) warmthScore /= warmthFactors;

  // ── 8タイプへの分類 ──
  const isCurved = structureScore >= 0;
  const isDeep = impressionScore >= 0;
  const isWarm = warmthScore >= 0;

  let primaryType: FaceTypeId;
  if (isCurved && !isDeep && isWarm) primaryType = "lumiere";
  else if (isCurved && !isDeep && !isWarm) primaryType = "bloom";
  else if (isCurved && isDeep && isWarm) primaryType = "terre";
  else if (isCurved && isDeep && !isWarm) primaryType = "aurora";
  else if (!isCurved && !isDeep && isWarm) primaryType = "prism";
  else if (!isCurved && !isDeep && !isWarm) primaryType = "silhouette";
  else if (!isCurved && isDeep && isWarm) primaryType = "ember";
  else primaryType = "monolith";

  // セカンダリ: 最も境界に近い軸を反転した場合のタイプ
  const axes = [
    { name: "structure", value: Math.abs(structureScore) },
    { name: "impression", value: Math.abs(impressionScore) },
    { name: "warmth", value: Math.abs(warmthScore) },
  ].sort((a, b) => a.value - b.value);

  let secondaryType: FaceTypeId | null = null;
  if (axes[0].value < 0.3) {
    // 最も境界に近い軸を反転
    const flippedCurved = axes[0].name === "structure" ? !isCurved : isCurved;
    const flippedDeep = axes[0].name === "impression" ? !isDeep : isDeep;
    const flippedWarm = axes[0].name === "warmth" ? !isWarm : isWarm;

    if (flippedCurved && !flippedDeep && flippedWarm) secondaryType = "lumiere";
    else if (flippedCurved && !flippedDeep && !flippedWarm) secondaryType = "bloom";
    else if (flippedCurved && flippedDeep && flippedWarm) secondaryType = "terre";
    else if (flippedCurved && flippedDeep && !flippedWarm) secondaryType = "aurora";
    else if (!flippedCurved && !flippedDeep && flippedWarm) secondaryType = "prism";
    else if (!flippedCurved && !flippedDeep && !flippedWarm) secondaryType = "silhouette";
    else if (!flippedCurved && flippedDeep && flippedWarm) secondaryType = "ember";
    else secondaryType = "monolith";

    if (secondaryType === primaryType) secondaryType = null;
  }

  // 信頼度: データの充実度
  let confidence = 0;
  if (phenotype.face_shape?.primary) confidence += 0.2;
  if (phenotype.eye_shape?.primary) confidence += 0.2;
  if (phenotype.brow_shape?.primary) confidence += 0.15;
  if (phenotype.face_impression) confidence += 0.3;
  if (phenotype.mouth_impression) confidence += 0.1;
  if (phenotype.nose_impression) confidence += 0.05;

  return {
    primaryType,
    secondaryType,
    structureScore: Math.round(structureScore * 1000) / 1000,
    impressionScore: Math.round(impressionScore * 1000) / 1000,
    warmthScore: Math.round(warmthScore * 1000) / 1000,
    confidence: Math.min(1, confidence),
  };
}

/**
 * ユーザーの顔タイプを分類してDBに保存
 */
export async function classifyAndSaveFaceType(userId: string): Promise<FaceClassificationResult | null> {
  // phenotype取得
  const { data } = await supabaseAdmin
    .from("face_phenotype")
    .select("phenotype")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.phenotype) return null;

  const phenotype = data.phenotype as FacePhenotypeData;
  const result = classifyFaceType(phenotype);

  // 保存
  await supabaseAdmin
    .from("face_type_classifications")
    .upsert(
      {
        user_id: userId,
        primary_type: result.primaryType,
        secondary_type: result.secondaryType,
        structure_score: result.structureScore,
        impression_score: result.impressionScore,
        warmth_score: result.warmthScore,
        confidence: result.confidence,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  return result;
}
