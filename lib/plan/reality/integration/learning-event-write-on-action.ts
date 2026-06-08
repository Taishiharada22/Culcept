import "server-only";
/**
 * Reality Control OS — A1-7-17 Learning Event Write On Action（route connection core・**server-only・flag-gated・fail-open**）
 *
 * 設計: docs/prm-learning-event-insert-path-design.md（A1-7-13・slice ④）/ §10.16 Supabase repo / §10.17
 *
 * 役割: candidate action route（`runCandidateActionRoute`）の **status transition 成功後**に、learning event を
 *   `toDryRunLearningEvent` → `toPrmLearningEventInsertRow` → `PrmLearningEventRepository.insert` で書く **glue**。
 *   route.ts(POST) は本 glue を flag-gated で呼ぶだけ（repository は injected adapter）。
 *
 * 厳守:
 *   - **flag default OFF**: `flagEnabled=false` で即 return（insert 0・既存挙動完全不変）。
 *   - **status transition 成功時のみ**: `response.accepted ∧ !deferred`（accept→consumed / dismiss→rejected）。
 *     later（deferred）/ 失敗（accepted=false）/ 解決不能 → 書かない。
 *   - **await-and-swallow（best-effort）**: insert を await するが、結果/例外は **user action response を壊さない**
 *     （status update が主責務・learning write は付随）。fail-open。
 *   - **時刻は route 境界注入**（`nowMs`）: pure helper 内で Date.now を直呼びしない（`new Date(nowMs)` は注入値由来＝決定的）。
 *   - **raw/seedRef を出さない**: context は CandidateLifecycleEntry（構造のみ）由来・handle は opaque・row は M1 列のみ。barrel 非 export。
 */

import {
  validateActionRequest,
  deriveCandidateHandle,
  type RedactedActionResponse,
} from "./candidate-action-handle";
import { confidenceBand, type TimeBandLabel, type EvidenceSourceLabel } from "./candidate-surface";
import type { CandidateLifecycleEntry } from "./candidate-lifecycle-guard";
import { toDryRunLearningEvent, type CandidateActionContext } from "../learning/dry-run-learning-event";
import { toPrmLearningEventInsertRow, type PrmLearningEventRepository } from "../learning/prm-learning-event-insert";

/** retention（A1-7-5 / A1-7-10 整合・expires_at window）。 */
export const LEARNING_EVENT_TTL_DAYS = 180;
const LEARNING_EVENT_TTL_MS = LEARNING_EVENT_TTL_DAYS * 24 * 60 * 60 * 1000;

/** v1: CandidateLifecycleEntry は duration 根拠 kind を保持しないため既定（将来 entry enrich で精緻化）。 */
const DEFAULT_EVIDENCE_SOURCE: EvidenceSourceLabel = "seed_explicit";

/** 注入 nowMs（route 境界の Date.now）→ expires_at ISO（180 日後・決定的）。 */
export function learningEventExpiresAtISO(nowMs: number): string {
  return new Date(nowMs + LEARNING_EVENT_TTL_MS).toISOString();
}

/** desiredTimeHint（自由 string）→ TimeBandLabel | null（morning/afternoon/evening のみ）。 */
function toLearningBand(hint: string | null): TimeBandLabel | null {
  return hint === "morning" || hint === "afternoon" || hint === "evening" ? hint : null;
}

export interface WriteLearningEventOnActionInput {
  /** PLAN_FLAGS.realityLearningEventWrite（default false）。 */
  readonly flagEnabled: boolean;
  /** action request raw（handle/action を再 parse・既存 contract）。 */
  readonly rawBody: unknown;
  /** action route の redacted response（accepted/deferred を判定）。 */
  readonly response: RedactedActionResponse;
  /** surfaceable な enriched entries（context 源・seedRef は server-side）。 */
  readonly entries: readonly CandidateLifecycleEntry[];
  /** injected repository（live=Supabase / test=mock）。userId は repository が束縛済。 */
  readonly repository: PrmLearningEventRepository;
  /** route 境界の Date.now（注入・helper 内で Date.now 直呼びしない）。 */
  readonly nowMs: number;
}

/**
 * A1-7-17: action route の status 成功後に learning event を 1 件 insert する **glue**（flag-gated・await-and-swallow）。
 *   flag OFF / 非 accepted / deferred(later) / parse 不能 / entry 解決不能 → **何もしない**（insert 0）。
 *   それ以外 → context 構築 → toDryRunLearningEvent(action, nowISO) → toPrmLearningEventInsertRow（capturedAt=now, expiresAt=now+180d）
 *     → repository.insert（**await-and-swallow**: 失敗/例外は握り user action を壊さない）。
 */
export async function writeLearningEventOnAction(input: WriteLearningEventOnActionInput): Promise<void> {
  if (!input.flagEnabled) return; // flag OFF → insert 0・既存不変
  const { response } = input;
  if (!response.accepted || response.deferred) return; // status transition 成功時のみ（later/失敗を除外）

  const parsed = validateActionRequest(input.rawBody);
  if (!parsed.ok) return; // defensive（accepted=true は通常 parse 成功を含意）

  const entry = input.entries.find((e) => deriveCandidateHandle(e.seedRef) === parsed.handle);
  if (!entry) return; // 解決不能 → skip（fail-open）

  const ctx: CandidateActionContext = {
    handle: parsed.handle, // opaque（seedRef でない）
    date: entry.desiredDate,
    band: toLearningBand(entry.desiredTimeHint),
    confidenceBand: confidenceBand(entry.confidence), // numeric→band（raw 数値を出さない）
    durationMin: entry.durationMin,
    evidenceSource: DEFAULT_EVIDENCE_SOURCE,
  };

  const nowISO = new Date(input.nowMs).toISOString(); // 注入値由来（Date.now 直呼びでない）
  const event = toDryRunLearningEvent(ctx, parsed.action, nowISO);
  const row = toPrmLearningEventInsertRow(event, {
    capturedAtISO: nowISO,
    expiresAtISO: learningEventExpiresAtISO(input.nowMs),
  });

  try {
    await input.repository.insert([row]); // best-effort・await-and-swallow
  } catch {
    // fail-open: learning write 失敗は user action response を壊さない（status update が主責務）
  }
}
