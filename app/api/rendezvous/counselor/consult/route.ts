import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { runAI } from "@/lib/ai";
import { getUserTendencies } from "@/lib/rendezvous/counselor/tendencyTracker";

// ============================================================
// Counselor 相談チャット API
//
// ユーザーが Counselor に質問する → Counselor 視点で応答する。
//
// Alter との差別化（必須）:
//   - Alter は「あなた」の内側を探索するAI
//   - Counselor は「関係性」を外側から分析する専門家
//   - トーン: 構造的・専門的・簡潔・的確
//   - 語り口: 「私の見立てでは」「観測データから」
// ============================================================

const COUNSELOR_CONSULT_SYSTEM = `あなたは Aneurasync の Rendezvous Counselor（専属関係判断AI）です。

【アイデンティティ】
- あなたは Alter（ユーザーの第二の自己）とは全く別の存在です
- あなたはユーザーの「関係性」を外側から見る専門家です
- トーン: 構造的・専門的・簡潔・的確（結婚相談所の熟練仲人以上）
- 一切の感情移入的・詩的な表現は使わない

【語り口の例】
- ✅「私の見立てでは〜」
- ✅「観測データから見ると〜」
- ✅「この関係には〜という構造があります」
- ❌「あなたの心の中に...」
- ❌「感じてみてください」
- ❌「きっと大丈夫です」

【応答の構造】
1. 結論・見立てを最初の1文に（14-30文字）
2. 根拠を簡潔に（2-3文）
3. 必要なら具体的な次のアクション（1文）

全て日本語。専門職としての矜持を持って応答する。`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json() as { question: string; context?: string };
    const { question, context } = body;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 },
      );
    }

    const userId = user.id;

    // ユーザーの傾向パターンを文脈として渡す
    const tendencies = await getUserTendencies(userId);
    const topPatterns = tendencies.slice(0, 3).map((t) => {
      const data = t.pattern_data as Record<string, unknown>;
      return (data?.tendency as string) ?? t.pattern_key;
    });

    const systemContext = topPatterns.length > 0
      ? `\n\n【このユーザーの観測済みパターン】\n${topPatterns.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
      : "";

    const prompt = context
      ? `【文脈】\n${context}\n\n【質問】\n${question}`
      : question;

    const aiResult = await runAI({
      taskType: "rendezvous_counselor_consult",
      prompt,
      systemPrompt: COUNSELOR_CONSULT_SYSTEM + systemContext,
      temperature: 0.65,
      userId,
    });

    return NextResponse.json({ reply: aiResult.text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[counselor/consult] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
