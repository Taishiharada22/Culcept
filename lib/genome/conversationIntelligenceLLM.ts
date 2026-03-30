// lib/genome/conversationIntelligenceLLM.ts
// Gemini LLM で高品質な会話インサイトを生成
// runAI() 経由で自動的に teacher_outputs に蓄積 → student LLM が学習 → 品質到達で昇格
//
// フォールバック: LLM失敗時はルールベース (conversationIntelligence.ts) に退避

import type { GenomeCardData } from "./cardTypes";
import { generateConversationInsights as generateRuleBased, type ConversationInsight } from "./conversationIntelligence";

const TASK_TYPE = "talk_conversation_insight";

/** LLMから返されるJSON構造 */
interface LLMInsightResponse {
  communicationStyle: { label: string; hint: string };
  landmines: string[];
  bestCompliment: string;
  moodHint: string | null;
  deepeningTopics: string[];
  resonancePoints: string[];
}

/**
 * Gemini LLM で会話インサイトを生成
 * runAI() 経由なので自動的に:
 *   1. ai_runs テーブルにログ保存
 *   2. teacher_outputs に教師出力保存（student学習用）
 *   3. semantic_cache でキャッシュ
 */
export async function generateConversationInsightsLLM(
  theirCard: GenomeCardData,
  myCard?: GenomeCardData | null,
): Promise<ConversationInsight> {
  // ルールベースをフォールバックとして常に用意
  const fallback = generateRuleBased(theirCard, myCard);

  try {
    // 動的import（サーバーサイドのみ）
    const { runAI } = await import("@/lib/ai");

    const theirRadar = theirCard.cardBack?.radarAxes;
    const myRadar = myCard?.cardBack?.radarAxes;
    const theirArchetype = theirCard.archetypeLabel ?? "不明";
    const theirStrengths = theirCard.cardBack?.strengths?.join("、") ?? "";
    const theirDilemma = theirCard.cardFront?.dilemma ?? "";
    const theirMidnight = theirCard.cardBack?.midnightThought ?? "";
    const theirLovePattern = theirCard.cardBack?.lovePattern ?? "";
    const theirStress = theirCard.cardBack?.stressResponse ?? "";

    const hour = new Date().getHours();
    const timeContext = hour >= 23 || hour < 5 ? "深夜" : hour >= 7 && hour < 10 ? "朝" : hour >= 12 && hour < 14 ? "昼休み" : hour >= 17 && hour < 20 ? "夕方" : "日中";

    const prompt = `あなたはAneurasyncの会話インテリジェンスエンジンです。
2人のユーザーのパーソナリティデータから、会話を豊かにするインサイトを生成してください。

## 相手のプロフィール
- アーキタイプ: ${theirArchetype}
- 5軸レーダー: ${theirRadar ? `分析${theirRadar.analytical} 慎重${theirRadar.cautious} 社交${theirRadar.social} 表現${theirRadar.expressive} 自律${theirRadar.independent}` : "未取得"}
- 強み: ${theirStrengths || "未取得"}
- 内なる矛盾: ${theirDilemma || "未取得"}
- 深夜の独白: ${theirMidnight || "未取得"}
- 恋愛パターン: ${theirLovePattern || "未取得"}
- ストレス時: ${theirStress || "未取得"}

## 自分のプロフィール
- 5軸レーダー: ${myRadar ? `分析${myRadar.analytical} 慎重${myRadar.cautious} 社交${myRadar.social} 表現${myRadar.expressive} 自律${myRadar.independent}` : "未取得"}

## 現在の時間帯: ${timeContext}

## 生成してほしいもの
1. communicationStyle: この人にはどう話すのが効果的か（label: 2-3文字のタイプ名, hint: 具体的なアドバイス1-2文）
2. landmines: この人に言ってはいけないこと（最大2つ、具体的に）
3. bestCompliment: この人が一番嬉しい褒め方（1文）
4. moodHint: 今の時間帯(${timeContext})×性格パターンから推測する気分（1文。推測不能ならnull）
5. deepeningTopics: 会話を深めるための話題提案（最大2つ、「〜してみて」形式）
6. resonancePoints: 2人の共通点または補完関係（最大2つ）

## 重要
- 占いのような曖昧な言い方はしない。具体的に
- 「〜かもしれない」より「〜の傾向がある」
- 相手を分析対象としてではなく、人間として扱うトーン
- 日本語で`;

    const result = await runAI({
      taskType: TASK_TYPE,
      prompt,
      requireJson: true,
      jsonSchema: {
        type: "object",
        properties: {
          communicationStyle: {
            type: "object",
            properties: {
              label: { type: "string" },
              hint: { type: "string" },
            },
            required: ["label", "hint"],
          },
          landmines: { type: "array", items: { type: "string" } },
          bestCompliment: { type: "string" },
          moodHint: { type: ["string", "null"] },
          deepeningTopics: { type: "array", items: { type: "string" } },
          resonancePoints: { type: "array", items: { type: "string" } },
        },
        required: ["communicationStyle", "landmines", "bestCompliment", "deepeningTopics", "resonancePoints"],
      },
      maxOutputTokens: 500,
      temperature: 0.7,
      userId: myCard?.userId ?? "system",
      metadata: {
        theirArchetype,
        theirUserId: theirCard.userId,
        timeContext,
      },
    });

    if (result.success && result.structured) {
      const llm = result.structured as unknown as LLMInsightResponse;
      return {
        communicationStyle: llm.communicationStyle ?? fallback.communicationStyle,
        landmines: llm.landmines?.slice(0, 3) ?? fallback.landmines,
        bestCompliment: llm.bestCompliment ?? fallback.bestCompliment,
        moodHint: llm.moodHint ?? fallback.moodHint,
        deepeningTopics: llm.deepeningTopics?.slice(0, 3) ?? fallback.deepeningTopics,
        resonancePoints: llm.resonancePoints?.slice(0, 3) ?? fallback.resonancePoints,
      };
    }

    // LLM失敗 → ルールベースフォールバック
    return fallback;
  } catch {
    // import失敗（クライアントサイド等）→ ルールベースフォールバック
    return fallback;
  }
}
