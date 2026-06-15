/**
 * routeEtaDurationValue（RD2d-b-VALUE: internal-only duration value channel）— CEO 必須 26 cases
 * 正本: docs/reality-route-eta-duration-value-rd2d-b-value-0.md
 *
 * 核: capability=flag-only / value=server-only 計算燃料。二鍵（capability flag + full basis binding）が
 * 揃わなければ leaveBy に使えない。stored は rounded safe upper bound（pre-ceil raw 非保持）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPlanningGradeDurationValue,
  createUnusableDurationValue,
  durationValueViolations,
  bindDurationValueToCapability,
  buildDurationValueBinding,
  deriveDurationValueFromProviderResult,
  isAllowedDurationValueBasis,
  type PlanningGradeDurationValueV0,
  type DurationValueDraftV0,
  type DurationValueScopeV0,
  type DurationValueFreshnessV0,
} from "@/lib/plan/realityCore/routeEtaDurationValue";
import {
  resolveRouteEtaCapability,
  routeEtaAdapterOutputViolations,
  type RouteEtaAdapterInputV0,
  type RouteEtaProvider,
  type RouteEtaProviderResultV0,
} from "@/lib/plan/realityCore/routeEtaProviderAdapter";
import { buildRouteEtaCapability, type RouteEtaCapabilityV0 } from "@/lib/plan/realityCore/routeEtaCapability";

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────

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
    temporal: { departureTimeScoped: true, arrivalTargetScoped: true, timeBandScoped: true, evaluatedAtKnown: true, temporalFreshnessEvaluated: true },
    originUsableForLeaveBy: true,
    bufferKnown: true,
    originConflict: { originConflictStatus: "none", originDiscrepancyRefs: [], userConfirmedOriginPresent: false, currentObservationOverrodeConfirmed: false },
    pairPrivacyParts: { originEndpointSensitive: false, destinationEndpointSensitive: false, currentObservationInvolved: false, homeWorkDerivedInvolved: false },
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
    freshnessBasisRef: "fb1",
    durationMinutesRaw: 23, // fractional/非 5 分 → ceil 25
    durationLowerMinutesRaw: null,
    ...over,
  };
}

const provider = (r: RouteEtaProviderResultV0): RouteEtaProvider => async () => r;

// capability を直接組む（value 単体テスト用）。planningUsable=true な健全 capability
function freshCapability(over: Partial<RouteEtaProviderResultV0> = {}): RouteEtaCapabilityV0 {
  const r = result(over);
  return buildRouteEtaCapability({
    identity: {
      originRef: { opaqueRef: "o1" },
      destinationRef: { opaqueRef: "d1" },
      targetNodeId: "ern-1",
      subjectiveDate: "2026-06-12",
      transportMode: "car",
      temporalScopeRef: "t1",
      providerKind: r.providerKind,
      providerVersion: r.providerVersion,
      routeOptionsRef: null,
      routeInputRevision: "r1",
    },
    route: { transportModeKnown: true, routeShapeKnown: true, routeOptionKnown: false, providerKindKnown: true },
    duration: { durationSignalPresent: true, durationBasis: r.durationBasis, durationScopeBounded: true },
    temporal: { departureTimeScoped: true, arrivalTargetScoped: true, timeBandScoped: true, evaluatedAtKnown: true, temporalFreshnessEvaluated: true },
    condition: { conditionModelStatus: r.conditionModelStatus },
    freshness: { freshnessStatus: "fresh", staleReason: null, fetchedAtRef: "fb1", validUntilRef: null },
    originUsableForLeaveBy: true,
    bufferKnown: true,
    originConflict: { originConflictStatus: "none", originDiscrepancyRefs: [], userConfirmedOriginPresent: false, currentObservationOverrodeConfirmed: false },
    pairPrivacyParts: { originEndpointSensitive: false, destinationEndpointSensitive: false, currentObservationInvolved: false, homeWorkDerivedInvolved: false },
    evidenceRefs: [{ code: `provider:${r.durationBasis}`, capability: "duration", source: r.durationBasis }],
    subjectNodeId: "ern-1",
  });
}

const scope = (over: Partial<DurationValueScopeV0> = {}): DurationValueScopeV0 => ({
  scopeBounded: true,
  originRef: "o1",
  destinationRef: "d1",
  temporalScopeRef: "t1",
  transportMode: "car",
  ...over,
});
const fresh = (over: Partial<DurationValueFreshnessV0> = {}): DurationValueFreshnessV0 => ({
  freshnessStatus: "fresh",
  freshnessRef: "fb1",
  validUntilRef: null,
  ...over,
});
function draft(over: Partial<DurationValueDraftV0> = {}): DurationValueDraftV0 {
  return {
    basis: "external_route",
    kind: "point",
    rawUpperMinutes: 23,
    rawLowerMinutes: null,
    scope: scope(),
    freshness: fresh(),
    binding: buildDurationValueBinding(freshCapability()),
    evidenceRefs: [{ code: "provider:external_route", capability: "duration", source: "external_route" }],
    capabilityPlanningUsable: true,
    ...over,
  };
}

// ── #1/#2 capability/value 分離・sibling return ───────────────────────────────────────────────

describe("RD2d-b-VALUE #1/#2 capability は flag-only / value は sibling", () => {
  it("#1 capability に duration value が nest されない（flag-only 維持）", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result()) });
    const capJson = JSON.stringify(o.capability);
    expect(capJson.includes("durationUpperBoundMinutes")).toBe(false);
    expect(capJson.includes("usableForLeaveByComputation")).toBe(false);
    expect(capJson.includes("\"binding\"")).toBe(false);
  });
  it("#2 adapter output は durationValue を sibling として返す", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result()) });
    expect(o).toHaveProperty("durationValue");
    expect(o.durationValue).not.toBeNull();
    expect(o.durationValue?.durationUpperBoundMinutes).toBe(25); // 23 → ceil 25
    expect(routeEtaAdapterOutputViolations(o)).toEqual([]);
  });
});

// ── #3/#4 二鍵: capability planning ───────────────────────────────────────────────────────────

describe("RD2d-b-VALUE #3/#4 capability planning と value usable の二鍵", () => {
  it("#3 capability planning false（stale）→ provider duration があっても value unusable（null でない）", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ freshnessStatus: "stale", freshnessBasisRef: null })) });
    expect(o.capability?.planning.timeEstimateUsableForPlanning).toBe(false);
    expect(o.durationValue).not.toBeNull(); // 数値はある
    expect(o.durationValue?.usableForLeaveByComputation).toBe(false); // が使えない
    expect(routeEtaAdapterOutputViolations(o)).toEqual([]);
  });
  it("#4 value usable=true は bound capability planning true を要する", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result()) });
    expect(o.capability?.planning.timeEstimateUsableForPlanning).toBe(true);
    expect(o.durationValue?.usableForLeaveByComputation).toBe(true);
  });
});

// ── #5/#6 binding identity（二鍵照合） ─────────────────────────────────────────────────────────

describe("RD2d-b-VALUE #5/#6 hash-only binding 不十分 / full basis mismatch", () => {
  it("#5 短縮 key（capabilityIdentityRef）一致でも full basis 不一致なら usable にしない", () => {
    const capA = freshCapability();
    const value = createPlanningGradeDurationValue(draft({ binding: buildDurationValueBinding(capA) }));
    // 別 origin の capability（短縮 key は providerKind/Version/target/date/mode のみ → 同一・origin だけ違う）
    const capB = freshCapability(); // 同一構造
    const tampered: RouteEtaCapabilityV0 = { ...capB, identity: { ...capB.identity, originRef: { opaqueRef: "o2" } } };
    expect(value.binding.capabilityIdentityRef).toBe(buildDurationValueBinding(tampered).capabilityIdentityRef); // 短縮 key は一致
    const bound = bindDurationValueToCapability(value, tampered);
    expect(bound.matched).toBe(false); // full basis（originRef）で不一致
    expect(bound.usableAfterBinding).toBe(false);
    expect(bound.violations.some((v) => v.includes("originRef"))).toBe(true);
  });
  it("#6 full basis mismatch → usableAfterBinding false / violation", () => {
    const value = createPlanningGradeDurationValue(draft());
    const other = freshCapability({ providerVersion: "v2" });
    const bound = bindDurationValueToCapability(value, other);
    expect(bound.matched).toBe(false);
    expect(bound.violations.length).toBeGreaterThan(0);
  });
  it("full basis 一致なら matched / usableAfterBinding true", () => {
    const cap = freshCapability();
    const value = createPlanningGradeDurationValue(draft({ binding: buildDurationValueBinding(cap) }));
    const bound = bindDurationValueToCapability(value, cap);
    expect(bound.matched).toBe(true);
    expect(bound.usableAfterBinding).toBe(true);
  });
  it("output guard: usable value の binding を改竄すると adapter output violation（二鍵 output 照合）", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result()) });
    expect(o.durationValue?.usableForLeaveByComputation).toBe(true);
    const forged = {
      ...o,
      durationValue: o.durationValue ? { ...o.durationValue, binding: { ...o.durationValue.binding, originRef: "oX" } } : null,
    } as typeof o;
    expect(routeEtaAdapterOutputViolations(forged).some((m) => m.includes("full binding basis"))).toBe(true);
  });
});

// ── #7-#10 allowed basis が value を作る ───────────────────────────────────────────────────────

describe("RD2d-b-VALUE #7-#10 allowed basis → value 生成", () => {
  it("#7 external_route → rounded upper-bound value", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ durationMinutesRaw: 31 })) });
    expect(o.durationValue?.basis).toBe("external_route");
    expect(o.durationValue?.durationUpperBoundMinutes).toBe(35); // 31 → 35
    expect(o.durationValue?.usableForLeaveByComputation).toBe(true);
  });
  it("#8 cached_route fresh → value", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ providerKind: "route_cache", durationBasis: "cached_route", durationMinutesRaw: 12 })) });
    expect(o.durationValue?.basis).toBe("cached_route");
    expect(o.durationValue?.durationUpperBoundMinutes).toBe(15);
    expect(o.durationValue?.usableForLeaveByComputation).toBe(true);
  });
  it("#9 scheduled（transit）→ value", async () => {
    const o = await resolveRouteEtaCapability(
      baseInput({ transportMode: "transit" }),
      { provider: provider(result({ providerKind: "transit_schedule", durationBasis: "scheduled", conditionModelStatus: "schedule_aware", durationMinutesRaw: 18 })) },
    );
    expect(o.durationValue?.basis).toBe("scheduled");
    expect(o.durationValue?.kind).toBe("scheduled");
    expect(o.durationValue?.durationUpperBoundMinutes).toBe(20);
    expect(o.durationValue?.usableForLeaveByComputation).toBe(true);
  });
  it("#10 user_confirmed は evidence ありで value・evidence なしで null", () => {
    const cap = freshCapability({ providerKind: "user_manual", durationBasis: "user_confirmed", conditionModelStatus: "not_applicable" });
    const withEvidence = deriveDurationValueFromProviderResult(
      result({ providerKind: "user_manual", durationBasis: "user_confirmed", conditionModelStatus: "not_applicable", durationMinutesRaw: 14 }),
      cap,
    );
    expect(withEvidence?.basis).toBe("user_confirmed");
    expect(withEvidence?.durationUpperBoundMinutes).toBe(15);
    // evidence を持たない capability → null
    const capNoEv: RouteEtaCapabilityV0 = { ...cap, evidenceRefs: [] };
    const noEv = deriveDurationValueFromProviderResult(
      result({ providerKind: "user_manual", durationBasis: "user_confirmed", conditionModelStatus: "not_applicable", durationMinutesRaw: 14 }),
      capNoEv,
    );
    expect(noEv).toBeNull();
  });
});

// ── #11-#14 forbidden basis / freshness / malformed / exception ───────────────────────────────

describe("RD2d-b-VALUE #11-#14 forbidden / unusable / null", () => {
  it("#11 heuristic → usable value を作らない（null）", async () => {
    const o = await resolveRouteEtaCapability(
      baseInput({ transportMode: "walk" }),
      { provider: provider(result({ providerKind: "heuristic_distance", durationBasis: "heuristic", routeShapePresent: false, conditionModelStatus: "static_assumption", durationMinutesRaw: 20 })) },
    );
    expect(o.durationValue).toBeNull();
  });
  it("#12 stale / expired freshness → unusable value", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ freshnessStatus: "expired", durationMinutesRaw: 20 })) });
    expect(o.durationValue?.usableForLeaveByComputation).toBe(false);
  });
  it("#13 malformed duration（負数 / 非有限）→ null", async () => {
    const neg = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ durationMinutesRaw: -5 })) });
    expect(neg.durationValue).toBeNull();
    const nan = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ durationMinutesRaw: Number.NaN })) });
    expect(nan.durationValue).toBeNull();
  });
  it("#14 provider exception → durationValue null", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), {
      provider: (() => {
        throw new Error("boom 35.6895,139.7006");
      }) as unknown as RouteEtaProvider,
    });
    expect(o.failureReason).toBe("dependency_error");
    expect(o.durationValue).toBeNull();
  });
});

// ── #15-#19 duration value semantics ──────────────────────────────────────────────────────────

describe("RD2d-b-VALUE #15-#19 semantics（integer / %5 / no raw / lower<=upper / no average）", () => {
  it("#15 durationUpperBoundMinutes は integer", () => {
    const v = createPlanningGradeDurationValue(draft({ rawUpperMinutes: 23.7 }));
    expect(Number.isInteger(v.durationUpperBoundMinutes)).toBe(true);
  });
  it("#16 durationUpperBoundMinutes % 5 === 0", () => {
    for (const raw of [1, 23.7, 25, 26, 0.1]) {
      const v = createPlanningGradeDurationValue(draft({ rawUpperMinutes: raw }));
      expect(v.durationUpperBoundMinutes % 5).toBe(0);
      expect(v.durationUpperBoundMinutes).toBeGreaterThanOrEqual(raw); // safe upper bound
    }
  });
  it("#17 fractional / seconds / pre-ceil raw を value object に保持しない", () => {
    const v = createPlanningGradeDurationValue(draft({ rawUpperMinutes: 23.7 }));
    const s = JSON.stringify(v);
    expect(s.includes("23.7")).toBe(false);
    expect(s.includes("23")).toBe(false); // pre-ceil raw も含まない
    expect(s.includes("rawUpperMinutes")).toBe(false);
    expect(s.includes("seconds")).toBe(false);
  });
  it("#18 lower > upper は violation", () => {
    // forged: lower を upper 超に改竄
    const v = createPlanningGradeDurationValue(draft({ rawUpperMinutes: 20, rawLowerMinutes: 10 }));
    const forged: PlanningGradeDurationValueV0 = { ...v, durationLowerBoundMinutes: 25 };
    expect(durationValueViolations(forged).some((m) => m.includes("<= upper"))).toBe(true);
  });
  it("#19 average を作らない（point は round せず ceil で upper-bound 化）", () => {
    // 22 を「平均」とみなして 20 に round しない。ceil で 25（保守的上限）
    const v = createPlanningGradeDurationValue(draft({ kind: "point", rawUpperMinutes: 22 }));
    expect(v.durationUpperBoundMinutes).toBe(25);
    expect(v.provenance.pointTreatment).toBe("point_as_upper_bound");
    // average を表す field / kind が型に存在しない
    expect(JSON.stringify(v).toLowerCase().includes("average")).toBe(false);
  });
});

// ── #20-#23 leak guard / no consumer exposure / shared helper ─────────────────────────────────

describe("RD2d-b-VALUE #20-#23 leak guard / server-only / shared helper", () => {
  it("#20 raw route payload / polyline / coordinate / placeId を value に直列化しない", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), { provider: provider(result({ opaqueRouteRef: "opaque-route-xyz", durationMinutesRaw: 20 })) });
    const s = JSON.stringify(o.durationValue).toLowerCase();
    expect(s.includes("polyline")).toBe(false);
    expect(s.includes("placeid")).toBe(false);
    expect(s.includes("coordinates")).toBe(false);
    expect(s.includes("opaque-route-xyz")).toBe(false); // route ref も value に載らない
  });
  it("#21 violation message は raw 値を echo しない（forged leak を redact 検出）", () => {
    const v = createPlanningGradeDurationValue(draft());
    const leaked: PlanningGradeDurationValueV0 = { ...v, scope: { ...v.scope, originRef: "35.6895,139.7006" } };
    const viol = durationValueViolations(leaked);
    expect(viol.some((m) => m.includes("raw location"))).toBe(true);
    expect(viol.join(" ").includes("35.6895")).toBe(false);
  });
  it("#22 value は consumer payload 前提でない（displayPolicy internalServerOnly 固定）", () => {
    const v = createPlanningGradeDurationValue(draft());
    expect(v.displayPolicy).toBe("internalServerOnly");
    const forged: PlanningGradeDurationValueV0 = { ...v, displayPolicy: "visible" as unknown as "internalServerOnly" };
    expect(durationValueViolations(forged).some((m) => m.includes("internalServerOnly"))).toBe(true);
  });
  it("#23 shared safety helper を使う（local raw regex 不導入・source-scan）", () => {
    const code = readFileSync(join(process.cwd(), "lib/plan/realityCore/routeEtaDurationValue.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code.includes('from "./routeEtaSafety"')).toBe(true);
    expect(code.includes("containsRawLocation")).toBe(true);
    expect(code.includes("const COORD_PATTERN")).toBe(false);
    expect(code.includes("new RegExp")).toBe(false);
  });
});

// ── #24-#26 adapter guard 不変 / no leaveBy / IO scan ─────────────────────────────────────────

describe("RD2d-b-VALUE #24-#26 adapter guard 不変 / no leaveBy / IO scan", () => {
  it("#24 adapter provider exception guard は green のまま（throw しない）", async () => {
    const o = await resolveRouteEtaCapability(baseInput(), {
      provider: (async () => {
        throw new Error("async boom");
      }) as unknown as RouteEtaProvider,
    });
    expect(o.stage).toBe("no_route_source");
    expect(o.durationValue).toBeNull();
  });
  it("no leaveBy computation: value に leaveByInstant / arrival 減算 / departure line / buffer 合成 artifact がない", () => {
    // 注: usableForLeaveByComputation は二鍵の使用可フラグ（名称に leaveBy を含むが計算結果ではない）。
    // 禁止するのは実際の leaveBy 計算 artifact のみ。
    const v = createPlanningGradeDurationValue(draft());
    const s = JSON.stringify(v).toLowerCase();
    for (const bad of ["leavebyinstant", "arrivaltargetinstant", "instantminus", "departureline", "notification"]) {
      expect(s.includes(bad)).toBe(false);
    }
  });
  it("createUnusableDurationValue は usable=false を強制", () => {
    const v = createUnusableDurationValue(draft()); // 条件は揃うが強制 unusable
    expect(v.usableForLeaveByComputation).toBe(false);
  });
  it("isAllowedDurationValueBasis: heuristic/none/stale は false", () => {
    expect(isAllowedDurationValueBasis("external_route")).toBe(true);
    for (const bad of ["heuristic", "none", "unknown", "stale", "static_assumption"]) {
      expect(isAllowedDurationValueBasis(bad)).toBe(false);
    }
  });
  it("#26 routeEtaDurationValue.ts に IO / 時刻 / 乱数 / leaveBy 計算なし（source-scan）", () => {
    const code = readFileSync(join(process.cwd(), "lib/plan/realityCore/routeEtaDurationValue.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const bad of [".insert(", ".update(", "service_role", "notification", "push(", "Date.now", "Math.random", "new Date(", "navigator", "geolocation", "fetch(", "supabase", "localStorage", "instantMinus", "leaveByInstant"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});
