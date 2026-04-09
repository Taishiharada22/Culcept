import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  evaluateRelationshipState,
  recommendAction,
  selectGameForRecommendation,
} from "@/lib/rendezvous/counselor/orchestrator";
import type { CoupleGame } from "@/lib/rendezvous/coupleGames";

// ============================================================
// Counselor Recommendation API
//
// アクティブな Partner 接続すべてを評価し、
// Counselor が推薦するアクションを返す。
// suggest_game の場合は具体的なゲーム情報も付与する。
// ============================================================

export type RecommendationResponse = {
  recommendations: Array<{
    candidateId: string;
    counterpartUserId: string;
    type: string;
    reason: string;
    priority: string;
    game: CoupleGame | null;
  }>;
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

    // アクティブな Partner 接続を取得
    const { data: candidates } = await supabase
      .from("rendezvous_candidates")
      .select("id, user_a, user_b")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .eq("category", "partner")
      .in("state", ["chat_opened", "mutual_liked", "active"]);

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ recommendations: [] });
    }

    // 各接続を評価（並列）
    const results = await Promise.allSettled(
      candidates.map(async (c) => {
        const counterpartId = c.user_a === userId ? c.user_b : c.user_a;
        const state = await evaluateRelationshipState({
          candidateId: c.id,
          userId,
          counterpartId,
        });
        const rec = recommendAction(state);
        const game = selectGameForRecommendation(rec);

        return {
          candidateId: c.id,
          counterpartUserId: counterpartId,
          type: rec.type,
          reason: rec.reason,
          priority: rec.priority,
          game,
        };
      }),
    );

    const recommendations = results
      .filter(
        (r): r is PromiseFulfilledResult<RecommendationResponse["recommendations"][0]> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value)
      // no_action は除外、priority でソート
      .filter((r) => r.type !== "no_action")
      .sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority as keyof typeof order] ?? 4) -
          (order[b.priority as keyof typeof order] ?? 4);
      });

    return NextResponse.json({ recommendations });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/recommendation] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
