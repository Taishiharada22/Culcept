import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET  /api/rendezvous/verification — 自分の本人確認ステータスを取得
 * POST /api/rendezvous/verification — 本人確認写真の提出・更新
 */

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from("rendezvous_verification")
      .select("id, status, photo_atmosphere, photo_face, photo_best, photo_current, id_document, rejection_reason, created_at, updated_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) {
      console.error("[rendezvous/verification] GET error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      verification: data ?? null,
    });
  } catch (err: unknown) {
    console.error("[rendezvous/verification] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;
    const body = await request.json();

    const {
      photo_atmosphere,
      photo_face,
      photo_best,
      photo_current,
      id_document,
    } = body as {
      photo_atmosphere?: string;
      photo_face?: string;
      photo_best?: string;
      photo_current?: string;
      id_document?: string;
    };

    // Build upsert payload
    const upsertData: Record<string, unknown> = {
      user_id: userId,
      status: "pending",
      updated_at: new Date().toISOString(),
    };

    if (photo_atmosphere !== undefined) upsertData.photo_atmosphere = photo_atmosphere;
    if (photo_face !== undefined) upsertData.photo_face = photo_face;
    if (photo_best !== undefined) upsertData.photo_best = photo_best;
    if (photo_current !== undefined) upsertData.photo_current = photo_current;
    if (id_document !== undefined) upsertData.id_document = id_document;

    // Clear rejection reason on re-submit
    upsertData.rejection_reason = null;

    const { data, error } = await supabaseAdmin
      .from("rendezvous_verification")
      .upsert(upsertData, { onConflict: "user_id" })
      .select("id, status, photo_atmosphere, photo_face, photo_best, photo_current, id_document, created_at, updated_at")
      .single();

    if (error) {
      console.error("[rendezvous/verification] POST error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, verification: data });
  } catch (err: unknown) {
    console.error("[rendezvous/verification] POST error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
