/**
 * Reality Control OS — A1-7-7 PRM Review Flow Contract（**pure・no-persist・no-DB・no-LLM・no-route・no-Home**・barrel 非 export・未配線）
 *
 * 設計: docs/prm-review-flow-design.md（A1-7-6）/ docs/aneurasync-reality-control-os-connection-design.md §10.6〜10.7
 *
 * 役割: review flow（candidate proposal → 人間 review → decision → PRM model 入口）の **契約 vocabulary**（種別・妥当性・効果・reviewability・fingerprint）を pure に定義する。
 *   decision record の組み立て（dry-run）は A1-7-8、dev preview は A1-7-9。**永続化は migration 手前で停止**。
 *
 * 厳守:
 *   - **pure・deterministic**: DB / network / route / UI / Date.now / LLM なし。**保存しない**。barrel 非 export。
 *   - **candidate のみ reviewable**（blocked は observation 止まり・PRM 入口でない）。
 *   - **approve でも非断定を保つ**（certainty を high にしない・trait にしない＝A1-7-8 record / A1-7-5 schema 側で担保）。
 */

import type { PrmDryRunProposal } from "./prm-dry-run-projection";

/** review の decision 種別（人間が入れる・自動 approve なし）。 */
export type ReviewDecisionKind = "approve" | "reject" | "defer";

/** 誰が review したか（所有 arc: operator=推論品質検証 / user=第二の自己 confirm/correct）。 */
export type ReviewerKind = "operator" | "user";

/** review 妥当性の理由コード（redacted）。 */
export type ReviewValidityCode = "ok" | "not_reviewable" | "unknown_decision";

/** review 妥当性（reviewable proposal + 有効 decision のみ ok）。 */
export interface ReviewValidity {
  readonly valid: boolean;
  readonly reason: ReviewValidityCode;
}

/** decision → PRM model への効果（approve のみ entry 候補・永続化は別段階）。 */
export type PrmEffect = "add_model_entry_candidate" | "record_rejection" | "no_model_change";

/** 有効 decision 集合（runtime validation 用）。 */
export const REVIEW_DECISION_KINDS: readonly ReviewDecisionKind[] = ["approve", "reject", "defer"];

/** decision が有効な enum か（runtime malformed 防御）。 */
export function isReviewDecisionKind(d: string): d is ReviewDecisionKind {
  return (REVIEW_DECISION_KINDS as readonly string[]).includes(d);
}

/** proposal が review 可能か（**candidate のみ**・blocked は observation 止まりで不可）。 */
export function isReviewableProposal(p: PrmDryRunProposal): boolean {
  return p.status === "candidate";
}

/**
 * A1-7-7: review の妥当性判定（**pure・fail-closed**）。
 *   未知 decision → unknown_decision / 非 reviewable（blocked）→ not_reviewable / それ以外 → ok。
 */
export function validateReview(proposal: PrmDryRunProposal, decision: string): ReviewValidity {
  if (!isReviewDecisionKind(decision)) return { valid: false, reason: "unknown_decision" };
  if (!isReviewableProposal(proposal)) return { valid: false, reason: "not_reviewable" };
  return { valid: true, reason: "ok" };
}

/**
 * A1-7-7: decision → PRM 効果（pure）。
 *   approve → add_model_entry_candidate（PRM entry 候補・**永続化は別段階・certainty は high にしない**）。
 *   reject → record_rejection（PRM 不追加・rejection を signal 記録）。defer → no_model_change（変化なし・再 surface）。
 */
export function decisionEffect(decision: ReviewDecisionKind): PrmEffect {
  switch (decision) {
    case "approve":
      return "add_model_entry_candidate";
    case "reject":
      return "record_rejection";
    case "defer":
      return "no_model_change";
  }
}

/** proposal の安定 fingerprint（どの proposal か・dimension:value:dominantAction・seedRef を含まない）。 */
export function proposalFingerprint(p: PrmDryRunProposal): string {
  return `${p.sourceDimension}:${p.sourceValue}:${p.dominantAction}`;
}
