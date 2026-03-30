// lib/aneurasync/loadUnifiedPhenotype.ts
// 統合 Phenotype ローダー — Style / Calendar / Rendezvous 共通
// 7 テーブルを並列取得し、アバター/表現型データを一括返却する

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Return type ───────────────────────────────────────────

export interface UnifiedPhenotypeData {
  facePhenotype: {
    face_shape?: { primary: string; runner_up?: string };
    eye_shape?: { primary: string; runner_up?: string };
    brow_shape?: { primary: string; runner_up?: string };
    nose_impression?: { height: number; sharpness: number; presence: number };
    mouth_impression?: {
      thickness: number;
      corner: number;
      softness: number;
    };
    face_impression?: {
      warm_cool: number;
      soft_sharp: number;
      mature_youthful: number;
      cute_cool: number;
      friendly_mysterious: number;
    };
    completed_categories?: string[];
  } | null;

  faceType: {
    primaryType: string;
    secondaryType: string | null;
    structureScore: number;
    impressionScore: number;
    warmthScore: number;
    confidence: number;
  } | null;

  hair: {
    length: string | null;
    bangs: string | null;
    silhouette: string | null;
    texture: string | null;
    color: string | null;
    colorHex: string | null;
  } | null;

  personalColor: {
    season4: string | null;
    season12: string | null;
    season16: string | null;
    undertone: string | null;
    cpv: Record<string, number> | null;
  } | null;

  bodyCfv: Record<string, number> | null;
  bodyMeasurements: Record<string, number> | null;

  eye: { eyeType: string | null; eyeColor: string | null } | null;

  noseComparison: {
    height: string;
    sharpness: string;
    presence: string;
  } | null;
  mouthComparison: {
    thickness: string;
    corner: string;
    softness: string;
  } | null;
}

// ─── Score → 比較ラベル変換 ────────────────────────────────

const AXIS_LABELS: Record<string, [string, string]> = {
  "nose.height": ["低い", "高い"],
  "nose.sharpness": ["丸め", "シャープ"],
  "nose.presence": ["ナチュラル", "存在感あり"],
  "mouth.thickness": ["薄め", "ふっくら"],
  "mouth.corner": ["下がり気味", "上がり気味"],
  "mouth.softness": ["シャープ", "柔らかい"],
};

/**
 * -1〜+1 のスコアを 5 段階の日本語比較ラベルに変換する
 *
 * | 範囲            | パターン           |
 * |-----------------|--------------------|
 * | -1.0 〜 -0.6    | かなり{low}        |
 * | -0.6 〜 -0.2    | やや{low}          |
 * | -0.2 〜 +0.2    | 平均               |
 * | +0.2 〜 +0.6    | やや{high}         |
 * | +0.6 〜 +1.0    | かなり{high}       |
 */
export function mapScoreToComparison(score: number, axis: string): string {
  const pair = AXIS_LABELS[axis];
  if (!pair) return "平均";

  const [low, high] = pair;

  if (score <= -0.6) return `かなり${low}`;
  if (score <= -0.2) return `やや${low}`;
  if (score <= 0.2) return "平均";
  if (score <= 0.6) return `やや${high}`;
  return `かなり${high}`;
}

// ─── メインローダー ────────────────────────────────────────

export async function loadUnifiedPhenotype(
  supabase: SupabaseClient,
  userId: string,
): Promise<UnifiedPhenotypeData> {
  const [
    facePhenotypeRes,
    faceTypeRes,
    hairRes,
    colorRes,
    bodyRes,
    measurementRes,
    eyeRes,
  ] = await Promise.all([
    supabase
      .from("face_phenotype")
      .select("phenotype, completed_categories")
      .eq("user_id", userId)
      .maybeSingle(),

    supabase
      .from("face_type_classifications")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),

    supabase
      .from("hair_phenotype")
      .select("length, bangs, silhouette, texture, color, color_hex")
      .eq("user_id", userId)
      .maybeSingle(),

    supabase
      .from("user_personal_color_profiles")
      .select("cpv, labels, photo_analysis")
      .eq("user_id", userId)
      .maybeSingle(),

    supabase
      .from("user_body_profiles")
      .select("cfv, display_labels")
      .eq("user_id", userId)
      .maybeSingle(),

    supabase
      .from("user_body_measurements")
      .select("measurements")
      .eq("user_id", userId)
      .order("measured_at", { ascending: false })
      .limit(1),

    supabase
      .from("eye_profiles")
      .select("eye_type, eye_color")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  // ─── face_phenotype の展開 ───

  const fp = facePhenotypeRes.data?.phenotype as Record<string, unknown> | null;
  const completedCategories = facePhenotypeRes.data?.completed_categories as
    | string[]
    | null;

  const facePhenotype: UnifiedPhenotypeData["facePhenotype"] = fp
    ? {
        face_shape: (fp.face_shape as any) ?? undefined,
        eye_shape: (fp.eye_shape as any) ?? undefined,
        brow_shape: (fp.brow_shape as any) ?? undefined,
        nose_impression: (fp.nose_impression as any) ?? undefined,
        mouth_impression: (fp.mouth_impression as any) ?? undefined,
        face_impression: (fp.face_impression as any) ?? undefined,
        completed_categories: completedCategories ?? undefined,
      }
    : null;

  // ─── face_type_classifications ───

  const ftc = faceTypeRes.data;
  const faceType: UnifiedPhenotypeData["faceType"] = ftc
    ? {
        primaryType: ftc.primary_type,
        secondaryType: ftc.secondary_type ?? null,
        structureScore: ftc.structure_score,
        impressionScore: ftc.impression_score,
        warmthScore: ftc.warmth_score,
        confidence: ftc.confidence,
      }
    : null;

  // ─── hair ───

  const h = hairRes.data;
  const hair: UnifiedPhenotypeData["hair"] = h
    ? {
        length: h.length ?? null,
        bangs: h.bangs ?? null,
        silhouette: h.silhouette ?? null,
        texture: h.texture ?? null,
        color: h.color ?? null,
        colorHex: h.color_hex ?? null,
      }
    : null;

  // ─── personal color ───

  const labels = colorRes.data?.labels as Record<string, string> | null;
  const cpv = colorRes.data?.cpv as Record<string, number> | null;

  const personalColor: UnifiedPhenotypeData["personalColor"] =
    labels || cpv
      ? {
          season4: labels?.season4 ?? null,
          season12: labels?.season12 ?? null,
          season16: labels?.season16 ?? null,
          undertone: labels?.undertone ?? null,
          cpv: cpv ?? null,
        }
      : null;

  // ─── body ───

  const bodyCfv = (bodyRes.data?.cfv as Record<string, number>) ?? null;

  // measurementRes は .limit(1) なので配列で返る
  const measurements =
    (measurementRes.data?.[0]?.measurements as Record<string, number>) ?? null;

  // ─── eye ───

  const e = eyeRes.data;
  const eye: UnifiedPhenotypeData["eye"] = e
    ? { eyeType: e.eye_type ?? null, eyeColor: e.eye_color ?? null }
    : null;

  // ─── 鼻・口の比較ラベル生成 ───

  const noseImp = facePhenotype?.nose_impression ?? null;
  const noseComparison: UnifiedPhenotypeData["noseComparison"] = noseImp
    ? {
        height: mapScoreToComparison(noseImp.height, "nose.height"),
        sharpness: mapScoreToComparison(noseImp.sharpness, "nose.sharpness"),
        presence: mapScoreToComparison(noseImp.presence, "nose.presence"),
      }
    : null;

  const mouthImp = facePhenotype?.mouth_impression ?? null;
  const mouthComparison: UnifiedPhenotypeData["mouthComparison"] = mouthImp
    ? {
        thickness: mapScoreToComparison(
          mouthImp.thickness,
          "mouth.thickness",
        ),
        corner: mapScoreToComparison(mouthImp.corner, "mouth.corner"),
        softness: mapScoreToComparison(mouthImp.softness, "mouth.softness"),
      }
    : null;

  return {
    facePhenotype,
    faceType,
    hair,
    personalColor,
    bodyCfv,
    bodyMeasurements: measurements,
    eye,
    noseComparison,
    mouthComparison,
  };
}
