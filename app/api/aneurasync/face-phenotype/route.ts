// app/api/aneurasync/face-phenotype/route.ts
// Face Phenotype — GET / POST (merge-upsert)

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { FacePhenotypeData } from "@/types/face-phenotype";
import { classifyAndSaveFaceType } from "@/lib/rendezvous/faceTypeClassifier";

export const runtime = "nodejs";

const VALID_FACE_SHAPES = new Set([
  "oval", "round", "oblong", "square", "heart", "inverted_triangle",
]);
const VALID_EYE_SHAPES = new Set([
  "armond", "kirenaga", "tsurime", "tareme", "marume", "yanagiba",
]);
const VALID_BROW_SHAPES = new Set([
  "straight", "soft_arch", "high_arch", "round", "flat", "ascending", "thick_natural",
]);

function clampAxis(v: unknown): number {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.round(Math.max(-1, Math.min(1, n)) * 10) / 10;
}

function deriveCompleted(p: FacePhenotypeData): string[] {
  const cats: string[] = [];
  if (p.face_shape?.primary) cats.push("face_shape");
  if (p.eye_shape?.primary) cats.push("eye_shape");
  if (p.brow_shape?.primary) cats.push("brow_shape");
  if (p.nose_impression) cats.push("nose");
  if (p.mouth_impression) cats.push("mouth");
  if (p.face_impression) cats.push("face_impression");
  return cats;
}

// ─── GET ───
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("face_phenotype")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, face_phenotype: data ?? null });
  } catch (error) {
    console.error("face-phenotype GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── POST: merge-upsert ───
interface PostBody {
  phenotype: Partial<FacePhenotypeData>;
  photo_url?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: PostBody = await req.json().catch(() => ({ phenotype: {} }));
    const incoming = body.phenotype ?? {};

    // Validate Group A selections
    if (incoming.face_shape?.primary && !VALID_FACE_SHAPES.has(incoming.face_shape.primary)) {
      return NextResponse.json({ error: "invalid face_shape" }, { status: 400 });
    }
    if (incoming.eye_shape?.primary && !VALID_EYE_SHAPES.has(incoming.eye_shape.primary)) {
      return NextResponse.json({ error: "invalid eye_shape" }, { status: 400 });
    }
    if (incoming.brow_shape?.primary && !VALID_BROW_SHAPES.has(incoming.brow_shape.primary)) {
      return NextResponse.json({ error: "invalid brow_shape" }, { status: 400 });
    }

    // Normalize Group B axes
    if (incoming.nose_impression) {
      incoming.nose_impression = {
        height: clampAxis(incoming.nose_impression.height),
        sharpness: clampAxis(incoming.nose_impression.sharpness),
        presence: clampAxis(incoming.nose_impression.presence),
      };
    }
    if (incoming.mouth_impression) {
      incoming.mouth_impression = {
        thickness: clampAxis(incoming.mouth_impression.thickness),
        corner: clampAxis(incoming.mouth_impression.corner),
        softness: clampAxis(incoming.mouth_impression.softness),
      };
    }
    if (incoming.face_impression) {
      incoming.face_impression = {
        warm_cool: clampAxis(incoming.face_impression.warm_cool),
        soft_sharp: clampAxis(incoming.face_impression.soft_sharp),
        mature_youthful: clampAxis(incoming.face_impression.mature_youthful),
        cute_cool: clampAxis(incoming.face_impression.cute_cool),
        friendly_mysterious: clampAxis(incoming.face_impression.friendly_mysterious),
      };
    }

    // Fetch existing for merge
    const { data: existing } = await supabase
      .from("face_phenotype")
      .select("phenotype, version")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const merged: FacePhenotypeData = {
      ...((existing?.phenotype as FacePhenotypeData) ?? {}),
      ...incoming,
    };

    const version = Number(existing?.version ?? 0) + 1;
    const completedCategories = deriveCompleted(merged);

    const { error } = await supabase.from("face_phenotype").upsert(
      {
        user_id: auth.user.id,
        phenotype: merged,
        photo_url: body.photo_url ?? existing?.phenotype?.photo_url ?? null,
        completed_categories: completedCategories,
        version,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 顔タイプ分類を同期実行（直後の GET で分類結果が取得できるよう await）
    try {
      await classifyAndSaveFaceType(auth.user.id);
    } catch (err) {
      console.warn("[face-phenotype] classifyAndSaveFaceType failed:", err);
    }

    return NextResponse.json({ ok: true, version, completed_categories: completedCategories });
  } catch (error) {
    console.error("face-phenotype POST error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
