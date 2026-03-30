import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { selectMissionForCategory, MISSION_TEMPLATES } from "@/lib/rendezvous/missionTemplates";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

// =============================================================================
// POST /api/rendezvous/mission/join
// ミッションに参加（待機中の相手がいればペアリング、いなければキュー）
// =============================================================================

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { category, missionType } = body as {
      category: RendezvousCategory;
      missionType?: string;
    };

    if (!category) {
      return NextResponse.json({ ok: false, error: "Missing category" }, { status: 400 });
    }

    const userId = auth.user.id;

    // テンプレート選択
    const template = missionType
      ? MISSION_TEMPLATES.find((t) => t.type === missionType) ?? selectMissionForCategory(category)
      : selectMissionForCategory(category);

    // 待機中のミッションを検索（同カテゴリ・同タイプ）
    const { data: waiting } = await supabaseAdmin
      .from("rendezvous_missions")
      .select("id, user_a")
      .eq("state", "waiting")
      .eq("category", category)
      .eq("mission_type", template.type)
      .neq("user_a", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (waiting) {
      // ペアリング成立
      const now = new Date();
      const expiresAt = new Date(now.getTime() + template.timeoutMinutes * 60 * 1000);

      const { data: updated, error } = await supabaseAdmin
        .from("rendezvous_missions")
        .update({
          user_b: userId,
          state: "active",
          starts_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq("id", waiting.id)
        .eq("state", "waiting")
        .select("id")
        .single();

      if (error || !updated) {
        // 競合 → 新規作成にフォールバック
      } else {
        return NextResponse.json({
          ok: true,
          status: "matched",
          missionId: updated.id,
        });
      }
    }

    // 待機者なし → 新規キュー作成
    const { data: created, error } = await supabaseAdmin
      .from("rendezvous_missions")
      .insert({
        mission_type: template.type,
        category,
        user_a: userId,
        state: "waiting",
        payload: {
          title: template.title,
          description: template.description,
          rules: template.rules,
          icon: template.icon,
          turnsRequired: template.turnsRequired,
        },
        progress: { turns: [], currentTurn: 0 },
      })
      .select("id")
      .single();

    if (error || !created) {
      return NextResponse.json({ ok: false, error: "Failed to join" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      status: "waiting",
      missionId: created.id,
    });
  } catch (err) {
    console.error("[mission/join] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
