import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runAI } from "@/lib/ai";

/**
 * POST /api/origin/journal/go-deeper
 * AI generates probing follow-up questions based on journal content.
 * Inspired by Day One's "Go Deeper" and Journey's "Reflections".
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { body, emotion_tags, date } = await req.json();
  if (!body || body.trim().length < 10) {
    return NextResponse.json({ ok: false, error: "journal too short" });
  }

  // Fetch past entries for context
  const { data: pastEntries } = await supabase
    .from("origin_journal_entries")
    .select("date, body, emotion_tags, title")
    .eq("user_id", user.id)
    .neq("date", date)
    .order("date", { ascending: false })
    .limit(5);

  const pastContext = (pastEntries ?? [])
    .map((e) => `[${e.date}] ${e.title ?? ""}: ${(e.body ?? "").slice(0, 100)}`)
    .join("\n");

  try {
    const result = await runAI({
      taskType: "origin_go_deeper",
      systemPrompt: `あなたは深層観測AIです。ユーザーの日記を読み、より深い自己理解に導く質問を3つ生成してください。

ルール:
- 質問は日本語で
- 表面的な質問は避け、判断原理・感情の背景・無自覚な傾向を引き出す
- 過去の記録との接続を見出せる場合は言及する
- 「なぜ」ではなく「どんな感じだった？」「いつからそう思い始めた？」のような体験を引き出す形式
- JSON配列で返す: ["質問1", "質問2", "質問3"]`,
      prompt: `今日の記録 (${date}):
${body}

感情タグ: ${(emotion_tags ?? []).join(", ")}

過去の記録:
${pastContext || "(まだ少ない)"}

この記録を深く掘り下げる質問を3つ生成してください。`,
      maxOutputTokens: 300,
      userId: user.id,
    });

    // Parse JSON array from AI response
    const text = result.text;
    let questions: string[] = [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        questions = parsed.slice(0, 3);
      }
    } catch {
      // Try to extract from text
      const lines = text.split("\n").filter((l) => l.trim().length > 5);
      questions = lines.slice(0, 3).map((l) => l.replace(/^[\d\-.\s*]+/, "").trim());
    }

    return NextResponse.json({ ok: true, questions });
  } catch {
    return NextResponse.json({ ok: false, error: "AI generation failed" }, { status: 500 });
  }
}
