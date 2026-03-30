import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/orbiter/signal
 * クライアント側ビーコン受信用エンドポイント
 * navigator.sendBeacon から送信される detail_view_end 等を記録
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { candidateId, signalType, payload } = body;

    if (!candidateId || !signalType) {
      return NextResponse.json(
        { ok: false, error: "Missing candidateId or signalType" },
        { status: 400 },
      );
    }

    // Validate signal type
    const allowedTypes = [
      "detail_view",
      "detail_view_end",
      "like",
      "pass",
      "revisit",
      "chat_message_sent",
      "reflection_submitted",
    ];
    if (!allowedTypes.includes(signalType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid signal type" },
        { status: 400 },
      );
    }

    await supabaseAdmin.from("orbiter_signals").insert({
      user_id: auth.user.id,
      candidate_id: candidateId,
      signal_type: signalType,
      payload: payload ?? {},
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[orbiter/signal] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
