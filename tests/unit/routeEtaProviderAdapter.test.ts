/**
 * routeEtaProviderAdapter（RD2d-b provider 出力 → RouteEtaCapabilityV0 pure 写像）— CEO 必須 25 fixtures
 * 正本: docs/reality-route-eta-provider-adapter-rd2d-b0.md / CEO RD2d-b 実装 GO
 *
 * 核: adapter は能力を上げない。必ず DAG(deriveCapabilityFlagsFromParts)+walker(routeEtaCapabilityViolations)経由。
 *   provider 未注入/failure/malformed → no_route_source。heuristic は durationSignalPresent 止まり。raw 不露出。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveRouteEtaCapability,
  routeEtaProviderResultViolations,
  routeEtaAdapterOutputViolations,
  type RouteEtaAdapterInputV0,
  type RouteEtaProvider,
  type RouteEtaProviderResultV0,
} from "@/lib/plan/realityCore/routeEtaProviderAdapter";

function baseInput(over: Partial<RouteEtaAdapterInputV0> = {}): RouteEtaAdapterInputV0 {
  return {
    originRef: { opaqueRef: "o1" },
    destinationRef: { opaqueRef: "d1" },
    targetNodeId: "ern-1",
    subjectiveDate: "2026-06-12",
    transportMode: "car",
    temporalScopeRef: "t1",
    routeOptionsRef: null,
    routeInputRevision: "r1",
    temporal: {
      departureTimeScoped: true,
      arrivalTargetScoped: true,
      timeBandScoped: true,
      evaluatedAtKnown: true,
      temporalFreshnessEvaluated: true,
    },
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
    subjectNodeId: "ern-1",
    ...over,
  };
}

function result(over: Partial<RouteEtaProviderResultV0> = {}): RouteEtaProviderResultV0 {
  return {
    status: "ok",
    providerKind: "external_route",
    providerVersion: "v1",
    durationBasis: "external_route",
    durationSignalPresent: true,
    durationScopeBounded: true,
    routeShapePresent: true,
    routeOptionPresent: false,
    conditionModelStatus: "traffic_aware",
    opaqueRouteRef: "opaque-route-1",
    freshnessStatus: "fresh",
    ...over,
  };
}

const provider = (r: RouteEtaProviderResultV0): RouteEtaProvider => async () => r;

describe("RD2d-b #1/#2 provider 未注入 / failure → no_route_source", () => {
  it("provider 未注入 → no_route_source・not_injected", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), {});
    expect(o.stage).toBe("no_route_source");
    expect(o.failureReason).toBe("not_injected");
    expect(o.capability?.duration.durationSignalPresent).toBe(false);
    expect(routeEtaAdapterOutputViolations(o)).toEqual([]);
  });
  it("provider failure → no_route_source・provider_failed", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ status: "failed" })) });
    expect(o.stage).toBe("no_route_source");
    expect(o.failureReason).toBe("provider_failed");
  });
});

describe("RD2d-b #3 malformed provider result → fail-safe / violation", () => {
  it("invalid durationBasis → malformed → no_route_source", async () => {
    const bad = { ...result(), durationBasis: "WAT" } as unknown as RouteEtaProviderResultV0;
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(bad) });
    expect(o.stage).toBe("no_route_source");
    expect(o.failureReason).toBe("malformed_result");
    expect(o.violations.length).toBeGreaterThan(0);
  });
  it("routeEtaProviderResultViolations が enum/raw を検出", () => {
    expect(routeEtaProviderResultViolations(result())).toEqual([]);
    const leak = result({ opaqueRouteRef: "geo:35.6895,139.7006" });
    expect(routeEtaProviderResultViolations(leak).some((m) => m.includes("coordinate") || m.includes("raw token"))).toBe(true);
  });
});

describe("RD2d-b #4 durationBasis unknown/none → projection 不可", () => {
  it("durationBasis none → no_route_source(basis_unknown)", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ durationBasis: "none" })) });
    expect(o.stage).toBe("no_route_source");
    expect(o.failureReason).toBe("basis_unknown");
  });
});

describe("RD2d-b #5/#6/#7/#8 heuristic result → durationSignalPresent のみ・上位すべて false", () => {
  it("heuristic → signal only・projection/planning/leaveBy false・displayPolicy internalReference", async () => {
    const o = await resolveRouteEtaCapability(
      baseInput(),
      { provider: provider(result({ providerKind: "heuristic_distance", durationBasis: "heuristic", routeShapePresent: false, conditionModelStatus: "static_assumption" })) },
    );
    expect(o.stage).toBe("duration_signal_only");
    expect(o.capability?.duration.durationSignalPresent).toBe(true); // #5
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(false); // #6
    expect(o.capability?.planning.timeEstimateUsableForPlanning).toBe(false); // #7
    expect(o.capability?.leaveBy.leaveByComputable).toBe(false); // #8
    expect(["internalReference", "debugOnly"]).toContain(o.capability?.displayPolicy);
    expect(routeEtaAdapterOutputViolations(o)).toEqual([]);
  });
});

describe("RD2d-b #9 provider が duration を返しても allowlist 外なら projection 不可", () => {
  it("heuristic basis は durationProjectionGradeOk 外 → projection false", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ durationBasis: "heuristic" })) });
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(false);
  });
});

describe("RD2d-b #10 condition adequate だけでは projection 不可", () => {
  it("car + traffic_aware だが scope/temporal 不足 → projection false", async () => {
    const o = await resolveRouteEtaCapability(
      baseInput({ temporal: { departureTimeScoped: false, arrivalTargetScoped: false, timeBandScoped: false, evaluatedAtKnown: false, temporalFreshnessEvaluated: false } }),
      { provider: provider(result()) },
    );
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(false);
  });
});

describe("RD2d-b #11 durationScopeBounded なしでは projection 不可", () => {
  it("scope bounded false → projection false", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ durationScopeBounded: false })) });
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(false);
  });
});

describe("RD2d-b #12 stale freshness では planning usable false", () => {
  it("freshness stale → planning false", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ freshnessStatus: "stale" })) });
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(true); // projection は立つ
    expect(o.capability?.planning.timeEstimateUsableForPlanning).toBe(false); // planning は stale で落ちる
  });
});

describe("RD2d-b #13 user_confirmed duration scope mismatch で planning false", () => {
  it("user_confirmed + stale(scope mismatch) → planning false", async () => {
    const o = await resolveRouteEtaCapability(
      baseInput({ transportMode: "walk" }),
      { provider: provider(result({ providerKind: "user_manual", durationBasis: "user_confirmed", conditionModelStatus: "static_assumption", freshnessStatus: "stale" })) },
    );
    expect(o.capability?.planning.timeEstimateUsableForPlanning).toBe(false);
  });
});

describe("RD2d-b #14 external_route + car + traffic_aware + bounded + fresh → projection candidate", () => {
  it("全条件 → arrivalProjectionKnown true・resolved", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result()) });
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(true);
    expect(o.stage).toBe("resolved");
    expect(o.resolved).toBe(true);
    expect(routeEtaAdapterOutputViolations(o)).toEqual([]);
  });
});

describe("RD2d-b #15 walking route-shaped/static scoped → projection candidate", () => {
  it("walk + external_route(route-shaped) + static_assumption + scoped + fresh → projection true", async () => {
    const o = await resolveRouteEtaCapability(
      baseInput({ transportMode: "walk" }),
      { provider: provider(result({ providerKind: "external_route", durationBasis: "external_route", conditionModelStatus: "static_assumption" })) },
    );
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(true);
  });
});

describe("RD2d-b #16 transit scheduled scoped → projection candidate", () => {
  it("transit + scheduled + schedule_aware + scoped + fresh → projection true", async () => {
    const o = await resolveRouteEtaCapability(
      baseInput({ transportMode: "transit" }),
      { provider: provider(result({ providerKind: "transit_schedule", durationBasis: "scheduled", routeShapePresent: false, conditionModelStatus: "schedule_aware" })) },
    );
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(true);
  });
});

describe("RD2d-b #17 provider overclaim を walker で検出", () => {
  it("provider が high confidence を主張しても、scope/temporal 不足なら adapter は projection を立てない", async () => {
    // provider は ok+scoped を主張するが temporal が不足 → DAG が projection を落とす（adapter は信用しない）
    const o = await resolveRouteEtaCapability(
      baseInput({ temporal: { departureTimeScoped: false, arrivalTargetScoped: false, timeBandScoped: false, evaluatedAtKnown: false, temporalFreshnessEvaluated: false } }),
      { provider: provider(result({ durationScopeBounded: true })) },
    );
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(false);
    expect(o.resolved).toBe(false);
    expect(routeEtaAdapterOutputViolations(o)).toEqual([]); // adapter 出力は整合（overclaim を昇格していない）
  });
});

describe("RD2d-b #18/#19 raw route data が output に出ない・opaque ref のみ", () => {
  it("output JSON に raw 座標/polyline/waypoints/route response なし（opaqueRouteRef も載らない）", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ opaqueRouteRef: "opaque-route-xyz" })) });
    const json = JSON.stringify(o).toLowerCase();
    for (const t of ["latitude", "longitude", "polyline", "encodedpolyline", "waypoints", "routeresponse", "coordinates", "opaque-route-xyz"]) {
      expect(json.includes(t)).toBe(false); // opaqueRouteRef すら capability に載せない
    }
  });
  it("provider が opaqueRouteRef に座標を入れても adapter は no_route_source に倒す", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ opaqueRouteRef: "35.6895,139.7006" })) });
    expect(o.stage).toBe("no_route_source");
    expect(o.failureReason).toBe("malformed_result");
  });
});

describe("RD2d-b #20 missingInputRefs を heuristic で消さない", () => {
  it("heuristic → route_missing/eta_source_missing/leaveBy_missing が残る", async () => {
    const o = await resolveRouteEtaCapability(
      baseInput(),
      { provider: provider(result({ providerKind: "heuristic_distance", durationBasis: "heuristic", routeShapePresent: false, conditionModelStatus: "static_assumption" })) },
    );
    const codes = (o.capability?.missingInputs ?? []).map((m) => m.code);
    expect(codes).toContain("route_missing");
    expect(codes).toContain("eta_source_missing");
    expect(codes).toContain("leaveBy_missing");
  });
});

describe("RD2d-b #21 routeEtaCapabilityViolations と adapter violations 両方走る", () => {
  it("resolved output は capability walker green かつ adapter output 整合", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result()) });
    expect(routeEtaAdapterOutputViolations(o)).toEqual([]); // 内部で routeEtaCapabilityViolations を呼ぶ
  });
});

describe("RD2d-b #22 cascade/heuristic provider/external/currentLocation import なし（source-scan）", () => {
  it("routeEtaProviderAdapter.ts に provider 実装/外部 import なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/routeEtaProviderAdapter.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of [
      "heuristicDistanceProvider",
      "cascadeOrchestrator",
      "unresolvedProvider",
      "manualUserProvider",
      "transportTypes",
      "GoogleRoutes",
      "navigator",
      "geolocation",
      "getCurrentLocation",
      "googleapis",
      "fetchJma",
      "weatherApi",
      "movementReality",
      "compileMovementReality",
    ]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RD2d-b #23 IO source-scan green", () => {
  it("routeEtaProviderAdapter.ts に write/時刻/乱数/IO なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/routeEtaProviderAdapter.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of [".insert(", ".update(", ".delete(", ".upsert(", "service_role", "notification", "push(", "Date.now", "Math.random", "new Date(", "writeFile", "process.env", "fetch(", "supabase", "localStorage"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});
