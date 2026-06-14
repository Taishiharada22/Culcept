/**
 * routeEtaCapability（RD2d-a mode-aware capability DAG + RD2d-a-A 補正・pure type + walker）— CEO 必須 fixtures
 * 正本: docs/reality-route-eta-supply-boundary-rd2d-0b.md / CEO RD2d-a + RD2d-a-A micro-fix GO
 *
 * 核（RD2d-a-A）: durationSignalPresent(≠known)・projection は ALLOWLIST(durationProjectionGradeOk・fail-closed)・
 *   leaveByComputable(tier-1 のみ・display/action でない)・leak guard 強化（pair pattern）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  conditionAdequateForMode,
  durationProjectionGradeOk,
  deriveCapabilityFlagsFromParts,
  routeEtaCapabilityViolations,
  endpointPairPrivacyViolations,
  buildRouteEtaCapability,
  type ConditionModelStatusV0,
  type RouteEtaFreshnessStatusV0,
  type DurationBasisV0,
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
    duration: { durationSignalPresent: true, durationBasis: "external_route", durationScopeBounded: true },
    temporal: {
      departureTimeScoped: true,
      arrivalTargetScoped: true,
      timeBandScoped: true,
      evaluatedAtKnown: true,
      temporalFreshnessEvaluated: true,
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

const heuristicInput = (over: Partial<BuildRouteEtaCapabilityInput> = {}) =>
  baseInput({ duration: { durationSignalPresent: true, durationBasis: "heuristic", durationScopeBounded: false }, evidenceRefs: [], ...over });

// ── RD2d-a-A required ────────────────────────────────────────────────────────────────────

describe("RD2d-a-A #1/#2/#3 heuristic duration signal は projection/planning/leaveBy 不可", () => {
  it("heuristic → arrivalProjection/planning/leaveByComputable すべて false", () => {
    const cap = buildRouteEtaCapability(heuristicInput());
    expect(cap.duration.durationSignalPresent).toBe(true); // signal はある
    expect(cap.planning.arrivalProjectionKnown).toBe(false); // #2 projection 不可
    expect(cap.planning.timeEstimateUsableForPlanning).toBe(false); // #1 planning 不可
    expect(cap.leaveBy.leaveByComputable).toBe(false); // #3 leaveBy computation 不可
    expect(["internalReference", "debugOnly"]).toContain(cap.displayPolicy);
    expect(routeEtaCapabilityViolations(cap)).toEqual([]);
  });
});

describe("RD2d-a-A #4/#5 leaveByComputable は display/action eligibility でない・departure line を含意しない", () => {
  it("leaveByComputable=true でも displayPolicy は visible にならない（computable ⇏ display）", () => {
    const cap = buildRouteEtaCapability(baseInput());
    expect(cap.leaveBy.leaveByComputable).toBe(true);
    expect(cap.displayPolicy).not.toBe("visible"); // computable は display を grant しない
  });
  it("型に departure line / leaveByTime / displayEligible / actionEligible field がない（#5 departure line 不含意）", () => {
    const cap = buildRouteEtaCapability(baseInput());
    const leaveByKeys = Object.keys(cap.leaveBy).map((k) => k.toLowerCase());
    for (const f of ["departureline", "leavebytime", "departuretime", "displayeligible", "actioneligible", "nudge"]) {
      expect(leaveByKeys.includes(f)).toBe(false);
    }
  });
});

describe("RD2d-a-A #6 walking straight-line/static heuristic は planning usable でない", () => {
  it("walk + heuristic + static_assumption → projection/planning false（fail-closed allowlist）", () => {
    const cap = buildRouteEtaCapability(
      heuristicInput({
        identity: { ...baseInput().identity, transportMode: "walk", providerKind: "heuristic", providerVersion: "h" },
        condition: { conditionModelStatus: "static_assumption" },
      }),
    );
    expect(conditionAdequateForMode("walk", "static_assumption")).toBe(true); // condition は adequate
    expect(durationProjectionGradeOk("heuristic")).toBe(false); // だが duration grade が不可
    expect(cap.planning.arrivalProjectionKnown).toBe(false);
    expect(cap.planning.timeEstimateUsableForPlanning).toBe(false);
  });
});

describe("RD2d-a-A #7 walking route-shaped/static scoped duration は projection 候補", () => {
  it("walk + external_route(route-shaped) + static_assumption + scoped + fresh → projection true", () => {
    const cap = buildRouteEtaCapability(
      baseInput({
        identity: { ...baseInput().identity, transportMode: "walk", providerKind: "walk_router", providerVersion: "w1" },
        route: { transportModeKnown: true, routeShapeKnown: true, routeOptionKnown: false, providerKindKnown: true },
        duration: { durationSignalPresent: true, durationBasis: "external_route", durationScopeBounded: true },
        condition: { conditionModelStatus: "static_assumption" },
      }),
    );
    expect(cap.planning.arrivalProjectionKnown).toBe(true);
    expect(routeEtaCapabilityViolations(cap)).toEqual([]);
  });
});

describe("RD2d-a-A #8 user confirmed walking duration は scope 一致時のみ候補", () => {
  it("in-scope(fresh) → planning 可・scope mismatch(stale) → planning 不可", () => {
    const inScope = buildRouteEtaCapability(
      baseInput({
        identity: { ...baseInput().identity, transportMode: "walk", providerKind: "user", providerVersion: "u" },
        duration: { durationSignalPresent: true, durationBasis: "user_confirmed", durationScopeBounded: true },
        condition: { conditionModelStatus: "static_assumption" },
        evidenceRefs: [{ code: "u", capability: "duration", source: "user_confirmed" }],
      }),
    );
    expect(inScope.planning.timeEstimateUsableForPlanning).toBe(true);
    const mismatch = buildRouteEtaCapability(
      baseInput({
        identity: { ...baseInput().identity, transportMode: "walk", providerKind: "user", providerVersion: "u" },
        duration: { durationSignalPresent: true, durationBasis: "user_confirmed", durationScopeBounded: true },
        condition: { conditionModelStatus: "static_assumption" },
        freshness: { freshnessStatus: "stale", staleReason: "scope_mismatch", fetchedAtRef: "f", validUntilRef: "v" },
        evidenceRefs: [{ code: "u", capability: "duration", source: "user_confirmed" }],
      }),
    );
    expect(mismatch.planning.timeEstimateUsableForPlanning).toBe(false);
    expect(mismatch.leaveBy.leaveByComputable).toBe(false);
  });
});

describe("RD2d-a-A #9 raw coordinate / polyline leak guard（serialized・高精度 + 粗いペア + polyline）", () => {
  it("high-precision 単一座標 / 粗い lat,lng ペア / polyline をすべて検出", () => {
    const cap = buildRouteEtaCapability(baseInput());
    // 高精度単一（4 桁小数）
    const f1 = { ...cap, identity: { ...cap.identity, temporalScopeRef: "35.6895" } } as unknown as RouteEtaCapabilityV0;
    expect(routeEtaCapabilityViolations(f1).some((m) => m.includes("coordinate"))).toBe(true);
    // 粗い 2 桁小数の lat,lng ペア（COORD_PATTERN は逃すが COORD_PAIR_PATTERN が捕捉）
    const f2 = { ...cap, identity: { ...cap.identity, temporalScopeRef: "geo:35.68,139.70" } } as unknown as RouteEtaCapabilityV0;
    expect(routeEtaCapabilityViolations(f2).some((m) => m.includes("coordinate"))).toBe(true);
    // polyline / encodedPolyline token
    const f3 = { ...cap, encodedPolyline: "abc" } as unknown as RouteEtaCapabilityV0;
    expect(routeEtaCapabilityViolations(f3).some((m) => m.includes("encodedpolyline") || m.includes("raw token"))).toBe(true);
  });
});

describe("RD2d-a-A #10 legit safety field名は false-positive しない", () => {
  it("coordinatePrecisionPolicy / rawCoordinateLoggingProhibited を含む正常 cap が green", () => {
    const cap = buildRouteEtaCapability(baseInput());
    expect(cap.pairPrivacy.rawCoordinateLoggingProhibited).toBe(true);
    expect(cap.pairPrivacy.coordinatePrecisionPolicy).toBe("minimized");
    expect(routeEtaCapabilityViolations(cap)).toEqual([]); // legit field 名で誤検出しない
    // providerVersion の単一小数は COORD_PAIR を誤発火しない
    const cv = buildRouteEtaCapability(baseInput({ identity: { ...baseInput().identity, providerVersion: "12.34" } }));
    expect(routeEtaCapabilityViolations(cv).some((m) => m.includes("coordinate"))).toBe(false);
  });
});

// ── DAG hole closes（allowlist fail-closed・scope bounded） ──────────────────────────────────

describe("RD2d-a-A DAG: projection は ALLOWLIST（fail-closed・none/heuristic 不可）", () => {
  it("durationBasis 'none' は projection に登れない（fail-closed・誤 stamp 防御）", () => {
    expect(durationProjectionGradeOk("none")).toBe(false);
    const cap = buildRouteEtaCapability(
      baseInput({ duration: { durationSignalPresent: true, durationBasis: "none", durationScopeBounded: true }, evidenceRefs: [] }),
    );
    expect(cap.planning.arrivalProjectionKnown).toBe(false);
    expect(routeEtaCapabilityViolations(cap)).toEqual([]);
  });
  it("projection-grade allowlist = scheduled/user_confirmed/external_route/cached_route のみ", () => {
    expect(durationProjectionGradeOk("scheduled")).toBe(true);
    expect(durationProjectionGradeOk("user_confirmed")).toBe(true);
    expect(durationProjectionGradeOk("external_route")).toBe(true);
    expect(durationProjectionGradeOk("cached_route")).toBe(true);
    expect(durationProjectionGradeOk("heuristic")).toBe(false);
  });
  it("偽造: none basis で arrivalProjectionKnown true → violation", () => {
    const cap = buildRouteEtaCapability(
      baseInput({ duration: { durationSignalPresent: true, durationBasis: "none", durationScopeBounded: true }, evidenceRefs: [] }),
    );
    const forged: RouteEtaCapabilityV0 = { ...cap, planning: { ...cap.planning, arrivalProjectionKnown: true } };
    expect(routeEtaCapabilityViolations(forged).some((m) => m.includes("non-projection-grade"))).toBe(true);
  });
  it("durationScopeBounded false → projection 不可（scope hole 閉鎖）", () => {
    const cap = buildRouteEtaCapability(
      baseInput({ duration: { durationSignalPresent: true, durationBasis: "external_route", durationScopeBounded: false } }),
    );
    expect(cap.planning.arrivalProjectionKnown).toBe(false);
  });
});

// ── 既存 RD2d-a invariant（rename 反映） ────────────────────────────────────────────────────

describe("RD2d-a routeShape 独立 / mode condition / 分離 / conflict / pair（rename 反映）", () => {
  it("routeShape なしでも user_confirmed / scheduled duration 表現可", () => {
    const uc = buildRouteEtaCapability(
      baseInput({
        identity: { ...baseInput().identity, transportMode: "walk", providerKind: "user", providerVersion: "u" },
        route: { transportModeKnown: true, routeShapeKnown: false, routeOptionKnown: false, providerKindKnown: false },
        duration: { durationSignalPresent: true, durationBasis: "user_confirmed", durationScopeBounded: true },
        condition: { conditionModelStatus: "static_assumption" },
        evidenceRefs: [{ code: "u", capability: "duration", source: "user_confirmed" }],
      }),
    );
    expect(uc.route.routeShapeKnown).toBe(false);
    expect(routeEtaCapabilityViolations(uc)).toEqual([]);
  });
  it("conditionAdequateForMode: car=traffic / transit=schedule / unknown=不可", () => {
    expect(conditionAdequateForMode("car", "static_assumption")).toBe(false);
    expect(conditionAdequateForMode("transit", "schedule_aware")).toBe(true);
    expect(conditionAdequateForMode("transit", "traffic_aware")).toBe(false);
    for (const s of ["traffic_aware", "schedule_aware", "static_assumption"] as ConditionModelStatusV0[]) {
      expect(conditionAdequateForMode("unknown", s)).toBe(false);
    }
  });
  it("分離: duration→projection→planning→leaveBy（freshness/buffer/conflict）", () => {
    expect(buildRouteEtaCapability(baseInput({ freshness: { freshnessStatus: "stale", staleReason: "x", fetchedAtRef: "f", validUntilRef: "v" } })).planning.timeEstimateUsableForPlanning).toBe(false);
    expect(buildRouteEtaCapability(baseInput({ bufferKnown: false })).leaveBy.leaveByComputable).toBe(false);
    expect(
      buildRouteEtaCapability(
        baseInput({
          originConflict: { originConflictStatus: "conflict", originDiscrepancyRefs: ["x"], userConfirmedOriginPresent: false, currentObservationOverrodeConfirmed: false },
        }),
      ).leaveBy.leaveByComputable,
    ).toBe(false);
  });
  it("stale/expired → planning usable false", () => {
    for (const fs of ["stale", "expired"] as RouteEtaFreshnessStatusV0[]) {
      expect(buildRouteEtaCapability(baseInput({ freshness: { freshnessStatus: fs, staleReason: "x", fetchedAtRef: "f", validUntilRef: "v" } })).planning.timeEstimateUsableForPlanning).toBe(false);
    }
  });
  it("current 観測で user_confirmed origin 上書き → violation", () => {
    const cap = buildRouteEtaCapability(baseInput());
    const forged: RouteEtaCapabilityV0 = { ...cap, originConflict: { ...cap.originConflict, userConfirmedOriginPresent: true, currentObservationOverrodeConfirmed: true } };
    expect(routeEtaCapabilityViolations(forged).some((m) => m.includes("must not override user_confirmed origin"))).toBe(true);
  });
  it("endpoint pair: 片側 sensitive / current 観測 → external send 不可", () => {
    const s = buildRouteEtaCapability(baseInput({ pairPrivacyParts: { originEndpointSensitive: true, destinationEndpointSensitive: false, currentObservationInvolved: false, homeWorkDerivedInvolved: false } }));
    expect(s.pairPrivacy.pairExternalSendAllowed).toBe(false);
    expect(endpointPairPrivacyViolations(s.pairPrivacy)).toEqual([]);
    const cur = buildRouteEtaCapability(baseInput({ pairPrivacyParts: { originEndpointSensitive: false, destinationEndpointSensitive: false, currentObservationInvolved: true, homeWorkDerivedInvolved: false } }));
    expect(cur.pairPrivacy.eitherEndpointSensitive).toBe(true);
    expect(cur.pairPrivacy.pairExternalSendAllowed).toBe(false);
    const forged = { ...s.pairPrivacy, pairExternalSendAllowed: true, coordinatePrecisionPolicy: "minimized" as const };
    expect(endpointPairPrivacyViolations(forged).some((m) => m.includes("must not allow external send"))).toBe(true);
  });
  it("heuristic で leaveByComputable true 偽造 → violation", () => {
    const cap = buildRouteEtaCapability(heuristicInput());
    const forged: RouteEtaCapabilityV0 = { ...cap, leaveBy: { ...cap.leaveBy, leaveByComputable: true }, displayPolicy: "visible" };
    const v = routeEtaCapabilityViolations(forged);
    expect(v.some((m) => m.includes("heuristic must not yield leaveByComputable"))).toBe(true);
    expect(v.some((m) => m.includes("displayPolicy"))).toBe(true);
  });
  it("route/ETA field の mobility 混入 + mobility/route 名が capability 内に正しく存在", () => {
    const flags = deriveCapabilityFlagsFromParts({
      mode: "car", durationSignalPresent: true, durationBasis: "external_route", durationScopeBounded: true,
      departureTimeScoped: false, arrivalTargetScoped: false, temporalFreshnessEvaluated: false,
      conditionModelStatus: "traffic_aware", freshnessStatus: "fresh", originUsableForLeaveBy: true, bufferKnown: true, originConflictStatus: "none",
    });
    expect(flags.arrivalProjectionKnown).toBe(false); // temporal 未 scope → projection false
  });
});

// ── source scans ───────────────────────────────────────────────────────────────────────────

describe("RD2d-a #18 route/ETA provider import なし / #19 external/location/weather import なし / #20 IO green", () => {
  const read = () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/routeEtaCapability.ts"), "utf8");
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  };
  it("transport provider import なし", () => {
    const code = read();
    for (const bad of ["heuristicDistanceProvider", "cascadeOrchestrator", "unresolvedProvider", "manualUserProvider", "transportTypes", "GoogleRoutes", "TransportResolutionProvider"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
  it("外部取得 import なし", () => {
    const code = read();
    for (const bad of ["navigator", "geolocation", "getCurrentLocation", "captureLocation", "reverseGeocode", "fetchJma", "weatherApi", "googleapis", "maps.googleapis"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
  it("IO / write / 時刻 / 乱数なし", () => {
    const code = read();
    for (const bad of [".insert(", ".update(", ".delete(", ".upsert(", "service_role", "notification", "push(", "Date.now", "Math.random", "new Date(", "writeFile", "process.env", "fetch(", "supabase", "localStorage"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});
