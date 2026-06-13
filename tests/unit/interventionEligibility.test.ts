/**
 * evaluateInterventionEligibility（RC2c-1 = InterventionEligibility / ActionBoundary v0）— CEO 必須 12 項 + guard
 * 正本: docs/reality-graph-contract-hardening-rg06.md / CEO RC2c-1 GO
 *
 * 核: 現実を読んでも行動の許可ではない。default-deny（unknown→許可しない）。
 *   otherPeople/reservation/work/sensitive は強 gate。high risk/infeasible は実行許可でない。
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
import { evaluateInterventionEligibility, interventionEligibilityViolations } from "@/lib/plan/realityCore/interventionEligibility";

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

function eligibilityFor(snapshot: ReturnType<typeof snap>, scope: TargetScope) {
  const fj = evaluateFeasibility(buildRealityJudgmentInput(snapshot, scope));
  const crp = evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment: fj });
  const prop = evaluateCollapsePropagation({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp });
  return evaluateInterventionEligibility({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, targetScope: scope });
}

const ERN = (id: string) => `ern:${DATE}:${id}`;
const EV = (id: string): TargetScope => ({ kind: "event", eventRealityNodeId: ERN(id) });
const placeConfirmed = () => inferredAttribute(0.9, 0.9, ["test_place"], { status: "confirmed", displayPolicy: "visible" });
const movementNotRequired = () => inferredAttribute(false, 0.9, ["test_no_mv"], { status: "confirmed", displayPolicy: "visible" });
const permLevel = (n: number) => inferredAttribute(n, 0.7, ["test_perm"], { status: "inferred" }) as EventRealityNodeV0["permissionLevel"];
const boolTrue = () => inferredAttribute(true, 0.7, ["test_gate"], { status: "inferred", displayPolicy: "visible" });
const boolFalse = () => inferredAttribute(false, 0.7, ["test_absent"], { status: "inferred", displayPolicy: "visible" });
/** gate を confirmed-absent に倒す（allowed 到達に必要・unknown では allowed にならない） */
const gatesAbsent = () => ({ otherPeoplePossible: boolFalse(), reservationOrPaymentPossible: boolFalse(), workOrShiftPossible: boolFalse() });
/** permission ≥1 + 場所/移動解決済み（gate を isolate するための clean event） */
const CLEAR_PERM = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2) };
function confirmHardFixedness(b: ReturnType<typeof base>, ernId: string): Partial<EventRealityNodeV0> {
  const f = b.ern.find((e) => e.eventRealityNodeId === ernId)!.fixedness;
  return { ...CLEAR_PERM, fixedness: { ...f, status: "confirmed", source: "known_from_user", displayPolicy: "visible" } };
}

describe("RC2c-1 #1 unknown permission / missing input は allowed にしない", () => {
  it("permission unknown → eligibilityLevel unknown（allowed でない）", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: unknownAttribute() } },
    });
    const e = eligibilityFor(s, EV("a1"));
    expect(e.eligibilityLevel).toBe("unknown");
    expect(e.eligibilityLevel).not.toBe("allowed");
  });
  it("missing input（place 不明）→ allowed でない（requires_confirmation）", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })]), { ernOverrides: { [ERN("a1")]: { permissionLevel: permLevel(2) } } });
    const e = eligibilityFor(s, EV("a1"));
    expect(e.eligibilityLevel).not.toBe("allowed");
  });
});

describe("RC2c-1 #2 otherPeople possible → requires_confirmation 以上", () => {
  it("otherPeoplePossible → requires_confirmation・requiresExternalCommunication", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: CLEAR_PERM },
      csOverrides: { [ERN("a1")]: { otherPeoplePossible: boolTrue() } },
    });
    const e = eligibilityFor(s, EV("a1"));
    expect(e.eligibilityLevel).toBe("requires_confirmation");
    expect(e.requiresExternalCommunication).toBe(true);
    expect(e.confirmationReasons.map((r) => r.code)).toContain("other_people_involved");
  });
});

describe("RC2c-1 #3 reservation/payment possible → blocked or requires_confirmation", () => {
  it("reservationOrPaymentPossible → requires_confirmation（allowed でない）", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: CLEAR_PERM },
      csOverrides: { [ERN("a1")]: { reservationOrPaymentPossible: boolTrue() } },
    });
    const e = eligibilityFor(s, EV("a1"));
    expect(["requires_confirmation", "blocked"]).toContain(e.eligibilityLevel);
    expect(e.confirmationReasons.map((r) => r.code)).toContain("reservation_or_payment");
  });
});

describe("RC2c-1 #4 work/shift possible → requires_confirmation 以上", () => {
  it("workOrShiftPossible → requires_confirmation", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: CLEAR_PERM },
      csOverrides: { [ERN("a1")]: { workOrShiftPossible: boolTrue() } },
    });
    const e = eligibilityFor(s, EV("a1"));
    expect(e.eligibilityLevel).toBe("requires_confirmation");
    expect(e.confirmationReasons.map((r) => r.code)).toContain("work_or_shift");
  });
});

describe("RC2c-1 #5 exact_time_collision_ambiguous は自動 move/skip にしない", () => {
  it("ambiguity → canSuggestMove/Skip false・canSuggestAskClarification true・requires_confirmation", () => {
    const b = base([
      anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" }),
    ]);
    const s = snap(b, { ernOverrides: { [ERN("a1")]: confirmHardFixedness(b, ERN("a1")), [ERN("a2")]: confirmHardFixedness(b, ERN("a2")) } });
    const e = eligibilityFor(s, EV("a1"));
    expect(e.canSuggestMove).toBe(false);
    expect(e.canSuggestSkip).toBe(false);
    expect(e.canSuggestAskClarification).toBe(true);
    expect(e.canSuggestObserve).toBe(true);
    expect(e.eligibilityLevel).toBe("requires_confirmation");
  });
});

describe("RC2c-1 #6 high collapse risk だけで action allowed にしない", () => {
  it("confirmed conflict（collapse high）→ requires_confirmation・actionBoundary write_anchor でない", () => {
    const b = base([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
    ]);
    const s = snap(b, { ernOverrides: { [ERN("a1")]: confirmHardFixedness(b, ERN("a1")), [ERN("a2")]: confirmHardFixedness(b, ERN("a2")) } });
    const e = eligibilityFor(s, { kind: "day" });
    expect(e.eligibilityLevel).not.toBe("allowed");
    expect(e.actionBoundary).not.toBe("write_anchor");
    expect(e.confirmationReasons.map((r) => r.code)).toContain("high_collapse_risk");
  });
});

describe("RC2c-1 #7 infeasible だけで write_anchor allowed にしない", () => {
  it("infeasible（confirmed conflict）→ actionBoundary write_anchor/send/book/external でない・violations なし", () => {
    const b = base([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
    ]);
    const s = snap(b, { ernOverrides: { [ERN("a1")]: confirmHardFixedness(b, ERN("a1")), [ERN("a2")]: confirmHardFixedness(b, ERN("a2")) } });
    const e = eligibilityFor(s, { kind: "day" });
    expect(["write_anchor", "send_message", "book_pay", "external_communication"]).not.toContain(e.actionBoundary);
    expect(e.confirmationReasons.map((r) => r.code)).toContain("feasibility_infeasible");
    expect(interventionEligibilityViolations(e)).toEqual([]);
  });
});

describe("RC2c-1 #8 sourceRevisionPending は confidence を下げるが permission を緩めない", () => {
  it("clean allowed event でも sourcePending → confidence high にしない・permission は緩まない", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: CLEAR_PERM },
      csOverrides: { [ERN("a1")]: gatesAbsent() }, // gate confirmed-absent でないと allowed にならない
    });
    const e = eligibilityFor(s, EV("a1"));
    expect(e.eligibilityLevel).toBe("allowed"); // gate confirmed-absent・permission ok・clear
    expect(e.confidence).not.toBe("high"); // sourceRevisionPending → high にしない
    expect(e.confidence).toBe("moderate");
    expect(e.actionBoundary).toBe("draft_only"); // allowed でも v0 は auto-write しない
  });
});

describe("RC2c-1 #9 display_only にも redaction / evidence visibility gate", () => {
  it("sensitive event → sensitive_content gate・displayRedactionRequired true・raw text 不接触", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷", sensitiveCategory: "medical" } as Partial<ExternalAnchor> & { id: string; startTime: string })]), {
      ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: permLevel(2) } },
    });
    const e = eligibilityFor(s, EV("a1"));
    expect(e.displayRedactionRequired).toBe(true);
    expect(e.confirmationReasons.map((r) => r.code)).toContain("sensitive_flagged");
    expect(e.eligibilityLevel).toBe("requires_confirmation"); // sensitive 強 gate
    // raw 機微語が eligibility に現れない（boolean のみ）
    expect(JSON.stringify(e).includes("medical")).toBe(false);
  });
});

describe("RC2c-1 #10 no proposal / departure line / intervention ladder", () => {
  it("該当 field が型に存在しない（eligibility は提案そのものでない）", () => {
    const e = eligibilityFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })])), EV("a1"));
    for (const k of ["proposal", "proposals", "departureLine", "departureLines", "interventionLadder", "threeOptions", "recommendation", "userMessage"]) {
      expect(k in e).toBe(false);
    }
  });
});

describe("RC2c-1 #11 no action / notification / external communication（実行しない）", () => {
  it("requiresExternalCommunication は flag であって実行 field でない・auto 実行 field なし", () => {
    const e = eligibilityFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })])), EV("a1"));
    for (const k of ["execute", "send", "book", "pay", "notify", "autoApply", "applied", "writeAnchor"]) {
      expect(k in e).toBe(false);
    }
    expect(typeof e.requiresExternalCommunication).toBe("boolean"); // flag のみ
  });
});

describe("RC2c-1 #12 UI/storage/API/DB/location/notification/external read 不接触（source-scan）", () => {
  it("module source に IO / 時刻 API / 乱数の痕跡がない", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/interventionEligibility.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RC2c-1 整合性 guard + allowed shape", () => {
  it("collapsePropagationMap が別 snapshot 由来 → throw", () => {
    const sa = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM } });
    const sb = snap(base([anchor({ id: "zz", startTime: "09:00", endTime: "10:00" })]));
    const fjA = evaluateFeasibility(buildRealityJudgmentInput(sa, EV("a1")));
    const crpA = evaluateCollapseRisk({ graphSnapshot: sa, feasibilityJudgment: fjA });
    const fjB = evaluateFeasibility(buildRealityJudgmentInput(sb, { kind: "day" }));
    const crpB = evaluateCollapseRisk({ graphSnapshot: sb, feasibilityJudgment: fjB });
    const propB = evaluateCollapsePropagation({ graphSnapshot: sb, feasibilityJudgment: fjB, collapseRiskProfile: crpB });
    expect(() => evaluateInterventionEligibility({ graphSnapshot: sa, feasibilityJudgment: fjA, collapseRiskProfile: crpA, collapsePropagationMap: propB, targetScope: EV("a1") })).toThrow();
  });
  it("clean allowed event（gate confirmed-absent）は observe/prepare 可・delegate 不可", () => {
    const e = eligibilityFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: gatesAbsent() } }), EV("a1"));
    expect(e.eligibilityLevel).toBe("allowed");
    expect(e.canSuggestObserve).toBe(true);
    expect(e.canSuggestPrepare).toBe(true);
    expect(e.canSuggestDelegate).toBe(false); // v0
    expect(interventionEligibilityViolations(e)).toEqual([]);
  });
});

describe("RC2c-1A sensitive / allowed-boundary / unknown-gate closeout", () => {
  it("#1/#4 sensitiveFlagged true → requires_confirmation 以上 + sensitive_flagged reason(field-level trace)", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷", sensitiveCategory: "medical" } as Partial<ExternalAnchor> & { id: string; startTime: string })]), {
      ernOverrides: { [ERN("a1")]: CLEAR_PERM },
      csOverrides: { [ERN("a1")]: gatesAbsent() }, // 他 gate を消して sensitive を isolate
    });
    const e = eligibilityFor(s, EV("a1"));
    expect(["requires_confirmation", "blocked"]).toContain(e.eligibilityLevel);
    const r = e.confirmationReasons.find((x) => x.code === "sensitive_flagged");
    expect(r).toBeTruthy();
    expect(r!.targetNodeId).toBe(ERN("a1"));
    expect(r!.evidenceRefs).toContain(`${ERN("a1")}#sensitiveFlagged`);
  });

  it("#2/#3 sensitiveFlagged false は confirmed safe でない: false 単独で allowed にしない・gate reason を出さない", () => {
    // sensitiveFlagged false(default) + gates unknown(override なし) + permission ok
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM } });
    const e = eligibilityFor(s, EV("a1"));
    expect(e.eligibilityLevel).not.toBe("allowed"); // sensitive false を allowed の根拠にしない
    expect(e.confirmationReasons.some((r) => r.code === "sensitive_flagged")).toBe(false); // false は neutral（gate reason 出さない）
  });

  it("#7 unknown gate(otherPeople/reservation/work)を false 扱いしない → *_unverified + requires_confirmation", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM } });
    const e = eligibilityFor(s, EV("a1"));
    expect(e.eligibilityLevel).toBe("requires_confirmation");
    const codes = e.confirmationReasons.map((r) => r.code);
    expect(codes).toContain("other_people_unverified");
    expect(codes).toContain("reservation_or_payment_unverified");
    expect(codes).toContain("work_or_shift_unverified");
    expect(interventionEligibilityViolations(e)).toEqual([]); // gate unverified で allowed にしていない
  });

  it("#5/#6 allowed/draft_only は action permission でない・draft も提案も生成しない", () => {
    const e = eligibilityFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: gatesAbsent() } }), EV("a1"));
    expect(e.eligibilityLevel).toBe("allowed");
    expect(e.actionBoundary).toBe("draft_only"); // 将来の最大境界・draft 生成ではない
    for (const k of ["proposal", "draft", "userMessage", "messageDraft", "scheduleDraft", "copy", "execute", "applied"]) expect(k in e).toBe(false);
  });

  it("#10 write_anchor/send_message/book_pay/external_communication は v0 で天井にしない（unknown/requires_confirmation/allowed 全 case）", () => {
    const cases = [
      snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })]), { ernOverrides: { [ERN("a1")]: { permissionLevel: unknownAttribute() } } }), // unknown
      snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM } }), // requires_confirmation
      snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR_PERM }, csOverrides: { [ERN("a1")]: gatesAbsent() } }), // allowed
    ];
    for (const s of cases) {
      const e = eligibilityFor(s, EV("a1"));
      expect(["write_anchor", "send_message", "book_pay", "external_communication"]).not.toContain(e.actionBoundary);
      expect(interventionEligibilityViolations(e)).toEqual([]);
    }
  });

  it("#9 display_only(unknown permission)→ displayRedactionRequired + raw content 不出(evidenceRefs は識別子)", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷の病院", sensitiveCategory: "medical" } as Partial<ExternalAnchor> & { id: string; startTime: string })]), {
      ernOverrides: { [ERN("a1")]: { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired(), permissionLevel: unknownAttribute() } },
    });
    const e = eligibilityFor(s, EV("a1"));
    expect(e.actionBoundary).toBe("display_only");
    expect(e.displayRedactionRequired).toBe(true);
    expect(JSON.stringify(e).includes("病院")).toBe(false); // raw location 不出
    for (const ref of e.evidenceRefs) expect(ref.includes("病院")).toBe(false);
  });
});
