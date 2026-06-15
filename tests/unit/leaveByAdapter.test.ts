/**
 * leaveByAdapter（RD2e-b: internal-only leaveBy computation adapter）— CEO 必須 34 cases
 * 正本: docs/reality-leaveby-computation-adapter-rd2e-b0b.md + …-rd2e-b0b-a.md
 *
 * 核: 二鍵照合 → precondition 合流 → instantMinusMinutes 1 回 → fail-closed。internal-only・user-facing/departure/notification なし。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeLeaveBy,
  instantMinusMinutes,
  isCalendarValidMinuteJstIso,
  resolveBufferMinutesFromCatalog,
  leaveByAdapterInputViolations,
  type LeaveByAdapterInputV0,
  type ArrivalTargetForLeaveByV0,
  type BufferPolicyForLeaveByV0,
  type OriginTemporalValidityForLeaveByV0,
} from "@/lib/plan/realityCore/leaveByAdapter";
import { leaveByComputationViolations, leaveByAtOrBeforeArrival } from "@/lib/plan/realityCore/leaveByComputation";
import {
  resolveRouteEtaCapability,
  type RouteEtaAdapterInputV0,
  type RouteEtaProvider,
  type RouteEtaProviderResultV0,
} from "@/lib/plan/realityCore/routeEtaProviderAdapter";
import type { RouteEtaCapabilityV0 } from "@/lib/plan/realityCore/routeEtaCapability";
import type { PlanningGradeDurationValueV0 } from "@/lib/plan/realityCore/routeEtaDurationValue";

// ── fixtures: 健全な capability + usable durationValue を adapter 経由で得る ──────────────────────

function routeInput(over: Partial<RouteEtaAdapterInputV0> = {}): RouteEtaAdapterInputV0 {
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
function providerResult(over: Partial<RouteEtaProviderResultV0> = {}): RouteEtaProviderResultV0 {
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
    durationMinutesRaw: 23, // → ceil 25
    durationLowerMinutesRaw: null,
    ...over,
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

const arrival = (over: Partial<ArrivalTargetForLeaveByV0> = {}): ArrivalTargetForLeaveByV0 => ({
  arrivalTargetInstant: "2026-06-12T10:00:00+09:00",
  arrivalTargetRef: "arr-1",
  targetNodeId: "ern-1",
  targetEventDate: "2026-06-12",
  transportMode: "car",
  temporalScopeRef: "t1",
  sourceRefs: ["src-1"],
  evidenceRefs: ["ev-arr-1"],
  fixedness: "fixed",
  startTimeProvenance: "confirmed",
  confidence: "high",
  displayPolicy: "hidden",
  ...over,
});
const buffer = (over: Partial<BufferPolicyForLeaveByV0> = {}): BufferPolicyForLeaveByV0 => ({
  bufferPolicyId: "buf-1",
  bufferCoarseBucket: "medium",
  bufferKind: "preparation",
  bufferScopeRef: "bufscope-1",
  targetNodeId: "ern-1",
  subjectiveDate: "2026-06-12",
  transportMode: "car",
  temporalScopeRef: "t1",
  sourceRefs: ["src-b"],
  evidenceRefs: ["ev-buf-1"],
  freshness: "valid",
  confidence: "high",
  displayPolicy: "hidden",
  ...over,
});
const origin = (over: Partial<OriginTemporalValidityForLeaveByV0> = {}): OriginTemporalValidityForLeaveByV0 => ({
  originKind: "user_confirmed",
  validity: "valid",
  originConflict: "none",
  currentObservationOverrodeConfirmed: false,
  originEvidenceRef: "ev-origin-1",
  targetNodeId: "ern-1",
  subjectiveDate: "2026-06-12",
  transportMode: "car",
  temporalScopeRef: "t1",
  originFreshness: "valid",
  originAsOfRef: "asof-1",
  ...over,
});
function input(over: Partial<LeaveByAdapterInputV0> = {}): LeaveByAdapterInputV0 {
  return {
    subjectNodeId: "ern-1",
    capability: CAP,
    durationValue: DV,
    arrivalTarget: arrival(),
    bufferPolicy: buffer(),
    originTemporalValidity: origin(),
    evaluatedAt: "2026-06-12T08:00:00+09:00",
    computedAt: "2026-06-12T08:00:00+09:00",
    ...over,
  };
}

// ── #1 happy path ─────────────────────────────────────────────────────────────────────────────

describe("RD2e-b #1 二鍵 + 全 precondition 揃う → computed", () => {
  it("computed・leaveBy = arrival − (dur25 + buf15) = 09:20・walker green", () => {
    const c = computeLeaveBy(input());
    expect(c.status).toBe("computed");
    expect(c.leaveByInstant?.instant).toBe("2026-06-12T09:20:00+09:00");
    expect(c.source).toBe("external_route");
    expect(leaveByComputationViolations(c)).toEqual([]);
    expect(leaveByAtOrBeforeArrival(c.leaveByInstant!.instant, c.timeContract!.arrivalTargetInstant)).toBe(true);
  });
});

// ── #2-#5 二鍵 / duration ─────────────────────────────────────────────────────────────────────

describe("RD2e-b #2-#5 二鍵不成立 → uncomputed", () => {
  it("#2 durationValue null → uncomputed(duration_value_missing)", () => {
    const c = computeLeaveBy(input({ durationValue: null }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("duration_value_missing_or_unusable");
  });
  it("#3 capability/value binding mismatch → uncomputed(binding_mismatch)", () => {
    const tamperedCap: RouteEtaCapabilityV0 = { ...CAP, identity: { ...CAP.identity, providerVersion: "v999" } };
    const c = computeLeaveBy(input({ capability: tamperedCap }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("binding_mismatch");
  });
  it("#4 capability planning false（stale dur）→ uncomputed", async () => {
    const o = await resolveRouteEtaCapability(routeInput(), { provider: provider(providerResult({ freshnessStatus: "stale", freshnessBasisRef: null })) });
    const c = computeLeaveBy(input({ capability: o.capability as RouteEtaCapabilityV0, durationValue: o.durationValue as PlanningGradeDurationValueV0 }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("duration_value_missing_or_unusable");
  });
  it("#5 durationValue unusable（forged usable=false）→ uncomputed", () => {
    const unusable: PlanningGradeDurationValueV0 = { ...DV, usableForLeaveByComputation: false };
    const c = computeLeaveBy(input({ durationValue: unusable }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("duration_value_missing_or_unusable");
  });
});

// ── #6-#9 calendar / seconds / offset ─────────────────────────────────────────────────────────

describe("RD2e-b #6-#9 arrival instant calendar 検証 → uncomputed", () => {
  it("#6 invalid calendar date(2026-02-31) → uncomputed(arrival_target_invalid)", () => {
    const c = computeLeaveBy(input({ arrivalTarget: arrival({ arrivalTargetInstant: "2026-02-31T10:00:00+09:00" }) }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("arrival_target_invalid");
  });
  it("#7 invalid month/hour(2026-13-01 / 24:00) → uncomputed", () => {
    expect(computeLeaveBy(input({ arrivalTarget: arrival({ arrivalTargetInstant: "2026-13-01T10:00:00+09:00" }) })).status).toBe("uncomputed");
    expect(computeLeaveBy(input({ arrivalTarget: arrival({ arrivalTargetInstant: "2026-06-12T24:00:00+09:00" }) })).status).toBe("uncomputed");
    expect(computeLeaveBy(input({ arrivalTarget: arrival({ arrivalTargetInstant: "2026-06-12T10:60:00+09:00" }) })).status).toBe("uncomputed");
  });
  it("#8 seconds not 00 → uncomputed", () => {
    const c = computeLeaveBy(input({ arrivalTarget: arrival({ arrivalTargetInstant: "2026-06-12T10:00:30+09:00" }) }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("arrival_target_invalid");
  });
  it("#9 offset not +09:00 → uncomputed", () => {
    expect(computeLeaveBy(input({ arrivalTarget: arrival({ arrivalTargetInstant: "2026-06-12T10:00:00+00:00" }) })).status).toBe("uncomputed");
    expect(computeLeaveBy(input({ arrivalTarget: arrival({ arrivalTargetInstant: "2026-06-12T10:00:00Z" }) })).status).toBe("uncomputed");
  });
});

// ── #10-#12 buffer ────────────────────────────────────────────────────────────────────────────

describe("RD2e-b #10-#12 buffer → uncomputed", () => {
  it("#10 buffer bucket unknown(catalog 外) → uncomputed(buffer_invalid)", () => {
    const c = computeLeaveBy(input({ bufferPolicy: buffer({ bufferCoarseBucket: "huge" as unknown as "large" }) }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("buffer_invalid");
  });
  it("#11 buffer stale/unknown → uncomputed", () => {
    expect(computeLeaveBy(input({ bufferPolicy: buffer({ freshness: "stale" }) })).missingInputs[0].code).toBe("buffer_invalid");
    expect(computeLeaveBy(input({ bufferPolicy: buffer({ freshness: "unknown" }) })).missingInputs[0].code).toBe("buffer_invalid");
  });
  it("#12 buffer scope mismatch（別 targetNodeId）→ uncomputed(binding_mismatch)", () => {
    const c = computeLeaveBy(input({ bufferPolicy: buffer({ targetNodeId: "other-node" }) }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("binding_mismatch"); // scopeKey は二鍵 gate
  });
});

// ── #13-#15 arrival provenance ────────────────────────────────────────────────────────────────

describe("RD2e-b #13-#15 arrival provenance → uncomputed", () => {
  it("#13 fixedness not fixed → uncomputed", () => {
    expect(computeLeaveBy(input({ arrivalTarget: arrival({ fixedness: "tentative" }) })).missingInputs[0].code).toBe("arrival_target_invalid");
    expect(computeLeaveBy(input({ arrivalTarget: arrival({ fixedness: "movable" }) })).missingInputs[0].code).toBe("arrival_target_invalid");
  });
  it("#14 default start-time provenance → uncomputed", () => {
    const c = computeLeaveBy(input({ arrivalTarget: arrival({ startTimeProvenance: "default" }) }));
    expect(c.missingInputs[0].code).toBe("arrival_target_invalid");
  });
  it("#15 low confidence → uncomputed", () => {
    const c = computeLeaveBy(input({ arrivalTarget: arrival({ confidence: "low" }) }));
    expect(c.missingInputs[0].code).toBe("arrival_target_invalid");
  });
});

// ── #16-#18 origin ────────────────────────────────────────────────────────────────────────────

describe("RD2e-b #16-#18 origin → uncomputed", () => {
  it("#16 origin temporal invalid(stale) → uncomputed", () => {
    const c = computeLeaveBy(input({ originTemporalValidity: origin({ validity: "stale" }) }));
    expect(c.missingInputs[0].code).toBe("origin_temporal_invalid");
  });
  it("#17 current_location_candidate origin → uncomputed", () => {
    const c = computeLeaveBy(input({ originTemporalValidity: origin({ originKind: "current_location_candidate" }) }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("origin_temporal_invalid");
  });
  it("#18 origin conflict → uncomputed", () => {
    const c = computeLeaveBy(input({ originTemporalValidity: origin({ originConflict: "conflict" }) }));
    expect(c.missingInputs[0].code).toBe("origin_temporal_invalid");
  });
  it("currentObservationOverrodeConfirmed=true → uncomputed", () => {
    const c = computeLeaveBy(input({ originTemporalValidity: origin({ currentObservationOverrodeConfirmed: true }) }));
    expect(c.missingInputs[0].code).toBe("origin_temporal_invalid");
  });
});

// ── #19-#28 instantMinusMinutes property tests ────────────────────────────────────────────────

describe("RD2e-b #19-#28 instantMinusMinutes（civil 算術・Date 不使用）", () => {
  const T = "2026-06-12T10:00:00+09:00";
  it("#19 subtract 0 → same instant", () => expect(instantMinusMinutes(T, 0)).toBe(T));
  it("#20 subtract 5 crosses hour", () => expect(instantMinusMinutes("2026-06-12T10:02:00+09:00", 5)).toBe("2026-06-12T09:57:00+09:00"));
  it("#21 subtract 30 crosses day", () => expect(instantMinusMinutes("2026-06-12T00:10:00+09:00", 30)).toBe("2026-06-11T23:40:00+09:00"));
  it("#22 subtract across month end", () => expect(instantMinusMinutes("2026-07-01T00:10:00+09:00", 30)).toBe("2026-06-30T23:40:00+09:00"));
  it("#23 subtract across year end", () => expect(instantMinusMinutes("2027-01-01T00:10:00+09:00", 30)).toBe("2026-12-31T23:40:00+09:00"));
  it("#24 leap year Feb 29 works", () => expect(instantMinusMinutes("2028-03-01T00:10:00+09:00", 30)).toBe("2028-02-29T23:40:00+09:00"));
  it("#25 non-leap Feb 29 invalid → calendar guard false / minus null", () => {
    expect(isCalendarValidMinuteJstIso("2026-02-29T10:00:00+09:00")).toBe(false);
    expect(instantMinusMinutes("2026-02-29T10:00:00+09:00", 5)).toBeNull();
  });
  it("#26 monotonicity: a<=b ⇒ minus(t,a) >= minus(t,b)", () => {
    const a = instantMinusMinutes(T, 10)!;
    const b = instantMinusMinutes(T, 40)!;
    expect(leaveByAtOrBeforeArrival(b, a)).toBe(true); // b(40 引き) <= a(10 引き)
  });
  it("#27 composition equivalence: minus(minus(t,a),b) == minus(t,a+b)", () => {
    const step = instantMinusMinutes(instantMinusMinutes(T, 25)!, 15);
    const once = instantMinusMinutes(T, 40);
    expect(step).toBe(once);
  });
  it("#28 invalid minutes(Infinity/NaN/非 integer/負) → null・range 越え → null", () => {
    expect(instantMinusMinutes(T, Number.POSITIVE_INFINITY)).toBeNull();
    expect(instantMinusMinutes(T, Number.NaN)).toBeNull();
    expect(instantMinusMinutes(T, 5.5)).toBeNull();
    expect(instantMinusMinutes(T, -5)).toBeNull();
    expect(instantMinusMinutes(T, 99999)).toBeNull(); // > MAX_TOTAL
  });
});

// ── #29-#34 invariants / output / purity ──────────────────────────────────────────────────────

describe("RD2e-b #29-#34 不変条件 / 出力 / 純度", () => {
  it("#29 leaveByInstant <= arrivalTargetInstant", () => {
    const c = computeLeaveBy(input());
    expect(c.leaveByInstant!.instant <= c.timeContract!.arrivalTargetInstant).toBe(true);
  });
  it("#30 output leaveByInstant は canonical JST ISO（ss=00）", () => {
    const c = computeLeaveBy(input());
    expect(isCalendarValidMinuteJstIso(c.leaveByInstant!.instant)).toBe(true);
  });
  it("#31 leaveByAdapter.ts に Date/Date.now/getTimezoneOffset/navigator/geolocation/Math.random なし（source-scan）", () => {
    const code = readFileSync(join(process.cwd(), "lib/plan/realityCore/leaveByAdapter.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const bad of ["new Date(", "Date.now", "getTimezoneOffset", "navigator", "geolocation", "Math.random", "fetch(", "supabase", "localStorage"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
  it("#32 output に user-facing copy / departure line / notification / action field なし", () => {
    const c = computeLeaveBy(input());
    const keys = Object.keys(c).map((k) => k.toLowerCase());
    for (const bad of ["departureline", "copy", "notification", "prompt", "proposal", "nudge", "actioneligible", "currentlocation"]) {
      expect(keys.indexOf(bad)).toBe(-1);
    }
    expect(["internalReference", "debugOnly", "hidden"]).toContain(c.displayPolicy);
  });
  it("#33 input shape: 非 canonical evaluatedAt → uncomputed(input_shape_invalid)", () => {
    const c = computeLeaveBy(input({ evaluatedAt: "2026-06-12T08:00:30+09:00" })); // ss≠00
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("input_shape_invalid");
  });
  it("buffer catalog: small5/medium15/large30・他 null", () => {
    expect(resolveBufferMinutesFromCatalog("small")).toBe(5);
    expect(resolveBufferMinutesFromCatalog("medium")).toBe(15);
    expect(resolveBufferMinutesFromCatalog("large")).toBe(30);
  });
  it("leaveByAdapterInputViolations: 健全入力は空", () => {
    expect(leaveByAdapterInputViolations(input())).toEqual([]);
  });
  it("#34 IO source-scan green（write/insert/notification なし）", () => {
    const code = readFileSync(join(process.cwd(), "lib/plan/realityCore/leaveByAdapter.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const bad of [".insert(", ".update(", ".upsert(", "service_role", "push(", "weatherApi", "getCurrentLocation", "departureLine"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RD2e-b-A Adapter Hardening — D1-D6 defect 修正（origin scope / minor_discrepancy /
// origin freshness / fixedness trust / targetEventDate 整合 / temporalScopeRef）。
// 前日化する computed leaveBy は **正しい civil 計算ゆえ violation にしない**（CEO 補正）。
// ─────────────────────────────────────────────────────────────────────────────
describe("RD2e-b-A D1 origin を scope gate に含める", () => {
  it("#1 origin targetNodeId mismatch → uncomputed(binding_mismatch)", () => {
    const c = computeLeaveBy(input({ originTemporalValidity: origin({ targetNodeId: "other-node" }) }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("binding_mismatch");
  });
  it("#2 origin temporalScopeRef null while capability has one → uncomputed", () => {
    const c = computeLeaveBy(input({ originTemporalValidity: origin({ temporalScopeRef: null }) }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("binding_mismatch");
  });
  it("#3 origin transportMode mismatch → uncomputed", () => {
    const c = computeLeaveBy(input({ originTemporalValidity: origin({ transportMode: "walk" }) }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("binding_mismatch");
  });
});

describe("RD2e-b-A D2 originConflict fail-closed", () => {
  it("#4 minor_discrepancy → uncomputed(origin_temporal_invalid)", () => {
    const c = computeLeaveBy(input({ originTemporalValidity: origin({ originConflict: "minor_discrepancy" }) }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("origin_temporal_invalid");
  });
  it("#5 conflict → uncomputed", () => {
    expect(computeLeaveBy(input({ originTemporalValidity: origin({ originConflict: "conflict" }) })).missingInputs[0].code).toBe("origin_temporal_invalid");
  });
});

describe("RD2e-b-A D3 origin freshness", () => {
  it("#6 originFreshness stale → uncomputed", () => {
    expect(computeLeaveBy(input({ originTemporalValidity: origin({ originFreshness: "stale" }) })).missingInputs[0].code).toBe("origin_temporal_invalid");
  });
  it("#7 originFreshness unknown → uncomputed", () => {
    expect(computeLeaveBy(input({ originTemporalValidity: origin({ originFreshness: "unknown" }) })).missingInputs[0].code).toBe("origin_temporal_invalid");
  });
  it("#8 originAsOfRef missing → uncomputed", () => {
    expect(computeLeaveBy(input({ originTemporalValidity: origin({ originAsOfRef: "" }) })).missingInputs[0].code).toBe("origin_temporal_invalid");
  });
});

describe("RD2e-b-A D4 fixedness supplier trust 再検証", () => {
  it("#9 fixed arrival + startTimeProvenance inferred → uncomputed(arrival_target_invalid)", () => {
    const c = computeLeaveBy(input({ arrivalTarget: arrival({ startTimeProvenance: "inferred" }) }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("arrival_target_invalid");
  });
  it("#10 fixed arrival + startTimeProvenance default → uncomputed", () => {
    expect(computeLeaveBy(input({ arrivalTarget: arrival({ startTimeProvenance: "default" }) })).missingInputs[0].code).toBe("arrival_target_invalid");
  });
  it("#11 fixed arrival + confidence low → uncomputed", () => {
    expect(computeLeaveBy(input({ arrivalTarget: arrival({ confidence: "low" }) })).missingInputs[0].code).toBe("arrival_target_invalid");
  });
  it("#12 fixed arrival without evidenceRefs/sourceRefs → uncomputed", () => {
    expect(computeLeaveBy(input({ arrivalTarget: arrival({ evidenceRefs: [] }) })).missingInputs[0].code).toBe("arrival_target_invalid");
    expect(computeLeaveBy(input({ arrivalTarget: arrival({ sourceRefs: [] }) })).missingInputs[0].code).toBe("arrival_target_invalid");
  });
});

describe("RD2e-b-A D5 targetEventDate / arrivalTargetInstant 整合（前日 leaveBy は許容）", () => {
  it("#13 targetEventDate ≠ capability subjectiveDate → uncomputed", () => {
    const c = computeLeaveBy(input({ arrivalTarget: arrival({ targetEventDate: "2026-06-13", arrivalTargetInstant: "2026-06-13T10:00:00+09:00" }) }));
    expect(c.status).toBe("uncomputed"); // scope gate(binding_mismatch) で倒れる
  });
  it("#14 unsupported cross-day target（arrival 日付 ≠ targetEventDate）→ uncomputed(arrival_target_invalid)", () => {
    const c = computeLeaveBy(input({ arrivalTarget: arrival({ arrivalTargetInstant: "2026-06-13T10:00:00+09:00" }) }));
    expect(c.status).toBe("uncomputed");
    expect(c.missingInputs[0].code).toBe("arrival_target_invalid"); // targetEventDate=2026-06-12, arrival 日付=2026-06-13
  });
  it("#15 computed leaveBy が前日になっても arrival target が有効なら computed（正しい civil 計算）", () => {
    const c = computeLeaveBy(input({ arrivalTarget: arrival({ arrivalTargetInstant: "2026-06-12T00:30:00+09:00" }) }));
    expect(c.status).toBe("computed"); // 00:30 − (25+15)=40min → 前日 23:50
    expect(c.leaveByInstant?.instant).toBe("2026-06-11T23:50:00+09:00");
    expect(leaveByComputationViolations(c)).toEqual([]);
  });
  it("#16 leaveBy <= arrival は維持", () => {
    const c = computeLeaveBy(input({ arrivalTarget: arrival({ arrivalTargetInstant: "2026-06-12T00:30:00+09:00" }) }));
    expect(leaveByAtOrBeforeArrival(c.leaveByInstant!.instant, c.timeContract!.arrivalTargetInstant)).toBe(true);
  });
});

describe("RD2e-b-A D6 temporalScopeRef を scopeKey に含める", () => {
  it("arrival temporalScopeRef mismatch → uncomputed", () => {
    expect(computeLeaveBy(input({ arrivalTarget: arrival({ temporalScopeRef: "t-other" }) })).missingInputs[0].code).toBe("binding_mismatch");
  });
  it("buffer temporalScopeRef mismatch → uncomputed", () => {
    expect(computeLeaveBy(input({ bufferPolicy: buffer({ temporalScopeRef: "t-other" }) })).missingInputs[0].code).toBe("binding_mismatch");
  });
  it("健全（全 fuel temporalScopeRef=t1）→ computed", () => {
    expect(computeLeaveBy(input()).status).toBe("computed");
  });
});
