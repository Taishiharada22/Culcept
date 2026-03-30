// lib/genome/generateTalkSuggestion.ts
// 2人のGenomeデータからAI生成のトーク提案を作る

import { runAI } from "@/lib/ai";
import { getArchetypeDef } from "./archetypeThemes";

/**
 * 2人のアーキタイプから「この人と話してみたいこと」を生成
 */
export async function generateTalkSuggestion(params: {
  viewerArchetype: string | null;
  targetArchetype: string | null;
  targetCoreValue?: string | null;
  targetDilemma?: string | null;
}): Promise<string | null> {
  const targetDef = getArchetypeDef(params.targetArchetype);
  const viewerDef = getArchetypeDef(params.viewerArchetype);

  if (!targetDef) return null;

  const prompt = `
あなたは人間関係のファシリテーターです。
以下の2人が初めてカード交換をしました。閲覧者が相手のカードを見ています。
閲覧者が「この人と話してみたい」と思えるような、具体的な会話提案を1つ生成してください。

【相手のタイプ】
- ${targetDef.name} (${targetDef.englishName})
- 特徴: ${targetDef.tagline}
${params.targetCoreValue ? `- 大切にしていること: ${params.targetCoreValue}` : ""}
${params.targetDilemma ? `- 迷うとき: ${params.targetDilemma}` : ""}
${targetDef.midnightThought ? `- 深夜の独白: ${targetDef.midnightThought}` : ""}

${viewerDef ? `【閲覧者のタイプ】
- ${viewerDef.name} (${viewerDef.englishName})
- 特徴: ${viewerDef.tagline}` : "【閲覧者のタイプ】不明"}

【ルール】
- 20〜40文字の日本語で
- 「〜について聞いてみたい」「〜の話をしてみたい」のような形式
- 表面的な質問ではなく、相手の内面に触れる提案
- 具体的で、この2人の組み合わせだからこそ生まれる話題

【出力】
提案文のみを出力（引用符なし）
`.trim();

  try {
    const result = await runAI({
      taskType: "genome_talk_suggestion",
      userId: "system",
      prompt,
      maxOutputTokens: 100,
    });

    if (result.success && result.text) {
      return result.text.replace(/^[「『]|[」』]$/g, "").trim();
    }
    return null;
  } catch {
    return null;
  }
}
