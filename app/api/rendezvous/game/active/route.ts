import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// GET /api/rendezvous/game/active
// 現在アクティブなゲームセッション一覧
// =============================================================================

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: games } = await supabaseAdmin
      .from("rendezvous_game_sessions")
      .select("id, game_type, state, payload, max_players, started_at, created_at")
      .in("state", ["lobby", "active"])
      .order("created_at", { ascending: false })
      .limit(5);

    // 各ゲームの参加者数
    const enriched = await Promise.all(
      (games ?? []).map(async (g) => {
        const { count } = await supabaseAdmin
          .from("rendezvous_game_participants")
          .select("id", { count: "exact", head: true })
          .eq("game_id", g.id);

        return {
          id: g.id,
          type: g.game_type,
          state: g.state,
          title: (g.payload as Record<string, unknown>)?.title ?? g.game_type,
          icon: (g.payload as Record<string, unknown>)?.icon ?? "🧠",
          playerCount: count ?? 0,
          maxPlayers: g.max_players,
          startedAt: g.started_at,
        };
      }),
    );

    return NextResponse.json({ ok: true, games: enriched });
  } catch (err) {
    console.error("[game/active] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
