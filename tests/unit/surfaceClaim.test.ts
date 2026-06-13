/**
 * deriveSurfaceClaims / 3-walker（RJ2b = SurfaceClaim / Claim Evidence / Redaction v0）— CEO 必須 18 fixtures + guard
 * 正本: docs/reality-surface-claim-impl-design-rj2b-0.md（RJ2b-0/RJ2b-0A）+ docs/reality-judgment-surface-boundary-rj2-0.md
 *
 * 核: claim = 「主張してよいことの構造化 envelope」であって文面ではない。feasibility verdict を claim 化しない。
 *   claimTextDraft=null / actionAffordance=none / evidence internal_trace_only / sensitive genericize。
 *   3-walker 責務分離（plan 単体 / claimSet 単体 / binding 整合）。binding を通らねば surface emission に進めない。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { compileEventRealityNodes } from "@/lib/plan/realityCore/compileEventRealityNodes";
import { compileMovementReality } from "@/lib/plan/realityCore/movementReality";
import { compileCommitmentSignals } from "@/lib/plan/realityCore/commitmentSignal";
import { deriveDecisionDebt } from "@/lib/plan/realityCore/decisionDebt";
import { deriveMomentSnapshot } from "@/lib/plan/realityCore/momentSnapshot";
import { assembleRealityGraph } from "@/lib/plan/realityCore/realityGraphSnapshot";
import { graphViewerKey } from "@/lib/plan/realityCore/graphIdentity";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";
import { inferredAttribute, unknownAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { EventRealityNodeV0 } from "@/lib/plan/realityCore/eventRealityNode";
import type { CommitmentSignalV0 } from "@/lib/plan/realityCore/commitmentSignal";
import { buildRealityJudgmentInput, type TargetScope } from "@/lib/plan/realityCore/realityJudgmentInput";
import { evaluateFeasibility } from "@/lib/plan/realityCore/feasibilityJudgment";
import { evaluateCollapseRisk } from "@/lib/plan/realityCore/collapseRisk";
import { evaluateCollapsePropagation } from "@/lib/plan/realityCore/collapsePropagation";
import { evaluateInterventionEligibility } from "@/lib/plan/realityCore/interventionEligibility";
import { evaluateInterventionDecision } from "@/lib/plan/realityCore/interventionDecision";
import { deriveSurfacePlan, type JudgmentSurfacePlanV0 } from "@/lib/plan/realityCore/judgmentSurfacePlan";
import {
  deriveSurfaceClaims,
  surfaceClaimSetViolations,
  surfaceClaimBindingViolations,
  bindClaimsToPlan,
  type SurfaceClaimSetV0,
  type SurfaceClaimV0,
} from "@/lib/plan/realityCore/surfaceClaim";

const DATE = "2026-06-12";
const VIEWER = graphViewerKey("viewer-self");
const EARLY_UTC = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00
const NOON_UTC = new Date(Date.UTC(2026, 5, 12, 3, 0)); // JST 12:00

function anchor(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return { anchorKind: "one_off", sourceId: "src-manual", title: "予定", date: DATE, rigidity: "soft", confirmedAt: "2026-06-01T00:00:00.000Z", ...over } as unknown as ExternalAnchor;
}

function base(anchors: ExternalAnchor[], utcNow: Date = EARLY_UTC) {
  const { graph } = buildDayGraph({ anchors, date: DATE });
  const ern = compileEventRealityNodes({ date: DATE, graph, anchors });
  const mv = compileMovementReality({ date: DATE, graph });
  const cs = compileCommitmentSignals({ date: DATE, graph, anchors });
  const decisionDebt = deriveDecisionDebt({ subjectiveDate: DATE, graph, ern, mv, cs });
  const instant = makeRealityInstantJst(utcNow);
  const momentState = deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] });
  const momentSnapshot = deriveMomentSnapshot({ instant, momentState, ern, mv, cs, decisionDebt });
  return { ern, mv, cs, momentSnapshot };
}

function snap(
  b: ReturnType<typeof base>,
  opts: { ernOverrides?: Record<string, Partial<EventRealityNodeV0>>; csOverrides?: Record<string, Partial<CommitmentSignalV0>> } = {},
) {
  const ern = b.ern.map((e) => (opts.ernOverrides?.[e.eventRealityNodeId] ? { ...e, ...opts.ernOverrides[e.eventRealityNodeId] } : e));
  const cs = b.cs.map((c) => (opts.csOverrides?.[c.targetNodeId] ? { ...c, ...opts.csOverrides[c.targetNodeId] } : c));
  return assembleRealityGraph({ ern, mv: b.mv, cs, momentSnapshot: b.momentSnapshot, viewerKey: VIEWER });
}

function chain(snapshot: ReturnType<typeof snap>, scope: TargetScope) {
  const fj = evaluateFeasibility(buildRealityJudgmentInput(snapshot, scope));
  const crp = evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment: fj });
  const prop = evaluateCollapsePropagation({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp });
  const elig = evaluateInterventionEligibility({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, targetScope: scope });
  const dec = evaluateInterventionDecision({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, interventionEligibility: elig });
  const plan = deriveSurfacePlan({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, interventionEligibility: elig, interventionDecision: dec });
  return { fj, crp, prop, elig, dec, plan };
}

function claimsFor(snapshot: ReturnType<typeof snap>, scope: TargetScope): { plan: JudgmentSurfacePlanV0; claimSet: SurfaceClaimSetV0 } {
  const { fj, crp, elig, dec, plan } = chain(snapshot, scope);
  const claimSet = deriveSurfaceClaims({ surfacePlan: plan, feasibilityJudgment: fj, collapseRiskProfile: crp, interventionEligibility: elig, interventionDecision: dec });
  return { plan, claimSet };
}

const ERN = (id: string) => `ern:${DATE}:${id}`;
const EV = (id: string): TargetScope => ({ kind: "event", eventRealityNodeId: ERN(id) });
const placeConfirmed = () => inferredAttribute(0.9, 0.9, ["test_place"], { status: "confirmed", displayPolicy: "visible" });
const movementNotRequired = () => inferredAttribute(false, 0.9, ["test_no_mv"], { status: "confirmed", displayPolicy: "visible" });
const movementRequired = () => inferredAttribute(true, 0.9, ["test_mv_req"], { status: "confirmed", displayPolicy: "visible" });
const permLevel = (n: number) => inferredAttribute(n, 0.7, ["test_perm"], { status: "inferred" }) as EventRealityNodeV0["permissionLevel"];
const boolTrue = () => inferredAttribute(true, 0.7, ["test_gate"], { status: "inferred", displayPolicy: "visible" });
const boolFalse = () => inferredAttribute(false, 0.7, ["test_absent"], { status: "inferred", displayPolicy: "visible" });
const gatesAbsent = () => ({ otherPeoplePossible: boolFalse(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() });
const CLEAR_PERM = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2) };
function confHard(b: ReturnType<typeof base>, ernId: string, perm: EventRealityNodeV0["permissionLevel"] = permLevel(2)): Partial<EventRealityNodeV0> {
  const f = b.ern.find((e) => e.eventRealityNodeId === ernId)!.fixedness;
  return { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: perm, fixedness: { ...f, status: "confirmed", source: "known_from_user", displayPolicy: "visible" } };
}

// 各 exposure の共通 fixture
const blockedSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(0) } } });
const silentSnap = () => snap(base([anchor({ id: "a1", startTime: "09:00", endTime: "10:00", locationText: "渋谷" })], NOON_UTC), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: gatesAbsent() } });
const observeSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: gatesAbsent() } });
function internalPrepareSnap() {
  const b = base([
    anchor({ id: "a1", startTime: "10:00", endTime: "12:00", locationText: "渋谷", rigidity: "soft" }),
    anchor({ id: "a2", startTime: "11:00", endTime: "13:00", locationText: "渋谷", rigidity: "soft" }),
  ]);
  const ov = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2) };
  return snap(b, { ernOverrides: { [ERN("a1")]: ov, [ERN("a2")]: ov }, csOverrides: { [ERN("a1")]: gatesAbsent(), [ERN("a2")]: gatesAbsent() } });
}
const askSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() } } });
const movementUnresolvedSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementRequired(), permissionLevel: permLevel(2) } }, csOverrides: { [ERN("a1")]: gatesAbsent() } });
function infeasibleSnap() {
  const b = base([
    anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
    anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
  ]);
  return snap(b, { ernOverrides: { [ERN("a1")]: confHard(b, ERN("a1")), [ERN("a2")]: confHard(b, ERN("a2")) }, csOverrides: { [ERN("a1")]: gatesAbsent(), [ERN("a2")]: gatesAbsent() } });
}
function sensitiveSnap() {
  return snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
    ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2), sensitiveFlagged: true } },
    csOverrides: { [ERN("a1")]: gatesAbsent() },
  });
}

describe("RJ2b #1 exposure none（blocked/silent）→ claims []", () => {
  it("blocked → claims []・suppressedClaimRefs 記録・walker []", () => {
    const { plan, claimSet } = claimsFor(blockedSnap(), EV("a1"));
    expect(plan.exposureLevel).toBe("none");
    expect(claimSet.claims).toEqual([]);
    expect(claimSet.suppressedClaimRefs.some((s) => s.reason.code.includes("claim_suppressed_exposure_none"))).toBe(true);
    expect(surfaceClaimSetViolations(claimSet)).toEqual([]);
    expect(surfaceClaimBindingViolations(plan, claimSet)).toEqual([]);
  });
  it("silent → claims []", () => {
    const { claimSet } = claimsFor(silentSnap(), { kind: "day" });
    expect(claimSet.claims).toEqual([]);
  });
});

describe("RJ2b #2 exposure internal_only（internal_prepare）→ claims []", () => {
  it("internal material を user-facing claim 化しない", () => {
    const { plan, claimSet } = claimsFor(internalPrepareSnap(), EV("a1"));
    expect(plan.exposureLevel).toBe("internal_only");
    expect(claimSet.claims).toEqual([]);
    expect(claimSet.suppressedClaimRefs.some((s) => s.reason.code.includes("claim_suppressed_exposure_internal_only"))).toBe(true);
    expect(surfaceClaimBindingViolations(plan, claimSet)).toEqual([]);
  });
});

describe("RJ2b #3 passive_only → passive/descriptive claim only", () => {
  it("observe → passive_observation claim・assertability ≤ hedged・confirmation_needed なし", () => {
    const { plan, claimSet } = claimsFor(observeSnap(), EV("a1"));
    expect(plan.exposureLevel).toBe("passive_only");
    expect(claimSet.claims.length).toBeGreaterThan(0);
    expect(claimSet.claims.some((c) => c.claimType === "passive_observation")).toBe(true);
    expect(claimSet.claims.some((c) => c.claimType === "confirmation_needed")).toBe(false);
    for (const c of claimSet.claims) expect(["observation_only", "hedged"]).toContain(c.assertability);
    expect(surfaceClaimSetViolations(claimSet)).toEqual([]);
    expect(surfaceClaimBindingViolations(plan, claimSet)).toEqual([]);
  });
});

describe("RJ2b #4 ask_eligible → confirmation_needed claim allowed, but no question text", () => {
  it("ask_clarification → confirmation_needed claim・claimTextDraft null・question text なし", () => {
    const { plan, claimSet } = claimsFor(askSnap(), EV("a1"));
    expect(plan.exposureLevel).toBe("ask_eligible");
    const cn = claimSet.claims.find((c) => c.claimType === "confirmation_needed");
    expect(cn).toBeTruthy();
    expect(cn!.claimTextDraft).toBeNull();
    expect(cn!.assertability).toBe("hedged"); // confirmation_needed は hedged 上限
    for (const k of ["questionText", "text", "copy", "question"]) expect(k in cn!).toBe(false);
    expect(surfaceClaimSetViolations(claimSet)).toEqual([]);
    expect(surfaceClaimBindingViolations(plan, claimSet)).toEqual([]);
  });
});

describe("RJ2b #5 feasibility infeasible でも verdict claim を作らない", () => {
  it("confirmed conflict day でも claimType に verdict 無し", () => {
    const { claimSet } = claimsFor(infeasibleSnap(), { kind: "day" });
    for (const c of claimSet.claims) {
      for (const t of ["feasible", "infeasible", "will_fail", "will_be_late", "on_time", "verdict"]) expect(c.claimType.includes(t)).toBe(false);
    }
    expect(surfaceClaimSetViolations(claimSet)).toEqual([]);
  });
});

describe("RJ2b #6 unresolved input → observation_only", () => {
  it("movement 未解決 → unresolved_input_present / movement_unresolved_reference が observation_only", () => {
    const { plan, claimSet } = claimsFor(movementUnresolvedSnap(), EV("a1"));
    expect(plan.exposureLevel).toBe("passive_only");
    const unresolved = claimSet.claims.filter((c) => c.claimType === "unresolved_input_present" || c.claimType === "movement_unresolved_reference");
    expect(unresolved.length).toBeGreaterThan(0);
    for (const c of unresolved) expect(c.assertability).toBe("observation_only");
    expect(surfaceClaimSetViolations(claimSet)).toEqual([]);
  });
});

describe("RJ2b #7 sensitive/displayRedactionRequired → genericizeRequired true", () => {
  it("sensitive flagged → genericizeRequired true・subject id のみ・category 非露出", () => {
    const { claimSet } = claimsFor(sensitiveSnap(), EV("a1"));
    expect(claimSet.claims.length).toBeGreaterThan(0);
    for (const c of claimSet.claims) {
      expect(c.redactionPolicy.genericizeRequired).toBe(true);
      expect(c.redactionPolicy.subjectExposesCategory).toBe(false);
      expect(c.subjectNodeId === null || c.subjectNodeId.startsWith("ern:")).toBe(true);
    }
    expect(surfaceClaimSetViolations(claimSet)).toEqual([]);
  });
});

describe("RJ2b #8 claimTextDraft always null", () => {
  it("全 claim で claimTextDraft null・copy field 不在", () => {
    for (const snapshot of [observeSnap(), askSnap(), movementUnresolvedSnap()]) {
      const { claimSet } = claimsFor(snapshot, EV("a1"));
      for (const c of claimSet.claims) {
        expect(c.claimTextDraft).toBeNull();
        for (const k of ["claimText", "text", "copy", "message"]) expect(k in c).toBe(false);
      }
    }
  });
});

describe("RJ2b #9 evidenceVisibility internal_trace_only", () => {
  it("全 claim で internal_trace_only", () => {
    const { claimSet } = claimsFor(observeSnap(), EV("a1"));
    for (const c of claimSet.claims) expect(c.evidenceContract.evidenceVisibility).toBe("internal_trace_only");
    expect(surfaceClaimSetViolations(claimSet)).toEqual([]);
  });
});

describe("RJ2b #10 actionAffordance always none", () => {
  it("全 claim で none", () => {
    for (const snapshot of [observeSnap(), askSnap()]) {
      const { claimSet } = claimsFor(snapshot, EV("a1"));
      for (const c of claimSet.claims) expect(c.actionAffordance).toBe("none");
    }
  });
});

describe("RJ2b #11 assertable only from confirmed bucket", () => {
  it("derive は assertable を出さない・walker は assertable + 非 confirmed を FAIL", () => {
    const { claimSet } = claimsFor(observeSnap(), EV("a1"));
    for (const c of claimSet.claims) if (c.assertability === "assertable") expect(c.evidenceContract.derivedFromBucket).toBe("confirmed");
    // 故意に assertable + inferred → violations 非空
    const c0 = claimSet.claims[0];
    const bad: SurfaceClaimV0 = { ...c0, assertability: "assertable", evidenceContract: { ...c0.evidenceContract, derivedFromBucket: "inferred" } };
    const v = surfaceClaimSetViolations({ ...claimSet, claims: [bad] });
    expect(v.some((m) => m.includes("assertable なのに derivedFromBucket が confirmed でない"))).toBe(true);
  });
});

describe("RJ2b #12 duplicate claimId fails", () => {
  it("set 内 duplicate claimId → surfaceClaimSetViolations 非空", () => {
    const { claimSet } = claimsFor(observeSnap(), EV("a1"));
    const c0 = claimSet.claims[0];
    const v = surfaceClaimSetViolations({ ...claimSet, claims: [c0, c0] });
    expect(v.some((m) => m.includes("duplicate claimId"))).toBe(true);
  });
});

describe("RJ2b #13 binding mismatch fails", () => {
  it("別 plan の claimSet を bind → surfaceClaimBindingViolations 非空・bindClaimsToPlan throw", () => {
    const a = claimsFor(observeSnap(), EV("a1"));
    const b = claimsFor(askSnap(), EV("a1"));
    const v = surfaceClaimBindingViolations(b.plan, a.claimSet); // plan B + claimSet A
    expect(v.some((m) => m.includes("surfacePlanId"))).toBe(true);
    expect(() => bindClaimsToPlan(b.plan, a.claimSet)).toThrow();
  });
});

describe("RJ2b #14 exposureBinding > plan exposure fails", () => {
  it("passive_only plan に ask_eligible claim → binding 非空", () => {
    const { plan, claimSet } = claimsFor(observeSnap(), EV("a1"));
    const c0 = claimSet.claims[0];
    const bad: SurfaceClaimV0 = { ...c0, exposureBinding: "ask_eligible" };
    const v = surfaceClaimBindingViolations(plan, { ...claimSet, claims: [bad] });
    expect(v.some((m) => m.includes("exposureBinding が plan.exposureLevel を超える"))).toBe(true);
  });
});

describe("RJ2b #15 internal_only exposureBinding fails", () => {
  it("claim exposureBinding internal_only → set + binding 非空", () => {
    const { plan, claimSet } = claimsFor(observeSnap(), EV("a1"));
    const c0 = claimSet.claims[0];
    const bad: SurfaceClaimV0 = { ...c0, exposureBinding: "internal_only" };
    expect(surfaceClaimSetViolations({ ...claimSet, claims: [bad] }).some((m) => m.includes("claim 経路に乗せない"))).toBe(true);
    expect(surfaceClaimBindingViolations(plan, { ...claimSet, claims: [bad] }).some((m) => m.includes("claim 経路に乗せない"))).toBe(true);
  });
});

describe("RJ2b #16 confirmation_needed outside ask_eligible fails", () => {
  it("confirmation_needed claim を passive_only exposureBinding に → set 非空", () => {
    const { claimSet } = claimsFor(observeSnap(), EV("a1"));
    const c0 = claimSet.claims[0];
    const bad: SurfaceClaimV0 = { ...c0, claimType: "confirmation_needed", exposureBinding: "passive_only" };
    const v = surfaceClaimSetViolations({ ...claimSet, claims: [bad] });
    expect(v.some((m) => m.includes("confirmation_needed が ask_eligible 以外で出ている"))).toBe(true);
  });
});

describe("RJ2b #17 BoundSurfaceV0 is internal only / not consumer payload", () => {
  it("bindClaimsToPlan → plan+claimSet を内包・consumer payload field 無し", () => {
    const { plan, claimSet } = claimsFor(askSnap(), EV("a1"));
    const bound = bindClaimsToPlan(plan, claimSet);
    expect(bound.surfacePlanId).toBe(plan.trace.surfacePlanId);
    expect(bound.surfacePlan).toBe(plan);
    expect(bound.claimSet).toBe(claimSet);
    for (const k of ["copy", "text", "html", "render", "payload", "notification", "graphViewerKey"]) expect(k in bound).toBe(false);
  });
});

describe("RJ2b #18 IO 不接触（source-scan）", () => {
  it("surfaceClaim.ts に fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/surfaceClaim.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RJ2b integrity guard", () => {
  it("plan が別 snapshot 由来 → throw", () => {
    const a = chain(observeSnap(), EV("a1"));
    // 別 anchor 内容 → 別 snapshotId の chain
    const sb = snap(base([anchor({ id: "zz", startTime: "09:00", endTime: "10:00" })]), { csOverrides: { [ERN("zz")]: gatesAbsent() } });
    const b = chain(sb, { kind: "day" });
    // plan A + decision B（別 snapshot）
    expect(() =>
      deriveSurfaceClaims({ surfacePlan: a.plan, feasibilityJudgment: a.fj, collapseRiskProfile: a.crp, interventionEligibility: a.elig, interventionDecision: b.dec }),
    ).toThrow();
  });
});

describe("RJ2b happy-path: bindClaimsToPlan は全 exposure で通る or 正しく空", () => {
  it("各 exposure で setViolations [] / bindingViolations []", () => {
    const cases: Array<{ s: ReturnType<typeof snap>; scope: TargetScope }> = [
      { s: blockedSnap(), scope: EV("a1") },
      { s: silentSnap(), scope: { kind: "day" } },
      { s: observeSnap(), scope: EV("a1") },
      { s: internalPrepareSnap(), scope: EV("a1") },
      { s: askSnap(), scope: EV("a1") },
      { s: movementUnresolvedSnap(), scope: EV("a1") },
    ];
    for (const c of cases) {
      const { plan, claimSet } = claimsFor(c.s, c.scope);
      expect(surfaceClaimSetViolations(claimSet)).toEqual([]);
      expect(surfaceClaimBindingViolations(plan, claimSet)).toEqual([]);
      expect(() => bindClaimsToPlan(plan, claimSet)).not.toThrow();
    }
  });
});
