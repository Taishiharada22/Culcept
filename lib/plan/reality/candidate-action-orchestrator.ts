/**
 * Reality Control OS — A1-6-3 Candidate Action Server Orchestrator / No-write Plan（**pure・no-DB・no-execution**・barrel 非 export・未配線）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.3
 *
 * 役割: accept/dismiss/later を受けた時、**server 側で何を実行すべきか**を **operation plan（実行はしない）** として pure に固める。
 *   live route（別 GO・危険境界）は本 plan を読んで dispatch する薄い executor になる（DB-write 境界のロジックを最小化・事前に最大テスト）。
 *
 *   chain: handle 解決（A1-6-1 resolveAndDecideAction）→ action decision（A1-6-0 decideCandidateAction）→ **operation plan（本 module）**。
 *   - accept(active)  → [status_transition(active→consumed)]・reflectsToPlan=true・deferred=false
 *   - dismiss(active) → [status_transition(active→rejected)]・reflectsToPlan=false・deferred=false
 *   - later(active)   → []・deferred=true（status 変更なし・active 維持で再 surface）
 *   - 非 active / unresolved / stale / expired → fail-closed（accepted=false・operations=[]）
 *
 *   **A1-6-5a 修正（設計 §9.5/§9.6）**: 旧設計の plan_reflection(external_anchor) op は**誤り**で削除し **status-only** に修正。
 *     accept = status→consumed のみ。reflection（accepted candidate が plan に反映されること）は **read/computation 側**（DraftPlan
 *     computation が consumed seed を組み込む）の責務で、executor では anchor write も generateComplete も呼ばない。external_anchor は
 *     外部スケジュール import 専用で candidate accept と無関係。reflectsToPlan は「consumed seed が plan に現れる」response 用フラグ（op ではない）。
 *
 * 厳守:
 *   - **output に seedRef / UUID / raw / source_ref を出さない**: status は enum(from/to) のみ。
 *   - **pure・no-DB・no-execution**: status update / generateComplete / anchor write は **しない**（route の live path）。DB write は operation plan に留める。
 *   - **fail-closed**: 非 active / unresolved → accepted=false・operations=[]（route は no-op）。
 *   - barrel 非 export・route.ts 非接続。seedRef は input(resolution)にあるが **読まず**・output には出さない（route が resolution.seedRef を保持し実行）。
 */

import type { CandidateActionOutcome } from "./candidate-action";
import type { CandidateActionResolution } from "./integration/candidate-action-handle";
import type { PlanSeedStatus } from "../plan-seed";

/** seed status 遷移 op（from→to・**enum のみ・seedRef を持たない**）。route が resolution.seedRef へ `WHERE status=from` で適用＝楽観的並行制御（race-safe）。 */
export interface StatusTransitionOperation {
  readonly kind: "status_transition";
  readonly from: PlanSeedStatus;
  readonly to: PlanSeedStatus;
}

/**
 * server が実行すべき 1 op。**A1-6-5a で status_transition のみ**（旧 plan_reflection op は誤設計で削除）。**seedRef / raw / draft を持たない**。
 *   単一 type だが、将来 op 追加に備え alias で残す（executor の iteration は変えない）。
 */
export type CandidateOperation = StatusTransitionOperation;

/** action に対する **server operation plan**（実行はしない・redacted・route が読んで dispatch）。 */
export interface CandidateOperationPlan {
  /** action が成立したか（resolved ∧ valid）。 */
  readonly accepted: boolean;
  /** redacted reason code（raw/seedRef を持たない）。 */
  readonly reason: string;
  /** 実行すべき op 列（**順序付き・fail-stop**・現状 status_transition のみ）。fail-closed 時は []。 */
  readonly operations: readonly CandidateOperation[];
  /** accepted candidate が plan に反映されるか（consumed seed → computation 側で DraftPlan 組込）。**response 用フラグ・op ではない**。 */
  readonly reflectsToPlan: boolean;
  /** later（deferred・再 surface）か。 */
  readonly deferred: boolean;
}

/**
 * A1-6-3 / A1-6-5a: action outcome（A1-6-0/1 の decision）→ **server operation plan**（pure・no-execution・redacted・**status-only**）。
 *   valid outcome ⟹ from=active（decideCandidateAction は active のみ作用＝不変条件）。
 *   - nextStatus!=null → status_transition(active→nextStatus) を push（accept→consumed / dismiss→rejected）。later は nextStatus=null で op なし。
 *   - reflectsToPlan は outcome から伝播（accept=true / dismiss・later=false）＝「consumed seed が plan に現れる」response フラグ（**別 reflection op は持たない**）。
 *   invalid outcome（非 active・idempotency 防御）→ accepted=false・operations=[]（fail-closed）。
 */
export function planCandidateActionOperations(outcome: CandidateActionOutcome): CandidateOperationPlan {
  if (!outcome.valid) {
    return { accepted: false, reason: outcome.reason, operations: [], reflectsToPlan: false, deferred: false };
  }
  const operations: CandidateOperation[] = [];
  if (outcome.nextStatus !== null) {
    operations.push({ kind: "status_transition", from: "active", to: outcome.nextStatus });
  }
  return { accepted: true, reason: outcome.reason, operations, reflectsToPlan: outcome.reflectsToPlan, deferred: outcome.deferred };
}

/**
 * A1-6-3: A1-6-1 resolution（handle 解決 + decision 済）→ **server operation plan**（pure・redacted）。
 *   未解決（malformed / invalid handle·action / unresolved / not_actionable）→ fail-closed plan（accepted=false・operations=[]）。
 *   **resolution.seedRef は読まない**（output に seedRef を出さない）。route が resolution.seedRef を保持し plan.operations を実行。
 */
export function planCandidateActionFromResolution(resolution: CandidateActionResolution): CandidateOperationPlan {
  if (!resolution.resolved) {
    return { accepted: false, reason: resolution.reason, operations: [], reflectsToPlan: false, deferred: false };
  }
  return planCandidateActionOperations(resolution.outcome);
}
