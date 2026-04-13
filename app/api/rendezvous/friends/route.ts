import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 友達リスト API — つながりページ用
 *
 * 招待関係にあるユーザー一覧を返す。
 * 各ユーザーの Stargazer 進捗と相性分析状態を含む。
 *
 * 導線: つながりページ → 友達リスト → 相性カード → 詳細 → トークへ
 * カード交換は /talk で行う（CEO方針）
 */

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;

    // 招待した相手 + 招待された相手 の両方を取得
    const { data: invitations } = await supabaseAdmin
      .from("rendezvous_invitations")
      .select("inviter_user_id, invitee_user_id")
      .or(`inviter_user_id.eq.${userId},invitee_user_id.eq.${userId}`)
      .not("invitee_user_id", "is", null);

    if (!invitations || invitations.length === 0) {
      return NextResponse.json({ ok: true, friends: [] });
    }

    // 友達の userId リスト
    const friendIds = invitations
      .map((inv) =>
        inv.inviter_user_id === userId ? inv.invitee_user_id : inv.inviter_user_id,
      )
      .filter((id): id is string => id != null);

    const uniqueFriendIds = [...new Set(friendIds)];

    if (uniqueFriendIds.length === 0) {
      return NextResponse.json({ ok: true, friends: [] });
    }

    // プロフィール + Stargazer 進捗 + 相性分析を並列取得
    const [profilesRes, snapshotsRes, candidatesRes] = await Promise.all([
      // 表示名・アバター
      supabaseAdmin
        .from("rendezvous_profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", uniqueFriendIds),

      // Stargazer の観測数（axis_snapshots のレコード数で概算）
      supabaseAdmin
        .from("stargazer_axis_snapshots")
        .select("user_id")
        .in("user_id", uniqueFriendIds),

      // 相性分析済みの candidate を取得
      supabaseAdmin
        .from("rendezvous_candidates")
        .select("user_a, user_b, score_a_to_b, score_b_to_a, label, state, updated_at")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .in("state", ["candidate_generated", "delivered", "mutual_liked", "chat_opened"]),
    ]);

    const profiles = profilesRes.data ?? [];
    const snapshots = snapshotsRes.data ?? [];
    const candidates = candidatesRes.data ?? [];

    // Stargazer 進捗をカウント（ユーザーごとの snapshot 数 → 100問中の進捗）
    const progressMap = new Map<string, number>();
    for (const s of snapshots) {
      progressMap.set(s.user_id, (progressMap.get(s.user_id) ?? 0) + 1);
    }

    // 相性分析マップ
    const compatMap = new Map<string, {
      score: number;
      label: string | null;
      isNew: boolean;
    }>();
    for (const c of candidates) {
      const friendId = c.user_a === userId ? c.user_b : c.user_a;
      if (!uniqueFriendIds.includes(friendId)) continue;
      const score = c.user_a === userId
        ? ((c.score_a_to_b ?? 0) + (c.score_b_to_a ?? 0)) / 2
        : ((c.score_b_to_a ?? 0) + (c.score_a_to_b ?? 0)) / 2;
      const updatedAt = new Date(c.updated_at ?? 0);
      const isNew = Date.now() - updatedAt.getTime() < 7 * 24 * 60 * 60 * 1000; // 7日以内
      compatMap.set(friendId, { score, label: c.label, isNew });
    }

    const friends = uniqueFriendIds.map((fid) => {
      const profile = profiles.find((p) => p.user_id === fid);
      const progress = Math.min(100, progressMap.get(fid) ?? 0);
      const compat = compatMap.get(fid);
      const compatibilityReady = progress >= 50 && compat != null;

      return {
        userId: fid,
        displayName: profile?.display_name ?? "ユーザー",
        avatarUrl: profile?.avatar_url ?? null,
        stargazerProgress: progress,
        compatibilityReady,
        isNew: compat?.isNew ?? false,
        compatibilityLabel: compat?.label ?? null,
        syncPercent: compat ? Math.round(compat.score * 100) : null,
      };
    });

    // 相性分析 ready を先に、その中で NEW を先に表示
    friends.sort((a, b) => {
      if (a.compatibilityReady && !b.compatibilityReady) return -1;
      if (!a.compatibilityReady && b.compatibilityReady) return 1;
      if (a.isNew && !b.isNew) return -1;
      if (!a.isNew && b.isNew) return 1;
      return 0;
    });

    return NextResponse.json({ ok: true, friends });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[friends] GET error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
