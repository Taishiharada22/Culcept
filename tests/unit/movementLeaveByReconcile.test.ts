/**
 * RD2f-mv+guard — MovementReality.leaveByKnown derived-only / coherence / v0 安全ラダー緩和 + non-load-bearing guard（2026-06-15）
 * 正本設計: docs/reality-leaveby-semantics-rd2f-sem-0.md（§1/§2/§3/§4）
 *
 * 核: leaveByKnown を hard-false invariant から derived-only に緩和（reconcile が唯一 writer・hand-set 禁止・
 *   v0 安全ラダー leaveByKnown⟹etaKnown⟹routeKnown）。v0 は etaKnown/routeKnown false 固定ゆえ leaveByKnown=true は
 *   事実上不成立=inert。同時に judgment/surface/delivery chain が leaveByComputed/mv.leaveByKnown を read しないことを固定。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { movementRealityViolations, type MovementRealityV0 } from "@/lib/plan/realityCore/movementReality";
import {
  reconcileMovementLeaveByKnown,
  movementLeaveByKnownCoherenceViolations,
  arrivalErnIdForMovement,
} from "@/lib/plan/realityCore/movementLeaveByReconcile";
import { attachComputedLeaveBy } from "@/lib/plan/realityCore/leaveByGraphBinding";
import { inferredAttribute } from "@/lib/plan/realityCore/realityAttribute";
import { resolveRouteEtaCapability, type RouteEtaAdapterInputV0, type RouteEtaProvider, type RouteEtaProviderResultV0 } from "@/lib/plan/realityCore/routeEtaProviderAdapter";
import { supplyAndResolveLeaveBy, type LeaveBySupplyInputV0, type LeaveBySupplyScopeV0 } from "@/lib/plan/realityCore/leaveBySupply";
import type { RouteEtaCapabilityV0 } from "@/lib/plan/realityCore/routeEtaCapability";
import type { PlanningGradeDurationValueV0 } from "@/lib/plan/realityCore/routeEtaDurationValue";
import type { LeaveByComputationV0 } from "@/lib/plan/realityCore/leaveByComputation";
import type { EventRealityNodeV0 } from "@/lib/plan/realityCore/eventRealityNode";

// ── computed leaveBy を supply 経由で得る（leaveByGraphBinding.test.ts と同パターン）──
const SCOPE: LeaveBySupplyScopeV0 = { targetNodeId: "ern-1", subjectiveDate: "2026-06-12", transportMode: "car", temporalScopeRef: "t1" };
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
function supplyInput(CAPv: RouteEtaCapabilityV0, DVv: PlanningGradeDurationValueV0): LeaveBySupplyInputV0 {
  return {
    subjectNodeId: "ern-1", capability: CAPv, durationValue: DVv,
    evaluatedAt: "2026-06-12T08:00:00+09:00", computedAt: "2026-06-12T08:00:00+09:00", scope: SCOPE,
    arrival: { arrivalTargetInstant: "2026-06-12T10:00:00+09:00", arrivalTargetRef: "arr-1", targetEventDate: "2026-06-12", startTimeSource: "user_explicit", sourceRefs: ["src-a"], evidenceRefs: ["ev-a"] },
    buffer: { bufferPolicyId: "buf-1", bufferScopeRef: "bscope-1", rigidity: "hard", highCommitment: false, freshness: "valid", sourceRefs: ["src-b"], evidenceRefs: ["ev-b"] },
    origin: { originInferenceStage: "previous_event_end", dayGraphDate: "2026-06-12", dayGraphSnapshotId: "snap-1",
      previousEvent: { nodeId: "prev", endTimeHHMM: "09:00", durationSource: "explicit", boundaryClipped: false, locationText: "office", sensitive: false, startTimeSource: "user_explicit", anchorRef: "anchor-prev" } },
  };
}
let CAP: RouteEtaCapabilityV0;
let COMPUTED: LeaveByComputationV0;
beforeAll(async () => {
  const o = await resolveRouteEtaCapability(routeInput(), { provider: provider(providerResult()) });
  CAP = o.capability as RouteEtaCapabilityV0;
  COMPUTED = supplyAndResolveLeaveBy(supplyInput(CAP, o.durationValue as PlanningGradeDurationValueV0)).leaveBy;
});

// ── mv fixture（arrivalErnId = ern:2026-06-12:a1）──
const boolAttr = (v: boolean, dp: "visible" | "hidden" | "debugOnly" | "notActionable" = "debugOnly") =>
  inferredAttribute(v, 0.9, ["e"], { source: "derived", displayPolicy: dp });
function mkMv(over: Partial<MovementRealityV0> = {}): MovementRealityV0 {
  return {
    schemaVersion: 0, movementRealityId: "mv:2026-06-12:fa:a1", date: "2026-06-12", subjectiveDate: "2026-06-12",
    sourceRefs: { fromAnchorId: "fa", toAnchorId: "a1", fromNodeId: "fn", toNodeId: "tn", dayGraphSnapshotId: "snap", transitionBasis: "fn->tn" },
    movementRequired: boolAttr(true, "visible"), samePlacePossible: boolAttr(false), placeKnown: boolAttr(true),
    routeKnown: boolAttr(false), etaKnown: boolAttr(false), leaveByKnown: boolAttr(false),
    mobilityStatus: inferredAttribute("unresolved", 0.9, ["e"], { source: "derived", displayPolicy: "debugOnly" }),
    missingInputs: ["eta_source_missing"],
    ...over,
  } as unknown as MovementRealityV0;
}
const ARRIVAL_ERN_ID = "ern:2026-06-12:a1";
function mkErn(over: Partial<EventRealityNodeV0> = {}): EventRealityNodeV0 {
  return { eventRealityNodeId: ARRIVAL_ERN_ID, subjectiveDate: "2026-06-12", ...over } as unknown as EventRealityNodeV0;
}
const FRESH = { nowInstant: "2026-06-12T08:05:00+09:00", timezone: "Asia/Tokyo", wallClockHHMM: "08:05", calendarDate: "2026-06-12", subjectiveDate: "2026-06-12", minuteOfSubjectiveDay: 185 };
const STALE = { nowInstant: "2026-06-12T09:00:00+09:00", timezone: "Asia/Tokyo", wallClockHHMM: "09:00", calendarDate: "2026-06-12", subjectiveDate: "2026-06-12", minuteOfSubjectiveDay: 540 };

describe("RD2f-mv #1 default v0 movement は leaveByKnown=false かつ違反なし", () => {
  it("mkMv() は leaveByKnown false・movementRealityViolations 空", () => {
    const mv = mkMv();
    expect(mv.leaveByKnown.value).toBe(false);
    expect(movementRealityViolations(mv)).toEqual([]);
  });
});

describe("RD2f-mv #2/#3 reconcile derived-only + v0 安全ラダー", () => {
  it("#2 valid computed + etaKnown=false → leaveByKnown false（ladder で阻止）", () => {
    const r = reconcileMovementLeaveByKnown(mkMv({ etaKnown: boolAttr(false), routeKnown: boolAttr(true) }), COMPUTED, CAP);
    expect(r.leaveByKnown.value).toBe(false);
  });
  it("#3 valid computed + etaKnown=true + routeKnown=true → leaveByKnown true（internal display・exact instant 非含有）", () => {
    const r = reconcileMovementLeaveByKnown(mkMv({ etaKnown: boolAttr(true), routeKnown: boolAttr(true) }), COMPUTED, CAP);
    expect(r.leaveByKnown.value).toBe(true);
    expect(r.leaveByKnown.displayPolicy).not.toBe("visible");
    // evidenceRefs は ref id のみ（exact ISO instant を含まない）
    for (const ref of r.leaveByKnown.evidenceRefs) expect(/\d{4}-\d{2}-\d{2}T/.test(ref)).toBe(false);
  });
});

describe("RD2f-mv #4/#5 cross-node coherence（hand-set / mismatch 検出）", () => {
  const trueMv = () => mkMv({ leaveByKnown: boolAttr(true), etaKnown: boolAttr(true), routeKnown: boolAttr(true) });
  it("#4 leaveByKnown=true だが対応 ern に computed 不在 → leaveByKnown_without_computed", () => {
    const v = movementLeaveByKnownCoherenceViolations({ movementRealityNodes: [trueMv()], eventRealityNodes: [mkErn()] });
    expect(v.some((m) => m.includes("leaveByKnown_without_computed"))).toBe(true);
  });
  it("#5 computed の subjectNodeId が ern と不一致 → leaveByKnown_subject_mismatch", () => {
    const ern = mkErn({ leaveByComputed: { ...COMPUTED, subjectNodeId: "other-node" } as LeaveByComputationV0 });
    const v = movementLeaveByKnownCoherenceViolations({ movementRealityNodes: [trueMv()], eventRealityNodes: [ern] });
    expect(v.some((m) => m.includes("leaveByKnown_subject_mismatch"))).toBe(true);
  });
  it("coherent（computed present・subject 一致）→ 違反なし", () => {
    const ern = mkErn({ leaveByComputed: { ...COMPUTED, subjectNodeId: ARRIVAL_ERN_ID } as LeaveByComputationV0 });
    const v = movementLeaveByKnownCoherenceViolations({ movementRealityNodes: [trueMv()], eventRealityNodes: [ern] });
    expect(v).toEqual([]);
  });
});

describe("RD2f-mv #6/#7/#8/#9 不適格 computed は leaveByKnown=true にしない", () => {
  const okMv = () => mkMv({ etaKnown: boolAttr(true), routeKnown: boolAttr(true) });
  it("#6 uncomputed → false", () => {
    const r = reconcileMovementLeaveByKnown(okMv(), { ...COMPUTED, status: "uncomputed" } as LeaveByComputationV0, CAP);
    expect(r.leaveByKnown.value).toBe(false);
  });
  it("#7 violation あり（bufferRef=null）→ false", () => {
    const r = reconcileMovementLeaveByKnown(okMv(), { ...COMPUTED, bufferRef: null } as LeaveByComputationV0, CAP);
    expect(r.leaveByKnown.value).toBe(false);
  });
  it("#8 stale computed は attach されず（undefined）→ reconcile false", () => {
    const att = attachComputedLeaveBy({ ern: mkErn(), computed: COMPUTED, computedScope: SCOPE, ernScope: SCOPE, consumingInstant: STALE });
    expect(att.attached).toBe(false);
    expect(att.ern.leaveByComputed).toBeUndefined();
    const r = reconcileMovementLeaveByKnown(okMv(), att.ern.leaveByComputed, CAP);
    expect(r.leaveByKnown.value).toBe(false);
  });
  it("#9 非 planning-grade source（heuristic 強制）→ false（PLANNING_GRADE_SOURCES filter で棄却）", () => {
    // heuristic は LeaveByComputationSource の member でない（durationBasis 由来＝computed を生まない）。
    // 不正状態を強制注入し deriveMovementLeaveByKnown の source filter が弾くことを証明（through-unknown は意図的）。
    const r = reconcileMovementLeaveByKnown(okMv(), { ...COMPUTED, source: "heuristic" } as unknown as LeaveByComputationV0, CAP);
    expect(r.leaveByKnown.value).toBe(false);
  });
});

describe("RD2f-mv #10 displayPolicy visible は violation", () => {
  it("leaveByKnown=true + displayPolicy visible → display 違反を含む", () => {
    const mv = mkMv({ leaveByKnown: boolAttr(true, "visible"), etaKnown: boolAttr(true), routeKnown: boolAttr(true) });
    expect(movementRealityViolations(mv).some((m) => m.includes("displayPolicy が internal-only でない"))).toBe(true);
  });
});

describe("RD2f-mv #11-#14 reconcile は leaveByKnown 以外を一切変更しない", () => {
  it("routeKnown/etaKnown/mobilityStatus/missingInputs が同一参照で不変", () => {
    const mv = mkMv({ etaKnown: boolAttr(true), routeKnown: boolAttr(true) });
    const r = reconcileMovementLeaveByKnown(mv, COMPUTED, CAP);
    expect(r.routeKnown).toBe(mv.routeKnown);
    expect(r.etaKnown).toBe(mv.etaKnown);
    expect(r.mobilityStatus).toBe(mv.mobilityStatus);
    expect(r.missingInputs).toBe(mv.missingInputs);
    expect(r.leaveByKnown).not.toBe(mv.leaveByKnown); // leaveByKnown のみ差し替え
  });
  it("derive 不成立時は mv を完全不変で返す（同一オブジェクト）", () => {
    const mv = mkMv({ etaKnown: boolAttr(false) });
    expect(reconcileMovementLeaveByKnown(mv, COMPUTED, CAP)).toBe(mv);
    expect(reconcileMovementLeaveByKnown(mv, undefined, CAP)).toBe(mv);
    expect(reconcileMovementLeaveByKnown(mv, COMPUTED, undefined)).toBe(mv);
  });
});

// ── #15-#20 non-load-bearing 静的 guard（source-scan）──
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
const readSrc = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
const CHAIN: ReadonlyArray<{ label: string; rel: string }> = [
  { label: "#15/#16 Feasibility", rel: "lib/plan/realityCore/feasibilityJudgment.ts" },
  { label: "#17 CollapseRisk", rel: "lib/plan/realityCore/collapseRisk.ts" },
  { label: "#17 CollapsePropagation", rel: "lib/plan/realityCore/collapsePropagation.ts" },
  { label: "#18 InterventionEligibility", rel: "lib/plan/realityCore/interventionEligibility.ts" },
  { label: "#18 InterventionDecision", rel: "lib/plan/realityCore/interventionDecision.ts" },
  { label: "#19 SurfacePlan", rel: "lib/plan/realityCore/judgmentSurfacePlan.ts" },
  { label: "#19 SurfaceClaim", rel: "lib/plan/realityCore/surfaceClaim.ts" },
  { label: "#19 SurfaceProjection", rel: "lib/plan/realityCore/surfaceProjection.ts" },
  { label: "#19 CopySurface", rel: "lib/plan/realityCore/copySurface.ts" },
  { label: "#19 DeliveryGate", rel: "lib/plan/realityCore/deliveryGate.ts" },
];

describe("RD2f-mv #15-#19 judgment/surface/delivery chain は leaveByComputed / mv.leaveByKnown を読まない", () => {
  for (const m of CHAIN) {
    it(`${m.label} は leaveByComputed を参照しない`, () => {
      expect(readSrc(m.rel).includes("leaveByComputed")).toBe(false);
    });
    it(`${m.label} は leaveByKnown を参照しない`, () => {
      expect(readSrc(m.rel).includes("leaveByKnown")).toBe(false);
    });
  }
  it("Feasibility は display ern.leaveBy / etaKnown を維持（既存挙動）", () => {
    const code = readSrc("lib/plan/realityCore/feasibilityJudgment.ts");
    expect(code.includes("ern.leaveBy")).toBe(true);
    expect(code.includes("etaKnown")).toBe(true);
  });
});

describe("RD2f-mv #20 reconcile helper は UI / preview / notification / IO を import しない", () => {
  it("movementLeaveByReconcile.ts は pure（外部副作用 import なし）", () => {
    const code = readSrc("lib/plan/realityCore/movementLeaveByReconcile.ts");
    for (const t of ["react", "preview", "notification", "dogfood", "operatorDay", "localStorage", "supabase", "fetch("]) {
      expect(code.includes(t)).toBe(false);
    }
  });
});
