import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// POST /api/rendezvous/topic/answer
// お題に回答を投稿
// =============================================================================

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { topicId, answerText, category } = body as {
      topicId: string;
      answerText: string;
      category?: string;
    };

    if (!topicId || !answerText) {
      return NextResponse.json({ ok: false, error: "Missing topicId or answerText" }, { status: 400 });
    }

    const trimmed = answerText.trim();
    if (trimmed.length < 1 || trimmed.length > 500) {
      return NextResponse.json({ ok: false, error: "Answer must be 1-500 characters" }, { status: 400 });
    }

    // お題の存在確認
    const { data: topic } = await supabaseAdmin
      .from("rendezvous_daily_topics")
      .select("id")
      .eq("id", topicId)
      .single();

    if (!topic) {
      return NextResponse.json({ ok: false, error: "Topic not found" }, { status: 404 });
    }

    // upsert（同一topic+user+categoryで上書き可能）
    const { data: answer, error } = await supabaseAdmin
      .from("rendezvous_topic_answers")
      .upsert(
        {
          topic_id: topicId,
          user_id: auth.user.id,
          answer_text: trimmed,
          category: category ?? "general",
        },
        { onConflict: "topic_id,user_id,category" },
      )
      .select("id, answer_text, created_at")
      .single();

    if (error) {
      console.error("[topic/answer] Insert error:", error);
      return NextResponse.json({ ok: false, error: "Failed to save answer" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      answer: { id: answer.id, text: answer.answer_text, createdAt: answer.created_at },
    });
  } catch (err) {
    console.error("[topic/answer] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
