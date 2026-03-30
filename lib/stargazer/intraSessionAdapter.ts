// lib/stargazer/intraSessionAdapter.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Intra-Session Adaptive Engine（セッション内適応エンジン）
//
// 世界トップとの差を埋める核心機能:
// Duolingo: 1問ごとに難易度がリアルタイムで適応
// TikTok: 1スワイプごとに推薦を更新
// Aneurasync現状: セッション前に5問を固定計画
//
// 改善:
// Q1の回答内容 + 応答速度 + 迷いパターンに基づいて、
// Q2以降の質問をリアルタイムで差し替える。
//
// フロー:
// Q1回答 → edgeMicroInsight(<50ms) → 適応判定 → Q2を動的選択
//        → 「矛盾の予兆」検出 → Q2はその軸を深堀り
//        → 「迷い(>8秒)」検出 → Q2はその軸を別角度から
//        → 「フリップ」検出 → Q2はその矛盾を追跡
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";
import type { MicroInsight, MicroInsightType } from "../architecture/edgeMicroInsights";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 計画済みの質問（dailyOrchestratorの出力） */
export interface PlannedQuestion {
  id: string;
  prompt: string;
  axisId: TraitAxisKey;
  options: { id: string; label: string; score: number }[];
  depth: "state" | "context" | "deep" | "shadow";
}

/** セッション中の回答記録 */
export interface SessionAnswer {
  questionId: string;
  axisId: TraitAxisKey;
  selectedScore: number;
  responseTimeMs: number;
  /** edgeMicroInsightsが検出したインサイト */
  microInsight: MicroInsight | null;
}

/** 適応判定の結果 */
export interface AdaptationDecision {
  /** 適応の種類 */
  type: AdaptationType;
  /** 次の質問をどう変更すべきか */
  instruction: AdaptationInstruction;
  /** 判定理由 */
  reason: string;
  /** 適応の確信度 */
  confidence: number;
}

export type AdaptationType =
  | "no_change"          // 変更なし（計画通り）
  | "deepen_axis"        // 同じ軸をより深く聞く
  | "probe_contradiction" // 矛盾を追跡する質問に差し替え
  | "alternate_angle"     // 同じ軸を別角度から聞く
  | "escalate_depth"      // より深い質問に差し替え
  | "de_escalate"         // 軽い質問に差し替え（回避が強い場合）
  | "cross_axis_probe";   // 関連する別軸を聞く

export interface AdaptationInstruction {
  /** 差し替えるべき質問のインデックス（0-based, -1なら変更なし） */
  replaceIndex: number;
  /** 推奨する軸 */
  targetAxis: TraitAxisKey | null;
  /** 推奨する深度 */
  targetDepth: "state" | "context" | "deep" | "shadow" | null;
  /** 質問のフレーミング推奨 */
  framingHint: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Adaptation Rules
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 回答＋マイクロインサイトから適応判定を行う
 *
 * これがセッション内適応の核心。
 * 各ルールは独立して評価され、最も確信度の高いものが勝つ。
 */
export function determineAdaptation(
  currentAnswer: SessionAnswer,
  previousAnswers: SessionAnswer[],
  remainingQuestions: PlannedQuestion[],
  currentQuestionIndex: number,
): AdaptationDecision {
  const candidates: AdaptationDecision[] = [];

  // 次の質問のインデックス
  const nextIndex = currentQuestionIndex + 1;
  if (nextIndex >= remainingQuestions.length + currentQuestionIndex + 1) {
    return {
      type: "no_change",
      instruction: { replaceIndex: -1, targetAxis: null, targetDepth: null, framingHint: null },
      reason: "最後の質問のため適応不要",
      confidence: 1,
    };
  }

  const microInsight = currentAnswer.microInsight;

  // ── Rule 1: フリップ検出 → 矛盾追跡 ──
  if (microInsight?.type === "flip_detection") {
    candidates.push({
      type: "probe_contradiction",
      instruction: {
        replaceIndex: nextIndex,
        targetAxis: currentAnswer.axisId,
        targetDepth: "deep",
        framingHint: "前回と逆の回答をした理由を探る角度で",
      },
      reason: `フリップ検出（${currentAnswer.axisId}）: 前回と大きく異なる回答。矛盾の核心に迫る質問に差し替え`,
      confidence: 0.9,
    });
  }

  // ── Rule 2: 矛盾の予兆 → 同じ軸を別角度で ──
  if (microInsight?.type === "contradiction_hint") {
    candidates.push({
      type: "alternate_angle",
      instruction: {
        replaceIndex: nextIndex,
        targetAxis: currentAnswer.axisId,
        targetDepth: "context",
        framingHint: "異なる状況設定で同じ軸を再質問",
      },
      reason: `矛盾の予兆（${currentAnswer.axisId}）: 別角度から確認することで矛盾を確定`,
      confidence: 0.85,
    });
  }

  // ── Rule 3: 長い迷い(>8秒) → 同じ軸をより深く ──
  if (currentAnswer.responseTimeMs > 8000) {
    candidates.push({
      type: "deepen_axis",
      instruction: {
        replaceIndex: nextIndex,
        targetAxis: currentAnswer.axisId,
        targetDepth: "deep",
        framingHint: "迷いの原因を探る。シナリオベースの質問が有効",
      },
      reason: `長い迷い（${Math.round(currentAnswer.responseTimeMs / 1000)}秒）: この軸に葛藤がある。深堀りで核心に迫る`,
      confidence: 0.8,
    });
  }

  // ── Rule 4: 極端に速い回答(<2秒) 3回連続 → 深度を上げる ──
  const recentFast = [...previousAnswers.slice(-2), currentAnswer]
    .filter((a) => a.responseTimeMs < 2000);
  if (recentFast.length >= 3) {
    candidates.push({
      type: "escalate_depth",
      instruction: {
        replaceIndex: nextIndex,
        targetAxis: null, // 軸は変えない
        targetDepth: "shadow",
        framingHint: "投影法（影絵）質問で防衛を突破",
      },
      reason: "3問連続で即答: 表面的な回答の可能性。深層を引き出す質問に切り替え",
      confidence: 0.7,
    });
  }

  // ── Rule 5: レアアンサー → 新しい領域を追跡 ──
  if (microInsight?.type === "rare_answer") {
    candidates.push({
      type: "cross_axis_probe",
      instruction: {
        replaceIndex: nextIndex,
        targetAxis: currentAnswer.axisId,
        targetDepth: "context",
        framingHint: "新しい傾向が他の軸にも影響しているか確認",
      },
      reason: `レアアンサー（${currentAnswer.axisId}）: 新しい側面が見えた。関連軸を調査`,
      confidence: 0.65,
    });
  }

  // ── Rule 6: トレンド変化 → 変化の原因を探る ──
  if (microInsight?.type === "trend_change") {
    candidates.push({
      type: "deepen_axis",
      instruction: {
        replaceIndex: nextIndex,
        targetAxis: currentAnswer.axisId,
        targetDepth: "context",
        framingHint: "最近何が変わったかを問う質問",
      },
      reason: `トレンド反転（${currentAnswer.axisId}）: 変化の原因を特定する質問に差し替え`,
      confidence: 0.7,
    });
  }

  // ── Rule 7: 速度シグナル（迷い） → 葛藤軸を追跡 ──
  if (microInsight?.type === "speed_signal" && currentAnswer.responseTimeMs > 5000) {
    candidates.push({
      type: "alternate_angle",
      instruction: {
        replaceIndex: nextIndex,
        targetAxis: currentAnswer.axisId,
        targetDepth: "state",
        framingHint: "葛藤を直接聞くのではなく、関連する日常場面を問う",
      },
      reason: `速度シグナル: 葛藤が検出された軸を日常場面から探る`,
      confidence: 0.6,
    });
  }

  // 最も確信度の高い適応を選択
  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates[0] ?? {
    type: "no_change",
    instruction: { replaceIndex: -1, targetAxis: null, targetDepth: null, framingHint: null },
    reason: "特別な適応は不要。計画通りの質問を続行",
    confidence: 1,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Session Adaptation Log
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** セッション全体の適応ログ */
export interface SessionAdaptationLog {
  /** 各質問後の適応判定記録 */
  adaptations: {
    afterQuestion: number;
    decision: AdaptationDecision;
    wasApplied: boolean;
  }[];
  /** 適応回数 */
  totalAdaptations: number;
  /** セッション品質向上の推定 */
  estimatedQualityBoost: number;
}

/**
 * セッション終了後の適応ログを生成
 * → 次回セッションの計画改善に活用
 */
export function summarizeSessionAdaptations(
  adaptations: SessionAdaptationLog["adaptations"],
): {
  dominantAdaptationType: AdaptationType;
  axesThatTriggered: TraitAxisKey[];
  recommendationForNextSession: string;
} {
  if (adaptations.length === 0) {
    return {
      dominantAdaptationType: "no_change",
      axesThatTriggered: [],
      recommendationForNextSession: "安定したセッション。次回も同様の構成で",
    };
  }

  // 最も多い適応タイプ
  const typeCounts = new Map<AdaptationType, number>();
  const triggeredAxes = new Set<TraitAxisKey>();

  for (const a of adaptations) {
    if (a.decision.type !== "no_change") {
      typeCounts.set(a.decision.type, (typeCounts.get(a.decision.type) ?? 0) + 1);
      if (a.decision.instruction.targetAxis) {
        triggeredAxes.add(a.decision.instruction.targetAxis);
      }
    }
  }

  const dominantType = typeCounts.size > 0
    ? Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
    : "no_change" as AdaptationType;

  let recommendation: string;
  switch (dominantType) {
    case "probe_contradiction":
      recommendation = "矛盾追跡が多発。次回は矛盾マップの深堀り質問を事前に計画";
      break;
    case "deepen_axis":
      recommendation = "深堀り需要が高い。次回はdeep/shadow質問の比率を上げる";
      break;
    case "escalate_depth":
      recommendation = "表面的回答が続いた。次回はシナリオベース質問から開始";
      break;
    case "de_escalate":
      recommendation = "回避傾向が強い。次回は安全な質問から始めて徐々に深く";
      break;
    default:
      recommendation = "バランスの良いセッション。現在の構成を維持";
  }

  return {
    dominantAdaptationType: dominantType,
    axesThatTriggered: Array.from(triggeredAxes),
    recommendationForNextSession: recommendation,
  };
}
