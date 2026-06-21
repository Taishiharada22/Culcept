/**
 * RO-1 D1+D2 — TaskRealityNode（作業の正本）+ ScheduledWorkBlock（1 task : N 配置）。
 *   pure・injected fixtures のみ。write/migration/DB/external なし。
 * 正本設計: docs/reality-os-ro1-task-work-foundation-design.md（RO-1 D1/D2）
 */
import { describe, it, expect } from "vitest";
import {
  buildTaskRealityNode,
  taskRealityNodeId,
  taskRealityNodeViolations,
  initialCompletionStatus,
  TASK_COMPLETION_STATUS_VALUES,
  type TaskRealityNodeV0,
  type TaskRealityNodeInputV0,
} from "@/lib/plan/realityCore/taskRealityNode";
import {
  buildScheduledWorkBlock,
  scheduledWorkBlockId,
  scheduledWorkBlockViolations,
  attachBlockToTask,
  blocksForTask,
  taskBlockJoinViolations,
  placementDurationViolations,
  hhmmToMin,
} from "@/lib/plan/realityCore/scheduledWorkBlock";
import {
  inferredAttribute,
  heuristicAttribute,
  unknownAttribute,
} from "@/lib/plan/realityCore/realityAttribute";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

const CE: ChangeEligibilityValue = {
  canSuggestMove: true,
  canSuggestShorten: false,
  canSuggestSkip: false,
  canSuggestDelegate: false,
  requiresConfirmation: false,
  requiresExternalCommunication: false,
  blockedReason: null,
};

function validTaskInput(over: Partial<TaskRealityNodeInputV0> = {}): TaskRealityNodeInputV0 {
  return {
    taskId: "t1",
    title: "資料作成",
    deadline: inferredAttribute("2026-06-21T18:00:00", 0.7, ["user_deadline"], { source: "known_from_user", status: "confirmed" }),
    estimatedDuration: heuristicAttribute(90, 0.3, ["duration_heuristic"]),
    cognitiveLoad: heuristicAttribute(0.7, 0.3, ["load_heuristic"]),
    canSplit: inferredAttribute(true, 0.6, ["task_split_flag"]),
    canMove: inferredAttribute(true, 0.6, ["task_move_flag"]),
    changeEligibility: inferredAttribute(CE, 0.6, ["governance_derived"]),
    permissionLevel: inferredAttribute<PermissionLevel>(2, 0.6, ["governance"]),
    ...over,
  };
}

describe("RO-1 D1 TaskRealityNode", () => {
  it("#1 build → 7 属性 + completionStatus + id 形式", () => {
    const t = buildTaskRealityNode(validTaskInput());
    expect(t.taskRealityNodeId).toBe("trn:t1");
    expect(t.schemaVersion).toBe(0);
    expect(t.completionStatus.value).toBe("not_started"); // 既定
    expect(t.minimalProgress).toBeNull(); // v0
    expect(t.placements).toEqual([]);
    expect(taskRealityNodeViolations(t)).toEqual([]);
  });

  it("#2 completionStatus は blocked 含む 6 値", () => {
    expect(TASK_COMPLETION_STATUS_VALUES).toEqual([
      "not_started",
      "in_progress",
      "partially_done",
      "done",
      "blocked",
      "dropped",
    ]);
    for (const v of TASK_COMPLETION_STATUS_VALUES) {
      const t = buildTaskRealityNode(
        validTaskInput({ completionStatus: inferredAttribute(v, 0.8, ["s"]) }),
      );
      expect(taskRealityNodeViolations(t)).toEqual([]);
    }
  });

  it("#3 deadline 未確定（unknown）でも INV 適合（捏造しない）", () => {
    const t = buildTaskRealityNode(validTaskInput({ deadline: unknownAttribute<string>() }));
    expect(t.deadline.value).toBeNull();
    expect(taskRealityNodeViolations(t)).toEqual([]);
  });

  it("#4 INV 違反検出: cognitiveLoad 範囲外 / estimatedDuration 非正 / title 空 / id 不正", () => {
    const bad = buildTaskRealityNode(
      validTaskInput({
        title: "",
        cognitiveLoad: heuristicAttribute(1.5, 0.3, ["x"]),
        estimatedDuration: heuristicAttribute(-5, 0.3, ["x"]),
      }),
    );
    const v = taskRealityNodeViolations(bad);
    expect(v.some((m) => m.includes("title が空"))).toBe(true);
    expect(v.some((m) => m.includes("cognitiveLoad は 0-1"))).toBe(true);
    expect(v.some((m) => m.includes("estimatedDuration は正"))).toBe(true);
  });

  it("#5 estimatedDuration/cognitiveLoad は heuristic（≤0.35）", () => {
    const t = buildTaskRealityNode(validTaskInput({ estimatedDuration: heuristicAttribute(90, 0.9, ["x"]) }));
    expect(t.estimatedDuration.confidence).toBeLessThanOrEqual(0.35); // heuristicAttribute が cap
    expect(taskRealityNodeViolations(t)).toEqual([]);
  });

  it("#6 taskRealityNodeId helper / initialCompletionStatus", () => {
    expect(taskRealityNodeId("abc")).toBe("trn:abc");
    expect(initialCompletionStatus().value).toBe("not_started");
  });
});

describe("RO-1 D2 ScheduledWorkBlock（1 task : N）", () => {
  it("#7 build → id 形式・durationMin は window 由来", () => {
    const b = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: "20:30", endHHMM: "21:00" });
    expect(b.blockId).toBe("swb:2026-06-20:0");
    expect(b.durationMin).toBe(30);
    expect(b.placementKind).toBe("tentative");
    expect(scheduledWorkBlockViolations(b)).toEqual([]);
  });

  it("#8 1 task : N 配置 — attachBlockToTask で placements が積まれ join 整合", () => {
    let t = buildTaskRealityNode(validTaskInput());
    const b1 = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: "09:30", endHHMM: "10:00" });
    const b2 = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 1, startHHMM: "20:30", endHHMM: "21:00" });
    t = attachBlockToTask(t, b1);
    t = attachBlockToTask(t, b2);
    expect(t.placements).toEqual(["swb:2026-06-20:0", "swb:2026-06-20:1"]);
    expect(blocksForTask(t, [b1, b2]).map((b) => b.blockId)).toEqual(["swb:2026-06-20:0", "swb:2026-06-20:1"]);
    expect(taskBlockJoinViolations(t, [b1, b2])).toEqual([]);
  });

  it("#9 attachBlockToTask は冪等（同 block 再付与で増えない）", () => {
    let t = buildTaskRealityNode(validTaskInput());
    const b = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: "09:00", endHHMM: "09:30" });
    t = attachBlockToTask(t, b);
    const t2 = attachBlockToTask(t, b);
    expect(t2.placements).toEqual(["swb:2026-06-20:0"]);
    expect(t2).toBe(t); // 同一参照（mutation なし）
  });

  it("#10 block は deadline/見積を正本化しない（join 不一致を検出）", () => {
    const t = buildTaskRealityNode(validTaskInput());
    const wrong = buildScheduledWorkBlock({ taskId: "OTHER", date: "2026-06-20", n: 0, startHHMM: "09:00", endHHMM: "09:30" });
    const tWith = attachBlockToTask(t, wrong);
    const v = taskBlockJoinViolations(tWith, [wrong]);
    expect(v.some((m) => m.includes("taskId") && m.includes("不一致"))).toBe(true);
  });

  it("#11 placementKind=anchored は anchorId 必須 / tentative は持たない", () => {
    const anchoredNoId = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: "09:00", endHHMM: "09:30", placementKind: "anchored" });
    expect(scheduledWorkBlockViolations(anchoredNoId).some((m) => m.includes("anchorId 必須"))).toBe(true);
    const anchoredOk = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: "09:00", endHHMM: "09:30", placementKind: "anchored", anchorId: "anc-1" });
    expect(scheduledWorkBlockViolations(anchoredOk)).toEqual([]);
    const tentativeWithId = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: "09:00", endHHMM: "09:30", placementKind: "tentative", anchorId: "anc-1" });
    expect(scheduledWorkBlockViolations(tentativeWithId).some((m) => m.includes("tentative は anchorId を持たない"))).toBe(true);
  });

  it("#12 placement durationMin は task 見積を超えない（分割の単位）", () => {
    const t = buildTaskRealityNode(validTaskInput({ estimatedDuration: heuristicAttribute(30, 0.3, ["x"]) }));
    const tooLong = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: "20:00", endHHMM: "21:30" }); // 90 分
    expect(placementDurationViolations(t, [tooLong]).some((m) => m.includes("超過"))).toBe(true);
    const ok = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: "20:00", endHHMM: "20:20" });
    expect(placementDurationViolations(t, [ok])).toEqual([]);
  });

  it("#13 hhmmToMin / id helper", () => {
    expect(hhmmToMin("09:30")).toBe(570);
    expect(hhmmToMin("25:00")).toBeNull();
    expect(hhmmToMin("0930")).toBeNull();
    expect(scheduledWorkBlockId("2026-06-20", 3)).toBe("swb:2026-06-20:3");
  });

  it("#14 invalid window（start≥end）→ durationMin=0 → INV 違反", () => {
    const b = buildScheduledWorkBlock({ taskId: "t1", date: "2026-06-20", n: 0, startHHMM: "21:00", endHHMM: "20:00" });
    expect(b.durationMin).toBe(0);
    expect(scheduledWorkBlockViolations(b).some((m) => m.includes("durationMin は正"))).toBe(true);
  });
});

// 型エクスポートが壊れていないことの最小確認（D1 で参照される型）
const _typecheck: TaskRealityNodeV0 | null = null;
void _typecheck;
