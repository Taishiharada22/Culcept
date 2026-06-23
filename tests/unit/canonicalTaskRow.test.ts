/**
 * P4 — canonical_tasks persistence projection + dry-run validator の test。
 * domain→row projection / completed⟺completed_at 整合 / source_kind CHECK / RLS owner key /
 * parentId two-pass / soft archive / naive time。DB に触れない pure 検証。
 */
import { describe, it, expect } from "vitest";
import {
  toCanonicalTaskRow,
  canonicalTaskRowDryRunViolations,
  CANONICAL_TASKS_TABLE,
  type CanonicalTaskRowV0,
} from "@/lib/plan/realityPipeline/canonicalTaskRow";
import type { CanonicalTaskV0 } from "@/lib/plan/realityCore/canonicalTask";

function fxTask(over: Partial<CanonicalTaskV0> = {}): CanonicalTaskV0 {
  return {
    schemaVersion: 0,
    taskId: "ot1",
    text: "資料を作成する",
    completed: false,
    completedAt: null,
    carriedFrom: null,
    carryCount: 0,
    dueDate: "2026-06-13",
    dueTime: "12:00",
    recurrence: null,
    motivation: "investment",
    completionFeel: null,
    tags: ["work"],
    parentId: null,
    addedAt: "2026-06-12T03:00:00.000Z",
    ...over,
  };
}

describe("P4 canonicalTaskRow", () => {
  it("#1 domain→row projection（snake_case・naive time・source_task_id=taskId）", () => {
    const row = toCanonicalTaskRow(fxTask(), { userId: "u1", sourceKind: "daily_orbit" });
    expect(CANONICAL_TASKS_TABLE).toBe("canonical_tasks");
    expect(row.user_id).toBe("u1");
    expect(row.source_kind).toBe("daily_orbit");
    expect(row.source_task_id).toBe("ot1");
    expect(row.due_time).toBe("12:00");
    expect(row.completion_feel).toBeNull();
    expect(row.archived_at).toBeNull(); // 既定=手動 archive のみ
    // DB 生成値は捏造しない（行に存在しない）
    expect((row as unknown as Record<string, unknown>).id).toBeUndefined();
    expect((row as unknown as Record<string, unknown>).created_at).toBeUndefined();
  });

  it("#2 適合行は violations=[]", () => {
    const row = toCanonicalTaskRow(fxTask(), { userId: "u1", sourceKind: "daily_orbit" });
    expect(canonicalTaskRowDryRunViolations(row)).toEqual([]);
  });

  it("#3 completed⟺completed_at 整合違反を検出", () => {
    const bad = toCanonicalTaskRow(fxTask({ completed: true, completedAt: null }), { userId: "u1", sourceKind: "daily_orbit" });
    expect(canonicalTaskRowDryRunViolations(bad)).toContain("completed_without_completed_at");
    const ok = toCanonicalTaskRow(fxTask({ completed: true, completedAt: "2026-06-13T05:00:00.000Z" }), { userId: "u1", sourceKind: "daily_orbit" });
    expect(canonicalTaskRowDryRunViolations(ok)).toEqual([]);
  });

  it("#4 RLS owner key 欠落 / source_kind CHECK 違反を検出", () => {
    const noUser = toCanonicalTaskRow(fxTask(), { userId: "", sourceKind: "daily_orbit" });
    expect(canonicalTaskRowDryRunViolations(noUser)).toContain("user_id_missing");
    const badKind = { ...toCanonicalTaskRow(fxTask(), { userId: "u1", sourceKind: "daily_orbit" }), source_kind: "bogus" } as unknown as CanonicalTaskRowV0;
    expect(canonicalTaskRowDryRunViolations(badKind)).toContain("source_kind_invalid");
  });

  it("#5 parentId two-pass（_source_parent_id 保持・self-parent 検出）", () => {
    const child = toCanonicalTaskRow(fxTask({ taskId: "c1", parentId: "ot1" }), { userId: "u1", sourceKind: "daily_orbit" });
    expect(child._source_parent_id).toBe("ot1"); // 1st-pass: 一時列に source 親を温存
    expect(canonicalTaskRowDryRunViolations(child)).toEqual([]);
    const selfParent = toCanonicalTaskRow(fxTask({ taskId: "x1", parentId: "x1" }), { userId: "u1", sourceKind: "daily_orbit" });
    expect(canonicalTaskRowDryRunViolations(selfParent)).toContain("self_parent");
  });

  it("#6 soft archive（手動 archivedAt 渡し）", () => {
    const row = toCanonicalTaskRow(fxTask({ completed: true, completedAt: "2026-06-13T05:00:00.000Z" }), {
      userId: "u1", sourceKind: "daily_orbit", archivedAt: "2026-06-14T00:00:00.000Z",
    });
    expect(row.archived_at).toBe("2026-06-14T00:00:00.000Z");
    expect(canonicalTaskRowDryRunViolations(row)).toEqual([]);
  });

  it("#7 naive time / date 形式違反を検出", () => {
    const bad = toCanonicalTaskRow(fxTask({ dueTime: "25:99", dueDate: "06/13" }), { userId: "u1", sourceKind: "daily_orbit" });
    const vio = canonicalTaskRowDryRunViolations(bad);
    expect(vio).toContain("due_time_format");
    expect(vio).toContain("due_date_format");
  });
});
