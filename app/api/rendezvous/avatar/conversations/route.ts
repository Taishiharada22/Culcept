import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

/**
 * GET /api/rendezvous/avatar/conversations
 * ユーザーのアバター会話一覧を取得（ページネーション・カテゴリフィルタ対応）
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;
    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);
    const category = url.searchParams.get("category") as RendezvousCategory | null;

    // Get candidate IDs where user is involved
    const { data: candidates, error: candErr } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, category")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`);

    if (candErr)
      return NextResponse.json({ ok: false, error: candErr.message }, { status: 500 });

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ ok: true, conversations: [], total: 0 });
    }

    const candidateIds = candidates.map((c: { id: string }) => c.id);
    const candidateMap = new Map(
      candidates.map((c: { id: string; user_a: string; user_b: string; category: string }) => [c.id, c]),
    );

    // Fetch conversations
    let query = supabaseAdmin
      .from("avatar_conversations")
      .select("*", { count: "exact" })
      .in("candidate_id", candidateIds)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) {
      query = query.eq("category", category);
    }

    const { data: conversations, error: convErr, count } = await query;

    if (convErr)
      return NextResponse.json({ ok: false, error: convErr.message }, { status: 500 });

    // Enrich with counterpart profile data
    const counterpartIds = new Set<string>();
    for (const conv of conversations ?? []) {
      const cand = candidateMap.get(conv.candidate_id);
      if (cand) {
        const counterpartId = cand.user_a === userId ? cand.user_b : cand.user_a;
        counterpartIds.add(counterpartId);
      }
    }

    const { data: profiles } = counterpartIds.size > 0
      ? await supabaseAdmin
          .from("rendezvous_profiles")
          .select("user_id, display_name, avatar_asset_url")
          .in("user_id", Array.from(counterpartIds))
      : { data: [] };

    const profileMap = new Map(
      (profiles ?? []).map((p: { user_id: string; display_name: string | null; avatar_asset_url: string | null }) => [p.user_id, p]),
    );

    const enriched = (conversations ?? []).map((conv: any) => {
      const cand = candidateMap.get(conv.candidate_id);
      const counterpartId = cand
        ? cand.user_a === userId
          ? cand.user_b
          : cand.user_a
        : null;
      const profile = counterpartId ? profileMap.get(counterpartId) : null;

      return {
        id: conv.id,
        candidateId: conv.candidate_id,
        highlight: conv.highlight,
        summary: conv.summary,
        status: conv.status,
        category: conv.category,
        messageCount: Array.isArray(conv.messages) ? conv.messages.length : 0,
        startedAt: conv.started_at,
        completedAt: conv.completed_at,
        counterpart: profile
          ? {
              displayName: profile.display_name,
              avatarUrl: profile.avatar_asset_url,
            }
          : null,
      };
    });

    return NextResponse.json({
      ok: true,
      conversations: enriched,
      total: count ?? 0,
    });
  } catch (err: any) {
    console.error("[avatar/conversations] error:", err);
    return NextResponse.json({ ok: false, error: err.message ?? "Internal error" }, { status: 500 });
  }
}
