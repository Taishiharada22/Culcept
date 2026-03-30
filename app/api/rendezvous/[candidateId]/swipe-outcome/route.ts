import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { computePersonalizedWeights, type SwipeOutcome } from "@/lib/rendezvous/weightLearning";
import { getCategoryWeights } from "@/lib/rendezvous/categoryWeights";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

/**
 * POST /api/rendezvous/[candidateId]/swipe-outcome
 * スワイプ結果をサーバーサイドに記録（ウェイト学習用）
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { candidateId } = await params;
    const body = await request.json();
    const {
      direction,
      viewingDurationMs,
      scrollDepth,
      category,
      scoreAtSwipe,
      dimensionsAtSwipe,
    } = body;

    if (!direction || !["like", "pass", "save", "mute"].includes(direction)) {
      return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
    }

    // 候補の所有権確認
    const { data: candidate } = await supabase
      .from("rendezvous_candidates")
      .select("id, user_a, user_b")
      .eq("id", candidateId)
      .single();

    if (!candidate || (candidate.user_a !== user.id && candidate.user_b !== user.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // スワイプ結果を記録
    const { error } = await supabase.from("rendezvous_swipe_outcomes").insert({
      user_id: user.id,
      candidate_id: candidateId,
      direction,
      viewing_duration_ms: viewingDurationMs ?? null,
      scroll_depth: scrollDepth ?? null,
      category: category ?? "romantic",
      score_at_swipe: scoreAtSwipe ?? null,
      dimensions_at_swipe: dimensionsAtSwipe ?? null,
    });

    if (error) {
      console.error("[swipe-outcome] Insert error:", error);
      return NextResponse.json({ error: "Failed to record" }, { status: 500 });
    }

    // ── 適応ウェイト学習（一定数蓄積時にバッチ計算、fire-and-forget） ──
    if (dimensionsAtSwipe) {
      supabase
        .from("rendezvous_swipe_outcomes")
        .select("direction, dimensions_at_swipe, category")
        .eq("user_id", user.id)
        .eq("category", category ?? "romantic")
        .not("dimensions_at_swipe", "is", null)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data: outcomes }) => {
          if (!outcomes || outcomes.length < 20) return; // データ不足
          const mapped: SwipeOutcome[] = outcomes.map((o) => ({
            direction: o.direction as "like" | "pass",
            category: (o.category ?? "romantic") as RendezvousCategory,
            dimensionsAtSwipe: o.dimensions_at_swipe as Record<string, number>,
            createdAt: new Date().toISOString(),
          }));
          const cat = (category ?? "romantic") as RendezvousCategory;
          const baseWeights = getCategoryWeights(cat);
          const personalized = computePersonalizedWeights(baseWeights, mapped);
          if (personalized) {
            // パーソナライズウェイトを保存（fire-and-forget）
            void supabase
              .from("rendezvous_personalized_weights")
              .upsert({
                user_id: user.id,
                category: cat,
                weights: personalized,
                updated_at: new Date().toISOString(),
              }, { onConflict: "user_id,category" });
          }
        });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[swipe-outcome] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
