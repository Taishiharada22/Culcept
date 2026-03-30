import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// POST /api/rendezvous/game/[gameId]/answer
// ゲームの質問に回答
// =============================================================================

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { gameId } = await params;
    const body = await req.json();
    const { questionIndex, answer } = body as { questionIndex: number; answer: string };

    if (questionIndex === undefined || !answer) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    // 参加者の回答を更新
    const { data: participant } = await supabaseAdmin
      .from("rendezvous_game_participants")
      .select("id, answers")
      .eq("game_id", gameId)
      .eq("user_id", auth.user.id)
      .single();

    if (!participant) {
      return NextResponse.json({ ok: false, error: "Not a participant" }, { status: 403 });
    }

    const answers = (participant.answers as { questionIndex: number; answer: string; at: string }[]) ?? [];
    answers.push({
      questionIndex,
      answer,
      at: new Date().toISOString(),
    });

    await supabaseAdmin
      .from("rendezvous_game_participants")
      .update({ answers })
      .eq("id", participant.id);

    return NextResponse.json({ ok: true, answeredCount: answers.length });
  } catch (err) {
    console.error("[game/answer] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
