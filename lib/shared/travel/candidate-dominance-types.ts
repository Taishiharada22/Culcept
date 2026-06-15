/**
 * B2-A — Candidate Dominance Overlay 型（pure types のみ・server-only advisory）
 *
 * 設計正本: docs/t11-travel-candidate-display-closeout-bundle2-design.md（PART2 §2.3/§2.4）
 *
 * 役割: 候補レーン（core-types TravelCandidate.tradeoff）に **Pareto 半順序 dominance** を
 *   **advisory overlay** として付ける型。★ collection を reorder しない・scalar/総順位を作らない。
 *
 * 厳守:
 *   - `dominatedBy` / `paretoOptimal` 語彙は proposal lane と一貫（ただし候補レーン専用の別型）。
 *   - **scalar score / rank 番号 / totalOrder を持たない**。
 *   - executionAuthority / booking / calendar / action / accepted / finalized を**持たない**。
 *   - private diagnostics を持たない（軸は shared-safe な tradeoff のみ）。
 */

/** tradeoff の比較軸（cost/distance/fatigue は低い方が良い・experienceVariety は高い方が良い）。 */
export type TradeoffAxis = "cost" | "distance" | "fatigue" | "experienceVariety";

/** this 候補から見た、ある比較相手との各軸の関係（better=this が良い方向・worse=this が劣る）。 */
export type TradeoffAxisRelation = "better" | "equal" | "worse";

/** dominated 説明: this 候補を支配する相手との per-axis 関係（shared-safe・説明用）。 */
export interface TradeoffAxisDelta {
  /** 比較相手（this を支配する候補の id） */
  versusCandidateId: string;
  /** 各軸での this から見た関係（dominated なら better は出ない＝worse/equal のみ） */
  axes: Record<TradeoffAxis, TradeoffAxisRelation>;
}

/** 1 候補の dominance エントリ。 */
export interface CandidateDominanceEntry {
  candidateId: string;
  /** 自分を支配する candidateId（空 = frontier） */
  dominatedBy: string[];
  /** dominatedBy が空のとき true */
  paretoOptimal: boolean;
  /** 任意・dominated の場合の per-dominator 軸説明（shared-safe） */
  axisDeltas?: TradeoffAxisDelta[];
}

/**
 * ★ server-only advisory dominance overlay。
 *   入力 collection と **同じ id 集合・同順**（reorder しない）。`ranked` を反転しない。
 */
export interface CandidateDominanceOverlay {
  outcome: "candidate_dominance_overlay";
  serverOnly: true;
  authoritative: false;
  /** ★ 推奨/決定でない・collection を変更しない */
  advisory: true;
  /** 入力順を保持 */
  entries: CandidateDominanceEntry[];
  /** frontier（非支配集合）の id */
  paretoOptimalIds: string[];
  // ★ 非所持: score / rank / totalOrder / executionAuthority / booking / calendar / accepted / finalized / planState
}
