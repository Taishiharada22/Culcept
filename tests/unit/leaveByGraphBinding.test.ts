/**
 * leaveByGraphBinding（RD2f-bind: internal leaveBy を ERN に保持）— CEO 必須 22 cases
 * 正本: docs/reality-leaveby-movement-connection-rd2f-0.md
 *
 * 核: attach 前に再検証(status/violations/displayPolicy/refs/origin/leak/scope)・既存 ern.leaveBy 不変・
 *   leaveByKnown derived-only・MovementReality/feasibility/risk 非接続・internal-only。
 */
import {
  attachComputedLeaveBy,
  deriveMovementLeaveByKnown,
  leaveByGraphBindingViolations,
  type LeaveByGraphBindingInputV0,
} from "@/lib/plan/realityCore/leaveByGraphBinding";
import { supplyAndResolveLeaveBy, type LeaveBySupplyInputV0, type LeaveBySupplyScopeV0 } from "@/lib/plan/realityCore/leaveBySupply";
import {
  resolveRouteEtaCapability,
  type RouteEtaAdapterInputV0,
  type RouteEtaProvider,
  type RouteEtaProviderResultV0,
} from "@/lib/plan/realityCore/routeEtaProviderAdapter";
import type { RouteEtaCapabilityV0 } from "@/lib/plan/realityCore/routeEtaCapability";
import type { PlanningGradeDurationValueV0 } from "@/lib/plan/realityCore/routeEtaDurationValue";
import type { LeaveByComputationV0 } from "@/lib/plan/realityCore/leaveByComputation";
import type { EventRealityNodeV0 } from "@/lib/plan/realityCore/eventRealityNode";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── computed leaveBy を supply 経由で得る ─────────────────────────────────────────────────────
function routeInput(): RouteEtaAdapterInputV0 {
  return {
    originRef: { opaqueRef: "o1" }, destinationRef: { opaqueRef: "d1" }, targetNodeId: "ern-1",
    subjectiveDate: "2026-06-12", transportMode: "car", temporalScopeRef: "t1", routeOptionsRef: null, routeInputRevision: "r1",
    temporal: { departureTimeScoped: true, arrivalTargetScoped: true, timeBandScoped: true, evaluatedAtKnown: true, temporalFreshnessEvaluated: true },
    originUsableForLeaveBy: true, bufferKnown: true,
    originConflict: { originConflictStatus: "none", originDiscrepancyRefs: [], userConfirmedOriginPresent: false, currentObservationOverrodeConfirmed: false },
    pairPrivacyParts: { originEndpointSensitive: false, destinationEndpointSensitive: false, currentObservationInvolved: false, homeWorkDerivedInvolved: false },
    subjectNodeId: "ern-1",
  };
}
const providerResult = (): RouteEtaProviderResultV0 => ({
  status: "ok", providerKind: "external_route", providerVersion: "v1", durationBasis: "external_route",
  durationSignalPresent: true, durationScopeBounded: true, routeShapePresent: true, routeOptionPresent: false,
  conditionModelStatus: "traffic_aware", opaqueRouteRef: "opaque-route-1", freshnessStatus: "fresh", freshnessBasisRef: "fb1",
  durationMinutesRaw: 23, durationLowerMinutesRaw: null,
});
const provider = (r: RouteEtaProviderResultV0): RouteEtaProvider => async () => r;
const SCOPE: LeaveBySupplyScopeV0 = { targetNodeId: "ern-1", subjectiveDate: "2026-06-12", transportMode: "car", temporalScopeRef: "t1" };

let CAP: RouteEtaCapabilityV0;
let COMPUTED: LeaveByComputationV0;
function supplyInput(CAPv: RouteEtaCapabilityV0, DVv: PlanningGradeDurationValueV0, over: Partial<LeaveBySupplyInputV0> = {}): LeaveBySupplyInputV0 {
  return {
    subjectNodeId: "ern-1", capability: CAPv, durationValue: DVv,
    evaluatedAt: "2026-06-12T08:00:00+09:00", computedAt: "2026-06-12T08:00:00+09:00", scope: SCOPE,
    arrival: { arrivalTargetInstant: "2026-06-12T10:00:00+09:00", arrivalTargetRef: "arr-1", targetEventDate: "2026-06-12", startTimeSource: "user_explicit", sourceRefs: ["src-a"], evidenceRefs: ["ev-a"] },
    buffer: { bufferPolicyId: "buf-1", bufferScopeRef: "bscope-1", rigidity: "hard", highCommitment: false, freshness: "valid", sourceRefs: ["src-b"], evidenceRefs: ["ev-b"] },
    origin: { originInferenceStage: "previous_event_end", dayGraphDate: "2026-06-12", dayGraphSnapshotId: "snap-1",
      previousEvent: { nodeId: "prev", endTimeHHMM: "09:00", durationSource: "explicit", boundaryClipped: false, locationText: "office", sensitive: false, startTimeSource: "user_explicit", anchorRef: "anchor-prev" } },
    ...over,
  };
}
beforeAll(async () => {
  const o = await resolveRouteEtaCapability(routeInput(), { provider: provider(providerResult()) });
  CAP = o.capability as RouteEtaCapabilityV0;
  const DV = o.durationValue as PlanningGradeDurationValueV0;
  COMPUTED = supplyAndResolveLeaveBy(supplyInput(CAP, DV)).leaveBy;
});

const ERN = { subjectiveDate: "2026-06-12", leaveBy: { value: null, whyUnresolved: ["eta_source_missing"] } } as unknown as EventRealityNodeV0;
function bindInput(over: Partial<LeaveByGraphBindingInputV0> = {}, computedOver: Partial<LeaveByComputationV0> = {}): LeaveByGraphBindingInputV0 {
  return { ern: ERN, computed: { ...COMPUTED, ...computedOver }, computedScope: SCOPE, ernScope: SCOPE, ...over };
}

// ── #1/#2 attach 基本 ─────────────────────────────────────────────────────────────────────────
describe("RD2f-bind #1/#2 attach 基本", () => {
  it("#1 computed → ern.leaveByComputed に attach", () => {
    expect(COMPUTED.status).toBe("computed");
    const inp = bindInput();
    const r = attachComputedLeaveBy(inp);
    expect(r.attached).toBe(true);
    expect(r.ern.leaveByComputed).toBe(inp.computed); // 渡した computed をそのまま保持
    expect(r.ern.leaveByComputed).toEqual(COMPUTED);
  });
  it("#2 既存 ern.leaveBy は変更されない（別 field）", () => {
    const r = attachComputedLeaveBy(bindInput());
    expect(r.ern.leaveBy).toBe(ERN.leaveBy); // 同一参照・不変
  });
});

// ── #3-#9 attach 前再検証 ─────────────────────────────────────────────────────────────────────
describe("RD2f-bind #3-#9 再検証で attach 拒否", () => {
  it("#3 uncomputed → attach されない", () => {
    const r = attachComputedLeaveBy(bindInput({}, { status: "uncomputed" }));
    expect(r.attached).toBe(false);
    expect(r.ern.leaveByComputed).toBeUndefined();
    expect(r.violations).toContain("not_computed");
  });
  it("#4 violation あり → attach されない", () => {
    const r = attachComputedLeaveBy(bindInput({}, { leaveByInstant: { instant: "not-canonical", timezone: "JST" } }));
    expect(r.attached).toBe(false);
    expect(r.violations).toContain("computation_violations");
  });
  it("#5 displayPolicy visible → attach されない", () => {
    const r = attachComputedLeaveBy(bindInput({}, { displayPolicy: "visible" as unknown as LeaveByComputationV0["displayPolicy"] }));
    expect(r.violations).toContain("display_policy_not_internal");
  });
  it("#6 sourceTimeEstimateRef 欠落 → attach されない", () => {
    expect(attachComputedLeaveBy(bindInput({}, { sourceTimeEstimateRef: "" })).violations).toContain("source_time_estimate_ref_missing");
  });
  it("#7 bufferRef 欠落 → attach されない", () => {
    expect(attachComputedLeaveBy(bindInput({}, { bufferRef: "" })).violations).toContain("buffer_ref_missing");
  });
  it("#8 origin evidence 欠落 → attach されない", () => {
    expect(attachComputedLeaveBy(bindInput({}, { originEvidencePresent: false })).violations).toContain("origin_evidence_missing");
  });
  it("#9 raw location / route token 混入 → attach されない", () => {
    const r = attachComputedLeaveBy(bindInput({}, { sourceTimeEstimateRef: "35.6895,139.7006" }));
    expect(r.violations).toContain("raw_location_leak");
    expect(r.attached).toBe(false);
  });
});

// ── #10-#13 scope mismatch ───────────────────────────────────────────────────────────────────
describe("RD2f-bind #10-#13 scope mismatch → attach されない", () => {
  it("#10 targetNodeId mismatch", () => {
    expect(attachComputedLeaveBy(bindInput({ ernScope: { ...SCOPE, targetNodeId: "other" } })).violations).toContain("scope_target_node_mismatch");
  });
  it("#11 subjectiveDate mismatch", () => {
    expect(attachComputedLeaveBy(bindInput({ ernScope: { ...SCOPE, subjectiveDate: "2026-06-13" } })).violations).toContain("scope_subjective_date_mismatch");
  });
  it("#12 transportMode mismatch", () => {
    expect(attachComputedLeaveBy(bindInput({ ernScope: { ...SCOPE, transportMode: "walk" } })).violations).toContain("scope_transport_mode_mismatch");
  });
  it("#13 temporalScopeRef mismatch", () => {
    expect(attachComputedLeaveBy(bindInput({ ernScope: { ...SCOPE, temporalScopeRef: "t-other" } })).violations).toContain("scope_temporal_scope_ref_mismatch");
  });
});

// ── #14-#16 leaveByKnown derived-only ────────────────────────────────────────────────────────
describe("RD2f-bind #14-#16 leaveByKnown derived-only", () => {
  it("#14 valid attach 時のみ leaveByKnown true 候補", () => {
    const r = attachComputedLeaveBy(bindInput());
    expect(deriveMovementLeaveByKnown(CAP, r.ern.leaveByComputed)).toBe(true);
  });
  it("#15 leaveByComputable だけでは true にならない（attach なし → false）", () => {
    expect(deriveMovementLeaveByKnown(CAP, undefined)).toBe(false);
  });
  it("#16 heuristic/非 planning-grade source → true にならない", () => {
    const heuristic = { ...COMPUTED, source: "none" as unknown as LeaveByComputationV0["source"] };
    expect(deriveMovementLeaveByKnown(CAP, heuristic)).toBe(false);
  });
});

// ── #17-#20 非接続 / internal-only（source-scan） ────────────────────────────────────────────
describe("RD2f-bind #17-#20 非接続 / internal-only", () => {
  const code = readFileSync(join(process.cwd(), "lib/plan/realityCore/leaveByGraphBinding.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  it("#17 routeKnown/etaKnown/mobilityStatus を変更しない", () => {
    for (const bad of ["routeKnown", "etaKnown", "mobilityStatus", "compileMovementReality", "movementRealityViolations"]) expect(code.includes(bad)).toBe(false);
  });
  it("#18 missingInputRefs を直接消さない", () => {
    expect(code.includes("missingInputRefs")).toBe(false);
    expect(code.includes("missingInputs")).toBe(false);
  });
  it("#19 Feasibility / CollapseRisk / Intervention / Permission に接続しない", () => {
    for (const bad of ["feasibility", "Feasibility", "collapseRisk", "CollapseRisk", "intervention", "Intervention", "permissionLevel", "proposal"]) expect(code.includes(bad)).toBe(false);
  });
  it("#20 consumer payload / surface / copy / notification / departure line なし", () => {
    for (const bad of ["surface", "Surface", "copy", "notification", "departureLine", "departure_line", "currentLocation", "geolocation", "new Date(", "Date.now", "Math.random", ".insert(", "localStorage"]) expect(code.includes(bad)).toBe(false);
  });
});
