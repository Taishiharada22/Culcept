/**
 * routeEtaCapability（RD2d-a mode-aware capability DAG・pure type + walker）— CEO 必須 21 fixtures
 * 正本: docs/reality-route-eta-supply-boundary-rd2d-0b.md / CEO RD2d-a 実装 GO
 *
 * 核: 単調 lattice でなく mode-aware DAG。duration≠projection≠planning≠leaveBy。trafficAware を共通必須にしない。
 *   heuristic は action input にしない。origin conflict で leaveBy 不可。endpoint pair で外部送信 gate。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  conditionAdequateForMode,
  deriveCapabilityFlagsFromParts,
  routeEtaCapabilityViolations,
  endpointPairPrivacyViolations,
  buildRouteEtaCapability,
  type TransportModeV0,
  type DurationBasisV0,
  type ConditionModelStatusV0,
  type RouteEtaFreshnessStatusV0,
  type BuildRouteEtaCapabilityInput,
  type RouteEtaCapabilityV0,
} from "@/lib/plan/realityCore/routeEtaCapability";

function baseInput(over: Partial<BuildRouteEtaCapabilityInput> = {}): BuildRouteEtaCapabilityInput {
  return {
    identity: {
      originRef: { opaqueRef: "o1" },
      destinationRef: { opaqueRef: "d1" },
      targetNodeId: "ern-1",
      subjectiveDate: "2026-06-12",
      transportMode: "car",
      temporalScopeRef: "t1",
      providerKind: "external_route_api",
      providerVersion: "v1",
      routeOptionsRef: null,
      routeInputRevision: "r1",
    },
    route: { transportModeKnown: true, routeShapeKnown: true, routeOptionKnown: false, providerKindKnown: true },
    duration: { travelDurationKnown: true, durationBasis: "external_route", durationScopeKnown: true },
    temporal: {
      departureTimeScoped: true,
      arrivalTargetScoped: true,
      timeBandScoped: true,
      evaluatedAtKnown: true,
      temporalFreshnessKnown: true,
    },
    condition: { conditionModelStatus: "traffic_aware" },
    freshness: { freshnessStatus: "fresh", staleReason: null, fetchedAtRef: "f1", validUntilRef: "v1" },
    originUsableForLeaveBy: true,
    bufferKnown: true,
    originConflict: {
      originConflictStatus: "none",
      originDiscrepancyRefs: [],
      userConfirmedOriginPresent: false,
      currentObservationOverrodeConfirmed: false,
    },
    pairPrivacyParts: {
      originEndpointSensitive: false,
      destinationEndpointSensitive: false,
      currentObservationInvolved: false,
      homeWorkDerivedInvolved: false,
    },
    evidenceRefs: [{ code: "ext_route", capability: "duration", source: "external_route" }],
    ...over,
  };
}

describe("RD2d-a #1 routeShape なしでも user_confirmed duration 表現可", () => {
  it("routeShapeKnown false + user_confirmed duration → 健全", () => {
    const cap = buildRouteEtaCapability(
      baseInput({
        route: { transportModeKnown: true, routeShapeKnown: false, routeOptionKnown: false, providerKindKnown: false },
        duration: { travelDurationKnown: true, durationBasis: "user_confirmed", durationScopeKnown: true },
        identity: { ...baseInput().identity, providerKind: "user", providerVersion: "u1", transportMode: "walk" },
        condition: { conditionModelStatus: "static_assumption" },
        evidenceRefs: [{ code: "user_dur", capability: "duration", source: "user_confirmed" }],
      }),
    );
    expect(cap.duration.travelDurationKnown).toBe(true);
    expect(cap.route.routeShapeKnown).toBe(false);
    expect(routeEtaCapabilityViolations(cap)).toEqual([]);
  });
});

describe("RD2d-a #2 routeShape なしでも transit scheduled duration 表現可", () => {
  it("routeShapeKnown false + transit scheduled → 健全", () => {
    const cap = buildRouteEtaCapability(
      baseInput({
        identity: { ...baseInput().identity, transportMode: "transit", providerKind: "transit_schedule", providerVersion: "s1" },
        route: { transportModeKnown: true, routeShapeKnown: false, routeOptionKnown: false, providerKindKnown: true },
        duration: { travelDurationKnown: true, durationBasis: "scheduled", durationScopeKnown: true },
        condition: { conditionModelStatus: "schedule_aware" },
      }),
    );
    expect(cap.route.routeShapeKnown).toBe(false);
    expect(cap.duration.travelDurationKnown).toBe(true);
    expect(routeEtaCapabilityViolations(cap)).toEqual([]);
  });
});

describe("RD2d-a #3 car + static_assumption は arrivalProjection 不可", () => {
  it("conditionAdequateForMode(car, static) = false → projection false", () => {
    expect(conditionAdequateForMode("car", "static_assumption")).toBe(false);
    const cap = buildRouteEtaCapability(baseInput({ condition: { conditionModelStatus: "static_assumption" } }));
    expect(cap.planning.arrivalProjectionKnown).toBe(false);
    expect(routeEtaCapabilityViolations(cap)).toEqual([]);
  });
});

describe("RD2d-a #4 walking + static_assumption は condition adequate", () => {
  it("conditionAdequateForMode(walk, static) = true", () => {
    expect(conditionAdequateForMode("walk", "static_assumption")).toBe(true);
  });
});

describe("RD2d-a #5 transit + schedule_aware は condition adequate", () => {
  it("conditionAdequateForMode(transit, schedule_aware) = true・traffic は不可", () => {
    expect(conditionAdequateForMode("transit", "schedule_aware")).toBe(true);
    expect(conditionAdequateForMode("transit", "traffic_aware")).toBe(false);
  });
});

describe("RD2d-a #6 unknown mode は arrivalProjection 不可", () => {
  it("conditionAdequateForMode(unknown, *) = false → projection false", () => {
    for (const s of ["traffic_aware", "schedule_aware", "static_assumption"] as ConditionModelStatusV0[]) {
      expect(conditionAdequateForMode("unknown", s)).toBe(false);
    }
    const cap = buildRouteEtaCapability(
      baseInput({ identity: { ...baseInput().identity, transportMode: "unknown" } }),
    );
    expect(cap.planning.arrivalProjectionKnown).toBe(false);
  });
});

describe("RD2d-a #7 travelDurationKnown ≠ arrivalProjectionKnown", () => {
  it("duration true・temporal 未 scope → projection false", () => {
    const flags = deriveCapabilityFlagsFromParts({
      mode: "car",
      travelDurationKnown: true,
      durationBasis: "external_route",
      departureTimeScoped: false,
      arrivalTargetScoped: false,
      temporalFreshnessKnown: false,
      conditionModelStatus: "traffic_aware",
      freshnessStatus: "fresh",
      originUsableForLeaveBy: true,
      bufferKnown: true,
      originConflictStatus: "none",
    });
    expect(flags.arrivalProjectionKnown).toBe(false);
  });
});

describe("RD2d-a #8 arrivalProjectionKnown ≠ timeEstimateUsableForPlanning", () => {
  it("projection true・freshness stale → planning false", () => {
    const cap = buildRouteEtaCapability(
      baseInput({ freshness: { freshnessStatus: "stale", staleReason: "age_exceeded", fetchedAtRef: "f", validUntilRef: "v" } }),
    );
    expect(cap.planning.arrivalProjectionKnown).toBe(true);
    expect(cap.planning.timeEstimateUsableForPlanning).toBe(false);
  });
});

describe("RD2d-a #9 timeEstimateUsableForPlanning ≠ leaveByEligible", () => {
  it("planning usable・buffer なし → leaveBy false", () => {
    const cap = buildRouteEtaCapability(baseInput({ bufferKnown: false }));
    expect(cap.planning.timeEstimateUsableForPlanning).toBe(true);
    expect(cap.leaveBy.leaveByEligible).toBe(false);
  });
});

describe("RD2d-a #10 stale freshness なら planning usable false", () => {
  it("stale / expired → planning usable false", () => {
    for (const fs of ["stale", "expired"] as RouteEtaFreshnessStatusV0[]) {
      const cap = buildRouteEtaCapability(
        baseInput({ freshness: { freshnessStatus: fs, staleReason: "x", fetchedAtRef: "f", validUntilRef: "v" } }),
      );
      expect(cap.planning.timeEstimateUsableForPlanning).toBe(false);
      expect(cap.leaveBy.leaveByEligible).toBe(false);
    }
  });
});

describe("RD2d-a #11 heuristic は planning / leaveBy / action input 不可", () => {
  it("heuristic → projection/planning/leaveBy false・displayPolicy internalReference", () => {
    const cap = buildRouteEtaCapability(
      baseInput({ duration: { travelDurationKnown: true, durationBasis: "heuristic", durationScopeKnown: false }, evidenceRefs: [] }),
    );
    expect(cap.planning.arrivalProjectionKnown).toBe(false);
    expect(cap.planning.timeEstimateUsableForPlanning).toBe(false);
    expect(cap.leaveBy.leaveByEligible).toBe(false);
    expect(["internalReference", "debugOnly"]).toContain(cap.displayPolicy);
    expect(routeEtaCapabilityViolations(cap)).toEqual([]);
  });
  it("偽造: heuristic で leaveByEligible true / visible → violation", () => {
    const cap = buildRouteEtaCapability(
      baseInput({ duration: { travelDurationKnown: true, durationBasis: "heuristic", durationScopeKnown: false }, evidenceRefs: [] }),
    );
    const forged: RouteEtaCapabilityV0 = {
      ...cap,
      leaveBy: { ...cap.leaveBy, leaveByEligible: true },
      displayPolicy: "visible",
    };
    const v = routeEtaCapabilityViolations(forged);
    expect(v.some((m) => m.includes("heuristic must not yield leaveByEligible"))).toBe(true);
    expect(v.some((m) => m.includes("displayPolicy"))).toBe(true);
  });
});

describe("RD2d-a #12 user_confirmed route scope mismatch で stale/unknown", () => {
  it("user_confirmed だが stale(scope mismatch) → planning usable false", () => {
    const cap = buildRouteEtaCapability(
      baseInput({
        duration: { travelDurationKnown: true, durationBasis: "user_confirmed", durationScopeKnown: true },
        identity: { ...baseInput().identity, transportMode: "walk", providerKind: "user", providerVersion: "u" },
        condition: { conditionModelStatus: "static_assumption" },
        freshness: { freshnessStatus: "stale", staleReason: "scope_mismatch", fetchedAtRef: "f", validUntilRef: "v" },
        evidenceRefs: [{ code: "u", capability: "duration", source: "user_confirmed" }],
      }),
    );
    expect(cap.planning.timeEstimateUsableForPlanning).toBe(false);
    expect(cap.leaveBy.leaveByEligible).toBe(false);
  });
});

describe("RD2d-a #13 origin conflict で leaveByEligible false", () => {
  it("originConflictStatus conflict → leaveBy false（他条件揃っても）", () => {
    const cap = buildRouteEtaCapability(
      baseInput({
        originConflict: {
          originConflictStatus: "conflict",
          originDiscrepancyRefs: ["prev_vs_current"],
          userConfirmedOriginPresent: false,
          currentObservationOverrodeConfirmed: false,
        },
      }),
    );
    expect(cap.leaveBy.leaveByEligible).toBe(false);
    expect(routeEtaCapabilityViolations(cap)).toEqual([]);
  });
});

describe("RD2d-a #14 user_confirmed origin を current 観測で上書きしない", () => {
  it("currentObservationOverrodeConfirmed true → violation", () => {
    const cap = buildRouteEtaCapability(baseInput());
    const forged: RouteEtaCapabilityV0 = {
      ...cap,
      originConflict: { ...cap.originConflict, userConfirmedOriginPresent: true, currentObservationOverrodeConfirmed: true },
    };
    expect(routeEtaCapabilityViolations(forged).some((m) => m.includes("must not override user_confirmed origin"))).toBe(true);
  });
});

describe("RD2d-a #15 endpoint pair sensitive なら externalSendAllowed false", () => {
  it("origin sensitive → pairExternalSendAllowed false・送信許可は violation", () => {
    const cap = buildRouteEtaCapability(
      baseInput({
        pairPrivacyParts: {
          originEndpointSensitive: true,
          destinationEndpointSensitive: false,
          currentObservationInvolved: false,
          homeWorkDerivedInvolved: false,
        },
      }),
    );
    expect(cap.pairPrivacy.eitherEndpointSensitive).toBe(true);
    expect(cap.pairPrivacy.pairExternalSendAllowed).toBe(false);
    expect(endpointPairPrivacyViolations(cap.pairPrivacy)).toEqual([]);
    const forged = { ...cap.pairPrivacy, pairExternalSendAllowed: true, coordinatePrecisionPolicy: "minimized" as const };
    expect(endpointPairPrivacyViolations(forged).some((m) => m.includes("must not allow external send"))).toBe(true);
  });
});

describe("RD2d-a #16 currentLocation endpoint は strongest sensitive", () => {
  it("current 観測 involved → either sensitive・send 不可", () => {
    const cap = buildRouteEtaCapability(
      baseInput({
        pairPrivacyParts: {
          originEndpointSensitive: false,
          destinationEndpointSensitive: false,
          currentObservationInvolved: true,
          homeWorkDerivedInvolved: false,
        },
      }),
    );
    expect(cap.pairPrivacy.eitherEndpointSensitive).toBe(true);
    expect(cap.pairPrivacy.pairExternalSendAllowed).toBe(false);
    expect(endpointPairPrivacyViolations(cap.pairPrivacy)).toEqual([]);
  });
});

describe("RD2d-a #17 raw coordinate / polyline / route response field が出ない", () => {
  it("正常 output に raw token なし + 偽造混入を検出", () => {
    const cap = buildRouteEtaCapability(baseInput());
    const json = JSON.stringify(cap).toLowerCase();
    for (const t of ["polyline", "latitude", "longitude", "geometry", "coordinates", "routeresponse"]) {
      expect(json.includes(t)).toBe(false);
    }
    const forged = { ...cap, polyline: "abc", latitude: 35.6895, longitude: 139.7006 } as unknown as RouteEtaCapabilityV0;
    const v = routeEtaCapabilityViolations(forged);
    expect(v.some((m) => m.includes("raw token") || m.includes("coordinate"))).toBe(true);
  });
});

describe("RD2d-a #18 route / ETA provider import なし（source-scan）", () => {
  it("routeEtaCapability.ts に transport provider import なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/routeEtaCapability.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of [
      "heuristicDistanceProvider",
      "cascadeOrchestrator",
      "unresolvedProvider",
      "manualUserProvider",
      "transportTypes",
      "GoogleRoutes",
      "TransportResolutionProvider",
    ]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RD2d-a #19 external API / currentLocation / weather import なし（source-scan）", () => {
  it("routeEtaCapability.ts に外部取得 import なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/routeEtaCapability.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["navigator", "geolocation", "getCurrentLocation", "captureLocation", "reverseGeocode", "fetchJma", "weatherApi", "googleapis", "maps.googleapis"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RD2d-a #20 IO source-scan green", () => {
  it("routeEtaCapability.ts に write/時刻/乱数/IO なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/routeEtaCapability.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of [
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "service_role",
      "notification",
      "push(",
      "Date.now",
      "Math.random",
      "new Date(",
      "writeFile",
      "process.env",
      "fetch(",
      "supabase",
      "localStorage",
    ]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RD2d-a #21 全 capability 整合（baseline integrity）", () => {
  it("代表 capability すべて violations green・DAG 整合", () => {
    const caps = [
      buildRouteEtaCapability(baseInput()), // car traffic-aware fresh → leaveBy 可
      buildRouteEtaCapability(baseInput({ duration: { travelDurationKnown: true, durationBasis: "heuristic", durationScopeKnown: false }, evidenceRefs: [] })),
      buildRouteEtaCapability(baseInput({ identity: { ...baseInput().identity, transportMode: "unknown" } })),
      buildRouteEtaCapability(baseInput({ bufferKnown: false })),
    ];
    for (const c of caps) expect(routeEtaCapabilityViolations(c)).toEqual([]);
    // car traffic-aware fresh buffer origin → leaveBy 可
    expect(caps[0].leaveBy.leaveByEligible).toBe(true);
    // heuristic → leaveBy 不可
    expect(caps[1].leaveBy.leaveByEligible).toBe(false);
    // unknown mode → projection 不可
    expect(caps[2].planning.arrivalProjectionKnown).toBe(false);
  });
});
