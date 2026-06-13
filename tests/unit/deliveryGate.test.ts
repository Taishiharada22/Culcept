/**
 * evaluateDeliveryEligibility / deliveryGateViolations（RJ2f = DeliveryGate 配信可否 v0）— CEO 必須 15 fixtures
 * 正本: docs/reality-notification-boundary-impl-design-rj2f-0.md（RJ2f-0/RJ2f-0A）
 *
 * 核: 配信「可否」のみ判定・**v0 は配信しない**（deliveredNow=false kill-switch）。in_app_passive_eligible は全条件 AND・
 *   active_prompt/unsupported ceiling は no_delivery・silent/observe/internal_prepare/blocked は no_delivery。
 *   push/chat/external は型にも経路にも存在しない（pull surface のみ・通知でない）。
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
import { evaluateInterventionDecision, type InterventionDecisionV0 } from "@/lib/plan/realityCore/interventionDecision";
import { evaluateDeliveryEligibility, deliveryGateViolations, type DeliveryDecisionV0 } from "@/lib/plan/realityCore/deliveryGate";

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
function snap(b: ReturnType<typeof base>, opts: { ernOverrides?: Record<string, Partial<EventRealityNodeV0>>; csOverrides?: Record<string, Partial<CommitmentSignalV0>> } = {}) {
  const ern = b.ern.map((e) => (opts.ernOverrides?.[e.eventRealityNodeId] ? { ...e, ...opts.ernOverrides[e.eventRealityNodeId] } : e));
  const cs = b.cs.map((c) => (opts.csOverrides?.[c.targetNodeId] ? { ...c, ...opts.csOverrides[c.targetNodeId] } : c));
  return assembleRealityGraph({ ern, mv: b.mv, cs, momentSnapshot: b.momentSnapshot, viewerKey: VIEWER });
}
function decisionFor(snapshot: ReturnType<typeof snap>, scope: TargetScope): InterventionDecisionV0 {
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

// decisionKind fixtures
const silentDec = () => decisionFor(snap(base([anchor({ id: "a1", startTime: "09:00", endTime: "10:00", locationText: "渋谷" })], NOON_UTC), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: gatesAbsent() } }), { kind: "day" });
const observeDec = () => decisionFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: gatesAbsent() } }), EV("a1"));
function internalPrepareDec() {
  const b = base([anchor({ id: "a1", startTime: "10:00", endTime: "12:00", locationText: "渋谷", rigidity: "soft" }), anchor({ id: "a2", startTime: "11:00", endTime: "13:00", locationText: "渋谷", rigidity: "soft" })]);
  const ov = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2) };
  return decisionFor(snap(b, { ernOverrides: { [ERN("a1")]: ov, [ERN("a2")]: ov }, csOverrides: { [ERN("a1")]: gatesAbsent(), [ERN("a2")]: gatesAbsent() } }), EV("a1"));
}
const blockedDec = () => decisionFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(0) } } }), EV("a1"));
const askDec = () => decisionFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: { otherPeoplePossible: boolTrue(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() } } }), EV("a1"));

const OPT_IN = { userInAppSurfaceOptIn: true, recentSurfaceCount: 0, surfaceBudgetRemaining: 5 };

describe("RJ2f #1-4 silent/observe/internal_prepare/blocked → no_delivery", () => {
  it("silent → no_delivery・deliveredNow false", () => {
    const d = evaluateDeliveryEligibility({ interventionDecision: silentDec(), ...OPT_IN });
    expect(d.carriedDecisionKind).toBe("silent");
    expect(d.eligibility).toBe("no_delivery");
    expect(d.deliveredNow).toBe(false);
    expect(deliveryGateViolations(d)).toEqual([]);
  });
  it("observe → no_delivery・nextEligibleAfter carry", () => {
    const dec = observeDec();
    const d = evaluateDeliveryEligibility({ interventionDecision: dec, ...OPT_IN });
    expect(d.carriedDecisionKind).toBe("observe");
    expect(d.eligibility).toBe("no_delivery");
    expect(d.nextEligibleAfter).toBe(dec.nextEvaluationAt);
    expect(deliveryGateViolations(d)).toEqual([]);
  });
  it("internal_prepare → no_delivery", () => {
    const d = evaluateDeliveryEligibility({ interventionDecision: internalPrepareDec(), ...OPT_IN });
    expect(d.carriedDecisionKind).toBe("internal_prepare");
    expect(d.eligibility).toBe("no_delivery");
    expect(deliveryGateViolations(d)).toEqual([]);
  });
  it("blocked → no_delivery", () => {
    const d = evaluateDeliveryEligibility({ interventionDecision: blockedDec(), ...OPT_IN });
    expect(d.carriedDecisionKind).toBe("blocked");
    expect(d.eligibility).toBe("no_delivery");
    expect(deliveryGateViolations(d)).toEqual([]);
  });
});

describe("RJ2f #5 ask_clarification + opt-in false → no_delivery", () => {
  it("opt-in なし → no_delivery", () => {
    const d = evaluateDeliveryEligibility({ interventionDecision: askDec(), userInAppSurfaceOptIn: false, recentSurfaceCount: 0, surfaceBudgetRemaining: 5 });
    expect(d.carriedDecisionKind).toBe("ask_clarification");
    expect(d.eligibility).toBe("no_delivery");
    expect(d.suppressedReasons.some((r) => r.code === "delivery_suppressed_no_optin")).toBe(true);
    expect(deliveryGateViolations(d)).toEqual([]);
  });
});

describe("RJ2f #6 ask_clarification + opt-in + budget + passive_surface → in_app_passive_eligible・deliveredNow false", () => {
  it("全条件 AND → eligible だが配信しない", () => {
    const dec = askDec();
    expect(dec.deliveryModeCeiling).toBe("passive_surface");
    const d = evaluateDeliveryEligibility({ interventionDecision: dec, ...OPT_IN });
    expect(d.eligibility).toBe("in_app_passive_eligible");
    expect(d.channelCeiling).toBe("in_app_passive");
    expect(d.deliveredNow).toBe(false); // それでも配信しない
    expect(d.suppressedReasons).toEqual([]);
    expect(deliveryGateViolations(d)).toEqual([]);
  });
});

describe("RJ2f #7 ask_clarification + budget 0 → no_delivery（fatigue）", () => {
  it("budget exhausted → no_delivery", () => {
    const d = evaluateDeliveryEligibility({ interventionDecision: askDec(), userInAppSurfaceOptIn: true, recentSurfaceCount: 99, surfaceBudgetRemaining: 0 });
    expect(d.eligibility).toBe("no_delivery");
    expect(d.suppressedReasons.some((r) => r.code === "delivery_suppressed_fatigue")).toBe(true);
    expect(deliveryGateViolations(d)).toEqual([]);
  });
});

describe("RJ2f #8/#9 active_prompt / unsupported ceiling → no_delivery", () => {
  it("active_prompt ceiling → no_delivery", () => {
    const dec: InterventionDecisionV0 = { ...askDec(), deliveryModeCeiling: "active_prompt" };
    const d = evaluateDeliveryEligibility({ interventionDecision: dec, ...OPT_IN });
    expect(d.eligibility).toBe("no_delivery");
    expect(d.suppressedReasons.some((r) => r.code === "delivery_suppressed_ceiling_conservative")).toBe(true);
    expect(deliveryGateViolations(d)).toEqual([]);
  });
  it("none ceiling → no_delivery（conservative）", () => {
    const dec: InterventionDecisionV0 = { ...askDec(), deliveryModeCeiling: "none" };
    const d = evaluateDeliveryEligibility({ interventionDecision: dec, ...OPT_IN });
    expect(d.eligibility).toBe("no_delivery");
    expect(deliveryGateViolations(d)).toEqual([]);
  });
});

describe("RJ2f #10/#12 DeliveryChannelV0 に push/chat/external が無い・配信副作用 field が無い", () => {
  it("channelCeiling ∈ {none, in_app_passive}・recipient/payload/url/token/dispatch/sendNow field 無し", () => {
    for (const d of [evaluateDeliveryEligibility({ interventionDecision: askDec(), ...OPT_IN }), evaluateDeliveryEligibility({ interventionDecision: silentDec(), ...OPT_IN })]) {
      expect(["none", "in_app_passive"]).toContain(d.channelCeiling);
      for (const k of ["push", "chat", "external", "notification", "contact", "dispatch", "send", "sendNow", "recipient", "payload", "token", "url", "webhook", "email"]) {
        expect(k in d).toBe(false);
      }
    }
  });
});

describe("RJ2f #11 deliveredNow が全 case で false（入力非依存）", () => {
  it("opt-in/budget/decisionKind/ceiling に関わらず false", () => {
    const cases = [
      evaluateDeliveryEligibility({ interventionDecision: askDec(), ...OPT_IN }),
      evaluateDeliveryEligibility({ interventionDecision: askDec(), userInAppSurfaceOptIn: false, recentSurfaceCount: 0, surfaceBudgetRemaining: 0 }),
      evaluateDeliveryEligibility({ interventionDecision: silentDec(), ...OPT_IN }),
      evaluateDeliveryEligibility({ interventionDecision: observeDec(), ...OPT_IN }),
      evaluateDeliveryEligibility({ interventionDecision: internalPrepareDec(), ...OPT_IN }),
      evaluateDeliveryEligibility({ interventionDecision: blockedDec(), ...OPT_IN }),
    ];
    for (const d of cases) expect(d.deliveredNow).toBe(false);
  });
});

describe("RJ2f #13 deliveryGateViolations が kill-switch/channel/active_prompt/fatigue 違反を検出", () => {
  it("tamper → violations 非空", () => {
    const d = evaluateDeliveryEligibility({ interventionDecision: askDec(), ...OPT_IN }); // eligible
    expect(deliveryGateViolations({ ...d, deliveredNow: true as unknown as false }).some((m) => m.includes("kill-switch"))).toBe(true);
    expect(deliveryGateViolations({ ...d, channelCeiling: "push" as unknown as "none" }).some((m) => m.includes("channelCeiling 不正"))).toBe(true);
    expect(deliveryGateViolations({ ...d, carriedDeliveryModeCeiling: "active_prompt" }).some((m) => m.includes("active_prompt") || m.includes("ceiling"))).toBe(true);
    expect(deliveryGateViolations({ ...d, budgetAvailableAtEval: false }).some((m) => m.includes("fatigue") || m.includes("budget"))).toBe(true);
    expect(deliveryGateViolations({ ...d, carriedDecisionKind: "silent" }).some((m) => m.includes("no_delivery でない") || m.includes("ask_clarification でない"))).toBe(true);
    const leaked = { ...d, sendNow: true } as unknown as DeliveryDecisionV0;
    expect(deliveryGateViolations(leaked).some((m) => m.includes("許可集合と不一致"))).toBe(true);
  });
});

describe("RJ2f #14 IO 不接触（source-scan）", () => {
  it("deliveryGate.ts に fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/deliveryGate.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RJ2f #15 forbidden identifier source-scan + push SDK / notification API import 無し", () => {
  it("配信系 identifier が実装本体（コメント除去後）に無い", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/deliveryGate.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const id of ["push", "chat", "external", "notification", "notify", "dispatch", "send", "sendNow", "recipient", "payload", "token", "url", "webhook", "email"]) {
      expect(code.includes(id)).toBe(false);
    }
    // import は realityCore 内のみ（外部 push SDK / notification API なし）
    const imports = src.match(/^import .*$/gm) ?? [];
    for (const line of imports) expect(line.includes('from "./')).toBe(true);
  });
});
