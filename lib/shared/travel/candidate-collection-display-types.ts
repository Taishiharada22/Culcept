/**
 * D1 — Candidate Collection Display Projection 型（pure types のみ・client-safe）
 *
 * 設計正本: docs/t11-candidate-collection-display-preview-preflight.md（§4）
 *
 * 役割: server-only `CandidateCollectionDraft` を client 表示用に写した型。
 *
 * 厳守（型で client-safe を保証）:
 *   - serverOnly / authoritative / ranked / dominance / pareto / rank フィールドを**持たない**。
 *   - executionAuthority / booking / calendar / action / accepted / finalized を**持たない**。
 *   - raw FitResult / private diagnostics / TravelCorePlan identity / 内部 placeRefId を**持たない**。
 *   - rationale は **shared のみ**（forParticipant は持たない＝private 非露出）。
 *   - itinerary summary は既存 `DisplayDay`/`DisplayNode`/`DisplayTransition` を**再利用**。
 */

import type { DisplayDay } from "./scheduled-draft-display-types";

/** shared-safe な tradeoff 表示要約（factual 数値のみ）。 */
export interface DisplayTradeoffSummary {
  cost: number;
  distance: number;
  fatigue: number;
  experienceVariety: number;
}

/** 1 候補の表示カード（client-safe・shared 情報のみ）。 */
export interface DisplayCandidateCard {
  candidateId: string;
  title: string;
  tags: string[];
  /** ★ ViewerScopedRationale.shared のみ（forParticipant=private は持たない） */
  rationaleShared: string;
  /** shared-safe な不確実性の表示語（任意） */
  uncertaintyLabel?: string;
  /** shared-safe な tradeoff 要約（任意） */
  tradeoffSummary?: DisplayTradeoffSummary;
  /** shared-safe な変更可否ノート（任意） */
  reversalNote?: string;
  /** itinerary summary（既存 client-safe DisplayDay を再利用） */
  days: DisplayDay[];
}

/**
 * 候補集合の表示（client-safe）。
 *   ★ cards の配列順は表示順であって **おすすめ順位でない**（rank フィールド/番号を持たない）。
 */
export interface DisplayCandidateCollection {
  /** ★ draft 提案集合（受理/確定でない） */
  status: "candidate_draft_collection";
  cards: DisplayCandidateCard[];
}
