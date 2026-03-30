import "server-only";

import { runAI } from "@/lib/ai";
import type { PartnerScoringResult } from "../partnerScoring";
import { partnerReasonTextMap, partnerCautionTextMap } from "../partnerScoring";
import type { LifePlanProfile } from "../lifePlanVector";
import { getLifePlanDigest } from "../lifePlanVector";
import type { RelationshipProcessVector } from "../relationshipProcess";
import type { PreConnectionBriefing } from "./types";

// ============================================================
// Partner Counselor — 結婚相談所レベルの AI カウンセリング
//
// 既存の AI Counselor（切断分析、ブリーフィング、成長追跡）を
// Partner 枠専用に拡張。3層統合スコアの詳細を踏まえた
// 具体的・実践的なアドバイスを生成する。
//
// 既存結婚相談所の「仲人」が提供する価値:
// 1. 相手の人となりの事前説明 → ブリーフィング拡張
// 2. 相性の根拠説明 → 3層スコア解説
// 3. デート後のフォローアップ → ポストレビュー拡張
// 4. 長期傾向の分析 → 成長追跡拡張
// 5. 次の候補の的確な提案 → 次候補提案の精度向上
//
// Aneurasync の差別化:
// - 45軸 × 8軸 × 6軸 = 科学的根拠に基づくアドバイス
// - 仲人の勘 → データに基づく構造的分析
// - 月1回の面談 → リアルタイムフィードバック
// ============================================================

// ── 型定義 ──

/**
 * Partner 枠専用ブリーフィング（既存の PreConnectionBriefing を拡張）
 */
export type PartnerBriefing = PreConnectionBriefing & {
  /** 3層統合スコアの解説 */
  compatibilityInsight: CompatibilityInsight;
  /** 人生設計面での一致・注意点 */
  lifePlanInsight: LifePlanInsight;
  /** 関係プロセスのアドバイス */
  processAdvice: ProcessAdvice;
  /** 初回デートで話すべきテーマ */
  firstDateTopics: FirstDateTopic[];
  /** カウンセラーの総合メッセージ */
  counselorSummary: string;
};

export type CompatibilityInsight = {
  /** 総合相性の言語化（例: 「性格面は非常に高い相性です」） */
  overallSummary: string;
  /** 層別の解説 */
  layerSummaries: {
    personality: string;  // Layer 1
    relational: string;   // Layer 1.5
    lifePlan: string;     // Layer 2
  };
  /** 最も強い一致ポイント */
  strongestMatch: string;
  /** 最も注意が必要なポイント */
  biggestChallenge: string | null;
};

export type LifePlanInsight = {
  /** 一致している人生設計項目 */
  alignedAreas: Array<{
    area: string;
    description: string;
  }>;
  /** 話し合いが必要な項目 */
  needsDiscussion: Array<{
    area: string;
    description: string;
    /** 話し合うためのヒント */
    discussionTip: string;
  }>;
};

export type ProcessAdvice = {
  /** 葛藤が起きたときのアドバイス */
  conflictAdvice: string;
  /** 日常の接し方のアドバイス */
  dailyAdvice: string;
  /** 成長のための1つのポイント */
  growthTip: string;
};

export type FirstDateTopic = {
  topic: string;
  /** なぜこの話題が良いか */
  reason: string;
  /** 聞き方のサンプル */
  sampleQuestion: string;
};

// ── Partner ブリーフィング生成 ──

type GeneratePartnerBriefingParams = {
  candidateId: string;
  userId: string;
  counterpartUserId: string;
  partnerResult: PartnerScoringResult;
  selfLifePlan?: LifePlanProfile;
  counterpartLifePlan?: LifePlanProfile;
  selfStargazerType?: string;
  counterpartStargazerType?: string;
  existingReasonTexts: string[];
  existingCautionTexts: string[];
};

const PARTNER_BRIEFING_SCHEMA = {
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
    suggestedTopics: { type: "array", items: { type: "string" } },
    openingAdvice: { type: "string" },
    awarenessPoints: { type: "array", items: { type: "string" } },
    compatibilityInsight: {
      type: "object",
      properties: {
        overallSummary: { type: "string" },
        layerSummaries: {
          type: "object",
          properties: {
            personality: { type: "string" },
            relational: { type: "string" },
            lifePlan: { type: "string" },
          },
          required: ["personality", "relational", "lifePlan"],
        },
        strongestMatch: { type: "string" },
        biggestChallenge: { type: "string", nullable: true },
      },
      required: ["overallSummary", "layerSummaries", "strongestMatch", "biggestChallenge"],
    },
    lifePlanInsight: {
      type: "object",
      properties: {
        alignedAreas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              area: { type: "string" },
              description: { type: "string" },
            },
            required: ["area", "description"],
          },
        },
        needsDiscussion: {
          type: "array",
          items: {
            type: "object",
            properties: {
              area: { type: "string" },
              description: { type: "string" },
              discussionTip: { type: "string" },
            },
            required: ["area", "description", "discussionTip"],
          },
        },
      },
      required: ["alignedAreas", "needsDiscussion"],
    },
    processAdvice: {
      type: "object",
      properties: {
        conflictAdvice: { type: "string" },
        dailyAdvice: { type: "string" },
        growthTip: { type: "string" },
      },
      required: ["conflictAdvice", "dailyAdvice", "growthTip"],
    },
    firstDateTopics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          reason: { type: "string" },
          sampleQuestion: { type: "string" },
        },
        required: ["topic", "reason", "sampleQuestion"],
      },
    },
    counselorSummary: { type: "string" },
  },
  required: [
    "counterpartTraits", "suggestedTopics", "openingAdvice", "awarenessPoints",
    "compatibilityInsight", "lifePlanInsight", "processAdvice",
    "firstDateTopics", "counselorSummary",
  ],
} as const;

/**
 * Partner 枠専用のブリーフィングを生成
 *
 * 既存ブリーフィングの全フィールド + Partner 固有のインサイトを生成。
 * 3層統合スコアの詳細をプロンプトに渡し、科学的根拠に基づいた
 * 具体的・実践的なアドバイスを生成する。
 */
export async function generatePartnerBriefing(
  params: GeneratePartnerBriefingParams,
): Promise<PartnerBriefing> {
  const prompt = buildPartnerBriefingPrompt(params);

  const aiResult = await runAI({
    taskType: "rendezvous_partner_briefing",
    prompt,
    systemPrompt: PARTNER_COUNSELOR_SYSTEM_PROMPT,
    jsonSchema: PARTNER_BRIEFING_SCHEMA as unknown as Record<string, unknown>,
    requireJson: true,
    temperature: 0.65,
    userId: params.userId,
  });

  let aiOutput: Record<string, unknown>;
  try {
    aiOutput = (
      aiResult.structured
        ? aiResult.structured
        : JSON.parse(aiResult.text)
    ) as Record<string, unknown>;
  } catch {
    aiOutput = buildFallbackBriefing(params);
  }

  return {
    id: "",
    candidateId: params.candidateId,
    userId: params.userId,
    counterpartTraits: (aiOutput.counterpartTraits ?? []) as PreConnectionBriefing["counterpartTraits"],
    suggestedTopics: (aiOutput.suggestedTopics ?? []) as string[],
    openingAdvice: (aiOutput.openingAdvice ?? "") as string,
    awarenessPoints: (aiOutput.awarenessPoints ?? []) as string[],
    categorySpecificAdvice: null,
    compatibilityInsight: (aiOutput.compatibilityInsight ?? buildFallbackCompatibility()) as CompatibilityInsight,
    lifePlanInsight: (aiOutput.lifePlanInsight ?? { alignedAreas: [], needsDiscussion: [] }) as LifePlanInsight,
    processAdvice: (aiOutput.processAdvice ?? buildFallbackProcessAdvice()) as ProcessAdvice,
    firstDateTopics: (aiOutput.firstDateTopics ?? []) as FirstDateTopic[],
    counselorSummary: (aiOutput.counselorSummary ?? "おふたりの相性は良い基盤があります。自然体でお話してみてください。") as string,
    createdAt: new Date().toISOString(),
  };
}

// ── プロンプト構築 ──

const PARTNER_COUNSELOR_SYSTEM_PROMPT = `あなたは Aneurasync の AI パートナーカウンセラーです。
結婚を視野に入れた接続において、科学的データに基づいた的確で温かいアドバイスを提供します。

あなたの役割:
- 結婚相談所の仲人以上の精度で、相性の根拠を説明する
- Gottman研究、愛着理論、離婚予測因子を踏まえた実践的アドバイスを提供する
- ネガティブな表現を避け、課題も成長の機会として表現する
- 具体的で実行可能なアドバイスを提供する（「頑張りましょう」のような曖昧な表現は避ける）

出力ルール:
- 全て日本語で出力
- 専門用語は使わず、日常の言葉で表現する
- 各フィールドは1-3文で簡潔に
- firstDateTopics は 3-4 個`;

function buildPartnerBriefingPrompt(params: GeneratePartnerBriefingParams): string {
  const { partnerResult, existingReasonTexts, existingCautionTexts } = params;

  // 3層スコアの詳細
  const layerDetail = `
## 3層統合スコア
- 総合: ${(partnerResult.total * 100).toFixed(0)}%
- Layer 1 (性格互換性): ${(partnerResult.layer1Score * 100).toFixed(0)}%
- Layer 1.5 (関係プロセス): ${(partnerResult.layer15Score * 100).toFixed(0)}%
- Layer 2 (人生設計): ${(partnerResult.layer2Score * 100).toFixed(0)}%`;

  // Process Vector 詳細
  let processDetail = "";
  if (partnerResult.processVector) {
    const pv = partnerResult.processVector;
    processDetail = `
## 関係プロセス詳細
- Four Horsemen リスク: ${(pv.fourHorsemenRisk * 100).toFixed(0)}%（低いほど良い）
- 愛着互換性: ${(pv.attachmentFit * 100).toFixed(0)}%
- 葛藤スタイル一致: ${(pv.conflictStyleMatch * 100).toFixed(0)}%
- 修復能力: ${(pv.repairCapacity * 100).toFixed(0)}%
- Bid応答性: ${(pv.bidResponsiveness * 100).toFixed(0)}%
- 成長信念: ${(pv.growthVsDestiny * 100).toFixed(0)}%`;
  }

  // Life Plan 詳細
  let lifePlanDetail = "";
  if (partnerResult.lifePlanFit) {
    const lf = partnerResult.lifePlanFit;
    const aligned = lf.alignedDimensions.map((d) => d.replace(/_/g, " ")).join(", ");
    const risk = lf.riskDimensions.map((d) => d.replace(/_/g, " ")).join(", ");
    lifePlanDetail = `
## 人生設計適合度
- 総合: ${(lf.total * 100).toFixed(0)}%
- 強い一致: ${aligned || "なし"}
- 注意が必要: ${risk || "なし"}`;
  }

  // Self/Counterpart Life Plan Digest
  let selfDigest = "";
  let counterpartDigest = "";
  if (params.selfLifePlan) {
    const digest = getLifePlanDigest(params.selfLifePlan);
    selfDigest = `
## あなたの人生設計傾向
${digest.map((d) => `- ${d.label}: ${d.tendency === "left" ? d.leftLabel : d.tendency === "right" ? d.rightLabel : "中立"} (信頼度: ${(d.confidence * 100).toFixed(0)}%)`).join("\n")}`;
  }
  if (params.counterpartLifePlan) {
    const digest = getLifePlanDigest(params.counterpartLifePlan);
    counterpartDigest = `
## 相手の人生設計傾向
${digest.map((d) => `- ${d.label}: ${d.tendency === "left" ? d.leftLabel : d.tendency === "right" ? d.rightLabel : "中立"} (信頼度: ${(d.confidence * 100).toFixed(0)}%)`).join("\n")}`;
  }

  // Reason/Caution テキスト
  const partnerReasons = partnerResult.partnerReasonCodes
    .map((c) => partnerReasonTextMap[c])
    .filter(Boolean);
  const partnerCautions = partnerResult.partnerCautionCodes
    .map((c) => partnerCautionTextMap[c])
    .filter(Boolean);

  return `
## タスク
結婚を視野に入れたパートナー接続のブリーフィングを生成してください。

## マッチング評価
- 相性の理由: ${[...existingReasonTexts, ...partnerReasons].join("、") || "なし"}
- 注意点: ${[...existingCautionTexts, ...partnerCautions].join("、") || "なし"}
${layerDetail}
${processDetail}
${lifePlanDetail}
${selfDigest}
${counterpartDigest}

## あなた
- Stargazerタイプ: ${params.selfStargazerType ?? "未判定"}

## 相手
- Stargazerタイプ: ${params.counterpartStargazerType ?? "未判定"}

## 出力要件
- counterpartTraits: 相手の傾向2-3個（結婚生活の文脈でポジティブに表現）＋アドバイス
- suggestedTopics: 3-5個の初回会話トピック（結婚を意識しすぎない自然なもの）
- openingAdvice: 最初の対面のアドバイス（1-2文）
- awarenessPoints: 注意点1-3個（ネガティブにならない表現で、人生設計面含む）
- compatibilityInsight: 3層統合スコアを日常の言葉で解説
- lifePlanInsight: 人生設計の一致点と話し合いが必要な点
- processAdvice: 葛藤時・日常・成長のためのアドバイス
- firstDateTopics: 3-4個（topic, reason, sampleQuestion）
- counselorSummary: カウンセラーからの総合メッセージ（2-3文、温かく具体的に）
`.trim();
}

// ── フォールバック ──

function buildFallbackBriefing(params: GeneratePartnerBriefingParams): Record<string, unknown> {
  return {
    counterpartTraits: [
      { trait: "自分の価値観を大切にする方です", advice: "最初は共通点を見つけることから始めると、自然に会話が弾みます。" },
      { trait: "将来について考えを持っている方です", advice: "焦らず、お互いのペースで将来の話ができると良いですね。" },
    ],
    suggestedTopics: ["最近のこと", "休日の過ごし方", "好きな場所"],
    openingAdvice: "リラックスして、自然体でお話してみてください。結婚を意識しすぎず、まずはお互いを知ることから。",
    awarenessPoints: ["最初から全てを話す必要はありません。自然な流れで深まっていきます。"],
    compatibilityInsight: buildFallbackCompatibility(),
    lifePlanInsight: { alignedAreas: [], needsDiscussion: [] },
    processAdvice: buildFallbackProcessAdvice(),
    firstDateTopics: [
      { topic: "仕事のやりがい", reason: "価値観が見えやすい話題です", sampleQuestion: "お仕事で一番やりがいを感じるのはどんなときですか？" },
      { topic: "家族との思い出", reason: "家族観が自然に見える話題です", sampleQuestion: "子どもの頃、家族でよくしたことってありますか？" },
      { topic: "理想の休日", reason: "生活スタイルの相性が見えます", sampleQuestion: "何もない休日、どんなふうに過ごしたいですか？" },
    ],
    counselorSummary: "おふたりは良い基盤を持っています。自然体でお話してみてください。",
  };
}

function buildFallbackCompatibility(): CompatibilityInsight {
  return {
    overallSummary: "データを分析中です。会話を通じてさらに相性が見えてきます。",
    layerSummaries: {
      personality: "性格面の互換性は良好な基盤があります。",
      relational: "関係の築き方についてはこれから見えてくる部分もあります。",
      lifePlan: "人生設計の情報が揃い次第、より詳しい分析をお届けします。",
    },
    strongestMatch: "性格面での基本的な相性",
    biggestChallenge: null,
  };
}

function buildFallbackProcessAdvice(): ProcessAdvice {
  return {
    conflictAdvice: "意見が違うときは、まず相手の気持ちを聴いてから自分の考えを伝えると、建設的な対話になりやすいです。",
    dailyAdvice: "日常の小さな「ありがとう」を大切にすると、関係の土台が強くなります。",
    growthTip: "ふたりの関係は育てていくもの。困難があっても「一緒に解決しよう」という姿勢が大切です。",
  };
}

// ── Partner 専用: ポストデート分析 ──

export type PartnerPostDateAnalysis = {
  /** デート全体の印象 */
  overallImpression: string;
  /** 人生設計面で確認できたこと */
  lifePlanConfirmations: string[];
  /** まだ確認できていない重要項目 */
  lifePlanPending: string[];
  /** 次のステップへのアドバイス */
  nextStepAdvice: string;
  /** カウンセラーの見解 */
  counselorNote: string;
};

/**
 * Partner 専用のポストデート分析を生成
 *
 * ユーザーのレビューと3層スコアを踏まえて、
 * 次のステップへの具体的なアドバイスを提供する。
 */
export async function generatePartnerPostDateAnalysis(params: {
  userId: string;
  candidateId: string;
  feeling: string;
  freeText: string | null;
  partnerResult: PartnerScoringResult;
  dateNumber: number; // 何回目のデートか
}): Promise<PartnerPostDateAnalysis> {
  const { partnerResult, feeling, freeText, dateNumber } = params;

  const prompt = `
## タスク
パートナー枠の${dateNumber}回目のデート後の分析を生成してください。

## ユーザーの感想
- 印象: ${feeling}
- コメント: ${freeText ?? "（なし）"}

## 3層スコア
- 総合: ${(partnerResult.total * 100).toFixed(0)}%
- 性格互換性: ${(partnerResult.layer1Score * 100).toFixed(0)}%
- 関係プロセス: ${(partnerResult.layer15Score * 100).toFixed(0)}%
- 人生設計: ${(partnerResult.layer2Score * 100).toFixed(0)}%

## 出力
JSON形式で以下のフィールドを出力:
- overallImpression: デート全体の分析（1-2文）
- lifePlanConfirmations: 人生設計面で確認できたことの配列
- lifePlanPending: まだ確認できていない重要項目の配列
- nextStepAdvice: 次のステップへの具体的アドバイス（1-2文）
- counselorNote: カウンセラーとしての見解（1-2文、温かく）
`.trim();

  const aiResult = await runAI({
    taskType: "rendezvous_partner_post_date",
    prompt,
    systemPrompt: PARTNER_COUNSELOR_SYSTEM_PROMPT,
    requireJson: true,
    temperature: 0.65,
    userId: params.userId,
  });

  let output: PartnerPostDateAnalysis;
  try {
    output = (
      aiResult.structured
        ? aiResult.structured
        : JSON.parse(aiResult.text)
    ) as PartnerPostDateAnalysis;
  } catch {
    output = {
      overallImpression: "デートの振り返りをもとに、次のステップを一緒に考えましょう。",
      lifePlanConfirmations: [],
      lifePlanPending: ["金銭感覚", "将来の家族計画", "住む場所の希望"],
      nextStepAdvice: "自然な会話の中で、お互いの将来像について少しずつ共有してみてください。",
      counselorNote: "焦らず、おふたりのペースで関係を深めていきましょう。",
    };
  }

  return output;
}
