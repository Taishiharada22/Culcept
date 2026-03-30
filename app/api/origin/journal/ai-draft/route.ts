import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runAI } from "@/lib/ai";

/**
 * POST /api/origin/journal/ai-draft
 * Generate an AI draft for today's journal based on completed tasks, inner weather, etc.
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { completedTasks, innerWeather, emotionTags, date } = await req.json();

  const taskSummary =
    completedTasks && completedTasks.length > 0
      ? completedTasks.map((t: { text: string; texture?: string }) => `- ${t.text}${t.texture ? ` (${t.texture})` : ""}`).join("\n")
      : "（タスクの記録なし）";

  const weatherContext = innerWeather
    ? `今日のコンディション: ${innerWeather.emoji} ${innerWeather.label}`
    : "";

  const emotionContext =
    emotionTags && emotionTags.length > 0 ? `感情メモ: ${emotionTags.join(", ")}` : "";

  const prompt = `あなたはユーザーの1日を振り返る手助けをするアシスタントです。
以下の情報を元に、今日のジャーナルの下書きを日本語で書いてください。

日付: ${date || "今日"}
${weatherContext}
${emotionContext}

今日やったこと:
${taskSummary}

条件:
- 3〜5文で簡潔に
- ユーザーの言葉のように自然に
- 事実の列挙ではなく、1日の流れや気持ちの変化を含める
- 「〜した」「〜だった」のような日記調
- 飾りすぎない、素朴なトーン`;

  try {
    const result = await runAI({
      taskType: "origin_journal_draft",
      prompt,
      temperature: 0.7,
      maxOutputTokens: 300,
    });

    const draft = result.text ?? "";

    return NextResponse.json({ ok: true, draft });
  } catch (e) {
    // Fallback: generate a simple template
    const lines: string[] = [];
    if (innerWeather) lines.push(`${innerWeather.emoji} ${innerWeather.label}な1日。`);
    if (completedTasks?.length > 0) {
      lines.push(`${completedTasks.length}つのタスクを片付けた。`);
    }
    if (emotionTags?.length > 0) lines.push(`気持ちとしては${emotionTags[0]}。`);
    if (lines.length === 0) lines.push("今日も1日が過ぎた。");

    return NextResponse.json({ ok: true, draft: lines.join("") });
  }
}
