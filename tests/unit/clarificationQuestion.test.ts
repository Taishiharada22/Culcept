/**
 * deriveClarificationQuestions / 2-walker（RJ2c = ClarificationQuestionCandidate v0）— CEO 必須 18 fixtures + guard
 * 正本: docs/reality-clarification-question-impl-design-rj2c-0.md（RJ2c-0/RJ2c-0A）
 *
 * 核: question = 「何について確認するかの構造化 slot」（kind のみ・文面なし）。confirmation_needed claim（RJ2b）と別。
 *   hard gate（ask_eligible ∧ clarificationOnly ∧ ask_clarification）。per-event/per-relation identity。unresolved allowlist。
 *   exact_time_collision_ambiguous を duplicate 断定しない（assertsDuplicate=false・relationRef 必須）。
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
import { deriveSurfaceClaims } from "@/lib/plan/realityCore/surfaceClaim";
import {
  deriveClarificationQuestions,
  clarificationQuestionSetViolations,
  clarificationQuestionBindingViolations,
  type ClarificationQuestionSetV0,
  type ClarificationQuestionCandidateV0,
} from "@/lib/plan/realityCore/clarificationQuestion";

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

function questionsFor(snapshot: ReturnType<typeof snap>, scope: TargetScope): { plan: JudgmentSurfacePlanV0; questionSet: ClarificationQuestionSetV0; c: ReturnType<typeof chain> } {
  const c = chain(snapshot, scope);
  const questionSet = deriveClarificationQuestions({ surfacePlan: c.plan, feasibilityJudgment: c.fj, collapseRiskProfile: c.crp, interventionEligibility: c.elig, interventionDecision: c.dec });
  return { plan: c.plan, questionSet, c };
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
function confHard(b: ReturnType<typeof base>, ernId: string): Partial<EventRealityNodeV0> {
  const f = b.ern.find((e) => e.eventRealityNodeId === ernId)!.fixedness;
  return { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2), fixedness: { ...f, status: "confirmed", source: "known_from_user", displayPolicy: "visible" } };
}

// gate fixtures
function gateSnap(gate: "other" | "reservation" | "work", id = "a1") {
  const cs = {
    otherPeoplePossible: gate === "other" ? boolTrue() : boolFalse(),
    reservationOrPaymentPossible: gate === "reservation" ? boolTrue() : boolFalse(),
    workOrShiftPossible: gate === "work" ? boolTrue() : boolFalse(),
  };
  return snap(base([anchor({ id, startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN(id)]: CLEAR_PERM }, csOverrides: { [ERN(id)]: cs } });
}
const sensitiveSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: { ...CLEAR_PERM, sensitiveFlagged: true } }, csOverrides: { [ERN("a1")]: gatesAbsent() } });
const observeSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: gatesAbsent() } });
function collisionSnap(ids: string[]) {
  const b = base(ids.map((id) => anchor({ id, startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" })));
  const ernOverrides: Record<string, Partial<EventRealityNodeV0>> = {};
  const csOverrides: Record<string, Partial<CommitmentSignalV0>> = {};
  for (const id of ids) { ernOverrides[ERN(id)] = confHard(b, ERN(id)); csOverrides[ERN(id)] = gatesAbsent(); }
  return snap(b, { ernOverrides, csOverrides });
}
// 2 events, both otherPeople gate（day scope → 2 questions・別 subject）
function twoGateSnap() {
  const b = base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" }), anchor({ id: "a2", startTime: "16:00", endTime: "17:00", locationText: "新宿" })]);
  return snap(b, { ernOverrides: { [ERN("a1")]: CLEAR_PERM, [ERN("a2")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() }, [ERN("a2")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() } } });
}
// movement unresolved + otherPeople gate（ask_eligible だが movement は question 化しない）
const movementGateSnap = () => snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementRequired(), permissionLevel: permLevel(2) } }, csOverrides: { [ERN("a1")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() } } });

describe("RJ2c #1 exposure != ask_eligible → questions []", () => {
  it("observe（passive_only）→ questions []・suppressedQuestionRefs 記録", () => {
    const { plan, questionSet } = questionsFor(observeSnap(), EV("a1"));
    expect(plan.exposureLevel).toBe("passive_only");
    expect(questionSet.questions).toEqual([]);
    expect(questionSet.suppressedQuestionRefs.some((s) => s.reason.code.includes("question_suppressed_not_ask_eligible"))).toBe(true);
    expect(clarificationQuestionBindingViolations(plan, questionSet)).toEqual([]);
  });
});

describe("RJ2c #2 ask_eligible + clarificationOnly false → questions []", () => {
  it("hard gate 3 条件（clarificationOnly 不整合）→ questions []", () => {
    const { plan, c } = questionsFor(gateSnap("other"), EV("a1"));
    expect(plan.exposureLevel).toBe("ask_eligible");
    const tampered: JudgmentSurfacePlanV0 = { ...plan, clarificationOnly: false };
    const qs = deriveClarificationQuestions({ surfacePlan: tampered, feasibilityJudgment: c.fj, collapseRiskProfile: c.crp, interventionEligibility: c.elig, interventionDecision: c.dec });
    expect(qs.questions).toEqual([]);
  });
});

describe("RJ2c #3-6 gate → question kind 写像・文面なし", () => {
  it("otherPeople → confirm_other_people / text null", () => {
    const { plan, questionSet } = questionsFor(gateSnap("other"), EV("a1"));
    expect(plan.exposureLevel).toBe("ask_eligible");
    const q = questionSet.questions.find((x) => x.questionKind === "confirm_other_people");
    expect(q).toBeTruthy();
    expect(q!.questionTextDraft).toBeNull();
    expect(q!.answerShape).toBe("binary_confirm");
    expect(clarificationQuestionSetViolations(questionSet)).toEqual([]);
    expect(clarificationQuestionBindingViolations(plan, questionSet)).toEqual([]);
  });
  it("reservation → confirm_reservation_payment", () => {
    const { questionSet } = questionsFor(gateSnap("reservation"), EV("a1"));
    expect(questionSet.questions.some((x) => x.questionKind === "confirm_reservation_payment")).toBe(true);
    expect(clarificationQuestionSetViolations(questionSet)).toEqual([]);
  });
  it("work → confirm_work_shift", () => {
    const { questionSet } = questionsFor(gateSnap("work"), EV("a1"));
    expect(questionSet.questions.some((x) => x.questionKind === "confirm_work_shift")).toBe(true);
  });
  it("sensitive → confirm_sensitive_handling / category 非露出・genericizeRequired true", () => {
    const { questionSet } = questionsFor(sensitiveSnap(), EV("a1"));
    const q = questionSet.questions.find((x) => x.questionKind === "confirm_sensitive_handling");
    expect(q).toBeTruthy();
    expect(q!.redactionPolicy.genericizeRequired).toBe(true);
    expect(q!.redactionPolicy.subjectExposesCategory).toBe(false);
    expect(clarificationQuestionSetViolations(questionSet)).toEqual([]);
  });
});

describe("RJ2c #7 exact_time_collision_ambiguous → resolve_time_collision_ambiguity / assertsDuplicate false / relationRef あり", () => {
  it("2 events same window → time collision question・relationRef 付き・duplicate 断定なし", () => {
    const { questionSet } = questionsFor(collisionSnap(["a1", "a2"]), { kind: "day" });
    const q = questionSet.questions.find((x) => x.questionKind === "resolve_time_collision_ambiguity");
    expect(q).toBeTruthy();
    expect(q!.relationRef).toBeTruthy();
    expect(q!.redactionPolicy.assertsDuplicate).toBe(false);
    expect(q!.answerShape).toBe("disambiguate_two_way");
    expect(q!.evidenceContract.evidenceRefs.length).toBeGreaterThan(0);
    expect(clarificationQuestionSetViolations(questionSet)).toEqual([]);
  });
});

describe("RJ2c #8 same kind but different subject → separate questions", () => {
  it("2 events both otherPeople gate（day）→ 2 confirm_other_people・別 subjectNodeId", () => {
    const { questionSet } = questionsFor(twoGateSnap(), { kind: "day" });
    const op = questionSet.questions.filter((x) => x.questionKind === "confirm_other_people");
    expect(op.length).toBe(2);
    expect(new Set(op.map((x) => x.subjectNodeId)).size).toBe(2);
    expect(new Set(op.map((x) => x.questionId)).size).toBe(2);
    expect(clarificationQuestionSetViolations(questionSet)).toEqual([]);
  });
});

describe("RJ2c #9 same kind but different relationRef → separate questions", () => {
  it("3 events same window → 3 time collision question・別 relationRef", () => {
    const { questionSet } = questionsFor(collisionSnap(["a1", "a2", "a3"]), { kind: "day" });
    const tc = questionSet.questions.filter((x) => x.questionKind === "resolve_time_collision_ambiguity");
    expect(tc.length).toBe(3); // a1-a2, a1-a3, a2-a3
    expect(new Set(tc.map((x) => x.relationRef)).size).toBe(3);
    expect(new Set(tc.map((x) => x.questionId)).size).toBe(3);
  });
});

describe("RJ2c #10 dedupe preserves evidenceRefs", () => {
  it("各 question が gate 由来 evidenceRefs を保持（潰さない）", () => {
    const { questionSet } = questionsFor(twoGateSnap(), { kind: "day" });
    for (const q of questionSet.questions) {
      expect(q.evidenceContract.evidenceRefs.length).toBeGreaterThan(0);
      expect(q.whyAsked.length).toBeGreaterThan(0);
    }
  });
});

describe("RJ2c #11 leaveBy / ETA / route / departure unresolved → no question, suppressed", () => {
  it("movement unresolved + otherPeople gate → confirm_other_people のみ・movement は suppress", () => {
    const { plan, questionSet } = questionsFor(movementGateSnap(), EV("a1"));
    expect(plan.exposureLevel).toBe("ask_eligible");
    expect(questionSet.questions.some((x) => x.questionKind === "resolve_unresolved_input")).toBe(false);
    expect(questionSet.questions.some((x) => x.questionKind === "confirm_other_people")).toBe(true);
    // movement unresolved は suppressedQuestionRefs に
    expect(questionSet.suppressedQuestionRefs.some((s) => s.reason.code.includes("unresolved_not_question_allowlisted"))).toBe(true);
    // departure は常に suppress
    expect(questionSet.suppressedQuestionRefs.some((s) => s.surfaceKind === "departure_line")).toBe(true);
    expect(clarificationQuestionSetViolations(questionSet)).toEqual([]);
  });
});

describe("RJ2c #12 sourceRevisionPending only → no question", () => {
  it("clean gate のみ → gate question のみ・source revision は question 化しない", () => {
    const { questionSet } = questionsFor(gateSnap("other"), EV("a1"));
    expect(questionSet.questions.every((x) => x.questionKind === "confirm_other_people")).toBe(true);
    for (const q of questionSet.questions) expect(q.gateReasonCode).not.toContain("revision");
  });
});

describe("RJ2c #13 confirmation_needed claim relation is trace hint, not mutation", () => {
  it("relatedClaimRefs は RJ2b confirmation_needed claimId に一致（決定的 link・claim 不 mutate）", () => {
    const { questionSet, c } = questionsFor(gateSnap("other"), EV("a1"));
    const claimSet = deriveSurfaceClaims({ surfacePlan: c.plan, feasibilityJudgment: c.fj, collapseRiskProfile: c.crp, interventionEligibility: c.elig, interventionDecision: c.dec });
    const confClaim = claimSet.claims.find((x) => x.claimType === "confirmation_needed");
    expect(confClaim).toBeTruthy();
    const q = questionSet.questions.find((x) => x.questionKind === "confirm_other_people")!;
    expect(q.relatedClaimRefs).toContain(confClaim!.claimId); // 決定的 link
    expect(q.relatedClaimRefs[0].startsWith("cl:")).toBe(true);
  });
});

describe("RJ2c #14 answerShape has no text / labels / choices", () => {
  it("question に文面/選択肢/label field なし・answerShape は enum のみ", () => {
    const { questionSet } = questionsFor(gateSnap("other"), EV("a1"));
    for (const q of questionSet.questions) {
      for (const k of ["choices", "answerChoices", "options", "labels", "label", "yesLabel", "noLabel", "questionText", "text"]) expect(k in q).toBe(false);
      expect(["binary_confirm", "disambiguate_two_way", "open_unresolved"]).toContain(q.answerShape);
    }
  });
});

describe("RJ2c #15 duplicate questionId fails", () => {
  it("set 内 duplicate questionId → setViolations 非空", () => {
    const { questionSet } = questionsFor(gateSnap("other"), EV("a1"));
    const q0 = questionSet.questions[0];
    const v = clarificationQuestionSetViolations({ ...questionSet, questions: [q0, q0] });
    expect(v.some((m) => m.includes("duplicate questionId"))).toBe(true);
  });
});

describe("RJ2c #16 binding mismatch fails", () => {
  it("別 plan の questionSet を bind → bindingViolations 非空", () => {
    const a = questionsFor(gateSnap("other", "a1"), EV("a1"));
    // 別 anchor 内容 → 別 snapshotId → 別 surfacePlanId
    const bSnap = snap(base([anchor({ id: "b9", startTime: "10:00", endTime: "11:00", locationText: "新宿" })]), { ernOverrides: { [ERN("b9")]: CLEAR_PERM }, csOverrides: { [ERN("b9")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() } } });
    const b = questionsFor(bSnap, EV("b9"));
    const v = clarificationQuestionBindingViolations(b.plan, a.questionSet);
    expect(v.some((m) => m.includes("surfacePlanId"))).toBe(true);
  });
});

describe("RJ2c #17 relationRef required kind without relationRef fails", () => {
  it("time collision question の relationRef を null に → set + binding 違反", () => {
    const { plan, questionSet } = questionsFor(collisionSnap(["a1", "a2"]), { kind: "day" });
    const tc = questionSet.questions.find((x) => x.questionKind === "resolve_time_collision_ambiguity")!;
    const bad: ClarificationQuestionCandidateV0 = { ...tc, relationRef: null };
    expect(clarificationQuestionSetViolations({ ...questionSet, questions: [bad] }).some((m) => m.includes("relationRef が null"))).toBe(true);
    expect(clarificationQuestionBindingViolations(plan, { ...questionSet, questions: [bad] }).some((m) => m.includes("relationRef 欠落"))).toBe(true);
  });
});

describe("RJ2c #18 IO 不接触（source-scan）", () => {
  it("clarificationQuestion.ts に fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/clarificationQuestion.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RJ2c integrity guard + happy-path", () => {
  it("plan が別 snapshot 由来 → throw", () => {
    const a = chain(gateSnap("other", "a1"), EV("a1"));
    const sb = snap(base([anchor({ id: "zz", startTime: "09:00", endTime: "10:00" })]), { csOverrides: { [ERN("zz")]: gatesAbsent() } });
    const b = chain(sb, { kind: "day" });
    expect(() =>
      deriveClarificationQuestions({ surfacePlan: a.plan, feasibilityJudgment: a.fj, collapseRiskProfile: a.crp, interventionEligibility: a.elig, interventionDecision: b.dec }),
    ).toThrow();
  });
  it("各 fixture で setViolations [] / bindingViolations []", () => {
    const cases: Array<{ s: ReturnType<typeof snap>; scope: TargetScope }> = [
      { s: observeSnap(), scope: EV("a1") },
      { s: gateSnap("other"), scope: EV("a1") },
      { s: gateSnap("reservation"), scope: EV("a1") },
      { s: gateSnap("work"), scope: EV("a1") },
      { s: sensitiveSnap(), scope: EV("a1") },
      { s: collisionSnap(["a1", "a2"]), scope: { kind: "day" } },
      { s: collisionSnap(["a1", "a2", "a3"]), scope: { kind: "day" } },
      { s: twoGateSnap(), scope: { kind: "day" } },
      { s: movementGateSnap(), scope: EV("a1") },
    ];
    for (const cc of cases) {
      const { plan, questionSet } = questionsFor(cc.s, cc.scope);
      expect(clarificationQuestionSetViolations(questionSet)).toEqual([]);
      expect(clarificationQuestionBindingViolations(plan, questionSet)).toEqual([]);
    }
  });
});
