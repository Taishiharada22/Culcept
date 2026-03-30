// GET /api/talk/unread — 未読総数（バッジ用）
// N+1クエリ問題を修正: 全スレッドの未読を1クエリで取得
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 自分が参加する接続のスレッドIDを取得
    const { data: conns } = await supabase
      .from("genome_connections")
      .select("id")
      .or(`requester_id.eq.${user.id},target_id.eq.${user.id}`)
      .eq("status", "accepted");

    if (!conns || conns.length === 0) {
      return NextResponse.json({ ok: true, unreadCount: 0 });
    }

    const { data: threads } = await supabase
      .from("talk_threads")
      .select("id")
      .in("connection_id", conns.map((c) => c.id));

    if (!threads || threads.length === 0) {
      return NextResponse.json({ ok: true, unreadCount: 0 });
    }

    const threadIds = threads.map((t) => t.id);

    // 既読カーソルを取得
    const { data: cursors } = await supabase
      .from("talk_read_cursors")
      .select("thread_id, last_read_at")
      .eq("user_id", user.id)
      .in("thread_id", threadIds);

    // 最も古い既読カーソルを基準に全未読メッセージを1クエリで取得
    const oldestCursor = (cursors ?? []).reduce<string | null>((oldest, c) => {
      if (!oldest) return c.last_read_at;
      return c.last_read_at < oldest ? c.last_read_at : oldest;
    }, null);

    // 1クエリで全スレッドの未読メッセージを取得
    let query = supabase
      .from("talk_messages")
      .select("thread_id, created_at", { count: "exact" })
      .in("thread_id", threadIds)
      .neq("sender_id", user.id);

    if (oldestCursor) {
      query = query.gt("created_at", oldestCursor);
    }

    const { data: unreadMessages } = await query;

    // スレッドごとの既読カーソルでフィルタリング
    const cursorMap: Record<string, string> = {};
    for (const c of cursors ?? []) {
      cursorMap[c.thread_id] = c.last_read_at;
    }

    let totalUnread = 0;
    for (const msg of unreadMessages ?? []) {
      const cursor = cursorMap[msg.thread_id];
      if (!cursor || msg.created_at > cursor) {
        totalUnread++;
      }
    }

    return NextResponse.json({ ok: true, unreadCount: totalUnread });
  } catch (error) {
    console.error("talk/unread error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
