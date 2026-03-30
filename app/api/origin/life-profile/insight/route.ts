// app/api/origin/life-profile/insight/route.ts
// #7 LLM連携インサイト — AIが驚きの洞察を生成し、DBにキャッシュ
//
// GET: キャッシュ済みインサイトを返す（再生成しない）
// POST: 新規生成 + DBキャッシュ + レスポンス

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runAI } from "@/lib/ai";

// ---------------------------------------------------------------------------
// GET — キャッシュ済みインサイトを取得
// ---------------------------------------------------------------------------
export async function GET() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: meta } = await supabase
    .from("life_profile_meta")
    .select("latest_insight")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  return NextResponse.json({
    insight: meta?.latest_insight ?? null,
    cached: !!meta?.latest_insight,
  });
}

// ---------------------------------------------------------------------------
// POST — LLM で新規生成し、DBにキャッシュして返す
// ---------------------------------------------------------------------------
export async function POST() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 全エントリ取得
  const { data: entries } = await supabase
    .from("life_profile_entries")
    .select("title, category, note, depth_responses, impact, active")
    .eq("user_id", auth.user.id)
    .eq("active", true)
    .order("impact", { ascending: false })
    .limit(30);

  if (!entries || entries.length < 2) {
    return NextResponse.json({ insight: null, reason: "not_enough_data" });
  }

  // エントリを要約してプロンプトに
  const entrySummary = entries
    .map((e) => {
      const depths = Array.isArray(e.depth_responses)
        ? (e.depth_responses as { question: string; answer: string }[])
            .map((r) => `  Q: ${r.question} → ${r.answer}`)
            .join("\n")
        : "";
      return `[${e.category}] ${e.title} (影響度: ${e.impact}/5)${e.note ? `\n  メモ: ${e.note}` : ""}${depths ? `\n${depths}` : ""}`;
    })
    .join("\n\n");

  let insight: Record<string, unknown> | null = null;

  try {
    const result = await runAI({
      taskType: "life_profile_insight",
      systemPrompt: `あなたはAneurasyncの深層観測AIです。
ユーザーの「人生の輪郭」データから、ユーザー本人が気づいていない意外なつながり、パターン、洞察を発見してください。

ルール:
- 表面的な指摘（「多趣味ですね」等）は禁止
- 異なるカテゴリ間の予想外のつながりを見つける
- ユーザーが「自分って、そういう人間だったのか」と感じるような気づきを
- 日本語で、簡潔に（3文以内）
- 結論から入る。前置き不要

JSON形式で返答:
{ "title": "気づきの見出し（8文字以内）", "body": "気づきの本文（100文字以内）", "type": "cross_connection" | "pattern" | "depth_nudge" }`,
      prompt: `以下はユーザーの「人生の輪郭」データです:\n\n${entrySummary}\n\n上記データから、最も意外で深い洞察を1つ生成してください。`,
      requireJson: true,
      temperature: 0.8,
      maxOutputTokens: 200,
      userId: auth.user.id,
    });

    if (result.structured) {
      const s = result.structured as Record<string, unknown>;
      insight = {
        id: `llm_${Date.now()}`,
        type: s.type ?? "cross_connection",
        title: s.title ?? "AI の気づき",
        body: s.body ?? result.text,
        relatedEntryIds: [],
        generatedAt: new Date().toISOString(),
        source: "llm",
      };
    } else {
      insight = {
        id: `llm_${Date.now()}`,
        type: "cross_connection",
        title: "AI の気づき",
        body: result.text.slice(0, 150),
        relatedEntryIds: [],
        generatedAt: new Date().toISOString(),
        source: "llm",
      };
    }
  } catch {
    // LLM失敗時はnull（クライアントがルールベースにフォールバック）
    return NextResponse.json({ insight: null, reason: "llm_error" });
  }

  // DB にキャッシュ
  if (insight) {
    await supabase
      .from("life_profile_meta")
      .upsert(
        {
          user_id: auth.user.id,
          latest_insight: insight,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .then(({ error }) => {
        if (error) console.warn("[life-profile/insight] cache write failed:", error);
      });
  }

  return NextResponse.json({ insight });
}
