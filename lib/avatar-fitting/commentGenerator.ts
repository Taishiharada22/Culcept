// lib/avatar-fitting/commentGenerator.ts
import "server-only";
import type { AvatarFittingResult } from "./types";
import type { DimensionScore } from "@/lib/aneurasync/dimensions";

function getApiKey(): string {
  return (process.env.GEMINI_API_KEY ?? "").trim();
}

export async function generateAvatarComment(
  result: AvatarFittingResult,
  personalityDimensions: DimensionScore[],
  userName?: string,
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) return generateFallbackComment(result);

  const nameLabel = userName ? `${userName}さん` : "あなた";
  const dimSummary = personalityDimensions
    .filter(d => d.confidence > 0.3)
    .slice(0, 5)
    .map(d => `${d.dimension}: ${d.score.toFixed(1)}`)
    .join(", ");

  const prompt = `あなたはユーザーの「分身」です。服の相性診断結果を、親しみやすい口調で1-2文で伝えてください。

ユーザー名: ${nameLabel}
総合スコア: ${result.overallMatch}/100 (${result.band})
サイズ: ${result.sizeScore.score}/100
カラー: ${result.colorScore.score}/100
ビジュアル: ${result.visualScore.score}/100
好み一致: ${result.preferenceScore.score}/100
${dimSummary ? `性格傾向: ${dimSummary}` : ""}
サイズの理由: ${result.sizeScore.reasons.join("、")}
カラーの理由: ${result.colorScore.reasons.join("、")}

ルール:
- 日本語で、カジュアルだけど失礼じゃない口調
- 具体的な強み・弱みに言及する
- 1-2文に収める（60文字以内推奨）
- 絵文字は使わない`;

  const model = "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${endpoint}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
      }),
      signal: controller.signal,
    });

    if (!response.ok) return generateFallbackComment(result);

    const raw = await response.json();
    const text = raw?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim() ?? "";

    return text || generateFallbackComment(result);
  } catch {
    return generateFallbackComment(result);
  } finally {
    clearTimeout(timer);
  }
}

export function generateFallbackComment(result: AvatarFittingResult): string {
  const weakest = [
    { name: "サイズ感", score: result.sizeScore.score },
    { name: "カラー", score: result.colorScore.score },
    { name: "スタイル", score: result.visualScore.score },
    { name: "好み", score: result.preferenceScore.score },
  ].sort((a, b) => a.score - b.score);

  const strongest = [...weakest].sort((a, b) => b.score - a.score);

  switch (result.band) {
    case "green":
      return "サイズ感も色味もバッチリ！自信持って着られるよ。";
    case "yellow":
      return `${weakest[0].name}が少し気になるけど、${strongest[0].name}は合ってる！`;
    case "red":
      return `${weakest[0].name}が合わなさそう。別のアイテムの方がいいかも。`;
    default:
      return "判定データが足りないから、もう少し情報を教えて！";
  }
}
