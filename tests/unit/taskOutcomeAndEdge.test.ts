/**
 * RO-1 D4+D5 — TaskOutcome（completionStatus 単一写像 + carryOver/ledger 口）+ Edge 準備（5 edge join 鍵）。
 *   pure・injected fixtures のみ。RJ6/RO-3 への口だけ（接続実体は所管外）。typed edge は作らない。
 * 正本設計: docs/reality-os-ro1-task-work-foundation-design.md（RO-1 D4/D5）
 */
import { describe, it, expect } from "vitest";
import {
  applyTaskOutcome,
  completionStatusForOutcome,
  taskOutcomeViolations,
  TASK_OUTCOME_KIND_VALUES,
  type TaskOutcomeKind,
  type TaskOutcomeV0,
} from "@/lib/plan/realityCore/taskOutcome";
import {
  taskEdgeJoinReadiness,
  taskBlockJoinKeys,
  taskDeadlineJoinKey,
  blockCalendarWindowJoinKey,
  taskCarryOverJoinKey,
  taskProposalJoinKey,
  TASK_EDGE_KINDS,
  type TaskEdgeKind,
  type EdgeJoinReadinessV0,
} from "@/lib/plan/realityCore/taskEdgePrep";
import { buildTaskRealityNode, type TaskRealityNodeInputV0 } from "@/lib/plan/realityCore/taskRealityNode";
import { buildScheduledWorkBlock, attachBlockToTask } from "@/lib/plan/realityCore/scheduledWorkBlock";
import { inferredAttribute, heuristicAttribute, unknownAttribute, realityAttributeViolations } from "@/lib/plan/realityCore/realityAttribute";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

const CE: ChangeEligibilityValue = {
  canSuggestMove: true, canSuggestShorten: false, canSuggestSkip: false, canSuggestDelegate: false,
  requiresConfirmation: false, requiresExternalCommunication: false, blockedReason: null,
};
function task(over: Partial<TaskRealityNodeInputV0> = {}) {
  return buildTaskRealityNode({
    taskId: "t1", title: "作業",
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
const outcome = (kind: TaskOutcomeKind, over: Partial<TaskOutcomeV0> = {}): TaskOutcomeV0 => ({
  taskRealityNodeId: "trn:t1", outcome: kind, observedAt: "2026-06-20T21:30:00+09:00", evidenceRefs: ["user_report"], ...over,
});

describe("RO-1 D4 TaskOutcome — 単一写像 + 口", () => {
  it("#1 TaskOutcomeKind は blocked 含む 6 値", () => {
    expect(TASK_OUTCOME_KIND_VALUES).toEqual(["completed", "partial", "skipped", "carried_over", "progressed", "blocked"]);
  });

  it("#2 completionStatusForOutcome は決定的単一写像", () => {
    expect(completionStatusForOutcome("completed")).toBe("done");
    expect(completionStatusForOutcome("partial")).toBe("partially_done");
    expect(completionStatusForOutcome("progressed")).toBe("in_progress");
    expect(completionStatusForOutcome("blocked")).toBe("blocked");
    expect(completionStatusForOutcome("skipped")).toBe("not_started");
    expect(completionStatusForOutcome("carried_over")).toBe("not_started");
  });

  it("#3 applyTaskOutcome が completionStatus を更新（task master は消えない）", () => {
    const t = task();
    const r = applyTaskOutcome(t, outcome("completed"));
    expect(r.task.completionStatus.value).toBe("done");
    expect(realityAttributeViolations("completionStatus", r.task.completionStatus)).toEqual([]);
    // master 不滅: 他属性は保持
    expect(r.task.taskRealityNodeId).toBe("trn:t1");
    expect(r.task.deadline.value).toBe("2026-06-21T18:00:00");
    expect(t.completionStatus.value).toBe("not_started"); // 元 task は不変（pure）
  });

  it("#4 carryOverSignal: carried_over / blocked のとき非 null・他は null", () => {
    expect(applyTaskOutcome(task(), outcome("carried_over")).carryOverSignal?.carriedOver).toBe(true);
    expect(applyTaskOutcome(task(), outcome("blocked")).carryOverSignal?.reason).toBe("blocked");
    expect(applyTaskOutcome(task(), outcome("completed")).carryOverSignal).toBeNull();
    expect(applyTaskOutcome(task(), outcome("skipped")).carryOverSignal).toBeNull(); // skip ≠ 持ち越し
  });

  it("#5 ledgerSignal: 全 outcome が ledger event の口を持つ（RJ6 接続は所管外）", () => {
    for (const kind of TASK_OUTCOME_KIND_VALUES) {
      const r = applyTaskOutcome(task(), outcome(kind, { blockId: "swb:2026-06-20:0" }));
      expect(r.ledgerSignal.outcome).toBe(kind);
      expect(r.ledgerSignal.taskRealityNodeId).toBe("trn:t1");
      expect(r.ledgerSignal.blockId).toBe("swb:2026-06-20:0");
      expect(r.ledgerSignal.observedAt).toBe("2026-06-20T21:30:00+09:00");
    }
  });

  it("#6 skip と blocked が completionStatus / signal で区別される（学習精度）", () => {
    const sk = applyTaskOutcome(task(), outcome("skipped"));
    const bl = applyTaskOutcome(task(), outcome("blocked"));
    expect(sk.task.completionStatus.value).toBe("not_started");
    expect(bl.task.completionStatus.value).toBe("blocked");
    expect(sk.carryOverSignal).toBeNull();
    expect(bl.carryOverSignal?.carriedOver).toBe(true);
    expect(sk.ledgerSignal.outcome).toBe("skipped");
    expect(bl.ledgerSignal.outcome).toBe("blocked");
  });

  it("#7 taskOutcomeViolations: 不正 id / 空 observedAt を検出", () => {
    expect(taskOutcomeViolations(outcome("completed"))).toEqual([]);
    expect(taskOutcomeViolations({ ...outcome("completed"), taskRealityNodeId: "bad" }).some((m) => m.includes("trn:"))).toBe(true);
    expect(taskOutcomeViolations({ ...outcome("completed"), observedAt: "" }).some((m) => m.includes("observedAt"))).toBe(true);
  });
});

describe("RO-1 D5 Edge 準備 — 5 edge join 鍵（typed edge は作らない=RO-3）", () => {
  it("#8 5 edge kind が確定", () => {
    expect(TASK_EDGE_KINDS).toEqual(["task_block", "task_deadline", "block_calendar_window", "task_carry_over", "task_proposal"]);
  });

  it("#9 全 join 鍵が揃った task → 全 edge ready", () => {
    let t = task();
    const b = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: "20:30", endHHMM: "21:00", calendarWindowRef: "win-1" });
    t = attachBlockToTask(t, b);
    const carry = applyTaskOutcome(t, outcome("carried_over")).carryOverSignal;
    const readiness = taskEdgeJoinReadiness(t, [b], carry);
    const byKind = Object.fromEntries(readiness.map((r) => [r.kind, r.ready])) as Record<TaskEdgeKind, boolean>;
    expect(byKind.task_block).toBe(true);
    expect(byKind.task_deadline).toBe(true);
    expect(byKind.block_calendar_window).toBe(true);
    expect(byKind.task_carry_over).toBe(true);
    expect(byKind.task_proposal).toBe(true);
  });

  it("#10 join 鍵 extractor が正しい id を返す", () => {
    let t = task();
    const b = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: "20:30", endHHMM: "21:00", calendarWindowRef: "win-1" });
    t = attachBlockToTask(t, b);
    expect(taskBlockJoinKeys(t)).toEqual({ fromId: "trn:t1", toBlockIds: ["swb:2026-06-20:0"] });
    expect(taskDeadlineJoinKey(t)).toEqual({ fromId: "trn:t1", deadlineIso: "2026-06-21T18:00:00" });
    expect(blockCalendarWindowJoinKey(b)).toEqual({ fromBlockId: "swb:2026-06-20:0", calendarWindowRef: "win-1" });
    expect(taskProposalJoinKey(t)).toEqual({ fromId: "trn:t1" });
    expect(taskCarryOverJoinKey(null)).toBeNull();
  });

  it("#11 鍵欠落は honest に ready=false（捏造で埋めない）", () => {
    const t = task({ deadline: unknownAttribute<string>() }); // deadline 未確定・placements 空
    const bNoWin = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: "20:30", endHHMM: "21:00" }); // calendarWindowRef なし
    const readiness = taskEdgeJoinReadiness(t, [bNoWin], null);
    const byKind = Object.fromEntries(readiness.map((r) => [r.kind, r])) as Record<TaskEdgeKind, EdgeJoinReadinessV0>;
    expect(byKind.task_deadline.ready).toBe(false);
    expect(byKind.task_deadline.missing).toContain("deadline");
    expect(byKind.task_block.ready).toBe(false); // placements 空
    expect(byKind.block_calendar_window.ready).toBe(false);
    expect(byKind.task_carry_over.ready).toBe(false); // 未持ち越し
    expect(byKind.task_proposal.ready).toBe(true); // taskRealityNodeId は常在
  });
});
