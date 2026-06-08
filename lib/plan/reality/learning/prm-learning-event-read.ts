/**
 * Reality Control OS — A1-7-26 PRM Learning Event Read Mapper（**pure・no-DB・no-server-only**・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §10.26 / prm-learning-event-insert.ts（A1-7-14 逆写像）
 *
 * 役割: 永続化された `prm_learning_events` row（context 列）を **A1-7-0 `DryRunLearningEvent` に再構築**する pure mapper。
 *   reconstruct ctx → `toDryRunLearningEvent`（insert と同一 helper）ゆえ signal/hypotheses は insert 時と faithful 一致。
 *   再構築した events を既存 `aggregateDryRunEvents`（A1-7-1・dedupeSameDay）/ `projectPrmDryRun`（A1-7-3）に流して
 *   tentative pattern / proposal を **観測**する（read 側・PRM model でない・dry-run と同形）。
 *
 * 厳守:
 *   - **pure・deterministic**: DB / Date.now / LLM なし。signal/hypotheses は **action から再導出**（stored signal を読まない=単一 source）。
 *   - **raw / seedRef を持ち込まない**: read row は **context 列のみ**（handle opaque・raw/source_ref/user_id/id を含まない型）。
 */

import type { CandidateActionKind } from "../candidate-action";
import { isValidActionKind } from "../candidate-action";
import { toDryRunLearningEvent, type CandidateActionContext, type DryRunLearningEvent } from "./dry-run-learning-event";
import type { ConfidenceBand, EvidenceSourceLabel, TimeBandLabel } from "../integration/candidate-surface";

/**
 * `prm_learning_events` の **read 用 context row**（M1 の context 列のみ・**raw/seedRef/user_id/id/signal を含まない**）。
 *   signal は action から再導出するため読まない。DB CHECK が action/band/confidence_band/source_kind の妥当性を保証。
 */
export interface PrmLearningEventReadRow {
  readonly handle: string;
  readonly action: CandidateActionKind;
  readonly desired_date: string | null;
  readonly band: TimeBandLabel | null;
  readonly confidence_band: ConfidenceBand;
  readonly duration_min: number | null;
  readonly source_kind: EvidenceSourceLabel;
  readonly acted_at: string;
}

/** read 用 SELECT 列（column-restricted・raw/source_ref/user_id/id を select しない）。 */
export const PRM_LEARNING_EVENT_READ_COLUMNS = "handle, action, desired_date, band, confidence_band, duration_min, source_kind, acted_at";

/**
 * A1-7-26: read row → `DryRunLearningEvent`（ctx 再構築 → toDryRunLearningEvent）。insert と同一 helper ゆえ faithful。
 */
export function prmLearningEventRowToDryRunEvent(row: PrmLearningEventReadRow): DryRunLearningEvent {
  const ctx: CandidateActionContext = {
    handle: row.handle,
    date: row.desired_date,
    band: row.band,
    confidenceBand: row.confidence_band,
    durationMin: row.duration_min,
    evidenceSource: row.source_kind,
  };
  return toDryRunLearningEvent(ctx, row.action, row.acted_at);
}

/**
 * A1-7-26: 複数 read row → DryRunLearningEvent[]（**action 不正な row は skip**＝防御・DB CHECK 前提だが loose row 耐性）。
 */
export function prmLearningEventRowsToDryRunEvents(rows: readonly PrmLearningEventReadRow[]): readonly DryRunLearningEvent[] {
  return rows.filter((r) => isValidActionKind(r.action)).map(prmLearningEventRowToDryRunEvent);
}
