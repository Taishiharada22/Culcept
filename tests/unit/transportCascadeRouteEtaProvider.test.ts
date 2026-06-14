/**
 * transportCascadeRouteEtaProvider（RD2d-c 既存 cascade → RouteEtaProvider 翻訳 wrapper）— CEO 必須 25 fixtures
 * 正本: docs/reality-transport-cascade-consume-rd2d-c0.md / CEO RD2d-c 実装 GO
 *
 * 核: wrapper は翻訳層（能力判定しない）。cascade は依存注入。private 座標は wrapper にとって opaque。
 *   localHeuristicAllowed gate・heuristic 正直 stamp・unresolved/manual shell は no_route・raw 不露出。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveTransportCascadeProvider,
  createTransportCascadeRouteEtaProvider,
  transportCascadeProviderInputViolations,
  transportCascadeProviderResultViolations,
  type TransportCascadeRouteEtaProviderInputV0,
  type TransportCascadeProviderDepsV0,
  type TransportCascadePrivateCoordinateInputV0,
  type LocalHeuristicResultV0,
} from "@/lib/plan/realityCore/transportCascadeRouteEtaProvider";
import {
  resolveRouteEtaCapability,
  routeEtaProviderResultViolations,
  routeEtaAdapterOutputViolations,
} from "@/lib/plan/realityCore/routeEtaProviderAdapter";

const OPTIONS = { providerVersion: "cascade-v0" };
const PRIV: TransportCascadePrivateCoordinateInputV0 = { kind: "private_coordinate_bearing", opaqueHandle: "priv-h1" };

function input(over: Partial<TransportCascadeRouteEtaProviderInputV0> = {}): TransportCascadeRouteEtaProviderInputV0 {
  return {
    originRef: { opaqueRef: "o1" },
    destinationRef: { opaqueRef: "d1" },
    targetNodeId: "ern-1",
    subjectiveDate: "2026-06-12",
    transportMode: "walk",
    temporalScopeRef: "t1",
    routeOptionsRef: null,
    routeInputRevision: "r1",
    temporal: { departureTimeScoped: true, arrivalTargetScoped: true, timeBandScoped: true, evaluatedAtKnown: true, temporalFreshnessEvaluated: true },
    originUsableForLeaveBy: true,
    bufferKnown: true,
    originConflict: { originConflictStatus: "none", originDiscrepancyRefs: [], userConfirmedOriginPresent: false, currentObservationOverrodeConfirmed: false },
    pairPrivacyParts: { originEndpointSensitive: false, destinationEndpointSensitive: false, currentObservationInvolved: false, homeWorkDerivedInvolved: false },
    subjectNodeId: "ern-1",
    ...over,
  };
}

function deps(over: Partial<TransportCascadeProviderDepsV0> = {}): TransportCascadeProviderDepsV0 {
  return {
    resolvePrivateCoordinates: async () => PRIV,
    runLocalHeuristic: async (): Promise<LocalHeuristicResultV0> => ({ durationSignalPresent: true, opaqueRouteRef: "opaque-route-h" }),
    ...over,
  };
}

const sensitive = (k: "originEndpointSensitive" | "currentObservationInvolved" | "homeWorkDerivedInvolved") =>
  input({ pairPrivacyParts: { originEndpointSensitive: false, destinationEndpointSensitive: false, currentObservationInvolved: false, homeWorkDerivedInvolved: false, [k]: true } });

describe("RD2d-c #1 no private coordinate input → no_route_source", () => {
  it("resolvePrivateCoordinates null → no_route", async () => {
    const { result, trace } = await resolveTransportCascadeProvider(input(), deps({ resolvePrivateCoordinates: async () => null }), OPTIONS);
    expect(result.status).toBe("no_route");
    expect(result.durationSignalPresent).toBe(false);
    expect(trace.stage).toBe("no_private_input");
  });
});

describe("RD2d-c #2/#3 localHeuristicAllowed gate", () => {
  it("#2 localHeuristicAllowed false → heuristic provider を呼ばない", async () => {
    let called = 0;
    const d = deps({ runLocalHeuristic: async () => { called += 1; return { durationSignalPresent: true, opaqueRouteRef: "x" }; } });
    const { result, trace } = await resolveTransportCascadeProvider(sensitive("originEndpointSensitive"), d, OPTIONS);
    expect(called).toBe(0); // heuristic 未呼出
    expect(result.status).toBe("no_route");
    expect(trace.stage).toBe("local_heuristic_blocked");
  });
  it("#3 pairExternalSendAllowed false(sensitive)だけでは localHeuristicAllowed true にならない", async () => {
    // sensitive → external 不可 かつ local も不可（local が勝手に true にならない）
    const { result } = await resolveTransportCascadeProvider(sensitive("originEndpointSensitive"), deps(), OPTIONS);
    expect(result.status).toBe("no_route");
  });
});

describe("RD2d-c #4/#5/#6 sensitive endpoint で localHeuristicAllowed false 寄り", () => {
  it("#4 currentObservation → no_route", async () => {
    expect((await resolveTransportCascadeProvider(sensitive("currentObservationInvolved"), deps(), OPTIONS)).result.status).toBe("no_route");
  });
  it("#5 home/work inferred → no_route", async () => {
    expect((await resolveTransportCascadeProvider(sensitive("homeWorkDerivedInvolved"), deps(), OPTIONS)).result.status).toBe("no_route");
  });
  it("#6 sensitive endpoint → no_route", async () => {
    expect((await resolveTransportCascadeProvider(sensitive("originEndpointSensitive"), deps(), OPTIONS)).result.status).toBe("no_route");
  });
  it("非 sensitive → heuristic 実行", async () => {
    expect((await resolveTransportCascadeProvider(input(), deps(), OPTIONS)).result.status).toBe("ok");
  });
});

describe("RD2d-c #7 unresolved heuristic result → no_route_source", () => {
  it("runLocalHeuristic null → no_route", async () => {
    const { result, trace } = await resolveTransportCascadeProvider(input(), deps({ runLocalHeuristic: async () => null }), OPTIONS);
    expect(result.status).toBe("no_route");
    expect(trace.stage).toBe("heuristic_unresolved");
  });
});

describe("RD2d-c #8/#9/#10/#11/#12 heuristic provider result の正規化", () => {
  it("durationBasis heuristic / signal true / routeShape false / static_assumption / raw なし", async () => {
    const { result } = await resolveTransportCascadeProvider(input(), deps(), OPTIONS);
    expect(result.durationBasis).toBe("heuristic"); // #8
    expect(result.durationSignalPresent).toBe(true); // #9
    expect(result.routeShapePresent).toBe(false); // #10
    expect(result.conditionModelStatus).toBe("static_assumption"); // #11
    // #12 no raw coords / no distance raw / no polyline
    const json = JSON.stringify(result).toLowerCase();
    for (const t of ["latitude", "longitude", "polyline", "waypoints", "coordinates"]) expect(json.includes(t)).toBe(false);
    expect(transportCascadeProviderResultViolations(result)).toEqual([]);
  });
});

describe("RD2d-c #13/#14 manualUserProvider shell / 確認 evidence なしでは user_confirmed にしない", () => {
  it("wrapper は user_confirmed basis を一切 emit しない（heuristic か no_route のみ）", async () => {
    const ok = await resolveTransportCascadeProvider(input(), deps(), OPTIONS);
    expect(ok.result.durationBasis).not.toBe("user_confirmed");
    const blocked = await resolveTransportCascadeProvider(input(), deps({ runLocalHeuristic: async () => null }), OPTIONS);
    expect(blocked.result.durationBasis).not.toBe("user_confirmed");
    expect(["heuristic", "none"]).toContain(ok.result.durationBasis);
  });
});

describe("RD2d-c #15/#16 malformed/privacy → no_route + safe violation", () => {
  it("#15 malformed heuristic(forged routeShape) → result violations が検出", async () => {
    const { result } = await resolveTransportCascadeProvider(input(), deps(), OPTIONS);
    const forged = { ...result, routeShapePresent: true };
    expect(transportCascadeProviderResultViolations(forged).some((m) => m.includes("routeShapePresent"))).toBe(true);
  });
  it("#16 privacy guard NG(sensitive) → no_route", async () => {
    expect((await resolveTransportCascadeProvider(sensitive("originEndpointSensitive"), deps(), OPTIONS)).result.status).toBe("no_route");
  });
});

describe("RD2d-c #17/#18 RD2d-b 連携", () => {
  it("#17 wrapper result は RD2d-b provider result violations を通る", async () => {
    const { result } = await resolveTransportCascadeProvider(input(), deps(), OPTIONS);
    expect(routeEtaProviderResultViolations(result)).toEqual([]);
  });
  it("#18 RD2d-b adapter に注入 → DAG/walker を通り heuristic は signal 止まり", async () => {
    const provider = createTransportCascadeRouteEtaProvider(deps(), OPTIONS);
    const o = await resolveRouteEtaCapability(input(), { provider });
    expect(o.capability?.duration.durationSignalPresent).toBe(true);
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(false); // heuristic → projection 不可
    expect(o.stage).toBe("duration_signal_only");
    expect(routeEtaAdapterOutputViolations(o)).toEqual([]);
  });
  it("#18 sensitive で wrapper no_route → adapter no_route_source", async () => {
    const provider = createTransportCascadeRouteEtaProvider(deps(), OPTIONS);
    const o = await resolveRouteEtaCapability(sensitive("currentObservationInvolved"), { provider });
    expect(o.stage).toBe("no_route_source");
  });
});

describe("RD2d-c #19/#20 raw 不露出 / no raw echo", () => {
  it("#19 raw coordinate/polyline/waypoints/route response が serialize されない", async () => {
    const { result, trace } = await resolveTransportCascadeProvider(input(), deps(), OPTIONS);
    const json = JSON.stringify({ result, trace }).toLowerCase();
    for (const t of ["latitude", "longitude", "polyline", "encodedpolyline", "waypoints", "routeresponse", "coordinates", "priv-h1"]) {
      expect(json.includes(t)).toBe(false); // private handle すら result/trace に出さない
    }
  });
  it("#20 public input が opaque-only / violation が raw を echo しない", () => {
    expect(transportCascadeProviderInputViolations(input())).toEqual([]);
    // 万一 public input に座標が混入したら検出（message は token 名/定数のみ）
    const bad = { ...input(), temporalScopeRef: "35.6895,139.7006" };
    const v = transportCascadeProviderInputViolations(bad);
    expect(v.length).toBeGreaterThan(0);
    expect(v.join(" ").includes("35.6895")).toBe(false); // 座標値を echo しない
  });
});

describe("RD2d-c #21/#22/#23 import scan", () => {
  const read = () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/transportCascadeRouteEtaProvider.ts"), "utf8");
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  };
  it("#21 external API / Google Routes / cascade 実装 import なし", () => {
    const code = read();
    for (const bad of ["heuristicDistanceProvider", "cascadeOrchestrator", "unresolvedProvider", "manualUserProvider", "GoogleRoutes", "googleapis", "maps.googleapis"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
  it("#22 currentLocation / geolocation / weather import なし", () => {
    const code = read();
    for (const bad of ["navigator", "geolocation", "getCurrentLocation", "captureLocation", "reverseGeocode", "fetchJma", "weatherApi"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
  it("#23 RC2a / MovementReality import なし + IO なし", () => {
    const code = read();
    for (const bad of ["movementReality", "compileMovementReality", "assembleRealityGraph", ".insert(", ".update(", "service_role", "notification", "push(", "Date.now", "Math.random", "new Date(", "supabase", "localStorage", "fetch("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});
