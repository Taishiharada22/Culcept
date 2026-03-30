import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MISSION_TEMPLATES } from "@/lib/rendezvous/missionTemplates";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

// =============================================================================
// GET /api/rendezvous/mission/available?category=friendship
// 利用可能なミッション一覧
// =============================================================================

export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const category = (url.searchParams.get("category") ?? "friendship") as RendezvousCategory;

    // カテゴリに適したテンプレート
    const templates = MISSION_TEMPLATES.filter((m) => m.categories.includes(category));

    // ユーザーのアクティブミッション
    const { data: activeMissions } = await supabaseAdmin
      .from("rendezvous_missions")
      .select("id, mission_type, state, category")
      .or(`user_a.eq.${auth.user.id},user_b.eq.${auth.user.id}`)
      .in("state", ["waiting", "active"])
      .limit(5);

    return NextResponse.json({
      ok: true,
      templates: templates.map((t) => ({
        type: t.type,
        title: t.title,
        description: t.description,
        icon: t.icon,
        turnsRequired: t.turnsRequired,
      })),
      activeMissions: (activeMissions ?? []).map((m) => ({
        id: m.id,
        type: m.mission_type,
        state: m.state,
        category: m.category,
      })),
    });
  } catch (err) {
    console.error("[mission/available] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
