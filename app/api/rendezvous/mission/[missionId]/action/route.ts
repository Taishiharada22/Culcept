import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// POST /api/rendezvous/mission/[missionId]/action
// ミッション内のターンアクション（1曲追加、1文追加、等）
// =============================================================================

export async function POST(
  req: Request,
  { params }: { params: Promise<{ missionId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { missionId } = await params;
    const userId = auth.user.id;
    const body = await req.json();
    const { content } = body as { content: string };

    if (!content?.trim()) {
      return NextResponse.json({ ok: false, error: "Empty content" }, { status: 400 });
    }

    // ミッション取得
    const { data: mission } = await supabaseAdmin
      .from("rendezvous_missions")
      .select("id, user_a, user_b, state, progress, payload")
      .eq("id", missionId)
      .single();

    if (!mission) {
      return NextResponse.json({ ok: false, error: "Mission not found" }, { status: 404 });
    }

    if (mission.user_a !== userId && mission.user_b !== userId) {
      return NextResponse.json({ ok: false, error: "Not a participant" }, { status: 403 });
    }

    if (mission.state !== "active") {
      return NextResponse.json({ ok: false, error: "Mission not active" }, { status: 400 });
    }

    const progress = mission.progress as { turns: { sender: string; content: string; at: string }[]; currentTurn: number };
    const payload = mission.payload as { turnsRequired?: number };
    const isA = mission.user_a === userId;

    // ターン順序チェック（交互制）
    const lastTurn = progress.turns[progress.turns.length - 1];
    if (lastTurn) {
      const lastSender = lastTurn.sender;
      const lastIsA = lastSender === "a";
      if ((isA && lastIsA) || (!isA && !lastIsA)) {
        return NextResponse.json({ ok: false, error: "Not your turn" }, { status: 400 });
      }
    }

    // ターン追加
    progress.turns.push({
      sender: isA ? "a" : "b",
      content: content.trim().slice(0, 500),
      at: new Date().toISOString(),
    });
    progress.currentTurn = progress.turns.length;

    // 完了チェック
    const turnsRequired = payload.turnsRequired ?? 8;
    const isComplete = progress.turns.length >= turnsRequired;

    const { error } = await supabaseAdmin
      .from("rendezvous_missions")
      .update({
        progress,
        state: isComplete ? "completed" : "active",
      })
      .eq("id", missionId);

    if (error) {
      return NextResponse.json({ ok: false, error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      turn: progress.currentTurn,
      isComplete,
      turns: progress.turns.map((t) => ({
        sender: t.sender === (isA ? "a" : "b") ? "me" : "partner",
        content: t.content,
        at: t.at,
      })),
    });
  } catch (err) {
    console.error("[mission/action] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
