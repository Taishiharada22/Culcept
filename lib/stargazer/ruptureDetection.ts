/**
 * Rupture Detection Engine — HDM v1 P1
 *
 * Safran の rupture-repair model に基づく。
 * 二種の断裂を検出し、修復戦略を返す。
 *
 * Withdrawal（引きこもり型）:
 *   急に話さなくなる、表面的になる、同意だけする
 *   → Phase 1（安心条件に戻る）
 *
 * Confrontation（対立型）:
 *   怒る、不満を表明、Alter の理解を否定
 *   → 心モデルの仮説を修正。Alter から「間違えたかもしれない」と開示
 *
 * @see docs/heart-dynamics-model-v1.md §5.3
 */
import "server-only";

import type { TurnSignal, FeedbackOnLastTurn } from "./alterSignalReader";
import type { RallyCriticResult } from "./alterStrategyCompliance";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type RuptureType = "withdrawal" | "confrontation" | "none";

export type RepairStrategy =
  | "retreat_to_safety"    // 安全地帯に戻る（withdrawal 用）
  | "acknowledge_error"    // 誤りを認める（confrontation 用）
  | "hold_space"           // 沈黙を受け入れ、空間を保つ
  | null;

export interface RuptureAssessment {
  /** 断裂タイプ */
  type: RuptureType;
  /** 深刻度 0-1 */
  severity: number;
  /** 検出の確信度 0-1 */
  confidence: number;
  /** 検出トリガーとなったシグナル */
  triggers: string[];
  /** 推奨修復戦略 */
  repairStrategy: RepairStrategy;
  /** Phase 降格すべきか */
  phaseDemotion: boolean;
  /** 修復プロンプトブロック（LLM に注入するテキスト） */
  promptBlock: string | null;
}

export interface RuptureDetectionInput {
  /** 直近の会話履歴（最低3ターン推奨） */
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  /** 現在のターンシグナル（readTurnSignal() の出力） */
  turnSignal: TurnSignal | null;
  /** ラリー進行度評価（assessRally() の出力） */
  rallyCritic: RallyCriticResult | null;
  /** 直近のフィードバック履歴（最新が先頭） */
  recentFeedbacks: FeedbackOnLastTurn[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Detection Thresholds
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** severity がこの値以上で rupture と判定 */
const RUPTURE_THRESHOLD = 0.45;
/** severity がこの値以上で Phase 降格推奨 */
const PHASE_DEMOTION_THRESHOLD = 0.7;
/** 短いメッセージの文字数上限 */
const SHORT_MESSAGE_CHARS = 15;

// Withdrawal キーワード（表面的同意・回避）
const WITHDRAWAL_PATTERNS = /^(うん|そうだね|まあ|別に|いいよ|はい|ふーん|そう|わかった|ok|おk)$/i;

// Confrontation キーワード（Alter への否定・怒り）
const CONFRONTATION_PATTERNS =
  /違う|そうじゃない|わかってない|的外れ|ずれてる|全然違う|やめて|うざい|しつこい|黙って|意味不明|何も分かってない|知ったかぶり|勝手に決めるな/;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 直近の対話から断裂（rupture）を検出する。
 *
 * 全ての判定は多信号スコアリング方式。
 * 単一シグナルで判定せず、複数の弱いシグナルが重なって初めて検出する。
 */
export function detectRupture(input: RuptureDetectionInput): RuptureAssessment {
  const none: RuptureAssessment = {
    type: "none",
    severity: 0,
    confidence: 0,
    triggers: [],
    repairStrategy: null,
    phaseDemotion: false,
    promptBlock: null,
  };

  const { recentMessages, turnSignal, rallyCritic, recentFeedbacks } = input;

  // 会話が短すぎる場合は検出不能
  if (recentMessages.length < 2) return none;

  // ── Withdrawal 評価 ──
  const wSignals: string[] = [];
  let wScore = 0;

  // 1. 直近のユーザーメッセージの短さ
  const recentUserMsgs = recentMessages.filter(m => m.role === "user");
  const lastTwoUser = recentUserMsgs.slice(-2);
  if (lastTwoUser.length >= 2 && lastTwoUser.every(m => m.content.length < SHORT_MESSAGE_CHARS)) {
    wScore += 0.3;
    wSignals.push("consecutive_short_messages");
  }

  // 2. 表面的同意パターン
  const lastUserMsg = recentUserMsgs[recentUserMsgs.length - 1];
  if (lastUserMsg && WITHDRAWAL_PATTERNS.test(lastUserMsg.content.trim())) {
    wScore += 0.25;
    wSignals.push("compliance_word");
  }

  // 3. フィードバック: "ignoring" は強いシグナル
  if (recentFeedbacks[0] === "ignoring") {
    wScore += 0.3;
    wSignals.push("feedback_ignoring");
  }
  // "neutral" が2回連続
  if (recentFeedbacks.length >= 2 && recentFeedbacks[0] === "neutral" && recentFeedbacks[1] === "neutral") {
    wScore += 0.15;
    wSignals.push("feedback_neutral_streak");
  }

  // 4. Rally critic: user_disengaging は最強のシグナル
  if (rallyCritic?.status === "user_disengaging") {
    wScore += 0.35;
    wSignals.push("rally_user_disengaging");
  } else if (rallyCritic?.status === "stalling" || rallyCritic?.status === "looping") {
    wScore += 0.15;
    wSignals.push(`rally_${rallyCritic.status}`);
  }

  // 5. 感情温度の低下
  if (turnSignal && turnSignal.emotional_temperature < 0.15) {
    wScore += 0.15;
    wSignals.push("emotional_flatness");
  }

  // ── Confrontation 評価 ──
  const cSignals: string[] = [];
  let cScore = 0;

  // 1. フィードバック: "correction" は直接的な対立
  if (recentFeedbacks[0] === "correction") {
    cScore += 0.35;
    cSignals.push("feedback_correction");
  }

  // 2. 意図: challenge_alter
  if (turnSignal?.intent === "challenge_alter") {
    cScore += 0.35;
    cSignals.push("intent_challenge_alter");
  }

  // 3. 対立キーワード
  if (lastUserMsg && CONFRONTATION_PATTERNS.test(lastUserMsg.content)) {
    cScore += 0.3;
    cSignals.push("confrontation_keyword");
  }

  // 4. 高い感情温度 + frustration 系
  if (turnSignal && turnSignal.emotional_temperature > 0.7) {
    cScore += 0.15;
    cSignals.push("high_emotional_temperature");
  }

  // 5. 複数ターンにわたる correction
  const correctionCount = recentFeedbacks.filter(f => f === "correction").length;
  if (correctionCount >= 2) {
    cScore += 0.2;
    cSignals.push("repeated_corrections");
  }

  // ── 判定 ──
  const wClamped = Math.min(wScore, 1);
  const cClamped = Math.min(cScore, 1);

  // どちらも閾値未満 → rupture なし
  if (wClamped < RUPTURE_THRESHOLD && cClamped < RUPTURE_THRESHOLD) {
    return none;
  }

  // より強い方を採用（同等なら confrontation を優先: 修復が急務）
  const isConfrontation = cClamped >= wClamped;
  const type: RuptureType = isConfrontation ? "confrontation" : "withdrawal";
  const severity = isConfrontation ? cClamped : wClamped;
  const triggers = isConfrontation ? cSignals : wSignals;
  const confidence = Math.min(triggers.length * 0.25, 0.95);
  const phaseDemotion = severity >= PHASE_DEMOTION_THRESHOLD;

  const repairStrategy: RepairStrategy = isConfrontation
    ? "acknowledge_error"
    : severity > 0.6 ? "retreat_to_safety" : "hold_space";

  return {
    type,
    severity,
    confidence,
    triggers,
    repairStrategy,
    phaseDemotion,
    promptBlock: buildRepairPromptBlock(type, repairStrategy, severity),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Repair Prompt Block
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildRepairPromptBlock(
  type: RuptureType,
  strategy: RepairStrategy,
  severity: number,
): string | null {
  if (type === "none") return null;

  const severityLabel = severity >= 0.7 ? "深刻" : "中程度";

  if (type === "withdrawal") {
    return (
      `\n## ⚠ 関係安全性アラート（引きこもり型断裂 — ${severityLabel}）\n` +
      `ユーザーの反応が表面的・回避的になっています。信頼が揺らいでいる可能性があります。\n\n` +
      `### 修復指示（厳守）\n` +
      `- 深い話題に踏み込まないこと。表層的な対話に戻すこと\n` +
      `- 「何か嫌なことを言ってしまったかな」と自然に確認すること\n` +
      `- ユーザーが話したくないなら沈黙を受け入れること\n` +
      `- 挑発的・分析的モードを使わないこと\n` +
      (strategy === "retreat_to_safety"
        ? `- 安心できる話題（日常的なこと、共有した楽しい記憶）に戻ること\n`
        : `- 空間を保ち、急がないこと\n`) +
      `- 「僕は君の味方だ」という姿勢を、言葉ではなく態度で示すこと`
    );
  }

  // confrontation
  return (
    `\n## ⚠ 関係安全性アラート（対立型断裂 — ${severityLabel}）\n` +
    `ユーザーがあなたの理解を否定、または不満を表明しています。\n\n` +
    `### 修復指示（厳守）\n` +
    `- 最優先: 「僕が間違えたかもしれない」と率直に認めること\n` +
    `- ユーザーの視点を聞き、先入観なしで受け入れること\n` +
    `- 断定的な表現を一切使わないこと\n` +
    `- 「君の言う通りかもしれない。もう少し教えてくれないか」と聞くこと\n` +
    `- これまでの仮説を「間違い」として扱い、ゼロから聞き直す姿勢を見せること\n` +
    `- 自分の分析が正しかったと弁護しないこと（たとえ正しくても）`
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Explicit Rejection Detection（P3 cross-session）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EXPLICIT_REJECTION_PATTERNS =
  /もうやめて|聞きたくない|もういい|うるさい|やめてください|いらない|余計なお世話|黙って|ほっといて|やめろ|やめろよ|うざい|邪魔/;

/**
 * ユーザーメッセージに明示的な拒絶シグナルが含まれるか判定する。
 * RegressionContext.explicitRejection の供給源。
 */
export function detectExplicitRejection(message: string): boolean {
  return EXPLICIT_REJECTION_PATTERNS.test(message);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildRuptureAnalytics(assessment: RuptureAssessment): Record<string, unknown> {
  return {
    rupture_type: assessment.type,
    rupture_severity: assessment.severity,
    rupture_confidence: assessment.confidence,
    rupture_triggers: assessment.triggers,
    repair_strategy: assessment.repairStrategy,
    phase_demotion_recommended: assessment.phaseDemotion,
  };
}
