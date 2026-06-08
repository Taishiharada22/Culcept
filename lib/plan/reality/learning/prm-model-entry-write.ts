/**
 * Reality Control OS — A1-7-30 M3 PRM Model Entry Write Contract（**pure・no-DB・no-persist・no-route**・barrel 非 export・未配線）
 *
 * 設計: docs/prm-m3-model-entries-design.md（A1-7-29）/ review-decision-dry-run.ts（A1-7-8）
 *
 * 役割: **approve された review 決定** を M3 `prm_model_entries`（PRM 本体）insert row に変換する pure mapper + repository port。
 *   **実 DB に書かない**（unwired・M3 未 apply）。Supabase adapter は後続。
 *
 * 厳守（reviewRequired を mapper でも担保）:
 *   - **review_decision_id 必須**: 空なら null（PRM entry は review 決定なしに生成不能）。
 *   - **approve のみ entry 化**: decision≠approve（reject/defer）は null（自動学習禁止）。
 *   - **certainty high 禁止**: snapshot.certainty は型で "low"|"tentative"。**personality/trait/fixed_preference を持たない**（文脈束縛 tendency のみ）。
 *   - **raw/seedRef を持たない**: InsertRow は controlled 列のみ。pure・Date.now なし。
 */

import type { ReviewDecisionKind } from "./review-flow-contract";
import type { ReviewedProposalSnapshot } from "./review-decision-dry-run";

/** dominantAction（accept/dismiss/later）→ tendency_direction（傾向・trait でない）。 */
const DOMINANT_TO_TENDENCY: Record<string, "adoption" | "non_adoption" | "deferral"> = {
  accept: "adoption",
  dismiss: "non_adoption",
  later: "deferral",
};

/**
 * M3 `prm_model_entries` insert 行（**M3 列のみ**・user_id/id 除く・**review_decision_id NOT NULL FK**・personality/trait を持たない）。
 */
export interface PrmModelEntryInsertRow {
  readonly context_dimension: string; // band/durationBucket/confidence/source
  readonly context_value: string;
  readonly tendency_direction: "adoption" | "non_adoption" | "deferral"; // 傾向（trait でない）
  readonly favored_hypothesis: string;
  readonly still_possible: readonly string[];
  readonly evidence_count: number;
  readonly counter_count: number;
  readonly certainty: "low" | "tentative"; // **high なし**
  readonly decay_weight: number; // 0..1（初期 1.0）
  readonly review_decision_id: string; // **NOT NULL FK = reviewRequired**
  readonly supersedes_id: string | null; // versioning
  readonly user_visible: boolean;
  readonly user_correction: "rejected" | "direction_adjusted" | "context_refined" | null;
}

export interface ApprovedReviewToModelInput {
  /** 永続済 M2 review decision の id（**reviewRequired FK**）。 */
  readonly reviewDecisionId: string;
  /** 人間の decision（approve のみ entry 化）。 */
  readonly decision: ReviewDecisionKind;
  /** review 時 snapshot（tendency/context/evidence/certainty 源）。 */
  readonly snapshot: ReviewedProposalSnapshot;
  /** version 元 entry（任意）。 */
  readonly supersedesId?: string | null;
}

/**
 * A1-7-30: approve された review 決定 → M3 entry row。**approve ∧ review_decision_id ∧ 妥当 dominantAction** 以外は null。
 *   reviewRequired: review_decision_id 必須・approve のみ。certainty は snapshot 由来（≤tentative）。
 */
export function approvedReviewToModelEntryRow(input: ApprovedReviewToModelInput): PrmModelEntryInsertRow | null {
  if (input.decision !== "approve") return null; // reject/defer は entry なし
  if (!input.reviewDecisionId) return null; // reviewRequired: FK 必須
  const tendency = DOMINANT_TO_TENDENCY[input.snapshot.dominantAction];
  if (!tendency) return null; // 不正 dominantAction
  const s = input.snapshot;
  return {
    context_dimension: s.sourceDimension,
    context_value: s.sourceValue,
    tendency_direction: tendency,
    favored_hypothesis: s.favoredHypothesis,
    still_possible: s.stillPossible,
    evidence_count: s.evidenceCount,
    counter_count: s.counterCount,
    certainty: s.certainty,
    decay_weight: 1.0,
    review_decision_id: input.reviewDecisionId,
    supersedes_id: input.supersedesId ?? null,
    user_visible: true,
    user_correction: null,
  };
}

/** 複数 input → rows（approve でない/無効は skip）。 */
export function approvedReviewsToModelEntryRows(inputs: readonly ApprovedReviewToModelInput[]): readonly PrmModelEntryInsertRow[] {
  return inputs.map(approvedReviewToModelEntryRow).filter((r): r is PrmModelEntryInsertRow => r !== null);
}

export interface PrmModelEntryInsertResult {
  readonly ok: boolean;
  readonly inserted: number;
}

/** M3 model entry の repository port（Supabase client/DB 型を漏らさない・**service_role 禁止**）。 */
export interface PrmModelEntryRepository {
  insert(rows: readonly PrmModelEntryInsertRow[]): Promise<PrmModelEntryInsertResult>;
}
