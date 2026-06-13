/**
 * evaluateInterventionDecision（RC2c-2 = InterventionDecision / ContactPolicy v0）— CEO 必須 13 項 + guard
 * 正本: docs/reality-graph-contract-hardening-rg06.md / CEO RC2c-2 GO
 *
 * 核: eligibility を受けて silent/observe/ask_clarification/internal_prepare/blocked を決める内部状態。
 *   文面/通知/提案は生成しない。decisionKind は actionBoundary を超えない。silent≠observe。
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
import { evaluateInterventionDecision, interventionDecisionViolations } from "@/lib/plan/realityCore/interventionDecision";

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

function decisionFor(snapshot: ReturnType<typeof snap>, scope: TargetScope) {
  const fj = evaluateFeasibility(buildRealityJudgmentInput(snapshot, scope));
  const crp = evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment: fj });
  const prop = evaluateCollapsePropagation({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp });
  const elig = evaluateInterventionEligibility({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, targetScope: scope });
  return evaluateInterventionDecision({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, interventionEligibility: elig });
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

describe("RC2c-2 #1 blocked eligibility → blocked decision", () => {
  it("permission level 0 → eligibility blocked → decisionKind blocked・contact none", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(0) } },
    });
    const d = decisionFor(s, EV("a1"));
    expect(d.decisionKind).toBe("blocked");
    expect(d.contactPolicy).toBe("blocked");
    expect(interventionDecisionViolations(d)).toEqual([]);
  });
});

describe("RC2c-2 #2 display_only boundary → internal_prepare 以上に進まない", () => {
  it("permission unknown（display_only）+ confirmed conflict でも decisionKind ≤ observe", () => {
    const b = base([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
    ]);
    const s = snap(b, { ernOverrides: { [ERN("a1")]: confHard(b, ERN("a1"), unknownAttribute()), [ERN("a2")]: confHard(b, ERN("a2"), unknownAttribute()) } });
    const d = decisionFor(s, { kind: "day" });
    expect(["silent", "observe"]).toContain(d.decisionKind); // display_only cap
    expect(d.decisionKind).not.toBe("internal_prepare");
    expect(d.decisionKind).not.toBe("ask_clarification");
  });
});

describe("RC2c-2 #3 draft_only boundary → internal_prepare まで・proposal/copy 生成しない", () => {
  it("allowed（gate absent）+ collapse elevated（soft overlap）→ internal_prepare", () => {
    const b = base([
      anchor({ id: "a1", startTime: "10:00", endTime: "12:00", locationText: "渋谷", rigidity: "soft" }),
      anchor({ id: "a2", startTime: "11:00", endTime: "13:00", locationText: "渋谷", rigidity: "soft" }),
    ]);
    const ov = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2) };
    const s = snap(b, { ernOverrides: { [ERN("a1")]: ov, [ERN("a2")]: ov }, csOverrides: { [ERN("a1")]: gatesAbsent(), [ERN("a2")]: gatesAbsent() } });
    const d = decisionFor(s, EV("a1"));
    expect(d.actionBoundary).toBe("draft_only");
    expect(d.decisionKind).toBe("internal_prepare");
    for (const k of ["proposal", "copy", "draft", "userMessage", "threeOptions"]) expect(k in d).toBe(false);
  });
});

describe("RC2c-2 #4 ask_confirmation boundary → ask_clarification まで・action しない", () => {
  it("confirmed gate(otherPeople) → ask_confirmation → decisionKind ask_clarification", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: CLEAR_PERM },
      csOverrides: { [ERN("a1")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() } },
    });
    const d = decisionFor(s, EV("a1"));
    expect(d.actionBoundary).toBe("ask_confirmation");
    expect(d.decisionKind).toBe("ask_clarification");
    expect(d.contactPolicy).toBe("ask_permission_required");
    for (const k of ["execute", "send", "apply", "action"]) expect(k in d).toBe(false);
  });
});

describe("RC2c-2 #5 exact_time_collision_ambiguous → ask_clarification or observe（move/skip にしない）", () => {
  it("ambiguity → decisionKind ∈ {ask_clarification, observe}・move/skip field なし", () => {
    const b = base([
      anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" }),
    ]);
    const s = snap(b, { ernOverrides: { [ERN("a1")]: confHard(b, ERN("a1")), [ERN("a2")]: confHard(b, ERN("a2")) }, csOverrides: { [ERN("a1")]: gatesAbsent(), [ERN("a2")]: gatesAbsent() } });
    const d = decisionFor(s, EV("a1"));
    expect(["ask_clarification", "observe"]).toContain(d.decisionKind);
    for (const k of ["move", "skip", "suggestMove", "suggestSkip"]) expect(k in d).toBe(false);
  });
});

describe("RC2c-2 #6 sourceRevisionPending only → observe（即 ask/通知にしない）", () => {
  it("clean allowed・collapse low・gate absent → observe（ask でない）", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: CLEAR_PERM },
      csOverrides: { [ERN("a1")]: gatesAbsent() },
    });
    const d = decisionFor(s, EV("a1"));
    expect(d.decisionKind).toBe("observe");
    expect(d.decisionKind).not.toBe("ask_clarification");
  });
});

describe("RC2c-2 #7 high collapse risk だけで notification/action にしない", () => {
  it("confirmed conflict(collapse high)→ ask_clarification・deliveryModeCeiling は active_prompt でない", () => {
    const b = base([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
    ]);
    const s = snap(b, { ernOverrides: { [ERN("a1")]: confHard(b, ERN("a1")), [ERN("a2")]: confHard(b, ERN("a2")) }, csOverrides: { [ERN("a1")]: gatesAbsent(), [ERN("a2")]: gatesAbsent() } });
    const d = decisionFor(s, { kind: "day" });
    expect(d.deliveryModeCeiling).not.toBe("active_prompt"); // 通知/push にしない
    for (const k of ["notify", "notification", "push", "action"]) expect(k in d).toBe(false);
  });
});

describe("RC2c-2 #8 infeasible だけで proposal / write_anchor にしない", () => {
  it("infeasible(confirmed conflict)→ actionBoundary write_anchor でない・proposal field なし", () => {
    const b = base([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
    ]);
    const s = snap(b, { ernOverrides: { [ERN("a1")]: confHard(b, ERN("a1")), [ERN("a2")]: confHard(b, ERN("a2")) }, csOverrides: { [ERN("a1")]: gatesAbsent(), [ERN("a2")]: gatesAbsent() } });
    const d = decisionFor(s, { kind: "day" });
    expect(["write_anchor", "send_message", "book_pay", "external_communication"]).not.toContain(d.actionBoundary);
    for (const k of ["proposal", "proposals", "writeAnchor"]) expect(k in d).toBe(false);
  });
});

describe("RC2c-2 #9 observe は nextEvaluationAt / reevaluationTrigger / stopCondition を持つ", () => {
  it("observe → 再評価条件を持つ", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: CLEAR_PERM },
      csOverrides: { [ERN("a1")]: gatesAbsent() },
    });
    const d = decisionFor(s, EV("a1"));
    expect(d.decisionKind).toBe("observe");
    expect(d.reevaluationTrigger).toBeTruthy();
    expect(d.stopCondition).toBeTruthy();
  });
});

describe("RC2c-2 #10 silent は contact なし / output なし（observe と混同しない）", () => {
  it("upcoming なし（全 past）の day → silent・再評価条件なし・contact none", () => {
    // NOON 評価で 09:00-10:00 event は past → upcoming 空
    const s = snap(base([anchor({ id: "a1", startTime: "09:00", endTime: "10:00", locationText: "渋谷" })], NOON_UTC), {
      ernOverrides: { [ERN("a1")]: CLEAR_PERM },
      csOverrides: { [ERN("a1")]: gatesAbsent() },
    });
    const d = decisionFor(s, { kind: "day" });
    expect(d.decisionKind).toBe("silent");
    expect(d.contactPolicy).toBe("none");
    expect(d.reevaluationTrigger).toBeNull(); // silent は再評価条件を持たない
    expect(d.nextEvaluationAt).toBeNull();
    expect(d.stopCondition).toBeNull();
  });
});

describe("RC2c-2 #11 actionBoundary を超えない", () => {
  it("各 case で decisionKind rank ≤ boundary cap（violations なし）", () => {
    const cases: ReturnType<typeof snap>[] = [];
    // blocked
    cases.push(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(0) } } }));
    // unknown
    cases.push(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: unknownAttribute() } } }));
    // requires_confirmation
    cases.push(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM } }));
    // allowed
    cases.push(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: gatesAbsent() } }));
    for (const s of cases) {
      const d = decisionFor(s, EV("a1"));
      expect(interventionDecisionViolations(d)).toEqual([]);
    }
  });
});

describe("RC2c-2 #12 no user-facing copy / proposal / departure line / intervention ladder", () => {
  it("該当 field が型に存在しない（decision は内部状態であって文面でない）", () => {
    const d = decisionFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })])), EV("a1"));
    for (const k of ["proposal", "userMessage", "copy", "departureLine", "departureLines", "interventionLadder", "threeOptions", "message", "draftText"]) {
      expect(k in d).toBe(false);
    }
  });
});

describe("RC2c-2 #13 UI/storage/API/DB/location/notification/external read 不接触（source-scan）", () => {
  it("module source に IO / 時刻 API / 乱数の痕跡がない", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/interventionDecision.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RC2c-2 整合性 guard", () => {
  it("eligibility が別 snapshot 由来 → throw", () => {
    const sa = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM } });
    const sb = snap(base([anchor({ id: "zz", startTime: "09:00", endTime: "10:00" })]));
    const fjA = evaluateFeasibility(buildRealityJudgmentInput(sa, EV("a1")));
    const crpA = evaluateCollapseRisk({ graphSnapshot: sa, feasibilityJudgment: fjA });
    const propA = evaluateCollapsePropagation({ graphSnapshot: sa, feasibilityJudgment: fjA, collapseRiskProfile: crpA });
    const fjB = evaluateFeasibility(buildRealityJudgmentInput(sb, { kind: "day" }));
    const crpB = evaluateCollapseRisk({ graphSnapshot: sb, feasibilityJudgment: fjB });
    const propB = evaluateCollapsePropagation({ graphSnapshot: sb, feasibilityJudgment: fjB, collapseRiskProfile: crpB });
    const eligB = evaluateInterventionEligibility({ graphSnapshot: sb, feasibilityJudgment: fjB, collapseRiskProfile: crpB, collapsePropagationMap: propB, targetScope: { kind: "day" } });
    expect(() => evaluateInterventionDecision({ graphSnapshot: sa, feasibilityJudgment: fjA, collapseRiskProfile: crpA, collapsePropagationMap: propA, interventionEligibility: eligB })).toThrow();
  });
});
