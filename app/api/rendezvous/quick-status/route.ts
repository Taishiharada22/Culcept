import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// GET /api/rendezvous/quick-status
//
// Home 画面用の軽量ステータス。3カテゴリの未読/新着を返す。
// テーブルが存在しない・クエリ失敗時は null（fail-open）。
// =============================================================================

export type QuickStatusResponse = {
  romance: { hasNew: boolean; count: number; label: string } | null;
  counselor: { hasNew: boolean; label: string } | null;
  connection: { hasNew: boolean; count: number; label: string } | null;
};

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const userId = auth.user.id;

    // ── 並列クエリ: 恋愛 / カウンセラー / つながり ──
    const [romanceResult, counselorResult, connectionResult] = await Promise.all([
      // 恋愛: category='romantic' で未閲覧の候補数
      safeQuery(async () => {
        const { data: candidates } = await supabaseAdmin
          .from("rendezvous_candidates")
          .select("id", { count: "exact", head: true })
          .eq("category", "romantic")
          .not("state", "in", "(expired,dismissed)")
          .not("delivered_at", "is", null)
          .or(`user_a.eq.${userId},user_b.eq.${userId}`);

        // unseen 状態のものだけカウント
        const { count } = await supabaseAdmin
          .from("rendezvous_user_states")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("state", "unseen")
          .in(
            "candidate_id",
            // サブクエリ代替: romantic カテゴリの candidate_id を取得
            await getRomanticCandidateIds(userId),
          );

        const n = count ?? 0;
        if (n === 0) return null;
        return { hasNew: true, count: n, label: `新しい候補 ${n}人` };
      }),

      // カウンセラー: 未読のシグナル or 推薦がある
      safeQuery(async () => {
        // partner カテゴリのアクティブ候補があるか
        const { data: partnerCandidates } = await supabaseAdmin
          .from("rendezvous_candidates")
          .select("id")
          .eq("category", "partner")
          .not("state", "in", "(expired,dismissed)")
          .or(`user_a.eq.${userId},user_b.eq.${userId}`)
          .limit(1);

        if (!partnerCandidates || partnerCandidates.length === 0) return null;

        // 直近24時間の未読 orbiter_signals（安全アラートや推薦）
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin
          .from("orbiter_signals")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", oneDayAgo);

        if ((count ?? 0) > 0) {
          return { hasNew: true, label: "推薦あり" };
        }

        // アクティブなパートナー候補がある → "進行中" を表示
        return { hasNew: false, label: "進行中" };
      }),

      // つながり: friendship/cocreation/community で mutual_liked 状態
      safeQuery(async () => {
        const { count } = await supabaseAdmin
          .from("rendezvous_candidates")
          .select("*", { count: "exact", head: true })
          .in("category", ["friendship", "cocreation", "community"])
          .eq("state", "mutual_liked")
          .or(`user_a.eq.${userId},user_b.eq.${userId}`);

        const n = count ?? 0;
        if (n === 0) {
          // unseen もチェック
          const { count: unseenCount } = await supabaseAdmin
            .from("rendezvous_candidates")
            .select("*", { count: "exact", head: true })
            .in("category", ["friendship", "cocreation", "community"])
            .not("state", "in", "(expired,dismissed)")
            .not("delivered_at", "is", null)
            .or(`user_a.eq.${userId},user_b.eq.${userId}`);

          // unseen user_states
          if ((unseenCount ?? 0) > 0) {
            const ids = await getNonRomanticCandidateIds(userId);
            const { count: usc } = await supabaseAdmin
              .from("rendezvous_user_states")
              .select("*", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("state", "unseen")
              .in("candidate_id", ids);
            const un = usc ?? 0;
            if (un > 0) {
              return { hasNew: true, count: un, label: `新着 ${un}人` };
            }
          }
          return null;
        }
        return { hasNew: true, count: n, label: `${n}人がマッチ` };
      }),
    ]);

    const response: QuickStatusResponse = {
      romance: romanceResult,
      counselor: counselorResult,
      connection: connectionResult,
    };

    // 全て null なら空レスポンス
    const hasAny = romanceResult || counselorResult || connectionResult;
    return NextResponse.json({ ok: true, ...response, _empty: !hasAny });
  } catch (e: any) {
    console.error("[quick-status] error:", e);
    return NextResponse.json({ ok: true, romance: null, counselor: null, connection: null, _empty: true });
  }
}

// ── ヘルパー ──

async function safeQuery<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.warn("[quick-status] query failed (fail-open):", e);
    return null;
  }
}

async function getRomanticCandidateIds(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("rendezvous_candidates")
    .select("id")
    .eq("category", "romantic")
    .not("state", "in", "(expired,dismissed)")
    .not("delivered_at", "is", null)
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .limit(100);
  return (data ?? []).map((r: any) => r.id);
}

async function getNonRomanticCandidateIds(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("rendezvous_candidates")
    .select("id")
    .in("category", ["friendship", "cocreation", "community"])
    .not("state", "in", "(expired,dismissed)")
    .not("delivered_at", "is", null)
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .limit(100);
  return (data ?? []).map((r: any) => r.id);
}
