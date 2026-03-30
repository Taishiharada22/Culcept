import "server-only";

import { runAI } from "@/lib/ai";
import { supabaseServer } from "@/lib/supabase/server";
import type { PreConnectionBriefing } from "./types";
import type { RendezvousCategory } from "../types";

// ============================================================
// ブリーフィングジェネレーター
// 接続開始前に AI がブリーフィングを生成する
// ============================================================

type GenerateBriefingParams = {
  candidateId: string;
  userId: string;
};

type StargazerProfile = {
  userId: string;
  axisScores: Record<string, number>;
  resolvedType: string | null;
};

type AIBriefingOutput = {
  counterpartTraits: Array<{ trait: string; advice: string }>;
  suggestedTopics: string[];
  openingAdvice: string;
  awarenessPoints: string[];
  categorySpecificAdvice: string | null;
};

const BRIEFING_SCHEMA = {
  type: "object",
  properties: {
    counterpartTraits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          trait: { type: "string" },
          advice: { type: "string" },
        },
        required: ["trait", "advice"],
      },
    },
    suggestedTopics: {
      type: "array",
      items: { type: "string" },
    },
    openingAdvice: { type: "string" },
    awarenessPoints: {
      type: "array",
      items: { type: "string" },
    },
    categorySpecificAdvice: { type: "string", nullable: true },
  },
  required: [
    "counterpartTraits",
    "suggestedTopics",
    "openingAdvice",
    "awarenessPoints",
    "categorySpecificAdvice",
  ],
} as const;

const CATEGORY_LABELS: Record<RendezvousCategory, string> = {
  romantic: "恋愛・パートナー",
  friendship: "友情・仲間",
  cocreation: "共創・ビジネス",
  community: "コミュニティ",
  partner: "パートナーシップ",
};

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

export async function generateBriefing(
  params: GenerateBriefingParams,
): Promise<PreConnectionBriefing> {
  const { candidateId, userId } = params;
  const supabase = await supabaseServer();

  // 1. Candidate 行を取得
  const { data: candidate } = await supabase
    .from("rendezvous_candidates")
    .select(
      "user_a, user_b, category, reason_codes, reason_texts, caution_codes, caution_texts, a_to_b_score, b_to_a_score",
    )
    .eq("id", candidateId)
    .single();

  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }

  const counterpartUserId =
    candidate.user_a === userId ? candidate.user_b : candidate.user_a;
  const categoryLabel =
    CATEGORY_LABELS[(candidate.category as RendezvousCategory) ?? "romantic"];

  // 2. 両者の Stargazer プロフィールを取得
  const [selfProfile, counterpartProfile] = await Promise.all([
    fetchStargazerProfile(supabase, userId),
    fetchStargazerProfile(supabase, counterpartUserId),
  ]);

  // 3. AI ブリーフィング生成
  const prompt = buildBriefingPrompt({
    selfProfile,
    counterpartProfile,
    category: candidate.category as RendezvousCategory,
    categoryLabel,
    reasonCodes: (candidate.reason_codes ?? []) as string[],
    reasonTexts: (candidate.reason_texts ?? []) as string[],
    cautionCodes: (candidate.caution_codes ?? []) as string[],
    cautionTexts: (candidate.caution_texts ?? []) as string[],
  });

  const aiResult = await runAI({
    taskType: "rendezvous_briefing",
    prompt,
    systemPrompt: `あなたは Aneurasync の AI カウンセラーです。
接続を始めるユーザーに向けて、相手の傾向を踏まえたブリーフィングを作成します。
相手の特徴はポジティブに表現し、注意点もネガティブにならないよう配慮します。
全て日本語で出力してください。`,
    jsonSchema: BRIEFING_SCHEMA as unknown as Record<string, unknown>,
    requireJson: true,
    temperature: 0.7,
    userId,
  });

  let aiOutput: AIBriefingOutput;
  try {
    aiOutput = (
      aiResult.structured
        ? aiResult.structured
        : JSON.parse(aiResult.text)
    ) as AIBriefingOutput;
  } catch {
    aiOutput = {
      counterpartTraits: [
        {
          trait: "自分のペースを大切にする方です",
          advice: "最初は少しゆっくり目に会話を進めると、心地よい距離感が生まれます。",
        },
        {
          trait: "感覚的な表現が得意な方です",
          advice: "具体的なエピソードや感じたことを共有すると、会話が深まりやすいです。",
        },
      ],
      suggestedTopics: [
        "最近心が動いた出来事",
        "休日の過ごし方",
        "好きな場所やお店",
      ],
      openingAdvice:
        "最初の15分は、お互いの雰囲気を感じる時間だと思ってリラックスしてみてください。",
      awarenessPoints: [
        "沈黙があっても焦らなくて大丈夫。相手も同じように感じているかもしれません。",
      ],
      categorySpecificAdvice: null,
    };
  }

  const briefing: PreConnectionBriefing = {
    id: "", // DB 挿入後に上書き
    candidateId,
    userId,
    counterpartTraits: aiOutput.counterpartTraits,
    suggestedTopics: aiOutput.suggestedTopics,
    openingAdvice: aiOutput.openingAdvice,
    awarenessPoints: aiOutput.awarenessPoints,
    categorySpecificAdvice: aiOutput.categorySpecificAdvice,
    createdAt: new Date().toISOString(),
  };

  // 4. DB に保存
  const { data: inserted } = await supabase
    .from("rendezvous_pre_briefings")
    .insert({
      candidate_id: candidateId,
      user_id: userId,
      briefing_data: {
        counterpartTraits: aiOutput.counterpartTraits,
        suggestedTopics: aiOutput.suggestedTopics,
        openingAdvice: aiOutput.openingAdvice,
        awarenessPoints: aiOutput.awarenessPoints,
        categorySpecificAdvice: aiOutput.categorySpecificAdvice,
      },
    })
    .select("id")
    .single();

  if (inserted) {
    briefing.id = inserted.id;
  }

  return briefing;
}

// ---------- 内部ヘルパー ----------

function buildBriefingPrompt(params: {
  selfProfile: StargazerProfile | null;
  counterpartProfile: StargazerProfile | null;
  category: RendezvousCategory;
  categoryLabel: string;
  reasonCodes: string[];
  reasonTexts: string[];
  cautionCodes: string[];
  cautionTexts: string[];
}): string {
  const {
    selfProfile,
    counterpartProfile,
    category,
    categoryLabel,
    reasonCodes,
    reasonTexts,
    cautionCodes,
    cautionTexts,
  } = params;

  const selfType = selfProfile?.resolvedType ?? "未判定";
  const selfAxes = selfProfile
    ? JSON.stringify(selfProfile.axisScores, null, 2)
    : "（未取得）";

  const counterpartType = counterpartProfile?.resolvedType ?? "未判定";
  const counterpartAxes = counterpartProfile
    ? JSON.stringify(counterpartProfile.axisScores, null, 2)
    : "（未取得）";

  return `
## タスク
接続開始前のブリーフィングを生成してください。

## 接続カテゴリ
${categoryLabel}（${category}）

## マッチング評価
- 理由: ${reasonTexts.join("、") || reasonCodes.join(", ") || "なし"}
- 注意: ${cautionTexts.join("、") || cautionCodes.join(", ") || "なし"}

## あなた（ブリーフィングを受ける側）
- タイプ: ${selfType}
- 軸スコア: ${selfAxes}

## 相手
- タイプ: ${counterpartType}
- 軸スコア: ${counterpartAxes}

## 出力ルール
- counterpartTraits: 相手の傾向を2-3個、それぞれにアドバイスを添える（ポジティブに）
- suggestedTopics: 3-5個の会話トピック（両者が反応しやすいもの）
- openingAdvice: 最初の15分のアドバイス（1-2文）
- awarenessPoints: 注意点1-2個（ネガティブにならない表現で）
- categorySpecificAdvice: カテゴリ別アドバイス（${categoryLabel}の文脈で、null可）
- 全て日本語で出力
`.trim();
}
