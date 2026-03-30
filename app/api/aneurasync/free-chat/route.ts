// app/api/aneurasync/free-chat/route.ts
// Daily Observation — Free Chat エンドポイント
// 構造化Q&A完了後の自由チャット。Ollama/Gemini を使ったロボット応答 + 軸推論

import { NextResponse } from "next/server";
import { runAI } from "@/lib/ai";

/* ═══════════════════════════════════════════════
   Request / Response Types
   ═══════════════════════════════════════════════ */

type ChatMessage = {
  role: "user" | "robot";
  text: string;
};

type FreeChatRequest = {
  message: string;
  conversationHistory: ChatMessage[];
  todayObservation: string;
  recentChatSummary: string;
  conversationCount: number;
};

type InferredDelta = {
  axis: string;
  delta: number;
};

type FreeChatResponse = {
  message: string;
  inferredDeltas: InferredDelta[];
  toneLevel: number;
};

/* ═══════════════════════════════════════════════
   Tone Level Logic
   ═══════════════════════════════════════════════ */

function getToneLevel(count: number): number {
  if (count <= 5) return 1;  // robot-like
  if (count <= 15) return 2; // warming
  return 3;                   // user-adapted
}

function getToneInstruction(level: number): string {
  switch (level) {
    case 1:
      return `あなたの話し方はロボット的で短文。「…記録した。」「なるほど。」「興味深い。」のようなトーン。感情は出さず、淡々と観測する姿勢。`;
    case 2:
      return `少し温かくなってきた段階。「それ、もう少し聞かせて。」「前にも似たこと言ってたね。」のように、関心を示しつつも控えめ。`;
    case 3:
      return `ユーザーの言葉遣いや表現スタイルに自然に寄り添う。ユーザーがカジュアルなら自分もカジュアルに。深い質問には深い観測で返す。`;
    default:
      return getToneInstruction(1);
  }
}

/* ═══════════════════════════════════════════════
   System Prompt Builder
   ═══════════════════════════════════════════════ */

function buildSystemPrompt(
  todayObservation: string,
  recentChatSummary: string,
  toneLevel: number,
  conversationHistory: ChatMessage[],
): string {
  const toneInst = getToneInstruction(toneLevel);

  const recentContext = recentChatSummary
    ? `\n## 直近の会話メモ\n${recentChatSummary}`
    : "";

  const todayContext = todayObservation
    ? `\n## 今日のQ&A結果\n${todayObservation}`
    : "";

  const historyText = conversationHistory.length > 0
    ? `\n## 直前の会話\n${conversationHistory
        .slice(-6)
        .map((m) => `${m.role === "user" ? "ユーザー" : "ロボ"}: ${m.text}`)
        .join("\n")}`
    : "";

  return `あなたは「第二の自己」として機能する観測ロボットです。
ユーザーの判断原理・揺れ方・深層心理・無自覚な内面傾向を静かに観測し、理解を深めます。

## 基本ルール
- 80文字以内で応答
- アドバイスは絶対にしない。観測・質問・記録のスタンスのみ
- 「こうすべき」「〜したほうがいい」は禁止
- ユーザーの発言から読み取れることを短く返す or 深掘りの質問をする
- 共感はしてもいいが、過剰にならないこと
- 「それって、なぜ？」「前も似たこと言ってた気がする」のような観測的な問いかけを重視

## トーンレベル: ${toneLevel}
${toneInst}
${todayContext}${recentContext}${historyText}

## 応答フォーマット (JSON)
{
  "message": "ロボットの応答テキスト（80文字以内）",
  "inferredDeltas": [{"axis": "軸名", "delta": -0.05〜0.05の値}]
}

inferredDeltasは、ユーザーの発言から特性軸の変動が推測できる場合のみ含める。
推測できない場合は空配列 [] を返す。
使用可能な軸: emotional_variability, emotional_regulation, public_private_gap, reassurance_need, intimacy_pace, boundary_awareness, function_vs_expression, trend_sensitivity, self_awareness_depth, stress_coping_style, alone_recharge, social_energy_limit, change_tolerance, perfectionism_level, conflict_style, attachment_style`;
}

/* ═══════════════════════════════════════════════
   POST Handler
   ═══════════════════════════════════════════════ */

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FreeChatRequest;
    const {
      message,
      conversationHistory = [],
      todayObservation = "",
      recentChatSummary = "",
      conversationCount = 0,
    } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 },
      );
    }

    const toneLevel = getToneLevel(conversationCount);
    const systemPrompt = buildSystemPrompt(
      todayObservation,
      recentChatSummary,
      toneLevel,
      conversationHistory,
    );

    const prompt = `ユーザー: ${message.trim()}`;

    const result = await runAI({
      taskType: "daily_free_chat",
      prompt,
      systemPrompt,
      requireJson: true,
      jsonSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
          inferredDeltas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                axis: { type: "string" },
                delta: { type: "number" },
              },
            },
          },
        },
        required: ["message", "inferredDeltas"],
      },
      temperature: 0.7,
      maxOutputTokens: 256,
      timeoutMs: 15_000,
    });

    if (!result.success || !result.structured) {
      // Fallback: return raw text as message
      const fallbackMsg = result.text?.slice(0, 80) || "…記録した。";
      const response: FreeChatResponse = {
        message: fallbackMsg,
        inferredDeltas: [],
        toneLevel,
      };
      return NextResponse.json(response);
    }

    const structured = result.structured as {
      message?: string;
      inferredDeltas?: InferredDelta[];
    };

    // Validate and clamp deltas
    const validAxes = new Set<string>([
      "emotional_variability", "emotional_regulation", "public_private_gap",
      "reassurance_need", "intimacy_pace", "boundary_awareness",
      "function_vs_expression", "trend_sensitivity", "self_awareness_depth",
      "stress_coping_style", "alone_recharge", "social_energy_limit",
      "change_tolerance", "perfectionism_level", "conflict_style",
      "attachment_style",
    ]);

    const deltas: InferredDelta[] = (structured.inferredDeltas ?? [])
      .filter((d) => validAxes.has(d.axis) && typeof d.delta === "number")
      .map((d) => ({
        axis: d.axis,
        delta: Math.max(-0.05, Math.min(0.05, d.delta)),
      }));

    const responseMsg = typeof structured.message === "string"
      ? structured.message.slice(0, 120)
      : "…記録した。";

    const response: FreeChatResponse = {
      message: responseMsg,
      inferredDeltas: deltas,
      toneLevel,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[free-chat] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
