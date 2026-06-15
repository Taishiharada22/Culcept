/**
 * leaveBySupply（RD2e-SUPPLY: internal-only bundle）— CEO 必須 24 cases
 * 正本: docs/reality-leaveby-supply-boundary-rd2e-supply-0.md + …-0a.md
 *
 * 核: U1(EventNode.startTimeSource→arrival fixedness) + U2(previous_event_end origin) + buffer(small なし) + 二鍵 duration を束ね、
 *   complete な時だけ computeLeaveBy。fail-closed。internal-only。
 */
import {
  buildLeaveBySupplyBundle,
  resolveLeaveByFromSupply,
  supplyAndResolveLeaveBy,
  buildArrivalTargetForLeaveBy,
  buildBufferPolicyForLeaveBy,
  leaveBySupplyViolations,
  type LeaveBySupplyInputV0,
  type LeaveBySupplyScopeV0,
} from "@/lib/plan/realityCore/leaveBySupply";
import {
  resolveRouteEtaCapability,
  type RouteEtaAdapterInputV0,
  type RouteEtaProvider,
  type RouteEtaProviderResultV0,
} from "@/lib/plan/realityCore/routeEtaProviderAdapter";
import type { RouteEtaCapabilityV0 } from "@/lib/plan/realityCore/routeEtaCapability";
import type { PlanningGradeDurationValueV0 } from "@/lib/plan/realityCore/routeEtaDurationValue";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── capability + usable durationValue を adapter 経由で得る ──────────────────────────────────
function routeInput(over: Partial<RouteEtaAdapterInputV0> = {}): RouteEtaAdapterInputV0 {
  return {
    originRef: { opaqueRef: "o1" }, destinationRef: { opaqueRef: "d1" }, targetNodeId: "ern-1",
    subjectiveDate: "2026-06-12", transportMode: "car", temporalScopeRef: "t1",
    routeOptionsRef: null, routeInputRevision: "r1",
    temporal: { departureTimeScoped: true, arrivalTargetScoped: true, timeBandScoped: true, evaluatedAtKnown: true, temporalFreshnessEvaluated: true },
    originUsableForLeaveBy: true, bufferKnown: true,
    originConflict: { originConflictStatus: "none", originDiscrepancyRefs: [], userConfirmedOriginPresent: false, currentObservationOverrodeConfirmed: false },
    pairPrivacyParts: { originEndpointSensitive: false, destinationEndpointSensitive: false, currentObservationInvolved: false, homeWorkDerivedInvolved: false },
    subjectNodeId: "ern-1", ...over,
  };
}
function providerResult(over: Partial<RouteEtaProviderResultV0> = {}): RouteEtaProviderResultV0 {
  return {
    status: "ok", providerKind: "external_route", providerVersion: "v1", durationBasis: "external_route",
    durationSignalPresent: true, durationScopeBounded: true, routeShapePresent: true, routeOptionPresent: false,
    conditionModelStatus: "traffic_aware", opaqueRouteRef: "opaque-route-1", freshnessStatus: "fresh", freshnessBasisRef: "fb1",
    durationMinutesRaw: 23, durationLowerMinutesRaw: null, ...over,
  };
}
const provider = (r: RouteEtaProviderResultV0): RouteEtaProvider => async () => r;

let CAP: RouteEtaCapabilityV0;
let DV: PlanningGradeDurationValueV0;
beforeAll(async () => {
  const o = await resolveRouteEtaCapability(routeInput(), { provider: provider(providerResult()) });
  CAP = o.capability as RouteEtaCapabilityV0;
  DV = o.durationValue as PlanningGradeDurationValueV0;
});

const SCOPE: LeaveBySupplyScopeV0 = { targetNodeId: "ern-1", subjectiveDate: "2026-06-12", transportMode: "car", temporalScopeRef: "t1" };

function input(over: Partial<LeaveBySupplyInputV0> = {}): LeaveBySupplyInputV0 {
  return {
    subjectNodeId: "ern-1",
    capability: CAP,
    durationValue: DV,
    evaluatedAt: "2026-06-12T08:00:00+09:00",
    computedAt: "2026-06-12T08:00:00+09:00",
    scope: SCOPE,
    arrival: {
      arrivalTargetInstant: "2026-06-12T10:00:00+09:00",
      arrivalTargetRef: "arr-1",
      targetEventDate: "2026-06-12",
      startTimeSource: "user_explicit",
      sourceRefs: ["src-a"],
      evidenceRefs: ["ev-a"],
    },
    buffer: {
      bufferPolicyId: "buf-1", bufferScopeRef: "bscope-1", rigidity: "hard", highCommitment: false,
      freshness: "valid", sourceRefs: ["src-b"], evidenceRefs: ["ev-b"],
    },
    origin: {
      originInferenceStage: "previous_event_end",
      dayGraphDate: "2026-06-12",
      dayGraphSnapshotId: "snap-1",
      previousEvent: {
        nodeId: "prev", endTimeHHMM: "09:00", durationSource: "explicit", boundaryClipped: false,
        locationText: "office", sensitive: false, startTimeSource: "user_explicit", anchorRef: "anchor-prev",
      },
    },
    ...over,
  };
}

// ── #1-#8 arrival fixedness（U1 startTimeSource） ────────────────────────────────────────────
describe("RD2e-SUPPLY #1-#8 arrival fixedness は startTimeSource のみ由来", () => {
  it("#1 user_explicit → fixed candidate", () => {
    const a = buildArrivalTargetForLeaveBy(SCOPE, input().arrival);
    expect(a?.fixedness).toBe("fixed");
    expect(a?.startTimeProvenance).toBe("confirmed");
  });
  it("#2 imported_exact → fixed candidate", () => {
    const a = buildArrivalTargetForLeaveBy(SCOPE, { ...input().arrival, startTimeSource: "imported_exact" });
    expect(a?.fixedness).toBe("fixed");
  });
  it("#3 system_inferred → not fixed → uncomputed", () => {
    const r = supplyAndResolveLeaveBy(input({ arrival: { ...input().arrival, startTimeSource: "system_inferred" } }));
    expect(r.bundle.arrivalTarget?.fixedness).toBe("tentative");
    expect(r.leaveBy.status).toBe("uncomputed");
  });
  it("#4 assumed_default → not fixed → uncomputed", () => {
    const r = supplyAndResolveLeaveBy(input({ arrival: { ...input().arrival, startTimeSource: "assumed_default" } }));
    expect(r.bundle.arrivalTarget?.fixedness).toBe("movable");
    expect(r.leaveBy.status).toBe("uncomputed");
  });
  it("#5/#6 unknown / missing → not fixed → uncomputed", () => {
    const r = supplyAndResolveLeaveBy(input({ arrival: { ...input().arrival, startTimeSource: "unknown" } }));
    expect(r.bundle.arrivalTarget?.fixedness).toBe("movable");
    expect(r.leaveBy.status).toBe("uncomputed");
  });
  it("#7/#8 fixedness は durationSource / rigidity / fixedStart から導出されない（source-scan）", () => {
    const code = readFileSync(join(process.cwd(), "lib/plan/realityCore/leaveBySupply.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // arrivalProvenanceFromStartSource は startTimeSource のみ分岐（durationSource/fixedStart 不参照）
    expect(code.includes("durationSource")).toBe(false);
    expect(code.includes("fixedStart")).toBe(false);
  });
});

// ── #9-#12 buffer（small なし） ──────────────────────────────────────────────────────────────
describe("RD2e-SUPPLY #9-#12 buffer supply", () => {
  it("#9 large = hard ∧ highCommitment", () => {
    const b = buildBufferPolicyForLeaveBy(SCOPE, { ...input().buffer, rigidity: "hard", highCommitment: true });
    expect(b?.bufferCoarseBucket).toBe("large");
  });
  it("#10 normal fixed → medium（hard 単独 / soft）", () => {
    expect(buildBufferPolicyForLeaveBy(SCOPE, { ...input().buffer, rigidity: "hard", highCommitment: false })?.bufferCoarseBucket).toBe("medium");
    expect(buildBufferPolicyForLeaveBy(SCOPE, { ...input().buffer, rigidity: "soft", highCommitment: false })?.bufferCoarseBucket).toBe("medium");
  });
  it("#11 small は v0 で絶対出ない", () => {
    for (const rig of ["hard", "soft"] as const) for (const hc of [true, false]) {
      const b = buildBufferPolicyForLeaveBy(SCOPE, { ...input().buffer, rigidity: rig, highCommitment: hc });
      expect(b?.bufferCoarseBucket === "small").toBe(false);
    }
  });
  it("#12 buffer freshness stale/unknown → null → uncomputed", () => {
    expect(buildBufferPolicyForLeaveBy(SCOPE, { ...input().buffer, freshness: "stale" })).toBeNull();
    const r = supplyAndResolveLeaveBy(input({ buffer: { ...input().buffer, freshness: "unknown" } }));
    expect(r.bundle.bufferPolicy).toBeNull();
    expect(r.bundle.missingInputs).toContain("buffer_unknown");
    expect(r.leaveBy.status).toBe("uncomputed");
  });
});

// ── #13/#14 origin ───────────────────────────────────────────────────────────────────────────
describe("RD2e-SUPPLY #13/#14 origin (U2-minimal)", () => {
  it("#13 previous_event_end valid → origin supplied valid", () => {
    const b = buildLeaveBySupplyBundle(input());
    expect(b.originTemporalValidity?.validity).toBe("valid");
    expect(b.originTemporalValidity?.originKind).toBe("previous_event_end");
  });
  it("#14 home/work/current/user_confirmed → origin null → uncomputed", () => {
    for (const stage of ["home_assumed", "work_assumed", "current_location_candidate", "user_confirmed_origin"] as const) {
      const r = supplyAndResolveLeaveBy(input({ origin: { ...input().origin!, originInferenceStage: stage } }));
      expect(r.bundle.originTemporalValidity).toBeNull();
      expect(r.leaveBy.status).toBe("uncomputed");
    }
  });
});

// ── #15-#17 二鍵 / scope ─────────────────────────────────────────────────────────────────────
describe("RD2e-SUPPLY #15-#17 二鍵 / scope", () => {
  it("#15 scope mismatch（capability と別 targetNodeId）→ uncomputed", () => {
    const r = supplyAndResolveLeaveBy(input({ scope: { ...SCOPE, targetNodeId: "other-node" } }));
    expect(r.leaveBy.status).toBe("uncomputed");
  });
  it("#16 durationValue null → uncomputed", () => {
    const r = supplyAndResolveLeaveBy(input({ durationValue: null }));
    expect(r.bundle.missingInputs).toContain("duration_value_missing");
    expect(r.leaveBy.status).toBe("uncomputed");
  });
  it("#17 capability/value mismatch → uncomputed", () => {
    const tampered: RouteEtaCapabilityV0 = { ...CAP, identity: { ...CAP.identity, providerVersion: "v999" } };
    const r = supplyAndResolveLeaveBy(input({ capability: tampered }));
    expect(r.leaveBy.status).toBe("uncomputed");
  });
});

// ── #18-#20 complete / computed / cross-midnight ─────────────────────────────────────────────
describe("RD2e-SUPPLY #18-#20 complete bundle → computeLeaveBy", () => {
  it("#18 complete bundle → computed", () => {
    const r = supplyAndResolveLeaveBy(input());
    expect(r.bundle.complete).toBe(true);
    expect(r.leaveBy.status).toBe("computed");
    expect(r.leaveBy.leaveByInstant?.instant).toBe("2026-06-12T09:20:00+09:00"); // 10:00 − (25+15)
  });
  it("#19 missing bundle（origin null）→ not complete → uncomputed", () => {
    const r = supplyAndResolveLeaveBy(input({ origin: null }));
    expect(r.bundle.complete).toBe(false);
    expect(r.bundle.missingInputs).toContain("origin_unavailable");
    expect(r.leaveBy.status).toBe("uncomputed");
  });
  it("#20 cross-midnight computed leaveBy は arrival 有効なら reject しない（前日 leaveBy）", () => {
    const r = supplyAndResolveLeaveBy(input({
      arrival: { ...input().arrival, arrivalTargetInstant: "2026-06-12T00:30:00+09:00" },
      origin: { ...input().origin!, previousEvent: { ...input().origin!.previousEvent, endTimeHHMM: "00:10" } },
    }));
    expect(r.leaveBy.status).toBe("computed");
    expect(r.leaveBy.leaveByInstant?.instant).toBe("2026-06-11T23:50:00+09:00");
  });
});

// ── #21/#22 internal-only / leak / 純度 ─────────────────────────────────────────────────────
describe("RD2e-SUPPLY #21/#22 internal-only / leak / 純度", () => {
  it("#21 健全 bundle は violations 空・raw location forge は検出", () => {
    expect(leaveBySupplyViolations(buildLeaveBySupplyBundle(input()))).toEqual([]);
    const forged = buildLeaveBySupplyBundle(input({ arrival: { ...input().arrival, arrivalTargetRef: "35.6895,139.7006" } }));
    expect(leaveBySupplyViolations(forged).some((m) => m.includes("raw location"))).toBe(true);
  });
  it("arrival/buffer displayPolicy は hidden（internal-only）", () => {
    const b = buildLeaveBySupplyBundle(input());
    expect(b.arrivalTarget?.displayPolicy).toBe("hidden");
    expect(b.bufferPolicy?.displayPolicy).toBe("hidden");
  });
  it("#22 leaveBySupply.ts に UI/DB/localStorage/notification/currentLocation/geolocation/Date/乱数なし", () => {
    const code = readFileSync(join(process.cwd(), "lib/plan/realityCore/leaveBySupply.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["currentLocation", "getCurrentLocation", "geolocation", "navigator", "new Date(", "Date.now", "Math.random", "fetch(", "supabase", "localStorage", ".insert(", ".update(", "notification", "departureLine", "push("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});
