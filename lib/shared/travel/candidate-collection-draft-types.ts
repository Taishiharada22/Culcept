/**
 * C4-A — Candidate Collection Draft 型（pure types のみ）
 *
 * 設計正本: docs/t11-candidate-insertion-adapter-design.md（§6 案 C・§7 境界）
 *
 * 役割: 完成 core-types `TravelCandidate` を **server-only・非権威・非 ranked** の
 *   **保管ドラフト**に保持する型。★ `TravelCorePlan` ではない（holding area）。
 *
 * 厳守:
 *   - `CandidateCollectionDraft` は TravelCorePlan の identity/planState を持たない。
 *   - `ranked:false`（配列順 = 保管/表示順であって ranking でない）。
 *   - accepted/finalized・executionAuthority・booking/calendar/action・dominance/pareto/rank・
 *     persistence フィールドを**持たない**。
 *   - 成功 outcome は `added_to_collection_draft`（"inserted_into_plan" 等の TravelCorePlan 変更を含意する語を避ける）。
 */

import type { TravelCandidate } from "./core-types";

/** ★ server-only・非権威・非 ranked の保管ドラフト（TravelCorePlan でない）。 */
export interface CandidateCollectionDraft {
  outcome: "candidate_collection_draft";
  /** ★ client/shared payload でない */
  serverOnly: true;
  /** ★ 実行/最終権威でない */
  authoritative: false;
  /** ★ 配列順 = 保管/表示順・ranking でない */
  ranked: false;
  /** core-types TravelCandidate のみ・storage/display order */
  candidates: TravelCandidate[];
  // ★ 非所持: TravelCorePlan identity / planState / accepted / finalized /
  //   executionAuthority / booking / calendar / action / dominatedBy / paretoOptimal / rank / persistence
}

/** 追加拒否の中立理由。 */
export type InsertionRejectionReason =
  | "duplicate_candidate_id"
  | "empty_candidate_id"
  | "not_core_types_candidate"
  | "forbidden_input_kind" // envelope / conversion 中間 / display / CoAlter / FitResult 等
  | "invalid_input";

/** 追加診断（中立・private 値/自由文を含めない）。 */
export interface CandidateInsertionDiagnostic {
  reason: InsertionRejectionReason;
  /** 重複時等の candidateId（neutral） */
  candidateId?: string;
}

/** 追加結果（保管ドラフトへ追加 / 拒否）。★ TravelCorePlan への insert ではない。 */
export type CandidateInsertionResult =
  | { outcome: "added_to_collection_draft"; serverOnly: true; collection: CandidateCollectionDraft }
  | { outcome: "insertion_rejected"; serverOnly: true; diagnostic: CandidateInsertionDiagnostic };
