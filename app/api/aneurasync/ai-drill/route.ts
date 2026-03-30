import { runAI } from "@/lib/ai";
import { parseStructuredJsonWithRecovery } from "@/lib/ai/structuredJson";
import { NextResponse } from "next/server";

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface RequestBody {
  category: string;
  value: number;
  questionText: string;
  answerLabel: string;
  stage: number;
  previousAnswers?: { category: string; value: number; label: string }[];
}

interface DrillQuestion {
  question: string;
  options: string[];
}

/* ─────────────────────────────────────────────
   Category context map
   ───────────────────────────────────────────── */

const CATEGORY_CONTEXT: Record<string, string> = {
  partner: "対人関係・人との距離感・コミュニケーションの質",
  outfit: "ファッション・スタイル・自分らしい装い",
  care: "セルフケア・衣類の手入れ・身だしなみの維持",
  preparation: "準備・計画性・段取りの取り方",
  impression: "自己表現・他者からの印象・自分の見せ方",
  partner_solo: "一人の時間における対人意識・孤独と充足",
};

/* ─────────────────────────────────────────────
   Stage-based tone guidance
   ───────────────────────────────────────────── */

function stageGuidance(stage: number): string {
  if (stage <= 2) {
    return "ユーザーとの関係はまだ初期段階です。やさしく、安心感のある問いかけにしてください。断定的な表現は避け、「〜かもしれませんね」のような柔らかいトーンを使ってください。";
  }
  if (stage === 3) {
    return "ユーザーとの関係は中期段階です。少し踏み込んだ質問も可能です。パターンや傾向に触れてもOKですが、押しつけがましくならないように。";
  }
  // stage 4-5
  return "ユーザーとの関係は深い段階です。率直で核心に迫る質問をしてください。矛盾や無自覚なパターンを指摘するような問いも歓迎です。「本当は〜では？」のような直接的な問いかけも使えます。";
}

/* ─────────────────────────────────────────────
   Tendency label
   ───────────────────────────────────────────── */

function tendencyLabel(value: number): string {
  if (value >= 4) return "ポジティブ（満足・充実）";
  if (value <= 2) return "ネガティブ（不満・違和感）";
  return "ニュートラル（どちらでもない）";
}

/* ─────────────────────────────────────────────
   Build AI prompt
   ───────────────────────────────────────────── */

function buildPrompt(body: RequestBody): string {
  const categoryCtx =
    CATEGORY_CONTEXT[body.category] ?? body.category;
  const tendency = tendencyLabel(body.value);
  const stageGuide = stageGuidance(body.stage);

  const previousContext =
    body.previousAnswers && body.previousAnswers.length > 0
      ? `\n\n今日の他の回答:\n${body.previousAnswers
          .map(
            (a) =>
              `- ${CATEGORY_CONTEXT[a.category] ?? a.category}: ${a.label}（${a.value}/5）`,
          )
          .join("\n")}`
      : "";

  return `あなたはAneurasyncの深層観測AIです。ユーザーのDaily Observation（日次観測）の回答に対して、深掘り質問を生成してください。

目的: ユーザーが「自分って、そういう人間だったのか」と気づける質問を作ること。表面的な好みではなく、判断原理・揺れ方・無自覚な内面傾向を掴む質問を生成してください。

## ユーザーの回答
- カテゴリ: ${categoryCtx}
- 質問: 「${body.questionText}」
- 回答: 「${body.answerLabel}」（${body.value}/5 — ${tendency}）
- 関係ステージ: ${body.stage}/5${previousContext}

## トーン指示
${stageGuide}

## 生成ルール
- 2〜3問の深掘り質問を生成
- 各質問に3〜4個の選択肢を付ける
- 全て日本語で出力
- 質問は「なぜそう感じたのか」「その背後にある価値観」「繰り返しパターン」「本音」を探るものにする
- 選択肢は具体的かつ共感しやすい表現にする
- 選択肢同士が明確に異なる角度になるようにする
- アンケートではなく、自己発見の入り口となる問いを意識する

JSON形式で返してください:
{
  "drills": [
    {
      "question": "深掘り質問のテキスト",
      "options": ["選択肢1", "選択肢2", "選択肢3"]
    }
  ]
}`;
}

/* ─────────────────────────────────────────────
   Fallback drills
   ───────────────────────────────────────────── */

function fallbackDrills(value: number): DrillQuestion[] {
  if (value >= 4) {
    return [
      {
        question: "何がうまくいったと感じましたか？",
        options: [
          "自分のペースで過ごせた",
          "誰かとの関係が心地よかった",
          "準備や計画が功を奏した",
          "なんとなく調子が良かった",
        ],
      },
      {
        question: "この感覚を再現するには何が必要だと思いますか？",
        options: [
          "同じ環境を整える",
          "心の余裕を持つ",
          "特に意識しなくていい",
        ],
      },
    ];
  }
  if (value <= 2) {
    return [
      {
        question: "一番引っかかったのはどの部分ですか？",
        options: [
          "自分の行動や判断",
          "相手や環境の影響",
          "体調やコンディション",
          "漠然とした違和感",
        ],
      },
      {
        question: "本当はどうしたかったですか？",
        options: [
          "もっと自分のペースでいたかった",
          "正直に伝えたかった",
          "別の選択をしたかった",
          "まだよくわからない",
        ],
      },
    ];
  }
  // neutral
  return [
    {
      question: "特に印象が薄かった理由は何だと思いますか？",
      options: [
        "ルーティンの一日だった",
        "他のことに意識が向いていた",
        "あまり考えなかった",
        "特に理由はない",
      ],
    },
    {
      question: "もう少し意識を向けるとしたら、何が気になりますか？",
      options: [
        "自分の気分の変化",
        "人との関わり方",
        "日常の小さな違和感",
      ],
    },
  ];
}

/* ─────────────────────────────────────────────
   POST handler
   ───────────────────────────────────────────── */

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    // Validation
    if (!body.category || !body.questionText || !body.answerLabel) {
      return NextResponse.json(
        { ok: false, error: "category, questionText, answerLabel are required" },
        { status: 400 },
      );
    }
    if (
      typeof body.value !== "number" ||
      body.value < 1 ||
      body.value > 5
    ) {
      return NextResponse.json(
        { ok: false, error: "value must be 1-5" },
        { status: 400 },
      );
    }
    if (
      typeof body.stage !== "number" ||
      body.stage < 1 ||
      body.stage > 5
    ) {
      return NextResponse.json(
        { ok: false, error: "stage must be 1-5" },
        { status: 400 },
      );
    }

    const prompt = buildPrompt(body);

    const result = await runAI({
      taskType: "aneurasync_drill_generation",
      prompt,
      systemPrompt:
        "あなたはAneurasyncの深層観測AIです。ユーザーの自己理解を深める質問を生成します。必ず指定されたJSON形式のみで回答してください。JSON以外のテキストは含めないでください。",
      temperature: 0.6,
      maxOutputTokens: 1500,
      requireJson: false,
      metadata: {
        category: body.category,
        value: body.value,
        stage: body.stage,
      },
    });

    if (!result.success) {
      console.error("[ai-drill] AI call failed:", result.errorMessage);
      return NextResponse.json({
        ok: true,
        drills: fallbackDrills(body.value),
        fallback: true,
      });
    }

    // Parse with recovery (handles malformed JSON from Gemini)
    let drills: DrillQuestion[] | null = null;

    // Strip markdown code fences that Gemini often wraps around JSON
    let rawText = result.text?.trim() ?? "";
    console.log("[ai-drill] success:", result.success, "text length:", rawText.length, "cacheHit:", result.cacheHit, "first100:", rawText.slice(0, 100));
    rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        parsed = parseStructuredJsonWithRecovery(rawText) as Record<string, unknown>;
      }
      if (Array.isArray(parsed.drills)) {
        drills = (parsed.drills as Record<string, unknown>[])
          .filter(
            (d) =>
              typeof d.question === "string" && Array.isArray(d.options),
          )
          .map((d) => ({
            question: d.question as string,
            options: (d.options as unknown[]).filter(
              (o): o is string => typeof o === "string",
            ),
          }));
      }
    } catch {
      // parse failed — will use fallback
    }

    if (!drills || drills.length === 0) {
      console.warn("[ai-drill] Could not parse AI response, using fallback");
      return NextResponse.json({
        ok: true,
        drills: fallbackDrills(body.value),
        fallback: true,
      });
    }

    return NextResponse.json({ ok: true, drills });
  } catch (error) {
    console.error("[ai-drill] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
