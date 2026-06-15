/**
 * leaveByGraphBinding — RD2f-bind（2026-06-15）: internal LeaveByComputationV0 を EventRealityNode に安全に保持する唯一の seam（pure）
 *
 * 設計書: docs/reality-leaveby-movement-connection-rd2f-0.md
 *
 * 思想: RD2e-b の `LeaveByComputationV0` を RealityGraph 内に**安全に保持**するだけ。表示・提案・通知・feasibility 判定には使わない。
 *   `attachComputedLeaveBy` が唯一の入口で、attach 前に必ず再検証（status/violations/displayPolicy/refs/origin/leak/scope）。
 *   不成立なら attach しない（ern.leaveByComputed 未設定 = uncomputed 扱い・fail-closed）。
 *
 * 不変条件:
 *   - 既存 `ern.leaveBy`（RealityAttribute<string>・display 寄り）は触らない。computed object は別 field `ern.leaveByComputed`。
 *   - leaveByComputed は internal-only（consumer/surface/copy/notification/departure line/preview exact instant に出さない）。
 *   - `leaveByKnown` は **derived-and-bound**（hand-set 禁止・leaveByComputable 単独 / durationSignalPresent / arrivalProjectionKnown / heuristic では true にしない）。
 *   - MovementReality / routeKnown / etaKnown / mobilityStatus / missingInputRefs / feasibility / risk / permission は**変更しない**（本 slice は保持のみ）。
 */

import {
  leaveByComputationViolations,
  type LeaveByComputationV0,
  type LeaveByComputationSource,
  type LeaveByOriginKind,
} from "./leaveByComputation";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { RouteEtaCapabilityV0 } from "./routeEtaCapability";
import type { LeaveBySupplyScopeV0 } from "./leaveBySupply";
import { containsRawLocation } from "./routeEtaSafety";

export const LEAVEBY_GRAPH_BINDING_VERSION = 0;

export type LeaveByGraphBindingViolation =
  | "not_computed"
  | "computation_violations"
  | "display_policy_not_internal"
  | "source_time_estimate_ref_missing"
  | "buffer_ref_missing"
  | "origin_evidence_missing"
  | "raw_location_leak"
  | "scope_target_node_mismatch"
  | "scope_subjective_date_mismatch"
  | "scope_transport_mode_mismatch"
  | "scope_temporal_scope_ref_mismatch"
  | "scope_ern_subjective_date_mismatch";

export interface LeaveByGraphBindingInputV0 {
  readonly ern: EventRealityNodeV0;
  readonly computed: LeaveByComputationV0;
  /** leaveBy が計算された scope（supply bundle 由来） */
  readonly computedScope: LeaveBySupplyScopeV0;
  /** この ERN の movement に期待される scope（caller 供給） */
  readonly ernScope: LeaveBySupplyScopeV0;
}

export interface LeaveByGraphBindingTrace {
  readonly attached: boolean;
  readonly displayPolicy: string;
  readonly violations: ReadonlyArray<LeaveByGraphBindingViolation>;
}

export interface LeaveByGraphBindingResultV0 {
  /** attach 成功なら leaveByComputed 付き ERN・失敗なら原 ERN（不変） */
  readonly ern: EventRealityNodeV0;
  readonly attached: boolean;
  readonly violations: ReadonlyArray<LeaveByGraphBindingViolation>;
  readonly trace: LeaveByGraphBindingTrace;
}

const INTERNAL_DISPLAY_POLICIES: ReadonlyArray<string> = ["internalReference", "debugOnly", "hidden", "notActionable"];
const PLANNING_GRADE_SOURCES: ReadonlyArray<LeaveByComputationSource> = ["external_route", "scheduled", "user_confirmed", "cached_route"];
const COMPUTED_ORIGIN_KINDS: ReadonlyArray<LeaveByOriginKind> = ["user_confirmed", "previous_event_end", "home_assumed", "work_assumed"];

/** attach 前の再検証（空 = attach 可・raw を echo しない） */
export function leaveByGraphBindingViolations(input: LeaveByGraphBindingInputV0): LeaveByGraphBindingViolation[] {
  let out: LeaveByGraphBindingViolation[] = [];
  const add = (cond: boolean, v: LeaveByGraphBindingViolation): void => {
    out = cond ? out.concat([v]) : out;
  };
  const c = input.computed;

  add(c.status !== "computed", "not_computed");
  add(leaveByComputationViolations(c).length > 0, "computation_violations");
  add(INTERNAL_DISPLAY_POLICIES.indexOf(String(c.displayPolicy)) < 0, "display_policy_not_internal");
  add(c.sourceTimeEstimateRef === null || c.sourceTimeEstimateRef.length === 0, "source_time_estimate_ref_missing");
  add(c.bufferRef === null || c.bufferRef.length === 0, "buffer_ref_missing");
  add(!c.originEvidencePresent || COMPUTED_ORIGIN_KINDS.indexOf(c.originUsabilityKind) < 0, "origin_evidence_missing");
  add(containsRawLocation(JSON.stringify(c).toLowerCase()), "raw_location_leak");

  // scope 整合（computed が計算された scope ≡ ERN に期待される scope ≡ 実 ERN）
  const cs = input.computedScope;
  const es = input.ernScope;
  add(cs.targetNodeId !== es.targetNodeId || c.subjectNodeId !== cs.targetNodeId, "scope_target_node_mismatch");
  add(
    cs.subjectiveDate !== es.subjectiveDate ||
      (c.timeContract !== null && c.timeContract.subjectiveDate !== cs.subjectiveDate),
    "scope_subjective_date_mismatch",
  );
  add(cs.transportMode !== es.transportMode, "scope_transport_mode_mismatch");
  add(cs.temporalScopeRef !== es.temporalScopeRef, "scope_temporal_scope_ref_mismatch");
  add(es.subjectiveDate !== input.ern.subjectiveDate, "scope_ern_subjective_date_mismatch");
  return out;
}

/**
 * attachComputedLeaveBy — 唯一の attach seam。再検証を通った時のみ `ern.leaveByComputed` を設定。
 * 既存 `ern.leaveBy`（display string）は変更しない。失敗時は原 ERN を不変で返す（fail-closed）。
 */
export function attachComputedLeaveBy(input: LeaveByGraphBindingInputV0): LeaveByGraphBindingResultV0 {
  const violations = leaveByGraphBindingViolations(input);
  const attached = violations.length === 0;
  const ern = attached ? { ...input.ern, leaveByComputed: input.computed } : input.ern;
  return {
    ern,
    attached,
    violations,
    trace: { attached, displayPolicy: String(input.computed.displayPolicy), violations },
  };
}

/**
 * deriveMovementLeaveByKnown — MovementReality.leaveByKnown の **derived-and-bound** 真偽値（pure helper）。
 * **hand-set しない**: attach 済 computed が存在し、capability が planning-grade で、computation が健全で、
 * planning-grade source（heuristic 不可）かつ buffer fresh かつ origin computed-grade の時のみ true。
 * **leaveByComputable 単独 / durationSignalPresent / arrivalProjectionKnown だけでは true にしない。**
 * 本 helper は値を返すだけ（MovementReality を mutate しない・接続は RD2f-assembly）。
 */
export function deriveMovementLeaveByKnown(
  capability: RouteEtaCapabilityV0,
  attachedComputed: LeaveByComputationV0 | undefined,
): boolean {
  if (attachedComputed === undefined) return false;
  return (
    capability.leaveBy.leaveByComputable === true &&
    capability.planning.timeEstimateUsableForPlanning === true &&
    attachedComputed.status === "computed" &&
    leaveByComputationViolations(attachedComputed).length === 0 &&
    PLANNING_GRADE_SOURCES.indexOf(attachedComputed.source) >= 0 && // heuristic/none は不可
    attachedComputed.buffer !== null &&
    attachedComputed.buffer.staleness === "fresh" &&
    attachedComputed.originEvidencePresent &&
    COMPUTED_ORIGIN_KINDS.indexOf(attachedComputed.originUsabilityKind) >= 0
  );
}
