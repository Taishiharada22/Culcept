import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// POST /api/rendezvous/session/[sessionId]/message
// 匿名メッセージ送信
// =============================================================================

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;
    const userId = auth.user.id;
    const body = await req.json();
    const { content } = body as { content: string };

    if (!content?.trim()) {
      return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });
    }

    // セッション存在 + 参加者確認 + アクティブ確認
    const { data: session } = await supabaseAdmin
      .from("rendezvous_sessions")
      .select("id, user_a, user_b, state, ends_at")
      .eq("id", sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    }

    if (session.user_a !== userId && session.user_b !== userId) {
      return NextResponse.json({ ok: false, error: "Not a participant" }, { status: 403 });
    }

    // セッション終了チェック
    if (session.state === "ended") {
      return NextResponse.json({ ok: false, error: "Session ended" }, { status: 400 });
    }

    if (session.ends_at && new Date(session.ends_at).getTime() < Date.now()) {
      // 時間切れ → 状態更新
      await supabaseAdmin
        .from("rendezvous_sessions")
        .update({ state: "ended" })
        .eq("id", sessionId);
      return NextResponse.json({ ok: false, error: "Session time expired" }, { status: 400 });
    }

    // メッセージ挿入
    const { data: msg, error } = await supabaseAdmin
      .from("rendezvous_session_messages")
      .insert({
        session_id: sessionId,
        sender_id: userId,
        content: content.trim().slice(0, 1000),
      })
      .select("id, created_at")
      .single();

    if (error) {
      console.error("[session/message] Insert error:", error);
      return NextResponse.json({ ok: false, error: "Failed to send" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: {
        id: msg.id,
        sender: "me",
        content: content.trim().slice(0, 1000),
        createdAt: msg.created_at,
      },
    });
  } catch (err) {
    console.error("[session/message] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
