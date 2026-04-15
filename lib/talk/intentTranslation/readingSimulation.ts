import "server-only";

// lib/talk/intentTranslation/readingSimulation.ts
// 送信側 Reading Simulation — Phase 1 コアエンジン
//
// 「この文章が相手にどう読まれるか」をシミュレーションし、
// 誤読リスクが高い場合に送信者に伝える。
//
// 二層設計:
//   Layer 1: ルールベース（高速、確定的）
//     - 日本語曖昧表現辞書
//     - 敬語シフト検出
//     - 受信者感受性スコア
//     - 話題の繊細さ
//   Layer 2: LLM推論（文脈依存、確率的）
//     - 送信者プロファイル + 受信者プロファイル + 会話履歴から
//       意図と解釈のギャップをシミュレーション
//
// 既存資産の活用:
//   - temperatureGapDetector の温度スコア → contextRisk に反映
//   - ruptureDetection の WITHDRAWAL_PATTERNS → 曖昧表現辞書と相互参照
//   - contradictionDetector の矛盾検出 → クロスセッション矛盾は Phase 2

import { runAI } from "@/lib/ai";
import { SAFETY_PROMPT_BLOCK, enforceSafetyRules } from "./safetyRules";
import type {
  ReadingSimulationInput,
  ReadingSimulationResult,
  IntentTranslationProfile,
  MisreadRiskFactors,
  InterventionLevel,
  IntentInterpretation,
  MisreadType,
} from "./types";
import {
  detectAmbiguousExpressions,
  computeAmbiguityFactor,
  computeTopicWeight,
  detectKeigoShift,
  computeFrictionSignal,
} from "./japanesePragmatics";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 介入閾値 */
const PASSIVE_THRESHOLD = 0.3;
const ACTIVE_THRESHOLD = 0.6;

/** LLM に投げる閾値（低リスクは LLM を呼ばない） */
function getLLMAnalysisThreshold(): number {
  return parseFloat(process.env.INTENT_LLM_PHASE1_THRESHOLD ?? "0.25");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 受信者感受性スコア
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 受信者の性格プロファイルから「テキスト誤読しやすさ」を算出。
 *
 * 学術根拠:
 *   - 高 attachment_style(不安型) → 中立テキストを否定的に読む (Vinograd 2020)
 *   - 高 reassurance_need → 確認不足を不安と感じる (Vanderbilt 2025)
 *   - 高 emotional_variability → 感情の振幅が大きく、反応が予測しにくい
 *
 * @returns 0.5（低感受性）〜 2.0（高感受性）
 */
function computeReceiverSensitivity(profile: IntentTranslationProfile): number {
  const BASE = 0.5;
  const MAX = 2.0;

  // attachment_style: 不安型(+1)ほど sensitivity が高い
  const attachmentFactor = Math.max(0, profile.attachment_style) * 0.5;

  // reassurance_need: 確認型(+1)ほど sensitivity が高い
  const reassuranceFactor = Math.max(0, profile.reassurance_need) * 0.3;

  // emotional_variability: 変動大(+1)ほど sensitivity が高い
  const variabilityFactor = Math.max(0, profile.emotional_variability) * 0.2;

  // emotional_regulation: 制御的(+1)は sensitivity を下げる
  const regulationDiscount = Math.max(0, profile.emotional_regulation) * -0.15;

  const raw = BASE + attachmentFactor + reassuranceFactor + variabilityFactor + regulationDiscount;
  return Math.max(BASE, Math.min(MAX, raw));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// コンテキストリスク
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 会話の緊張度から context_risk を算出。
 * temperatureGapDetector の温度差データがあれば使用。
 *
 * 学術根拠:
 *   - Golder & Macy (2011, Science): 深夜帯のテキストは感情的極性が高い
 *   - Kross et al. (2013): 孤独感は夜間に増幅 → テキスト解釈に負バイアス
 *   - Byron (2008): 返信遅延はネガティブ帰属を引き起こしやすい
 *
 * @returns 0.5（平穏）〜 2.0（緊張状態）
 */
function computeContextRisk(
  input: ReadingSimulationInput,
): number {
  const BASE = 0.5;
  const MAX = 2.0;
  let risk = BASE;

  // 温度差がある場合
  if (input.relationshipMeta?.temperatureDelta != null) {
    const absDelta = Math.abs(input.relationshipMeta.temperatureDelta);
    risk += Math.min(0.5, absDelta * 0.15);
  }

  // 直近に rupture がある場合
  if (input.relationshipMeta?.recentRupture) {
    risk += 0.4;
  }

  // 会話のトーン変化: 直近5ターンでメッセージが急に短くなった
  const context = input.conversationContext;
  if (context.length >= 4) {
    const receiverMsgs = context.filter(t => t.senderId !== input.senderProfile.userId);
    if (receiverMsgs.length >= 2) {
      const recent = receiverMsgs.slice(-2);
      const avgLen = recent.reduce((s, m) => s + m.body.length, 0) / recent.length;
      // 平均メッセージ長が10文字未満 → 冷却の兆候
      if (avgLen < 10) risk += 0.3;
    }
  }

  // ── 深夜帯メッセージの感情増幅 ──
  // Golder & Macy (2011): 23:00-04:00 のテキストは感情的極性↑
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 23 || hour < 4) {
    risk += 0.2; // 深夜帯: 感情的増幅
  }

  // ── 会話コンテキストの対立パターン検出 ──
  // 直近の会話に対立・口論の言語マーカーがある場合、contextRisk を加算。
  // 学術根拠: Gottman & Levenson (2000): 対立の開始3分で結末が予測可能。
  //   対立マーカーの存在は、後続の短文メッセージが「諦め撤退」である確率を高める。
  // パターン:
  //   だからさ — 繰り返し要求の苛立ち
  //   ^だから — 文頭「だから」= 既出論点の繰り返し要求（説明的用法と区別）
  //   そうじゃない(って) — 否定・修正
  //   いい加減 — 限界の表明
  //   いつもそう — Gottman criticism（一般化批判）
  //   事実でしょ — 感情の否定・論理的押し付け
  //   早く決めて/して — 時間圧力による要求
  const CONFRONTATION_MARKERS = /だからさ|^だから|そう(?:いう(?:こと|意味|話))?じゃない(?:ん|って)|いい加減|いつもそう|事実でしょ|早く(?:決めて|して)/;
  if (context.length >= 2) {
    const hasConfrontation = context.some(t => CONFRONTATION_MARKERS.test(t.body));
    if (hasConfrontation) {
      risk += 0.3;
    }
  }

  // ── 返信遅延パターン ──
  // Byron (2008): 通常より遅い返信 → ネガティブ帰属
  if (context.length >= 2) {
    const lastTwo = context.slice(-2);
    if (lastTwo[0].senderId !== lastTwo[1].senderId) {
      const gapMs = new Date(lastTwo[1].createdAt).getTime()
        - new Date(lastTwo[0].createdAt).getTime();
      // 通常の会話ペースを推定: 全ターン間隔の中央値
      if (context.length >= 4) {
        const gaps: number[] = [];
        for (let i = 1; i < context.length - 1; i++) {
          if (context[i].senderId !== context[i - 1].senderId) {
            gaps.push(new Date(context[i].createdAt).getTime()
              - new Date(context[i - 1].createdAt).getTime());
          }
        }
        if (gaps.length > 0) {
          gaps.sort((a, b) => a - b);
          const median = gaps[Math.floor(gaps.length / 2)];
          // 直近の返信が中央値の3倍以上遅い → 遅延リスク
          if (median > 0 && gapMs > median * 3) {
            risk += 0.15;
          }
        }
      }
    }
  }

  return Math.min(MAX, risk);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 誤読リスクスコア算出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ルールベースの誤読リスクスコアを算出する。
 * LLM を呼ばずに高速に判定できる。
 */
function computeMisreadRisk(
  input: ReadingSimulationInput,
): { risk: number; factors: MisreadRiskFactors } {
  const ambiguityFactor = computeAmbiguityFactor(input.message);
  const receiverSensitivity = computeReceiverSensitivity(input.receiverProfile);
  const contextRisk = computeContextRisk(input);
  const topicWeight = computeTopicWeight(input.message);

  // 基本リスク: 各因子の積を 0-1 にスケール
  // base_risk = 0.08 (中程度のメッセージのベースライン)
  const rawRisk = 0.08 * ambiguityFactor * receiverSensitivity * contextRisk * topicWeight;

  // ── 短文曖昧性の加算リスク ──
  // 乗算構造だけでは contextRisk=0.5(平穏) × sensitivity=0.5(標準) で
  // risk が 0.01-0.03 に圧縮され、短文曖昧メッセージが検出できない。
  // 短文 + 高曖昧性の場合、加算成分でリスクを底上げする。
  //
  // 学術根拠: Walther & D'Addario (2001)
  //   短い曖昧テキストは受信者の既存の感情状態に沿って解釈される
  //   → 誤読リスクがメッセージ長に反比例して増大
  let additiveRisk = 0;
  const msgLen = input.message.trim().length;
  if (msgLen <= 15 && ambiguityFactor >= 0.85) {
    // 短文 + 曖昧表現検出 → 加算リスク
    // ambiguityFactor 0.8(低) → +0.10, 1.0(中) → +0.16, 1.5(高) → +0.32
    additiveRisk = (ambiguityFactor - 0.5) * 0.32;

    // 超短文(≤5文字) はさらにブースト: 「は？」「うん」等
    if (msgLen <= 5) {
      additiveRisk += 0.08;
    }

    // プロファイル差が大きい場合の追加ブースト
    const styleDelta = Math.abs(
      input.senderProfile.direct_vs_diplomatic - input.receiverProfile.direct_vs_diplomatic,
    );
    if (styleDelta > 0.3) {
      additiveRisk += styleDelta * 0.12;
    }

    // contextRisk が平穏(BASE=0.5)の場合、additive を抑制
    // 緊張状態(>0.7)なら full 適用
    // 超短文(≤10) + 高曖昧性(≥0.98) は抑制を緩和（「別に」「勝手にすれば」等の確実な曖昧表現）
    // 0.95→0.98: score≥0.80 の確実な曖昧表現のみ軽い抑制。
    //   "わかった"(0.75→factor=0.95) は標準抑制で文脈依存を保つ。
    if (contextRisk < 0.7) {
      if (msgLen <= 10 && ambiguityFactor >= 0.98) {
        additiveRisk *= 0.9; // 確実な曖昧表現: 軽い抑制のみ
      } else {
        additiveRisk *= 0.7; // 標準抑制
      }
    }
  }

  // ── 対人摩擦パターンの加算リスク（Round 2-C: B カテゴリ特化）──
  // 長文の摩擦パターン（criticism, double bind, conditional apology 等）を検出し、
  // 送信者が表現を改善できるパターン（Group 1）のみ Phase 1 リスクに加算する。
  // Group 2（苦痛の表出）は Phase 2 confidence boost にのみ使用。
  //
  // contextRisk 抑制は適用しない: パターン自体がリスクシグナルであり、
  // 平穏な文脈でも「いつもあなたは…」は問題表現。
  const frictionSignal = computeFrictionSignal(input.message);
  if (frictionSignal.senderRiskScore > 0) {
    additiveRisk += frictionSignal.senderRiskScore;
  }

  // 0-1 にクランプ
  const risk = Math.max(0, Math.min(1, rawRisk + additiveRisk));

  return {
    risk,
    factors: {
      ambiguityFactor: Math.round(ambiguityFactor * 100) / 100,
      receiverSensitivity: Math.round(receiverSensitivity * 100) / 100,
      contextRisk: Math.round(contextRisk * 100) / 100,
      topicWeight: Math.round(topicWeight * 100) / 100,
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 介入レベル判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function determineInterventionLevel(risk: number): InterventionLevel {
  if (risk >= ACTIVE_THRESHOLD) return "active";
  if (risk >= PASSIVE_THRESHOLD) return "passive";
  return "silent";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM 意図分析
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** LLM 出力スキーマ */
const INTENT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    sender_intent: {
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
    receiver_interpretations: {
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
    gap_detected: { type: "boolean" },
    gap_type: { type: "string", nullable: true },
    rewrite_suggestion: { type: "string", nullable: true },
    confidence: { type: "number" },
  },
  required: [
    "sender_intent",
    "receiver_interpretations",
    "gap_detected",
    "gap_type",
    "rewrite_suggestion",
    "confidence",
  ],
} as const;

type LLMIntentOutput = {
  sender_intent: {
    reading: string;
    speech_act: string;
    probability: number;
    valence: number;
    arousal: number;
    dominance: number;
  };
  receiver_interpretations: Array<{
    reading: string;
    speech_act: string;
    probability: number;
    valence: number;
    arousal: number;
    dominance: number;
  }>;
  gap_detected: boolean;
  gap_type: string | null;
  rewrite_suggestion: string | null;
  confidence: number;
};

function buildProfileBlock(label: string, profile: IntentTranslationProfile): string {
  return [
    `## ${label}のプロファイル`,
    `- 率直 ↔ 外交的: ${profile.direct_vs_diplomatic.toFixed(2)}`,
    `- 愛着スタイル: ${profile.attachment_style.toFixed(2)} (不安型ほど+)`,
    `- 安心の求め方: ${profile.reassurance_need.toFixed(2)} (確認型ほど+)`,
    `- 感情の振れ幅: ${profile.emotional_variability.toFixed(2)}`,
    `- 対立スタイル: ${profile.conflict_style.toFixed(2)} (対決型ほど+)`,
    `- 表裏の差: ${profile.public_private_gap.toFixed(2)}`,
    `- 親密化速度: ${profile.intimacy_pace.toFixed(2)}`,
    `- 境界認識: ${profile.boundary_awareness.toFixed(2)}`,
    `- 自己開示の深さ: ${profile.self_disclosure_depth.toFixed(2)}`,
    `- 感情制御: ${profile.emotional_regulation.toFixed(2)}`,
    `- 関係投資: ${profile.relational_investment.toFixed(2)}`,
  ].join("\n");
}

function buildConversationBlock(turns: ReadingSimulationInput["conversationContext"]): string {
  if (turns.length === 0) return "（会話履歴なし）";
  return turns
    .slice(-5) // 直近5ターン
    .map(t => `[${t.senderId.slice(0, 6)}] ${t.body}`)
    .join("\n");
}

/**
 * LLM を使った深い意図分析。
 * misread_risk が LLM_ANALYSIS_THRESHOLD 以上の場合にのみ呼ぶ。
 */
async function runLLMIntentAnalysis(
  input: ReadingSimulationInput,
): Promise<LLMIntentOutput | null> {
  const systemPrompt = [
    "あなたは二人のテキストコミュニケーションの意図を分析する翻訳エンジンです。",
    "送信者が伝えたい意図と、受信者がどう読む可能性があるかを分析してください。",
    "",
    buildProfileBlock("送信者", input.senderProfile),
    "",
    buildProfileBlock("受信者", input.receiverProfile),
    "",
    "## 会話履歴（直近5ターン）",
    buildConversationBlock(input.conversationContext),
    "",
    "## 分析対象メッセージ",
    `「${input.message}」`,
    "",
    "## 出力ルール",
    "- 断定しない。「〜の可能性が高い」「〜と読まれるかもしれない」を使う",
    "- receiver_interpretations は確率順で最大3つ。確率の合計は1.0にする",
    "- confidence が 0.6 未満なら rewrite_suggestion は null にする",
    "- gap_type は以下のいずれか: tone_mismatch, intent_mismatch, urgency_mismatch, intensity_mismatch, boundary_mismatch, sarcasm_failure, silence_misread",
    "- rewrite_suggestion は短く自然な日本語にする",
    "- speech_act は: inform, request, suggest, warn, promise, apologize, complain, reassure, tease, express_emotion, bid_for_connection, set_boundary, withdraw, test, passive_aggress のいずれか",
    "- reading は日本語で、ユーザーに見せる説明文（1-2文）",
    "",
    SAFETY_PROMPT_BLOCK,
  ].join("\n");

  try {
    const result = await runAI({
      taskType: "intent_translation",
      systemPrompt,
      prompt: `送信メッセージ「${input.message}」を分析してください。`,
      jsonSchema: INTENT_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
      requireJson: true,
      temperature: 0.3, // 一貫性を重視
      maxOutputTokens: 800,
    });

    if (result.structured) {
      const output = result.structured as unknown as LLMIntentOutput;
      // 安全ルール適用: 断定表現・操作的表現を修正
      output.sender_intent.reading = enforceSafetyRules(output.sender_intent.reading).sanitized;
      for (const interp of output.receiver_interpretations) {
        interp.reading = enforceSafetyRules(interp.reading).sanitized;
      }
      if (output.rewrite_suggestion) {
        output.rewrite_suggestion = enforceSafetyRules(output.rewrite_suggestion).sanitized;
      }
      return output;
    }
    return null;
  } catch {
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインエントリ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function toLLMInterpretation(raw: LLMIntentOutput["sender_intent"]): IntentInterpretation {
  return {
    reading: raw.reading,
    speechAct: raw.speech_act as IntentInterpretation["speechAct"],
    probability: raw.probability,
    emotionalImpact: {
      valence: raw.valence,
      arousal: raw.arousal,
      dominance: raw.dominance,
    },
  };
}

/**
 * 送信側 Reading Simulation — メインエントリ
 *
 * 1. ルールベースで misread_risk を算出
 * 2. リスクが閾値以上なら LLM で深い分析
 * 3. 結果を統合して返す
 */
export async function simulateReading(
  input: ReadingSimulationInput,
): Promise<ReadingSimulationResult> {
  // ── Layer 1: ルールベース ──
  const { risk, factors } = computeMisreadRisk(input);
  const interventionLevel = determineInterventionLevel(risk);
  const ambiguousExpressions = detectAmbiguousExpressions(input.message, input.senderProfile);
  const keigoShift = detectKeigoShift(
    input.conversationContext,
    input.senderProfile.userId,
  );

  // 敬語シフトがある場合、リスクを加算
  let adjustedRisk = risk;
  if (keigoShift.detected) {
    adjustedRisk = Math.min(1, adjustedRisk + keigoShift.magnitude * 0.15);
  }

  // ── Layer 2: LLM 分析（リスクが閾値以上の場合のみ） ──
  let llmResult: LLMIntentOutput | null = null;
  if (adjustedRisk >= getLLMAnalysisThreshold()) {
    llmResult = await runLLMIntentAnalysis(input);
  }

  // ── 結果統合 ──
  const finalInterventionLevel = determineInterventionLevel(adjustedRisk);

  if (llmResult) {
    // ── rewrite gate ──
    // silent 判定の場合、LLM が生成した rewrite は採用しない。
    // 介入すべきでないケースで rewrite が漏れるのを防ぐ。
    // NOTE: Phase 1 risk boost は E2E Round 2-A で false_positive 18件を生んだため撤去。
    //   LLM の gap_detected=true が広すぎ（50件中31件で発火）、介入判定には使えない。
    //   gap 分析は Phase 2 バブルヒントで活用する（Phase 2 は介入度が低いため安全）。
    const finalRewrite = finalInterventionLevel === "silent"
      ? null
      : llmResult.rewrite_suggestion;

    return {
      misreadRisk: Math.round(adjustedRisk * 100) / 100,
      riskFactors: factors,
      interventionLevel: finalInterventionLevel,
      senderIntent: toLLMInterpretation(llmResult.sender_intent),
      receiverInterpretations: llmResult.receiver_interpretations.map(toLLMInterpretation),
      gapDetected: llmResult.gap_detected,
      gapType: (llmResult.gap_type as MisreadType) ?? null,
      rewriteSuggestion: finalRewrite,
      receiverContextNote: null, // Phase 2
      confidence: llmResult.confidence,
      ambiguousExpressions,
      keigoShift,
    };
  }

  // LLM なし: ルールベースのみで返す
  const defaultSenderIntent: IntentInterpretation = {
    reading: "（分析中）",
    speechAct: "inform",
    probability: 0.5,
    emotionalImpact: { valence: 0, arousal: 0, dominance: 0 },
  };

  return {
    misreadRisk: Math.round(adjustedRisk * 100) / 100,
    riskFactors: factors,
    interventionLevel: finalInterventionLevel,
    senderIntent: defaultSenderIntent,
    receiverInterpretations: [],
    gapDetected: adjustedRisk >= PASSIVE_THRESHOLD,
    gapType: ambiguousExpressions.length > 0 ? "tone_mismatch" : null,
    rewriteSuggestion: null,
    receiverContextNote: null,
    confidence: 0.3, // ルールベースのみ
    ambiguousExpressions,
    keigoShift,
  };
}
