/**
 * evaluateCollapsePropagation（RC2b-2 = Collapse Propagation / Impact Surface v0）— CEO 必須 12 項 + guard
 * 正本: docs/reality-graph-contract-hardening-rg06.md / CEO RC2b-2 GO
 *
 * 核: CollapsePropagation は CollapseRisk と別軸（崩れたらどこへ広がり得るか）。候補であって因果確定でない。
 *   directional edge は sorted id を使わない。movement unresolved は delay 確定にしない。ambiguous は causality にしない。
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
import { evaluateCollapsePropagation, collapsePropagationViolations } from "@/lib/plan/realityCore/collapsePropagation";

const DATE = "2026-06-12";
const VIEWER = graphViewerKey("viewer-self");
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

function propagationFor(snapshot: ReturnType<typeof snap>, scope: TargetScope) {
  const fj = evaluateFeasibility(buildRealityJudgmentInput(snapshot, scope));
  const crp = evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment: fj });
  return evaluateCollapsePropagation({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp });
}

const ERN = (id: string) => `ern:${DATE}:${id}`;
const DAY: TargetScope = { kind: "day" };
const placeConfirmed = () => inferredAttribute(0.9, 0.9, ["test_place"], { status: "confirmed", displayPolicy: "visible" });
const movementNotRequired = () => inferredAttribute(false, 0.9, ["test_no_mv"], { status: "confirmed", displayPolicy: "visible" });
const CLEAR = { placeCertainty: placeConfirmed(), movementRequired: movementNotRequired() };
function confirmHardFixedness(b: ReturnType<typeof base>, ernId: string): Partial<EventRealityNodeV0> {
  const f = b.ern.find((e) => e.eventRealityNodeId === ernId)!.fixedness;
  return { fixedness: { ...f, status: "confirmed", source: "known_from_user", displayPolicy: "visible" } };
}
function confirmedConflict(anchors: ExternalAnchor[], hardIds: string[]) {
  const b = base(anchors);
  const ov: Record<string, Partial<EventRealityNodeV0>> = {};
  for (const id of hardIds) ov[ERN(id)] = confirmHardFixedness(b, ERN(id));
  return snap(b, { ernOverrides: ov });
}

describe("RC2b-2 #1 confirmed time conflict → local propagation（後続なし）", () => {
  it("hard 同士 overlap・後続イベントなし → propagationLevel local", () => {
    const s = confirmedConflict([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
    ], ["a1", "a2"]);
    const m = propagationFor(s, DAY);
    expect(m.propagationLevel).toBe("local");
    expect(m.propagationEdges.some((e) => e.edgeKind === "time_relation_edge")).toBe(true);
    expect(collapsePropagationViolations(m)).toEqual([]);
  });
});

describe("RC2b-2 #2 confirmed conflict + later event → downstream（event order edge 経由のみ）", () => {
  it("後続イベントあり → downstream・adjacent_event_order_edge で繋がる", () => {
    const s = confirmedConflict([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
      anchor({ id: "a3", startTime: "14:00", endTime: "15:00", locationText: "品川", rigidity: "hard" }),
    ], ["a1", "a2"]);
    const m = propagationFor(s, DAY);
    expect(m.propagationLevel).toBe("downstream");
    expect(m.downstreamImpactCandidates).toContain(ERN("a3"));
    expect(m.propagationEdges.some((e) => e.edgeKind === "adjacent_event_order_edge" && e.toNodeId === ERN("a3"))).toBe(true);
  });
});

describe("RC2b-2 #3 exact_time_collision_ambiguous は causality にしない", () => {
  it("同一 window → time_relation_edge を作らない・propagationLevel unknown・unresolved に明示", () => {
    const s = confirmedConflict([
      anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" }),
    ], ["a1", "a2"]);
    const m = propagationFor(s, DAY);
    expect(m.propagationEdges.some((e) => e.edgeKind === "time_relation_edge")).toBe(false); // causality にしない
    expect(m.propagationLevel).toBe("unknown");
    expect(m.unresolvedPropagationInputs.some((x) => x.startsWith("ambiguous:"))).toBe(true);
  });
});

describe("RC2b-2 #4 missingInputs だけでは confirmed propagation を作らない", () => {
  it("place 不明 + 移動なし → conflict なし → propagationLevel none・resolved conflict edge なし", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })]), {
      ernOverrides: { [ERN("a1")]: { movementRequired: movementNotRequired() } }, // place は unknown のまま
    });
    const m = propagationFor(s, DAY);
    expect(m.propagationEdges.some((e) => e.resolved && e.edgeKind === "time_relation_edge")).toBe(false);
    expect(["none", "unknown"]).toContain(m.propagationLevel);
    expect(m.propagationLevel).not.toBe("downstream");
  });
});

describe("RC2b-2 #5 movement unresolved は delay 確定にしない", () => {
  it("movement 未解決 + 後続あり → unresolved_movement_edge(resolved:false)・propagationLevel unknown（確定 downstream にしない）", () => {
    // a1 は movementRequired unknown(v0 default) → movement_unresolved。後続 a2 あり。conflict なし。
    const s = snap(base([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00" }),
      anchor({ id: "a2", startTime: "14:00", endTime: "15:00" }),
    ]));
    const m = propagationFor(s, DAY);
    const mv = m.propagationEdges.find((e) => e.edgeKind === "unresolved_movement_edge");
    expect(mv).toBeTruthy();
    expect(mv!.resolved).toBe(false); // delay 確定でない candidate
    expect(m.propagationLevel).toBe("unknown"); // conflict surface なし → known downstream 断定しない
  });
});

describe("RC2b-2 #6 commitment high だけでは propagation を作らない", () => {
  it("高 socialWeight・移動/場所解決済み・conflict なし → propagationLevel none・edge なし", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: CLEAR },
      csOverrides: { [ERN("a1")]: { socialWeight: inferredAttribute(0.9, 0.8, ["test_social"], { status: "inferred" }) } },
    });
    const m = propagationFor(s, DAY);
    expect(m.propagationEdges).toEqual([]);
    expect(m.propagationLevel).toBe("none");
  });
});

describe("RC2b-2 #7 permission blocked だけでは propagation を作らない", () => {
  it("permissionLevel 0・移動/場所解決済み → propagationLevel none・edge なし", () => {
    const s = snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })]), {
      ernOverrides: { [ERN("a1")]: { ...CLEAR, permissionLevel: inferredAttribute(0, 0.6, ["test_perm"], { status: "inferred" }) as EventRealityNodeV0["permissionLevel"] } },
    });
    const m = propagationFor(s, DAY);
    expect(m.propagationEdges).toEqual([]);
    expect(m.propagationLevel).toBe("none");
  });
});

describe("RC2b-2 #8 directional propagation edge は sorted id を使わない", () => {
  it("earlier→later の方向を保持（earlier の id が lexically 大でも sorted しない）", () => {
    // z9(10:00 earlier・id 大) と a1(10:30 later・id 小) → directional は z9->a1（sorted なら a1 が先）
    const s = confirmedConflict([
      anchor({ id: "z9", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a1", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
    ], ["z9", "a1"]);
    const fj = evaluateFeasibility(buildRealityJudgmentInput(s, DAY));
    const m = evaluateCollapsePropagation({ graphSnapshot: s, feasibilityJudgment: fj, collapseRiskProfile: evaluateCollapseRisk({ graphSnapshot: s, feasibilityJudgment: fj }) });
    const edge = m.propagationEdges.find((e) => e.edgeKind === "time_relation_edge")!;
    expect(edge.fromNodeId).toBe(ERN("z9")); // earlier（時間順）
    expect(edge.toNodeId).toBe(ERN("a1")); // later
    expect(edge.edgeId).toBe(`pedge:time_relation_edge:${ERN("z9")}->${ERN("a1")}`);
    // sorted relation（PairwiseTimeRelation）は a1 が先頭 → directional edge の from(z9) と一致しない = sorted 不使用の証明
    const rel = fj.judgmentTrace.timeRelations.find((r) => r.relationKind === "confirmed_time_conflict")!;
    expect(rel.fromEventRealityNodeId).toBe(ERN("a1")); // sorted 先頭
    expect(edge.fromNodeId).not.toBe(rel.fromEventRealityNodeId); // directional ≠ sorted
  });
});

describe("RC2b-2 #9 relationRefs / failureModeRefs / affectedNodeRefs が保持される", () => {
  it("trace に relationRefs / failureModeRefs / affectedNodeRefs・edge に sourceRefs/evidenceRefs", () => {
    const s = confirmedConflict([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
      anchor({ id: "a3", startTime: "14:00", endTime: "15:00", locationText: "品川", rigidity: "hard" }),
    ], ["a1", "a2"]);
    const m = propagationFor(s, DAY);
    expect(m.trace.relationRefs.length).toBeGreaterThan(0);
    expect(m.trace.failureModeRefs).toContain("time_conflict_confirmed");
    expect(m.trace.affectedNodeRefs).toContain(ERN("a3"));
    for (const e of m.propagationEdges) {
      expect(e.sourceRefs.dayGraphSnapshotId).toBe(s.sourceRefs.dayGraphSnapshotId);
      expect(e.evidenceRefs.length).toBeGreaterThan(0);
    }
    expect(m.carryoverCandidates).toEqual([]); // v0: cross-day model 未実装
  });
});

describe("RC2b-2 #10 no probability / no percent", () => {
  it("propagationLevel は enum・% や probability 数値を出さない", () => {
    const m = propagationFor(confirmedConflict([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
    ], ["a1", "a2"]), DAY);
    expect(["none", "local", "downstream", "day_scope", "unknown"]).toContain(m.propagationLevel);
    expect(typeof (m as unknown as { probability?: unknown }).probability).toBe("undefined");
    expect(JSON.stringify(m).includes("%")).toBe(false);
  });
});

describe("RC2b-2 #11 no proposal / departure line / intervention ladder", () => {
  it("該当 field が型に存在しない", () => {
    const m = propagationFor(snap(base([anchor({ id: "a1", startTime: "14:00", endTime: "15:00" })])), DAY);
    for (const k of ["proposal", "proposals", "departureLine", "departureLines", "interventionLadder", "threeOptions", "recommendation", "action", "userMessage"]) {
      expect(k in m).toBe(false);
    }
  });
});

describe("RC2b-2 #12 UI/storage/API/DB/location/notification/external read 不接触（source-scan）", () => {
  it("module source に IO / 時刻 API / 乱数の痕跡がない", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/collapsePropagation.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RC2b-2 整合性 guard + day_scope", () => {
  it("collapseRiskProfile が別 snapshot 由来 → throw", () => {
    const sa = confirmedConflict([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
    ], ["a1", "a2"]);
    const sb = snap(base([anchor({ id: "zz", startTime: "09:00", endTime: "10:00" })]));
    const fjA = evaluateFeasibility(buildRealityJudgmentInput(sa, DAY));
    const crpB = evaluateCollapseRisk({ graphSnapshot: sb, feasibilityJudgment: evaluateFeasibility(buildRealityJudgmentInput(sb, DAY)) });
    expect(() => evaluateCollapsePropagation({ graphSnapshot: sa, feasibilityJudgment: fjA, collapseRiskProfile: crpB })).toThrow();
  });
  it("confirmed conflict + 後続 2 件 → day_scope", () => {
    const s = confirmedConflict([
      anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷", rigidity: "hard" }),
      anchor({ id: "a2", startTime: "10:30", endTime: "11:30", locationText: "新宿", rigidity: "hard" }),
      anchor({ id: "a3", startTime: "13:00", endTime: "14:00", locationText: "品川", rigidity: "hard" }),
      anchor({ id: "a4", startTime: "16:00", endTime: "17:00", locationText: "上野", rigidity: "hard" }),
    ], ["a1", "a2"]);
    const m = propagationFor(s, DAY);
    expect(m.propagationLevel).toBe("day_scope");
  });
});
