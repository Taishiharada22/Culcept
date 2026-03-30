// GET /api/talk/threads — スレッド一覧（最終メッセージ + 未読数）
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 自分が参加しているスレッドを取得
    const { data: threads, error } = await supabase
      .from("talk_threads")
      .select(`
        id,
        connection_id,
        last_message_at,
        genome_connections!inner (
          requester_id,
          target_id,
          status
        )
      `)
      .or(
        `genome_connections.requester_id.eq.${user.id},genome_connections.target_id.eq.${user.id}`
      )
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) {
      // フォールバック: 直接クエリ
      const { data: conns } = await supabase
        .from("genome_connections")
        .select("id, requester_id, target_id, status")
        .or(`requester_id.eq.${user.id},target_id.eq.${user.id}`)
        .eq("status", "accepted");

      if (!conns || conns.length === 0) {
        return NextResponse.json({ ok: true, threads: [] });
      }

      const connIds = conns.map((c) => c.id);
      const { data: rawThreads } = await supabase
        .from("talk_threads")
        .select("id, connection_id, last_message_at")
        .in("connection_id", connIds)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      return await buildThreadResponse(supabase, user.id, rawThreads ?? [], conns);
    }

    // 接続情報から相手のIDを解決
    const connData = (threads ?? []).map((t) => {
      const conn = t.genome_connections as unknown as { requester_id: string; target_id: string; status: string };
      return {
        threadId: t.id,
        connectionId: t.connection_id,
        lastMessageAt: t.last_message_at,
        counterpartId: conn.requester_id === user.id ? conn.target_id : conn.requester_id,
      };
    });

    // 相手のプロフィール取得
    const counterpartIds = [...new Set(connData.map((c) => c.counterpartId))];
    const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
    if (counterpartIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", counterpartIds);
      for (const p of profiles ?? []) {
        profileMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      }
    }

    // 各スレッドの最終メッセージと未読数を取得
    const threadIds = connData.map((c) => c.threadId);
    const [lastMsgRes, cursorRes] = await Promise.all([
      threadIds.length > 0
        ? Promise.resolve(supabase.rpc("get_last_messages_by_threads", { thread_ids: threadIds })).catch(() => ({ data: null }))
        : { data: null },
      supabase
        .from("talk_read_cursors")
        .select("thread_id, last_read_at")
        .eq("user_id", user.id)
        .in("thread_id", threadIds),
    ]);

    // 最終メッセージをスレッドごとに取得（RPCが無い場合のフォールバック）
    const lastMessages: Record<string, { body: string; sender_id: string; created_at: string }> = {};
    if (!lastMsgRes.data && threadIds.length > 0) {
      for (const tid of threadIds) {
        const { data: msgs } = await supabase
          .from("talk_messages")
          .select("body, sender_id, created_at")
          .eq("thread_id", tid)
          .order("created_at", { ascending: false })
          .limit(1);
        if (msgs && msgs.length > 0) {
          lastMessages[tid] = msgs[0];
        }
      }
    }

    // 既読カーソル
    const cursorMap: Record<string, string> = {};
    for (const c of cursorRes.data ?? []) {
      cursorMap[c.thread_id] = c.last_read_at;
    }

    // 未読数を1クエリでバッチ計算（N+1回避）
    const allThreadIds = connData.map((c) => c.threadId);
    const oldestCursor = Object.values(cursorMap).reduce<string | null>(
      (oldest, v) => (!oldest || v < oldest ? v : oldest), null
    );
    let unreadMap: Record<string, number> = {};
    if (allThreadIds.length > 0) {
      let unreadQuery = supabase
        .from("talk_messages")
        .select("thread_id, created_at")
        .in("thread_id", allThreadIds)
        .neq("sender_id", user.id);
      if (oldestCursor) unreadQuery = unreadQuery.gt("created_at", oldestCursor);
      const { data: unreadMsgs } = await unreadQuery;
      for (const msg of unreadMsgs ?? []) {
        const cursor = cursorMap[msg.thread_id];
        if (!cursor || msg.created_at > cursor) {
          unreadMap[msg.thread_id] = (unreadMap[msg.thread_id] ?? 0) + 1;
        }
      }
    }

    const result = connData.map((c) => {
      const msg = lastMessages[c.threadId];
      const profile = profileMap[c.counterpartId];
      return {
        threadId: c.threadId,
        connectionId: c.connectionId,
        counterpart: {
          userId: c.counterpartId,
          displayName: profile?.display_name ?? null,
          avatarUrl: profile?.avatar_url ?? null,
        },
        lastMessage: msg ? {
          body: msg.body,
          senderId: msg.sender_id,
          createdAt: msg.created_at,
        } : null,
        unreadCount: unreadMap[c.threadId] ?? 0,
      };
    });

    return NextResponse.json({ ok: true, threads: result });
  } catch (error) {
    console.error("talk/threads error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// フォールバック用のレスポンスビルダー
async function buildThreadResponse(
  supabase: ReturnType<typeof supabaseServer> extends Promise<infer T> ? T : never,
  userId: string,
  threads: Array<{ id: string; connection_id: string; last_message_at: string | null }>,
  conns: Array<{ id: string; requester_id: string; target_id: string; status: string }>,
) {
  const connMap = new Map(conns.map((c) => [c.id, c]));
  const counterpartIds = threads.map((t) => {
    const c = connMap.get(t.connection_id)!;
    return c.requester_id === userId ? c.target_id : c.requester_id;
  });
  const uniqueIds = [...new Set(counterpartIds)];

  const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
  if (uniqueIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", uniqueIds);
    for (const p of profiles ?? []) {
      profileMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
    }
  }

  const result = threads.map((t, i) => {
    const cId = counterpartIds[i];
    const profile = profileMap[cId];
    return {
      threadId: t.id,
      connectionId: t.connection_id,
      counterpart: {
        userId: cId,
        displayName: profile?.display_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
      lastMessage: null,
      unreadCount: 0,
    };
  });

  return NextResponse.json({ ok: true, threads: result });
}
