/**
 * Reality Control OS — A1-6-3 Candidate Action Server Orchestrator / No-write Plan（**pure・no-DB・no-execution**・barrel 非 export・未配線）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.3
 *
 * 役割: accept/dismiss/later を受けた時、**server 側で何を実行すべきか**を **operation plan（実行はしない）** として pure に固める。
 *   live route（別 GO・危険境界）は本 plan を読んで dispatch する薄い executor になる（DB-write 境界のロジックを最小化・事前に最大テスト）。
 *
 *   chain: handle 解決（A1-6-1 resolveAndDecideAction）→ action decision（A1-6-0 decideCandidateAction）→ **operation plan（本 module）**。
 *   - accept(active)  → [plan_reflection(external_anchor), status_transition(active→consumed)]・deferred=false
 *   - dismiss(active) → [status_transition(active→rejected)]・deferred=false（reflection なし）
 *   - later(active)   → []・deferred=true（status 変更なし・active 維持で再 surface）
 *   - 非 active / unresolved / stale / expired → fail-closed（accepted=false・operations=[]）
 *
 *   **安全順序（accept）**: plan_reflection を先・status_transition を後（anchor 失敗時に consume しない＝seed は active のまま retryable・
 *     「consume したのに plan に何も無い」を構造的に防ぐ）。route は **fail-stop** で実行（先行 op 失敗→後続中止）。
 *     create_external_anchor_bundle（20260519100000）は external_anchor_sources/external_anchors のみ insert し
 *     **plan_seed を触らない**＝anchor write と consume は別 op（二重 consume なし・status_transition は route が別途実装する UPDATE）。
 *
 * 厳守:
 *   - **output に seedRef / UUID / raw / source_ref を出さない**: status は enum(from/to)・reflection は KIND のみ。
 *     **CandidateDraft は plan に入れない**（その id="complete-{seedRef}" は seedRef を持つ）→ draft 生成は route が実行時に行う（plan は KIND="external_anchor" の intent のみ）。
 *   - **pure・no-DB・no-execution**: status update / anchor write / generateComplete 呼び出しは **しない**（route の live path）。DB write は operation plan に留める。
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

/** plan 反映 op（**KIND のみ・draft を持たない**＝seedRef を出さない）。route が generateComplete→create_external_anchor_bundle を実行。 */
export interface PlanReflectionOperation {
  readonly kind: "plan_reflection";
  readonly reflection: "external_anchor";
}

/** server が実行すべき 1 op（status 遷移 / plan 反映）。**seedRef / raw / draft を持たない**。 */
export type CandidateOperation = StatusTransitionOperation | PlanReflectionOperation;

/** action に対する **server operation plan**（実行はしない・redacted・route が読んで dispatch）。 */
export interface CandidateOperationPlan {
  /** action が成立したか（resolved ∧ valid）。 */
  readonly accepted: boolean;
  /** redacted reason code（raw/seedRef を持たない）。 */
  readonly reason: string;
  /** 実行すべき op 列（**順序付き・fail-stop**・accept は reflection→status の安全順）。fail-closed 時は []。 */
  readonly operations: readonly CandidateOperation[];
  /** later（deferred・再 surface）か。 */
  readonly deferred: boolean;
}

/**
 * A1-6-3: action outcome（A1-6-0/1 の decision）→ **server operation plan**（pure・no-execution・redacted）。
 *   valid outcome ⟹ from=active（decideCandidateAction は active のみ作用＝不変条件）。
 *   - reflectsToPlan → plan_reflection(external_anchor) を **先**に push（anchor 生成優先）。
 *   - nextStatus!=null → status_transition(active→nextStatus) を **後**に push（reflection 成功後に consume）。
 *   invalid outcome（非 active・idempotency 防御）→ accepted=false・operations=[]（fail-closed）。
 */
export function planCandidateActionOperations(outcome: CandidateActionOutcome): CandidateOperationPlan {
  if (!outcome.valid) {
    return { accepted: false, reason: outcome.reason, operations: [], deferred: false };
  }
  const operations: CandidateOperation[] = [];
  // 安全順序: reflection（anchor）を先・status（consume）を後（anchor 失敗時に consume しない・route は fail-stop）。
  if (outcome.reflectsToPlan) {
    operations.push({ kind: "plan_reflection", reflection: "external_anchor" });
  }
  if (outcome.nextStatus !== null) {
    operations.push({ kind: "status_transition", from: "active", to: outcome.nextStatus });
  }
  return { accepted: true, reason: outcome.reason, operations, deferred: outcome.deferred };
}

/**
 * A1-6-3: A1-6-1 resolution（handle 解決 + decision 済）→ **server operation plan**（pure・redacted）。
 *   未解決（malformed / invalid handle·action / unresolved / not_actionable）→ fail-closed plan（accepted=false・operations=[]）。
 *   **resolution.seedRef は読まない**（output に seedRef を出さない）。route が resolution.seedRef を保持し plan.operations を実行。
 */
export function planCandidateActionFromResolution(resolution: CandidateActionResolution): CandidateOperationPlan {
  if (!resolution.resolved) {
    return { accepted: false, reason: resolution.reason, operations: [], deferred: false };
  }
  return planCandidateActionOperations(resolution.outcome);
}
