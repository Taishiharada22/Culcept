/**
 * evaluateCollapseRisk（RC2b-1 = CollapseRisk Factor Map v0）— CEO 必須 12 項 + 分離/confirmed
 * 正本: docs/reality-graph-contract-hardening-rg06.md / CEO RC2b-1 GO
 *
 * 核: CollapseRisk は Feasibility とは別軸（どこが崩れやすいか）。feasibilityStatus をコピーしない。
 *   missing/commitment/permission/decisionDebt だけで high collapse にしない。確率を出さない。
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
import { evaluateCollapseRisk, collapseRiskViolations } from "@/lib/plan/realityCore/collapseRisk";

const DATE = "2026-06-12";
const VIEWER = graphViewerKey("viewer-self");
const NOON_UTC = new Date(Date.UTC(2026, 5, 12, 3, 0)); // JST 12:00
const EARLY_UTC = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00 → upcoming

function anchor(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return {
    anchorKind: "one_off",
    sourceId: "src-manual",
    title: "予定",
    date: DATE,
    rigidity: "soft",
    confirmedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  } as unknown as ExternalAnchor;
}

function base(anchors: ExternalAnchor[], utcNow: Date = NOON_UTC) {
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

function collapseFor(snapshot: ReturnType<typeof snap>, scope: TargetScope) {
  const feasibilityJudgment = evaluateFeasibility(buildRealityJudgmentInput(snapshot, scope));
  return evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment });
}

const ERN = (id: string) => `ern:${DATE}:${id}`;
const placeConfirmed = () => inferredAttribute(0.9, 0.9, ["test_place"], { status: "confirmed", displayPolicy: "visible" });
const movementNotRequired = () => inferredAttribute(false, 0.9, ["test_no_mv"], { status: "confirmed", displayPolicy: "visible" });
function confirmHardFixedness(b: ReturnType<typeof base>, ernId: string): Partial<EventRealityNodeV0> {
  const f = b.ern.find((e) => e.eventRealityNodeId === ernId)!.fixedness;
  return { fixedness: { ...f, status: "confirmed", source: "known_from_user", displayPolicy: "visible" } };
}
const CLEAR = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired() };

describe("RC2b-1 #1 no probability / no percent", () => {
  it("riskLevel は enum・% や probability 数値を出さない", () => {
    const p = collapseFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })])), { kind: "event", eventRealityNodeId: ERN("a1") });
    expect(["low", "elevated", "high", "unknown"]).toContain(p.riskLevel);
    expect(typeof (p as unknown as { probability?: unknown }).probability).toBe("undefined");
    expect(JSON.stringify(p).includes("%")).toBe(false);
  });
});

describe("RC2b-1 #2 confirmed time conflict が risk factor（failure mode）になる", () => {
  it("non-identical hard-hard explicit+confirmed-hard overlap → time_conflict_confirmed・riskLevel high", () => {
    const b = base([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
    ], EARLY_UTC);
    const s = snap(b, { ernOverrides: { [ERN("a1")]: confirmHardFixedness(b, ERN("a1")), [ERN("a2")]: confirmHardFixedness(b, ERN("a2")) } });
    const p = collapseFor(s, { kind: "day" });
    const conflict = p.failureModes.find((m) => m.mode === "time_conflict_confirmed");
    expect(conflict).toBeTruthy();
    expect(conflict!.category).toBe("collapse_source");
    expect(conflict!.relationRefs.length).toBeGreaterThan(0); // pairwise relation へ辿れる
    expect(p.riskLevel).toBe("high");
    expect(collapseRiskViolations(p)).toEqual([]);
  });
});

describe("RC2b-1 #3 inferred time tension は high 断定しない", () => {
  it("soft overlap → time_tension_inferred・riskLevel elevated（high でない）", () => {
    const s = snap(base([
      anchor({ id: "a1", startTime: "10:00", endTime: "12:00", locationText: "渋谷", rigidity: "soft" }),
      anchor({ id: "a2", startTime: "11:00", endTime: "13:00", locationText: "渋谷", rigidity: "soft" }),
    ], EARLY_UTC), { ernOverrides: { [ERN("a1")]: CLEAR, [ERN("a2")]: CLEAR } });
    const p = collapseFor(s, { kind: "event", eventRealityNodeId: ERN("a1") });
    expect(p.failureModes.map((m) => m.mode)).toContain("time_tension_inferred");
    expect(p.riskLevel).toBe("elevated");
    expect(p.riskLevel).not.toBe("high");
  });
});

describe("RC2b-1 #4 exact_time_collision_ambiguous は duplicate 断定しない", () => {
  it("同一 window → exact_time_collision_ambiguous mode・duplicate と言わない・high でない", () => {
    const b = base([
      anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" }),
    ]);
    const s = snap(b, { ernOverrides: { [ERN("a1")]: confirmHardFixedness(b, ERN("a1")), [ERN("a2")]: confirmHardFixedness(b, ERN("a2")) } });
    const p = collapseFor(s, { kind: "event", eventRealityNodeId: ERN("a1") });
    expect(p.failureModes.map((m) => m.mode)).toContain("exact_time_collision_ambiguous");
    expect(p.failureModes.some((m) => m.mode === "time_conflict_confirmed")).toBe(false); // confirmed にしない
    expect(p.riskLevel).not.toBe("high");
    expect(JSON.stringify(p).includes("duplicate_identity_unresolved")).toBe(false);
    expect(JSON.stringify(p).includes("possible_duplicate")).toBe(false);
  });
});

describe("RC2b-1 #5 missingInputs だけで high collapse にしない", () => {
  it("place 不明だけ → place_unresolved（unknown 寄与）・riskLevel unknown（high でない）", () => {
    const p = collapseFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })])), { kind: "event", eventRealityNodeId: ERN("a1") });
    expect(p.failureModes.map((m) => m.mode)).toContain("place_unresolved");
    expect(p.riskLevel).toBe("unknown");
    expect(p.riskLevel).not.toBe("high");
  });
});

describe("RC2b-1 #6 commitment high だけで high collapse にしない", () => {
  it("高 socialWeight → high_commitment_if_disrupted（severity_modifier・none）・riskLevel high でない", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: CLEAR },
      csOverrides: { [ERN("a1")]: { socialWeight: inferredAttribute(0.9, 0.8, ["test_social"], { status: "inferred" }) } },
    });
    const p = collapseFor(s, { kind: "event", eventRealityNodeId: ERN("a1") });
    const m = p.failureModes.find((x) => x.mode === "high_commitment_if_disrupted");
    expect(m?.category).toBe("severity_modifier");
    expect(m?.riskContribution).toBe("none");
    expect(p.riskLevel).not.toBe("high");
    expect(p.riskLevel).toBe("low");
  });
});

describe("RC2b-1 #7 permission blocked だけで collapse risk にしない", () => {
  it("permissionLevel 0 → permission_action_gate（action_boundary・none）・riskLevel high/elevated でない", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: { ...CLEAR, permissionLevel: inferredAttribute(0, 0.6, ["test_perm"], { status: "inferred" }) as EventRealityNodeV0["permissionLevel"] } },
    });
    const p = collapseFor(s, { kind: "event", eventRealityNodeId: ERN("a1") });
    const m = p.failureModes.find((x) => x.mode === "permission_action_gate");
    expect(m?.category).toBe("action_boundary");
    expect(m?.riskContribution).toBe("none");
    expect(p.riskLevel).toBe("low");
  });
});

describe("RC2b-1 #8 decisionDebt high だけで high collapse にしない", () => {
  it("decisionDebt placeDebt>0 → decision_unresolved（unknown 寄与）・riskLevel high でない", () => {
    // place 欠落 anchor → decisionDebt placeDebt>0 + place_unresolved
    const p = collapseFor(snap(base([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00" }),
    ])), { kind: "day" });
    expect(p.failureModes.map((m) => m.mode)).toContain("decision_unresolved");
    expect(p.riskLevel).not.toBe("high");
  });
});

describe("RC2b-1 #9 sourceRefs / evidenceRefs / missingInputRefs が失われない", () => {
  it("全 failure mode が sourceRefs + evidenceRefs を持つ・missingInputRefs carry・relationRefs", () => {
    const b = base([
      anchor({ id: "a1", startTime: "10:00", endTime: "12:00", locationText: "渋谷", rigidity: "soft" }),
      anchor({ id: "a2", startTime: "11:00", endTime: "13:00", locationText: "渋谷", rigidity: "soft" }),
    ], EARLY_UTC);
    const s = snap(b);
    const p = collapseFor(s, { kind: "day" });
    for (const m of p.failureModes) {
      expect(m.sourceRefs.dayGraphSnapshotId).toBe(s.sourceRefs.dayGraphSnapshotId);
      expect(m.evidenceRefs.length).toBeGreaterThan(0);
    }
    for (const r of s.missingInputRefs) {
      expect(p.missingInputRefs.some((pr) => pr.dedupeKey === r.dedupeKey)).toBe(true);
    }
    expect(p.pairwiseRelationRefs.length).toBeGreaterThan(0); // soft overlap → relation あり
  });
});

describe("RC2b-1 #10 feasibilityStatus と collapseRisk を混ぜない", () => {
  it("profile / trace に feasibilityStatus を持たない・riskLevel は failure mode から導出（status コピーでない）", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })]));
    const fj = evaluateFeasibility(buildRealityJudgmentInput(s, { kind: "event", eventRealityNodeId: ERN("a1") }));
    const p = evaluateCollapseRisk({ graphSnapshot: s, feasibilityJudgment: fj });
    expect("feasibilityStatus" in p).toBe(false);
    expect("feasibilityStatus" in p.trace).toBe(false);
    // feasibility unknown（place 不明）→ collapse は failure mode 由来で unknown（high にコピーしない）
    expect(fj.feasibilityStatus).toBe("unknown");
    expect(p.riskLevel).toBe("unknown");
  });
});

describe("RC2b-1 #11 no proposal / departure line / intervention ladder", () => {
  it("該当 field が型に存在しない", () => {
    const p = collapseFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })])), { kind: "event", eventRealityNodeId: ERN("a1") });
    for (const k of ["proposal", "proposals", "departureLine", "departureLines", "interventionLadder", "threeOptions", "recommendation", "action", "userMessage"]) {
      expect(k in p).toBe(false);
    }
  });
});

describe("RC2b-1 #12 UI/storage/API/DB/location/notification/external read 不接触（source-scan）", () => {
  it("module source に IO / 時刻 API / 乱数の痕跡がない", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/collapseRisk.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RC2b-1A riskLevel / completeness semantics closeout", () => {
  it("#1 known high + unknown inputs → riskLevel high + hasUnresolvedRiskInputs true + completeness partial", () => {
    const b = base([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
    ], EARLY_UTC);
    const s = snap(b, { ernOverrides: { [ERN("a1")]: confirmHardFixedness(b, ERN("a1")), [ERN("a2")]: confirmHardFixedness(b, ERN("a2")) } });
    const p = collapseFor(s, { kind: "day" }); // place は v0 で unknown → 未解決同居
    expect(p.riskLevel).toBe("high"); // known severity を未解決に潰されない
    expect(p.hasUnresolvedRiskInputs).toBe(true);
    expect(p.riskCompleteness).toBe("partial");
    expect(p.unresolvedRiskInputRefs.length).toBeGreaterThan(0);
    expect(collapseRiskViolations(p)).toEqual([]);
  });

  it("#2 known elevated + unknown inputs → riskLevel elevated + unresolved あり", () => {
    const p = collapseFor(snap(base([
      anchor({ id: "a1", startTime: "10:00", endTime: "12:00", locationText: "渋谷", rigidity: "soft" }),
      anchor({ id: "a2", startTime: "11:00", endTime: "13:00", locationText: "渋谷", rigidity: "soft" }),
    ], EARLY_UTC)), { kind: "event", eventRealityNodeId: ERN("a1") });
    expect(p.riskLevel).toBe("elevated"); // schedule_tension(elevated)・place unknown に潰されない
    expect(p.hasUnresolvedRiskInputs).toBe(true);
    expect(p.riskCompleteness).toBe("partial");
  });

  it("#3 unknown only（known severity なし + risk-relevant 未解決）→ riskLevel unknown", () => {
    const p = collapseFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })])), { kind: "event", eventRealityNodeId: ERN("a1") });
    expect(p.riskLevel).toBe("unknown");
    expect(p.riskCompleteness).toBe("unknown");
    expect(p.hasUnresolvedRiskInputs).toBe(true);
  });

  it("#5 source_revision_pending は high/elevated にしない（riskLevel を上げない）", () => {
    // CLEAR で risk-relevant 未解決を消す → 残るは source_revision_pending(none) のみ
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR } });
    const p = collapseFor(s, { kind: "event", eventRealityNodeId: ERN("a1") });
    expect(p.failureModes.some((m) => m.mode === "source_revision_pending")).toBe(true);
    expect(p.riskLevel).toBe("low"); // source pending では high/elevated/unknown にしない
    expect(p.hasUnresolvedRiskInputs).toBe(false); // source pending は risk-relevant でない
  });

  it("#6 source_revision_pending は completeness / confidence に影響する（confidence high にしない）", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), { ernOverrides: { [ERN("a1")]: CLEAR } });
    const p = collapseFor(s, { kind: "event", eventRealityNodeId: ERN("a1") });
    expect(p.riskCompleteness).toBe("partial"); // source pending → complete でない
    expect(p.confidence).not.toBe("high"); // source pending → confidence high にしない
    expect(p.confidence).toBe("moderate");
  });
});

describe("RC2b-1 整合性 guard + trace", () => {
  it("feasibilityJudgment と snapshot の snapshotId 不一致 → throw", () => {
    const sa = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })]));
    const sb = snap(base([anchor({ id: "z9", startTime: "09:00", endTime: "10:00" })]));
    const fjA = evaluateFeasibility(buildRealityJudgmentInput(sa, { kind: "event", eventRealityNodeId: ERN("a1") }));
    expect(() => evaluateCollapseRisk({ graphSnapshot: sb, feasibilityJudgment: fjA })).toThrow(/食い違う/);
  });
  it("trace が feasibilityJudgmentId / snapshotId / graphBaseId を持つ", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })]));
    const fj = evaluateFeasibility(buildRealityJudgmentInput(s, { kind: "event", eventRealityNodeId: ERN("a1") }));
    const p = evaluateCollapseRisk({ graphSnapshot: s, feasibilityJudgment: fj });
    expect(p.trace.feasibilityJudgmentId).toBe(fj.judgmentTrace.judgmentId);
    expect(p.trace.snapshotId).toBe(s.snapshotId);
    expect(p.trace.graphBaseId).toBe(s.graphBaseId);
  });
});
