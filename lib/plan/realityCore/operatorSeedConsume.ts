/**
 * operatorSeedConsume — RD3x-P1（2026-06-16）: duration_confirmations row を consume して **computed leaveBy 候補**を生む（pure・no-DB）
 *
 * 正本設計: docs/reality-operator-seed-activation-plan-rd3x-0.md（RD3x-P1）
 *
 * 思想（consume loop の closure・前提を疑った帰結）:
 *   RD3c で write/persist できた operator seed（duration_confirmations）が、**実際に computed leaveBy を生む**ことを示す。
 *   loop: confirmation row（durationValue 源）→ buildDurationValueFromConfirmation → {capability, durationValue}
 *     + **honest event-derived supply（arrival/buffer/origin）** → supplyAndResolveLeaveBy → computed leaveBy → candidate。
 *   durationValue は confirmation（real source）由来・arrival/buffer/origin は **event context（real・fake しない）**由来。
 *
 * 不変条件:
 *   - **scope mismatch / stale / revoked / malformed は null**（selectUsableDurationConfirmation が弾く・fail-closed）。
 *   - **provenance（learning/actor/environment）を value/leaveBy に流さない**（compute は basis のみ・governance は row に留まる）。
 *   - fake arrival/buffer/origin を作らない（caller が event から honest に供給）。missing なら supply incomplete → uncomputed。
 *   - leaveBy は internal-only（exact instant を consumer/surface に出さない）。DB read を行わない（rows は caller が供給）。
 */
import {
  selectUsableDurationConfirmation,
  buildDurationValueFromConfirmation,
  type DurationConfirmationRequestScopeV0,
} from "./durationConfirmationAdapter";
import type { DurationConfirmationRowV0 } from "./durationConfirmation";
import {
  supplyAndResolveLeaveBy,
  type LeaveBySupplyInputV0,
  type LeaveBySupplyScopeV0,
} from "./leaveBySupply";
import type { LeaveBySupplyCandidateV0 } from "./leaveByAssembly";

export const OPERATOR_SEED_CONSUME_VERSION = 0;

/** event 由来の honest supply 文脈（arrival/buffer/origin・**fake しない**・event/graph から caller が供給）。 */
export interface OperatorSeedSupplyContextV0 {
  readonly arrival: LeaveBySupplyInputV0["arrival"];
  readonly buffer: LeaveBySupplyInputV0["buffer"];
  readonly origin: LeaveBySupplyInputV0["origin"];
  /** canonical JST（event の evaluatedAt 相当）。 */
  readonly evaluatedAtIso: string;
}

/**
 * consumeDurationConfirmationForLeaveBy — rows から要求 scope の usable row を選び、computed leaveBy 候補を作る（pure・async）。
 *   usable 無し / durationValue null / supply incomplete / 非 computed は **null**（uncomputed・fail-closed）。
 *   返す candidate は `assembleLeaveByBindings` に渡せる（attach seam が再検証）。
 */
export async function consumeDurationConfirmationForLeaveBy(
  rows: ReadonlyArray<DurationConfirmationRowV0>,
  requestScope: DurationConfirmationRequestScopeV0,
  ctx: OperatorSeedSupplyContextV0,
  nowIso: string | null,
): Promise<LeaveBySupplyCandidateV0 | null> {
  // ① scope mismatch / stale / revoked / malformed を弾いて usable row を 1 つ選ぶ
  const row = selectUsableDurationConfirmation(rows, requestScope, nowIso);
  if (row === null) return null;

  // ② confirmation → {capability, durationValue}（二鍵照合・provenance は value に流れない）
  const dv = await buildDurationValueFromConfirmation(row);
  if (dv === null) return null;

  // ③ durationValue + honest event supply（arrival/buffer/origin）→ supplyAndResolveLeaveBy
  const scope: LeaveBySupplyScopeV0 = {
    targetNodeId: row.scope.targetNodeId,
    subjectiveDate: row.scope.subjectiveDate,
    transportMode: row.scope.transportMode,
    temporalScopeRef: row.scope.temporalScopeRef,
  };
  const { leaveBy } = supplyAndResolveLeaveBy({
    subjectNodeId: row.scope.targetNodeId, // candidate.eventRealityNodeId = leaveBy.subjectNodeId
    capability: dv.capability,
    durationValue: dv.durationValue,
    evaluatedAt: ctx.evaluatedAtIso,
    computedAt: ctx.evaluatedAtIso,
    scope,
    arrival: ctx.arrival,
    buffer: ctx.buffer,
    origin: ctx.origin, // null（chain 起点）なら origin unavailable → supply incomplete → uncomputed
  });

  // ④ complete bundle 時のみ computed（missing は uncomputed）
  if (leaveBy.status !== "computed") return null;
  return { eventRealityNodeId: row.scope.targetNodeId, leaveBy, computedScope: scope };
}
