/**
 * Reality Control OS — A1-6-0 Candidate → Plan Action（**pure・no-DB・no-write**・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.0
 *
 * 役割: surfaced candidate（A1-5 capture surface 由来）への **ユーザー操作（accept / dismiss / later）** を、
 *   **seed lifecycle status 遷移 + plan 反映意図** に写す pure decision。captureCandidate を「表示するだけ」から
 *   「予定に反映できる候補」へ進める action flow の **foundation**（実 status update / 実 plan 反映 / route は別 slice の live path）。
 *
 * status 意味（plan-seed.ts PlanSeedStatus と一致）:
 *   active=配置候補 / consumed=DraftPlan に組み込まれた（accept）/ rejected=ユーザー棄却（dismiss）/ expired=TTL 失効（user action でない）。
 *
 * 厳守:
 *   - **pure・deterministic**: DB / Supabase / network / route / UI / Date.now なし。barrel 非 export。
 *   - **idempotency**: active な candidate にのみ作用。非 active（consumed/rejected/expired）→ invalid・no-op（二重 accept / 既 reject への action を弾く）。
 *   - **raw を持ち込まない**: 入出力は action(enum) + status(enum) + boolean のみ（seedRef/raw/source_ref を持たない）。
 *   - 実反映（accept→generateComplete→external_anchor write）/ 実 status update / 候補 handle 解決 は **別 slice（live path）**。本 module は決定のみ。
 */

import type { PlanSeedStatus } from "../plan-seed";

/** surfaced candidate にユーザーが取れる操作。 */
export type CandidateActionKind = "accept" | "dismiss" | "later";

/** 有効な action 集合（runtime validation 用）。 */
export const CANDIDATE_ACTION_KINDS: readonly CandidateActionKind[] = ["accept", "dismiss", "later"];

/** action の理由コード（**redacted・raw なし**）。 */
export type CandidateActionReason = "ok" | "not_active" | "unknown_action";

/** action 決定の結果（pure・status 遷移 + plan 反映意図・raw なし）。 */
export interface CandidateActionOutcome {
  /** active な candidate への有効 action か（idempotency: 非 active は false）。 */
  readonly valid: boolean;
  /** 理由コード（redacted）。 */
  readonly reason: CandidateActionReason;
  /** 遷移後 seed status（**null = 変更なし**＝later の deferred）。実 update は別 slice。 */
  readonly nextStatus: PlanSeedStatus | null;
  /** plan へ反映するか（accept のみ true・実反映は別 slice の live path）。 */
  readonly reflectsToPlan: boolean;
  /** later（deferred・seed は active のまま・再 surface 対象）か。 */
  readonly deferred: boolean;
}

/** 無効 outcome（no-op・raw なし）。 */
function invalidOutcome(reason: CandidateActionReason): CandidateActionOutcome {
  return { valid: false, reason, nextStatus: null, reflectsToPlan: false, deferred: false };
}

/** candidate（seed）が action 可能な状態か（active のみ）。 */
export function isActionableStatus(status: PlanSeedStatus): boolean {
  return status === "active";
}

/** action が有効な enum か（runtime malformed 防御）。 */
export function isValidActionKind(action: string): action is CandidateActionKind {
  return (CANDIDATE_ACTION_KINDS as readonly string[]).includes(action);
}

/**
 * A1-6-0: surfaced candidate への action → **seed status 遷移 + plan 反映意図**（pure・no-DB）。
 *   - 非 active な candidate（consumed/rejected/expired）→ **invalid・no-op**（idempotency・二重操作防止）。
 *   - accept → consumed（plan へ反映＝reflectsToPlan）/ dismiss → rejected / later → 変更なし（active のまま・deferred＝再 surface）。
 *   - 未知 action（runtime malformed）→ invalid・unknown_action（fail-closed）。
 *   実 status update / 実 plan 反映（generateComplete→external_anchor write）は別 slice の live path（本 module は決定のみ）。
 */
export function decideCandidateAction(
  action: CandidateActionKind,
  currentStatus: PlanSeedStatus
): CandidateActionOutcome {
  if (!isActionableStatus(currentStatus)) return invalidOutcome("not_active"); // idempotency: active のみ作用
  switch (action) {
    case "accept":
      return { valid: true, reason: "ok", nextStatus: "consumed", reflectsToPlan: true, deferred: false };
    case "dismiss":
      return { valid: true, reason: "ok", nextStatus: "rejected", reflectsToPlan: false, deferred: false };
    case "later":
      return { valid: true, reason: "ok", nextStatus: null, reflectsToPlan: false, deferred: true };
    default:
      return invalidOutcome("unknown_action"); // runtime malformed action（型上は到達不能・防御）
  }
}
