import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runAI } from "@/lib/ai";

/**
 * POST /api/origin/journal/title
 * Generate a one-line title for a journal entry using AI.
 * Body: { date: string, body: string }
 * Returns: { ok: true, title: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { date, body: journalBody } = await req.json();
  if (!date || !journalBody) {
    return NextResponse.json({ ok: false, error: "date and body required" }, { status: 400 });
  }

  // Skip title generation for very short entries
  if (journalBody.trim().length < 20) {
    return NextResponse.json({ ok: true, title: null, reason: "body_too_short" });
  }

  try {
    const result = await runAI({
      taskType: "origin_journal_title",
      prompt: `以下の日記エントリを15文字以内の一文で要約してください。体言止め推奨。「〜した日」「〜の午後」のような形式で。余計な装飾や絵文字は不要。タイトルのみ出力してください。

日記:
${journalBody.slice(0, 500)}`,
      temperature: 0.3,
      maxOutputTokens: 50,
    });

    const title = (typeof result === "string" ? result : result?.text ?? "").trim().slice(0, 30);

    if (title) {
      // Save title to the entry
      await supabase
        .from("origin_journal_entries")
        .update({ title })
        .eq("user_id", user.id)
        .eq("date", date);
    }

    return NextResponse.json({ ok: true, title: title || null });
  } catch (e) {
    console.error("[journal/title] AI error:", e);
    return NextResponse.json({ ok: true, title: null, reason: "ai_error" });
  }
}
