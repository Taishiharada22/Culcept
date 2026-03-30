// app/api/eye-profile/route.ts
// Eye Analysis — GET / POST (upsert)

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_EYE_TYPES = new Set([
  "armond", "kirenaga", "tsurime", "tareme", "marume", "yanagiba",
]);

const VALID_EYE_COLORS = new Set([
  "dark_brown", "brown", "light_brown", "hazel", "gray_brown", "amber",
]);

// ─── GET: 自分の eye_profile を取得 ───
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("eye_profile")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, eye_profile: data ?? null });
  } catch (error) {
    console.error("eye-profile GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── POST: upsert eye_profile ───
interface EyeProfileBody {
  eyeType: string;
  eyeColor?: string;
  isFlipped?: boolean;
  innerCorner?: { x: number; y: number } | null;
  outerCorner?: { x: number; y: number } | null;
  eyeWidth?: number | null;
  eyeHeight?: number | null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: EyeProfileBody = await req.json().catch(() => ({} as EyeProfileBody));

    if (!body.eyeType || !VALID_EYE_TYPES.has(body.eyeType)) {
      return NextResponse.json({ error: "invalid eye_type" }, { status: 400 });
    }

    if (body.eyeColor && !VALID_EYE_COLORS.has(body.eyeColor)) {
      return NextResponse.json({ error: "invalid eye_color" }, { status: 400 });
    }

    // 既存レコードの version を取得
    const { data: existing } = await supabase
      .from("eye_profile")
      .select("version")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const version = Number(existing?.version ?? 0) + 1;

    const eyeWidth = body.eyeWidth ?? null;
    const eyeHeight = body.eyeHeight ?? null;
    const hasLandmarks =
      !!body.innerCorner &&
      !!body.outerCorner &&
      eyeWidth !== null &&
      eyeHeight !== null;
    const confidence = hasLandmarks ? 0.88 : 0.56;

    const { error } = await supabase.from("eye_profile").upsert(
      {
        user_id: auth.user.id,
        eye_type: body.eyeType,
        eye_color: body.eyeColor ?? null,
        is_flipped: body.isFlipped ?? false,
        selection_method: "manual",
        confidence,
        inner_corner_x: body.innerCorner?.x ?? null,
        inner_corner_y: body.innerCorner?.y ?? null,
        outer_corner_x: body.outerCorner?.x ?? null,
        outer_corner_y: body.outerCorner?.y ?? null,
        eye_width_px: eyeWidth,
        eye_height_px: eyeHeight,
        aspect_ratio: eyeWidth && eyeHeight ? Math.round((eyeWidth / eyeHeight) * 1000) / 1000 : null,
        version,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, eye_type: body.eyeType, eye_color: body.eyeColor ?? null, version });
  } catch (error) {
    console.error("eye-profile POST error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
