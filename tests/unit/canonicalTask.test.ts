/**
 * RO-8 — canonicalTask: neutral canonical task source + TaskRealityNode projection。
 *   OrbitTask データモデルを salvage（Origin 非依存）。欠損属性は honest-unknown（捏造しない）。
 *   思想 field（motivation/completionFeel）は canonical 温存・projection で流さない。
 * 正本設計: docs/reality-os-ro8-task-source-rehome-orbittask-salvage-contract-design.md
 */
import { describe, it, expect } from "vitest";
import {
  buildCanonicalTask,
  projectCanonicalTaskToRealityNode,
  canonicalTaskViolations,
  CANONICAL_TASK_VERSION,
  type ProjectionGovernanceV0,
  type CanonicalTaskInputV0,
} from "@/lib/plan/realityCore/canonicalTask";
import { taskRealityNodeViolations } from "@/lib/plan/realityCore/taskRealityNode";
import { inferredAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

const CE: ChangeEligibilityValue = {
  canSuggestMove: true, canSuggestShorten: false, canSuggestSkip: false, canSuggestDelegate: false,
  requiresConfirmation: false, requiresExternalCommunication: false, blockedReason: null,
};
const GOV: ProjectionGovernanceV0 = {
  changeEligibility: inferredAttribute(CE, 0.6, ["gov"]),
  permissionLevel: inferredAttribute<PermissionLevel>(2, 0.6, ["gov"]),
};
const ct = (over: Partial<CanonicalTaskInputV0> = {}) =>
  buildCanonicalTask({ taskId: "ot1", text: "牛乳を買う", addedAt: "2026-06-20T08:00:00+09:00", ...over });

describe("RO-8 canonicalTask — salvage 属性 + 思想", () => {
  it("#1 buildCanonicalTask は OrbitTask 由来の属性を保持（思想含む）", () => {
    const t = ct({ dueDate: "2026-06-21", dueTime: "18:00", completed: false, carriedFrom: "2026-06-19", carryCount: 2, motivation: "obligation", completionFeel: "relieved", tags: ["買い物"] });
    expect(t.schemaVersion).toBe(CANONICAL_TASK_VERSION);
    expect(t.dueDate).toBe("2026-06-21");
    expect(t.motivation).toBe("obligation"); // 思想 salvage
    expect(t.completionFeel).toBe("relieved");
    expect(t.carryCount).toBe(2);
    expect(canonicalTaskViolations(t)).toEqual([]);
  });

  it("#2 INV: dueDate/dueTime/carriedFrom 形式・motivation/completionFeel 値域", () => {
    expect(canonicalTaskViolations(ct({ dueDate: "2026/6/21" })).some((m) => /dueDate は YYYY-MM-DD/.test(m))).toBe(true);
    expect(canonicalTaskViolations(ct({ dueTime: "6pm" })).some((m) => /dueTime は HH:mm/.test(m))).toBe(true);
    expect(canonicalTaskViolations(ct({ motivation: "lazy" as never })).some((m) => /motivation が未知/.test(m))).toBe(true);
  });
});

describe("RO-8 projection — salvage 写像 + honest-unknown", () => {
  it("#3 deadline は dueDate+dueTime から ISO 合成（confirmed 寄り）", () => {
    const node = projectCanonicalTaskToRealityNode(ct({ dueDate: "2026-06-21", dueTime: "18:00" }), GOV);
    expect(node.deadline.value).toBe("2026-06-21T18:00:00+09:00");
    expect(node.deadline.status).toBe("confirmed");
    expect(taskRealityNodeViolations(node)).toEqual([]);
  });

  it("#4 dueTime 無し → end-of-day 規約（確信度低め・honest）", () => {
    const node = projectCanonicalTaskToRealityNode(ct({ dueDate: "2026-06-21", dueTime: null }), GOV);
    expect(node.deadline.value).toBe("2026-06-21T23:59:00+09:00");
    expect(node.deadline.confidence).toBeLessThanOrEqual(0.5);
  });

  it("#5 dueDate 無し → deadline unknown（捏造しない）", () => {
    const node = projectCanonicalTaskToRealityNode(ct({ dueDate: null }), GOV);
    expect(node.deadline.value).toBeNull();
    expect(node.deadline.status).toBe("unknown");
  });

  it("#6 欠損属性は全て honest-unknown（duration/cognitiveLoad/canSplit/canMove）", () => {
    const node = projectCanonicalTaskToRealityNode(ct(), GOV);
    expect(node.estimatedDuration.status).toBe("unknown");
    expect(node.cognitiveLoad.status).toBe("unknown");
    expect(node.canSplit.status).toBe("unknown");
    expect(node.canMove.status).toBe("unknown");
    expect(node.estimatedDuration.value).toBeNull(); // 捏造ゼロ
  });

  it("#7 completionStatus: completed→done / carried→not_started", () => {
    expect(projectCanonicalTaskToRealityNode(ct({ completed: true, completedAt: "2026-06-20T20:00:00+09:00" }), GOV).completionStatus.value).toBe("done");
    const carried = projectCanonicalTaskToRealityNode(ct({ completed: false, carriedFrom: "2026-06-19" }), GOV).completionStatus;
    expect(carried.value).toBe("not_started");
    expect(carried.evidenceRefs.some((e) => /from_2026-06-19/.test(e))).toBe(true);
  });

  it("#8 anchorId を付けない（future input・protect 発火しない）/ placements 空 / id は trn:", () => {
    const node = projectCanonicalTaskToRealityNode(ct(), GOV);
    expect(node.sourceRefs.anchorId).toBeUndefined(); // anchor 紐付けは future
    expect(node.sourceRefs.seedId).toBe("ot1");
    expect(node.placements).toEqual([]);
    expect(node.taskRealityNodeId).toBe("trn:ot1");
  });

  it("#9 思想 field（motivation/completionFeel）は TaskRealityNode に流さない（型に該当なし・温存のみ）", () => {
    const node = projectCanonicalTaskToRealityNode(ct({ motivation: "curiosity", completionFeel: "satisfying" }), GOV) as unknown as Record<string, unknown>;
    expect("motivation" in node).toBe(false);
    expect("completionFeel" in node).toBe(false);
  });

  it("#10 projection は RO-1 INV に全適合（taskRealityNodeViolations 空）", () => {
    for (const over of [{}, { dueDate: "2026-06-21", dueTime: "09:30" }, { completed: true, completedAt: "2026-06-20T20:00:00+09:00" }, { carriedFrom: "2026-06-18", carryCount: 3 }]) {
      expect(taskRealityNodeViolations(projectCanonicalTaskToRealityNode(ct(over), GOV))).toEqual([]);
    }
  });

  it("#11 governance は注入（捏造でなく caller 供給）", () => {
    const node = projectCanonicalTaskToRealityNode(ct(), GOV);
    expect(node.permissionLevel.value).toBe(2);
    expect(node.changeEligibility.value).toEqual(CE);
  });
});
