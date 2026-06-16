/**
 * RD3e-P1 — Feasibility routeUnknown blocker 再裁定（route shape unknown だけで止めない・load-bearing）（2026-06-16）
 * 正本設計: docs/reality-real-supply-source-and-movement-semantics-rd3-c-d-0.md §4.1
 *
 * 核: RD3d-P1 の意味論（routeKnown=route shape / etaKnown=arrival projection / leaveByKnown⟹etaKnown）を feasibility に反映。
 *   route shape unknown は **unresolved に残す（route_shape_missing）が inferred/confirmed blocker にしない**。
 *   time estimate（etaKnown）/ display leaveBy は引き続き重要。etaKnown=true ∧ routeKnown=false の将来を塞がない。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { compileEventRealityNodes } from "@/lib/plan/realityCore/compileEventRealityNodes";
import { compileMovementReality, type MovementRealityV0 } from "@/lib/plan/realityCore/movementReality";
import { compileCommitmentSignals, type CommitmentSignalV0 } from "@/lib/plan/realityCore/commitmentSignal";
import { deriveDecisionDebt } from "@/lib/plan/realityCore/decisionDebt";
import { deriveMomentSnapshot } from "@/lib/plan/realityCore/momentSnapshot";
import { assembleRealityGraph } from "@/lib/plan/realityCore/realityGraphSnapshot";
import { graphViewerKey } from "@/lib/plan/realityCore/graphIdentity";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";
import { inferredAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { EventRealityNodeV0 } from "@/lib/plan/realityCore/eventRealityNode";
import { buildRealityJudgmentInput } from "@/lib/plan/realityCore/realityJudgmentInput";
import { evaluateFeasibility } from "@/lib/plan/realityCore/feasibilityJudgment";

const DATE = "2026-06-12";
const VIEWER = graphViewerKey("viewer-self");
const NOON = new Date(Date.UTC(2026, 5, 12, 3, 0));
const ERN = (id: string) => `ern:${DATE}:${id}`;
const anchor = (o: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor =>
  ({ anchorKind: "one_off", sourceId: "src", title: "予定", date: DATE, rigidity: "soft", confirmedAt: "2026-06-01T00:00:00.000Z", ...o }) as unknown as ExternalAnchor;
const placeConfirmed = () => inferredAttribute(0.9, 0.9, ["p"], { status: "confirmed", displayPolicy: "visible" });
const mvRequired = () => inferredAttribute(true, 0.7, ["mvreq"], { status: "inferred" });
const fixedStart = () => inferredAttribute(true, 0.8, ["fx"], { status: "confirmed", displayPolicy: "visible" });
const boolAttr = (v: boolean) => inferredAttribute(v, 0.9, ["e"], { source: "derived", displayPolicy: "debugOnly" });

function base(anchors: ExternalAnchor[]) {
  const { graph } = buildDayGraph({ anchors, date: DATE });
  const ern = compileEventRealityNodes({ date: DATE, graph, anchors });
  const mv = compileMovementReality({ date: DATE, graph });
  const cs = compileCommitmentSignals({ date: DATE, graph, anchors });
  const decisionDebt = deriveDecisionDebt({ subjectiveDate: DATE, graph, ern, mv, cs });
  const instant = makeRealityInstantJst(NOON);
  const momentSnapshot = deriveMomentSnapshot({ instant, momentState: deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] }), ern, mv, cs, decisionDebt });
  return { ern, mv, cs, momentSnapshot };
}
function snap(b: ReturnType<typeof base>, ernOv: Record<string, Partial<EventRealityNodeV0>> = {}, csOv: Record<string, Partial<CommitmentSignalV0>> = {}, mvPatch?: (m: MovementRealityV0) => MovementRealityV0) {
  const ern = b.ern.map((e) => (ernOv[e.eventRealityNodeId] ? { ...e, ...ernOv[e.eventRealityNodeId] } : e));
  const cs = b.cs.map((c) => (csOv[c.targetNodeId] ? { ...c, ...csOv[c.targetNodeId] } : c));
  const mv = mvPatch ? b.mv.map(mvPatch) : b.mv;
  return assembleRealityGraph({ ern, mv, cs, momentSnapshot: b.momentSnapshot, viewerKey: VIEWER });
}
const judge = (s: ReturnType<typeof snap>, id: string) => evaluateFeasibility(buildRealityJudgmentInput(s, { kind: "event", eventRealityNodeId: id }));

describe("RD3e-P1 #1-#4 今日（etaKnown/routeKnown とも false）: route shape は unresolved・blocker でない", () => {
  // 2 anchor で transition(mv) を作る。arrival=a2。
  const b = base([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }), anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" })]);
  const s = snap(b, { [ERN("a2")]: { placeCertainty: placeConfirmed(), movementRequired: mvRequired() } }, { [ERN("a2")]: { fixedStart: fixedStart() } });
  const j = judge(s, ERN("a2"));
  it("#1 routeKnown=false だけでは infeasible にならない", () => {
    expect(j.feasibilityStatus).not.toBe("infeasible");
  });
  it("#2 routeKnown=false は confirmedBlockingReason にならない", () => {
    expect(j.confirmedBlockingReasons.map((r) => r.code)).not.toContain("route_shape_missing");
    expect(j.confirmedBlockingReasons.map((r) => r.code)).not.toContain("route_unresolved");
  });
  it("#3 routeKnown=false は route_shape_missing として unresolved に残る", () => {
    expect(j.unresolvedCriticalInputs.map((r) => r.code)).toContain("route_shape_missing");
    expect(j.unresolvedCriticalInputs.map((r) => r.code)).not.toContain("route_unresolved"); // 旧 code は廃止
  });
  it("#4 etaKnown=false は eta_source_missing として unresolved に残る", () => {
    expect(j.unresolvedCriticalInputs.map((r) => r.code)).toContain("eta_source_missing");
  });
});

describe("RD3e-P1 #6 将来（etaKnown=true ∧ routeKnown=false ∧ leaveBy resolved）: route shape 不明は blocker にしない", () => {
  it("movement_feasibility_unverified は立たない・route_shape_missing は残る・eta_source_missing は消える", () => {
    const b = base([anchor({ id: "a1", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }), anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "新宿" })]);
    const a2 = b.ern.find((e) => e.eventRealityNodeId === ERN("a2"))!;
    // arrival a2 の mv を patch: etaKnown=true（time basis 既知・将来）・routeKnown=false（shape 不明）
    const s = snap(
      b,
      { [ERN("a2")]: { placeCertainty: placeConfirmed(), movementRequired: mvRequired(), leaveBy: { ...a2.leaveBy, value: "resolved", whyUnresolved: [] } as EventRealityNodeV0["leaveBy"] } },
      { [ERN("a2")]: { fixedStart: fixedStart() } },
      (m) => (m.sourceRefs.toAnchorId === "a2" ? { ...m, etaKnown: boolAttr(true), routeKnown: boolAttr(false) } : m),
    );
    const j = judge(s, ERN("a2"));
    expect(j.inferredBlockingReasons.map((r) => r.code)).not.toContain("movement_feasibility_unverified"); // route shape 不明だけでは立たない
    expect(j.unresolvedCriticalInputs.map((r) => r.code)).toContain("route_shape_missing"); // 追跡は残る
    expect(j.unresolvedCriticalInputs.map((r) => r.code)).not.toContain("eta_source_missing"); // eta 既知ゆえ消える
    expect(j.feasibilityStatus).not.toBe("infeasible");
  });
});

describe("RD3e-P1 #7-#10 source-scan: feasibility は route shape を blocker にしない・computed/permission/proposal 不接触", () => {
  const code = fs.readFileSync(path.join(process.cwd(), "lib/plan/realityCore/feasibilityJudgment.ts"), "utf8");
  it("inferred blocker(movement_feasibility_unverified)の条件に route(Shape)Unknown が無い", () => {
    // 条件は (etaUnknown || leaveByUnresolved)。route(Shape)Unknown を OR に含めない。
    expect(code.includes("(etaUnknown || leaveByUnresolved)")).toBe(true);
    expect(/\(etaUnknown \|\| routeUnknown/.test(code)).toBe(false);
    expect(/routeShapeUnknown \|\|/.test(code)).toBe(false);
  });
  it("#3 route_shape_missing を使い route_unresolved（旧 code）を廃止", () => {
    expect(code.includes("route_shape_missing")).toBe(true);
    expect(code.includes('"route_unresolved"')).toBe(false);
  });
  it("#7/#8 computed leaveBy（leaveByComputed / leaveByKnown）を読まない", () => {
    expect(code.includes("leaveByComputed")).toBe(false);
    expect(code.includes("leaveByKnown")).toBe(false);
    // display leaveBy（ern.leaveBy.value===null）は読む（既存挙動維持）
    expect(code.includes("ern.leaveBy.value === null")).toBe(true);
  });
  it("#10 proposal / departure line / notification を生成しない（comment 除外・実コードで非生成）", () => {
    // comment（制約の明文化・section header）は除外し、executable code に生成 token が無いことを確認。
    const exec = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").toLowerCase();
    for (const t of ["proposal", "departure", "notification", "leavebyinstant", "exact_timestamp"]) {
      expect(exec.includes(t)).toBe(false);
    }
  });
});
