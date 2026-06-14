/**
 * routeEtaProviderAdapter（RD2d-b provider 出力 → RouteEtaCapabilityV0 pure 写像）— CEO 必須 25 fixtures
 * 正本: docs/reality-route-eta-provider-adapter-rd2d-b0.md / CEO RD2d-b 実装 GO
 *
 * 核: adapter は能力を上げない。必ず DAG(deriveCapabilityFlagsFromParts)+walker(routeEtaCapabilityViolations)経由。
 *   provider 未注入/failure/malformed → no_route_source。heuristic は durationSignalPresent 止まり。raw 不露出。
 *
 * CEO 必須 25 項目 → test 対応表（RD2d-b-A で形式化）:
 *   #1 provider 未注入→no_route        → "RD2d-b #1/#2"（it: 未注入）
 *   #2 provider failure→no_route       → "RD2d-b #1/#2"（it: failure）
 *   #3 malformed→fail-safe/violation   → "RD2d-b #3"（2 it）+ "RD2d-b-A"（malformed_enum）
 *   #4 basis unknown/none→projection 不可 → "RD2d-b #4"
 *   #5 heuristic→signal のみ            → "RD2d-b #5/#6/#7/#8"
 *   #6 heuristic→projection false       → "RD2d-b #5/#6/#7/#8"
 *   #7 heuristic→planning false         → "RD2d-b #5/#6/#7/#8"
 *   #8 heuristic→leaveByComputable false→ "RD2d-b #5/#6/#7/#8"
 *   #9 duration 返しても allowlist 外→不可 → "RD2d-b #9"
 *   #10 condition だけでは projection 不可 → "RD2d-b #10"
 *   #11 scope bounded なし→projection 不可 → "RD2d-b #11" + "RD2d-b-A"（origin/dest なし）
 *   #12 stale→planning false            → "RD2d-b #12" + "RD2d-b-A"（fresh unsubstantiated）
 *   #13 user_confirmed scope mismatch→planning false → "RD2d-b #13"
 *   #14 external+car+traffic+bounded+fresh→projection → "RD2d-b #14"
 *   #15 walking route-shaped scoped→projection → "RD2d-b #15"
 *   #16 transit scheduled scoped→projection → "RD2d-b #16"
 *   #17 provider overclaim→walker 検出   → "RD2d-b #17"
 *   #18 raw route data が output に出ない → "RD2d-b #18/#19"（it 1）+ "RD2d-b-A"（raw echo）
 *   #19 opaque ref のみ                  → "RD2d-b #18/#19"（opaque trace は route evidence のみ）
 *   #20 missingInputRefs を heuristic で消さない → "RD2d-b #20"
 *   #21 capability + adapter violations 両方走る → "RD2d-b #21" + 各 it の routeEtaAdapterOutputViolations
 *   #22 cascade/external/currentLocation import なし → "RD2d-b #22"
 *   #23 IO source-scan green             → "RD2d-b #23"
 *   #24 RD2 targeted tests pass          → 別実行（106→112/112）
 *   #25 tsc baseline 55 維持             → 別実行（npx tsc）
 *   追加(RD2d-b-A): provider self-claim 防御（freshness basis / scope corroboration / route evidence /
 *     malformed reason 分類 / raw echo redaction）→ "RD2d-b-A 自己検証" block。
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
    freshnessBasisRef: "fb1", // substantiated fresh（RD2d-b-A: basis 無しの fresh は stale へ downgrade）
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
    expect(o.failureReason).toBe("malformed_enum"); // 非 raw enum 違反は malformed_enum（RD2d-b-A 分類）
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
    // heuristic は coherent な static_assumption + routeShape なし（RD2d-a-B coherence guard）
    const o = await resolveRouteEtaCapability(
      baseInput(),
      { provider: provider(result({ providerKind: "heuristic_distance", durationBasis: "heuristic", routeShapePresent: false, conditionModelStatus: "static_assumption" })) },
    );
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(false);
    expect(o.capability?.duration.durationSignalPresent).toBe(true);
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

describe("RD2d-b #18/#19 raw route data が output に出ない・opaque ref は internal evidence のみ", () => {
  it("output JSON に raw 座標/polyline/waypoints/route response なし（opaqueRouteRef は opaque trace として route evidence にのみ）", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ opaqueRouteRef: "opaque-route-xyz" })) });
    const json = JSON.stringify(o).toLowerCase();
    for (const t of ["latitude", "longitude", "polyline", "encodedpolyline", "waypoints", "routeresponse", "coordinates"]) {
      expect(json.includes(t)).toBe(false); // raw route data は出さない
    }
    // opaqueRouteRef は raw でなく opaque trace → route evidenceRef に残る（auditability・RD2d-b-A）
    const routeEv = (o.capability?.evidenceRefs ?? []).filter((e) => e.capability === "route");
    expect(routeEv.length).toBeGreaterThan(0);
    expect(routeEv.some((e) => e.code.includes("opaque-route-xyz"))).toBe(true);
  });
  it("provider が opaqueRouteRef に座標を入れても adapter は no_route_source(raw_route_data_detected)に倒す", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ opaqueRouteRef: "35.6895,139.7006" })) });
    expect(o.stage).toBe("no_route_source");
    expect(o.failureReason).toBe("raw_route_data_detected"); // 独立 loud reason（benign に丸めない）
    // raw 値そのものは violation にも出ない（INV-NO-RAW-ECHO）
    expect(o.violations.some((v) => v.includes("35.6895"))).toBe(false);
    expect(routeEtaAdapterOutputViolations(o)).toEqual([]);
  });
});

describe("RD2d-b-A 自己検証: provider self-claim を信用しきらない（4 レンズ監査 wf_c8839639 反映）", () => {
  it("freshnessStatus fresh だが basis ref なし → stale へ downgrade → planning false", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ freshnessStatus: "fresh", freshnessBasisRef: null })) });
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(true); // projection は立つ（freshness 非依存）
    expect(o.capability?.planning.timeEstimateUsableForPlanning).toBe(false); // fresh が unsubstantiated → planning に上げない
    expect(o.capability?.freshness.freshnessStatus).toBe("stale"); // downgrade されている
    expect(o.capability?.leaveBy.leaveByComputable).toBe(false); // planning 不可 → leaveBy も不可
  });
  it("freshnessBasisRef あり fresh は planning に上げてよい（基準あり）", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ freshnessStatus: "fresh", freshnessBasisRef: "fb1" })) });
    expect(o.capability?.planning.timeEstimateUsableForPlanning).toBe(true);
    expect(o.capability?.freshness.fetchedAtRef).toBe("fb1"); // basis を trace に保持
  });
  it("durationScopeBounded claim でも origin/dest が無ければ scope を信じない → projection false", async () => {
    const o = await resolveRouteEtaCapability(
      baseInput({ originRef: null }),
      { provider: provider(result({ durationScopeBounded: true })) },
    );
    expect(o.capability?.planning.arrivalProjectionKnown).toBe(false);
  });
  it("routeShapeKnown は route evidenceRef を要求（forged: route flag だが evidence なし → violation）", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ routeShapePresent: true })) });
    expect(o.capability?.evidenceRefs.some((e) => e.capability === "route")).toBe(true); // 正常時は route evidence あり
    const forged = {
      ...o,
      capability: o.capability ? { ...o.capability, evidenceRefs: o.capability.evidenceRefs.filter((e) => e.capability !== "route") } : null,
    } as typeof o;
    expect(routeEtaAdapterOutputViolations(forged).some((m) => m.includes("routeShapeKnown requires a route evidenceRef"))).toBe(true);
  });
  it("malformed enum(非 raw) は malformed_enum・raw-leak とは別 reason", async () => {
    const bad = { ...result(), durationBasis: "WAT" } as unknown as RouteEtaProviderResultV0;
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(bad) });
    expect(o.failureReason).toBe("malformed_enum");
    expect(o.violations.length).toBeGreaterThan(0);
  });
  it("enum field に座標を詰めても violation message は raw 値を echo しない（redact）", async () => {
    const bad = { ...result(), durationBasis: "35.6895,139.7006" } as unknown as RouteEtaProviderResultV0;
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(bad) });
    expect(o.failureReason).toBe("raw_route_data_detected"); // leak が enum より優先
    expect(o.violations.join(" ").includes("35.6895")).toBe(false); // redact 済
    expect(o.violations.some((v) => v.includes("redacted"))).toBe(true);
    expect(routeEtaAdapterOutputViolations(o)).toEqual([]); // echo guard も green
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
