/**
 * leaveByComputation（RD2e-a 実 leaveBy 時刻の型・不変条件・pure walker）— CEO 必須 21 fixtures
 * 正本: docs/reality-leaveby-computation-boundary-rd2e-0.md / CEO RD2e-a 実装 GO
 *
 * 核: RD2e-a は leaveBy を計算しない（型 + walker のみ）。computed は planning-grade source + 時間契約 +
 *   buffer evidence + 非 current_location origin + internal-only が全て揃う時のみ。型レベルで heuristic/none/current_location を排除。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createUncomputedLeaveBy,
  createComputedLeaveBy,
  leaveByComputationViolations,
  type LeaveByComputationV0,
  type LeaveByBufferPolicyV0,
  type LeaveByTimeContractV0,
  type LeaveByInstantV0,
  type LeaveByComputationSource,
  type LeaveByOriginKind,
} from "@/lib/plan/realityCore/leaveByComputation";

const INSTANT: LeaveByInstantV0 = { instant: "2026-06-12T08:30:00+09:00", timezone: "JST" };
const CONTRACT: LeaveByTimeContractV0 = {
  timezone: "JST",
  subjectiveDate: "2026-06-12",
  targetEventDate: "2026-06-12",
  arrivalTargetInstant: "2026-06-12T09:00:00+09:00",
  evaluatedAt: "2026-06-12T07:00:00+09:00",
};
const BUFFER: LeaveByBufferPolicyV0 = {
  bufferPolicyId: "bp-1",
  bufferKind: "conservative_default",
  bufferCoarseBucket: "medium",
  source: "rigidity:work",
  evidenceRefs: [{ code: "buf_ev", capability: "buffer", source: "event_anchor" }],
  confidence: "moderate",
  staleness: "fresh",
  displayPolicy: "internalReference",
};

function computed(over: Partial<Parameters<typeof createComputedLeaveBy>[0]> = {}): LeaveByComputationV0 {
  return createComputedLeaveBy({
    subjectNodeId: "ern-1",
    leaveByInstant: INSTANT,
    source: "external_route",
    timeContract: CONTRACT,
    sourceTimeEstimateRef: "te-1",
    buffer: BUFFER,
    bufferRef: "br-1",
    originUsabilityKind: "user_confirmed",
    computedAt: "2026-06-12T07:05:00+09:00",
    evidenceRefs: [{ code: "te_ev", capability: "time_estimate", source: "external_route" }],
    ...over,
  });
}

describe("RD2e-a #1 missing time estimate → uncomputed", () => {
  it("uncomputed → instant/contract null・missing input", () => {
    const c = createUncomputedLeaveBy("ern-1", [{ code: "time_estimate_missing", whyUncomputed: "no_planning_grade_estimate" }]);
    expect(c.status).toBe("uncomputed");
    expect(c.leaveByInstant).toBeNull();
    expect(c.timeContract).toBeNull();
    expect(leaveByComputationViolations(c)).toEqual([]);
  });
});

describe("RD2e-a #2/#3/#4 timeEstimateUsableForPlanning 必須（signal/projection だけでは不可）", () => {
  it("computed で timeEstimateUsableForPlanning false → violation", () => {
    const forged: LeaveByComputationV0 = { ...computed(), timeEstimateUsableForPlanning: false };
    expect(leaveByComputationViolations(forged).some((m) => m.includes("timeEstimateUsableForPlanning"))).toBe(true);
  });
  it("正常 computed は timeEstimateUsableForPlanning true", () => {
    expect(computed().timeEstimateUsableForPlanning).toBe(true);
    expect(leaveByComputationViolations(computed())).toEqual([]);
  });
});

describe("RD2e-a #5 heuristic source では computed 不可", () => {
  it("forged: source heuristic/none → violation（planning-grade のみ）", () => {
    const forged: LeaveByComputationV0 = { ...computed(), source: "none" as LeaveByComputationSource };
    expect(leaveByComputationViolations(forged).some((m) => m.includes("planning-grade source"))).toBe(true);
    // createComputedLeaveBy は PlanningGradeTimeSource のみ受理（heuristic は TS 上構築不能）
  });
});

describe("RD2e-a #6 stale/expired freshness では computed 不可", () => {
  it("buffer staleness stale → violation", () => {
    const forged: LeaveByComputationV0 = { ...computed(), buffer: { ...BUFFER, staleness: "stale" } };
    expect(leaveByComputationViolations(forged).some((m) => m.includes("fresh"))).toBe(true);
  });
});

describe("RD2e-a #7/#8/#9 arrivalTargetInstant / bufferRef / sourceTimeEstimateRef 必須", () => {
  it("#7 arrivalTargetInstant 空 → violation", () => {
    const forged: LeaveByComputationV0 = { ...computed(), timeContract: { ...CONTRACT, arrivalTargetInstant: "" } };
    expect(leaveByComputationViolations(forged).some((m) => m.includes("arrivalTargetInstant"))).toBe(true);
  });
  it("#8 bufferRef 欠落 → violation", () => {
    const forged: LeaveByComputationV0 = { ...computed(), bufferRef: null };
    expect(leaveByComputationViolations(forged).some((m) => m.includes("bufferRef"))).toBe(true);
  });
  it("#9 sourceTimeEstimateRef 欠落 → violation", () => {
    const forged: LeaveByComputationV0 = { ...computed(), sourceTimeEstimateRef: null };
    expect(leaveByComputationViolations(forged).some((m) => m.includes("sourceTimeEstimateRef"))).toBe(true);
  });
});

describe("RD2e-a #10 current_location_candidate origin では computed 不可", () => {
  it("forged: origin current_location_candidate → violation", () => {
    const forged: LeaveByComputationV0 = { ...computed(), originUsabilityKind: "current_location_candidate" as LeaveByOriginKind };
    const v = leaveByComputationViolations(forged);
    expect(v.some((m) => m.includes("current_location_candidate"))).toBe(true);
    // createComputedLeaveBy は ComputedOriginKind のみ（current_location_candidate は TS 上構築不能）
  });
});

describe("RD2e-a #11 user_confirmed/previous_event_end origin は evidence 付きなら候補", () => {
  it("user_confirmed / previous_event_end / assumed + evidence → 健全", () => {
    for (const o of ["user_confirmed", "previous_event_end", "home_assumed", "work_assumed"] as const) {
      expect(leaveByComputationViolations(computed({ originUsabilityKind: o }))).toEqual([]);
    }
  });
  it("origin evidence なし → violation", () => {
    const forged: LeaveByComputationV0 = { ...computed(), originEvidencePresent: false };
    expect(leaveByComputationViolations(forged).some((m) => m.includes("origin evidence"))).toBe(true);
  });
});

describe("RD2e-a #12/#13 leaveByInstantComputed は display/action eligibility/departure line でない", () => {
  it("#12 displayPolicy は internalReference|debugOnly（visible にならない）", () => {
    expect(["internalReference", "debugOnly"]).toContain(computed().displayPolicy);
    const forged: LeaveByComputationV0 = { ...computed(), displayPolicy: "notActionable" };
    // visible は型に無いが内部参照のみ強制
    expect(leaveByComputationViolations(forged).some((m) => m.includes("internal only"))).toBe(true);
  });
  it("#13 型に departure line / copy / notification / action field がない", () => {
    const c = computed();
    const keys = Object.keys(c).map((k) => k.toLowerCase());
    for (const f of ["departureline", "copy", "notification", "prompt", "actioneligible", "displayeligible", "nudge", "proposal"]) {
      expect(keys.includes(f)).toBe(false);
    }
  });
});

describe("RD2e-a #14 timezone / subjectiveDate / targetEventDate 必須", () => {
  it("timezone JST 以外 → violation", () => {
    const forged: LeaveByComputationV0 = { ...computed(), timeContract: { ...CONTRACT, timezone: "UTC" as "JST" } };
    expect(leaveByComputationViolations(forged).some((m) => m.includes("JST"))).toBe(true);
  });
  it("targetEventDate 空 → violation・HH だけ instant → violation", () => {
    expect(leaveByComputationViolations({ ...computed(), timeContract: { ...CONTRACT, targetEventDate: "" } }).some((m) => m.includes("targetEventDate"))).toBe(true);
    expect(leaveByComputationViolations({ ...computed(), leaveByInstant: { instant: "08:30", timezone: "JST" } }).some((m) => m.includes("absolute date-time"))).toBe(true);
  });
});

describe("RD2e-a #15 browser local timezone / Date local getter import なし（source-scan）", () => {
  it("leaveByComputation.ts に local time / Date getter / geolocation なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/leaveByComputation.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["new Date(", "Date.now", "getHours", "getMinutes", "getTimezoneOffset", "toLocaleString", "toLocaleTimeString", "Intl.DateTimeFormat", "navigator", "geolocation", "getCurrentLocation"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RD2e-a #16 raw coordinate / route response / currentLocation field がない", () => {
  it("型に raw/location field なし + 偽造混入 → violation", () => {
    const c = computed();
    const json = JSON.stringify(c).toLowerCase();
    for (const t of ["latitude", "longitude", "coordinates", "routeresponse", "currentlocation"]) {
      expect(json.includes(t)).toBe(false);
    }
    const forged = { ...c, currentLocation: "x", latitude: 35.6 } as unknown as LeaveByComputationV0;
    expect(leaveByComputationViolations(forged).some((m) => m.includes("forbidden field"))).toBe(true);
  });
});

describe("RD2e-a #17 computedAt は identity 対象外（timeContract に含めない）", () => {
  it("computedAt は top-level・timeContract に含まれない", () => {
    const c = computed();
    expect(c.computedAt).not.toBeNull();
    const tcKeys = Object.keys(c.timeContract!).map((k) => k.toLowerCase());
    expect(tcKeys.includes("computedat")).toBe(false);
    const forged: LeaveByComputationV0 = { ...c, timeContract: { ...CONTRACT, computedAt: "x" } as LeaveByTimeContractV0 };
    expect(leaveByComputationViolations(forged).some((m) => m.includes("identity-excluded"))).toBe(true);
  });
});

describe("RD2e-a #18 no user-facing copy / notification / action field", () => {
  it("型に user-facing/action 系 field なし（#13 と合わせ backstop）", () => {
    const forged = { ...computed(), userFacing: "x", notification: "y" } as unknown as LeaveByComputationV0;
    expect(leaveByComputationViolations(forged).some((m) => m.includes("forbidden field"))).toBe(true);
  });
});

describe("RD2e-a #19 IO source-scan green", () => {
  it("leaveByComputation.ts に IO / write / 乱数 / 非決定 API なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/leaveByComputation.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of [".insert(", ".update(", ".delete(", ".upsert(", "service_role", "push(", "Math.random", "writeFile", "process.env", "fetch(", "supabase", "localStorage", "import"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RD2e-a baseline: 全 origin/source の computed が健全", () => {
  it("planning-grade source × computed origin の代表が green", () => {
    for (const s of ["external_route", "scheduled", "user_confirmed", "cached_route"] as const) {
      expect(leaveByComputationViolations(computed({ source: s, evidenceRefs: [{ code: "e", capability: "time_estimate", source: s }] }))).toEqual([]);
    }
  });
});
