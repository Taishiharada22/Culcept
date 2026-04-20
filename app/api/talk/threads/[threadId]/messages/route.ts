// GET /api/talk/threads/[threadId]/messages — メッセージ取得
// POST /api/talk/threads/[threadId]/messages — メッセージ送信
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // スレッドの存在確認 + 参加者チェック
    const { data: thread } = await supabase
      .from("talk_threads")
      .select("id, connection_id")
      .eq("id", threadId)
      .single();

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // 接続の参加者確認
    const { data: conn } = await supabase
      .from("genome_connections")
      .select("requester_id, target_id")
      .eq("id", thread.connection_id)
      .single();

    if (!conn || (conn.requester_id !== user.id && conn.target_id !== user.id)) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    // ページネーション
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
    const before = url.searchParams.get("before"); // ISO timestamp

    let query = supabase
      .from("talk_messages")
      .select("id, thread_id, sender_id, body, created_at, read_at, media_url")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: messages, error } = await query;
    if (error) throw error;

    // リアクションを1クエリで全取得
    const msgIds = (messages ?? []).map((m) => m.id);
    let reactionsMap: Record<string, { type: string; userId: string }[]> = {};
    if (msgIds.length > 0) {
      const { data: reactions } = await supabase
        .from("talk_reactions")
        .select("message_id, reaction_type, user_id")
        .in("message_id", msgIds);
      for (const r of reactions ?? []) {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
        reactionsMap[r.message_id].push({ type: r.reaction_type, userId: r.user_id });
      }
    }

    const enriched = (messages ?? []).reverse().map((m) => ({
      id: m.id,
      threadId: m.thread_id,
      senderId: m.sender_id,
      body: m.body,
      createdAt: m.created_at,
      readAt: m.read_at,
      mediaUrl: m.media_url ?? null,
      reactions: reactionsMap[m.id] ?? [],
    }));

    return NextResponse.json({
      ok: true,
      messages: enriched,
      hasMore: (messages ?? []).length === limit,
    });
  } catch (error) {
    console.error("talk messages GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const reqBody = await req.json();
    const messageBody = reqBody.body;
    const mediaUrl = reqBody.mediaUrl ?? null;
    if (!messageBody?.trim() && !mediaUrl) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    // メッセージ挿入（RLS がスレッド参加者チェックを行う）
    const { data: message, error } = await supabase
      .from("talk_messages")
      .insert({
        thread_id: threadId,
        sender_id: user.id,
        body: (messageBody ?? "").trim(),
        media_url: mediaUrl,
      })
      .select()
      .single();

    if (error) throw error;

    // スレッドの last_message_at を更新
    await supabase
      .from("talk_threads")
      .update({ last_message_at: message.created_at })
      .eq("id", threadId);

    return NextResponse.json({ ok: true, message });
  } catch (error) {
    console.error("talk messages POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
