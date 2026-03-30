// PATCH /api/talk/threads/[threadId]/messages/[messageId] — メッセージ編集
// DELETE /api/talk/threads/[threadId]/messages/[messageId] — メッセージ削除
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string; messageId: string }> },
) {
  try {
    const { threadId, messageId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const newBody = body?.body?.trim();
    if (!newBody) return NextResponse.json({ error: "Empty message" }, { status: 400 });

    // 送信者チェック
    const { data: msg } = await supabase
      .from("talk_messages")
      .select("id, sender_id, created_at")
      .eq("id", messageId)
      .eq("thread_id", threadId)
      .maybeSingle();

    if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (msg.sender_id !== user.id) return NextResponse.json({ error: "Not the sender" }, { status: 403 });

    // 5分以内のメッセージのみ編集可能
    const ageMs = Date.now() - new Date(msg.created_at).getTime();
    if (ageMs > 5 * 60 * 1000) {
      return NextResponse.json({ error: "編集可能な時間を過ぎました（5分以内）" }, { status: 400 });
    }

    const { error } = await supabase
      .from("talk_messages")
      .update({ body: newBody })
      .eq("id", messageId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("message edit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string; messageId: string }> },
) {
  try {
    const { messageId, threadId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: msg } = await supabase
      .from("talk_messages")
      .select("id, sender_id")
      .eq("id", messageId)
      .eq("thread_id", threadId)
      .maybeSingle();

    if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (msg.sender_id !== user.id) return NextResponse.json({ error: "Not the sender" }, { status: 403 });

    const { error } = await supabase
      .from("talk_messages")
      .update({ body: "このメッセージは削除されました" })
      .eq("id", messageId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("message delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
