/**
 * Reality Control OS — A1-7-34 PRM Model Entry Read Mapper（**pure・no-DB・no-server-only**・barrel 非 export）
 *
 * 設計: docs/prm-second-self-surfacing-design.md（A1-7-34）/ prm-model-entry-write.ts（M3）
 *
 * 役割: M3 `prm_model_entries`（review 済 tendency）の read row を **第二の自己 tendency 読み model** に変換する pure mapper。
 *   presenter（second-self-presenter）が非断定 copy にする。**read-only・raw/personality を持たない**。
 *
 * 厳守:
 *   - **column-restricted**: read 列は tendency/context/evidence/certainty/provenance/correction のみ（raw/seedRef/user_id/id/decay_weight 非 select）。
 *   - **certainty は low/tentative のみ**（M3 CHECK・型で保証）。**tendency-not-trait**（文脈束縛 tendency）。pure。
 */

/** M3 read row（context 列のみ・raw/seedRef/user_id/id/decay 非保持）。 */
export interface PrmModelEntryReadRow {
  readonly context_dimension: string;
  readonly context_value: string;
  readonly tendency_direction: string; // adoption/non_adoption/deferral（DB CHECK 済）
  readonly favored_hypothesis: string;
  readonly still_possible: readonly string[] | null;
  readonly evidence_count: number;
  readonly counter_count: number;
  readonly certainty: string; // low/tentative（DB CHECK 済）
  readonly review_decision_id: string; // provenance（NOT NULL=reviewed）
  readonly user_correction: string | null;
}

/** read 用 SELECT 列（column-restricted・raw/user_id/id/decay 非 select）。 */
export const PRM_MODEL_ENTRY_READ_COLUMNS =
  "context_dimension, context_value, tendency_direction, favored_hypothesis, still_possible, evidence_count, counter_count, certainty, review_decision_id, user_correction";

/** 第二の自己 tendency 読み model（presenter 入力・非断定・provenance 付き）。 */
export interface SecondSelfTendency {
  readonly contextDimension: string;
  readonly contextValue: string;
  readonly tendencyDirection: "adoption" | "non_adoption" | "deferral";
  readonly favoredHypothesis: string;
  readonly stillPossible: readonly string[];
  readonly evidenceCount: number;
  readonly counterCount: number;
  /** **high なし**（M3 CHECK）。 */
  readonly certainty: "low" | "tentative";
  /** review 済か（review_decision_id 存在＝人間 review の証跡・M3 は常に true）。 */
  readonly reviewed: boolean;
  /** ユーザー訂正状態（null=未訂正）。 */
  readonly userCorrection: "rejected" | "direction_adjusted" | "context_refined" | null;
}

const TENDENCY = new Set(["adoption", "non_adoption", "deferral"]);
const CERTAINTY = new Set(["low", "tentative"]);
const CORRECTION = new Set(["rejected", "direction_adjusted", "context_refined"]);

/** read row → SecondSelfTendency（不正値は防御的に正規化・certainty high は構造的に来ない）。 */
export function prmModelEntryRowToTendency(row: PrmModelEntryReadRow): SecondSelfTendency | null {
  if (!TENDENCY.has(row.tendency_direction)) return null; // 不正 direction は skip
  if (!CERTAINTY.has(row.certainty)) return null; // high 等は skip（DB CHECK 前提だが防御）
  return {
    contextDimension: row.context_dimension,
    contextValue: row.context_value,
    tendencyDirection: row.tendency_direction as "adoption" | "non_adoption" | "deferral",
    favoredHypothesis: row.favored_hypothesis,
    stillPossible: row.still_possible ?? [],
    evidenceCount: row.evidence_count,
    counterCount: row.counter_count,
    certainty: row.certainty as "low" | "tentative",
    reviewed: typeof row.review_decision_id === "string" && row.review_decision_id.length > 0,
    userCorrection: row.user_correction && CORRECTION.has(row.user_correction) ? (row.user_correction as SecondSelfTendency["userCorrection"]) : null,
  };
}

/** 複数 read row → SecondSelfTendency[]（不正 row skip）。 */
export function prmModelEntryRowsToTendencies(rows: readonly PrmModelEntryReadRow[]): readonly SecondSelfTendency[] {
  return rows.map(prmModelEntryRowToTendency).filter((t): t is SecondSelfTendency => t !== null);
}

// ── A1-7-35 feedback 用（**server-only パス**・id 付き・client に出さない）──

/** feedback 解決用の M3 entry（**id 付き**・confirm/correct/reject の対象特定 + user M2 構築）。 */
export interface PrmModelEntryFeedbackEntry {
  readonly id: string;
  readonly contextDimension: string;
  readonly contextValue: string;
  readonly tendencyDirection: "adoption" | "non_adoption" | "deferral";
  readonly favoredHypothesis: string;
  readonly stillPossible: readonly string[];
  readonly evidenceCount: number;
  readonly counterCount: number;
  readonly certainty: "low" | "tentative";
}

/** feedback read 列（id 含む・raw/personality なし・**server-only**）。 */
export const PRM_MODEL_ENTRY_FEEDBACK_COLUMNS =
  "id, context_dimension, context_value, tendency_direction, favored_hypothesis, still_possible, evidence_count, counter_count, certainty";

/** feedback read row（id 付き）。 */
export interface PrmModelEntryFeedbackRow extends PrmModelEntryReadRow {
  readonly id: string;
}

/** feedback row → entry（不正 direction/certainty/id なしは null）。 */
export function prmModelEntryRowToFeedbackEntry(row: PrmModelEntryFeedbackRow): PrmModelEntryFeedbackEntry | null {
  if (typeof row.id !== "string" || row.id.length === 0) return null;
  if (!TENDENCY.has(row.tendency_direction) || !CERTAINTY.has(row.certainty)) return null;
  return {
    id: row.id,
    contextDimension: row.context_dimension,
    contextValue: row.context_value,
    tendencyDirection: row.tendency_direction as "adoption" | "non_adoption" | "deferral",
    favoredHypothesis: row.favored_hypothesis,
    stillPossible: row.still_possible ?? [],
    evidenceCount: row.evidence_count,
    counterCount: row.counter_count,
    certainty: row.certainty as "low" | "tentative",
  };
}

export function prmModelEntryRowsToFeedbackEntries(rows: readonly PrmModelEntryFeedbackRow[]): readonly PrmModelEntryFeedbackEntry[] {
  return rows.map(prmModelEntryRowToFeedbackEntry).filter((e): e is PrmModelEntryFeedbackEntry => e !== null);
}

/** tendency key（context_dimension:context_value:tendency_direction・feedback 対象特定）。 */
export function tendencyKey(e: { readonly contextDimension: string; readonly contextValue: string; readonly tendencyDirection: string }): string {
  return `${e.contextDimension}:${e.contextValue}:${e.tendencyDirection}`;
}
