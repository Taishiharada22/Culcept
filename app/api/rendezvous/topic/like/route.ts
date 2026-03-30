import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// =============================================================================
// POST /api/rendezvous/topic/like
// 回答にいいねを付ける → 相互いいねならマッチ成立
// =============================================================================

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { answerId } = body as { answerId: string };

    if (!answerId) {
      return NextResponse.json({ ok: false, error: "Missing answerId" }, { status: 400 });
    }

    const userId = auth.user.id;

    // 回答の存在確認 + 回答者取得
    const { data: answer } = await supabaseAdmin
      .from("rendezvous_topic_answers")
      .select("id, user_id, topic_id, category")
      .eq("id", answerId)
      .single();

    if (!answer) {
      return NextResponse.json({ ok: false, error: "Answer not found" }, { status: 404 });
    }

    // 自分の回答にはいいねできない
    if (answer.user_id === userId) {
      return NextResponse.json({ ok: false, error: "Cannot like own answer" }, { status: 400 });
    }

    // いいねを挿入（重複は無視）
    const { error: likeErr } = await supabaseAdmin
      .from("rendezvous_topic_likes")
      .upsert(
        { answer_id: answerId, liker_id: userId },
        { onConflict: "answer_id,liker_id", ignoreDuplicates: true },
      );

    if (likeErr) {
      console.error("[topic/like] Insert error:", likeErr);
      return NextResponse.json({ ok: false, error: "Failed to like" }, { status: 500 });
    }

    // 相互いいねチェック:
    // 相手(answer.user_id)が、自分(userId)の同じtopic+categoryの回答にいいねしているか？
    const { data: myAnswer } = await supabaseAdmin
      .from("rendezvous_topic_answers")
      .select("id")
      .eq("topic_id", answer.topic_id)
      .eq("user_id", userId)
      .eq("category", answer.category)
      .maybeSingle();

    let isMutual = false;

    if (myAnswer) {
      const { data: theirLike } = await supabaseAdmin
        .from("rendezvous_topic_likes")
        .select("id")
        .eq("answer_id", myAnswer.id)
        .eq("liker_id", answer.user_id)
        .maybeSingle();

      isMutual = !!theirLike;
    }

    // 相互いいね成立 → rendezvous_candidates にマッチレコード作成
    if (isMutual) {
      try {
        // 既に同ペアの candidate が存在しないか確認（重複防止）
        const { data: existing } = await supabaseAdmin
          .from("rendezvous_candidates")
          .select("id")
          .or(
            `and(user_a.eq.${userId},user_b.eq.${answer.user_id}),and(user_a.eq.${answer.user_id},user_b.eq.${userId})`,
          )
          .in("state", ["matched", "mutual_liked", "chat_opened"])
          .maybeSingle();

        if (!existing) {
          const { error: insertErr } = await supabaseAdmin
            .from("rendezvous_candidates")
            .insert({
              user_a: userId,
              user_b: answer.user_id,
              category: answer.category ?? "friendship",
              state: "matched",
              matched_at: new Date().toISOString(),
              a_to_b_score: 0,
              b_to_a_score: 0,
              overall_score: 0,
              reason_codes: [],
              reason_texts: ["トピック回答の相互いいねでマッチ"],
              caution_codes: [],
              caution_texts: [],
            });

          if (insertErr) {
            console.error("[topic/like] Failed to create candidate:", insertErr);
          }
        }
      } catch (candidateErr) {
        // candidate作成失敗してもいいねレスポンスは返す
        console.error("[topic/like] Candidate creation error:", candidateErr);
      }
      // TODO: 通知システムが実装されたら、両ユーザーにマッチ通知を送信する
    }

    return NextResponse.json({
      ok: true,
      liked: true,
      isMutual,
    });
  } catch (err) {
    console.error("[topic/like] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
