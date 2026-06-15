/**
 * leaveByAssembly（RD2f-assembly: leaveBy enrichment pass）— CEO 必須 20 cases
 * 正本: docs/reality-leaveby-assembly-injection-rd2f-assembly-0.md
 *
 * 核: ern[] 駆動・id 等価 attach・cardinality/orphan/no-op/staleness・bundle discard・MovementReality/feasibility 非接続。
 */
import {
  assembleLeaveByBindings,
  buildLeaveBySupplyMap,
  type LeaveBySupplyCandidateV0,
  type LeaveByAssemblyInputV0,
} from "@/lib/plan/realityCore/leaveByAssembly";
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

const SCOPE: LeaveBySupplyScopeV0 = { targetNodeId: "ern-1", subjectiveDate: "2026-06-12", transportMode: "car", temporalScopeRef: "t1" };
const FRESH = { nowInstant: "2026-06-12T08:05:00+09:00", timezone: "Asia/Tokyo", wallClockHHMM: "08:05", calendarDate: "2026-06-12", subjectiveDate: "2026-06-12", minuteOfSubjectiveDay: 185 };

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
function supplyInput(CAP: RouteEtaCapabilityV0, DV: PlanningGradeDurationValueV0): LeaveBySupplyInputV0 {
  return {
    subjectNodeId: "ern-1", capability: CAP, durationValue: DV, evaluatedAt: "2026-06-12T08:00:00+09:00", computedAt: "2026-06-12T08:00:00+09:00", scope: SCOPE,
    arrival: { arrivalTargetInstant: "2026-06-12T10:00:00+09:00", arrivalTargetRef: "arr-1", targetEventDate: "2026-06-12", startTimeSource: "user_explicit", sourceRefs: ["src-a"], evidenceRefs: ["ev-a"] },
    buffer: { bufferPolicyId: "buf-1", bufferScopeRef: "bscope-1", rigidity: "hard", highCommitment: false, freshness: "valid", sourceRefs: ["src-b"], evidenceRefs: ["ev-b"] },
    origin: { originInferenceStage: "previous_event_end", dayGraphDate: "2026-06-12", dayGraphSnapshotId: "snap-1",
      previousEvent: { nodeId: "prev", endTimeHHMM: "09:00", durationSource: "explicit", boundaryClipped: false, locationText: "office", sensitive: false, startTimeSource: "user_explicit", anchorRef: "anchor-prev" } },
  };
}
let COMPUTED: LeaveByComputationV0;
let UNCOMPUTED: LeaveByComputationV0;
beforeAll(async () => {
  const o = await resolveRouteEtaCapability(routeInput(), { provider: provider(providerResult()) });
  const CAP = o.capability as RouteEtaCapabilityV0;
  const DV = o.durationValue as PlanningGradeDurationValueV0;
  COMPUTED = supplyAndResolveLeaveBy(supplyInput(CAP, DV)).leaveBy;
  UNCOMPUTED = supplyAndResolveLeaveBy({ ...supplyInput(CAP, DV), durationValue: null }).leaveBy;
});

const ern = (id: string) => ({ eventRealityNodeId: id, subjectiveDate: "2026-06-12", leaveBy: { value: null, whyUnresolved: ["eta_source_missing"] } } as unknown as EventRealityNodeV0);
function input(over: Partial<LeaveByAssemblyInputV0> = {}): LeaveByAssemblyInputV0 {
  return {
    eventRealityNodes: [ern("ern-1")],
    supplyCandidates: [{ eventRealityNodeId: "ern-1", leaveBy: COMPUTED, computedScope: SCOPE }],
    consumingInstant: FRESH,
    ernScopeByNodeId: { "ern-1": SCOPE },
    ...over,
  };
}

describe("RD2f-assembly #1-#5 match / orphan / cardinality / no-op", () => {
  it("#1 matching id → attach", () => {
    const r = assembleLeaveByBindings(input());
    expect(r.eventRealityNodes[0].leaveByComputed).toBeDefined();
    expect(r.trace.attachedNodeIds).toContain("ern-1");
  });
  it("#2 no matching ERN → orphan trace / attach なし", () => {
    const r = assembleLeaveByBindings(input({ supplyCandidates: [{ eventRealityNodeId: "ern-X", leaveBy: COMPUTED, computedScope: SCOPE }] }));
    expect(r.trace.orphanSupplyNodeIds).toContain("ern-X");
    expect(r.eventRealityNodes[0].leaveByComputed).toBeUndefined();
  });
  it("#3 duplicate supply for same node → attach なし", () => {
    const r = assembleLeaveByBindings(input({ supplyCandidates: [
      { eventRealityNodeId: "ern-1", leaveBy: COMPUTED, computedScope: SCOPE },
      { eventRealityNodeId: "ern-1", leaveBy: COMPUTED, computedScope: SCOPE },
    ] }));
    expect(r.eventRealityNodes[0].leaveByComputed).toBeUndefined();
    expect(r.trace.cardinalityRejectedNodeIds).toContain("ern-1");
    expect(r.trace.violations).toContain("duplicate_supply");
  });
  it("#4 duplicate ERN id → violation / attach なし", () => {
    const r = assembleLeaveByBindings(input({ eventRealityNodes: [ern("ern-1"), ern("ern-1")] }));
    expect(r.trace.duplicateErnIds).toContain("ern-1");
    expect(r.trace.violations).toContain("duplicate_ern_id");
    expect(r.eventRealityNodes[0].leaveByComputed).toBeUndefined();
  });
  it("#5 supply なし → same-ref no-op", () => {
    const node = ern("ern-9");
    const r = assembleLeaveByBindings({ ...input(), eventRealityNodes: [node], supplyCandidates: [], ernScopeByNodeId: {} });
    expect(r.eventRealityNodes[0]).toBe(node); // 同一参照
    expect(r.trace.skippedNoSupply).toBe(1);
  });
});

describe("RD2f-assembly #6-#11 attach 拒否（re-validation）", () => {
  const cand = (over: Partial<LeaveBySupplyCandidateV0> = {}, cOver: Partial<LeaveByComputationV0> = {}): LeaveBySupplyCandidateV0 =>
    ({ eventRealityNodeId: "ern-1", leaveBy: { ...COMPUTED, ...cOver }, computedScope: SCOPE, ...over });
  it("#6 uncomputed → attach なし", () => {
    const r = assembleLeaveByBindings(input({ supplyCandidates: [{ eventRealityNodeId: "ern-1", leaveBy: UNCOMPUTED, computedScope: SCOPE }] }));
    expect(r.eventRealityNodes[0].leaveByComputed).toBeUndefined();
    expect(r.trace.violations).toContain("attach_failed");
  });
  it("#7 violation leaveBy → attach なし", () => {
    const r = assembleLeaveByBindings(input({ supplyCandidates: [cand({}, { leaveByInstant: { instant: "bad", timezone: "JST" } })] }));
    expect(r.eventRealityNodes[0].leaveByComputed).toBeUndefined();
  });
  it("#8 scope mismatch → attach なし", () => {
    const r = assembleLeaveByBindings(input({ supplyCandidates: [cand({ computedScope: { ...SCOPE, transportMode: "walk" } })] }));
    expect(r.eventRealityNodes[0].leaveByComputed).toBeUndefined();
  });
  it("#9 stale computation → attach なし", () => {
    const stale = { ...FRESH, wallClockHHMM: "09:00", minuteOfSubjectiveDay: 240, nowInstant: "2026-06-12T09:00:00+09:00" };
    const r = assembleLeaveByBindings(input({ consumingInstant: stale }));
    expect(r.eventRealityNodes[0].leaveByComputed).toBeUndefined();
  });
  it("#10 invalid（非 JST）consumingInstant → attach なし", () => {
    const r = assembleLeaveByBindings(input({ consumingInstant: { ...FRESH, timezone: "UTC" } }));
    expect(r.eventRealityNodes[0].leaveByComputed).toBeUndefined();
  });
  it("#11 raw leak candidate → attach なし", () => {
    const r = assembleLeaveByBindings(input({ supplyCandidates: [cand({}, { sourceTimeEstimateRef: "35.6895,139.7006" })] }));
    expect(r.eventRealityNodes[0].leaveByComputed).toBeUndefined();
  });
});

describe("RD2f-assembly #12-#14 bundle discard / ern.leaveBy 不変", () => {
  it("#12/#13 attach 済 ERN は leaveByComputed 以外を持ち込まない（bundle/durationValue/capability/origin/buffer なし）", () => {
    const r = assembleLeaveByBindings(input());
    const node = r.eventRealityNodes[0];
    const added = Object.keys(node).filter((k) => !(k in ern("ern-1")));
    expect(added).toEqual(["leaveByComputed"]); // 追加 key は leaveByComputed のみ
    for (const bad of ["bundle", "durationValue", "capability", "originTemporalValidity", "bufferPolicy"]) {
      expect(Object.keys(node).includes(bad)).toBe(false);
    }
  });
  it("#14 既存 ern.leaveBy は不変", () => {
    const node = ern("ern-1");
    const r = assembleLeaveByBindings({ ...input(), eventRealityNodes: [node] });
    expect(r.eventRealityNodes[0].leaveBy).toBe(node.leaveBy);
  });
  it("buildLeaveBySupplyMap: cardinality 正しく数える", () => {
    const m = buildLeaveBySupplyMap([{ eventRealityNodeId: "a", leaveBy: COMPUTED, computedScope: SCOPE }, { eventRealityNodeId: "a", leaveBy: COMPUTED, computedScope: SCOPE }]);
    expect(m.get("a")?.length).toBe(2);
  });
});

describe("RD2f-assembly #15-#18 非接続（source-scan）", () => {
  const code = readFileSync(join(process.cwd(), "lib/plan/realityCore/leaveByAssembly.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  it("#15 MovementReality / leaveByKnown / routeKnown 等を触らない", () => {
    for (const bad of ["movementReality", "MovementReality", "leaveByKnown", "routeKnown", "etaKnown", "mobilityStatus", "deriveMovementLeaveByKnown"]) expect(code.includes(bad)).toBe(false);
  });
  it("#16 missingInputRefs を消さない", () => {
    expect(code.includes("missingInputRefs")).toBe(false);
    expect(code.includes("missingInputs")).toBe(false);
  });
  it("#17 Feasibility / CollapseRisk / Permission に接続しない", () => {
    for (const bad of ["feasibility", "Feasibility", "collapseRisk", "CollapseRisk", "intervention", "Intervention", "permission", "Permission", "proposal"]) expect(code.includes(bad)).toBe(false);
  });
  it("#18 UI / preview / route / IO なし", () => {
    for (const bad of ["operatorDayPreview", "dogfoodPreview", "assembleRealityGraph", "surface", "notification", "currentLocation", "new Date(", "Date.now", "Math.random", "fetch(", "supabase", "localStorage", ".insert("]) expect(code.includes(bad)).toBe(false);
  });
});
