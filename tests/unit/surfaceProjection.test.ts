/**
 * deriveSurfaceProjection / 2-walker（RJ2d = SurfaceProjection ConsumerView v0）— CEO 必須 16 fixtures + serialization backstop
 * 正本: docs/reality-surface-projection-impl-design-rj2d-0.md（RJ2d-0A revised・red-team 反映）
 *
 * 核: 内部 object → consumer-facing object の唯一の境界。ただし copy（文面）は出さない（RJ2e HOLD）。
 *   allowlist 構築（strip しない）・ConsumerView/InternalBundle 型分離・consumer-safe kind 変換・id/trace/metadata 全除去・
 *   opaque projection-local ref・boundary boolean only・serialization backstop・5 walker validated binding failure-loud。
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
import { inferredAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { EventRealityNodeV0 } from "@/lib/plan/realityCore/eventRealityNode";
import type { CommitmentSignalV0 } from "@/lib/plan/realityCore/commitmentSignal";
import { buildRealityJudgmentInput, type TargetScope } from "@/lib/plan/realityCore/realityJudgmentInput";
import { evaluateFeasibility } from "@/lib/plan/realityCore/feasibilityJudgment";
import { evaluateCollapseRisk } from "@/lib/plan/realityCore/collapseRisk";
import { evaluateCollapsePropagation } from "@/lib/plan/realityCore/collapsePropagation";
import { evaluateInterventionEligibility } from "@/lib/plan/realityCore/interventionEligibility";
import { evaluateInterventionDecision } from "@/lib/plan/realityCore/interventionDecision";
import { deriveSurfacePlan, type JudgmentSurfacePlanV0 } from "@/lib/plan/realityCore/judgmentSurfacePlan";
import { deriveSurfaceClaims, bindClaimsToPlan } from "@/lib/plan/realityCore/surfaceClaim";
import { deriveClarificationQuestions } from "@/lib/plan/realityCore/clarificationQuestion";
import {
  deriveSurfaceProjection,
  surfaceProjectionConsumerViewViolations,
  surfaceProjectionBindingViolations,
  type SurfaceProjectionConsumerViewV0,
} from "@/lib/plan/realityCore/surfaceProjection";

const DATE = "2026-06-12";
const VIEWER = graphViewerKey("viewer-self");
const EARLY_UTC = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00

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

function projectionFor(snapshot: ReturnType<typeof snap>, scope: TargetScope) {
  const c = chain(snapshot, scope);
  const claimSet = deriveSurfaceClaims({ surfacePlan: c.plan, feasibilityJudgment: c.fj, collapseRiskProfile: c.crp, interventionEligibility: c.elig, interventionDecision: c.dec });
  const bound = bindClaimsToPlan(c.plan, claimSet);
  const questionSet = deriveClarificationQuestions({ surfacePlan: c.plan, feasibilityJudgment: c.fj, collapseRiskProfile: c.crp, interventionEligibility: c.elig, interventionDecision: c.dec });
  const bundle = deriveSurfaceProjection({ boundSurface: bound, questionSet });
  return { plan: c.plan, claimSet, bound, questionSet, bundle, view: bundle.consumerView };
}

const ERN = (id: string) => `ern:${DATE}:${id}`;
const EV = (id: string): TargetScope => ({ kind: "event", eventRealityNodeId: ERN(id) });
const placeConfirmed = () => inferredAttribute(0.9, 0.9, ["test_place"], { status: "confirmed", displayPolicy: "visible" });
const movementNotRequired = () => inferredAttribute(false, 0.9, ["test_no_mv"], { status: "confirmed", displayPolicy: "visible" });
const permLevel = (n: number) => inferredAttribute(n, 0.7, ["test_perm"], { status: "inferred" }) as EventRealityNodeV0["permissionLevel"];
const boolTrue = () => inferredAttribute(true, 0.7, ["test_gate"], { status: "inferred", displayPolicy: "visible" });
const boolFalse = () => inferredAttribute(false, 0.7, ["test_absent"], { status: "inferred", displayPolicy: "visible" });
const gatesAbsent = () => ({ otherPeoplePossible: boolFalse(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() });
const CLEAR_PERM = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2) };
function confHard(b: ReturnType<typeof base>, ernId: string): Partial<EventRealityNodeV0> {
  const f = b.ern.find((e) => e.eventRealityNodeId === ernId)!.fixedness;
  return { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2), fixedness: { ...f, status: "confirmed", source: "known_from_user", displayPolicy: "visible" } };
}

const blockedSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(0) } } });
function internalPrepareSnap() {
  const b = base([anchor({ id: "a1", startTime: "10:00", endTime: "12:00", locationText: "渋谷", rigidity: "soft" }), anchor({ id: "a2", startTime: "11:00", endTime: "13:00", locationText: "渋谷", rigidity: "soft" })]);
  const ov = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2) };
  return snap(b, { ernOverrides: { [ERN("a1")]: ov, [ERN("a2")]: ov }, csOverrides: { [ERN("a1")]: gatesAbsent(), [ERN("a2")]: gatesAbsent() } });
}
const observeSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: gatesAbsent() } });
const gateSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() } } });
// 全 gate（otherPeople+reservation+work+sensitive）→ 4 confirm question → 全 needs_verification
const fourGateSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: { ...CLEAR_PERM, sensitiveFlagged: true } }, csOverrides: { [ERN("a1")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolTrue(), workOrShiftPossible: boolTrue() } } });
function collisionSnap(ids: string[]) {
  const b = base(ids.map((id) => anchor({ id, startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" })));
  const ernOverrides: Record<string, Partial<EventRealityNodeV0>> = {};
  const csOverrides: Record<string, Partial<CommitmentSignalV0>> = {};
  for (const id of ids) { ernOverrides[ERN(id)] = confHard(b, ERN(id)); csOverrides[ERN(id)] = gatesAbsent(); }
  return snap(b, { ernOverrides, csOverrides });
}

describe("RJ2d #1 exposure none/internal_only → display suppress・claims []・questions []", () => {
  it("blocked（none）→ suppress", () => {
    const { view } = projectionFor(blockedSnap(), EV("a1"));
    expect(view.display).toBe("suppress");
    expect(view.claims).toEqual([]);
    expect(view.questions).toEqual([]);
    expect(surfaceProjectionConsumerViewViolations(view)).toEqual([]);
  });
  it("internal_prepare（internal_only）→ suppress", () => {
    const { plan, view } = projectionFor(internalPrepareSnap(), EV("a1"));
    expect(plan.exposureLevel).toBe("internal_only");
    expect(view.display).toBe("suppress");
    expect(view.claims).toEqual([]);
    expect(view.questions).toEqual([]);
  });
});

describe("RJ2d #2 passive_only → display render・claims only・consumer-safe kind", () => {
  it("observe → render・claims 非空・questions []", () => {
    const { plan, view } = projectionFor(observeSnap(), EV("a1"));
    expect(plan.exposureLevel).toBe("passive_only");
    expect(view.display).toBe("render");
    expect(view.claims.length).toBeGreaterThan(0);
    expect(view.questions).toEqual([]);
    for (const c of view.claims) expect(["observation", "status_note", "info_incomplete", "needs_confirmation"]).toContain(c.kind);
    expect(surfaceProjectionConsumerViewViolations(view)).toEqual([]);
  });
});

describe("RJ2d #3 ask_eligible → claims + questions・consumer-safe kind", () => {
  it("gate → render・claims + questions", () => {
    const { plan, view } = projectionFor(gateSnap(), EV("a1"));
    expect(plan.exposureLevel).toBe("ask_eligible");
    expect(view.display).toBe("render");
    expect(view.questions.length).toBeGreaterThan(0);
    for (const q of view.questions) expect(["needs_verification", "resolve_overlap", "resolve_missing_info"]).toContain(q.kind);
    expect(surfaceProjectionConsumerViewViolations(view)).toEqual([]);
  });
});

describe("RJ2d #4 consumer-safe kind 変換で internal kind が出ない", () => {
  it("internal claimType/questionKind 文字列が view に出ない", () => {
    const { view } = projectionFor(fourGateSnap(), EV("a1"));
    const json = JSON.stringify(view);
    for (const internal of ["passive_observation", "collapse_fragility_present", "unresolved_input_present", "movement_unresolved_reference", "confirmation_needed", "confirm_other_people", "confirm_reservation_payment", "confirm_work_shift", "confirm_sensitive_handling", "resolve_time_collision_ambiguity", "resolve_unresolved_input"]) {
      expect(json.includes(internal)).toBe(false);
    }
  });
});

describe("RJ2d #5 4 gate question がすべて needs_verification になる", () => {
  it("otherPeople+reservation+work+sensitive → 全 needs_verification（区別不能）", () => {
    const { view } = projectionFor(fourGateSnap(), EV("a1"));
    expect(view.questions.length).toBe(4);
    expect(view.questions.every((q) => q.kind === "needs_verification")).toBe(true);
    expect(new Set(view.questions.map((q) => q.kind)).size).toBe(1); // sensitive と work/reservation/otherPeople が同一
  });
});

describe("RJ2d #6/#7 consumer view に decision metadata / 内部 id が無い", () => {
  it("evidence/source/missing/trace/gate/why/derivedFrom/assertability/genericized/redactionApplied/projectionId/surfacePlanId/snapshotId/graphViewerKey が無い", () => {
    const { view } = projectionFor(gateSnap(), EV("a1"));
    for (const k of ["evidenceRefs", "evidenceContract", "sourceRefs", "missingInputRefs", "trace", "projectionTrace", "gateReasonCode", "whyAsked", "whyAssertable", "derivedFromBucket", "derivedFromGate", "assertability", "genericized", "redactionApplied", "redactionPolicy", "relatedClaimRefs", "projectionId", "surfacePlanId", "snapshotId", "graphViewerKey", "displayPolicy", "exposureLevel"]) {
      expect(k in view).toBe(false);
    }
    for (const c of view.claims) for (const k of ["assertability", "genericized", "evidenceContract", "sourceRefs", "whyAssertable", "claimId"]) expect(k in c).toBe(false);
    for (const q of view.questions) for (const k of ["gateReasonCode", "relatedClaimRefs", "whyAsked", "evidenceContract", "answerShape", "questionId"]) expect(k in q).toBe(false);
  });
});

describe("RJ2d #8 raw ern:/cl:/q:/sp:/pj:/relationId が出ない + opaque ref projection-local", () => {
  it("subjectRef/relationRef は subject_/relation_ prefix・raw id 不在", () => {
    const { view } = projectionFor(collisionSnap(["a1", "a2"]), { kind: "day" });
    for (const c of view.claims) expect(c.subjectRef === null || c.subjectRef.startsWith("subject_")).toBe(true);
    for (const q of view.questions) {
      expect(q.subjectRef === null || q.subjectRef.startsWith("subject_")).toBe(true);
      expect(q.relationRef === null || q.relationRef.startsWith("relation_")).toBe(true);
    }
    expect(surfaceProjectionConsumerViewViolations(view)).toEqual([]);
  });
});

describe("RJ2d #9 proposalAvailable/departureAvailable false・reason 文字列なし", () => {
  it("boundary は boolean のみ", () => {
    const { view } = projectionFor(gateSnap(), EV("a1"));
    expect(view.proposalAvailable).toBe(false);
    expect(view.departureAvailable).toBe(false);
    for (const k of ["proposalBoundary", "departureBoundary", "internalReasons"]) expect(k in view).toBe(false);
    expect(JSON.stringify(view).includes("rj2d")).toBe(false);
    expect(JSON.stringify(view).includes("hold")).toBe(false);
  });
});

describe("RJ2d #11 withheld claim は射影しない", () => {
  it("projectedClaims は claimSet の非 withheld 件数と一致", () => {
    const { claimSet, view } = projectionFor(observeSnap(), EV("a1"));
    const nonWithheld = claimSet.claims.filter((c) => c.assertability !== "withheld").length;
    expect(view.claims.length).toBe(nonWithheld);
  });
});

describe("RJ2d #10 internal bundle は projectionId/surfacePlanId/trace を持つが consumerView は持たない", () => {
  it("型分離（CEO #1/2）", () => {
    const { bundle, view } = projectionFor(gateSnap(), EV("a1"));
    expect(bundle.projectionId.startsWith("pj:")).toBe(true);
    expect(bundle.surfacePlanId.startsWith("sp:")).toBe(true);
    expect(bundle.projectionTrace.snapshotId).toBeTruthy();
    expect("projectionId" in view).toBe(false);
    expect("projectionTrace" in view).toBe(false);
    expect("surfacePlanId" in view).toBe(false);
  });
});

describe("RJ2d #12/#13 validated binding failure → throw（5 walker 全実行）", () => {
  it("binding mismatch（別 plan の questionSet）→ throw", () => {
    const a = projectionFor(gateSnap(), EV("a1"));
    const bSnap = snap(base([anchor({ id: "b9", startTime: "10:00", endTime: "11:00", locationText: "新宿" })]), { ernOverrides: { [ERN("b9")]: CLEAR_PERM }, csOverrides: { [ERN("b9")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() } } });
    const b = projectionFor(bSnap, EV("b9"));
    expect(() => deriveSurfaceProjection({ boundSurface: a.bound, questionSet: b.questionSet })).toThrow();
  });
  it("plan に violation（departureLineRefs 非空）→ surfacePlanViolations walker が捕捉して throw", () => {
    const a = projectionFor(gateSnap(), EV("a1"));
    const tamperedPlan: JudgmentSurfacePlanV0 = { ...a.plan, departureLineRefs: ["x"] };
    const tamperedBound = { ...a.bound, surfacePlan: tamperedPlan };
    expect(() => deriveSurfaceProjection({ boundSurface: tamperedBound, questionSet: a.questionSet })).toThrow();
    // surfaceProjectionBindingViolations が surfacePlanViolations を含むことを確認
    expect(surfaceProjectionBindingViolations(tamperedBound, a.questionSet).some((m) => m.includes("departureLineRefs"))).toBe(true);
  });
});

describe("RJ2d #14 consumer view の Object.keys 完全一致", () => {
  it("未知 key 追加 → violations 非空・正常 → []", () => {
    const { view } = projectionFor(gateSnap(), EV("a1"));
    expect(surfaceProjectionConsumerViewViolations(view)).toEqual([]);
    const tampered = { ...view, leakedField: "x" } as unknown as SurfaceProjectionConsumerViewV0;
    expect(surfaceProjectionConsumerViewViolations(tampered).some((m) => m.includes("許可集合と不一致"))).toBe(true);
  });
});

describe("RJ2d #15 serialization backstop", () => {
  it("正常 view → backstop PASS・raw id 注入 → 禁止トークン検出", () => {
    const { view } = projectionFor(gateSnap(), EV("a1"));
    expect(surfaceProjectionConsumerViewViolations(view)).toEqual([]);
    const leaked = { ...view, claims: [{ kind: "observation" as const, subjectRef: `ern:${DATE}:a1` }] } as unknown as SurfaceProjectionConsumerViewV0;
    const v = surfaceProjectionConsumerViewViolations(leaked);
    expect(v.some((m) => m.includes("禁止トークン") || m.includes("opaque でない"))).toBe(true);
  });
  it("全 fixture で JSON.stringify(view) に禁止トークンが出ない", () => {
    const fixtures = [
      projectionFor(blockedSnap(), EV("a1")),
      projectionFor(internalPrepareSnap(), EV("a1")),
      projectionFor(observeSnap(), EV("a1")),
      projectionFor(gateSnap(), EV("a1")),
      projectionFor(fourGateSnap(), EV("a1")),
      projectionFor(collisionSnap(["a1", "a2", "a3"]), { kind: "day" }),
    ];
    const forbidden = ["ern:", "cl:", "q:", "sp:", "pj:", "snapshot", "evidence", "sourcerefs", "missinginput", "trace", "gate", "derivedfrom", "why", "sensitive", "reservation", "work", "otherpeople", "confirmed", "inferred", "rj2d", "_v0", "graphviewerkey"];
    for (const f of fixtures) {
      const json = JSON.stringify(f.view).toLowerCase();
      for (const t of forbidden) expect(json.includes(t)).toBe(false);
      expect(surfaceProjectionConsumerViewViolations(f.view)).toEqual([]);
    }
  });
});

describe("RJ2d #16 IO 不接触（source-scan）", () => {
  it("surfaceProjection.ts に fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/surfaceProjection.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});
