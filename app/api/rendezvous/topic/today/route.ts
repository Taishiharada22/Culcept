import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateDailyTopic } from "@/lib/rendezvous/topicGenerator";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

// =============================================================================
// GET /api/rendezvous/topic/today?category=romantic
// 今日のお題を取得（なければ自動生成）
// =============================================================================

const VALID_CATEGORIES = ["romantic", "friendship", "cocreation", "community", "partner", "general"];

export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const category = url.searchParams.get("category") ?? "general";
    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ ok: false, error: "Invalid category" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // 1. 既存のお題を検索
    const { data: existing } = await supabaseAdmin
      .from("rendezvous_daily_topics")
      .select("id, topic_date, category, prompt_text, prompt_subtext, axis_id")
      .eq("topic_date", today)
      .eq("category", category)
      .maybeSingle();

    let topic = existing;

    // 2. なければ生成
    if (!topic) {
      const generated = await generateDailyTopic({
        date: today,
        category: category as RendezvousCategory | "general",
      });

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("rendezvous_daily_topics")
        .insert({
          topic_date: today,
          category,
          prompt_text: generated.prompt,
          prompt_subtext: generated.subtext ?? null,
          axis_id: generated.axisId,
          generation_meta: generated.generationMeta,
        })
        .select("id, topic_date, category, prompt_text, prompt_subtext, axis_id")
        .single();

      if (insertErr) {
        // 同時生成の競合 → 再取得
        const { data: retried } = await supabaseAdmin
          .from("rendezvous_daily_topics")
          .select("id, topic_date, category, prompt_text, prompt_subtext, axis_id")
          .eq("topic_date", today)
          .eq("category", category)
          .single();
        topic = retried;
      } else {
        topic = inserted;
      }
    }

    if (!topic) {
      return NextResponse.json({ ok: false, error: "Failed to get topic" }, { status: 500 });
    }

    // 3. ユーザーの回答状態を取得
    const { data: myAnswer } = await supabaseAdmin
      .from("rendezvous_topic_answers")
      .select("id, answer_text, created_at")
      .eq("topic_id", topic.id)
      .eq("user_id", auth.user.id)
      .eq("category", category)
      .maybeSingle();

    // 4. 回答数を取得
    const { count: answerCount } = await supabaseAdmin
      .from("rendezvous_topic_answers")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topic.id)
      .eq("category", category);

    return NextResponse.json({
      ok: true,
      topic: {
        id: topic.id,
        date: topic.topic_date,
        category: topic.category,
        prompt: topic.prompt_text,
        subtext: topic.prompt_subtext,
        axisId: topic.axis_id,
      },
      myAnswer: myAnswer
        ? { id: myAnswer.id, text: myAnswer.answer_text, createdAt: myAnswer.created_at }
        : null,
      answerCount: answerCount ?? 0,
    });
  } catch (err) {
    console.error("[topic/today] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
