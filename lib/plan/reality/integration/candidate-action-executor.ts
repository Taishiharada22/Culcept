import "server-only";
/**
 * Reality Control OS — A1-6-4 Candidate Action Executor / Route Contract Skeleton（**server-only・no-write**・executor 注入・barrel 非 export・未配線）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.4
 *
 * 役割: A1-6-3 の operation plan を **将来 route がどう実行するか** を no-write で固める。実 DB write はせず、
 *   **executor を注入**（live=DB primitive / test=fake）し、実行 semantics（順序・fail-stop・conflict・redaction）を検証する。
 *
 *   chain（route handler skeleton）: request {handle, action} → resolveAndDecideAction（A1-6-1）→ planCandidateActionFromResolution（A1-6-3）
 *     → **executeCandidateOperationPlan（本 module・executor 注入）** → RedactedActionResponse（seedRef なし）。
 *
 *   **A1-6-5a 修正（設計 §9.5/§9.6）**: 旧 plan_reflection op は誤設計で削除し **status-only** に修正。executor は applyStatusTransition のみ。
 *   実行 semantics（**status-only**）:
 *     - accept = [status_transition(active→consumed)] / dismiss = [status_transition(active→rejected)] / later = []（executor 呼ばない・deferred）。
 *     - applyStatusTransition（**from=active guard**）→ ok=false（0 rows = 並行 consume / duplicate submit）→ status_conflict。非 active/unresolved = fail-closed（executor 呼ばない）。
 *     - reflection（accepted candidate が plan に反映）は **read/computation 側**（DraftPlan が consumed seed を組み込む）の責務で executor では扱わない。reflectsToPlan は plan から伝播する response フラグ。
 *
 * executor primitive **contract**（live executor が満たす・本 module は注入を呼ぶだけ）:
 *   - applyStatusTransition は **atomic・from=active guard**（UPDATE ... WHERE id=seedRef AND status=from・0 rows→ok=false）。live: plan_seed status update（未実装＝live GO）。
 *   - generateComplete / anchor write / external_anchor は executor で **呼ばない**（A1-6-5a）。並行 duplicate は from=active guard で fail-closed。
 *
 * 厳守:
 *   - **no-write・no-execution**: 実 DB write / status update / generateComplete 呼び / anchor RPC は **しない**（executor 注入のみ）。
 *   - **request は {handle, action} のみ**（A1-6-1 contract）。**response に seedRef/UUID/raw/source_ref を出さない**（RedactedActionResponse）。seedRef は executor へのみ（server-side）。
 *   - **fail-closed**: 非 active / unresolved / malformed → executor 呼ばず redacted fail response。
 *   - barrel 非 export・route.ts 非接続。
 */

import type { PlanSeedStatus } from "../../plan-seed";
import { planCandidateActionFromResolution, type CandidateOperationPlan } from "../candidate-action-orchestrator";
import {
  resolveAndDecideAction,
  redactResolutionForClient,
  type RedactedActionResponse,
  type SurfaceableCandidate,
} from "./candidate-action-handle";

/** executor primitive の結果（**成否のみ**・raw/seedRef を返さない）。 */
export interface ExecutorStepResult {
  /** step が成立したか（status: from=active で 1 row 更新）。 */
  readonly ok: boolean;
}

/**
 * candidate action の **DB primitive を注入**する executor（live=実 DB / test=fake）。**A1-6-5a で status-only**（applyPlanReflection は削除）。
 *   本 module（skeleton）は実装せず **呼ぶだけ**（no-write）。seedRef は **server-side のみ**（response には出ない）。
 */
export interface CandidateActionExecutor {
  /**
   * seed status 遷移（**atomic・from=active guard**）。ok=false=0 rows（並行 consume / duplicate submit）。
   *   live: UPDATE plan_seed SET status=to WHERE id=seedRef AND status=from（owner-RLS・未実装＝live GO）。
   *   accept→consumed / dismiss→rejected。**唯一の executor primitive**（reflection/anchor/generateComplete は呼ばない）。
   */
  applyStatusTransition(seedRef: string, from: PlanSeedStatus, to: PlanSeedStatus): Promise<ExecutorStepResult>;
}

/**
 * A1-6-4 / A1-6-5a: operation plan（A1-6-3・**status-only**）を **executor 注入で実行**（fail-stop・conflict 検出・redacted response）。
 *   - plan.accepted=false（非 active/unresolved・防御）→ executor 呼ばず fail-closed response。
 *   - plan.operations（**status_transition のみ**）を実行。ok=false → **status_conflict**（from=active guard・並行 consume / duplicate submit）。
 *   - 成功 → accepted=true・**reflectsToPlan は plan から伝播**（accept=true / dismiss・later=false）・deferred（later）。
 *   **response に seedRef を出さない**（seedRef は executor へのみ渡す）。reflection/anchor/generateComplete は executor で呼ばない（A1-6-5a）。
 */
export async function executeCandidateOperationPlan(
  plan: CandidateOperationPlan,
  seedRef: string,
  executor: CandidateActionExecutor
): Promise<RedactedActionResponse> {
  if (!plan.accepted) {
    return { accepted: false, reason: plan.reason, reflectsToPlan: false, deferred: plan.deferred };
  }
  for (const op of plan.operations) {
    // status_transition（A1-6-5a で唯一の op・from=active guard）
    const r = await executor.applyStatusTransition(seedRef, op.from, op.to);
    if (!r.ok) {
      return { accepted: false, reason: "status_conflict", reflectsToPlan: false, deferred: false };
    }
  }
  return { accepted: true, reason: plan.reason, reflectsToPlan: plan.reflectsToPlan, deferred: plan.deferred };
}

/**
 * A1-6-4: **route handler skeleton**（request → response・executor + surfaceable 注入・no-write）。
 *   request {handle, action}（untrusted）+ 現在 surfaceable（route が live で read・本 skeleton は注入）+ executor（注入）→ RedactedActionResponse。
 *   未解決（malformed / invalid / unresolved / non-active）→ executor 呼ばず redacted fail（fail-closed）。
 *   解決 → plan（A1-6-3）→ executeCandidateOperationPlan。**resolution.seedRef は executor へのみ**（response 非搬送）。
 *   live route（別 GO）が surfaceable の実 read + real executor + {ok,data} envelope を与える。
 */
export async function handleCandidateActionRequest(
  raw: unknown,
  surfaceable: readonly SurfaceableCandidate[],
  executor: CandidateActionExecutor
): Promise<RedactedActionResponse> {
  const resolution = resolveAndDecideAction(raw, surfaceable);
  if (!resolution.resolved) {
    return redactResolutionForClient(resolution); // fail-closed（executor 呼ばない）
  }
  const plan = planCandidateActionFromResolution(resolution);
  return executeCandidateOperationPlan(plan, resolution.seedRef, executor);
}
