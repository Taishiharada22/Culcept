import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// GET /api/rendezvous/topic/gallery?topicId=xxx&category=romantic&page=0&limit=20
// 匿名ギャラリー — お題への回答一覧
// =============================================================================

export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const topicId = url.searchParams.get("topicId");
    const category = url.searchParams.get("category") ?? "general";
    const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));

    if (!topicId) {
      return NextResponse.json({ ok: false, error: "Missing topicId" }, { status: 400 });
    }

    const offset = page * limit;

    // 回答一覧取得（匿名: user_idは返さない）
    const { data: answers, error } = await supabaseAdmin
      .from("rendezvous_topic_answers")
      .select("id, answer_text, created_at")
      .eq("topic_id", topicId)
      .eq("category", category)
      .neq("user_id", auth.user.id) // 自分の回答は除外
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[topic/gallery] Query error:", error);
      return NextResponse.json({ ok: false, error: "Query failed" }, { status: 500 });
    }

    // 自分のいいね情報を取得
    const answerIds = (answers ?? []).map((a) => a.id);
    let myLikes: Set<string> = new Set();

    if (answerIds.length > 0) {
      const { data: likes } = await supabaseAdmin
        .from("rendezvous_topic_likes")
        .select("answer_id")
        .eq("liker_id", auth.user.id)
        .in("answer_id", answerIds);
      myLikes = new Set((likes ?? []).map((l) => l.answer_id));
    }

    // 各回答のいいね数
    const enriched = await Promise.all(
      (answers ?? []).map(async (a) => {
        const { count } = await supabaseAdmin
          .from("rendezvous_topic_likes")
          .select("id", { count: "exact", head: true })
          .eq("answer_id", a.id);
        return {
          id: a.id,
          text: a.answer_text,
          createdAt: a.created_at,
          likeCount: count ?? 0,
          isLiked: myLikes.has(a.id),
        };
      }),
    );

    return NextResponse.json({
      ok: true,
      answers: enriched,
      page,
      hasMore: (answers ?? []).length === limit,
    });
  } catch (err) {
    console.error("[topic/gallery] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
