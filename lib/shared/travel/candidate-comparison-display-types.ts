/**
 * B2-D1 — Candidate Comparison Display 型（pure types のみ・client-safe）
 *
 * 設計正本: docs/t11-bundle2-dominance-display-preview-preflight.md（§6/§8）
 *
 * 役割: server-only `CandidateDominanceOverlay` を「**順位でない比較メモ**」として client 表示用に写した型。
 *
 * 厳守（型で client-safe を保証）:
 *   - scalar score / rank 番号 / totalOrder を**持たない**。
 *   - executionAuthority / booking / calendar / action / accepted / finalized を**持たない**。
 *   - serverOnly marker / private diagnostics / raw dominatedBy id list / CoAlter Pareto field を**持たない**。
 *   - 一般向け copy に "Pareto" / "best" / "worst" 等を露出しない（caller 責務・本ファイルは型のみ）。
 */

/** ノート種別。 */
export type DominanceNoteKind =
  | "no_clear_weakness" // frontier: 比較上、明確に劣る軸なし
  | "has_clearly_stronger_alternative" // dominated: 他に明確に優る軸あり
  | "not_comparable_yet"; // 0/1 or 比較対象なし / overlay 欠落 / join 不能

/** 1 候補の比較ノート（client-safe）。 */
export interface DisplayCandidateDominanceNote {
  candidateId: string;
  kind: DominanceNoteKind;
  /** 自然文（best/worst/rank/score を含まない・「順位ではありません」を含む） */
  text: string;
  /** dominated 時のみ・**shared-safe な日本語軸ラベル**（例: ["費用","疲労"]）。生 id を含まない。 */
  weakerAxes?: string[];
}

/**
 * 比較メモ（client-safe）。
 *   ★ `notes` は **入力 DisplayCandidateCollection の card 順を保持**。sort/除去しない。
 */
export interface DisplayCandidateComparison {
  status: "candidate_comparison_memo";
  /** 「順番はおすすめ順位ではありません。これは自動決定ではありません。」相当の自然文。 */
  orderDisclaimer: string;
  notes: DisplayCandidateDominanceNote[];
}
