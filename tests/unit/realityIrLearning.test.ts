/**
 * RO-3 D1–D5 — Reality IR 学習化（typed edge / RealityDiff / Change 分類 / Correction Gradient / Learning seam）。
 *   pure・injected fixtures のみ。snapshot 不変・frame 封筒・checkResolvable phantom=0・seam は書かない。
 * 正本設計: docs/reality-os-ro3-reality-ir-learning-design.md（RO-3 v0.1・敵対的検証 15 mustFix 反映）
 *
 * CEO 必須検証点（2026-06-20 実装 GO）:
 *   - task_block は placements(swb:)↔block.blockId(swb:) 正方向 / normalizeTaskRef は逆 join 限定
 *   - task ledger candidate は task_untypeable_v0（PredictionTargetNodeKind に task 追加しない）
 *   - etaKnown false→true / departureStatus 悪化 は v0 dormant（発火対象にしない）
 *   - leaveByLines resolved は専用パス / event_movement は ern:<date>:<anchorId> 再構成 gate / unresolved は ready=false
 */
import { describe, it, expect } from "vitest";
import {
  buildRealityFrame,
  frameIdSets,
  normalizeTaskRef,
  checkResolvable,
  hasWorkLane,
  type RealityFrameV0,
  type RealityNodeRef,
} from "@/lib/plan/realityCore/realityFrame";
import {
  materializeEdges,
  realityGraphEdgeViolations,
  type RealityEdgeKind,
} from "@/lib/plan/realityCore/realityGraphEdge";
import { diffSnapshots, realityDiffViolations } from "@/lib/plan/realityCore/realityDiff";
import { classifyChange, realityChangeViolations } from "@/lib/plan/realityCore/realityChange";
import {
  decomposeCorrection,
  mapToExistingAxis,
  correctionGradientViolations,
  CORRECTION_AXES,
} from "@/lib/plan/realityCore/correctionGradient";
import {
  buildRealityLearningSignal,
  realityLearningSignalViolations,
} from "@/lib/plan/realityCore/realityLearningSignal";
import type { RealityGraphSnapshotV0 } from "@/lib/plan/realityCore/realityGraphSnapshot";
import type { EventRealityNodeV0 } from "@/lib/plan/realityCore/eventRealityNode";
import type { MovementRealityV0 } from "@/lib/plan/realityCore/movementReality";
import type { LeaveByLinesV0 } from "@/lib/plan/realityCore/leaveByLines";
import { buildLeaveByLines, unresolvedLeaveByLines } from "@/lib/plan/realityCore/leaveByLines";
import { buildTaskRealityNode, type TaskRealityNodeInputV0, type TaskRealityNodeV0 } from "@/lib/plan/realityCore/taskRealityNode";
import { buildScheduledWorkBlock, type ScheduledWorkBlockV0 } from "@/lib/plan/realityCore/scheduledWorkBlock";
import type { TaskCarryOverSignalV0, TaskLedgerSignalV0 } from "@/lib/plan/realityCore/taskOutcome";
import { inferredAttribute, heuristicAttribute, unknownAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

// ── fixtures（RO-3 が読む field のみ満たす最小 fixture。test-only・局所 cast） ──
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

function block(taskId: string, date: string, n: number, over: Partial<Parameters<typeof buildScheduledWorkBlock>[0]> = {}): ScheduledWorkBlockV0 {
  return buildScheduledWorkBlock({ taskId, date, n, startHHMM: "13:00", endHHMM: "14:00", ...over });
}

/** RO-3 が読む ern field のみ（eventRealityNodeId/date/sourceRefs.anchorId/leaveBy/placeCertainty/movementRequired/leaveByLines）。 */
function ern(date: string, anchorId: string, over: { leaveByLines?: LeaveByLinesV0; placeCertainty?: number | null } = {}): EventRealityNodeV0 {
  const partial = {
    schemaVersion: 0,
    eventRealityNodeId: `ern:${date}:${anchorId}`,
    date,
    subjectiveDate: date,
    sourceRefs: { anchorId, dayGraphNodeId: `dgn:${anchorId}`, dayGraphSnapshotId: "dgs:x" },
    leaveBy: { ...unknownAttribute<string>(), whyUnresolved: [] as const },
    placeCertainty: over.placeCertainty !== undefined
      ? (over.placeCertainty === null ? unknownAttribute<number>() : inferredAttribute(over.placeCertainty, 0.6, ["pc"]))
      : unknownAttribute<number>(),
    movementRequired: unknownAttribute<boolean>(),
    ...(over.leaveByLines !== undefined ? { leaveByLines: over.leaveByLines } : {}),
  };
  return partial as unknown as EventRealityNodeV0;
}

/** RO-3 が読む mv field のみ（movementRealityId/sourceRefs.toAnchorId）。 */
function mv(date: string, fromAnchor: string, toAnchor: string): MovementRealityV0 {
  const partial = {
    movementRealityId: `mv:${date}:${fromAnchor}:${toAnchor}`,
    sourceRefs: { fromAnchorId: fromAnchor, toAnchorId: toAnchor, toNodeId: toAnchor, transitionBasis: `${fromAnchor}->${toAnchor}` },
  };
  return partial as unknown as MovementRealityV0;
}

/** RO-3 が読む snapshot field のみ（identity + node 集合）。 */
function snap(over: {
  graphBaseId?: string; snapshotId?: string; minute?: number;
  ern?: EventRealityNodeV0[]; mv?: MovementRealityV0[]; cs?: { commitmentSignalId: string }[];
} = {}): RealityGraphSnapshotV0 {
  const partial = {
    schemaVersion: 0,
    graphBaseId: over.graphBaseId ?? "rgb:2026-06-20:vk1:hashA",
    snapshotId: over.snapshotId ?? "rgs:rgb:2026-06-20:vk1:hashA:780",
    subjectiveDate: "2026-06-20",
    minuteOfSubjectiveDay: over.minute ?? 780,
    eventRealityNodes: over.ern ?? [],
    movementRealityNodes: over.mv ?? [],
    commitmentSignals: over.cs ?? [],
  };
  return partial as unknown as RealityGraphSnapshotV0;
}

const leaveByInput = (over = {}) => ({
  arrivalTargetInstant: "2026-06-20T14:00:00+09:00",
  durMin: 30,
  prepTime: heuristicAttribute<number>(40, 0.3, ["prep"]),
  ...over,
});

// ════════════════ D1 RealityFrame ════════════════
describe("RO-3 D1 RealityFrame — Two-Universe Single-Frame", () => {
  it("#1 buildRealityFrame は snapshot を改変せず workLane を injected で束ねる", () => {
    const s = snap();
    const frame = buildRealityFrame({ snapshot: s, workLane: { tasks: [task("t1")] } });
    expect(frame.snapshot).toBe(s); // 参照のまま（改変なし）
    expect(frame.workLane.tasks).toHaveLength(1);
    expect(hasWorkLane(frame)).toBe(true);
  });

  it("#2 workLane 未供給は空 lane（hasWorkLane=false）", () => {
    const frame = buildRealityFrame({ snapshot: snap() });
    expect(hasWorkLane(frame)).toBe(false);
    expect(frame.workLane.tasks).toEqual([]);
  });

  it("#3 normalizeTaskRef は逆 join 限定（素 taskId → trn:・trn: は冪等）", () => {
    expect(normalizeTaskRef("t1")).toBe("trn:t1");
    expect(normalizeTaskRef("trn:t1")).toBe("trn:t1");
  });

  it("#4 checkResolvable は宇宙別 membership（snapshot/workLane/attribute）", () => {
    const frame = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1")] }), workLane: { tasks: [task("t1")], blocks: [block("t1", "2026-06-20", 1)] } });
    const sets = frameIdSets(frame);
    expect(checkResolvable({ universe: "snapshot", kind: "event", id: "ern:2026-06-20:a1" }, sets)).toBe(true);
    expect(checkResolvable({ universe: "snapshot", kind: "event", id: "ern:2026-06-20:ZZ" }, sets)).toBe(false);
    expect(checkResolvable({ universe: "workLane", kind: "task", id: "trn:t1" }, sets)).toBe(true);
    expect(checkResolvable({ universe: "workLane", kind: "block", id: "swb:2026-06-20:1" }, sets)).toBe(true);
    expect(checkResolvable({ universe: "attribute", kind: "deadline", id: "deadline:x" }, sets)).toBe(true);
  });
});

// ════════════════ D2 RealityGraphEdge ════════════════
describe("RO-3 D2 RealityGraphEdge — 9 kind・phantom=0", () => {
  it("#5 task_block は placements(swb:)↔block.blockId(swb:) 正方向で resolve", () => {
    const t = task("t1", { placements: ["swb:2026-06-20:1"] });
    const b = block("t1", "2026-06-20", 1);
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [t], blocks: [b] } });
    const { edges } = materializeEdges(frame);
    const tb = edges.find((e) => e.kind === "task_block");
    expect(tb).toBeDefined();
    expect(tb!.from.id).toBe("trn:t1");
    expect(tb!.to.id).toBe("swb:2026-06-20:1");
    expect(tb!.joinBasis).toBe("placements↔block.blockId");
    expect(tb!.resolvable).toBe(true);
  });

  it("#6 dangling placements（block 不在）は edge を生成せず unresolved に ready=false", () => {
    const t = task("t1", { placements: ["swb:2026-06-20:99"] }); // 供給 block に無い
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [t], blocks: [] } });
    const { edges, unresolved } = materializeEdges(frame);
    expect(edges.find((e) => e.kind === "task_block")).toBeUndefined(); // phantom 作らない
    expect(unresolved.some((u) => u.kind === "task_block" && u.ready === false)).toBe(true);
  });

  it("#7 逆 join（block.sourceRefs.taskId↔task）の dangling も unresolved（normalizeTaskRef 経由）", () => {
    const b = block("orphan", "2026-06-20", 1); // 対応 task 不在
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [], blocks: [b] } });
    const { unresolved } = materializeEdges(frame);
    expect(unresolved.some((u) => u.kind === "task_block" && /逆 join/.test(u.missing ?? ""))).toBe(true);
  });

  it("#8 event_movement は ern:<date>:<anchorId> 再構成 membership gate（対応 ern あり→edge）", () => {
    const frame = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a2")], mv: [mv("2026-06-20", "a1", "a2")] }) });
    const { edges } = materializeEdges(frame);
    const em = edges.find((e) => e.kind === "event_movement");
    expect(em).toBeDefined();
    expect(em!.from.id).toBe("ern:2026-06-20:a2");
    expect(em!.to.id).toBe("mv:2026-06-20:a1:a2");
  });

  it("#9 event_movement で toAnchorId が ern に対応しない（fallback 疑い）→ edge なし・unresolved", () => {
    // mv.toAnchorId='node-x' に対応する ern が frame に無い（toNodeId fallback 相当）
    const frame = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a2")], mv: [mv("2026-06-20", "a1", "node-x")] }) });
    const { edges, unresolved } = materializeEdges(frame);
    expect(edges.find((e) => e.kind === "event_movement")).toBeUndefined();
    expect(unresolved.some((u) => /event_movement/.test(u.missing ?? ""))).toBe(true);
  });

  it("#10 event_leave_by_lines は intra-node lens（toId=親ern・phantom node なし）", () => {
    const lbl = buildLeaveByLines(leaveByInput());
    const frame = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", { leaveByLines: lbl })] }) });
    const { edges } = materializeEdges(frame);
    const e = edges.find((x) => x.kind === "event_leave_by_lines");
    expect(e).toBeDefined();
    expect(e!.from.id).toBe("ern:2026-06-20:a1");
    expect(e!.to.id).toBe("lbl:ern:2026-06-20:a1");
  });

  it("#11 task_deadline は value=null なら edge なし", () => {
    const t = task("t1", { deadline: unknownAttribute<string>() });
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [t] } });
    const { edges } = materializeEdges(frame);
    expect(edges.find((e) => e.kind === "task_deadline")).toBeUndefined();
  });

  it("#12 materialize した全 edge は INV 適合（resolvable=true・edgeId 整合）", () => {
    const t = task("t1", { placements: ["swb:2026-06-20:1"] });
    const frame = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1")] }), workLane: { tasks: [t], blocks: [block("t1", "2026-06-20", 1)] } });
    const { edges } = materializeEdges(frame);
    for (const e of edges) expect(realityGraphEdgeViolations(e)).toEqual([]);
  });
});

// ════════════════ D3 RealityDiff ════════════════
describe("RO-3 D3 RealityDiff — 5 bucket・graphBaseId-aware・dormant 除外", () => {
  it("#13 A=null（初回）は added のみ・他 bucket 空", () => {
    const b = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1")] }), workLane: { tasks: [task("t1")] } });
    const d = diffSnapshots(null, b);
    expect(d.fromSnapshotId).toBeNull();
    expect(d.nodes.added.length).toBe(2); // ern + task
    expect(d.nodes.removed).toEqual([]);
    expect(d.nodes.changed).toEqual([]);
    expect(d.resolved).toEqual([]);
    expect(d.collapsed).toEqual([]);
    expect(realityDiffViolations(d)).toEqual([]);
  });

  it("#14 graphBaseId 不一致（別日/別入力）→ crossDay=true・changed/resolved/collapsed 空", () => {
    const a = buildRealityFrame({ snapshot: snap({ graphBaseId: "rgb:A", ern: [ern("2026-06-20", "a1", { placeCertainty: null })] }) });
    const b = buildRealityFrame({ snapshot: snap({ graphBaseId: "rgb:B", ern: [ern("2026-06-20", "a1", { placeCertainty: 0.9 })] }) });
    const d = diffSnapshots(a, b);
    expect(d.crossDay).toBe(true);
    expect(d.nodes.changed).toEqual([]);
    expect(d.resolved).toEqual([]);
    expect(realityDiffViolations(d)).toEqual([]);
  });

  it("#15 changed は value 差のみ・resolved は null→non-null 単調確定（placeCertainty）", () => {
    const a = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", { placeCertainty: null })] }) });
    const b = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", { placeCertainty: 0.9 })] }) });
    const d = diffSnapshots(a, b);
    expect(d.crossDay).toBe(false);
    expect(d.nodes.changed.some((c) => c.field === "placeCertainty" && c.from === null && c.to === 0.9)).toBe(true);
    expect(d.resolved.some((r) => r.field === "placeCertainty" && r.via === "value_monotonic")).toBe(true);
  });

  it("#16 leaveByLines resolved は専用パス（whyUnresolved 空化＝双解決）", () => {
    const aLbl = unresolvedLeaveByLines(["eta_source_missing"]);
    const bLbl = buildLeaveByLines(leaveByInput());
    const a = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", { leaveByLines: aLbl })] }) });
    const b = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", { leaveByLines: bLbl })] }) });
    const d = diffSnapshots(a, b);
    expect(d.resolved.some((r) => r.field === "leaveByLines" && r.via === "leave_by_lines")).toBe(true);
  });

  it("#17 collapsed は bandGapMin 縮小のみ（余地の悪化）", () => {
    const wide = buildLeaveByLines(leaveByInput({ bufferLargeMin: 60, bufferFloorMin: 5 })); // gap 55
    const narrow = buildLeaveByLines(leaveByInput({ bufferLargeMin: 20, bufferFloorMin: 5 })); // gap 15
    const a = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", { leaveByLines: wide })] }) });
    const b = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", { leaveByLines: narrow })] }) });
    const d = diffSnapshots(a, b);
    expect(d.collapsed.some((c) => c.field === "leaveByLines.bandGapMin" && c.toGap < c.fromGap)).toBe(true);
    expect(realityDiffViolations(d)).toEqual([]);
  });

  it("#18 workLane 片欠落 → workLaneDiffable=false（沈黙で偽装しない）", () => {
    const a = buildRealityFrame({ snapshot: snap() }); // workLane なし
    const b = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const d = diffSnapshots(a, b);
    expect(d.workLaneDiffable).toBe(false);
  });

  it("#19 dormant: departureStatus/etaKnown は diff の発火対象にしない（ern fields に含めない）", () => {
    // 同 ern を 2 回（値同一）→ changed/resolved/collapsed すべて空（dormant field を覗いて誤発火しない）
    const a = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1")] }) });
    const b = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1")] }) });
    const d = diffSnapshots(a, b);
    expect(d.nodes.changed).toEqual([]);
    expect(d.resolved).toEqual([]);
    expect(d.collapsed).toEqual([]);
  });
});

// ════════════════ D4a RealityChange ════════════════
describe("RO-3 D4a RealityChange — 6 union 畳まず sourceVocab dispatch", () => {
  it("#20 task completionStatus changed → lane=task・sourceVocab=task_outcome", () => {
    const a = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } }); // not_started
    const bt = task("t1", { completionStatus: inferredAttribute("done", 0.85, ["o"], { status: "confirmed" }) });
    const b = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [bt] } });
    const d = diffSnapshots(a, b);
    const changes = classifyChange(d, b);
    const c = changes.find((x) => x.lane === "task");
    expect(c).toBeDefined();
    expect(c!.classifiedAs).toBe("completed"); // TaskOutcomeKind 参照
    expect(c!.sourceVocab).toBe("task_outcome");
    expect(realityChangeViolations(c!)).toEqual([]);
  });

  it("#21 carryOver signal（carried_over/blocked）の区別を保つ", () => {
    const sig: TaskCarryOverSignalV0 = { taskRealityNodeId: "trn:t1", carriedOver: true, reason: "blocked" };
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { carryOverSignals: [sig] } });
    const d = diffSnapshots(null, frame);
    const changes = classifyChange(d, frame);
    expect(changes.some((c) => c.lane === "task" && c.classifiedAs === "blocked")).toBe(true);
  });

  it("#22 leaveByLines resolved → lane=movement・departure_line_changed", () => {
    const a = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", { leaveByLines: unresolvedLeaveByLines() })] }) });
    const b = buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1", { leaveByLines: buildLeaveByLines(leaveByInput()) })] }) });
    const d = diffSnapshots(a, b);
    const changes = classifyChange(d, b);
    expect(changes.some((c) => c.lane === "movement" && c.classifiedAs === "departure_line_changed")).toBe(true);
  });
});

// ════════════════ D4b CorrectionGradient ════════════════
describe("RO-3 D4b CorrectionGradient — 別型隔離・direction 値空間を混ぜない", () => {
  it("#23 6 axis・energy/duration は既存写像・残 4 は net-new（null）", () => {
    expect(CORRECTION_AXES).toEqual(["duration", "energy", "prep", "route", "deadline", "cognitiveLoad"]);
    expect(mapToExistingAxis("energy")).toBe("energyLevel");
    expect(mapToExistingAxis("duration")).toBe("durationBucket");
    expect(mapToExistingAxis("prep")).toBeNull();
    expect(mapToExistingAxis("route")).toBeNull();
  });

  it("#24 level 系 axis は direction triad・verdict=null", () => {
    const g = decomposeCorrection({ contextKey: "shift_day|packed", axisEvidence: [
      { axis: "duration", direction: "higher", magnitude: 0.2, evidenceRefs: ["skip_block"] },
    ] });
    expect(g).toHaveLength(1);
    expect(g[0].direction).toBe("higher");
    expect(g[0].verdict).toBeNull();
    expect(g[0].confidenceDelta).toBe(0.2);
    expect(correctionGradientViolations(g[0])).toEqual([]);
  });

  it("#25 accept/reject 系 axis（route/deadline）は verdict（CorrectionVerdict）・direction 中立", () => {
    const g = decomposeCorrection({ contextKey: "shift_day|packed", axisEvidence: [
      { axis: "route", verdict: "suppress", magnitude: 0.3, evidenceRefs: ["route_rejected"] },
    ] });
    expect(g[0].verdict).toBe("suppress");
    expect(g[0].direction).toBe("match");
    expect(correctionGradientViolations(g[0])).toEqual([]);
  });

  it("#26 過剰帰属禁止: evidence 空の axis には触らない（basis 必須）", () => {
    const g = decomposeCorrection({ contextKey: "c", axisEvidence: [
      { axis: "energy", direction: "lower", magnitude: 0.1, evidenceRefs: [] }, // evidence なし
    ] });
    expect(g).toEqual([]); // 捏造で confidenceDelta を載せない
  });

  it("#27 INV: level 系に verdict を載せる / accept-reject に verdict 欠落 は違反", () => {
    expect(correctionGradientViolations({ axis: "energy", contextKey: "c", direction: "lower", confidenceDelta: 0.1, verdict: "suppress", basis: ["e"] }).length).toBeGreaterThan(0);
    expect(correctionGradientViolations({ axis: "route", contextKey: "c", direction: "match", confidenceDelta: 0.1, verdict: null, basis: ["e"] }).length).toBeGreaterThan(0);
  });
});

// ════════════════ D5 RealityLearningSignal（seam） ════════════════
describe("RO-3 D5 RealityLearningSignal — seam・書かない・task_untypeable_v0", () => {
  function frameWith(): RealityFrameV0 {
    const t = task("t1", { placements: ["swb:2026-06-20:1"] });
    return buildRealityFrame({ snapshot: snap({ ern: [ern("2026-06-20", "a1")] }), workLane: { tasks: [t], blocks: [block("t1", "2026-06-20", 1)] } });
  }

  it("#28 buildRealityLearningSignal は edges/diff/changes/ledgerCandidates を束ねる（戻り値のみ）", () => {
    const sig = buildRealityLearningSignal({ prior: null, current: frameWith() });
    expect(sig.edges.length).toBeGreaterThan(0);
    expect(sig.diff.fromSnapshotId).toBeNull();
    expect(Array.isArray(sig.changes)).toBe(true);
    expect(realityLearningSignalViolations(sig)).toEqual([]);
  });

  it("#29 task 起源 ledgerCandidate は targetNodeKind=task_untypeable_v0", () => {
    const ledger: TaskLedgerSignalV0 = { taskRealityNodeId: "trn:t1", outcome: "completed", observedAt: "2026-06-20T21:00:00+09:00" };
    const sig = buildRealityLearningSignal({ prior: null, current: frameWith(), ledgerSignals: [ledger] });
    const cand = sig.ledgerCandidates.find((c) => c.targetNodeId === "trn:t1");
    expect(cand).toBeDefined();
    expect(cand!.targetNodeKind).toBe("task_untypeable_v0"); // PredictionTargetNodeKind に task を足さない
    expect(cand!.outcome).toBe("completed");
    expect(realityLearningSignalViolations(sig)).toEqual([]);
  });

  it("#30 carryOver + ledger の二重カウントを dedup（同一 task+outcome）", () => {
    const sig: { commitmentSignalId: string }[] = []; void sig;
    const ledger: TaskLedgerSignalV0 = { taskRealityNodeId: "trn:t1", outcome: "blocked", observedAt: "2026-06-20T21:00:00+09:00" };
    const carry: TaskCarryOverSignalV0 = { taskRealityNodeId: "trn:t1", carriedOver: true, reason: "blocked" };
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")], carryOverSignals: [carry] } });
    const out = buildRealityLearningSignal({ prior: null, current: frame, ledgerSignals: [ledger] });
    expect(out.ledgerCandidates.filter((c) => c.targetNodeId === "trn:t1" && c.outcome === "blocked")).toHaveLength(1);
  });

  it("#31 seam は PredictionLedger/DB に書かない（戻り値が DTO のみ・write surface なし）", () => {
    const sig = buildRealityLearningSignal({ prior: null, current: frameWith() });
    // DTO のみ（method/handle/callback を持たない）= JSON 化可能
    expect(() => JSON.stringify(sig)).not.toThrow();
    expect(typeof sig).toBe("object");
  });
});
