/**
 * RO-4 — Proposal 3案（protect/easy/push）pure kernel。
 *   RO-3 の buildRealityLearningSignal で実 signal を作り end-to-end（signal-trace）で stance 写像を検証。
 *   pure・injected fixtures のみ。empty-day を import せず・PredictionLedger 書かない・既存型改変ゼロ。
 * 正本設計: docs/reality-os-ro4-proposal-routes-design.md（RO-4 v0.1・敵対的検証 17 mustFix 反映）
 *
 * CEO 必須検証点 + mustFix 反映:
 *   - 二重正本化回避: RealityProposalStance は EmptyDayTier を import しない（兄弟レーン）
 *   - protect: anchorId lineage 橋渡し（M2・非 anchored task は空）
 *   - easy: axis 別 burden-reducing（M3・energy×lower は easy でない）
 *   - push: 前進系のみ・carried_over/blocked 除外（M9）
 *   - forTarget は task に一本化（M4）・常に 3 route・unresolved cap・write 0
 */
import { describe, it, expect } from "vitest";
import {
  buildProposalRoutes,
  proposalRouteViolations,
  PROPOSAL_STANCES,
  type RealityProposalStance,
  type ProposalRouteSetV0,
} from "@/lib/plan/realityCore/proposalRoute";
import { buildRealityLearningSignal } from "@/lib/plan/realityCore/realityLearningSignal";
import { buildRealityFrame, type RealityFrameV0 } from "@/lib/plan/realityCore/realityFrame";
import type { RealityGraphSnapshotV0 } from "@/lib/plan/realityCore/realityGraphSnapshot";
import type { EventRealityNodeV0 } from "@/lib/plan/realityCore/eventRealityNode";
import type { LeaveByLinesV0 } from "@/lib/plan/realityCore/leaveByLines";
import { buildLeaveByLines } from "@/lib/plan/realityCore/leaveByLines";
import { buildTaskRealityNode, type TaskRealityNodeInputV0, type TaskRealityNodeV0 } from "@/lib/plan/realityCore/taskRealityNode";
import type { CorrectionGradientV0 } from "@/lib/plan/realityCore/correctionGradient";
import type { TaskLedgerSignalV0 } from "@/lib/plan/realityCore/taskOutcome";
import { inferredAttribute, heuristicAttribute, unknownAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

// ── fixtures（RO-3 が読む field のみ・test-only 局所 cast） ──
const CE: ChangeEligibilityValue = {
  canSuggestMove: true, canSuggestShorten: false, canSuggestSkip: false, canSuggestDelegate: false,
  requiresConfirmation: false, requiresExternalCommunication: false, blockedReason: null,
};
function task(id: string, over: Partial<TaskRealityNodeInputV0> = {}): TaskRealityNodeV0 {
  return buildTaskRealityNode({
    taskId: id, title: "作業",
    deadline: inferredAttribute("2026-06-21T18:00:00", 0.7, ["d"], { status: "confirmed" }),
    estimatedDuration: heuristicAttribute(60, 0.3, ["dur"]),
    cognitiveLoad: heuristicAttribute(0.5, 0.3, ["load"]),
    canSplit: inferredAttribute(true, 0.6, ["s"]),
    canMove: inferredAttribute(true, 0.6, ["m"]),
    changeEligibility: inferredAttribute(CE, 0.6, ["gov"]),
    permissionLevel: inferredAttribute<PermissionLevel>(2, 0.6, ["gov"]),
    ...over,
  });
}
function ern(date: string, anchorId: string, leaveByLines?: LeaveByLinesV0): EventRealityNodeV0 {
  const partial = {
    schemaVersion: 0,
    eventRealityNodeId: `ern:${date}:${anchorId}`,
    date, subjectiveDate: date,
    sourceRefs: { anchorId, dayGraphNodeId: `dgn:${anchorId}`, dayGraphSnapshotId: "dgs:x" },
    leaveBy: { ...unknownAttribute<string>(), whyUnresolved: [] as const },
    placeCertainty: unknownAttribute<number>(),
    movementRequired: unknownAttribute<boolean>(),
    ...(leaveByLines !== undefined ? { leaveByLines } : {}),
  };
  return partial as unknown as EventRealityNodeV0;
}
function snap(over: { graphBaseId?: string; snapshotId?: string; ern?: EventRealityNodeV0[] } = {}): RealityGraphSnapshotV0 {
  const partial = {
    schemaVersion: 0,
    graphBaseId: over.graphBaseId ?? "rgb:2026-06-20:vk1:hashA",
    snapshotId: over.snapshotId ?? "rgs:rgb:2026-06-20:vk1:hashA:780",
    subjectiveDate: "2026-06-20", minuteOfSubjectiveDay: 780,
    eventRealityNodes: over.ern ?? [], movementRealityNodes: [], commitmentSignals: [],
  };
  return partial as unknown as RealityGraphSnapshotV0;
}
const lbl = (over = {}): LeaveByLinesV0 => buildLeaveByLines({
  arrivalTargetInstant: "2026-06-20T14:00:00+09:00", durMin: 30,
  prepTime: heuristicAttribute<number>(40, 0.3, ["prep"]), ...over,
});
const grad = (axis: CorrectionGradientV0["axis"], direction: CorrectionGradientV0["direction"], basis: string[] = ["e"]): CorrectionGradientV0 =>
  ({ axis, contextKey: "shift_day|packed", direction, confidenceDelta: 0.2, verdict: null, basis });

function setFor(sets: readonly ProposalRouteSetV0[], taskId: string): ProposalRouteSetV0 | undefined {
  return sets.find((s) => s.forTarget.id === taskId);
}
function reasonsOf(set: ProposalRouteSetV0, stance: RealityProposalStance) {
  return set.routes.find((r) => r.stance === stance)!.reasons;
}

// ════════════ 構造・二重正本回避 ════════════
describe("RO-4 構造 — 兄弟レーン・常に 3 route", () => {
  it("#1 各 task_proposal target に常に 3 route（protect/easy/push 順）", () => {
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const signal = buildRealityLearningSignal({ prior: null, current: frame });
    const sets = buildProposalRoutes({ signal, frame, routeSetIdSeed: "s" });
    expect(sets).toHaveLength(1);
    expect(sets[0].routes.map((r) => r.stance)).toEqual(["protect", "easy", "push"]);
    expect(proposalRouteViolations(sets[0])).toEqual([]);
  });

  it("#2 task が無ければ空配列（route を発明しない）", () => {
    const frame = buildRealityFrame({ snapshot: snap() });
    const signal = buildRealityLearningSignal({ prior: null, current: frame });
    expect(buildProposalRoutes({ signal, frame, routeSetIdSeed: "s" })).toEqual([]);
  });

  it("#3 forTarget は task に一本化（workLane/task・M4）", () => {
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const signal = buildRealityLearningSignal({ prior: null, current: frame });
    const set = buildProposalRoutes({ signal, frame, routeSetIdSeed: "s" })[0];
    expect(set.forTarget.universe).toBe("workLane");
    expect(set.forTarget.kind).toBe("task");
    expect(set.forTarget.id).toBe("trn:t1");
  });

  it("#4 routeSetId は deterministic（同一入力→同一出力）", () => {
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const signal = buildRealityLearningSignal({ prior: null, current: frame });
    const a = buildProposalRoutes({ signal, frame, routeSetIdSeed: "s" });
    const b = buildProposalRoutes({ signal, frame, routeSetIdSeed: "s" });
    expect(a).toEqual(b);
    expect(a[0].routeSetId).toBe("proute:s:trn:t1");
  });
});

// ════════════ protect ← collapsed（anchorId 橋渡し・M2） ════════════
describe("RO-4 protect — anchorId lineage 橋渡し", () => {
  function collapseFrames(taskAnchor: string | undefined): { a: RealityFrameV0; b: RealityFrameV0 } {
    const wide = lbl({ bufferLargeMin: 60, bufferFloorMin: 5 }); // gap 55
    const narrow = lbl({ bufferLargeMin: 20, bufferFloorMin: 5 }); // gap 15
    const t = task("t1", taskAnchor !== undefined ? { sourceRefs: { anchorId: taskAnchor } } : {});
    const a = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", wide)] }), workLane: { tasks: [t] } });
    const b = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", narrow)] }), workLane: { tasks: [t] } });
    return { a, b };
  }

  it("#5 task.sourceRefs.anchorId が collapsed ern と一致 → protect reason", () => {
    const { a, b } = collapseFrames("a1");
    const signal = buildRealityLearningSignal({ prior: a, current: b });
    expect(signal.diff.collapsed.length).toBeGreaterThan(0); // collapse 発火確認
    const set = setFor(buildProposalRoutes({ signal, frame: b, routeSetIdSeed: "s" }), "trn:t1")!;
    const p = reasonsOf(set, "protect");
    expect(p.length).toBeGreaterThan(0);
    expect(p[0].basisBucket).toBe("diff_collapsed");
    expect(p[0].evidenceRefs.some((e) => e.startsWith("gap_"))).toBe(true);
    expect(p[0].evidenceRefs).toContain("anchor_a1");
  });

  it("#6 非 anchored task（sourceRefs.anchorId なし）→ protect reasons 空（honest・M2）", () => {
    const { a, b } = collapseFrames(undefined);
    const signal = buildRealityLearningSignal({ prior: a, current: b });
    expect(signal.diff.collapsed.length).toBeGreaterThan(0);
    const set = setFor(buildProposalRoutes({ signal, frame: b, routeSetIdSeed: "s" }), "trn:t1")!;
    expect(reasonsOf(set, "protect")).toEqual([]); // 構造的に空（捏造より過少報告）
    expect(proposalRouteViolations(set)).toEqual([]);
  });

  it("#7 anchorId が別 ern（不一致）→ protect 空", () => {
    const wide = lbl({ bufferLargeMin: 60, bufferFloorMin: 5 });
    const narrow = lbl({ bufferLargeMin: 20, bufferFloorMin: 5 });
    const t = task("t1", { sourceRefs: { anchorId: "OTHER" } });
    const a = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", wide)] }), workLane: { tasks: [t] } });
    const b = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", narrow)] }), workLane: { tasks: [t] } });
    const signal = buildRealityLearningSignal({ prior: a, current: b });
    const set = setFor(buildProposalRoutes({ signal, frame: b, routeSetIdSeed: "s" }), "trn:t1")!;
    expect(reasonsOf(set, "protect")).toEqual([]);
  });
});

// ════════════ push ← 前進系 task change（M9） ════════════
describe("RO-4 push — 前進系のみ・carryOver 除外", () => {
  it("#8 task completionStatus not_started→done → push reason（completed）", () => {
    const a = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const bt = task("t1", { completionStatus: inferredAttribute("done", 0.85, ["o"], { status: "confirmed" }) });
    const b = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [bt] } });
    const signal = buildRealityLearningSignal({ prior: a, current: b });
    const set = setFor(buildProposalRoutes({ signal, frame: b, routeSetIdSeed: "s" }), "trn:t1")!;
    const pu = reasonsOf(set, "push");
    expect(pu.length).toBeGreaterThan(0);
    expect(pu[0].basisBucket).toBe("change_task");
  });

  it("#9 carried_over/blocked は push に含めない（M9・前進系でない）", () => {
    // carryOverSignal 由来の task-lane change（sourceVocab=task_outcome を共有するが PUSH_OUTCOMES 外）
    const frame = buildRealityFrame({
      snapshot: snap(),
      workLane: { tasks: [task("t1")], carryOverSignals: [{ taskRealityNodeId: "trn:t1", carriedOver: true, reason: "blocked" }] },
    });
    const signal = buildRealityLearningSignal({ prior: null, current: frame });
    const set = setFor(buildProposalRoutes({ signal, frame, routeSetIdSeed: "s" }), "trn:t1")!;
    expect(reasonsOf(set, "push")).toEqual([]); // blocked は push にしない
  });
});

// ════════════ easy ← axis 別 burden-reducing（M3） ════════════
describe("RO-4 easy — axis 別 burden-reducing", () => {
  function easySignal(gradients: CorrectionGradientV0[]) {
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const signal = buildRealityLearningSignal({ prior: null, current: frame, gradients });
    return { frame, sets: buildProposalRoutes({ signal, frame, routeSetIdSeed: "s" }) };
  }

  it("#10 負荷系 axis（duration/cognitiveLoad/prep）の direction=lower → easy", () => {
    const { sets } = easySignal([grad("duration", "lower"), grad("cognitiveLoad", "lower"), grad("prep", "lower")]);
    expect(reasonsOf(setFor(sets, "trn:t1")!, "easy").length).toBe(3);
  });

  it("#11 energy×lower は easy でない（意味反転・M3）／ energy×higher は easy", () => {
    const low = easySignal([grad("energy", "lower")]);
    expect(reasonsOf(setFor(low.sets, "trn:t1")!, "easy")).toEqual([]); // しんどい日
    const high = easySignal([grad("energy", "higher")]);
    expect(reasonsOf(setFor(high.sets, "trn:t1")!, "easy").length).toBe(1); // 余力高い＝楽
  });

  it("#12 match は easy にしない（中立）／ accept-reject 系（route/deadline）も v0 不採用", () => {
    const m = easySignal([grad("duration", "match"), grad("route", "lower"), grad("deadline", "lower")]);
    expect(reasonsOf(setFor(m.sets, "trn:t1")!, "easy")).toEqual([]);
  });

  it("#13 basis 空 gradient は easy にしない（過剰帰属禁止）", () => {
    const { sets } = easySignal([grad("duration", "lower", [])]);
    expect(reasonsOf(setFor(sets, "trn:t1")!, "easy")).toEqual([]);
  });

  it("#14 easy は day-level（複数 task で共有）", () => {
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1"), task("t2")] } });
    const signal = buildRealityLearningSignal({ prior: null, current: frame, gradients: [grad("duration", "lower")] });
    const sets = buildProposalRoutes({ signal, frame, routeSetIdSeed: "s" });
    expect(reasonsOf(setFor(sets, "trn:t1")!, "easy").length).toBe(1);
    expect(reasonsOf(setFor(sets, "trn:t2")!, "easy").length).toBe(1); // 軸の楽さは task を跨ぐ
  });
});

// ════════════ recommended / unresolved / 境界 ════════════
describe("RO-4 recommended・unresolved・境界", () => {
  it("#15 evidence 最多 stance を推薦・全空は null", () => {
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const empty = buildRealityLearningSignal({ prior: null, current: frame });
    expect(buildProposalRoutes({ signal: empty, frame, routeSetIdSeed: "s" })[0].recommended).toBeNull();
    // easy のみ evidence → easy 推薦
    const easy = buildRealityLearningSignal({ prior: null, current: frame, gradients: [grad("duration", "lower")] });
    expect(buildProposalRoutes({ signal: easy, frame, routeSetIdSeed: "s" })[0].recommended).toBe("easy");
  });

  it("#16 unresolved あり → 全 route tentative・notes 転記・push 推薦は null に抑制", () => {
    // task に placements で存在しない block を指させて unresolved を作る
    const t = task("t1", { completionStatus: inferredAttribute("done", 0.85, ["o"], { status: "confirmed" }), placements: ["swb:2026-06-20:99"] });
    const a = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1", { placements: ["swb:2026-06-20:99"] })], blocks: [] } });
    const b = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [t], blocks: [] } });
    const signal = buildRealityLearningSignal({ prior: a, current: b });
    expect(signal.unresolved.length).toBeGreaterThan(0);
    const set = setFor(buildProposalRoutes({ signal, frame: b, routeSetIdSeed: "s" }), "trn:t1")!;
    expect(set.routes.every((r) => r.confidence === "tentative")).toBe(true);
    expect(set.unresolvedNotes.length).toBeGreaterThan(0);
    expect(set.recommended).toBeNull(); // push 最多でも unresolved で抑制
  });

  it("#17 ledgerRefsObserved は read-only 転記（write しない・targetNodeId のみ）", () => {
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const ledger: TaskLedgerSignalV0 = { taskRealityNodeId: "trn:t1", outcome: "completed", observedAt: "2026-06-20T21:00:00+09:00" };
    const signal = buildRealityLearningSignal({ prior: null, current: frame, ledgerSignals: [ledger] });
    const set = setFor(buildProposalRoutes({ signal, frame, routeSetIdSeed: "s" }), "trn:t1")!;
    expect(set.ledgerRefsObserved).toContain("trn:t1");
  });

  it("#18 buildProposalRoutes は signal/frame を mutate しない（pure）", () => {
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const signal = buildRealityLearningSignal({ prior: null, current: frame, gradients: [grad("duration", "lower")] });
    const snapshotJson = JSON.stringify(signal);
    buildProposalRoutes({ signal, frame, routeSetIdSeed: "s" });
    expect(JSON.stringify(signal)).toBe(snapshotJson); // 改変ゼロ
  });

  it("#19 PROPOSAL_STANCES は protect/easy/push の 3 値", () => {
    expect(PROPOSAL_STANCES).toEqual(["protect", "easy", "push"]);
  });

  it("#20 proposalRouteViolations: route!=3 / forTarget 不正 / 根拠なし reason を検出", () => {
    const bad: ProposalRouteSetV0 = {
      schemaVersion: 0, routeSetId: "x",
      forTarget: { universe: "attribute", kind: "proposal", id: "proposal:x" }, // M4 違反
      routes: [
        { stance: "protect", reasons: [{ stance: "protect", basisBucket: "diff_collapsed", evidenceRefs: [] }], confidence: "low" }, // 根拠なし
        { stance: "easy", reasons: [], confidence: "low" },
      ], // 3 でない
      recommended: null, unresolvedCount: 0, unresolvedNotes: [], ledgerRefsObserved: [],
    };
    const v = proposalRouteViolations(bad);
    expect(v.some((m) => /routes は常に 3/.test(m))).toBe(true);
    expect(v.some((m) => /forTarget は workLane\/task/.test(m))).toBe(true);
    expect(v.some((m) => /evidenceRefs が無い/.test(m))).toBe(true);
  });
});
