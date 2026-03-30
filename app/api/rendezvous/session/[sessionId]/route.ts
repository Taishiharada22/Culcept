import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// GET /api/rendezvous/session/[sessionId]
// セッション状態を取得
// =============================================================================

export async function GET(
  _req: Request,
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

    const { data: session } = await supabaseAdmin
      .from("rendezvous_sessions")
      .select("id, user_a, user_b, category, mode, state, started_at, ends_at, decision_a, decision_b, mutual_result")
      .eq("id", sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    }

    // 参加者のみアクセス可
    if (session.user_a !== userId && session.user_b !== userId) {
      return NextResponse.json({ ok: false, error: "Not a participant" }, { status: 403 });
    }

    const isA = session.user_a === userId;
    const myDecision = isA ? session.decision_a : session.decision_b;
    const partnerDecision = isA ? session.decision_b : session.decision_a;

    // 残り時間
    let remainingMs = 0;
    if (session.ends_at) {
      remainingMs = Math.max(0, new Date(session.ends_at).getTime() - Date.now());
    }

    // メッセージ取得
    const { data: messages } = await supabaseAdmin
      .from("rendezvous_session_messages")
      .select("id, sender_id, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    // sender_idを匿名化（"me" or "partner"）
    const anonymized = (messages ?? []).map((m) => ({
      id: m.id,
      sender: m.sender_id === userId ? "me" : "partner",
      content: m.content,
      createdAt: m.created_at,
    }));

    return NextResponse.json({
      ok: true,
      session: {
        id: session.id,
        category: session.category,
        mode: session.mode,
        state: session.state,
        startedAt: session.started_at,
        endsAt: session.ends_at,
        remainingMs,
        myDecision,
        partnerDecided: !!partnerDecision,
        mutualResult: session.mutual_result,
      },
      messages: anonymized,
    });
  } catch (err) {
    console.error("[session/get] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
