import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { ActiveConnectionItem } from "@/lib/rendezvous/counselor/types";

// ============================================================
// アクティブなPartner接続一覧を返すAPI
//
// - Partner枠 (category = 'partner') のアクティブな接続を返す
// - プロフィール情報は最小限（アバター先行型の原則を守る）
// - 接続状態のラベルはCounselor視点で付与する
// ============================================================

export type { ActiveConnectionItem };

const STATE_LABELS: Record<string, string> = {
  chat_opened: "テキスト接続中",
  mutual_liked: "相互マッチ",
  active: "進行中",
  on_hold: "一時停止中",
};

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = user.id;

    const { data: candidates, error } = await supabase
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, state, created_at, updated_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .eq("category", "partner")
      .in("state", ["chat_opened", "mutual_liked", "active"]);

    if (error) {
      console.error("[active-connections] query error:", error);
      return NextResponse.json({ connections: [] });
    }

    const now = Date.now();
    const connections: ActiveConnectionItem[] = (candidates ?? []).map((c) => {
      const counterpartUserId = c.user_a === userId ? c.user_b : c.user_a;
      const lastActivityMs = new Date(c.updated_at ?? c.created_at).getTime();
      const daysSinceLastActivity = Math.floor(
        (now - lastActivityMs) / (1000 * 60 * 60 * 24),
      );

      return {
        candidateId: c.id,
        counterpartUserId,
        state: c.state,
        statusLabel: STATE_LABELS[c.state] ?? c.state,
        daysSinceLastActivity,
        startedAt: c.created_at,
      };
    });

    return NextResponse.json({ connections });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/active-connections] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
