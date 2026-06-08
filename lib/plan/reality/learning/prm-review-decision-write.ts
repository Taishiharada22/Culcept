/**
 * Reality Control OS — A1-7-30 M2 PRM Review Decision Write Contract（**pure・no-DB・no-persist・no-route**・barrel 非 export・未配線）
 *
 * 設計: docs/prm-m2-review-decisions-design.md（A1-7-27）/ review-decision-dry-run.ts（A1-7-8）/ M1 A1-7-14 逆構造
 *
 * 役割: A1-7-8 `ReviewDecisionRecord`（**有効な人間 review**）を M2 `prm_review_decisions` insert row に変換する pure mapper +
 *   repository port。**実 DB に書かない**（unwired）。Supabase adapter は後続（同 slice 別 file）。
 *
 * 厳守:
 *   - **valid な review のみ persist**: `record.valid ∧ decision≠null ∧ reviewedAtISO≠null` 以外は null（repo が filter）。
 *   - **certainty high 禁止**: snapshot.certainty は型で "low"|"tentative" のみ（high を生成不能）。
 *   - **raw/seedRef/personality/trait/fixed_preference を持たない**: InsertRow は controlled 列のみ（proposal snapshot は code/数値/enum）。
 *   - **reviewRequired**: 人間の decision のみが行になる（自動生成しない）。pure・Date.now なし（reviewedAtISO は record 由来=注入済）。
 */

import type { ReviewDecisionRecord, ReviewedProposalSnapshot } from "./review-decision-dry-run";
import type { ReviewDecisionKind, ReviewerKind } from "./review-flow-contract";

/**
 * M2 `prm_review_decisions` insert 行（**M2 列のみ**・user_id/id 除く=repo/DB 付与・raw/seedRef/personality を型として持たない）。
 */
export interface PrmReviewDecisionInsertRow {
  readonly proposal_fingerprint: string;
  readonly decision: ReviewDecisionKind; // approve/reject/defer
  readonly reviewer: ReviewerKind; // operator/user
  readonly source_dimension: string; // band/durationBucket/confidence/source
  readonly source_value: string;
  readonly dominant_action: string; // accept/dismiss/later
  readonly favored_hypothesis: string;
  readonly still_possible: readonly string[]; // code 配列（raw でない）
  readonly evidence_count: number;
  readonly counter_count: number;
  readonly certainty: "low" | "tentative"; // **high なし**
  readonly reviewed_at: string; // ISO（record 由来・注入）
}

/** snapshot → 列写し（pure・controlled）。 */
function snapshotColumns(s: ReviewedProposalSnapshot) {
  return {
    source_dimension: s.sourceDimension,
    source_value: s.sourceValue,
    dominant_action: s.dominantAction,
    favored_hypothesis: s.favoredHypothesis,
    still_possible: s.stillPossible,
    evidence_count: s.evidenceCount,
    counter_count: s.counterCount,
    certainty: s.certainty,
  };
}

/**
 * A1-7-30: `ReviewDecisionRecord` → M2 insert row。**有効 review のみ**（valid ∧ decision ∧ reviewedAtISO）。無効は null。
 *   reviewRequired: 人間の decision のみ・自動生成しない。raw/seedRef を持ち込まない（snapshot は controlled）。
 */
export function reviewDecisionRecordToInsertRow(record: ReviewDecisionRecord): PrmReviewDecisionInsertRow | null {
  if (!record.valid || record.decision === null || record.reviewedAtISO === null) return null;
  return {
    proposal_fingerprint: record.proposalFingerprint,
    decision: record.decision,
    reviewer: record.reviewer,
    ...snapshotColumns(record.snapshot),
    reviewed_at: record.reviewedAtISO,
  };
}

/** 複数 record → rows（無効は skip・filter(Boolean)）。 */
export function reviewDecisionRecordsToInsertRows(records: readonly ReviewDecisionRecord[]): readonly PrmReviewDecisionInsertRow[] {
  return records.map(reviewDecisionRecordToInsertRow).filter((r): r is PrmReviewDecisionInsertRow => r !== null);
}

/** insert 結果（最小・DB 型/raw を漏らさない）。 */
export interface PrmReviewDecisionInsertResult {
  readonly ok: boolean;
  readonly inserted: number;
  /** insert 成功時の id（**M3 の review_decision_id FK に使う**・失敗時 []）。 */
  readonly ids: readonly string[];
}

/** M2 review decision の repository port（Supabase client/DB 型を漏らさない・**service_role 禁止**）。 */
export interface PrmReviewDecisionRepository {
  insert(rows: readonly PrmReviewDecisionInsertRow[]): Promise<PrmReviewDecisionInsertResult>;
}
