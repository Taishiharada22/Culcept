"use server";

import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "./studentTrack";

export interface FreeTextAnalysis {
  emotion:
    | "joy"
    | "sadness"
    | "anger"
    | "fear"
    | "surprise"
    | "disgust"
    | "trust"
    | "neutral";
  emotionIntensity: number; // 0-1
  themes: string[]; // up to 3 theme keywords
  contradictionWithSession: {
    detected: boolean;
    explanation: string | null; // null if no contradiction
  };
  hiddenSignal: string | null; // what the text reveals that the user might not intend
}

/**
 * Analyze free text input from daily observation
 * Uses AI to extract emotion, themes, and contradictions
 */
export async function analyzeFreeText(
  text: string,
  sessionScores: { axis: string; score: number; label: string }[],
  userId: string,
): Promise<FreeTextAnalysis> {
  // Don't analyze very short text
  if (text.trim().length < 3) {
    return {
      emotion: "neutral",
      emotionIntensity: 0,
      themes: [],
      contradictionWithSession: { detected: false, explanation: null },
      hiddenSignal: null,
    };
  }

  const scoreContext =
    sessionScores.length > 0
      ? `今日の観測スコア:\n${sessionScores.map((s) => `- ${s.label}: ${s.score > 0 ? "ポジティブ寄り" : s.score < 0 ? "ネガティブ寄り" : "中立"} (${s.score.toFixed(2)})`).join("\n")}`
      : "今日の観測スコアなし";

  const systemPrompt = `あなたは深層観測のテキスト分析エンジンです。ユーザーの自由記述テキストから、表層的な感情だけでなく、本人が無自覚な内面の動きを観測・抽出します。

## 分析の原則
- 「占い」ではなく「観測に基づく発見」として分析する
- テキストの言葉選び・語気・省略された部分にも注目する
- 今日の観測スコアとテキスト内容に矛盾がある場合、それは重要なシグナル
- hiddenSignal は「本人が書いていないが、テキストが暗に示していること」を具体的に記述する
- 曖昧な分析は避け、テキストの具体的な表現を根拠にする
- 高校生〜40代の日本人が自然に受け取れる表現で書く。ポエティックすぎず、地に足のついた言葉で

JSONで回答してください。`;

  const prompt = `以下のテキストを分析してください。

テキスト: "${text.slice(0, 200)}"

${scoreContext}

以下のJSON形式で回答:
{
  "emotion": "joy|sadness|anger|fear|surprise|disgust|trust|neutral のいずれか",
  "emotionIntensity": 0.0-1.0の数値,
  "themes": ["テーマ1", "テーマ2"] // 最大3つのキーワード,
  "contradictionDetected": true/false,
  "contradictionExplanation": "矛盾がある場合の説明（日本語）、なければnull",
  "hiddenSignal": "テキストが暗に示しているが本人は意識していないこと（日本語）、なければnull"
}`;

  try {
    const result = await runAI({
      taskType: "stargazer_free_text_analysis",
      prompt,
      systemPrompt,
      requireJson: true,
      temperature: 0.3,
      maxOutputTokens: 300,
      userId,
      metadata: makeStargazerRunMetadata({ feature: "free_text_analyzer" }),
    });

    if (result.success && result.structured) {
      const j = result.structured as Record<string, unknown>;
      return {
        emotion: validateEmotion(j.emotion as string),
        emotionIntensity: Math.max(
          0,
          Math.min(1, Number(j.emotionIntensity) || 0.5),
        ),
        themes: Array.isArray(j.themes)
          ? (j.themes as string[]).slice(0, 3).map((t) => String(t).slice(0, 30))
          : [],
        contradictionWithSession: {
          detected: Boolean(j.contradictionDetected),
          explanation: j.contradictionExplanation
            ? String(j.contradictionExplanation).slice(0, 200)
            : null,
        },
        hiddenSignal: j.hiddenSignal
          ? String(j.hiddenSignal).slice(0, 200)
          : null,
      };
    }
  } catch (e) {
    console.warn("[freeTextAnalyzer] AI failed:", e);
  }

  // Fallback: simple keyword-based analysis
  return fallbackAnalysis(text);
}

const VALID_EMOTIONS = [
  "joy",
  "sadness",
  "anger",
  "fear",
  "surprise",
  "disgust",
  "trust",
  "neutral",
] as const;

function validateEmotion(e: string): FreeTextAnalysis["emotion"] {
  if (VALID_EMOTIONS.includes(e as (typeof VALID_EMOTIONS)[number])) {
    return e as FreeTextAnalysis["emotion"];
  }
  return "neutral";
}

function fallbackAnalysis(text: string): FreeTextAnalysis {
  const positiveWords = [
    "嬉しい",
    "楽しい",
    "良い",
    "最高",
    "充実",
    "ありがとう",
    "幸せ",
  ];
  const negativeWords = [
    "疲れ",
    "しんどい",
    "辛い",
    "不安",
    "心配",
    "嫌",
    "ダメ",
    "重い",
    "無理",
  ];
  const angerWords = ["イラ", "腹立", "ムカ", "許せ"];

  let emotion: FreeTextAnalysis["emotion"] = "neutral";
  let intensity = 0.3;

  if (positiveWords.some((w) => text.includes(w))) {
    emotion = "joy";
    intensity = 0.6;
  }
  if (negativeWords.some((w) => text.includes(w))) {
    emotion = "sadness";
    intensity = 0.6;
  }
  if (angerWords.some((w) => text.includes(w))) {
    emotion = "anger";
    intensity = 0.7;
  }

  return {
    emotion,
    emotionIntensity: intensity,
    themes: [],
    contradictionWithSession: { detected: false, explanation: null },
    hiddenSignal: null,
  };
}
