// lib/stargazer/adaptiveFollowUp.ts
// 適応的フォローアップ質問エンジン
//
// 固定的なフォローアップではなく、回答パターン・躊躇信号・矛盾検出・回避パターンから
// 動的に次の質問を生成する。質問の目的は「深層に到達すること」であり、
// 表面的な確認ではない。
//
// 設計原則:
// - 応答時間が長い = 触れたくない/整理できていない領域 = 最も掘るべき場所
// - 矛盾 = 多面性の証拠 = 自己理解の入口
// - 回避 = 無意識の防衛 = 間接的に迂回して近づく
// - セッションが深まるほど、表面質問から状況質問・シナリオ質問へ

import { TRAIT_AXES, getAxisLabels, type TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AdaptiveFollowUpContext {
  /** 現在回答した軸 */
  currentAxisId: string;
  /** 現在のスコア (-1 ~ +1) */
  currentScore: number;
  /** 今回の応答時間 (ms) */
  responseTimeMs: number;
  /** セッション内の平均応答時間 (ms) */
  averageResponseTimeMs: number;
  /** この軸の過去のスコア履歴 */
  previousScoresOnAxis: number[];
  /** 矛盾が検出されたか */
  contradictionDetected: boolean;
  /** 回避が検出されたか */
  avoidanceDetected: boolean;
  /** セッション内の回答数 */
  sessionDepth: number;
  /** 直近の感情トーン (null = 不明) */
  recentEmotionalTone: string | null;
}

export type FollowUpType =
  | "drill_down"
  | "contradiction_probe"
  | "avoidance_probe"
  | "temporal_compare"
  | "scenario";

export type InsightType =
  | "deepening"
  | "contradiction"
  | "blind_spot"
  | "pattern";

export interface FollowUpQuestion {
  /** 質問文 (日本語) */
  text: string;
  /** 質問のカテゴリ */
  type: FollowUpType;
  /** 対象の軸 */
  targetAxisId: string;
  /** 期待されるインサイトの種類 */
  expectedInsightType: InsightType;
  /** 優先度 (0-1, 高いほど優先) */
  priority: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hesitation Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 応答時間の比率を計算。1.0 = 平均、2.0 = 平均の2倍
 */
function responseTimeRatio(ctx: AdaptiveFollowUpContext): number {
  if (ctx.averageResponseTimeMs <= 0) return 1.0;
  return ctx.responseTimeMs / ctx.averageResponseTimeMs;
}

/**
 * 躊躇レベルを判定
 * - normal: 平均的
 * - slight: やや長い (1.3x-2.0x)
 * - significant: かなり長い (2.0x-3.0x)
 * - extreme: 極端に長い (3.0x+)
 */
type HesitationLevel = "normal" | "slight" | "significant" | "extreme";

function detectHesitationLevel(ctx: AdaptiveFollowUpContext): HesitationLevel {
  const ratio = responseTimeRatio(ctx);
  if (ratio >= 3.0) return "extreme";
  if (ratio >= 2.0) return "significant";
  if (ratio >= 1.3) return "slight";
  return "normal";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contradiction Analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 過去スコアとの矛盾度を計算 (0-1)
 */
function computeTemporalContradiction(ctx: AdaptiveFollowUpContext): number {
  const prev = ctx.previousScoresOnAxis;
  if (prev.length === 0) return 0;

  const recentAvg = prev.slice(-3).reduce((s, v) => s + v, 0) / Math.min(prev.length, 3);
  const diff = Math.abs(ctx.currentScore - recentAvg);
  // スコア範囲は -1 ~ +1 なので最大差は 2.0
  return Math.min(1.0, diff / 1.5);
}

/**
 * スコアが方向転換したか (正→負 or 負→正)
 */
function detectDirectionShift(ctx: AdaptiveFollowUpContext): boolean {
  const prev = ctx.previousScoresOnAxis;
  if (prev.length === 0) return false;
  const lastScore = prev[prev.length - 1];
  return (lastScore > 0.2 && ctx.currentScore < -0.2) ||
         (lastScore < -0.2 && ctx.currentScore > 0.2);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Avoidance Pattern Analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 中央値回答 (スコア ~0) は回避のサインの可能性がある。
 * 応答が速い + 中央値 = 考えたくないから無難な回答を選んだ。
 */
function isNeutralDismissal(ctx: AdaptiveFollowUpContext): boolean {
  const isNeutral = Math.abs(ctx.currentScore) < 0.15;
  const isFast = responseTimeRatio(ctx) < 0.6;
  return isNeutral && isFast;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Follow-Up Question Generators
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getAxisDescription(axisId: string): { left: string; right: string } {
  const labels = getAxisLabels(axisId as TraitAxisKey);
  if (labels) return labels;
  return { left: axisId, right: axisId };
}

/**
 * 躊躇に対するフォローアップ
 */
function generateHesitationFollowUps(
  ctx: AdaptiveFollowUpContext,
  hesitation: HesitationLevel,
): FollowUpQuestion[] {
  if (hesitation === "normal") return [];

  const { left, right } = getAxisDescription(ctx.currentAxisId);
  const questions: FollowUpQuestion[] = [];

  if (hesitation === "extreme") {
    questions.push({
      text: `「${left}」と「${right}」の間で、すぐに答えられなかった。何がこの判断を難しくしている？`,
      type: "drill_down",
      targetAxisId: ctx.currentAxisId,
      expectedInsightType: "deepening",
      priority: 0.95,
    });
    questions.push({
      text: `もし誰にも見られていないとしたら、「${left}」と「${right}」のどちらに寄ると思う？`,
      type: "drill_down",
      targetAxisId: ctx.currentAxisId,
      expectedInsightType: "blind_spot",
      priority: 0.88,
    });
  } else if (hesitation === "significant") {
    questions.push({
      text: `この領域で迷いが見える。「${left}」寄りの自分と「${right}」寄りの自分、どちらが本来の自分に近い？`,
      type: "drill_down",
      targetAxisId: ctx.currentAxisId,
      expectedInsightType: "deepening",
      priority: 0.82,
    });
  } else {
    // slight
    questions.push({
      text: `「${left}」と「${right}」のバランスが場面によって変わることはある？`,
      type: "drill_down",
      targetAxisId: ctx.currentAxisId,
      expectedInsightType: "pattern",
      priority: 0.55,
    });
  }

  return questions;
}

/**
 * 矛盾に対するフォローアップ
 */
function generateContradictionFollowUps(
  ctx: AdaptiveFollowUpContext,
): FollowUpQuestion[] {
  if (!ctx.contradictionDetected && computeTemporalContradiction(ctx) < 0.4) {
    return [];
  }

  const { left, right } = getAxisDescription(ctx.currentAxisId);
  const questions: FollowUpQuestion[] = [];
  const contradiction = computeTemporalContradiction(ctx);
  const directionShift = detectDirectionShift(ctx);

  if (directionShift) {
    const prev = ctx.previousScoresOnAxis;
    const lastScore = prev[prev.length - 1];
    const prevSide = lastScore > 0 ? right : left;
    const nowSide = ctx.currentScore > 0 ? right : left;

    questions.push({
      text: `以前は「${prevSide}」寄りだったのが、今は「${nowSide}」に変わっている。何かきっかけがあった？ それとも、もともと両方が自分の中にある？`,
      type: "contradiction_probe",
      targetAxisId: ctx.currentAxisId,
      expectedInsightType: "contradiction",
      priority: 0.92,
    });
  }

  if (ctx.contradictionDetected) {
    questions.push({
      text: `この領域で、自分が語る自分と行動データが食い違っている。どちらが「本当の自分」に近いと感じる？`,
      type: "contradiction_probe",
      targetAxisId: ctx.currentAxisId,
      expectedInsightType: "contradiction",
      priority: 0.9,
    });
  }

  if (contradiction >= 0.6) {
    questions.push({
      text: `「${left}⇔${right}」について、今日の回答と過去の回答がかなり違う。今の気分や状況の影響？ それとも考えが変わった？`,
      type: "temporal_compare",
      targetAxisId: ctx.currentAxisId,
      expectedInsightType: "pattern",
      priority: 0.78,
    });
  }

  return questions;
}

/**
 * 回避に対するフォローアップ（間接的に迂回する）
 */
function generateAvoidanceFollowUps(
  ctx: AdaptiveFollowUpContext,
): FollowUpQuestion[] {
  const isAvoiding = ctx.avoidanceDetected || isNeutralDismissal(ctx);
  if (!isAvoiding) return [];

  const { left, right } = getAxisDescription(ctx.currentAxisId);
  const questions: FollowUpQuestion[] = [];

  // 直接聞かない。シナリオで迂回する
  questions.push({
    text: `友人が「${left}」と「${right}」で悩んでいたら、どんなアドバイスをする？`,
    type: "avoidance_probe",
    targetAxisId: ctx.currentAxisId,
    expectedInsightType: "blind_spot",
    priority: 0.75,
  });

  questions.push({
    text: `この領域について、他の人の判断を見たときに「それは違う」と感じることはある？ どんなとき？`,
    type: "avoidance_probe",
    targetAxisId: ctx.currentAxisId,
    expectedInsightType: "blind_spot",
    priority: 0.7,
  });

  // 中央値の速い回答に特化
  if (isNeutralDismissal(ctx)) {
    questions.push({
      text: `今の回答、直感で「どちらでもない」を選んだ？ それとも本当にどちらにも寄らない？`,
      type: "avoidance_probe",
      targetAxisId: ctx.currentAxisId,
      expectedInsightType: "blind_spot",
      priority: 0.8,
    });
  }

  return questions;
}

/**
 * セッション深度に応じたシナリオ質問
 */
function generateDepthBasedFollowUps(
  ctx: AdaptiveFollowUpContext,
): FollowUpQuestion[] {
  if (ctx.sessionDepth < 5) return [];

  const { left, right } = getAxisDescription(ctx.currentAxisId);
  const questions: FollowUpQuestion[] = [];

  // 関連する軸を見つける（同じカテゴリの別の軸）
  const currentAxis = TRAIT_AXES.find(a => a.id === ctx.currentAxisId);
  const relatedAxes = currentAxis
    ? TRAIT_AXES.filter(a => a.category === currentAxis.category && a.id !== ctx.currentAxisId)
    : [];

  if (ctx.sessionDepth >= 8 && relatedAxes.length > 0) {
    // 深いセッション: クロス軸のシナリオ
    const related = relatedAxes[0];
    questions.push({
      text: `「${left}⇔${right}」の傾向と、「${related.labelLeft}⇔${related.labelRight}」の傾向は、あなたの中でどう関係している？ 片方が強まるともう片方はどうなる？`,
      type: "scenario",
      targetAxisId: ctx.currentAxisId,
      expectedInsightType: "pattern",
      priority: 0.68,
    });
  }

  if (ctx.sessionDepth >= 5) {
    // ストレス下のシナリオ
    questions.push({
      text: `強いストレスを感じている時、「${left}」と「${right}」のバランスはどちらに傾く？ 普段と同じ？`,
      type: "scenario",
      targetAxisId: ctx.currentAxisId,
      expectedInsightType: "pattern",
      priority: 0.62,
    });
  }

  if (ctx.sessionDepth >= 6 && ctx.recentEmotionalTone) {
    const toneLabel = TONE_LABELS[ctx.recentEmotionalTone] ?? ctx.recentEmotionalTone;
    questions.push({
      text: `今「${toneLabel}」な状態だと思うけど、この気分の時と、真逆の気分の時で、この領域の答えは変わりそう？`,
      type: "scenario",
      targetAxisId: ctx.currentAxisId,
      expectedInsightType: "pattern",
      priority: 0.58,
    });
  }

  return questions;
}

const TONE_LABELS: Record<string, string> = {
  calm: "穏やか",
  anxious: "不安",
  frustrated: "苛立ち",
  joyful: "楽しい",
  tired: "疲れている",
  curious: "好奇心がある",
  neutral: "フラット",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 適応的フォローアップ質問を生成する。
 *
 * 回答パターン・応答時間・矛盾・回避から、最大3つのフォローアップ候補を
 * 優先度付きで返す。
 *
 * 使い方:
 * 1. ユーザーが質問に回答した直後に呼ぶ
 * 2. 返された候補から priority が高い順に1-2問を表示
 * 3. フォローアップへの回答は、次の generateAdaptiveFollowUps の入力にもなる
 */
export function generateAdaptiveFollowUps(
  ctx: AdaptiveFollowUpContext,
): FollowUpQuestion[] {
  const hesitation = detectHesitationLevel(ctx);

  // 全ソースからフォローアップ候補を集める
  const candidates: FollowUpQuestion[] = [
    ...generateHesitationFollowUps(ctx, hesitation),
    ...generateContradictionFollowUps(ctx),
    ...generateAvoidanceFollowUps(ctx),
    ...generateDepthBasedFollowUps(ctx),
  ];

  if (candidates.length === 0) return [];

  // セッション深度による優先度調整
  for (const q of candidates) {
    // 浅いセッションでは矛盾プローブの優先度を下げる (信頼関係が未構築)
    if (ctx.sessionDepth < 3 && q.type === "contradiction_probe") {
      q.priority *= 0.6;
    }
    // 深いセッションではシナリオの優先度を上げる
    if (ctx.sessionDepth >= 7 && q.type === "scenario") {
      q.priority *= 1.15;
    }
    // 極端な躊躇があるときは drill_down の優先度を最大に
    if (hesitation === "extreme" && q.type === "drill_down") {
      q.priority = Math.min(1.0, q.priority * 1.2);
    }

    q.priority = Math.min(1.0, Math.max(0, q.priority));
  }

  // 優先度順に並べて上位3つを返す
  candidates.sort((a, b) => b.priority - a.priority);

  // 同じタイプの質問は最大1つ (多様性を確保)
  const result: FollowUpQuestion[] = [];
  const usedTypes = new Set<FollowUpType>();

  for (const q of candidates) {
    if (result.length >= 3) break;
    if (usedTypes.has(q.type) && result.length >= 2) continue;
    result.push(q);
    usedTypes.add(q.type);
  }

  return result;
}

/**
 * フォローアップが必要かどうかを簡易判定する。
 * UI 側で「フォローアップを出すかどうか」の分岐に使う。
 */
export function shouldShowFollowUp(ctx: AdaptiveFollowUpContext): boolean {
  const hesitation = detectHesitationLevel(ctx);

  // 躊躇が大きい
  if (hesitation === "extreme" || hesitation === "significant") return true;

  // 矛盾がある
  if (ctx.contradictionDetected) return true;
  if (computeTemporalContradiction(ctx) >= 0.5) return true;

  // 回避している
  if (ctx.avoidanceDetected) return true;
  if (isNeutralDismissal(ctx)) return true;

  // セッションが深い (時々シナリオを挟む)
  if (ctx.sessionDepth >= 6 && ctx.sessionDepth % 3 === 0) return true;

  return false;
}

/**
 * フォローアップの結果から、次の観測に活用するメタ情報を抽出する。
 * フォローアップへの回答パターン自体が新たな行動データになる。
 */
export function extractFollowUpSignals(params: {
  followUpType: FollowUpType;
  responseTimeMs: number;
  averageResponseTimeMs: number;
  didSkip: boolean;
  axisId: string;
}): {
  signalType: string;
  value: number;
  context: string;
} {
  const ratio = params.averageResponseTimeMs > 0
    ? params.responseTimeMs / params.averageResponseTimeMs
    : 1.0;

  if (params.didSkip) {
    return {
      signalType: "followup_skip",
      value: 1,
      context: `${params.followUpType}:${params.axisId}`,
    };
  }

  return {
    signalType: "followup_response",
    value: ratio,
    context: `${params.followUpType}:${params.axisId}`,
  };
}
