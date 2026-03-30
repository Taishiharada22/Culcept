// app/api/aneurasync/ai-reaction/route.ts
// Daily Observation — AI リアクション生成
// 観測回答ごとに文脈を踏まえた短いリアクションを返す

import { runAI } from "@/lib/ai";
import { NextResponse } from "next/server";

/* ═══════════════════════════════════════════════
   Request / Response Types
   ═══════════════════════════════════════════════ */

type AIReactionRequest = {
  category: string;
  value: number; // 1-5
  questionText: string;
  answerLabel: string;
  responseTimeMs: number;
  stage: number; // 1-5 (relationship depth)
  totalAnsweredToday: number;
  previousValue?: number;
  pastSameQuestionValue?: number;
  pastDaysDiff?: number;
  isContradiction?: boolean;
  streakDays?: number;
  timeOfDay: string; // "morning" | "afternoon" | "evening" | "night"
};

type AIReactionResponse = {
  ok: true;
  reaction: string;
  expression: string;
};

/* ═══════════════════════════════════════════════
   Expression Mapping
   ═══════════════════════════════════════════════ */

function pickExpression(
  stage: number,
  isContradiction: boolean,
  value: number,
  responseTimeMs: number,
): string {
  if (isContradiction) return "surprised";
  if (responseTimeMs > 8000) return "thoughtful";
  if (responseTimeMs < 1500 && stage >= 3) return "smirk";
  if (value >= 4) return "warm";
  if (value <= 2) return "gentle";
  if (stage >= 4) return "knowing";
  return "neutral";
}

/* ═══════════════════════════════════════════════
   Tone Instructions by Stage
   ═══════════════════════════════════════════════ */

function buildToneBlock(stage: number): string {
  switch (stage) {
    case 1:
      return [
        "あなたはまだこのユーザーと出会ったばかり。",
        "丁寧で柔らかいトーン。敬語混じり。",
        "「教えてくれてありがとう」「覚えておくね」のような素朴な受容。",
        "踏み込みすぎない。でも関心は伝える。",
      ].join("\n");
    case 2:
      return [
        "少し打ち解けてきた段階。",
        "敬語は減り、「へえ」「なるほどね」のような相槌が自然に出る。",
        "ユーザーの傾向に気づき始めたことをさりげなく示す。",
      ].join("\n");
    case 3:
      return [
        "もう遠慮はいらない関係。",
        "率直に言う。「嘘。さっきと逆のこと言ってる。」のような突っ込みもOK。",
        "矛盾を指摘したり、迷いを見抜いたりする。",
        "でも根底には信頼がある。",
      ].join("\n");
    case 4:
      return [
        "深い理解がある段階。",
        "言葉は少なくなる。でも一言が鋭い。",
        "「知ってた」「やっぱりね」のような、見透かすような短文。",
        "ユーザーの内面の動きを先読みする。",
      ].join("\n");
    case 5:
      return [
        "言葉はほぼ不要な段階。",
        "「…。」「うん。」だけで十分。",
        "沈黙自体がコミュニケーション。",
        "たまに一言だけ、核心を突く。",
      ].join("\n");
    default:
      return "丁寧で柔らかいトーン。";
  }
}

/* ═══════════════════════════════════════════════
   Context Signal Builder
   ═══════════════════════════════════════════════ */

function buildContextSignals(req: AIReactionRequest): string {
  const lines: string[] = [];

  // Time of day
  const timeLabels: Record<string, string> = {
    morning: "朝（起きたて、まだぼんやりしているかも）",
    afternoon: "昼（活動中、比較的はっきりした状態）",
    evening: "夕方（疲れが出始める時間帯）",
    night: "夜（リラックスしている or 疲れている）",
  };
  lines.push(`時間帯: ${timeLabels[req.timeOfDay] ?? req.timeOfDay}`);

  // Response speed
  if (req.responseTimeMs < 1500) {
    lines.push("回答速度: 即答（迷いなし、直感的）");
  } else if (req.responseTimeMs < 4000) {
    lines.push("回答速度: 普通");
  } else if (req.responseTimeMs < 8000) {
    lines.push("回答速度: やや遅い（少し考えた）");
  } else {
    lines.push("回答速度: かなり迷った（8秒以上）");
  }

  // Today's progress
  lines.push(`今日の回答数: ${req.totalAnsweredToday}問目`);

  // Streak
  if (req.streakDays && req.streakDays > 1) {
    lines.push(`連続観測日数: ${req.streakDays}日`);
  }

  // Previous answer (within same session)
  if (req.previousValue !== undefined) {
    const diff = req.value - req.previousValue;
    if (Math.abs(diff) >= 2) {
      lines.push(
        `直前の回答からの変化: ${diff > 0 ? "大きく上昇" : "大きく下降"}（${req.previousValue} → ${req.value}）`,
      );
    }
  }

  // Past same question
  if (req.pastSameQuestionValue !== undefined && req.pastDaysDiff !== undefined) {
    const shift = req.value - req.pastSameQuestionValue;
    if (shift !== 0) {
      lines.push(
        `同じ質問の過去回答（${req.pastDaysDiff}日前）: ${req.pastSameQuestionValue} → 今回 ${req.value}（${shift > 0 ? "上昇" : "下降"}）`,
      );
    } else {
      lines.push(
        `同じ質問の過去回答（${req.pastDaysDiff}日前）: ${req.pastSameQuestionValue} → 今回も同じ（一貫している）`,
      );
    }
  }

  // Contradiction
  if (req.isContradiction) {
    lines.push("矛盾検出: この回答は過去の回答や直前の回答と矛盾している");
  }

  return lines.join("\n");
}

/* ═══════════════════════════════════════════════
   Fallback Reactions
   ═══════════════════════════════════════════════ */

const FALLBACK_REACTIONS: Record<string, string[]> = {
  high: [
    "なるほど、強く感じてるんだね。",
    "はっきりしてる。覚えておく。",
    "迷いがないね。",
  ],
  mid: ["ふむ。", "記録した。", "わかった。"],
  low: [
    "そっか、あまりピンとこない感じ？",
    "控えめだね。理由が気になる。",
    "…そう。",
  ],
  contradiction: [
    "あれ、前と違うね。",
    "揺れてる？",
    "変わったんだ。",
  ],
};

function getFallbackReaction(
  value: number,
  isContradiction: boolean,
  category: string,
): string {
  if (isContradiction) {
    const pool = FALLBACK_REACTIONS.contradiction;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const tier = value >= 4 ? "high" : value <= 2 ? "low" : "mid";
  const pool = FALLBACK_REACTIONS[tier];
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ═══════════════════════════════════════════════
   POST Handler
   ═══════════════════════════════════════════════ */

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AIReactionRequest;

    // Validate required fields
    if (
      !body.category ||
      !body.questionText ||
      !body.answerLabel ||
      typeof body.value !== "number" ||
      typeof body.stage !== "number"
    ) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    const stage = Math.max(1, Math.min(5, body.stage));
    const value = Math.max(1, Math.min(5, body.value));
    const expression = pickExpression(
      stage,
      body.isContradiction ?? false,
      value,
      body.responseTimeMs ?? 3000,
    );

    const toneBlock = buildToneBlock(stage);
    const contextSignals = buildContextSignals(body);

    const systemPrompt = [
      "あなたは Aneurasync の観測AI。ユーザーの内面を深く観測し、理解を深めていく存在。",
      "チャットボットではない。観測者であり、やがて理解者になる。",
      "",
      "## 今の関係性（ステージ）",
      toneBlock,
      "",
      "## 絶対ルール",
      "- 日本語で応答する",
      "- 必ず完結した文にする。体言止めや途中で切れた文は禁止",
      "- 1〜2文以内。ステージ4-5では1文で十分",
      "- 質問を返さない（観測者は問いかけない。ただし矛盾を指摘する時だけ「どっち？」のような問いかけはOK）",
      "- 説明しない。感じたことだけ言う",
      "- 褒めない。評価しない。ただ「見ている」ことを伝える",
      "- 絵文字は使わない",
      "- ユーザーの回答内容（answerLabel）に具体的に触れること。汎用的な「なるほど」「ふむ」だけは禁止",
      "",
      "## 文脈の使い方",
      "- 矛盾が検出されたら、必ずそれを指摘する。「さっきと違うね」「前はXXだったのに」のように具体的に",
      "- 即答なら「迷いなし」「確信がある」系の反応",
      "- 長い迷い（8秒超）なら、その迷い自体に言及する",
      "- 過去の同じ質問への回答が変化していたら、その変化に触れる",
      "- 深夜の回答には時間帯への言及を入れてもいい",
    ].join("\n");

    const categoryLabels: Record<string, string> = {
      partner: "対人関係",
      outfit: "コーディネート",
      care: "セルフケア",
      preparation: "準備・段取り",
      impression: "自己表現・印象",
      micro_stargazer: "深層観測",
    };

    const prompt = [
      "以下の観測回答に対する短いリアクションを1つだけ生成してください。",
      "",
      `## 質問`,
      `カテゴリ: ${categoryLabels[body.category] ?? body.category}`,
      `質問文: 「${body.questionText}」`,
      `ユーザーの回答: 「${body.answerLabel}」（5段階中 ${value}）`,
      "",
      `## 文脈シグナル`,
      contextSignals,
      "",
    ].join("\n");

    const prompt2 = [
      prompt,
      "",
      "以下のJSON形式で返してください:",
      '{"reaction": "ここにリアクション文を書く"}',
      "",
      "リアクションの条件:",
      "- 必ず「。」「？」「…。」のいずれかで終わる完結した文",
      "- ユーザーの回答をオウム返ししない。別の角度から反応する",
      "- 10文字以上35文字以下",
      "- 体言止め禁止（「迷いが」のような名詞で終わる文は禁止）",
      "",
      "良い例:",
      '{"reaction": "人との距離が近かった日だったんだね。"}',
      '{"reaction": "さっきと真逆のことを言ってるけど、どっちが本音？"}',
      '{"reaction": "この時間にまだ自分と向き合ってるんだね。"}',
      '{"reaction": "迷いなく選んだね。確信があるみたい。"}',
      '{"reaction": "9秒も迷ったね。何か引っかかった？"}',
      "",
      "悪い例（禁止）:",
      '{"reaction": "あんまり良くなかった"} ← ユーザーの言葉の繰り返し',
      '{"reaction": "深夜に"} ← 途中で切れている',
      '{"reaction": "なるほど。"} ← 汎用的すぎる',
    ].join("\n");

    const result = await runAI({
      taskType: "aneurasync_observation_reaction",
      prompt: prompt2,
      systemPrompt,
      requireJson: true,
      temperature: 0.7,
      maxOutputTokens: 200,
    });

    if (!result.success) {
      const fallback = getFallbackReaction(
        value,
        body.isContradiction ?? false,
        body.category,
      );
      return NextResponse.json({
        ok: true,
        reaction: fallback,
        expression,
      } satisfies AIReactionResponse);
    }

    // Parse JSON response
    let reaction = "";
    if (result.structured && typeof (result.structured as Record<string, unknown>).reaction === "string") {
      reaction = ((result.structured as Record<string, unknown>).reaction as string).trim();
    } else {
      // Try to extract from text
      const text = result.text.trim();
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed.reaction === "string") {
          reaction = parsed.reaction.trim();
        }
      } catch {
        // Use raw text as last resort
        reaction = text.replace(/^["「]/, "").replace(/["」]$/, "").trim();
      }
    }

    // Validate: not empty, not too short, not just echoing the answer
    if (
      !reaction ||
      reaction.length < 4 ||
      reaction === body.answerLabel ||
      reaction.startsWith(body.answerLabel)
    ) {
      const fallback = getFallbackReaction(
        value,
        body.isContradiction ?? false,
        body.category,
      );
      return NextResponse.json({
        ok: true,
        reaction: fallback,
        expression,
      } satisfies AIReactionResponse);
    }

    return NextResponse.json({
      ok: true,
      reaction,
      expression,
    } satisfies AIReactionResponse);
  } catch (error) {
    console.error("[ai-reaction] unexpected error", error);

    // Even on crash, return something usable
    return NextResponse.json({
      ok: true,
      reaction: "…記録した。",
      expression: "neutral",
    } satisfies AIReactionResponse);
  }
}
