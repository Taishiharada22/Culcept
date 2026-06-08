/**
 * Reality Control OS — R1-5 PRM Review Decision Read Mapper（M2・**pure・no-DB・no-server-only**・barrel 非 export）
 *
 * 設計: docs/reality-secretary-os-unbuilt-roadmap.md（R1-5）/ prm-review-decision-write.ts（A1-7-30 M2）/ M1・M3 reader（A1-7-26/34）と同構造
 *
 * 役割: M2 `prm_review_decisions`（人間 review 済 decision）の read row を **clean read model** に変換する pure mapper。
 *   procedural memory（R1-5・「本人が approve した進め方」）と R1-3 correction の **confirmed**（M2 approve）が消費する。
 *   ＝ R1-3 が「M2 reader 拡張で別途」と deferred した read 経路を、ここで pure に提供する（debt 解消の土台）。
 *
 * 厳守:
 *   - **column-restricted**: read 列は decision/reviewer/context/dominant_action/hypothesis/evidence/certainty のみ
 *     （proposal_fingerprint=opaque・reviewed_at=temporal・user_id/id を **非 select**＝redacted・raw なし）。
 *   - **enum validation**: decision/reviewer/dominant_action/certainty を runtime 検証し不正 row は null（DB CHECK 前提だが防御）。
 *   - **certainty は low/tentative のみ**（M2 CHECK・型で保証）・pure・deterministic（Date.now/DB/LLM なし）。
 */

import { isReviewDecisionKind, type ReviewDecisionKind, type ReviewerKind } from "./review-flow-contract";

/** M2 read row（context 列のみ・raw/proposal_fingerprint/reviewed_at/user_id/id 非保持）。 */
export interface PrmReviewDecisionReadRow {
  readonly decision: string; // approve/reject/defer（DB CHECK 済）
  readonly reviewer: string; // operator/user（DB CHECK 済）
  readonly source_dimension: string; // band/durationBucket/confidence/source
  readonly source_value: string;
  readonly dominant_action: string; // accept/dismiss/later
  readonly favored_hypothesis: string;
  readonly still_possible: readonly string[] | null;
  readonly evidence_count: number;
  readonly counter_count: number;
  readonly certainty: string; // low/tentative（DB CHECK 済）
}

/** read 用 SELECT 列（column-restricted・raw/fingerprint/reviewed_at/user_id/id 非 select）。 */
export const PRM_REVIEW_DECISION_READ_COLUMNS =
  "decision, reviewer, source_dimension, source_value, dominant_action, favored_hypothesis, still_possible, evidence_count, counter_count, certainty";

/** M2 review decision の clean read model（非断定・provenance 付き・raw なし）。 */
export interface ReviewDecisionRead {
  readonly decision: ReviewDecisionKind;
  readonly reviewer: ReviewerKind;
  readonly contextDimension: string;
  readonly contextValue: string;
  readonly dominantAction: "accept" | "dismiss" | "later";
  readonly favoredHypothesis: string;
  readonly stillPossible: readonly string[];
  readonly evidenceCount: number;
  readonly counterCount: number;
  /** **high なし**（M2 CHECK）。 */
  readonly certainty: "low" | "tentative";
}

const REVIEWER = new Set(["operator", "user"]);
const ACTION = new Set(["accept", "dismiss", "later"]);
const CERTAINTY = new Set(["low", "tentative"]);

/** read row → ReviewDecisionRead（不正 enum は skip・DB CHECK 前提だが防御）。 */
export function prmReviewDecisionRowToRead(row: PrmReviewDecisionReadRow): ReviewDecisionRead | null {
  if (!isReviewDecisionKind(row.decision)) return null;
  if (!REVIEWER.has(row.reviewer)) return null;
  if (!ACTION.has(row.dominant_action)) return null;
  if (!CERTAINTY.has(row.certainty)) return null;
  return {
    decision: row.decision as ReviewDecisionKind,
    reviewer: row.reviewer as ReviewerKind,
    contextDimension: row.source_dimension,
    contextValue: row.source_value,
    dominantAction: row.dominant_action as "accept" | "dismiss" | "later",
    favoredHypothesis: row.favored_hypothesis,
    stillPossible: row.still_possible ?? [],
    evidenceCount: row.evidence_count,
    counterCount: row.counter_count,
    certainty: row.certainty as "low" | "tentative",
  };
}

/** 複数 read row → ReviewDecisionRead[]（不正 row skip）。 */
export function prmReviewDecisionRowsToReads(rows: readonly PrmReviewDecisionReadRow[]): readonly ReviewDecisionRead[] {
  return rows.map(prmReviewDecisionRowToRead).filter((r): r is ReviewDecisionRead => r !== null);
}
