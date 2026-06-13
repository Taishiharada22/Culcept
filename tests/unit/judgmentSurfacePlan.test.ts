/**
 * deriveSurfacePlan（RJ2a = JudgmentSurfacePlan / surface exposure envelope v0）— §6 fixtures 16 件 + guard
 * 正本: docs/reality-judgment-surface-boundary-rj2-0.md（RJ2-0/RJ2-0A）+ docs/reality-surface-plan-impl-design-rj2a-0.md
 *
 * 核: InterventionDecision を受けて exposure 包絡 + suppression honesty + walker を組む。文面/通知/提案/質問/出発線は生成しない。
 *   exposure ≤ decisionKind ≤ actionBoundary（INV-4）。internal_prepare → internal_only（user-facing でない・RJ2a-0A）。
 *   CEO 防御ガード: actionBoundary cap 検証・ask_eligible は ask_clarification の時のみ・draft_only を user-facing ask に進ませない。
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
import { deriveSurfacePlan, surfacePlanViolations, type JudgmentSurfacePlanV0 } from "@/lib/plan/realityCore/judgmentSurfacePlan";

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

function planFor(snapshot: ReturnType<typeof snap>, scope: TargetScope): JudgmentSurfacePlanV0 {
  const fj = evaluateFeasibility(buildRealityJudgmentInput(snapshot, scope));
  const crp = evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment: fj });
  const prop = evaluateCollapsePropagation({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp });
  const elig = evaluateInterventionEligibility({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, targetScope: scope });
  const dec = evaluateInterventionDecision({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, interventionEligibility: elig });
  return deriveSurfacePlan({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, interventionEligibility: elig, interventionDecision: dec });
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
function confHard(b: ReturnType<typeof base>, ernId: string, perm: EventRealityNodeV0["permissionLevel"] = permLevel(2)): Partial<EventRealityNodeV0> {
  const f = b.ern.find((e) => e.eventRealityNodeId === ernId)!.fixedness;
  return { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: perm, fixedness: { ...f, status: "confirmed", source: "known_from_user", displayPolicy: "visible" } };
}

// 各 decisionKind を作る共通 fixture
const blockedSnap = () =>
  snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
    ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(0) } },
  });
const silentSnap = () =>
  snap(base([anchor({ id: "a1", startTime: "09:00", endTime: "10:00", locationText: "渋谷" })], NOON_UTC), {
    ernOverrides: { [ERN("a1")]: CLEAR_PERM },
    csOverrides: { [ERN("a1")]: gatesAbsent() },
  });
const observeSnap = () =>
  snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
    ernOverrides: { [ERN("a1")]: CLEAR_PERM },
    csOverrides: { [ERN("a1")]: gatesAbsent() },
  });
function internalPrepareSnap() {
  const b = base([
    anchor({ id: "a1", startTime: "10:00", endTime: "12:00", locationText: "渋谷", rigidity: "soft" }),
    anchor({ id: "a2", startTime: "11:00", endTime: "13:00", locationText: "渋谷", rigidity: "soft" }),
  ]);
  const ov = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2) };
  return snap(b, { ernOverrides: { [ERN("a1")]: ov, [ERN("a2")]: ov }, csOverrides: { [ERN("a1")]: gatesAbsent(), [ERN("a2")]: gatesAbsent() } });
}
const askSnap = () =>
  snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
    ernOverrides: { [ERN("a1")]: CLEAR_PERM },
    csOverrides: { [ERN("a1")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() } },
  });

describe("RJ2a #1 blocked → all refs empty・exposureLevel none", () => {
  it("permission 0 → blocked → exposureLevel none・全 ref []・suppressedSurfaces 記録・violations []", () => {
    const p = planFor(blockedSnap(), EV("a1"));
    expect(p.carriedDecisionKind).toBe("blocked");
    expect(p.exposureLevel).toBe("none");
    expect(p.allowedClaimRefs).toEqual([]);
    expect(p.clarificationCandidateRefs).toEqual([]);
    expect(p.proposalCandidateRefs).toEqual([]);
    expect(p.departureLineRefs).toEqual([]);
    expect(p.displayPolicy).toBe("notActionable");
    expect(p.suppressedSurfaces.some((s) => s.reason.code === "surface_suppressed_blocked")).toBe(true);
    expect(surfacePlanViolations(p)).toEqual([]);
  });
});

describe("RJ2a #2 silent → no contact / no output refs", () => {
  it("全 past day → silent → exposureLevel none・clarificationCandidateRefs []・silent 専用 suppress", () => {
    const p = planFor(silentSnap(), { kind: "day" });
    expect(p.carriedDecisionKind).toBe("silent");
    expect(p.exposureLevel).toBe("none");
    expect(p.clarificationCandidateRefs).toEqual([]);
    expect(p.suppressedSurfaces.some((s) => s.reason.code === "surface_suppressed_silent_no_contact")).toBe(true);
    expect(surfacePlanViolations(p)).toEqual([]);
  });
});

describe("RJ2a #3 observe → passive_only・no clarification", () => {
  it("clean observe → exposureLevel passive_only・clarificationOnly false・候補 []", () => {
    const p = planFor(observeSnap(), EV("a1"));
    expect(p.carriedDecisionKind).toBe("observe");
    expect(p.exposureLevel).toBe("passive_only");
    expect(p.clarificationOnly).toBe(false);
    expect(p.clarificationCandidateRefs).toEqual([]);
    expect(p.displayPolicy).toBe("visible");
    expect(surfacePlanViolations(p)).toEqual([]);
  });
});

describe("RJ2a #4 internal_prepare → internal_only・no user-facing refs・no copy", () => {
  it("allowed+collapse elevated → internal_prepare → internal_only（passive_only でない）・全 ref []・copy field 不在", () => {
    const p = planFor(internalPrepareSnap(), EV("a1"));
    expect(p.carriedDecisionKind).toBe("internal_prepare");
    expect(p.carriedActionBoundary).toBe("draft_only");
    expect(p.exposureLevel).toBe("internal_only"); // ★ passive_only でない
    expect(p.allowedClaimRefs).toEqual([]);
    expect(p.clarificationCandidateRefs).toEqual([]);
    expect(p.proposalCandidateRefs).toEqual([]);
    expect(p.departureLineRefs).toEqual([]);
    expect(p.clarificationOnly).toBe(false);
    expect(p.displayPolicy).toBe("notActionable"); // internal_only は user-facing でない
    // copy/user-facing emission field 不在
    for (const k of ["copy", "text", "claimTextDraft", "userMessage", "passiveSurface", "userFacingSurface"]) expect(k in p).toBe(false);
    // suppressedSurfaces は silent/blocked と別理由（internal preparation は allowed）
    expect(p.suppressedSurfaces.some((s) => s.reason.code === "user_facing_suppressed_internal_only_boundary")).toBe(true);
    expect(p.suppressedSurfaces.some((s) => s.reason.code.includes("silent") || s.reason.code.includes("blocked"))).toBe(false);
    expect(surfacePlanViolations(p)).toEqual([]);
  });
});

describe("RJ2a #5 ask_clarification → ask_eligible・clarificationOnly true・候補は RJ2c ゆえ []", () => {
  it("confirmed gate → ask_clarification → ask_eligible・clarificationOnly true・clarificationCandidateRefs []", () => {
    const p = planFor(askSnap(), EV("a1"));
    expect(p.carriedDecisionKind).toBe("ask_clarification");
    expect(p.carriedActionBoundary).toBe("ask_confirmation");
    expect(p.exposureLevel).toBe("ask_eligible");
    expect(p.clarificationOnly).toBe(true);
    expect(p.clarificationCandidateRefs).toEqual([]); // RJ2a は候補生成しない
    expect(surfacePlanViolations(p)).toEqual([]);
  });
});

describe("RJ2a #6 observe + ambiguity → clarificationOnly false", () => {
  it("同一 window ambiguity でも decisionKind observe（display_only cap）→ clarificationOnly false", () => {
    // permission unknown → display_only cap → ambiguity でも decisionKind ≤ observe
    const b = base([
      anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" }),
    ]);
    const s = snap(b, {
      ernOverrides: { [ERN("a1")]: confHard(b, ERN("a1"), unknownAttribute()), [ERN("a2")]: confHard(b, ERN("a2"), unknownAttribute()) },
      csOverrides: { [ERN("a1")]: gatesAbsent(), [ERN("a2")]: gatesAbsent() },
    });
    const p = planFor(s, { kind: "day" });
    expect(["silent", "observe"]).toContain(p.carriedDecisionKind);
    expect(p.clarificationOnly).toBe(false);
    expect(p.exposureLevel === "none" || p.exposureLevel === "passive_only").toBe(true);
    expect(surfacePlanViolations(p)).toEqual([]);
  });
});

describe("RJ2a #7 leaveBy null + ask_clarification → departureLineRefs []", () => {
  it("movement 未解決 + ask → departureLineRefs []・suppressedSurfaces に departure", () => {
    const p = planFor(askSnap(), EV("a1"));
    expect(p.departureLineRefs).toEqual([]);
    expect(p.suppressedSurfaces.some((s) => s.surfaceKind === "departure_line")).toBe(true);
    expect(surfacePlanViolations(p)).toEqual([]);
  });
});

describe("RJ2a #8 notActionable では kill しない", () => {
  it("observe（displayPolicy visible）で passive・silent/blocked のみ none。notActionable を kill 入力にしない", () => {
    const observe = planFor(observeSnap(), EV("a1"));
    expect(observe.exposureLevel).toBe("passive_only"); // notActionable 由来でなく decisionKind 由来
    expect(observe.displayPolicy).toBe("visible");
    // internal_prepare は notActionable だが exposureLevel internal_only（kill されていない＝内部準備 boundary は生きている）
    const internal = planFor(internalPrepareSnap(), EV("a1"));
    expect(internal.displayPolicy).toBe("notActionable");
    expect(internal.exposureLevel).toBe("internal_only");
  });
});

describe("RJ2a #9 active_prompt present → no dispatch field", () => {
  it("deliveryModeCeiling に関わらず plan に dispatch/delivery field 無し（INV-11）", () => {
    const p = planFor(askSnap(), EV("a1"));
    for (const k of ["dispatch", "deliveryMode", "deliveryModeCeiling", "push", "activePrompt", "notify"]) expect(k in p).toBe(false);
    expect(surfacePlanViolations(p)).toEqual([]);
  });
});

describe("RJ2a #10 graphViewerKey not authority / not exposed", () => {
  it("plan / sourceRefs / trace に graphViewerKey field 無し・snapshotId は擬名化形式", () => {
    const p = planFor(observeSnap(), EV("a1"));
    expect("graphViewerKey" in p).toBe(false);
    expect("graphViewerKey" in p.sourceRefs).toBe(false);
    expect("graphViewerKey" in p.trace).toBe(false);
    expect("viewerId" in p).toBe(false);
    expect(surfacePlanViolations(p)).toEqual([]);
  });
});

describe("RJ2a #11 claimTextDraft absent/null", () => {
  it("plan に text/copy/claimTextDraft field 無し（型 + 構造 assert・RJ2e HOLD）", () => {
    const p = planFor(observeSnap(), EV("a1"));
    for (const k of ["claimTextDraft", "draftText", "text", "copy", "message"]) expect(k in p).toBe(false);
    expect(surfacePlanViolations(p)).toEqual([]);
  });
});

describe("RJ2a #12 exposureLevel ≤ decisionKind ≤ actionBoundary（全 case violations []）", () => {
  it("blocked/silent/observe/internal_prepare/ask_clarification の各 case で violations []", () => {
    const cases: Array<{ p: JudgmentSurfacePlanV0; kind: string }> = [
      { p: planFor(blockedSnap(), EV("a1")), kind: "blocked" },
      { p: planFor(silentSnap(), { kind: "day" }), kind: "silent" },
      { p: planFor(observeSnap(), EV("a1")), kind: "observe" },
      { p: planFor(internalPrepareSnap(), EV("a1")), kind: "internal_prepare" },
      { p: planFor(askSnap(), EV("a1")), kind: "ask_clarification" },
    ];
    for (const c of cases) {
      expect(c.p.carriedDecisionKind).toBe(c.kind);
      expect(surfacePlanViolations(c.p)).toEqual([]);
    }
  });
});

describe("RJ2a #13 integrity guard: 別 snapshot/別 chain → throw", () => {
  it("decision/eligibility が別 snapshot 由来 → throw", () => {
    const sa = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM } });
    const sb = snap(base([anchor({ id: "zz", startTime: "09:00", endTime: "10:00" })]));
    const fjA = evaluateFeasibility(buildRealityJudgmentInput(sa, EV("a1")));
    const crpA = evaluateCollapseRisk({ graphSnapshot: sa, feasibilityJudgment: fjA });
    const propA = evaluateCollapsePropagation({ graphSnapshot: sa, feasibilityJudgment: fjA, collapseRiskProfile: crpA });
    const eligA = evaluateInterventionEligibility({ graphSnapshot: sa, feasibilityJudgment: fjA, collapseRiskProfile: crpA, collapsePropagationMap: propA, targetScope: EV("a1") });
    const decA = evaluateInterventionDecision({ graphSnapshot: sa, feasibilityJudgment: fjA, collapseRiskProfile: crpA, collapsePropagationMap: propA, interventionEligibility: eligA });
    const fjB = evaluateFeasibility(buildRealityJudgmentInput(sb, { kind: "day" }));
    const crpB = evaluateCollapseRisk({ graphSnapshot: sb, feasibilityJudgment: fjB });
    const propB = evaluateCollapsePropagation({ graphSnapshot: sb, feasibilityJudgment: fjB, collapseRiskProfile: crpB });
    const eligB = evaluateInterventionEligibility({ graphSnapshot: sb, feasibilityJudgment: fjB, collapseRiskProfile: crpB, collapsePropagationMap: propB, targetScope: { kind: "day" } });
    const decB = evaluateInterventionDecision({ graphSnapshot: sb, feasibilityJudgment: fjB, collapseRiskProfile: crpB, collapsePropagationMap: propB, interventionEligibility: eligB });
    // decision が別 snapshot(B) 由来
    expect(() =>
      deriveSurfacePlan({ graphSnapshot: sa, feasibilityJudgment: fjA, collapseRiskProfile: crpA, collapsePropagationMap: propA, interventionEligibility: eligA, interventionDecision: decB }),
    ).toThrow();
  });
});

describe("RJ2a #14 IO 不接触（source-scan）", () => {
  it("judgmentSurfacePlan.ts に fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/judgmentSurfacePlan.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RJ2a #15 internal_prepare の exposureLevel/clarificationOnly 違反検出", () => {
  it("正常 internal_prepare → []・故意に passive_only / user-facing refs / clarificationOnly=true にすると violations 非空", () => {
    const p = planFor(internalPrepareSnap(), EV("a1"));
    expect(surfacePlanViolations(p)).toEqual([]);
    // #15 passive_only に化けさせる → 写像不一致 + internal_prepare passive_only の二重検出
    const v15 = surfacePlanViolations({ ...p, exposureLevel: "passive_only" });
    expect(v15.some((m) => m.includes("internal_prepare なのに exposureLevel passive_only"))).toBe(true);
    expect(v15.some((m) => m.includes("直接写像と不一致"))).toBe(true);
    // #16 user-facing refs を非空に
    const v16 = surfacePlanViolations({ ...p, allowedClaimRefs: ["claim:x"] });
    expect(v16.some((m) => m.includes("internal_prepare なのに user-facing refs"))).toBe(true);
    // #17 clarificationOnly=true に
    const v17 = surfacePlanViolations({ ...p, clarificationOnly: true });
    expect(v17.some((m) => m.includes("internal_prepare なのに clarificationOnly=true"))).toBe(true);
  });
  it("display_only/blocked で ask_eligible に化けさせると防御ガードが FAIL（draft_only も user-facing ask 不可）", () => {
    const obs = planFor(observeSnap(), EV("a1")); // display_only
    const vAsk = surfacePlanViolations({ ...obs, exposureLevel: "ask_eligible" });
    expect(vAsk.some((m) => m.includes("ceiling を超える") || m.includes("ask_eligible が ask_clarification"))).toBe(true);
    const internal = planFor(internalPrepareSnap(), EV("a1")); // draft_only
    const vDraft = surfacePlanViolations({ ...internal, exposureLevel: "ask_eligible" });
    expect(vDraft.some((m) => m.includes("ceiling を超える") || m.includes("ask_eligible が ask_clarification"))).toBe(true);
  });
});

describe("RJ2a #16 suppressedSurfaces は silent/blocked/internal_prepare/observe を別 reason で分ける", () => {
  it("4 decisionKind の suppressedSurfaces 特徴 reason code が相互に異なる", () => {
    const codeOf = (p: JudgmentSurfacePlanV0) => new Set(p.suppressedSurfaces.map((s) => s.reason.code));
    const blocked = codeOf(planFor(blockedSnap(), EV("a1")));
    const silent = codeOf(planFor(silentSnap(), { kind: "day" }));
    const internal = codeOf(planFor(internalPrepareSnap(), EV("a1")));
    const observe = codeOf(planFor(observeSnap(), EV("a1")));
    expect(blocked.has("surface_suppressed_blocked")).toBe(true);
    expect(silent.has("surface_suppressed_silent_no_contact")).toBe(true);
    expect(internal.has("user_facing_suppressed_internal_only_boundary")).toBe(true);
    expect(observe.has("clarification_suppressed_by_decisionKind:observe")).toBe(true);
    // internal_prepare は silent/blocked の理由を共有しない（internal 準備は allowed）
    expect(internal.has("surface_suppressed_blocked")).toBe(false);
    expect(internal.has("surface_suppressed_silent_no_contact")).toBe(false);
  });
});
