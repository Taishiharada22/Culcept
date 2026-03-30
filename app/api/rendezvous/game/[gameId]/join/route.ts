import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// POST /api/rendezvous/game/[gameId]/join
// ゲームに参加
// =============================================================================

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { gameId } = await params;

    // ゲーム存在確認
    const { data: game } = await supabaseAdmin
      .from("rendezvous_game_sessions")
      .select("id, state, max_players")
      .eq("id", gameId)
      .single();

    if (!game) {
      return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });
    }

    if (!["lobby", "active"].includes(game.state)) {
      return NextResponse.json({ ok: false, error: "Game not joinable" }, { status: 400 });
    }

    // 参加者数確認
    const { count } = await supabaseAdmin
      .from("rendezvous_game_participants")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId);

    if ((count ?? 0) >= game.max_players) {
      return NextResponse.json({ ok: false, error: "Game is full" }, { status: 400 });
    }

    // 参加（重複は無視）
    await supabaseAdmin
      .from("rendezvous_game_participants")
      .upsert(
        { game_id: gameId, user_id: auth.user.id, answers: [] },
        { onConflict: "game_id,user_id", ignoreDuplicates: true },
      );

    return NextResponse.json({ ok: true, joined: true });
  } catch (err) {
    console.error("[game/join] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
