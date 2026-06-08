/**
 * Reality Control OS — A1-7-14 PRM Learning Event Insert Contract（**pure・no-DB・no-Supabase・no-persist・no-route・no-LLM**・barrel 非 export・未配線）
 *
 * 設計: docs/prm-learning-event-insert-path-design.md（A1-7-13）/ docs/prm-migration-readiness-plan.md（M1）/ §10.11 / §10.14
 *
 * 役割: A1-7-0 `DryRunLearningEvent` を、将来 M1 `prm_learning_events` に insert 可能な **安全 row shape** に変換する pure mapper +
 *   **repository interface / result**（DB 固有型・Supabase client を漏らさない契約）。**実 DB に書かない**（A1-7-14 は insert contract / fake foundation）。
 *   Supabase repository（real insert）/ route connection / DB apply は **後続 gate**（CEO 承認）。
 *
 * 厳守:
 *   - **pure・deterministic**: DB / Supabase / network / route / Date.now / LLM なし。**保存しない**。barrel 非 export。
 *   - **raw / seedRef / utterance / personality / trait / fixed_preference は型として生成不能**（InsertRow に列が存在しない）。
 *   - handle は opaque（一方向 hash・seedRef でない）。user_id は repository が auth 文脈で付与（mapper は持たない）。
 *   - timestamp は **注入**（acted_at は event 由来・captured_at は注入・Date.now を直呼びしない）。
 */

import type { DryRunLearningEvent, LearningSignal } from "./dry-run-learning-event";
import type { CandidateActionKind } from "../candidate-action";
import type { ConfidenceBand, EvidenceSourceLabel, TimeBandLabel } from "../integration/candidate-surface";

/**
 * M1 `prm_learning_events` に insert する **安全 row**（M1 列に一致・**raw/seedRef/certainty/hypotheses/personality を持たない**）。
 *   user_id / id は含めない（user_id=repository が auth.uid() で付与・id=DB 生成）。
 */
export interface PrmLearningEventInsertRow {
  readonly handle: string; // opaque（seedRef でない）
  readonly action: CandidateActionKind; // accept/dismiss/later（M1 CHECK と一致）
  readonly signal: LearningSignal; // adoption/non_adoption/deferral
  readonly desired_date: string | null; // YYYY-MM-DD
  readonly band: TimeBandLabel | null; // morning/afternoon/evening
  readonly confidence_band: ConfidenceBand; // high/medium/low
  readonly duration_min: number | null;
  readonly source_kind: EvidenceSourceLabel; // seed_explicit/correction
  readonly acted_at: string; // ISO（NOT NULL・event 由来 or capture fallback）
  readonly captured_at: string | null; // ISO（注入・null は DB default NOW()）
  readonly expires_at: string | null; // ISO（注入 TTL・null は無期限）
}

/** 注入 timestamp（**Date.now 直呼び回避**・capturedAtISO 必須・expiresAtISO 任意 TTL）。 */
export interface InsertRowInjection {
  readonly capturedAtISO: string;
  readonly expiresAtISO?: string | null;
}

/**
 * A1-7-14: `DryRunLearningEvent` → `PrmLearningEventInsertRow`（pure・M1 列のみ・raw/seedRef を生成不能）。
 *   acted_at = event.actedAtISO（無ければ capturedAtISO へ fallback）。captured_at = 注入。expires_at = 注入 TTL（任意）。
 *   **user_id を持たない**（repository が付与）。**Date.now を呼ばない**（時刻は注入）。
 */
export function toPrmLearningEventInsertRow(event: DryRunLearningEvent, injection: InsertRowInjection): PrmLearningEventInsertRow {
  return {
    handle: event.handle,
    action: event.action,
    signal: event.signal,
    desired_date: event.desiredDate,
    band: event.band,
    confidence_band: event.confidenceBand,
    duration_min: event.durationMin,
    source_kind: event.sourceKind,
    acted_at: event.actedAtISO ?? injection.capturedAtISO,
    captured_at: injection.capturedAtISO,
    expires_at: injection.expiresAtISO ?? null,
  };
}

/** A1-7-14: 複数 event → rows（pure・順序保持）。 */
export function toPrmLearningEventInsertRows(
  inputs: readonly { readonly event: DryRunLearningEvent; readonly injection: InsertRowInjection }[]
): readonly PrmLearningEventInsertRow[] {
  return inputs.map((i) => toPrmLearningEventInsertRow(i.event, i.injection));
}

/** insert 結果（**最小**・DB 固有型を漏らさない・raw を返さない）。 */
export interface PrmLearningEventInsertResult {
  readonly ok: boolean;
  readonly inserted: number; // 実際に追加された件数（dedup 後）
}

/**
 * A1-7-14: PRM learning event の **repository port**（**Supabase client / DB 型を漏らさない**）。
 *   実装は ① fake（in-memory・本 slice）② Supabase（後続 gate）。fire-and-forget/fail-open は呼び出し側（後続 route）の責務。
 */
export interface PrmLearningEventRepository {
  insert(rows: readonly PrmLearningEventInsertRow[]): Promise<PrmLearningEventInsertResult>;
}
