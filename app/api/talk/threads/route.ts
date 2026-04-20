// GET /api/talk/threads — スレッド一覧（最終メッセージ + 未読数）
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** auth.users metadata から display_name を解決 */
async function resolveDisplayNames(userIds: string[]): Promise<Record<string, { displayName: string | null; avatarUrl: string | null }>> {
  const result: Record<string, { displayName: string | null; avatarUrl: string | null }> = {};
  const admin = getAdminClient();
  if (!admin || userIds.length === 0) return result;

  for (const uid of userIds) {
    try {
      const { data } = await admin.auth.admin.getUserById(uid);
      result[uid] = {
        displayName: (data?.user?.user_metadata?.display_name as string) ?? null,
        avatarUrl: (data?.user?.user_metadata?.avatar_url as string) ?? null,
      };
    } catch {
      result[uid] = { displayName: null, avatarUrl: null };
    }
  }
  return result;
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 自分が参加している accepted connections を取得
    const { data: conns } = await supabase
      .from("genome_connections")
      .select("id, requester_id, target_id, status")
      .or(`requester_id.eq.${user.id},target_id.eq.${user.id}`)
      .eq("status", "accepted");

    if (!conns || conns.length === 0) {
      return NextResponse.json({ ok: true, threads: [] });
    }

    const connIds = conns.map((c) => c.id);
    const admin = getAdminClient();

    // talk_threads を service role で取得（RLS バイパス）
    const { data: rawThreads } = admin
      ? await admin
          .from("talk_threads")
          .select("id, connection_id, last_message_at")
          .in("connection_id", connIds)
          .order("last_message_at", { ascending: false, nullsFirst: false })
      : await supabase
          .from("talk_threads")
          .select("id, connection_id, last_message_at")
          .in("connection_id", connIds)
          .order("last_message_at", { ascending: false, nullsFirst: false });

    const threads = rawThreads ?? [];

    // connection → counterpart を解決
    const connMap = new Map(conns.map((c) => [c.id, c]));
    const threadData = threads.map((t) => {
      const c = connMap.get(t.connection_id);
      const counterpartId = c
        ? (c.requester_id === user.id ? c.target_id : c.requester_id)
        : "";
      return {
        threadId: t.id,
        connectionId: t.connection_id,
        lastMessageAt: t.last_message_at,
        counterpartId,
      };
    });

    // 名前解決（auth.users metadata）
    const uniqueIds = [...new Set(threadData.map((t) => t.counterpartId).filter(Boolean))];
    const nameMap = await resolveDisplayNames(uniqueIds);

    // 各スレッドの最終メッセージを取得
    const threadIds = threadData.map((t) => t.threadId);
    const lastMessages: Record<string, { body: string; sender_id: string; created_at: string }> = {};
    if (threadIds.length > 0 && admin) {
      for (const tid of threadIds) {
        const { data: msgs } = await admin
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
    if (threadIds.length > 0) {
      const { data: cursors } = await supabase
        .from("talk_read_cursors")
        .select("thread_id, last_read_at")
        .eq("user_id", user.id)
        .in("thread_id", threadIds);
      for (const c of cursors ?? []) {
        cursorMap[c.thread_id] = c.last_read_at;
      }
    }

    // 未読数
    const unreadMap: Record<string, number> = {};
    if (threadIds.length > 0 && admin) {
      const { data: allMsgs } = await admin
        .from("talk_messages")
        .select("thread_id, created_at")
        .in("thread_id", threadIds)
        .neq("sender_id", user.id);
      for (const msg of allMsgs ?? []) {
        const cursor = cursorMap[msg.thread_id];
        if (!cursor || msg.created_at > cursor) {
          unreadMap[msg.thread_id] = (unreadMap[msg.thread_id] ?? 0) + 1;
        }
      }
    }

    const result = threadData.map((t) => {
      const msg = lastMessages[t.threadId];
      const names = nameMap[t.counterpartId];
      return {
        threadId: t.threadId,
        connectionId: t.connectionId,
        counterpart: {
          userId: t.counterpartId,
          displayName: names?.displayName ?? null,
          avatarUrl: names?.avatarUrl ?? null,
        },
        lastMessage: msg ? {
          body: msg.body,
          senderId: msg.sender_id,
          createdAt: msg.created_at,
        } : null,
        unreadCount: unreadMap[t.threadId] ?? 0,
      };
    });

    return NextResponse.json({ ok: true, threads: result });
  } catch (error) {
    console.error("talk/threads error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
