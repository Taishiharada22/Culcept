/**
 * movementLeaveByReconcile — RD2f-mv（2026-06-15）: MovementReality.leaveByKnown の **唯一 writer**（pure・未配線）
 *   + cross-node coherence 検査。
 *
 * 正本設計: docs/reality-leaveby-semantics-rd2f-sem-0.md（§1/§2）
 *
 * 思想（derived-only / coherence / ladder）:
 *   - leaveByKnown=true は **`reconcileMovementLeaveByKnown` 経由のみ**（hand-set 禁止・direct true は movementRealityViolations が弾く）。
 *   - true 条件 = `deriveMovementLeaveByKnown`（capability 二鍵 + computed status/violations/planning-grade source/fresh buffer/
 *     computed-grade origin）∧ **ladder（恒久版・RD3d-P1）= `mv.etaKnown.value===true` のみ**。
 *   - **RD3d-P1 で ladder を恒久版へ trim**: `leaveByKnown ⟹ etaKnown ∧ routeKnown`（v0 安全ラダー）→ **`leaveByKnown ⟹ etaKnown`**。
 *     etaKnown = arrival projection / time basis known（capability.arrivalProjectionKnown 相当）。routeKnown = route shape known。
 *     出発時刻計算には time basis が必須だが route shape は不要ゆえ routeKnown を ladder から外す（user_confirmed/scheduled は
 *     routeShape なしで成立し得る — RD2d で routeShape と duration を直列にしない方針）。
 *   - 本 slice では etaKnown は依然 false 固定（movementReality 206・real route/ETA 供給なし）ゆえ **leaveByKnown=true は v0 で
 *     事実上不成立 = inert**。本 helper は **未配線**（pipeline に挟まない）で machinery を確立するのみ。
 *
 * 不変条件:
 *   - leaveByKnown 以外の mv 属性（routeKnown/etaKnown/mobilityStatus/missingInputs/sourceRefs/…）を**一切変更しない**。
 *   - leaveByKnown の displayPolicy は internal-only（exact instant を evidenceRefs に入れない・ref id のみ）。
 */
import type { MovementRealityV0 } from "./movementReality";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { RouteEtaCapabilityV0 } from "./routeEtaCapability";
import type { LeaveByComputationV0 } from "./leaveByComputation";
import { deriveMovementLeaveByKnown } from "./leaveByGraphBinding";
import { inferredAttribute } from "./realityAttribute";

export const MOVEMENT_LEAVE_BY_RECONCILE_VERSION = 0;

/** derived leaveByKnown=true の confidence（保守的・internal・固定） */
const LEAVE_BY_KNOWN_DERIVED_CONFIDENCE = 0.8;

export type MovementLeaveByKnownCoherenceViolation =
  | "leaveByKnown_ladder_broken"
  | "leaveByKnown_display_not_internal"
  | "leaveByKnown_without_computed"
  | "leaveByKnown_computed_not_computed"
  | "leaveByKnown_subject_mismatch";

/**
 * arrivalErnIdForMovement — mv の arrival ern id（`ern:${date}:${toAnchorId}`）。
 * compileEventRealityNodes:191 の id format（`ern:${date}:${node.anchorId}`）に合わせる。
 */
export function arrivalErnIdForMovement(mv: MovementRealityV0): string {
  return `ern:${mv.date}:${mv.sourceRefs.toAnchorId}`;
}

/**
 * reconcileMovementLeaveByKnown — leaveByKnown の唯一 writer（pure・未配線）。
 * attach 済 computed + capability から derived-and-bound + ladder（恒久版・leaveByKnown ⟹ etaKnown）で leaveByKnown を再導出。
 * derive 不成立なら mv を**不変で返す**（leaveByKnown=false 維持）。leaveByKnown 以外は決して変更しない。
 */
export function reconcileMovementLeaveByKnown(
  mv: MovementRealityV0,
  attachedComputed: LeaveByComputationV0 | undefined,
  capability: RouteEtaCapabilityV0 | undefined,
): MovementRealityV0 {
  if (capability === undefined || attachedComputed === undefined) return mv;
  // RD3d-P1 ladder（恒久版）: leaveByKnown ⟹ etaKnown のみ。route shape（routeKnown）は出発時刻計算に不要ゆえ ladder から外す。
  if (mv.etaKnown.value !== true) return mv;
  if (!deriveMovementLeaveByKnown(capability, attachedComputed)) return mv;
  // evidenceRefs は ref id のみ（exact instant / timeContract を入れない）
  const refs = [attachedComputed.sourceTimeEstimateRef, attachedComputed.bufferRef].filter(
    (r): r is string => r !== null && r.length > 0,
  );
  const leaveByKnown = inferredAttribute(
    true,
    LEAVE_BY_KNOWN_DERIVED_CONFIDENCE,
    refs.length > 0 ? refs : ["leave_by_computed_derived"],
    { source: "derived", displayPolicy: "debugOnly" },
  );
  return { ...mv, leaveByKnown };
}

/**
 * movementLeaveByKnownCoherenceViolations — cross-node coherence 検査（pure・未配線・空 = 適合）。
 * leaveByKnown=true の mv は、対応 arrival ern が computed leaveBy（status==='computed'・subjectNodeId 一致）を持たねばならない。
 * hand-set / orphan binding（computed 不在のまま true）を検出する防御。
 */
export function movementLeaveByKnownCoherenceViolations(input: {
  readonly movementRealityNodes: ReadonlyArray<MovementRealityV0>;
  readonly eventRealityNodes: ReadonlyArray<EventRealityNodeV0>;
}): string[] {
  const out: string[] = [];
  const ernById = new Map(input.eventRealityNodes.map((e) => [e.eventRealityNodeId, e]));
  for (const mv of input.movementRealityNodes) {
    if (mv.leaveByKnown.value !== true) continue;
    // RD3d-P1 ladder（恒久版）: leaveByKnown ⟹ etaKnown のみ（routeKnown は ladder に含めない）。
    if (mv.etaKnown.value !== true) {
      out.push(`${mv.movementRealityId}: leaveByKnown_ladder_broken`);
    }
    if (mv.leaveByKnown.displayPolicy === "visible") {
      out.push(`${mv.movementRealityId}: leaveByKnown_display_not_internal`);
    }
    const arrivalErn = ernById.get(arrivalErnIdForMovement(mv));
    const c = arrivalErn?.leaveByComputed;
    if (arrivalErn === undefined || c === undefined) {
      out.push(`${mv.movementRealityId}: leaveByKnown_without_computed`);
      continue;
    }
    if (c.status !== "computed") {
      out.push(`${mv.movementRealityId}: leaveByKnown_computed_not_computed`);
    }
    if (c.subjectNodeId !== arrivalErn.eventRealityNodeId) {
      out.push(`${mv.movementRealityId}: leaveByKnown_subject_mismatch`);
    }
  }
  return out;
}
