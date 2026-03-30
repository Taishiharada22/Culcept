import "server-only";

import { runAI } from "@/lib/ai";
import { supabaseServer } from "@/lib/supabase/server";
import { evaluatePair } from "@/lib/rendezvous";
import { getUserTendencies } from "./tendencyTracker";
import type {
  TendencyInsight,
  NextSuggestion,
  TendencyPatternRow,
} from "./types";
import type {
  RendezvousCategory,
  RendezvousCardDTO,
  RendezvousPreferences,
  RendezvousProfile,
} from "../types";

// ============================================================
// 次の候補提案エンジン
// 切断から学んだ傾向を踏まえて、次の最適な候補を提案する
// ============================================================

type FindNextSuggestionParams = {
  userId: string;
  tendencyInsight: TendencyInsight;
  category?: RendezvousCategory;
};

type AISuggestionOutput = {
  whyThisPerson: string;
  addressesTendency: string;
  counselorMessage: string;
};

const SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    whyThisPerson: { type: "string" },
    addressesTendency: { type: "string" },
    counselorMessage: { type: "string" },
  },
  required: ["whyThisPerson", "addressesTendency", "counselorMessage"],
} as const;

export async function findNextSuggestion(
  params: FindNextSuggestionParams,
): Promise<NextSuggestion | null> {
  const { userId, tendencyInsight, category } = params;
  const supabase = await supabaseServer();

  // 1. ユーザーの傾向パターンを取得
  const tendencies = await getUserTendencies(userId);

  // 2. 既存候補を取得（除外用）
  const { data: existingCandidates } = await supabase
    .from("rendezvous_candidates")
    .select("user_a, user_b, state")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  const excludedUserIds = new Set<string>();
  excludedUserIds.add(userId);
  for (const c of existingCandidates ?? []) {
    // active/blocked 状態の候補の相手を除外
    if (
      ["candidate_generated", "delivered", "a_liked", "b_liked", "mutual_liked", "chat_opened"].includes(
        c.state,
      )
    ) {
      excludedUserIds.add(c.user_a === userId ? c.user_b : c.user_a);
    }
  }

  // 3. ユーザーの Profile + Preferences を取得
  const [{ data: selfProfile }, { data: selfPrefs }] = await Promise.all([
    supabase
      .from("rendezvous_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("rendezvous_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!selfPrefs || !selfProfile) {
    console.warn("[counselor/nextSuggestion] No profile/preferences found for user:", userId);
    return null;
  }

  // 4. 対象カテゴリの候補ユーザーを取得
  const targetCategories = category
    ? [category]
    : (selfPrefs.desired_relation_types as RendezvousCategory[] ?? ["romantic"]);

  const { data: eligibleProfiles } = await supabase
    .from("rendezvous_profiles")
    .select("*")
    .eq("is_enabled", true)
    .eq("is_paused", false)
    .not("user_id", "in", `(${Array.from(excludedUserIds).join(",")})`)
    .limit(50);

  if (!eligibleProfiles || eligibleProfiles.length === 0) {
    return null;
  }

  // 5. 各候補を評価してスコアリング
  type ScoredCandidate = {
    userId: string;
    score: number;
    reasonCodes: string[];
    cautionCodes: string[];
  };

  const scoredCandidates: ScoredCandidate[] = [];

  for (const otherProfile of eligibleProfiles) {
    const { data: otherPrefs } = await supabase
      .from("rendezvous_preferences")
      .select("*")
      .eq("user_id", otherProfile.user_id)
      .maybeSingle();

    if (!otherPrefs) continue;

    try {
      const selfPrefsTyped = selfPrefs as RendezvousPreferences;
      const otherPrefsTyped = otherPrefs as RendezvousPreferences;

      const evalResult = evaluatePair({
        profileA: selfProfile as RendezvousProfile,
        profileB: otherProfile as RendezvousProfile,
        preferencesA: selfPrefsTyped,
        preferencesB: otherPrefsTyped,
        vectorA: selfPrefsTyped.matching_vector,
        vectorB: otherPrefsTyped.matching_vector,
      });

      if (!evalResult.mutual || evalResult.overallScore === null) continue;

      // 傾向に基づくボーナススコアを計算
      const tendencyBonus = calculateTendencyBonus(
        evalResult.cautionCodes as string[],
        evalResult.reasonCodes as string[],
        tendencies,
        tendencyInsight,
      );

      scoredCandidates.push({
        userId: otherProfile.user_id,
        score: evalResult.overallScore + tendencyBonus,
        reasonCodes: evalResult.reasonCodes as string[],
        cautionCodes: evalResult.cautionCodes as string[],
      });
    } catch {
      // 評価失敗は無視
    }
  }

  if (scoredCandidates.length === 0) {
    return null;
  }

  // スコア降順でソート
  scoredCandidates.sort((a, b) => b.score - a.score);
  const bestCandidate = scoredCandidates[0];

  // 6. 候補のプロフィールを取得
  const { data: candidateProfile } = await supabase
    .from("rendezvous_profiles")
    .select("display_name, avatar_asset_url, public_mood_summary, public_style_summary")
    .eq("user_id", bestCandidate.userId)
    .maybeSingle();

  // 7. AI で提案メッセージを生成
  const prompt = buildSuggestionPrompt(tendencyInsight, tendencies, bestCandidate.reasonCodes);

  const aiResult = await runAI({
    taskType: "rendezvous_next_suggestion",
    prompt,
    systemPrompt:
      "あなたは Aneurasync の AI カウンセラーです。温かく寄り添いながら、次の接続候補を提案します。「ちょっと待ってね」「この方はどうかな？」という親しみのあるトーンで話します。",
    jsonSchema: SUGGESTION_SCHEMA as unknown as Record<string, unknown>,
    requireJson: true,
    temperature: 0.7,
    userId,
  });

  let aiOutput: AISuggestionOutput;
  try {
    aiOutput = (
      aiResult.structured
        ? aiResult.structured
        : JSON.parse(aiResult.text)
    ) as AISuggestionOutput;
  } catch {
    aiOutput = {
      whyThisPerson:
        "前回の接続で見えた傾向を踏まえると、この方とはより自然なリズムで関われる可能性があります。",
      addressesTendency:
        "お互いのペースを尊重し合える関係性が期待できます。",
      counselorMessage:
        "ちょっと待ってね...探してみたの。この方はどうかな？前回とは少し違う雰囲気だけど、あなたに合うかもしれない。",
    };
  }

  const card: RendezvousCardDTO = {
    candidateId: "", // まだ候補レコードは作成していない
    state: "unseen",
    category: category ?? targetCategories[0],
    syncPercent: Math.round(bestCandidate.score),
    label: "",
    reasons: bestCandidate.reasonCodes.slice(0, 3),
    caution: bestCandidate.cautionCodes[0] ?? null,
    counterpart: {
      displayName: candidateProfile?.display_name ?? "匿名のアバター",
      avatarUrl: candidateProfile?.avatar_asset_url ?? null,
      publicMoodSummary: candidateProfile?.public_mood_summary ?? null,
      publicStyleSummary: candidateProfile?.public_style_summary ?? null,
    },
    deliveredAt: null,
  };

  return {
    card,
    whyThisPerson: aiOutput.whyThisPerson,
    addressesTendency: aiOutput.addressesTendency,
    counselorMessage: aiOutput.counselorMessage,
  };
}

// ---------- 内部ヘルパー ----------

function calculateTendencyBonus(
  cautionCodes: string[],
  reasonCodes: string[],
  tendencies: TendencyPatternRow[],
  tendencyInsight: TendencyInsight,
): number {
  let bonus = 0;

  // 過去の傾向に関連する caution が少ない候補にボーナス
  const tendencyAxesList = tendencyInsight.relatedAxes.map((a) =>
    a.toLowerCase(),
  );

  // 過去のパターンキーに含まれる caution コードを収集
  const problematicCautions = new Set(
    tendencies.map((t) => t.pattern_key.split("_")[0]),
  );

  // この候補が過去の問題パターンの caution を持っていない場合ボーナス
  const hasProblematicCaution = cautionCodes.some((c) =>
    problematicCautions.has(c),
  );
  if (!hasProblematicCaution) {
    bonus += 5;
  }

  // 関連軸に対応する reason コードがある場合ボーナス
  for (const reason of reasonCodes) {
    const reasonLower = reason.toLowerCase();
    for (const axis of tendencyAxesList) {
      if (reasonLower.includes(axis) || axis.includes(reasonLower)) {
        bonus += 3;
        break;
      }
    }
  }

  return bonus;
}

function buildSuggestionPrompt(
  tendencyInsight: TendencyInsight,
  tendencies: TendencyPatternRow[],
  candidateReasonCodes: string[],
): string {
  const topPatterns = tendencies
    .slice(0, 3)
    .map(
      (t) =>
        `- ${(t.pattern_data as Record<string, unknown>)?.tendency ?? t.pattern_key}（${t.occurrence_count}回）`,
    )
    .join("\n");

  return `
## タスク
切断後のユーザーに、次の接続候補を提案するメッセージを生成してください。

## ユーザーの傾向
${tendencyInsight.tendency}
${tendencyInsight.explanation}

## 過去のパターン
${topPatterns || "（初回の切断）"}

## 新しい候補の特徴
- マッチング理由: ${candidateReasonCodes.join(", ")}

## 出力ルール
- whyThisPerson: なぜこの人が合うかの説明（1-2文、具体的に）
- addressesTendency: 前回の傾向をどう解消するか（1文）
- counselorMessage: カウンセラーとしてのメッセージ（2-3文、「ちょっと待ってね」的な温かいトーン）
- 全て日本語で出力
- 否定的な表現は使わない
`.trim();
}
