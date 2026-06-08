import "server-only";
/**
 * Reality Control OS — A1-6-6 Candidate Action Route Support（**server-only・barrel 非 export**・route core）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.11
 *
 * 役割: action route（`{handle, action}` → `{ok, data}`）の **testable core**。route.ts(POST) は薄い wrapper（auth + json + envelope）。
 *   - `loadSurfaceableForAction`: user の **surfaceable candidate を再 read**（surface と同一 pipeline・seedRef 付き・server-side）→ SurfaceableCandidate[]。
 *   - `runCandidateActionRoute`: handleCandidateActionRequest（A1-6-4・resolve→decide→execute・redacted）+ `{ok, data}` envelope。
 *
 * 厳守:
 *   - **surfaceable 再 read は surface と同一**（loadActiveCandidateEntries + selectSurfaceableCandidates）＝drift なし・active∧fresh∧非 expired∧dedup のみ。
 *   - **seedRef は server-side のみ**（surfaceable は内部値・response は redactResolutionForClient で seedRef 非出）。
 *   - **user-RLS client 注入**（auth user 以外の seed は読めない/書けない）・service_role なし・本 module は createClient しない。
 *   - **status-only**（generateComplete / anchor / external_anchor は使わない）。barrel 非 export。
 */

import { loadActiveCandidateEntries, type PendingCapturedRowsReadClient } from "./morning-capture-surface.server";
import { selectSurfaceableCandidates, type CandidateLifecycleEntry } from "./candidate-lifecycle-guard";
import { handleCandidateActionRequest, type CandidateActionExecutor } from "./candidate-action-executor";
import type { SurfaceableCandidate, RedactedActionResponse } from "./candidate-action-handle";
import type { PlanSeedStatus } from "../../plan-seed";

/**
 * A1-6-6: user の **surfaceable candidate を再 read**（surface と同一 pipeline）→ SurfaceableCandidate[]（seedRef + status='active'）。
 *   loadActiveCandidateEntries（read + enrich + lifecycle entry・surface guard と同一構築）→ selectSurfaceableCandidates（active∧fresh∧非 expired∧dedup）。
 *   **seedRef は server-side のみ**（resolve に使う・response 非出）。read 失敗 / 候補なし → []（fail-closed: handle 解決不能）。
 */
/** surfaceable 再 read 結果（reduced surfaceable + **context 付き surfaceable entries**）。 */
export interface SurfaceableForAction {
  /** handle 解決用（seedRef + status・client 非搬送）。 */
  readonly surfaceable: readonly SurfaceableCandidate[];
  /**
   * A1-7-24: **pre-transition** な surfaceable entries（context 付き）。learning write（A1-7-17）に渡す。
   *   status transition の **前**に capture するため、accept→consumed / dismiss→rejected 後でも acted candidate の
   *   context を解決でき、3 action すべてで learning event を書ける（A1-7-23 bug 修正）。
   */
  readonly entries: readonly CandidateLifecycleEntry[];
}

/**
 * A1-7-24: user の surfaceable candidate を **1 read** で再 read し、reduced surfaceable + context 付き entries を返す。
 *   loadActiveCandidateEntries → selectSurfaceableCandidates（active∧fresh∧非 expired∧dedup）→ filtered entries（context）。
 *   surfaceable は entries の reduce（seedRef+status）。**entries は transition 前 snapshot**（learning write の context 源）。
 */
export async function loadSurfaceableForActionWithEntries(
  client: PendingCapturedRowsReadClient,
  userId: string,
  nowMs: number
): Promise<SurfaceableForAction> {
  const all = await loadActiveCandidateEntries(client, userId, nowMs);
  const filtered = selectSurfaceableCandidates(all, { nowMs }).surfaceable; // active∧fresh∧非expired∧dedup（context 付き）
  return {
    surfaceable: filtered.map((e): SurfaceableCandidate => ({ seedRef: e.seedRef, status: e.status as PlanSeedStatus })),
    entries: filtered,
  };
}

/** A1-6-6: reduced surfaceable のみ（既存 API 互換・WithEntries に委譲）。 */
export async function loadSurfaceableForAction(
  client: PendingCapturedRowsReadClient,
  userId: string,
  nowMs: number
): Promise<readonly SurfaceableCandidate[]> {
  return (await loadSurfaceableForActionWithEntries(client, userId, nowMs)).surfaceable;
}

/** route 成功 envelope（**data は redacted・seedRef なし**）。 */
export interface CandidateActionRouteOk {
  readonly ok: true;
  readonly data: RedactedActionResponse;
}

/**
 * A1-6-6: action route core（**injected surfaceable + executor**・testable）。
 *   handleCandidateActionRequest（A1-6-4: validate → resolve[surfaceable] → decide → execute[from=active guard] → redact）→ `{ok:true, data}`。
 *   malformed / invalid handle·action / unresolved / non-active → data.accepted=false（**fail-closed**・route は 200 + accepted=false）。
 *   **response に seedRef / UUID / raw を出さない**（RedactedActionResponse）。
 */
export async function runCandidateActionRoute(
  rawBody: unknown,
  surfaceable: readonly SurfaceableCandidate[],
  executor: CandidateActionExecutor
): Promise<CandidateActionRouteOk> {
  const data = await handleCandidateActionRequest(rawBody, surfaceable, executor);
  return { ok: true, data };
}
