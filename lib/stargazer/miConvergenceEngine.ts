/**
 * Cross-session Micro Insight Convergence Engine
 *
 * 既存 MI パイプラインの上に「セッション跨ぎの複利」を実現する。
 *
 * 設計原則:
 * - セッション N のシグナルを N+1, N+2... と複利的に蓄積
 * - 同じトピックへの繰り返しシグナルはトレンドとして捉える
 * - セッション間で矛盾するシグナルは矛盾フラグを立て MI を抑制
 * - scoreConvergence を拡張し、セッション横断情報を加味
 * - 既存の checkSignalConvergence を置き換えず、上位レイヤーとして機能
 */

import type {
  MicroSignal,
  MicroInsightCandidate,
  MicroInsightPresentationType,
  ConvergenceScore,
  TrustLevel,
} from "./alterUnderstanding";
import type { TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** セッション情報付きシグナル */
export interface SessionMicroSignal extends MicroSignal {
  session_id: string;
}

/** セッション別のシグナル集約 */
export interface SessionCohort {
  session_id: string;
  detected_at: string; // ISO, cohort の最初のシグナル時刻
  signal_count: number;
  avg_strength: number;
  signal_types: string[];
}

/** トレンド方向 */
export type SignalTrend = "emerging" | "strengthening" | "stable" | "weakening";

/** Cross-session 矛盾 */
export interface CrossSessionContradiction {
  signal_type: string;
  related_topic: string;
  session_a: { id: string; sentiment: string; timestamp: string };
  session_b: { id: string; sentiment: string; timestamp: string };
  contradiction_type: "sentiment_flip" | "pattern_reversal";
  confidence: number;
}

/** Cross-session 収束結果 */
export interface CrossSessionConvergenceResult {
  /** 拡張された ConvergenceScore */
  convergence_score: ConvergenceScore;
  /** セッション別コホート */
  session_cohorts: SessionCohort[];
  /** トレンド方向 */
  trend: SignalTrend;
  /** トレンドの信頼度 0-1 */
  trend_confidence: number;
  /** セッション跨ぎ連続性 0-1（シグナルが出現したセッション / 全セッション） */
  cross_session_continuity: number;
  /** 検出された矛盾 */
  contradictions: CrossSessionContradiction[];
}

/** DB永続化用の収束状態 */
export interface ConvergenceState {
  signal_type: string;
  related_topic: string | null;
  session_history: Record<string, {
    signal_count: number;
    avg_strength: number;
    timestamps: string[];
  }>;
  total_sessions_with_signal: number;
  trend: SignalTrend;
  trend_confidence: number;
  cross_session_continuity: number;
  last_convergence_score: ConvergenceScore | null;
  last_convergence_at: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core: Cross-session 収束計算
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * セッション別にシグナルをグルーピングする。
 */
export function groupBySession(signals: SessionMicroSignal[]): Map<string, SessionMicroSignal[]> {
  const groups = new Map<string, SessionMicroSignal[]>();
  for (const sig of signals) {
    const existing = groups.get(sig.session_id) ?? [];
    existing.push(sig);
    groups.set(sig.session_id, existing);
  }
  return groups;
}

/**
 * セッションコホートを構築する。
 */
export function buildSessionCohorts(sessionGroups: Map<string, SessionMicroSignal[]>): SessionCohort[] {
  const cohorts: SessionCohort[] = [];
  for (const [sessionId, sigs] of sessionGroups) {
    const sorted = [...sigs].sort((a, b) =>
      new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime(),
    );
    cohorts.push({
      session_id: sessionId,
      detected_at: sorted[0].detected_at,
      signal_count: sigs.length,
      avg_strength: sigs.reduce((s, x) => s + x.strength, 0) / sigs.length,
      signal_types: [...new Set(sigs.map(s => s.type))],
    });
  }
  return cohorts.sort((a, b) =>
    new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime(),
  );
}

/**
 * シグナル群の base convergence score を計算する（既存ロジックと同等）。
 */
export function scoreConvergence(sigs: MicroSignal[]): ConvergenceScore {
  const timestamps = new Set(sigs.map(s => s.detected_at));
  const types = new Set(sigs.map(s => s.type));

  const dates = sigs.map(s => new Date(s.detected_at).getTime());
  const spreadMs = dates.length >= 2 ? Math.max(...dates) - Math.min(...dates) : 0;
  const spreadDays = spreadMs / (1000 * 60 * 60 * 24);

  const countScore = Math.min(1, (sigs.length - 1) / 4);
  const sessionScore = Math.min(1, (timestamps.size - 1) / 3);
  const spreadScore = Math.min(1, spreadDays / 5);
  const typeScore = Math.min(1, (types.size - 1) / 2);

  const combined = countScore * 0.2 + sessionScore * 0.35 + spreadScore * 0.3 + typeScore * 0.15;

  return {
    signal_count: sigs.length,
    session_diversity: timestamps.size,
    temporal_spread_days: Math.round(spreadDays * 10) / 10,
    type_diversity: types.size,
    combined: Math.round(combined * 100) / 100,
  };
}

/**
 * セッションコホートからトレンドを算出する。
 *
 * 3セッション以上で avg_strength の線形傾向を判定。
 * 2セッションなら emerging or stable。
 */
export function computeTrend(cohorts: SessionCohort[]): { trend: SignalTrend; confidence: number } {
  if (cohorts.length === 0) return { trend: "emerging", confidence: 0 };
  if (cohorts.length === 1) return { trend: "emerging", confidence: 0.3 };

  const strengths = cohorts.map(c => c.avg_strength);

  if (cohorts.length === 2) {
    const delta = strengths[1] - strengths[0];
    if (delta > 0.1) return { trend: "strengthening", confidence: Math.min(1, delta / 0.5) };
    if (delta < -0.1) return { trend: "weakening", confidence: Math.min(1, Math.abs(delta) / 0.5) };
    return { trend: "emerging", confidence: 0.4 };
  }

  // 3+ セッション: 線形回帰の傾きで判定
  const n = strengths.length;
  const xMean = (n - 1) / 2;
  const yMean = strengths.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (strengths[i] - yMean);
    denominator += (i - xMean) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;

  if (slope > 0.05) {
    return { trend: "strengthening", confidence: Math.min(1, slope / 0.2) };
  }
  if (slope < -0.05) {
    return { trend: "weakening", confidence: Math.min(1, Math.abs(slope) / 0.2) };
  }
  return { trend: "stable", confidence: 0.7 };
}

/**
 * セッション間の感情方向矛盾を検出する。
 */
export function detectContradictions(
  signals: SessionMicroSignal[],
): CrossSessionContradiction[] {
  const contradictions: CrossSessionContradiction[] = [];

  // sentiment_shift のみ矛盾検出対象
  const sentimentSignals = signals.filter(s => s.type === "sentiment_shift");
  if (sentimentSignals.length < 2) return [];

  // トピック別 → セッション別にグルーピング
  const byTopic = new Map<string, Map<string, SessionMicroSignal[]>>();
  for (const sig of sentimentSignals) {
    const topic = sig.related_topic ?? "unknown";
    if (!byTopic.has(topic)) byTopic.set(topic, new Map());
    const sessions = byTopic.get(topic)!;
    const arr = sessions.get(sig.session_id) ?? [];
    arr.push(sig);
    sessions.set(sig.session_id, arr);
  }

  for (const [topic, sessions] of byTopic) {
    const sortedSessions = [...sessions.entries()]
      .sort((a, b) =>
        new Date(a[1][0].detected_at).getTime() - new Date(b[1][0].detected_at).getTime(),
      );

    for (let i = 0; i < sortedSessions.length - 1; i++) {
      const [sessionA, sigsA] = sortedSessions[i];
      const [sessionB, sigsB] = sortedSessions[i + 1];

      const sentA = extractSentimentDirection(sigsA[0].observation);
      const sentB = extractSentimentDirection(sigsB[0].observation);

      if (sentA && sentB && sentA !== sentB) {
        contradictions.push({
          signal_type: "sentiment_shift",
          related_topic: topic,
          session_a: { id: sessionA, sentiment: sentA, timestamp: sigsA[0].detected_at },
          session_b: { id: sessionB, sentiment: sentB, timestamp: sigsB[0].detected_at },
          contradiction_type: "sentiment_flip",
          confidence: 0.7,
        });
      }
    }
  }

  return contradictions;
}

/**
 * observation テキストから感情の方向を推定する。
 */
export function extractSentimentDirection(observation: string): "positive" | "negative" | null {
  if (/感謝|嬉し|楽し|好き|ありがた|支持|応援|良い|いい感じ|温かい|安心/.test(observation)) return "positive";
  if (/嫌|辛|怖|不満|悲|否定|反抗|拒否|イライラ|ストレス|疲|しんどい|キツ/.test(observation)) return "negative";
  return null;
}

/**
 * Cross-session 収束を計算する。
 * 既存の scoreConvergence をベースに、セッション跨ぎ情報でブーストする。
 */
export function computeCrossSessionConvergence(
  signals: SessionMicroSignal[],
): CrossSessionConvergenceResult {
  if (signals.length === 0) {
    return {
      convergence_score: { signal_count: 0, session_diversity: 0, temporal_spread_days: 0, type_diversity: 0, combined: 0 },
      session_cohorts: [],
      trend: "emerging",
      trend_confidence: 0,
      cross_session_continuity: 0,
      contradictions: [],
    };
  }

  // 1. セッション別グルーピング
  const sessionGroups = groupBySession(signals);
  const cohorts = buildSessionCohorts(sessionGroups);

  // 2. Base convergence score
  const baseScore = scoreConvergence(signals);

  // 3. トレンド分析
  const { trend, confidence: trendConfidence } = computeTrend(cohorts);

  // 4. セッション跨ぎ連続性
  const continuity = cohorts.length / Math.max(cohorts.length, 1);

  // 5. 矛盾検出
  const contradictions = detectContradictions(signals);

  // 6. スコア補正
  let finalCombined = baseScore.combined;

  // strengthening + 高連続性 → ブースト
  if (trend === "strengthening" && cohorts.length >= 2) {
    finalCombined = Math.min(1, finalCombined + 0.15 * trendConfidence);
  }
  // weakening → ペナルティ
  if (trend === "weakening") {
    finalCombined = Math.max(0, finalCombined - 0.1 * trendConfidence);
  }
  // 矛盾あり → そのトピックのスコアを下げる
  if (contradictions.length > 0) {
    finalCombined = Math.max(0, finalCombined - 0.2 * contradictions.length);
  }

  finalCombined = Math.round(finalCombined * 100) / 100;

  return {
    convergence_score: { ...baseScore, combined: finalCombined },
    session_cohorts: cohorts,
    trend,
    trend_confidence: trendConfidence,
    cross_session_continuity: continuity,
    contradictions,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 既存 checkSignalConvergence の Cross-session 拡張版
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * maxPresentationType — 既存と同等だが cross-session trend を加味。
 */
function maxPresentationType(
  score: ConvergenceScore,
  trustLevel: TrustLevel,
  trend?: SignalTrend,
): MicroInsightPresentationType {
  if (trustLevel < 1) return "casual_check";
  if (trustLevel < 2 && score.combined < 0.5) return "casual_check";

  // strengthening trend は提示レベルを1段上げる（ただしtrust制約は維持）
  const boost = trend === "strengthening" ? 0.1 : 0;
  const effective = score.combined + boost;

  if (effective >= 0.7 && trustLevel >= 3) return "connection";
  if (effective >= 0.5 && trustLevel >= 2) return "gentle_inquiry";
  if (effective >= 0.3) return "observation";
  return "casual_check";
}

/**
 * Cross-session 対応版の収束チェック。
 *
 * 既存の checkSignalConvergence を拡張し:
 * - session_id によるグルーピング
 * - トレンド分析によるスコアブースト/ペナルティ
 * - 矛盾検出によるトピック抑制
 *
 * @param signals - session_id 付きシグナル群
 * @param trustLevel - 現在の信頼レベル
 * @param contradictedTopics - 出力: 矛盾が検出されたトピック（MI抑制用）
 * @returns MicroInsightCandidate | null
 */
export function checkCrossSessionConvergence(
  signals: SessionMicroSignal[],
  trustLevel: TrustLevel,
): {
  insight: MicroInsightCandidate | null;
  convergenceResult: CrossSessionConvergenceResult | null;
  contradictedTopics: string[];
} {
  if (signals.length < 2) {
    return { insight: null, convergenceResult: null, contradictedTopics: [] };
  }

  // 直近14日以内に拡張（cross-session は7日では短すぎる）
  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 14);
  const recent = signals.filter(s => new Date(s.detected_at) >= recentCutoff);

  if (recent.length < 2) {
    return { insight: null, convergenceResult: null, contradictedTopics: [] };
  }

  // 単一セッション収束防止: 2つ以上の異なるセッションを要求
  const sessionIds = new Set(recent.map(s => s.session_id));
  const hasMultipleSessions = sessionIds.size >= 2;

  // 単一セッション内でも複数ターンなら許可（既存互換）
  const hasMultipleTurns = new Set(recent.map(s => s.detected_at)).size >= 2;

  if (!hasMultipleTurns) {
    return { insight: null, convergenceResult: null, contradictedTopics: [] };
  }

  // Cross-session 収束計算
  const convergenceResult = computeCrossSessionConvergence(recent);
  const contradictedTopics = convergenceResult.contradictions.map(c => c.related_topic);

  // ── Energy × Action Gap の収束 ──
  const stuckSignals = recent.filter(
    s => s.type === "energy_action_gap" || s.type === "behavior_mismatch",
  );
  if (stuckSignals.length >= 2 && (hasMultipleSessions || hasMultipleTurns)) {
    const subResult = computeCrossSessionConvergence(stuckSignals);
    const pt = maxPresentationType(subResult.convergence_score, trustLevel, subResult.trend);
    return {
      insight: {
        signals: stuckSignals,
        suggested_prompt: pt === "gentle_inquiry"
          ? "体力の問題じゃないなら、気持ちのどこかで引っかかってるものがあるかもね"
          : pt === "connection" && hasMultipleSessions
            ? "前のときも同じようなこと言ってた気がする。何かずっと動けない原因がある？"
            : "最近、やりたいことと実際の動きにギャップがある感じ？",
        presentation_type: pt,
        required_trust: 1,
        convergence_score: subResult.convergence_score,
      },
      convergenceResult: subResult,
      contradictedTopics,
    };
  }

  // ── Topic Repetition の収束 ──
  const repetitionSignals = recent.filter(s => s.type === "topic_repetition");
  if (repetitionSignals.length >= 2 && (hasMultipleSessions || hasMultipleTurns)) {
    const topic = repetitionSignals[0]?.related_topic ?? "そのこと";
    // 矛盾トピックなら抑制
    if (contradictedTopics.includes(topic)) {
      return { insight: null, convergenceResult, contradictedTopics };
    }
    const subResult = computeCrossSessionConvergence(repetitionSignals);
    const pt = maxPresentationType(subResult.convergence_score, trustLevel, subResult.trend);
    return {
      insight: {
        signals: repetitionSignals.slice(0, 3),
        suggested_prompt: pt === "connection" && hasMultipleSessions
          ? `${topic}のこと、前にも話してたけど、何かずっと引っかかってる？`
          : `${topic}のこと、最近よく出てくるね`,
        presentation_type: pt,
        required_trust: 1,
        convergence_score: subResult.convergence_score,
      },
      convergenceResult: subResult,
      contradictedTopics,
    };
  }

  // ── Sentiment Shift の収束 ──
  const sentimentSignals = recent.filter(s => s.type === "sentiment_shift");
  if (sentimentSignals.length >= 2 && (hasMultipleSessions || hasMultipleTurns) && trustLevel >= 1) {
    const topic = sentimentSignals[0]?.related_topic ?? "その人";
    // 矛盾トピックなら抑制
    if (contradictedTopics.includes(topic)) {
      return { insight: null, convergenceResult, contradictedTopics };
    }
    const subResult = computeCrossSessionConvergence(sentimentSignals);
    const pt = maxPresentationType(subResult.convergence_score, trustLevel, subResult.trend);
    return {
      insight: {
        signals: sentimentSignals,
        suggested_prompt: hasMultipleSessions
          ? `そういえば、${topic}との関係、前にも気になってたみたいだけど、最近何か変わった？`
          : `そういえば、${topic}との関係、最近何か変わった？`,
        presentation_type: pt,
        required_trust: 1,
        convergence_score: subResult.convergence_score,
      },
      convergenceResult: subResult,
      contradictedTopics,
    };
  }

  return { insight: null, convergenceResult, contradictedTopics };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB 永続化ヘルパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DB から読み込んだ ConvergenceState を更新する。
 */
export function updateConvergenceState(
  existing: ConvergenceState | null,
  newSignals: SessionMicroSignal[],
  sessionId: string,
): ConvergenceState {
  const signalType = newSignals[0]?.type ?? "unknown";
  const relatedTopic = newSignals[0]?.related_topic ?? null;

  const sessionHistory = existing?.session_history ?? {};
  const existingSession = sessionHistory[sessionId];

  sessionHistory[sessionId] = {
    signal_count: (existingSession?.signal_count ?? 0) + newSignals.length,
    avg_strength: newSignals.reduce((s, x) => s + x.strength, 0) / newSignals.length,
    timestamps: [
      ...(existingSession?.timestamps ?? []),
      ...newSignals.map(s => s.detected_at),
    ],
  };

  const totalSessions = Object.keys(sessionHistory).length;

  // コホートをトレンド計算用に構築
  const cohorts: SessionCohort[] = Object.entries(sessionHistory).map(([sid, data]) => ({
    session_id: sid,
    detected_at: data.timestamps[0] ?? new Date().toISOString(),
    signal_count: data.signal_count,
    avg_strength: data.avg_strength,
    signal_types: [signalType],
  })).sort((a, b) => new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime());

  const { trend, confidence } = computeTrend(cohorts);

  return {
    signal_type: signalType,
    related_topic: relatedTopic,
    session_history: sessionHistory,
    total_sessions_with_signal: totalSessions,
    trend,
    trend_confidence: confidence,
    cross_session_continuity: totalSessions / Math.max(totalSessions, 1),
    last_convergence_score: null,
    last_convergence_at: null,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TASK-5a: ImplicitSignal — 会話から本心を暗黙的に検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 暗黙シグナルの種類 */
export type ImplicitSignalType =
  | "avoidance"       // 質問された軸について答えず話題を変えた
  | "elaboration"     // 想定以上に詳しく語った
  | "deflection"      // 直接的な回答を避けた（はぐらかし）
  | "hesitation"      // 回答に迷いが見られた（RT Engine から）
  | "topic_shift"     // 突然の話題転換
  | "strong_affect";  // 強い感情反応

export interface ImplicitSignal {
  type: ImplicitSignalType;
  related_axis: TraitAxisKey;
  session_id: string;
  confidence: number;
  timestamp: string;
  promoted_to_insight?: boolean;
}

/** ImplicitSignal から昇格する MicroInsight 候補 */
export interface ImplicitMicroInsightCandidate {
  insight_text: string;
  related_axis: TraitAxisKey;
  signal_type: ImplicitSignalType;
  signal_count: number;
  origin: "implicit_signal";
  confidence: number;
}

/**
 * 会話の暗黙的なシグナルを検出する。
 *
 * 検出ソース:
 * - hesitation: RT Engine の conflictIndicator
 * - strong_affect: emotional_weight の高さ
 * - avoidance: probe の target_axis と現在の発話トピック不一致
 * - elaboration: 文字数が平均の2倍以上
 * - topic_shift: 前の発話とのキーワード重複が極めて低い
 */
export function detectImplicitSignals(params: {
  currentMessage: string;
  previousMessage: string;
  sessionId: string;
  /** RT Engine の conflictIndicator（0-1） */
  conflictIndicator?: number;
  /** 前回の probe の target_axis */
  previousProbeAxis?: TraitAxisKey | null;
  /** 今の発話の active_axes（extractCurrentTopics から） */
  activeAxes?: TraitAxisKey[];
  /** 過去の平均メッセージ文字数 */
  averageMessageLength?: number;
  /** emotional_weight（0-1） */
  emotionalWeight?: number;
  /** この発話に関連する主要な軸 */
  primaryAxis?: TraitAxisKey;
}): ImplicitSignal[] {
  const {
    currentMessage,
    previousMessage,
    sessionId,
    conflictIndicator,
    previousProbeAxis,
    activeAxes,
    averageMessageLength,
    emotionalWeight,
    primaryAxis,
  } = params;

  const signals: ImplicitSignal[] = [];
  const now = new Date().toISOString();

  // デフォルトの related_axis（具体的な軸が特定できない場合）
  const defaultAxis: TraitAxisKey = primaryAxis ?? "introvert_vs_extrovert";

  // 1. hesitation: RT Engine の conflictIndicator > 0.6
  if (conflictIndicator !== undefined && conflictIndicator > 0.6) {
    signals.push({
      type: "hesitation",
      related_axis: previousProbeAxis ?? defaultAxis,
      session_id: sessionId,
      confidence: Math.min(1, conflictIndicator),
      timestamp: now,
    });
  }

  // 2. strong_affect: emotional_weight 高 + 特定軸に言及
  if (emotionalWeight !== undefined && emotionalWeight > 0.7 && primaryAxis) {
    signals.push({
      type: "strong_affect",
      related_axis: primaryAxis,
      session_id: sessionId,
      confidence: Math.min(1, emotionalWeight),
      timestamp: now,
    });
  }

  // 3. avoidance: 前回 probe の target_axis が今の active_axes に含まれない
  if (previousProbeAxis && activeAxes && activeAxes.length > 0) {
    if (!activeAxes.includes(previousProbeAxis)) {
      signals.push({
        type: "avoidance",
        related_axis: previousProbeAxis,
        session_id: sessionId,
        confidence: 0.5,
        timestamp: now,
      });
    }
  }

  // 4. elaboration: 文字数が平均の2倍以上
  if (averageMessageLength && averageMessageLength > 0) {
    if (currentMessage.length > averageMessageLength * 2) {
      const ratio = currentMessage.length / averageMessageLength;
      signals.push({
        type: "elaboration",
        related_axis: primaryAxis ?? defaultAxis,
        session_id: sessionId,
        confidence: Math.min(1, ratio / 4), // 4倍で confidence = 1.0
        timestamp: now,
      });
    }
  }

  // 5. topic_shift: 前の発話と現在の発話のキーワード重複が極めて低い
  if (previousMessage.length > 10 && currentMessage.length > 10) {
    const prevWords = new Set(previousMessage.split(/[\s、。！？「」]+/).filter(w => w.length >= 2));
    const currWords = new Set(currentMessage.split(/[\s、。！？「」]+/).filter(w => w.length >= 2));
    if (prevWords.size > 0 && currWords.size > 0) {
      let overlap = 0;
      for (const w of currWords) {
        if (prevWords.has(w)) overlap++;
      }
      const overlapRatio = overlap / Math.min(prevWords.size, currWords.size);
      if (overlapRatio < 0.1) {
        signals.push({
          type: "topic_shift",
          related_axis: primaryAxis ?? defaultAxis,
          session_id: sessionId,
          confidence: Math.min(1, 1 - overlapRatio),
          timestamp: now,
        });
      }
    }
  }

  // 6. deflection: 質問に対して直接答えず短く流す
  const avgMsgLen = averageMessageLength ?? 50;
  if (previousMessage.includes("？") || previousMessage.includes("?")) {
    const prevKeywords = previousMessage.replace(/[？?！!。、,.「」]/g, " ").split(/\s+/).filter(w => w.length >= 2);
    const currentKeywords = currentMessage.replace(/[？?！!。、,.「」]/g, " ").split(/\s+/).filter(w => w.length >= 2);
    const keywordOverlap = prevKeywords.filter(pk => currentKeywords.some(ck => ck.includes(pk) || pk.includes(ck)));
    const isShort = currentMessage.length < avgMsgLen * 0.5;
    if (keywordOverlap.length === 0 && isShort) {
      signals.push({
        type: "deflection",
        related_axis: primaryAxis ?? defaultAxis,
        session_id: sessionId,
        confidence: Math.min(1, 0.5 + (1 - currentMessage.length / Math.max(avgMsgLen, 1)) * 0.3),
        timestamp: now,
      });
    }
  }

  return signals;
}

/**
 * ImplicitSignal を蓄積する（既存リストに新しいシグナルを追加）。
 */
export function accumulateImplicitSignals(
  existing: ImplicitSignal[],
  newSignals: ImplicitSignal[],
): ImplicitSignal[] {
  return [...existing, ...newSignals];
}

/** 昇格テンプレート: type → 人間が読めるインサイト文 */
const PROMOTION_TEMPLATES: Record<ImplicitSignalType, (axis: string) => string> = {
  avoidance: (axis) => `${axis}の話題になると、いつも少し引く傾向がある`,
  elaboration: (axis) => `${axis}については語りたい欲求が強い`,
  deflection: (axis) => `${axis}について直接的に答えることを避ける傾向がある`,
  hesitation: (axis) => `${axis}に関する判断に迷いがある`,
  topic_shift: (axis) => `${axis}の話題から離れたがる傾向がある`,
  strong_affect: (axis) => `${axis}に対して強い感情的反応がある`,
};

/**
 * 蓄積された ImplicitSignal から MicroInsight への昇格を判定する。
 * 同一 related_axis × 同一 type が 3回以上 → MicroInsight に昇格。
 */
export function promoteToMicroInsight(
  signals: ImplicitSignal[],
): ImplicitMicroInsightCandidate | null {
  // 未昇格のシグナルのみ対象
  const unpromoted = signals.filter(s => !s.promoted_to_insight);

  // axis × type でグルーピング
  const groups = new Map<string, ImplicitSignal[]>();
  for (const sig of unpromoted) {
    const key = `${sig.related_axis}::${sig.type}`;
    const group = groups.get(key) ?? [];
    group.push(sig);
    groups.set(key, group);
  }

  // 3回以上のグループを探す（最も回数が多いものを優先）
  let bestGroup: { axis: TraitAxisKey; type: ImplicitSignalType; signals: ImplicitSignal[] } | null = null;
  for (const [key, group] of groups) {
    if (group.length >= 3) {
      if (!bestGroup || group.length > bestGroup.signals.length) {
        const [axis, type] = key.split("::") as [TraitAxisKey, ImplicitSignalType];
        bestGroup = { axis, type, signals: group };
      }
    }
  }

  if (!bestGroup) return null;

  const template = PROMOTION_TEMPLATES[bestGroup.type];
  const avgConfidence = bestGroup.signals.reduce((s, sig) => s + sig.confidence, 0) / bestGroup.signals.length;

  return {
    insight_text: template(bestGroup.axis),
    related_axis: bestGroup.axis,
    signal_type: bestGroup.type,
    signal_count: bestGroup.signals.length,
    origin: "implicit_signal",
    confidence: Math.round(avgConfidence * 100) / 100,
  };
}
