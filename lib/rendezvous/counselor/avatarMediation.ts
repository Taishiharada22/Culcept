import "server-only";

import { runAI } from "@/lib/ai";
import { supabaseServer } from "@/lib/supabase/server";
import type { AvatarIntroduction } from "./types";

// ============================================================
// アバター仲介エンジン
// 分身が代わりに挨拶を送る、アバター先行型の導入システム
// ============================================================

type GenerateAvatarIntroParams = {
  candidateId: string;
  fromUserId: string;
  toUserId: string;
};

type StargazerProfile = {
  userId: string;
  axisScores: Record<string, number>;
  resolvedType: string | null;
};

type AIAvatarIntroOutput = {
  avatarMessage: string;
  suggestedTopics: string[];
};

const AVATAR_INTRO_SCHEMA = {
  type: "object",
  properties: {
    avatarMessage: { type: "string" },
    suggestedTopics: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["avatarMessage", "suggestedTopics"],
} as const;

async function fetchStargazerProfile(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
): Promise<StargazerProfile | null> {
  const { data } = await supabase
    .from("stargazer_profiles")
    .select("user_id, axis_scores, resolved_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;
  return {
    userId: data.user_id,
    axisScores: (data.axis_scores ?? {}) as Record<string, number>,
    resolvedType: data.resolved_type ?? null,
  };
}

export async function generateAvatarIntro(
  params: GenerateAvatarIntroParams,
): Promise<AvatarIntroduction> {
  const { candidateId, fromUserId, toUserId } = params;
  const supabase = await supabaseServer();

  // 1. 両者のプロフィールを取得
  const [fromProfile, toProfile] = await Promise.all([
    fetchStargazerProfile(supabase, fromUserId),
    fetchStargazerProfile(supabase, toUserId),
  ]);

  // 2. Candidate データから相性ポイントを取得
  const { data: candidate } = await supabase
    .from("rendezvous_candidates")
    .select("reason_codes, reason_texts, category")
    .eq("id", candidateId)
    .maybeSingle();

  const reasonTexts = (candidate?.reason_texts ?? []) as string[];
  const compatibilityPoint =
    reasonTexts[0] ?? "お互いの感性に共鳴するところがありそうです";

  // 3. AI でアバターメッセージを生成
  const prompt = buildAvatarIntroPrompt({
    fromProfile,
    toProfile,
    compatibilityPoint,
    category: (candidate?.category as string) ?? "romantic",
  });

  const aiResult = await runAI({
    taskType: "rendezvous_avatar_intro",
    prompt,
    systemPrompt: `あなたはユーザーの分身（アバター）として、相手のアバターに挨拶メッセージを送ります。
一人称は「わたし」で、「〜の分身として」という立場で話します。
温かく、自然で、フォーマルすぎない丁寧な言葉遣いを心がけてください。
全て日本語で出力してください。`,
    jsonSchema: AVATAR_INTRO_SCHEMA as unknown as Record<string, unknown>,
    requireJson: true,
    temperature: 0.8,
    userId: fromUserId,
  });

  let aiOutput: AIAvatarIntroOutput;
  try {
    aiOutput = (
      aiResult.structured
        ? aiResult.structured
        : JSON.parse(aiResult.text)
    ) as AIAvatarIntroOutput;
  } catch {
    aiOutput = {
      avatarMessage: `はじめまして。わたしの本人の分身として、ご挨拶させてください。${compatibilityPoint}と感じて、お声がけしました。よろしければ、お話しませんか？`,
      suggestedTopics: [
        "最近感動したこと",
        "好きな過ごし方",
      ],
    };
  }

  // メッセージが長すぎる場合は切り詰め
  const avatarMessage =
    aiOutput.avatarMessage.length > 200
      ? aiOutput.avatarMessage.slice(0, 197) + "..."
      : aiOutput.avatarMessage;

  const introduction: AvatarIntroduction = {
    id: "", // DB 挿入後に上書き
    candidateId,
    fromUserId,
    toUserId,
    mode: "avatar",
    avatarMessage,
    suggestedTopics: aiOutput.suggestedTopics.slice(0, 3),
    createdAt: new Date().toISOString(),
  };

  // 4. DB に保存
  const { data: inserted } = await supabase
    .from("rendezvous_avatar_introductions")
    .insert({
      candidate_id: candidateId,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      mode: "avatar",
      avatar_message: avatarMessage,
      suggested_topics: aiOutput.suggestedTopics.slice(0, 3),
    })
    .select("id")
    .single();

  if (inserted) {
    introduction.id = inserted.id;
  }

  return introduction;
}

// ---------- 内部ヘルパー ----------

function buildAvatarIntroPrompt(params: {
  fromProfile: StargazerProfile | null;
  toProfile: StargazerProfile | null;
  compatibilityPoint: string;
  category: string;
}): string {
  const { fromProfile, toProfile, compatibilityPoint, category } = params;

  const fromType = fromProfile?.resolvedType ?? "未判定";
  const toType = toProfile?.resolvedType ?? "未判定";

  // 共通する高スコア軸を見つける
  let sharedTraits = "";
  if (fromProfile && toProfile) {
    const fromHigh = Object.entries(fromProfile.axisScores)
      .filter(([, v]) => v >= 0.7)
      .map(([k]) => k);
    const toHigh = Object.entries(toProfile.axisScores)
      .filter(([, v]) => v >= 0.7)
      .map(([k]) => k);
    const shared = fromHigh.filter((k) => toHigh.includes(k));
    if (shared.length > 0) {
      sharedTraits = `共通して高い軸: ${shared.join(", ")}`;
    }
  }

  return `
## タスク
ユーザーの分身（アバター）として、相手のアバターへの最初の挨拶メッセージを生成してください。

## 送り手の情報
- タイプ: ${fromType}

## 受け手の情報
- タイプ: ${toType}

## 相性ポイント
${compatibilityPoint}
${sharedTraits}

## カテゴリ
${category}

## ルール
- avatarMessage は一人称「わたし」、「あなたの分身として、ご挨拶させてください」的な導入
- 温かく自然で、定型文っぽくない
- 具体的な相性ポイントを1つ参照する
- 2-3文以内に収める
- suggestedTopics は相手と話しやすそうなトピックを2-3個
- 全て日本語で出力
`.trim();
}
