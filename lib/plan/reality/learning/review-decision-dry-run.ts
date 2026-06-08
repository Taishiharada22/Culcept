/**
 * Reality Control OS — A1-7-8 Review Decision Dry-run Helper（**pure・no-persist・no-DB・no-LLM・no-route・no-Home**・barrel 非 export・未配線）
 *
 * 設計: docs/prm-review-flow-design.md（A1-7-6）/ docs/aneurasync-reality-control-os-connection-design.md §10.8
 *
 * 役割: candidate proposal + 人間 decision（approve/reject/defer）→ **`ReviewDecisionRecord`** を pure に生成する dry-run helper。
 *   **保存しない**（`persisted=false` marker）。review 時点の proposal snapshot を固定（再現性・audit）。実 persist（`prm_review_decisions`）は migration 手前で停止。
 *
 * 厳守:
 *   - **pure・deterministic**: DB / network / route / UI / Date.now / LLM なし。**保存しない**。barrel 非 export。
 *   - **fail-closed**: blocked proposal の review → invalid（not_reviewable）/ 未知 decision → invalid（unknown_decision）。throw しない。
 *   - **非断定維持**: snapshot.certainty は low|tentative のみ（型で high 不可）。`assertsPersonality=false`。approve でも事実化しない。
 */

import type { PrmDryRunProposal } from "./prm-dry-run-projection";
import type { ReviewDecisionKind, ReviewerKind, PrmEffect, ReviewValidityCode } from "./review-flow-contract";
import { validateReview, decisionEffect, proposalFingerprint } from "./review-flow-contract";

/** review 時点の proposal snapshot（**固定値**・review 後の proposal 変化に影響されない・再現性/audit）。 */
export interface ReviewedProposalSnapshot {
  readonly sourceDimension: string;
  readonly sourceValue: string;
  readonly dominantAction: string;
  readonly favoredHypothesis: string;
  readonly stillPossible: readonly string[];
  readonly evidenceCount: number;
  readonly counterCount: number;
  /** **high なし**（型で保証・過断定防止）。 */
  readonly certainty: "low" | "tentative";
}

/** review decision record（**未永続化**・dry-run・PRM への入口候補）。 */
export interface ReviewDecisionRecord {
  /** marker（**PRM 未保存**・`prm_review_decisions` への write でない）。 */
  readonly kind: "review_decision_record";
  /** review が有効か（reviewable + 有効 decision）。 */
  readonly valid: boolean;
  readonly reason: ReviewValidityCode;
  /** どの proposal か（dimension:value:dominantAction）。 */
  readonly proposalFingerprint: string;
  /** 有効 decision（無効時 null）。 */
  readonly decision: ReviewDecisionKind | null;
  readonly reviewer: ReviewerKind;
  /** PRM 効果（無効時 null）。 */
  readonly effect: PrmEffect | null;
  /** review 時点 snapshot（再現性）。 */
  readonly snapshot: ReviewedProposalSnapshot;
  /** review 時刻（**注入**・Date.now 不使用・無ければ null）。 */
  readonly reviewedAtISO: string | null;
  /** **常に true**（human-in-loop）。 */
  readonly reviewRequired: true;
  /** **構造的保証**: 性格を断定しない。 */
  readonly assertsPersonality: false;
  /** **明示**: PRM 本体に保存していない。 */
  readonly persisted: false;
}

/** proposal → review 時点 snapshot（固定）。 */
function buildSnapshot(p: PrmDryRunProposal): ReviewedProposalSnapshot {
  return {
    sourceDimension: p.sourceDimension,
    sourceValue: p.sourceValue,
    dominantAction: p.dominantAction,
    favoredHypothesis: p.favoredHypothesis,
    stillPossible: p.stillPossible,
    evidenceCount: p.evidenceCount,
    counterCount: p.counterCount,
    certainty: p.certainty,
  };
}

/**
 * A1-7-8: candidate proposal + 人間 decision → **`ReviewDecisionRecord`**（pure・未永続化・fail-closed）。
 *   blocked proposal / 未知 decision → valid=false・decision/effect=null（throw しない）。snapshot は review 時点で固定。**保存しない**。
 */
export function toReviewDecisionRecord(
  proposal: PrmDryRunProposal,
  decision: string,
  reviewer: ReviewerKind,
  reviewedAtISO?: string | null
): ReviewDecisionRecord {
  const validity = validateReview(proposal, decision);
  const validDecision = validity.valid ? (decision as ReviewDecisionKind) : null;
  return {
    kind: "review_decision_record",
    valid: validity.valid,
    reason: validity.reason,
    proposalFingerprint: proposalFingerprint(proposal),
    decision: validDecision,
    reviewer,
    effect: validDecision ? decisionEffect(validDecision) : null,
    snapshot: buildSnapshot(proposal),
    reviewedAtISO: typeof reviewedAtISO === "string" ? reviewedAtISO : null,
    reviewRequired: true,
    assertsPersonality: false,
    persisted: false,
  };
}

/** A1-7-8: 複数 review → records（pure・入力順保持・未永続化）。 */
export function toReviewDecisionRecords(
  inputs: readonly { readonly proposal: PrmDryRunProposal; readonly decision: string; readonly reviewer: ReviewerKind; readonly reviewedAtISO?: string | null }[]
): readonly ReviewDecisionRecord[] {
  return inputs.map((i) => toReviewDecisionRecord(i.proposal, i.decision, i.reviewer, i.reviewedAtISO));
}
