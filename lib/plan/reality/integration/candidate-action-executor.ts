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
 *   実行 semantics（accept = [plan_reflection, status_transition] の順）:
 *     1. applyPlanReflection（anchor 生成）→ ok=false（not_completable / write_failed）→ **停止**（reflection_failed・seed は active のまま retryable）。
 *     2. applyStatusTransition（active→consumed・**from=active guard**）→ ok=false（0 rows = 並行 consume / duplicate submit）→ **停止**（status_conflict）。
 *   dismiss = [status_transition(active→rejected)] のみ。later = []（executor 呼ばない・deferred）。非 active/unresolved = fail-closed（executor 呼ばない）。
 *
 * executor primitive **contract**（live executor が満たす・本 module は注入を呼ぶだけ）:
 *   - applyPlanReflection は **seedRef で冪等**（duplicate submit でも重複 anchor を作らない）。live: generateComplete(seed)→draft→create_external_anchor_bundle(p_user_id, p_source, p_anchors)。
 *   - applyStatusTransition は **atomic・from=active guard**（UPDATE ... WHERE id=seedRef AND status=from・0 rows→ok=false）。live: plan_seed status update（未実装＝live GO）。
 *   - 真の atomicity（重複 anchor / consume-without-anchor の完全排除）は live executor の transaction / 冪等 RPC で担保。本 skeleton は **順序 + fail-stop + conflict 検出 + redaction** を固める。
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
  /** step が成立したか（reflection: anchor 生成成功 / status: from=active で 1 row 更新）。 */
  readonly ok: boolean;
}

/**
 * candidate action の **DB primitive を注入**する executor（live=実 DB / test=fake）。
 *   本 module（skeleton）は実装せず **呼ぶだけ**（no-write）。seedRef は **server-side のみ**（response には出ない）。
 */
export interface CandidateActionExecutor {
  /**
   * plan 反映（external_anchor 生成）。**seedRef で冪等**（duplicate→重複 anchor を作らない）。
   *   live: generateComplete(seed)→draft→create_external_anchor_bundle。ok=false=not_completable / write_failed。
   */
  applyPlanReflection(seedRef: string): Promise<ExecutorStepResult>;
  /**
   * seed status 遷移（**atomic・from=active guard**）。ok=false=0 rows（並行 consume / duplicate submit）。
   *   live: UPDATE plan_seed SET status=to WHERE id=seedRef AND status=from（owner-RLS・未実装＝live GO）。
   */
  applyStatusTransition(seedRef: string, from: PlanSeedStatus, to: PlanSeedStatus): Promise<ExecutorStepResult>;
}

/**
 * A1-6-4: operation plan（A1-6-3）を **executor 注入で実行**（順序・fail-stop・conflict 検出・redacted response）。
 *   - plan.accepted=false（非 active/unresolved・防御）→ executor 呼ばず fail-closed response。
 *   - plan.operations を **順に実行**（accept は reflection→status）。各 step ok=false → **停止**（後続 op を実行しない）。
 *     reflection 失敗→reflection_failed（status しない）。status 失敗→status_conflict（from=active guard）。
 *   - 全 step 成功 → accepted=true・reflectsToPlan（reflection を実行したか）・deferred（later）。
 *   **response に seedRef を出さない**（seedRef は executor へのみ渡す）。
 */
export async function executeCandidateOperationPlan(
  plan: CandidateOperationPlan,
  seedRef: string,
  executor: CandidateActionExecutor
): Promise<RedactedActionResponse> {
  if (!plan.accepted) {
    return { accepted: false, reason: plan.reason, reflectsToPlan: false, deferred: plan.deferred };
  }
  let reflectsToPlan = false;
  for (const op of plan.operations) {
    if (op.kind === "plan_reflection") {
      const r = await executor.applyPlanReflection(seedRef);
      if (!r.ok) {
        return { accepted: false, reason: "reflection_failed", reflectsToPlan: false, deferred: false };
      }
      reflectsToPlan = true;
    } else {
      // status_transition（op は StatusTransitionOperation に narrow・from=active guard）
      const r = await executor.applyStatusTransition(seedRef, op.from, op.to);
      if (!r.ok) {
        return { accepted: false, reason: "status_conflict", reflectsToPlan, deferred: false };
      }
    }
  }
  return { accepted: true, reason: plan.reason, reflectsToPlan, deferred: plan.deferred };
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
