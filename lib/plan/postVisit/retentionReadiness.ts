/**
 * lib/plan/postVisit/retentionReadiness.ts
 *   — 評価OS / ②-5: retention 計測仕上げ（「使える観測が貯まっているか」を判断する pure summary）
 *
 * ★狙い: 既存 metrics（dogfood summary + funnel metrics）を1つの readiness に統合し、
 *   Stage 4-B/学習に進める観測量・品質を1目で判断できるようにする。UI 新規配線なし・ranking 非反映。
 * ★pure: I/O なし（observations / elicitLog は呼び出し側が渡す）。
 */
import type { PostVisitObservation } from "./postVisitObservation";
import { summarizePostVisitDogfood } from "./postVisitDogfoodSummary";
import { computeDogfoodMetrics } from "./postVisitMetrics";
import type { ElicitEvent } from "./postVisitStore";

/** 学習に進める最小観測量（heuristic・false-aliveness を避ける保守値）。 */
export const RETENTION_MIN_OBSERVATIONS = 12;
export const RETENTION_MIN_CONTEXT_CELLS = 3;

export interface RetentionReadiness {
  readonly observationCount: number;          // 観測総数
  readonly answeredCount: number;             // 回答済み（fit に寄与）
  readonly contextCoverage: number;           // contextSnapshot 付き割合 0..1
  readonly repeatedPlaceCount: number;        // 2回以上観測された place 数（再訪 signal）
  readonly fitArcObservedCount: number;       // observed(>=3) の place 数
  readonly fitArcTentativeCount: number;      // tentative(1-2) の place 数
  readonly contextCellsCovered: number;       // 回答済み×文脈ありの条件セル数
  readonly redactionViolations: number;       // ★must 0
  readonly answerRate: number;                // answered / promptShown
  readonly skipRate: number;
  readonly suppressRate: number;
  readonly postDecisionObservationRate: number; // 主指標
  /** Stage 4-B / 条件付き学習に進める観測量・品質に達したか（redaction 違反0 が前提）。 */
  readonly readyForContextLearning: boolean;
  readonly reasons: readonly string[];        // 未達理由（人が読める）
}

/**
 * 観測群 + funnel ログ → retention readiness（pure）。
 *   既存 summarizePostVisitDogfood / computeDogfoodMetrics を統合し、不足分（再訪・arc 状態別件数）を補強。
 */
export function buildRetentionReadiness(
  observations: readonly PostVisitObservation[],
  elicitLog: readonly ElicitEvent[] = [],
): RetentionReadiness {
  const summary = summarizePostVisitDogfood(observations);
  const metrics = computeDogfoodMetrics(elicitLog, observations);
  const answeredCount = observations.filter((o) => o.response != null).length;
  const repeatedPlaceCount = summary.fitArcByPlace.filter((p) => p.count >= 2).length;
  const fitArcObservedCount = summary.fitArcByPlace.filter((p) => p.state === "observed").length;
  const fitArcTentativeCount = summary.fitArcByPlace.filter((p) => p.state === "tentative").length;

  const reasons: string[] = [];
  if (summary.redactionViolations !== 0) reasons.push(`redaction 違反 ${summary.redactionViolations} 件（0 必須）`);
  if (observations.length < RETENTION_MIN_OBSERVATIONS) reasons.push(`観測 ${observations.length} < ${RETENTION_MIN_OBSERVATIONS}`);
  if (summary.contextCellsCovered < RETENTION_MIN_CONTEXT_CELLS) reasons.push(`文脈セル ${summary.contextCellsCovered} < ${RETENTION_MIN_CONTEXT_CELLS}`);
  const readyForContextLearning = reasons.length === 0;

  return {
    observationCount: summary.total,
    answeredCount,
    contextCoverage: summary.contextCoverage,
    repeatedPlaceCount,
    fitArcObservedCount,
    fitArcTentativeCount,
    contextCellsCovered: summary.contextCellsCovered,
    redactionViolations: summary.redactionViolations,
    answerRate: metrics.answerRate,
    skipRate: metrics.skipRate,
    suppressRate: metrics.suppressRate,
    postDecisionObservationRate: metrics.postDecisionObservationRate,
    readyForContextLearning,
    reasons,
  };
}
