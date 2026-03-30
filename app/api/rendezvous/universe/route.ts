import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/rendezvous/universe
 * 全接続（active + expired + dismissed）を取得
 * Connection Universe用
 * Returns: { ok: true, connections: ConnectionNode[] }
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // All candidates where user is involved
    const { data: candidates } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select(
        "id, user_a, user_b, category, overall_score, state, created_at, updated_at",
      )
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ ok: true, connections: [] });
    }

    // Collect counterpart user IDs
    const counterpartIds = candidates.map((c) =>
      c.user_a === user.id ? c.user_b : c.user_a,
    );

    // Fetch profiles
    const { data: profiles } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("user_id, display_name, avatar_asset_url")
      .in("user_id", counterpartIds);

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.user_id, p]),
    );

    // Fetch message counts per candidate
    let messageCounts: { candidate_id: string; count: number }[] | null = null;
    try {
      const res = await supabaseAdmin.rpc("rendezvous_message_counts", {
        candidate_ids: candidates.map((c) => c.id),
      });
      messageCounts = res.data;
    } catch {
      // RPC may not exist yet
    }

    const countMap = new Map<string, number>();
    if (messageCounts) {
      for (const mc of messageCounts) {
        countMap.set(mc.candidate_id, mc.count);
      }
    }

    // Determine "recently active" threshold: activity in last 3 days
    const recentThreshold = new Date();
    recentThreshold.setDate(recentThreshold.getDate() - 3);

    const connections = candidates.map((c) => {
      const counterpartId = c.user_a === user.id ? c.user_b : c.user_a;
      const profile = profileMap.get(counterpartId);
      const msgCount = countMap.get(c.id) ?? 0;
      const isActiveState =
        c.state === "mutual_liked" || c.state === "chat_opened";
      const hasRecentActivity =
        c.updated_at && new Date(c.updated_at) > recentThreshold;

      return {
        id: c.id,
        displayName: profile?.display_name ?? "Unknown",
        avatarUrl: profile?.avatar_asset_url ?? null,
        category: c.category,
        syncPercent: Math.round((c.overall_score ?? 0.5) * 100),
        state: c.state,
        messageCount: msgCount,
        isActive: isActiveState || (hasRecentActivity && msgCount > 0),
      };
    });

    return NextResponse.json({ ok: true, connections });
  } catch (err: any) {
    console.error("[universe] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
