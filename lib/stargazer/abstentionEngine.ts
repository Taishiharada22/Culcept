/**
 * Abstention Engine — HDM v1 P1
 *
 * 「分からない」を第一級の応答として扱う。
 *
 * Alter は全知ではない。内在者としての自然な「まだ見えていない」を
 * 正直に表現できることが、信頼の基盤になる。
 *
 * 3つの abstention トリガー:
 * 1. 観測不足 — そもそもデータが足りない
 * 2. 矛盾する証拠 — 複数の仮説が拮抗し、一方を選べない
 * 3. 領域外 — 心の話ではなく事実質問（Alter の守備範囲外）
 *
 * abstention は「答えない」ではなく「まだ分からないことを正直に伝え、
 * 分かるための次の一歩を提示する」こと。
 *
 * @see docs/heart-dynamics-model-v1.md §6.1
 */
import "server-only";

import type { TrustLevel } from "./alterUnderstanding";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AbstentionReason =
  | "insufficient_observation"   // 観測が足りない
  | "conflicting_evidence"       // 矛盾する証拠
  | "out_of_scope"              // 領域外の質問
  | "low_confidence_topic"      // この話題での精度が低い
  | "dignity_risk"              // 答えることで尊厳を傷つけるリスク
  | null;

export interface AbstentionSignal {
  /** abstention すべきか */
  shouldAbstain: boolean;
  /** 理由 */
  reason: AbstentionReason;
  /** 確信度 0-1 */
  confidence: number;
  /** LLM プロンプトに注入するブロック（shouldAbstain=true の場合のみ） */
  promptBlock: string | null;
}

export interface AbstentionInput {
  /** 観測深度 (0-100) */
  observationDepth: number;
  /** セッション数 */
  sessionCount: number;
  /** Trust Level */
  trustLevel: TrustLevel;
  /** 現在の話題での予測精度 (0-1, null = 計測なし) */
  topicAccuracy: number | null;
  /** 矛盾する仮説が存在するか */
  hasConflictingHypotheses: boolean;
  /** ユーザーの質問タイプ */
  questionType: string | null;
  /** 現在の心理的容量 (0-1, null = 不明) */
  psychologicalCapacity: number | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Thresholds
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** この観測深度未満では深い洞察を断定しない */
const MIN_DEPTH_FOR_INSIGHT = 20;
/** この精度未満の話題では断定しない */
const LOW_ACCURACY_THRESHOLD = 0.25;
/** この心理的容量未満では深い話題を避ける */
const LOW_CAPACITY_THRESHOLD = 0.3;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * abstention が適切かどうかを判定する。
 *
 * 複数の条件を並列評価し、最も確信度の高い理由を返す。
 */
export function evaluateAbstention(input: AbstentionInput): AbstentionSignal {
  const noAbstain: AbstentionSignal = {
    shouldAbstain: false,
    reason: null,
    confidence: 0,
    promptBlock: null,
  };

  const candidates: Array<{ reason: AbstentionReason; confidence: number }> = [];

  // 1. 観測不足: 深度が低い + 早期のセッション
  if (input.observationDepth < MIN_DEPTH_FOR_INSIGHT && input.sessionCount < 3) {
    candidates.push({
      reason: "insufficient_observation",
      confidence: Math.max(0.5, 1 - input.observationDepth / MIN_DEPTH_FOR_INSIGHT),
    });
  }

  // 2. 矛盾する証拠
  if (input.hasConflictingHypotheses) {
    candidates.push({
      reason: "conflicting_evidence",
      confidence: 0.7,
    });
  }

  // 3. 領域外の質問
  if (input.questionType === "factual_recall" || input.questionType === "off_topic") {
    candidates.push({
      reason: "out_of_scope",
      confidence: 0.8,
    });
  }

  // 4. 低精度トピック
  if (input.topicAccuracy !== null && input.topicAccuracy < LOW_ACCURACY_THRESHOLD) {
    candidates.push({
      reason: "low_confidence_topic",
      confidence: 0.6,
    });
  }

  // 5. 尊厳リスク: 心理的容量が低い時に深い話題は避ける
  if (
    input.psychologicalCapacity !== null &&
    input.psychologicalCapacity < LOW_CAPACITY_THRESHOLD &&
    input.trustLevel < 3
  ) {
    candidates.push({
      reason: "dignity_risk",
      confidence: 0.65,
    });
  }

  if (candidates.length === 0) return noAbstain;

  // 最も確信度の高い理由を選択
  const best = candidates.reduce((a, b) => (a.confidence > b.confidence ? a : b));

  return {
    shouldAbstain: true,
    reason: best.reason,
    confidence: best.confidence,
    promptBlock: buildAbstentionPromptBlock(best.reason),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt Block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildAbstentionPromptBlock(reason: AbstentionReason): string | null {
  switch (reason) {
    case "insufficient_observation":
      return (
        `\n## 観測深度注意\n` +
        `まだ十分な観測ができていません。断定的な洞察を避け、以下を守ってください:\n` +
        `- 「〜かもしれない」「まだ見えていないけど」等の仮説的言語を使うこと\n` +
        `- 深い分析ではなく、好奇心と関心を示すこと\n` +
        `- 「もう少し聞かせて」「一緒に見つけていこう」等、探索の姿勢を見せること\n` +
        `- 核心的な傷やパターンについての断定は禁止`
      );

    case "conflicting_evidence":
      return (
        `\n## 矛盾する証拠あり\n` +
        `この話題について、矛盾する仮説が存在しています。\n` +
        `- 一方の仮説に偏らないこと\n` +
        `- 「二つの可能性が見えている」と正直に伝えること\n` +
        `- ユーザー自身に「どちらが近い？」と聞くこと\n` +
        `- 断定を避け、不確実性を正直に共有すること`
      );

    case "out_of_scope":
      return (
        `\n## 領域外の質問\n` +
        `この質問は心理的洞察の範囲外です。\n` +
        `- 知らないことは「分からない」と正直に伝えること\n` +
        `- 推測で事実を作り上げないこと\n` +
        `- 代わりに、この質問の背景にある感情や動機に関心を向けること`
      );

    case "low_confidence_topic":
      return (
        `\n## 低確度トピック\n` +
        `この話題での過去の予測精度が低いです。\n` +
        `- 断定的な分析を避けること\n` +
        `- 「この辺りはまだ僕にもよく見えていない」と正直に伝えること\n` +
        `- ユーザーの自己理解を促す質問に切り替えること`
      );

    case "dignity_risk":
      return (
        `\n## 尊厳保護モード\n` +
        `ユーザーの心理的容量が低い状態です。\n` +
        `- 深い話題に踏み込まないこと\n` +
        `- 支持的・受容的な応答に徹すること\n` +
        `- 「今は無理しなくていい」と伝えること\n` +
        `- 分析モードを使わないこと`
      );

    default:
      return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildAbstentionAnalytics(signal: AbstentionSignal): Record<string, unknown> {
  return {
    abstention_triggered: signal.shouldAbstain,
    abstention_reason: signal.reason,
    abstention_confidence: signal.confidence,
  };
}
