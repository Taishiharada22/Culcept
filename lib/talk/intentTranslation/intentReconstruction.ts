import "server-only";

// lib/talk/intentTranslation/intentReconstruction.ts
// 受信側 Intent Reconstruction — Phase 2 コアエンジン
//
// 受信者が受け取ったメッセージについて、
// 「送信者はたぶんこういう意図で書いている」を推定し、
// 誤読リスクが高い場合に 💭 バブルで表示する。
//
// Phase 1 (readingSimulation) が「送信前の伝わり方チェック」なら、
// Phase 2 (intentReconstruction) は「受信後の意図翻訳」。
//
// 設計原則:
//   - 断定しない。「〜かもしれない」形式を徹底
//   - 全メッセージに表示しない。誤読リスクが高いときだけ
//   - 送信者の同意が前提（Stargazerデータが使われることへの同意）
//   - 「分からない」を積極的に出す（confidence < 0.5 → 表示しない）
//
// 二層設計:
//   Layer 1: ルールベース — 曖昧表現 + 受信者感受性 + 送信者の文体
//   Layer 2: LLM推論 — 送信者プロファイル × 会話文脈 × 過去パターン

import { runAI } from "@/lib/ai";
import { SAFETY_PROMPT_BLOCK, enforceSafetyRules } from "./safetyRules";
import type {
  IntentReconstructionInput,
  IntentReconstructionResult,
  IntentTranslationProfile,
  IntentInterpretation,
  BubbleHintDecision,
  BubbleSkipReason,
} from "./types";
import {
  BUBBLE_HINT_RISK_THRESHOLD,
  BUBBLE_HINT_CONFIDENCE_THRESHOLD,
} from "./types";
import {
  detectAmbiguousExpressions,
  computeAmbiguityFactor,
  computeTopicWeight,
  detectKeigoShift,
} from "./japanesePragmatics";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 送信者の「普段の文体」からの逸脱検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 送信者の通常スタイルとのズレを検出する。
 *
 * 「この人が『了解』を使うとき、それは冷たさではなく効率」
 * を判定するための基盤。
 *
 * @returns スタイルメモ（日本語、1文）または null
 */
function analyzeSenderStyle(
  profile: IntentTranslationProfile,
  message: string,
): string | null {
  const trimmed = message.trim();
  const notes: string[] = [];

  // 直接的な人が短文 → 普通（効率重視）
  if (trimmed.length < 10 && profile.direct_vs_diplomatic < -0.3) {
    notes.push("この人は普段から簡潔に伝えるタイプです");
  }

  // 外交的な人が短文 → 異常（距離を取っている可能性）
  if (trimmed.length < 10 && profile.direct_vs_diplomatic > 0.3) {
    notes.push("普段は丁寧に言葉を選ぶ人なので、短い返事は珍しいかもしれません");
  }

  // 感情制御が高い人が感情的表現 → 珍しい
  if (profile.emotional_regulation > 0.3 && /[！!]{2,}|[😭😤😡💢]/.test(trimmed)) {
    notes.push("普段は感情を抑えるタイプの人なので、強い感情表現は本気の可能性が高いです");
  }

  // 表裏の差が大きい人 → 文字通りに受け取らないほうがいいかも
  if (profile.public_private_gap > 0.4) {
    const ambiguous = detectAmbiguousExpressions(trimmed);
    if (ambiguous.length > 0) {
      notes.push("この人は内心と表現にギャップが出やすいタイプです");
    }
  }

  return notes.length > 0 ? notes[0] : null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 受信者の解釈バイアス推定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 受信者が持つ解釈バイアスを推定する。
 *
 * 学術根拠:
 *   - 不安型愛着 → 中立メッセージを否定的に読む (Vinograd 2020)
 *   - 高reassurance_need → 確認不足を不安と感じる (Vanderbilt 2025)
 *
 * @returns バイアスの方向と強度
 */
function estimateReceiverBias(
  profile: IntentTranslationProfile,
): { direction: "negative" | "neutral" | "positive"; strength: number } {
  // 不安型愛着 + 高reassurance_need → 強いネガティブバイアス
  const negativePull =
    Math.max(0, profile.attachment_style) * 0.4 +
    Math.max(0, profile.reassurance_need) * 0.3 +
    Math.max(0, profile.emotional_variability) * 0.2;

  // 安定型 + 高emotional_regulation → ニュートラル
  const stabilizer =
    Math.max(0, profile.emotional_regulation) * 0.3 +
    Math.max(0, -profile.attachment_style) * 0.2; // 安定寄り

  const net = negativePull - stabilizer;

  if (net > 0.3) return { direction: "negative", strength: Math.min(1, net) };
  if (net < -0.1) return { direction: "positive", strength: Math.min(1, Math.abs(net)) };
  return { direction: "neutral", strength: 0 };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 誤読リスクスコア（受信側）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function computeReceiverMisreadRisk(
  input: IntentReconstructionInput,
): number {
  const ambiguity = computeAmbiguityFactor(input.receivedMessage);
  const topic = computeTopicWeight(input.receivedMessage);
  const bias = estimateReceiverBias(input.receiverProfile);

  // 送信者の表裏差が大きいほどリスクが上がる
  const senderGapFactor = 1 + Math.max(0, input.senderProfile.public_private_gap) * 0.3;

  // コンテキスト: 会話が短い → リスク上昇（文脈が少ない）
  const contextFactor = input.conversationContext.length < 3 ? 1.3 : 1.0;

  const raw = 0.08
    * ambiguity
    * (1 + bias.strength * 0.5)
    * topic
    * senderGapFactor
    * contextFactor;

  return Math.max(0, Math.min(1, raw));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM 意図復元
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RECONSTRUCTION_SCHEMA = {
  type: "object",
  properties: {
    primary_intent: {
      type: "object",
      properties: {
        reading: { type: "string" },
        speech_act: { type: "string" },
        probability: { type: "number" },
        confidence: { type: "number" },
        valence: { type: "number" },
        arousal: { type: "number" },
        dominance: { type: "number" },
      },
      required: ["reading", "speech_act", "probability", "confidence", "valence", "arousal", "dominance"],
    },
    alternative_intents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          reading: { type: "string" },
          speech_act: { type: "string" },
          probability: { type: "number" },
          valence: { type: "number" },
          arousal: { type: "number" },
          dominance: { type: "number" },
        },
        required: ["reading", "speech_act", "probability", "valence", "arousal", "dominance"],
      },
    },
    context_note: { type: "string" },
    suggest_ask_sender: { type: "boolean" },
    confidence: { type: "number" },
  },
  required: [
    "primary_intent",
    "alternative_intents",
    "context_note",
    "suggest_ask_sender",
    "confidence",
  ],
} as const;

type LLMReconstructionOutput = {
  primary_intent: {
    reading: string;
    speech_act: string;
    probability: number;
    confidence: number;
    valence: number;
    arousal: number;
    dominance: number;
  };
  alternative_intents: Array<{
    reading: string;
    speech_act: string;
    probability: number;
    valence: number;
    arousal: number;
    dominance: number;
  }>;
  context_note: string;
  suggest_ask_sender: boolean;
  confidence: number;
};

function buildSenderProfileBlock(profile: IntentTranslationProfile): string {
  return [
    "## 送信者のプロファイル",
    `- 率直 ↔ 外交的: ${profile.direct_vs_diplomatic.toFixed(2)}`,
    `- 愛着スタイル: ${profile.attachment_style.toFixed(2)}`,
    `- 安心の求め方: ${profile.reassurance_need.toFixed(2)}`,
    `- 感情の振れ幅: ${profile.emotional_variability.toFixed(2)}`,
    `- 対立スタイル: ${profile.conflict_style.toFixed(2)}`,
    `- 表裏の差: ${profile.public_private_gap.toFixed(2)}`,
    `- 親密化速度: ${profile.intimacy_pace.toFixed(2)}`,
    `- 境界認識: ${profile.boundary_awareness.toFixed(2)}`,
    `- 自己開示の深さ: ${profile.self_disclosure_depth.toFixed(2)}`,
    `- 感情制御: ${profile.emotional_regulation.toFixed(2)}`,
    `- 関係投資: ${profile.relational_investment.toFixed(2)}`,
  ].join("\n");
}

function buildPastPatternsBlock(patterns: IntentReconstructionInput["senderPastPatterns"]): string {
  if (!patterns || patterns.length === 0) return "（過去パターンなし）";
  return patterns
    .slice(0, 3)
    .map((p, i) => `${i + 1}. 「${p.message}」→ 文脈: ${p.contextSummary} → 結果: ${p.outcome}`)
    .join("\n");
}

async function runLLMReconstruction(
  input: IntentReconstructionInput,
): Promise<LLMReconstructionOutput | null> {
  const conversationBlock = input.conversationContext.length > 0
    ? input.conversationContext
        .slice(-5)
        .map(t => `[${t.senderId.slice(0, 6)}] ${t.body}`)
        .join("\n")
    : "（会話履歴なし）";

  const systemPrompt = [
    "あなたは受信したテキストメッセージの「送信者の意図」を推定する翻訳エンジンです。",
    "受信者が誤読しないよう、送信者の性格と文脈から最も可能性の高い意図を推定してください。",
    "",
    buildSenderProfileBlock(input.senderProfile),
    "",
    "## 送信者の過去の発話パターン",
    buildPastPatternsBlock(input.senderPastPatterns),
    "",
    "## 会話履歴（直近5ターン）",
    conversationBlock,
    "",
    "## 受信したメッセージ",
    `「${input.receivedMessage}」`,
    "",
    "## 出力ルール",
    "- 断定しない。「〜の可能性が高いです」「〜かもしれません」を使う",
    "- context_note は受信者に見せる文。1-2文。自然な日本語。「この人は〜」で始める",
    "- primary_intent の reading は「この人はたぶん〜という気持ちで書いています」形式",
    "- alternative_intents は確率順で最大2つ",
    "- confidence < 0.5 なら suggest_ask_sender を true にする",
    "- 相手の「本音」を暴かない。傾向と可能性を伝えるのみ",
    "- speech_act は: inform, request, suggest, warn, promise, apologize, complain, reassure, tease, express_emotion, bid_for_connection, set_boundary, withdraw, test, passive_aggress のいずれか",
    "",
    SAFETY_PROMPT_BLOCK,
  ].join("\n");

  try {
    const result = await runAI({
      taskType: "intent_reconstruction",
      systemPrompt,
      prompt: `受信メッセージ「${input.receivedMessage}」の送信者の意図を推定してください。`,
      jsonSchema: RECONSTRUCTION_SCHEMA as unknown as Record<string, unknown>,
      requireJson: true,
      temperature: 0.3,
      maxOutputTokens: 800,
    });

    if (result.structured) {
      const output = result.structured as unknown as LLMReconstructionOutput;
      // 安全ルール適用
      output.primary_intent.reading = enforceSafetyRules(output.primary_intent.reading).sanitized;
      output.context_note = enforceSafetyRules(output.context_note).sanitized;
      for (const alt of output.alternative_intents) {
        alt.reading = enforceSafetyRules(alt.reading).sanitized;
      }
      return output;
    }
    return null;
  } catch {
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💭バブル表示判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 💭バブルを表示するかどうかを判定する。
 *
 * 全メッセージに表示すると鬱陶しい。
 * 「ズレが起きそうなときだけ」出すのが正しい。
 *
 * 表示条件:
 *   1. misreadRisk >= BUBBLE_HINT_RISK_THRESHOLD (0.35)
 *   2. confidence >= BUBBLE_HINT_CONFIDENCE_THRESHOLD (0.5)
 *   3. 送信者のStargazerデータが十分
 *   4. cooldown中でない
 *   5. 1日の上限に達していない
 */
function decideBubbleHint(params: {
  misreadRisk: number;
  confidence: number;
  hintText: string | null;
  senderProfileAvailable: boolean;
  conversationLength: number;
}): BubbleHintDecision {
  const { misreadRisk, confidence, hintText, senderProfileAvailable, conversationLength } = params;

  // E2E eval 用: 閾値オーバーライド（本番はデフォルト値を使用）
  const bubbleRiskThreshold = parseFloat(
    process.env.INTENT_BUBBLE_RISK_THRESHOLD ?? String(BUBBLE_HINT_RISK_THRESHOLD),
  );
  const bubbleMinTurns = parseInt(
    process.env.INTENT_BUBBLE_MIN_TURNS ?? "2",
    10,
  );

  // ── Skip reasons (優先度順) ──
  let skipReason: BubbleSkipReason | null = null;

  if (!senderProfileAvailable) {
    skipReason = "sender_not_profiled";
  } else if (conversationLength < bubbleMinTurns) {
    skipReason = "short_conversation";
  } else if (misreadRisk < bubbleRiskThreshold) {
    skipReason = "low_risk";
  } else if (confidence < parseFloat(
    process.env.INTENT_BUBBLE_CONFIDENCE_THRESHOLD ?? String(BUBBLE_HINT_CONFIDENCE_THRESHOLD),
  )) {
    skipReason = "low_confidence";
  }
  // daily_limit と cooldown は API レイヤーで判定（状態が必要なため）

  if (skipReason) {
    return {
      show: false,
      skipReason,
      hintText: null,
      confidence,
      misreadRisk,
    };
  }

  return {
    show: true,
    skipReason: null,
    hintText,
    confidence,
    misreadRisk,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインエントリ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 受信側 Intent Reconstruction — メインエントリ
 *
 * 受信メッセージの「送信者の意図」を推定し、
 * 誤読リスクが高い場合に 💭 バブルで表示する内容を生成する。
 *
 * Phase 1 (simulateReading) の mirror 関数。
 * Phase 1 が「送信前」、Phase 2 が「受信後」。
 */
export async function reconstructIntent(
  input: IntentReconstructionInput,
): Promise<IntentReconstructionResult> {
  // ── Layer 1: ルールベース ──
  const misreadRisk = computeReceiverMisreadRisk(input);
  const ambiguousExpressions = detectAmbiguousExpressions(input.receivedMessage);
  const keigoShift = detectKeigoShift(
    input.conversationContext,
    input.senderProfile.userId,
  );
  const senderStyleNote = analyzeSenderStyle(input.senderProfile, input.receivedMessage);
  const receiverBias = estimateReceiverBias(input.receiverProfile);

  // ── Layer 2: LLM（リスクが閾値以上の場合のみ） ──
  const llmPhase2Threshold = parseFloat(
    process.env.INTENT_LLM_PHASE2_THRESHOLD ?? String(BUBBLE_HINT_RISK_THRESHOLD * 0.8),
  );
  let llmResult: LLMReconstructionOutput | null = null;
  if (misreadRisk >= llmPhase2Threshold) {
    // 閾値より少し低くても LLM を呼ぶ（確信度が高ければ表示される可能性があるため）
    llmResult = await runLLMReconstruction(input);
  }

  // ── 結果統合 ──
  if (llmResult) {
    const primaryIntent: IntentReconstructionResult["primaryIntent"] = {
      reading: llmResult.primary_intent.reading,
      speechAct: llmResult.primary_intent.speech_act as IntentInterpretation["speechAct"],
      probability: llmResult.primary_intent.probability,
      emotionalImpact: {
        valence: llmResult.primary_intent.valence,
        arousal: llmResult.primary_intent.arousal,
        dominance: llmResult.primary_intent.dominance,
      },
      confidence: llmResult.primary_intent.confidence,
    };

    const alternativeIntents: IntentInterpretation[] = llmResult.alternative_intents.map(a => ({
      reading: a.reading,
      speechAct: a.speech_act as IntentInterpretation["speechAct"],
      probability: a.probability,
      emotionalImpact: { valence: a.valence, arousal: a.arousal, dominance: a.dominance },
    }));

    // contextNote にバイアス補正を追加
    let contextNote = llmResult.context_note;
    if (receiverBias.direction === "negative" && receiverBias.strength > 0.3) {
      contextNote += "（あなたは相手のメッセージを厳しめに読む傾向があるかもしれません）";
    }

    // ── display confidence 合成 ──
    // LLM の raw confidence が保守的すぎる（40件発火中25件が < 0.5）。
    // ルール層シグナルとの合成で、本当に価値のあるヒントが落ちないようにする。
    // ただし闇雲に上げず、複数条件の重畳で段階的にブーストする。
    let displayConfidence = llmResult.confidence;

    // 曖昧表現ブースト: 既知の曖昧パターン検出 → LLM分析の価値が高い
    if (ambiguousExpressions.length > 0) {
      displayConfidence = Math.min(1, displayConfidence + 0.15);
    }

    // 短文ブースト: 短い文ほど解釈分岐が大きく、ヒントの価値が高い
    if (input.receivedMessage.length <= 10) {
      displayConfidence = Math.min(1, displayConfidence + 0.1);
    }

    // プロファイル差ブースト: 送受信者のスタイル差が大きい → 誤読リスク上昇
    const styleDelta = Math.abs(
      input.senderProfile.direct_vs_diplomatic - input.receiverProfile.direct_vs_diplomatic,
    );
    if (styleDelta > 0.5) {
      displayConfidence = Math.min(1, displayConfidence + styleDelta * 0.1);
    }

    // 会話深度ブースト: 文脈が多いほどLLM分析の精度が上がる
    if (input.conversationContext.length >= 3) {
      displayConfidence = Math.min(1, displayConfidence + 0.05);
    }

    const bubbleHint = decideBubbleHint({
      misreadRisk,
      confidence: displayConfidence,
      hintText: contextNote,
      senderProfileAvailable: true,
      conversationLength: input.conversationContext.length,
    });

    return {
      primaryIntent,
      alternativeIntents,
      contextNote,
      senderStyleNote,
      suggestAskSender: llmResult.suggest_ask_sender,
      confidence: llmResult.confidence,
      bubbleHint,
      ambiguousExpressions,
      keigoShift,
    };
  }

  // ── LLM なし: ルールベースのみ ──
  const fallbackContextNote = senderStyleNote ?? "この文脈では意図を確定できません";
  const fallbackConfidence = 0.3;

  // fallback でも rule-layer シグナルで display confidence を合成する
  let fallbackDisplayConfidence = fallbackConfidence;
  if (ambiguousExpressions.length > 0) {
    fallbackDisplayConfidence = Math.min(1, fallbackDisplayConfidence + 0.15);
  }
  if (input.receivedMessage.length <= 10) {
    fallbackDisplayConfidence = Math.min(1, fallbackDisplayConfidence + 0.1);
  }
  const fallbackStyleDelta = Math.abs(
    input.senderProfile.direct_vs_diplomatic - input.receiverProfile.direct_vs_diplomatic,
  );
  if (fallbackStyleDelta > 0.5) {
    fallbackDisplayConfidence = Math.min(1, fallbackDisplayConfidence + fallbackStyleDelta * 0.1);
  }
  if (input.conversationContext.length >= 3) {
    fallbackDisplayConfidence = Math.min(1, fallbackDisplayConfidence + 0.05);
  }

  const bubbleHint = decideBubbleHint({
    misreadRisk,
    confidence: fallbackDisplayConfidence,
    hintText: fallbackContextNote,
    senderProfileAvailable: true,
    conversationLength: input.conversationContext.length,
  });

  return {
    primaryIntent: {
      reading: "（分析中）",
      speechAct: "inform",
      probability: 0.5,
      emotionalImpact: { valence: 0, arousal: 0, dominance: 0 },
      confidence: fallbackConfidence,
    },
    alternativeIntents: [],
    contextNote: fallbackContextNote,
    senderStyleNote,
    suggestAskSender: true,
    confidence: fallbackConfidence,
    bubbleHint,
    ambiguousExpressions,
    keigoShift,
  };
}
