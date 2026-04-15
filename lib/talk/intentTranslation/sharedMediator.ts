import "server-only";

// lib/talk/intentTranslation/sharedMediator.ts
// 共同 Alter 仲介エンジン — Phase 3 コア
//
// 二人のユーザー間のテキスト会話を観察し、
// すれ違いやエスカレーションを検知したときに仲介する。
//
// Phase 1 (readingSimulation) = 送信前チェック
// Phase 2 (intentReconstruction) = 受信後の意図翻訳
// Phase 3 (sharedMediator) = 双方向の仲介・促進
//
// 設計原則:
//   - 仲介者 ≠ 裁判官。中立を保つ
//   - NVC の4要素に基づいて建設的な表現を提案
//   - 両者のプロファイルを活用し、相手に届く表現を生成
//   - 普段は透明。エスカレーション時のみ介入
//   - 「分からない」を積極的に出す（確信度が低ければ介入しない）

import { runAI } from "@/lib/ai";
import { SAFETY_PROMPT_BLOCK, enforceSafetyRules } from "./safetyRules";
import type {
  MediationInput,
  MediationResult,
  MediationDecision,
  MediationReason,
  MediationSuggestion,
  IntentTranslationProfile,
  NVCDecomposition,
  EscalationState,
} from "./types";
import {
  MEDIATION_ESCALATION_THRESHOLD,
  FOUR_HORSEMEN_ALWAYS_MEDIATE,
} from "./types";
import {
  analyzeNVCRuleBased,
  detectFourHorsemen,
  assessEscalation,
} from "./nvcAnalysis";
import { computeAmbiguityFactor } from "./japanesePragmatics";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 仲介判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 仲介が必要かどうかを判定する。
 *
 * 判定基準（優先度順）:
 *   1. 四騎士パターン → 文脈ゲート通過時のみ仲介
 *   2. エスカレーションが閾値超え → 仲介
 *   3. スタイル衝突 → 中程度の仲介
 *   4. 言語化されていないニーズ → 低い仲介
 *
 * 四騎士の文脈ゲート（2026-04-13 追加）:
 *   Rule-Layer-Only Eval で 21件の alter_takeover を検出。
 *   原因: 「ふーん」「はい」「笑」等の日常表現が単発で仲介トリガーしていた。
 *   修正: 3段階ゲートで、本当に危険なパターンのみ即仲介する。
 *     Gate 1: severity >= 0.5（「はい」0.3や「笑」0.4では発火しない）
 *     Gate 2: 会話履歴 >= 2ターン（単発メッセージでは仲介しない）
 *     Gate 3: 複数パターン or カスケード（単一パターンの単発ヒットは様子見）
 */
function decideMediationNeed(
  nvc: NVCDecomposition,
  escalation: EscalationState,
  profileA: IntentTranslationProfile,
  profileB: IntentTranslationProfile,
): MediationDecision {
  const cascadeDetected = escalation.cascade?.detected ?? false;

  // 1. 四騎士パターン — 3段階の文脈ゲート付き
  if (FOUR_HORSEMEN_ALWAYS_MEDIATE && escalation.fourHorsemen.length > 0) {
    // Gate 1: severity 閾値 — 低severity の単独ヒットは除外
    // 「はい」(0.3)「笑」(0.4) は日常表現であり、単独では仲介しない
    const significantHits = escalation.fourHorsemen.filter(h => h.severity >= 0.5);

    if (significantHits.length > 0) {
      const maxSeverity = Math.max(...significantHits.map(h => h.severity));

      // Gate 1.5: 圧倒的シグナル — severity≥0.8 は文脈不要で即仲介
      // 「いつもあなたは」(0.8), 「もう話したくない」(0.8), 「バカ」(0.9) 等は
      // 文脈なしでも明確に危険な表現。detectFourHorsemen は同一パターンを重複除去するため
      // 複数 criticism ヒットが1件に集約される → length ではなく severity で判定する。
      const overwhelmingSignal = maxSeverity >= 0.8;
      if (overwhelmingSignal) {
        return {
          shouldMediate: true,
          reason: "four_horsemen_detected",
          urgency: "high",
        };
      }

      // Gate 2: 会話履歴 — 単発メッセージでは四騎士仲介しない
      // 文脈なしで「ふーん」「知らない」に仲介するのは過剰介入
      const hasConversation = escalation.withdrawalStreak > 0
        || (escalation.cascade?.sequence?.length ?? 0) > 0
        || (escalation.reciprocalEscalation?.exchangeCount ?? 0) > 0
        || escalation.temperatureGap > 0;

      // Gate 3: 複数パターン or カスケード or severity≥0.6
      // Gate 1(≥0.5) を通過した上で、会話文脈がある場合は 0.6 以上を仲介対象にする。
      // 0.5 のパターン（「いつもそうだ」等）は escalation scoring に委ねる。
      // 0.6 以上（「はいはい」contempt, 「はぁ？」contempt 等）は文脈ありなら仲介。
      const distinctPatterns = new Set(significantHits.map(h => h.pattern)).size;
      const strongSignal = maxSeverity >= 0.6
        || distinctPatterns >= 2
        || cascadeDetected;

      // カスケードは会話履歴ベースなので文脈は保証済み
      // それ以外は strongSignal であっても会話文脈が必要
      if (cascadeDetected || (strongSignal && hasConversation)) {
        const urgency = cascadeDetected || maxSeverity >= 0.7 ? "high" : "medium";
        return {
          shouldMediate: true,
          reason: "four_horsemen_detected",
          urgency,
        };
      }
      // ゲート不通過: 通常の escalation scoring にフォールスルー
    }
    // severity < 0.5 のみ: 通常の escalation scoring にフォールスルー
  }

  // 1.5. Gottman カスケード — 四騎士の連鎖（個別パターンなしでも危険）
  if (escalation.cascade?.detected && escalation.cascade.progress >= 0.5) {
    return {
      shouldMediate: true,
      reason: "escalation_detected",
      urgency: escalation.cascade.reachedStonewalling ? "high" : "medium",
    };
  }

  // 1.7. 相互エスカレーション（tit-for-tat）— 応酬が3回以上
  if (escalation.reciprocalEscalation?.detected && escalation.reciprocalEscalation.exchangeCount >= 3) {
    return {
      shouldMediate: true,
      reason: "escalation_detected",
      urgency: escalation.reciprocalEscalation.intensifying ? "high" : "medium",
    };
  }

  // 2. エスカレーション閾値
  const mediationThreshold = parseFloat(
    process.env.INTENT_MEDIATION_THRESHOLD ?? String(MEDIATION_ESCALATION_THRESHOLD),
  );
  if (escalation.level >= mediationThreshold) {
    return {
      shouldMediate: true,
      reason: "escalation_detected",
      urgency: escalation.level >= 0.7 ? "high" : "medium",
    };
  }

  // 3. スタイル衝突: direct_vs_diplomatic の差が大きい
  // Gate: styleDelta だけでは仲介しない。
  //   - NVCスコアが低い（攻撃的な内容がある）
  //   - AND 会話に実際の緊張がある（escalation > 0）
  // 単発の「笑」「うん」でstyle_clashが発火するのを防ぐ
  const styleDelta = Math.abs(profileA.direct_vs_diplomatic - profileB.direct_vs_diplomatic);
  if (styleDelta > 1.0 && nvc.nvcScore < 0.4 && escalation.level >= 0.1) {
    return {
      shouldMediate: true,
      reason: "style_clash",
      urgency: "medium",
    };
  }

  // 4. 暗黙ニーズ検出 — escalation は低いがニーズが未表現
  if (nvc.needs.length > 0 && nvc.needs.every(n => !n.explicit)) {
    if (escalation.trend === "escalating") {
      return {
        shouldMediate: true,
        reason: "unspoken_needs",
        urgency: "low",
      };
    }
  }

  // 5. Withdrawal streak（石壁化の兆候）
  if (escalation.withdrawalStreak >= 3) {
    return {
      shouldMediate: true,
      reason: "rupture_risk",
      urgency: "medium",
    };
  }

  // 6. 相互エスカレーション（2回でも intensifying なら）
  if (escalation.reciprocalEscalation?.detected && escalation.reciprocalEscalation.intensifying) {
    return {
      shouldMediate: true,
      reason: "escalation_detected",
      urgency: "low",
    };
  }

  return { shouldMediate: false, reason: "none", urgency: "low" };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM 仲介提案生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MEDIATION_SCHEMA = {
  type: "object",
  properties: {
    for_sender: {
      type: "object",
      properties: {
        reframe: { type: "string" },
        insight: { type: "string" },
        action_hint: { type: "string" },
      },
      required: ["reframe", "insight", "action_hint"],
    },
    for_receiver: {
      type: "object",
      properties: {
        reframe: { type: "string" },
        insight: { type: "string" },
        action_hint: { type: "string" },
      },
      required: ["reframe", "insight", "action_hint"],
    },
    shared_insight: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["for_sender", "for_receiver", "shared_insight", "confidence"],
} as const;

type LLMMediationOutput = {
  for_sender: { reframe: string; insight: string; action_hint: string };
  for_receiver: { reframe: string; insight: string; action_hint: string };
  shared_insight: string;
  confidence: number;
};

function buildProfileSummary(label: string, profile: IntentTranslationProfile): string {
  const style = profile.direct_vs_diplomatic > 0.3
    ? "外交的・配慮型"
    : profile.direct_vs_diplomatic < -0.3
      ? "率直・直球型"
      : "バランス型";

  const attachment = profile.attachment_style > 0.3
    ? "不安型（確認を求めやすい）"
    : profile.attachment_style < -0.3
      ? "回避型（距離を保ちたい）"
      : "安定型";

  const conflict = profile.conflict_style > 0.3
    ? "対決型（率直に不満を言う）"
    : profile.conflict_style < -0.3
      ? "回避型（不満を溜める）"
      : "バランス型";

  return [
    `## ${label}`,
    `- コミュニケーションスタイル: ${style}`,
    `- 愛着パターン: ${attachment}`,
    `- 葛藤スタイル: ${conflict}`,
    `- 感情制御: ${profile.emotional_regulation > 0.3 ? "高い" : profile.emotional_regulation < -0.3 ? "低い" : "普通"}`,
    `- 表裏の差: ${profile.public_private_gap > 0.3 ? "大きい（本音を隠しやすい）" : "小さい（表裏一致）"}`,
  ].join("\n");
}

function buildNVCContext(nvc: NVCDecomposition): string {
  const parts: string[] = ["## NVC分析"];

  if (nvc.feelings.length > 0) {
    parts.push(`- 感情: ${nvc.feelings.map(f => `${f.feeling}（${f.ownership === "self" ? "自己所有" : "相手帰属"}）`).join(", ")}`);
  }
  if (nvc.needs.length > 0) {
    parts.push(`- ニーズ: ${nvc.needs.map(n => `${n.need}（${n.explicit ? "明示" : "暗黙"}）`).join(", ")}`);
  }
  if (nvc.request) {
    parts.push(`- リクエスト: ${nvc.request.type}型`);
  }
  parts.push(`- NVC準拠度: ${(nvc.nvcScore * 100).toFixed(0)}%`);

  return parts.join("\n");
}

async function generateMediationSuggestions(
  input: MediationInput,
  nvc: NVCDecomposition,
  escalation: EscalationState,
  decision: MediationDecision,
): Promise<LLMMediationOutput | null> {
  const isSenderA = input.latestMessage.senderId === input.profileA.userId;
  const senderProfile = isSenderA ? input.profileA : input.profileB;
  const receiverProfile = isSenderA ? input.profileB : input.profileA;

  const horsemenNote = escalation.fourHorsemen.length > 0
    ? `⚠️ 四騎士パターン検出: ${escalation.fourHorsemen.map(h => `${h.pattern}（${h.trigger}）`).join(", ")}`
    : "";

  const conversationBlock = input.conversationContext
    .slice(-8)
    .map(t => `[${t.senderId === input.profileA.userId ? "A" : "B"}] ${t.body}`)
    .join("\n");

  const systemPrompt = [
    "あなたは二人のテキスト会話を仲介する共同Alterです。",
    "NVC（非暴力コミュニケーション）の原則に基づき、双方に建設的な提案をしてください。",
    "",
    "## 仲介の原則",
    "- どちらが正しいかを判定しない。両者の視点を尊重する",
    "- 感情を否定しない。感情の背後にあるニーズを言語化する",
    "- 「〜かもしれません」「〜の可能性があります」を使い、断定しない",
    "- 相手のプロファイルに合わせた表現を提案する（率直な人には率直に、外交的な人には丁寧に）",
    "- shared_insight は両者に見せても安全な洞察（片方の秘密を暴露しない）",
    "",
    buildProfileSummary("送信者", senderProfile),
    "",
    buildProfileSummary("受信者", receiverProfile),
    "",
    buildNVCContext(nvc),
    "",
    horsemenNote ? `## ⚠️ 警告\n${horsemenNote}` : "",
    "",
    "## 会話履歴",
    conversationBlock,
    "",
    "## 最新メッセージ（仲介トリガー）",
    `[${isSenderA ? "A" : "B"}] 「${input.latestMessage.body}」`,
    "",
    `## 仲介理由: ${decision.reason}（緊急度: ${decision.urgency}）`,
    "",
    "## 出力ルール",
    "- for_sender.reframe: 同じ内容をNVCに沿って言い換えた文。自然な日本語で",
    "- for_sender.insight: 「相手は今〜を感じているかもしれません」形式",
    "- for_sender.action_hint: 「〜と聞いてみると良いかもしれません」形式",
    "- for_receiver.reframe: 受信者が受け取ったメッセージの解釈補助",
    "- for_receiver.insight: 「この人は〜を必要としているかもしれません」形式",
    "- for_receiver.action_hint: 「〜と返すと伝わりやすいかもしれません」形式",
    "- shared_insight: 両者に見せる1文の洞察。片方のプロファイルを暴露しないこと",
    "- confidence: 0.0-1.0",
    "",
    SAFETY_PROMPT_BLOCK,
  ].join("\n");

  try {
    const result = await runAI({
      taskType: "mediation",
      systemPrompt,
      prompt: `仲介してください。最新メッセージ: 「${input.latestMessage.body}」`,
      jsonSchema: MEDIATION_SCHEMA as unknown as Record<string, unknown>,
      requireJson: true,
      temperature: 0.4,
      maxOutputTokens: 1000,
    });

    if (result.structured) {
      const output = result.structured as unknown as LLMMediationOutput;
      // 安全ルール適用: 全テキストフィールドに対して
      output.for_sender.reframe = enforceSafetyRules(output.for_sender.reframe).sanitized;
      output.for_sender.insight = enforceSafetyRules(output.for_sender.insight).sanitized;
      output.for_sender.action_hint = enforceSafetyRules(output.for_sender.action_hint).sanitized;
      output.for_receiver.reframe = enforceSafetyRules(output.for_receiver.reframe).sanitized;
      output.for_receiver.insight = enforceSafetyRules(output.for_receiver.insight).sanitized;
      output.for_receiver.action_hint = enforceSafetyRules(output.for_receiver.action_hint).sanitized;
      output.shared_insight = enforceSafetyRules(output.shared_insight).sanitized;
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

/**
 * 共同 Alter 仲介 — メインエントリ
 *
 * 1. 最新メッセージの NVC 分析
 * 2. 会話全体のエスカレーション評価
 * 3. 仲介必要性の判定
 * 4. 必要な場合、LLM で両者への提案を生成
 */
export async function mediate(input: MediationInput): Promise<MediationResult> {
  // ── Layer 1: ルールベース分析 ──
  const nvcAnalysis = analyzeNVCRuleBased(input.latestMessage.body);
  const currentHorsemen = detectFourHorsemen(input.latestMessage.body);
  const escalation = assessEscalation(input.conversationContext, currentHorsemen);
  let decision = decideMediationNeed(
    nvcAnalysis,
    escalation,
    input.profileA,
    input.profileB,
  );

  // ── P1 連携仲介（施策B）──
  // Phase 1 が介入判定済み（送信者に「伝わり方注意」と判断）+
  // 高曖昧性の短文 + 十分な会話文脈 → 撤退・諦めパターンとして仲介。
  // 条件:
  //   - P1 が non-silent（P1 ルール層が「リスクあり」と判断済み）
  //   - メッセージ ≤ 4文字（"別に" "もういい" 等の撤退表現）
  //   - ambiguityFactor ≥ 0.95（明確に曖昧な表現）
  //   - 会話文脈 ≥ 2ターン（単発メッセージでは発火しない）
  // 安全弁:
  //   - msgLen > 4 で "まあいいよ"(5chars, shouldMediate=false) を除外
  //   - 撤退パターン限定で "もういいって"(6chars) を捕捉しつつ
  //     "勝手にすれば"(6chars, shouldMediate=false) は除外
  //   - context < 2 で A-3 "別に"(context=1, shouldMediate=false) を除外
  if (
    !decision.shouldMediate
    && input.phase1InterventionLevel
    && input.phase1InterventionLevel !== "silent"
  ) {
    const msgLen = input.latestMessage.body.length;
    const ambiguityFactor = computeAmbiguityFactor(input.latestMessage.body);
    // 撤退表現の検出: "もういい" 系は打ち切り・諦めパターン
    // "勝手にすれば" 等の怒り表現は含めない（shouldMediate=false のケースがある）
    const isWithdrawalExpr = /もう(?:いい|いいよ|いいって|いいから)/.test(
      input.latestMessage.body,
    );
    const isShortAmbiguous = msgLen <= 4 && ambiguityFactor >= 0.95;
    const isWithdrawalAmbiguous = isWithdrawalExpr && ambiguityFactor >= 0.95;
    if ((isShortAmbiguous || isWithdrawalAmbiguous) && input.conversationContext.length >= 2) {
      decision = {
        shouldMediate: true,
        reason: "rupture_risk",
        urgency: input.phase1InterventionLevel === "active" ? "medium" : "low",
      };
    }
  }

  // ── Demand-Withdraw 検出（施策C）──
  // 一方が追い詰め（長文・要求）、他方が逃げる（短文化）パターン。
  // escalation.level は低いが関係にダメージが大きい。
  // 条件:
  //   - P1 が non-silent（最新メッセージにリスクあり）
  //   - 会話文脈 ≥ 3ターン（パターン判定に最低限必要）
  //   - 片方の直近2メッセージが短文（≤ 5 chars）= withdrawing
  //   - もう片方に長文（> 10 chars）メッセージがある = demanding
  //   - temperatureGap > 0.5（メッセージ投資量に明確な非対称性がある）
  //     B-93 回帰で確認: 両者の長さが近い場合（gap≈0.39）は
  //     demand-withdraw ではなく自然な会話パターン
  if (
    !decision.shouldMediate
    && input.phase1InterventionLevel
    && input.phase1InterventionLevel !== "silent"
    && input.conversationContext.length >= 3
    && escalation.temperatureGap > 0.5
  ) {
    const senderIds = [...new Set(input.conversationContext.map(t => t.senderId))];
    if (senderIds.length >= 2) {
      for (const withdrawerId of senderIds) {
        const withdrawerMsgs = input.conversationContext
          .filter(t => t.senderId === withdrawerId);
        const lastTwo = withdrawerMsgs.slice(-2);
        if (lastTwo.length >= 2 && lastTwo.every(m => m.body.length <= 5)) {
          // この話者は引いている → 相手が追い詰めているか確認
          const demanderId = senderIds.find(id => id !== withdrawerId);
          if (demanderId) {
            const demanderMsgs = input.conversationContext
              .filter(t => t.senderId === demanderId);
            if (demanderMsgs.some(m => m.body.length > 10)) {
              decision = {
                shouldMediate: true,
                reason: "escalation_detected",
                urgency: "low",
              };
              break;
            }
          }
        }
      }
    }
  }

  // ── 仲介不要の場合 ──
  if (!decision.shouldMediate) {
    return {
      forSender: null,
      forReceiver: null,
      sharedInsight: null,
      nvcAnalysis,
      escalation,
      decision,
      confidence: 0.8,
    };
  }

  // ── Layer 2: LLM で仲介提案生成 ──
  const llmResult = await generateMediationSuggestions(input, nvcAnalysis, escalation, decision);

  if (llmResult) {
    return {
      forSender: {
        reframe: llmResult.for_sender.reframe,
        insight: llmResult.for_sender.insight,
        actionHint: llmResult.for_sender.action_hint,
      },
      forReceiver: {
        reframe: llmResult.for_receiver.reframe,
        insight: llmResult.for_receiver.insight,
        actionHint: llmResult.for_receiver.action_hint,
      },
      sharedInsight: llmResult.shared_insight,
      nvcAnalysis,
      escalation,
      decision,
      confidence: llmResult.confidence,
    };
  }

  // ── LLM 失敗時: ルールベースのフォールバック ──
  return {
    forSender: generateRuleBasedSuggestion(nvcAnalysis, decision, "sender"),
    forReceiver: generateRuleBasedSuggestion(nvcAnalysis, decision, "receiver"),
    sharedInsight: "お互いの気持ちを確認し合うと、すれ違いが解消されるかもしれません",
    nvcAnalysis,
    escalation,
    decision,
    confidence: 0.3,
  };
}

/**
 * LLM なしのフォールバック提案（ルールベース）。
 */
function generateRuleBasedSuggestion(
  nvc: NVCDecomposition,
  decision: MediationDecision,
  role: "sender" | "receiver",
): MediationSuggestion {
  if (role === "sender") {
    // 送信者向け: NVC に沿った言い換えガイド
    if (decision.reason === "four_horsemen_detected") {
      return {
        reframe: "具体的な行動について、自分の気持ちを伝えてみてください",
        insight: "相手は攻撃されていると感じている可能性があります",
        actionHint: "「〜されると私は〜と感じる」という形で伝え直してみてください",
      };
    }

    if (nvc.needs.length > 0) {
      const need = nvc.needs[0];
      return {
        reframe: `「${need.need}」を直接伝えてみてください`,
        insight: "あなたのニーズが相手に伝わっていない可能性があります",
        actionHint: `「私は${need.need}が必要なんだ」と伝えてみてください`,
      };
    }

    return {
      reframe: "感じていることを、具体的な行動と結びつけて伝えてみてください",
      insight: "相手はあなたの気持ちに気づいていないかもしれません",
      actionHint: "「〜のとき、私は〜と感じた」と伝えてみてください",
    };
  }

  // 受信者向け: 相手の意図を理解するガイド
  if (decision.reason === "four_horsemen_detected") {
    return {
      reframe: "相手の言葉の裏に、何かしらの痛みやニーズがあるかもしれません",
      insight: "相手は自分の気持ちをうまく表現できていない可能性があります",
      actionHint: "「何が一番つらい？」と聞いてみると、本音が出てくるかもしれません",
    };
  }

  if (nvc.feelings.length > 0) {
    const feeling = nvc.feelings[0];
    return {
      reframe: `相手は「${feeling.feeling}」を感じているようです`,
      insight: "この感情の背後に、満たされていないニーズがあるかもしれません",
      actionHint: "「そう感じてるんだね」とまず受け止めてみてください",
    };
  }

  return {
    reframe: "相手のメッセージの意図を確認してみてください",
    insight: "テキストでは意図が伝わりにくいことがあります",
    actionHint: "「どういう意味で言ってる？」と確認してみてください",
  };
}
