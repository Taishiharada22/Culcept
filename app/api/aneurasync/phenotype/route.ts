// app/api/aneurasync/phenotype/route.ts
// 統合 Phenotype API — 全データを一括取得
// マッチングシステム、プロフィール表示、分析で使用

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export interface UnifiedPhenotype {
  user_id: string;

  // 顔タイプ（8タイプ分類）
  face_type: {
    primary_type: string;
    secondary_type: string | null;
    structure_score: number;
    impression_score: number;
    warmth_score: number;
    confidence: number;
  } | null;

  // 顔パーツ（骨格/印象）
  face_phenotype: {
    face_shape: { primary: string; confidence?: number } | null;
    eye_shape: { primary: string; confidence?: number } | null;
    brow_shape: { primary: string; confidence?: number } | null;
    nose_impression: { height: number; sharpness: number; presence: number } | null;
    mouth_impression: { thickness: number; corner: number; softness: number } | null;
    face_impression: {
      warm_cool: number;
      soft_sharp: number;
      mature_youthful: number;
      cute_cool: number;
      friendly_mysterious: number;
    } | null;
  } | null;

  // 目
  eye: {
    eye_type: string;
    eye_color: string | null;
  } | null;

  // 髪
  hair: {
    length: string | null;
    bangs: string | null;
    silhouette: string | null;
    texture: string | null;
    color: string | null;
    color_hex: string | null;
  } | null;

  // パーソナルカラー
  personal_color: {
    season4: string | null;
    season12: string | null;
    season16: string | null;
    undertone: string | null;
    photo_analysis: Record<string, unknown> | null;
  } | null;

  // 体型
  body: {
    height_cm: number | null;
    weight_kg: number | null;
    cfv: Record<string, number> | null;
    display_labels: Record<string, string> | null;
  } | null;
}

// ─── GET: 自分の統合phenotype ───
export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id") || auth.user.id;

    // 自分以外のデータを取得する場合はservice_roleを使用
    const db = targetUserId === auth.user.id ? supabase : supabaseAdmin;

    const [
      faceTypeRes,
      facePhenotypeRes,
      eyeRes,
      hairRes,
      colorRes,
      bodyRes,
      measurementRes,
    ] = await Promise.all([
      db.from("face_type_classifications").select("*").eq("user_id", targetUserId).maybeSingle(),
      db.from("face_phenotype").select("phenotype").eq("user_id", targetUserId).maybeSingle(),
      db.from("eye_profile").select("eye_type, eye_color").eq("user_id", targetUserId).maybeSingle(),
      db.from("hair_phenotype").select("length, bangs, silhouette, texture, color, color_hex").eq("user_id", targetUserId).maybeSingle(),
      db.from("user_personal_color_profiles").select("labels, photo_analysis").eq("user_id", targetUserId).maybeSingle(),
      db.from("user_body_profiles").select("cfv, display_labels").eq("user_id", targetUserId).maybeSingle(),
      db.from("user_body_measurements").select("measurements").eq("user_id", targetUserId).order("measured_at", { ascending: false }).limit(1),
    ]);

    const ftc = faceTypeRes.data;
    const fp = facePhenotypeRes.data?.phenotype as Record<string, unknown> | null;
    const labels = colorRes.data?.labels as Record<string, string> | null;
    const measurements = measurementRes.data?.[0]?.measurements as Record<string, number> | null;

    const unified: UnifiedPhenotype = {
      user_id: targetUserId,

      face_type: ftc ? {
        primary_type: ftc.primary_type,
        secondary_type: ftc.secondary_type,
        structure_score: ftc.structure_score,
        impression_score: ftc.impression_score,
        warmth_score: ftc.warmth_score,
        confidence: ftc.confidence,
      } : null,

      face_phenotype: fp ? {
        face_shape: fp.face_shape as UnifiedPhenotype["face_phenotype"] extends null ? never : NonNullable<UnifiedPhenotype["face_phenotype"]>["face_shape"] ?? null,
        eye_shape: fp.eye_shape as any ?? null,
        brow_shape: fp.brow_shape as any ?? null,
        nose_impression: fp.nose_impression as any ?? null,
        mouth_impression: fp.mouth_impression as any ?? null,
        face_impression: fp.face_impression as any ?? null,
      } : null,

      eye: eyeRes.data ? {
        eye_type: eyeRes.data.eye_type,
        eye_color: eyeRes.data.eye_color ?? null,
      } : null,

      hair: hairRes.data ?? null,

      personal_color: (labels || colorRes.data?.photo_analysis) ? {
        season4: labels?.season4 ?? null,
        season12: labels?.season12 ?? null,
        season16: labels?.season16 ?? null,
        undertone: labels?.undertone ?? null,
        photo_analysis: colorRes.data?.photo_analysis ?? null,
      } : null,

      body: {
        height_cm: measurements?.stature ?? null,
        weight_kg: measurements?.weight ?? null,
        cfv: bodyRes.data?.cfv ?? null,
        display_labels: bodyRes.data?.display_labels ?? null,
      },
    };

    return NextResponse.json({ ok: true, phenotype: unified });
  } catch (error) {
    console.error("phenotype GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
