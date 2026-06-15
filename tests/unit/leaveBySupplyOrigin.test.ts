/**
 * leaveBySupplyOrigin（U2-minimal: previous_event_end OriginTemporalValidity 供給）— CEO 必須 23 cases
 * 正本: docs/reality-leaveby-u2-minimal-originvalidity-0.md
 *
 * 核: previous_event_end のみ supply。validity full-AND fail-closed・freshness は snapshotId 実 asOf・
 *   location tri-state・他 origin kind reject/defer。STAGE_MAX_CONFIDENCE walker。pure compute。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPreviousEventEndOriginValidity,
  materializePreviousEventEndInstant,
  deriveOriginLocationState,
  type PreviousEventEndOriginSupplyInputV0,
} from "@/lib/plan/realityCore/leaveBySupplyOrigin";
import { originInferenceViolations, type OriginInferenceV0, type OriginInferenceStage } from "@/lib/plan/realityCore/originInference";

function supplyInput(over: Partial<PreviousEventEndOriginSupplyInputV0> = {}, peOver: Partial<PreviousEventEndOriginSupplyInputV0["previousEvent"]> = {}): PreviousEventEndOriginSupplyInputV0 {
  return {
    originInferenceStage: "previous_event_end",
    dayGraphDate: "2026-06-12",
    dayGraphSnapshotId: "snap-1",
    arrivalNodeId: "arr-node",
    arrivalTargetInstant: "2026-06-12T10:00:00+09:00",
    subjectiveDate: "2026-06-12",
    transportMode: "car",
    temporalScopeRef: "t1",
    previousEvent: {
      nodeId: "prev",
      endTimeHHMM: "09:00",
      durationSource: "explicit",
      boundaryClipped: false,
      locationText: "office",
      sensitive: false,
      startTimeSource: "user_explicit",
      anchorRef: "anchor-prev",
      ...peOver,
    },
    ...over,
  };
}

// ── #1 valid ────────────────────────────────────────────────────────────────────────────────
describe("U2-minimal #1 valid previous_event_end", () => {
  it("validity valid / freshness valid / asOf=snapshotId / scope=arrival node", () => {
    const r = buildPreviousEventEndOriginValidity(supplyInput());
    expect(r.originValidity?.validity).toBe("valid");
    expect(r.originValidity?.originFreshness).toBe("valid");
    expect(r.originValidity?.originAsOfRef).toBe("snap-1");
    expect(r.originValidity?.originKind).toBe("previous_event_end");
    expect(r.originValidity?.targetNodeId).toBe("arr-node");
    expect(r.originValidity?.subjectiveDate).toBe("2026-06-12");
    expect(r.originValidity?.currentObservationOverrodeConfirmed).toBe(false);
    expect(r.trace.originProvenanceKind).toBe("previous_event_chain");
    expect(r.trace.previousEventEndInstant).toBe("2026-06-12T09:00:00+09:00");
    expect(r.trace.missingInputs).toEqual([]);
  });
});

// ── #2-#6 supportedBoundary / U1 startTimeSource ──────────────────────────────────────────────
describe("U2-minimal #2-#6 supportedBoundary / start provenance", () => {
  it("#2 assumed_default end → not valid (stale)", () => {
    const r = buildPreviousEventEndOriginValidity(supplyInput({}, { durationSource: "assumed_default" }));
    expect(r.originValidity?.validity).toBe("stale");
    expect(r.trace.missingInputs).toContain("previous_event_boundary_unsupported");
  });
  it("#3 boundaryClipped → not valid", () => {
    expect(buildPreviousEventEndOriginValidity(supplyInput({}, { boundaryClipped: true })).originValidity?.validity).toBe("stale");
  });
  it("#4 start assumed_default → not valid", () => {
    const r = buildPreviousEventEndOriginValidity(supplyInput({}, { startTimeSource: "assumed_default" }));
    expect(r.originValidity?.validity).toBe("stale");
    expect(r.trace.missingInputs).toContain("previous_event_start_defaulted");
  });
  it("#5 start system_inferred → not valid", () => {
    expect(buildPreviousEventEndOriginValidity(supplyInput({}, { startTimeSource: "system_inferred" })).originValidity?.validity).toBe("stale");
  });
  it("#6 start unknown → not valid", () => {
    expect(buildPreviousEventEndOriginValidity(supplyInput({}, { startTimeSource: "unknown" })).originValidity?.validity).toBe("stale");
  });
});

// ── #7/#8 prevEnd<=arrival / instant ──────────────────────────────────────────────────────────
describe("U2-minimal #7/#8 prevEnd<=arrival / instant materialization", () => {
  it("#7 prevEnd > arrival → unknown + conflict", () => {
    const r = buildPreviousEventEndOriginValidity(supplyInput({}, { endTimeHHMM: "11:00" }));
    expect(r.originValidity?.validity).toBe("unknown");
    expect(r.originValidity?.originConflict).toBe("conflict");
    expect(r.trace.missingInputs).toContain("previous_event_end_after_arrival");
  });
  it("#8 invalid HH / invalid JST → unknown", () => {
    const r = buildPreviousEventEndOriginValidity(supplyInput({}, { endTimeHHMM: "25:61" }));
    expect(r.originValidity?.validity).toBe("unknown");
    expect(r.trace.previousEventEndInstant).toBeNull();
    expect(r.trace.missingInputs).toContain("previous_event_end_not_calendar_valid");
    // helper 直接
    expect(materializePreviousEventEndInstant("2026-06-12", "25:61")).toBeNull();
    expect(materializePreviousEventEndInstant("2026-02-31", "09:00")).toBeNull(); // 暦不正 date
    expect(materializePreviousEventEndInstant("2026-06-12", "09:00")).toBe("2026-06-12T09:00:00+09:00");
  });
});

// ── #9/#10 location tri-state ─────────────────────────────────────────────────────────────────
describe("U2-minimal #9/#10 location tri-state", () => {
  it("#9 sensitive → redacted_sensitive・raw location を echo しない", () => {
    const r = buildPreviousEventEndOriginValidity(supplyInput({}, { locationText: "secret-home-addr", sensitive: true }));
    expect(r.trace.derivedLocationState).toBe("redacted_sensitive");
    expect(r.originValidity?.validity).toBe("valid"); // redacted は valid 可
    expect(JSON.stringify(r).includes("secret-home-addr")).toBe(false); // raw 非 echo
  });
  it("#10 absent location（非 sensitive・locationText なし）→ not valid", () => {
    const r = buildPreviousEventEndOriginValidity(supplyInput({}, { locationText: undefined, sensitive: false }));
    expect(r.trace.derivedLocationState).toBe("absent");
    expect(r.originValidity?.validity).toBe("stale");
    expect(r.trace.missingInputs).toContain("origin_location_absent");
  });
  it("deriveOriginLocationState 単体", () => {
    expect(deriveOriginLocationState("x", false)).toBe("present");
    expect(deriveOriginLocationState(undefined, true)).toBe("redacted_sensitive");
    expect(deriveOriginLocationState(undefined, false)).toBe("absent");
  });
});

// ── #11 freshness / asOf ──────────────────────────────────────────────────────────────────────
describe("U2-minimal #11 freshness", () => {
  it("missing dayGraphSnapshotId → freshness unknown / asOf 空 / missing code", () => {
    const r = buildPreviousEventEndOriginValidity(supplyInput({ dayGraphSnapshotId: null }));
    expect(r.originValidity?.originFreshness).toBe("unknown");
    expect(r.originValidity?.originAsOfRef).toBe("");
    expect(r.trace.missingInputs).toContain("origin_snapshot_asof_missing");
  });
});

// ── #12-#16 他 origin kind は reject/defer ────────────────────────────────────────────────────
describe("U2-minimal #12-#16 他 stage は null（reject/defer）", () => {
  const stages: OriginInferenceStage[] = ["home_assumed", "work_assumed", "user_confirmed_origin", "current_location_candidate", "unknown_origin"];
  it.each(stages)("%s → originValidity null + origin_stage_not_previous_event_end", (stage) => {
    const r = buildPreviousEventEndOriginValidity(supplyInput({ originInferenceStage: stage }));
    expect(r.originValidity).toBeNull();
    expect(r.trace.originProvenanceKind).toBe("none");
    expect(r.trace.missingInputs).toContain("origin_stage_not_previous_event_end");
  });
});

// ── #17/#18 STAGE_MAX_CONFIDENCE walker ───────────────────────────────────────────────────────
function originInf(over: Partial<OriginInferenceV0>): OriginInferenceV0 {
  return {
    schemaVersion: 0,
    stage: "previous_event_end",
    certaintyStatus: "inferred",
    confidence: "moderate",
    source: "previous_event_chain",
    originRef: { opaqueRef: "o1" },
    evidenceRefs: [],
    missingInputs: [],
    subjectNodeId: null,
    displayPolicy: "hidden",
    ...over,
  } as OriginInferenceV0;
}
describe("U2-minimal #17/#18 STAGE_MAX_CONFIDENCE", () => {
  it("#17 previous_event_end high → violation（exceeds max moderate）", () => {
    const v = originInferenceViolations(originInf({ stage: "previous_event_end", certaintyStatus: "inferred", confidence: "high" }));
    expect(v.some((m) => m.includes("exceeds max"))).toBe(true);
  });
  it("#18 home/work moderate → violation（max low）", () => {
    const home = originInferenceViolations(originInf({ stage: "home_assumed", certaintyStatus: "inferred", confidence: "moderate", source: "home_profile" }));
    expect(home.some((m) => m.includes("exceeds max"))).toBe(true);
    const work = originInferenceViolations(originInf({ stage: "work_assumed", certaintyStatus: "inferred", confidence: "moderate", source: "work_profile" }));
    expect(work.some((m) => m.includes("exceeds max"))).toBe(true);
  });
  it("previous_event_end moderate は max 内（exceeds なし）", () => {
    const v = originInferenceViolations(originInf({ stage: "previous_event_end", confidence: "moderate" }));
    expect(v.some((m) => m.includes("exceeds max"))).toBe(false);
  });
});

// ── #19 originProvenanceKind ──────────────────────────────────────────────────────────────────
describe("U2-minimal #19 originProvenanceKind 固定", () => {
  it("previous_event_chain", () => {
    expect(buildPreviousEventEndOriginValidity(supplyInput()).trace.originProvenanceKind).toBe("previous_event_chain");
  });
});

// ── #20/#21 source-scan（純度） ───────────────────────────────────────────────────────────────
describe("U2-minimal #20/#21 source-scan", () => {
  it("leaveBySupplyOrigin.ts に currentLocation/geolocation/Date/乱数/IO/UI/notification なし", () => {
    const code = readFileSync(join(process.cwd(), "lib/plan/realityCore/leaveBySupplyOrigin.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const bad of ["currentLocation", "getCurrentLocation", "geolocation", "navigator", "new Date(", "Date.now", "Math.random", "fetch(", "supabase", "localStorage", ".insert(", ".update(", "notification", "push("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});
