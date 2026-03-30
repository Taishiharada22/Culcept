// POST/DELETE /api/talk/threads/[threadId]/messages/[messageId]/reactions
// Genomeリアクション: resonance(共鳴) / discovery(発見) / tell_more(もっと聞きたい) / moved(沁みた)
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const VALID_TYPES = ["resonance", "discovery", "tell_more", "moved"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string; messageId: string }> },
) {
  try {
    const { threadId, messageId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const reactionType = body?.type;
    if (!reactionType || !VALID_TYPES.includes(reactionType)) {
      return NextResponse.json({ error: "Invalid reaction type" }, { status: 400 });
    }

    // メッセージがこのスレッドに属するか確認
    const { data: msg } = await supabase
      .from("talk_messages")
      .select("id")
      .eq("id", messageId)
      .eq("thread_id", threadId)
      .maybeSingle();

    if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    // Upsert（既にあれば何もしない、なければ追加）
    const { error } = await supabase
      .from("talk_reactions")
      .upsert({
        message_id: messageId,
        user_id: user.id,
        reaction_type: reactionType,
      }, { onConflict: "message_id,user_id,reaction_type" });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("reaction error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string; messageId: string }> },
) {
  try {
    const { messageId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const reactionType = url.searchParams.get("type");
    if (!reactionType || !VALID_TYPES.includes(reactionType as typeof VALID_TYPES[number])) {
      return NextResponse.json({ error: "Invalid reaction type" }, { status: 400 });
    }

    await supabase
      .from("talk_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .eq("reaction_type", reactionType);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("reaction delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
