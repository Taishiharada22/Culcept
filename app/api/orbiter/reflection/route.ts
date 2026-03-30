import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ReflectionType } from "@/lib/orbiter/types";

const VALID_REFLECTION_TYPES: ReflectionType[] = [
  "pre_meeting",
  "post_meeting",
  "chat_phase",
];

/**
 * GET /api/orbiter/reflection?candidateId=xxx
 * ユーザーのリフレクション履歴を取得。
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const candidateId = request.nextUrl.searchParams.get("candidateId");

    const query = supabaseAdmin
      .from("orbiter_reflections")
      .select("id, candidate_id, reflection_type, answers, created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (candidateId) {
      query.eq("candidate_id", candidateId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, reflections: data ?? [] });
  } catch (err: any) {
    console.error("[orbiter/reflection] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/orbiter/reflection
 * リフレクションを保存。
 * body: { candidateId, reflectionType, answers }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const body = await request.json();
    const { candidateId, reflectionType, answers } = body;

    if (!candidateId || !reflectionType || !answers) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (!VALID_REFLECTION_TYPES.includes(reflectionType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid reflection type" },
        { status: 400 },
      );
    }

    // Insert reflection
    const { data, error } = await supabaseAdmin
      .from("orbiter_reflections")
      .insert({
        user_id: auth.user.id,
        candidate_id: candidateId,
        reflection_type: reflectionType,
        answers,
      })
      .select("id")
      .single();

    if (error) throw error;

    // Also record as signal (fire-and-forget)
    await supabaseAdmin
      .from("orbiter_signals")
      .insert({
        user_id: auth.user.id,
        candidate_id: candidateId,
        signal_type: "reflection_submitted",
        payload: { reflectionType, reflectionId: data.id },
      });

    return NextResponse.json({ ok: true, reflectionId: data.id });
  } catch (err: any) {
    console.error("[orbiter/reflection] POST error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
