import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_EMOJIS = new Set(["🔥", "💎", "😂", "🙏", "🤔", "😤"]);

// ---------------------------------------------------------------------------
// POST — アバターストーリーへのリアクション
// ConnectionsTab の AvatarStoryViewer から呼ばれる
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const storyId = body.storyId as string;
    const emoji = body.emoji as string;

    if (!storyId || !emoji) {
      return NextResponse.json(
        { error: "storyId and emoji are required" },
        { status: 400 },
      );
    }

    if (!ALLOWED_EMOJIS.has(emoji)) {
      return NextResponse.json(
        { error: "Invalid emoji" },
        { status: 400 },
      );
    }

    // avatar_reactions テーブルに保存
    // storyId = conversation_id, message_index = 0 (ストーリー全体へのリアクション)
    const { error } = await supabaseAdmin
      .from("avatar_reactions")
      .insert({
        conversation_id: storyId,
        user_id: auth.user.id,
        message_index: 0,
        reaction_type: emoji,
      });

    if (error) {
      console.error("[avatar-stories/react] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[avatar-stories/react] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
