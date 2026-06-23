/**
 * taskEdgePrep — RO-1 D5（2026-06-20）: typed edge にできる join 鍵を確定する（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro1-task-work-foundation-design.md（RO-1 D5・v0.1）
 * 思想: Reality Graph は現在 typed edge を持たない（L0 ①）。RO-1 は edge を**作らない**が、RO-3 が
 *   materialize できるよう **5 edge kind の契約 + 各ノードの join 鍵**を確定する。
 *
 * 不変条件:
 *   - **本 RO は typed RealityGraphEdgeV0 を定義/実装しない**（RO-3 所管）。join 鍵を露出するだけ
 *   - join 鍵は **id 参照のみ**（array index を identity に使わない・realityGraphSnapshot.ts:29 規律継承）
 *   - RealityDiff / snapshot 永続化に触れない（RO-3）
 *   - IO / RNG / now / DB / write を持たない
 */
import type { TaskRealityNodeV0 } from "./taskRealityNode";
import type { ScheduledWorkBlockV0 } from "./scheduledWorkBlock";
import type { TaskCarryOverSignalV0 } from "./taskOutcome";

export const TASK_EDGE_PREP_VERSION = 0;

/** RO-3 が materialize する 5 edge kind（本 RO は名前と join 鍵だけ確定）。 */
export type TaskEdgeKind =
  | "task_block"
  | "task_deadline"
  | "block_calendar_window"
  | "task_carry_over"
  | "task_proposal";

export const TASK_EDGE_KINDS: ReadonlyArray<TaskEdgeKind> = [
  "task_block",
  "task_deadline",
  "block_calendar_window",
  "task_carry_over",
  "task_proposal",
];

/** task→block: task.placements[] ↔ block.sourceRefs.taskId。 */
export function taskBlockJoinKeys(task: TaskRealityNodeV0): { fromId: string; toBlockIds: ReadonlyArray<string> } {
  return { fromId: task.taskRealityNodeId, toBlockIds: task.placements };
}

/** task→deadline: task.deadline（RealityAttribute・暗黙 edge）。value が無ければ null（捏造しない）。 */
export function taskDeadlineJoinKey(task: TaskRealityNodeV0): { fromId: string; deadlineIso: string | null } {
  return { fromId: task.taskRealityNodeId, deadlineIso: task.deadline.value };
}

/** block→calendar window: block.sourceRefs.calendarWindowRef。 */
export function blockCalendarWindowJoinKey(block: ScheduledWorkBlockV0): { fromBlockId: string; calendarWindowRef: string | null } {
  return { fromBlockId: block.blockId, calendarWindowRef: block.sourceRefs.calendarWindowRef ?? null };
}

/** task→carryOver: applyTaskOutcome の carryOverSignal 口（D4）。 */
export function taskCarryOverJoinKey(signal: TaskCarryOverSignalV0 | null): { fromId: string; carriedOver: boolean } | null {
  if (signal === null) return null;
  return { fromId: signal.taskRealityNodeId, carriedOver: signal.carriedOver };
}

/** task→proposal: task.taskRealityNodeId（RJ4 が参照・RO-4 所管）。 */
export function taskProposalJoinKey(task: TaskRealityNodeV0): { fromId: string } {
  return { fromId: task.taskRealityNodeId };
}

export interface EdgeJoinReadinessV0 {
  readonly kind: TaskEdgeKind;
  readonly ready: boolean;
  readonly missing: string | null;
}

/**
 * taskEdgeJoinReadiness — 5 edge kind の join 鍵が揃っているかを返す（pure）。
 *   RO-3 が typed edge を materialize できる前提（join 鍵の存在）を機械検証する。
 *   注: ready=false は「鍵が未供給」を honest に示すだけ（捏造で埋めない）。
 */
export function taskEdgeJoinReadiness(
  task: TaskRealityNodeV0,
  blocks: ReadonlyArray<ScheduledWorkBlockV0>,
  carryOverSignal: TaskCarryOverSignalV0 | null,
): EdgeJoinReadinessV0[] {
  const out: EdgeJoinReadinessV0[] = [];

  // task→block: placements が block と接続しているか
  const blockIds = new Set(blocks.map((b) => b.blockId));
  const tb = taskBlockJoinKeys(task);
  const tbReady = tb.toBlockIds.length > 0 && tb.toBlockIds.every((id) => blockIds.has(id));
  out.push({ kind: "task_block", ready: tbReady, missing: tbReady ? null : "placements が供給 blocks と未接続" });

  // task→deadline
  const td = taskDeadlineJoinKey(task);
  out.push({ kind: "task_deadline", ready: td.deadlineIso !== null, missing: td.deadlineIso !== null ? null : "deadline 未確定" });

  // block→calendar window: 全 block が calendarWindowRef を持つか
  const bcReady = blocks.length > 0 && blocks.every((b) => blockCalendarWindowJoinKey(b).calendarWindowRef !== null);
  out.push({ kind: "block_calendar_window", ready: bcReady, missing: bcReady ? null : "calendarWindowRef 未供給な block あり" });

  // task→carryOver
  const tc = taskCarryOverJoinKey(carryOverSignal);
  out.push({ kind: "task_carry_over", ready: tc !== null, missing: tc !== null ? null : "carryOverSignal なし（未持ち越し）" });

  // task→proposal: taskRealityNodeId は常に存在
  out.push({ kind: "task_proposal", ready: taskProposalJoinKey(task).fromId.length > 0, missing: null });

  return out;
}
