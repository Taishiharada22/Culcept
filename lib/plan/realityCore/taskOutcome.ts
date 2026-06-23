/**
 * taskOutcome — RO-1 D4（2026-06-20）: task の結果を捕捉し completionStatus を更新する seam（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro1-task-work-foundation-design.md（RO-1 D4・v0.1）
 * 思想: completed/partial/skipped/carried_over/progressed/blocked を捕捉し、**completionStatus を単一写像で更新**。
 *   下流（RJ6 Ledger / RO-3 carryOver）への**口（signal）だけ**を持つ（接続実体は RJ6/RO-3 所管）。
 *   CEO v0.1: blocked を分離（skip〔本人〕と blocked〔外部要因〕を混ぜない＝学習精度）。
 *
 * 不変条件:
 *   - completionStatus 更新は **outcome の単一写像**（`completionStatusForOutcome`・決定的・pure）
 *   - **RJ6 Ledger 採点 / answer-check は本 RO でやらない**（口だけ・予測採点の構造禁止を継承）
 *   - **CarryOverOut への task 拡張は RO-3/RJ6 所管**（本 RO は carryOverSignal の口だけ）
 *   - IO / RNG / now / DB / write を持たない（observedAt は注入）
 */
import { inferredAttribute, type RealityAttribute } from "./realityAttribute";
import type { TaskRealityNodeV0, TaskCompletionStatus } from "./taskRealityNode";

export const TASK_OUTCOME_VERSION = 0;

/** CEO v0.1: blocked を追加。skip(本人がやらなかった) と blocked(外部要因で止まった) を混ぜない。 */
export type TaskOutcomeKind =
  | "completed"
  | "partial"
  | "skipped"
  | "carried_over"
  | "progressed"
  | "blocked";

export const TASK_OUTCOME_KIND_VALUES: ReadonlyArray<TaskOutcomeKind> = [
  "completed",
  "partial",
  "skipped",
  "carried_over",
  "progressed",
  "blocked",
];

export interface TaskOutcomeV0 {
  readonly taskRealityNodeId: string;
  readonly blockId?: string;
  readonly outcome: TaskOutcomeKind;
  /** 注入（pure・now は caller） */
  readonly observedAt: string;
  readonly evidenceRefs: ReadonlyArray<string>;
}

/**
 * 単一写像: outcome → completionStatus（決定的・pure）。
 *   skipped/carried_over は「この配置はやらなかった/移した」であり、task 自体は pending（not_started）に戻す。
 *   skip と blocked と carried_over の**区別は outcome レコード側に保存**される（completionStatus は現在状態のみ）。
 */
export function completionStatusForOutcome(outcome: TaskOutcomeKind): TaskCompletionStatus {
  switch (outcome) {
    case "completed":
      return "done";
    case "partial":
      return "partially_done";
    case "progressed":
      return "in_progress";
    case "blocked":
      return "blocked";
    case "skipped":
      return "not_started";
    case "carried_over":
      return "not_started";
  }
}

/** RO-3 carryOver への口（CarryOverOut への task 拡張は RO-3/RJ6 所管・ここは signal のみ）。 */
export interface TaskCarryOverSignalV0 {
  readonly taskRealityNodeId: string;
  readonly carriedOver: boolean; // 未完で持ち越し（carried_over / blocked）
  readonly reason: TaskOutcomeKind;
}

/** RJ6 Ledger への口（採点は RJ6 所管・ここは event の口のみ）。 */
export interface TaskLedgerSignalV0 {
  readonly taskRealityNodeId: string;
  readonly blockId?: string;
  readonly outcome: TaskOutcomeKind;
  readonly observedAt: string;
}

export interface ApplyTaskOutcomeResultV0 {
  readonly task: TaskRealityNodeV0; // completionStatus 更新済み（単一写像）
  readonly carryOverSignal: TaskCarryOverSignalV0 | null; // carried_over / blocked のとき非 null
  readonly ledgerSignal: TaskLedgerSignalV0; // 全 outcome が ledger event（口）
}

/**
 * applyTaskOutcome — outcome を task に適用（pure・新 task を返す）。
 *   completionStatus を単一写像で更新し、carryOver/Ledger の口を返す。task 本体（master）は消さない。
 */
export function applyTaskOutcome(
  task: TaskRealityNodeV0,
  outcome: TaskOutcomeV0,
): ApplyTaskOutcomeResultV0 {
  const nextStatus = completionStatusForOutcome(outcome.outcome);
  const completionStatus: RealityAttribute<TaskCompletionStatus> = inferredAttribute<TaskCompletionStatus>(
    nextStatus,
    0.85,
    [...outcome.evidenceRefs, `task_outcome_${outcome.outcome}`],
    { source: "user_confirmed", status: "confirmed", displayPolicy: "debugOnly" },
  );

  const carriedOver = outcome.outcome === "carried_over" || outcome.outcome === "blocked";
  const carryOverSignal: TaskCarryOverSignalV0 | null = carriedOver
    ? { taskRealityNodeId: task.taskRealityNodeId, carriedOver: true, reason: outcome.outcome }
    : null;

  const ledgerSignal: TaskLedgerSignalV0 = {
    taskRealityNodeId: task.taskRealityNodeId,
    ...(outcome.blockId !== undefined ? { blockId: outcome.blockId } : {}),
    outcome: outcome.outcome,
    observedAt: outcome.observedAt,
  };

  return {
    task: { ...task, completionStatus },
    carryOverSignal,
    ledgerSignal,
  };
}

/** INV: TaskOutcome の不変条件（空=適合）。 */
export function taskOutcomeViolations(outcome: TaskOutcomeV0): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`taskOutcome: ${m}`);
  if (!outcome.taskRealityNodeId.startsWith("trn:")) push(`taskRealityNodeId は "trn:" 形式（got "${outcome.taskRealityNodeId}"）`);
  if (!TASK_OUTCOME_KIND_VALUES.includes(outcome.outcome)) push(`未知の outcome（"${outcome.outcome}"）`);
  if (outcome.observedAt.length === 0) push("observedAt が空");
  return out;
}
