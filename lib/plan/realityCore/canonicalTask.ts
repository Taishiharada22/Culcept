/**
 * canonicalTask — RO-8（2026-06-20）: neutral canonical task source + TaskRealityNode への projection（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro8-task-source-rehome-orbittask-salvage-contract-design.md（RO-8 v0.1）
 * 思想: task の **neutral canonical source**（Origin 非依存）を持ち、TaskRealityNodeV0 を**その projection** とする。
 *   OrbitTask（Origin/dailyOrbit）の**データモデル・思想**を salvage したが、**OrbitTask 型を import しない**（Origin 非依存）。
 *
 * CEO 規律（2026-06-20・RO-8 GO）:
 *   - Origin UI を未来の依存元にしない / `OrbitTask` を未来の正本名にしない（canonical 名は CanonicalTaskV0）。
 *   - 欠ける属性（estimatedDuration/cognitiveLoad/canSplit/canMove/anchorId/placements）は **honest-unknown / future input**
 *     として扱い**捏造しない**。
 *   - 思想 field（motivation/completionFeel）は canonical に温存し v0 projection で TaskRealityNode に流さない
 *     （TaskRealityNode に該当 field なし・将来 RO 階層が読む）。
 *
 * 不変条件: pure（IO/RNG/now/Date/DB/write なし）。OrbitTask（lib/origin）を import しない。RO-1 TaskRealityNode 型を改変しない。
 */
import {
  buildTaskRealityNode,
  type TaskRealityNodeV0,
  type TaskCompletionStatus,
} from "./taskRealityNode";
import {
  unknownAttribute,
  inferredAttribute,
  type RealityAttribute,
} from "./realityAttribute";
import type { ChangeEligibilityValue } from "./eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

export const CANONICAL_TASK_VERSION = 0;

/** OrbitTask TaskNature を salvage（neutral 名・動機の本性＝深層観測信号）。 */
export type TaskMotivation = "impulse" | "obligation" | "investment" | "curiosity";
/** OrbitTask CompletionTexture を salvage（neutral 名・完了の感触）。 */
export type CompletionFeel = "satisfying" | "relieved" | "just_done";

export const TASK_MOTIVATION_VALUES: ReadonlyArray<TaskMotivation> = ["impulse", "obligation", "investment", "curiosity"];
export const COMPLETION_FEEL_VALUES: ReadonlyArray<CompletionFeel> = ["satisfying", "relieved", "just_done"];

export interface CanonicalTaskRecurrenceV0 {
  readonly pattern: "daily" | "weekly" | "weekdays" | "biweekly" | "monthly" | "custom";
  readonly dayOfWeek?: number;
  readonly dayOfMonth?: number;
  readonly intervalDays?: number;
}

/** neutral canonical task source（Origin 非依存・OrbitTask を import しない）。 */
export interface CanonicalTaskV0 {
  readonly schemaVersion: 0;
  /** neutral id（trn: は projection で付与・ここでは付けない）。 */
  readonly taskId: string;
  readonly text: string;
  readonly completed: boolean;
  readonly completedAt: string | null;
  /** 引き継ぎ元日付（YYYY-MM-DD）。 */
  readonly carriedFrom: string | null;
  readonly carryCount: number;
  /** 期日（YYYY-MM-DD）。 */
  readonly dueDate: string | null;
  /** 期限時刻（HH:mm）。 */
  readonly dueTime: string | null;
  readonly recurrence: CanonicalTaskRecurrenceV0 | null;
  /** 思想 salvage（深層観測信号・v0 projection で TaskRealityNode に流さず温存）。 */
  readonly motivation: TaskMotivation | null;
  readonly completionFeel: CompletionFeel | null;
  readonly tags: ReadonlyArray<string>;
  /** subtask（1階層）。 */
  readonly parentId: string | null;
  readonly addedAt: string;
}

export interface CanonicalTaskInputV0 {
  readonly taskId: string;
  readonly text: string;
  readonly completed?: boolean;
  readonly completedAt?: string | null;
  readonly carriedFrom?: string | null;
  readonly carryCount?: number;
  readonly dueDate?: string | null;
  readonly dueTime?: string | null;
  readonly recurrence?: CanonicalTaskRecurrenceV0 | null;
  readonly motivation?: TaskMotivation | null;
  readonly completionFeel?: CompletionFeel | null;
  readonly tags?: ReadonlyArray<string>;
  readonly parentId?: string | null;
  readonly addedAt: string;
}

/** 注入された属性束から CanonicalTask を組む（pure・捏造しない）。 */
export function buildCanonicalTask(input: CanonicalTaskInputV0): CanonicalTaskV0 {
  return {
    schemaVersion: 0,
    taskId: input.taskId,
    text: input.text,
    completed: input.completed ?? false,
    completedAt: input.completedAt ?? null,
    carriedFrom: input.carriedFrom ?? null,
    carryCount: input.carryCount ?? 0,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    recurrence: input.recurrence ?? null,
    motivation: input.motivation ?? null,
    completionFeel: input.completionFeel ?? null,
    tags: input.tags ?? [],
    parentId: input.parentId ?? null,
    addedAt: input.addedAt,
  };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;

/** canonical task source は governance（changeEligibility/permissionLevel）を持たない → projection 時に注入。 */
export interface ProjectionGovernanceV0 {
  readonly changeEligibility: RealityAttribute<ChangeEligibilityValue>;
  readonly permissionLevel: RealityAttribute<PermissionLevel>;
}

/** deadline ISO を dueDate(+dueTime) から合成（dueTime 無しは end-of-day 規約・確信度を下げて honest）。 */
function deadlineAttribute(task: CanonicalTaskV0): RealityAttribute<string> {
  if (task.dueDate === null || !YMD.test(task.dueDate)) return unknownAttribute<string>();
  if (task.dueTime !== null && HHMM.test(task.dueTime)) {
    return inferredAttribute<string>(`${task.dueDate}T${task.dueTime}:00+09:00`, 0.8, ["canonical_due_datetime"], {
      source: "known_from_user",
      status: "confirmed",
      displayPolicy: "debugOnly",
    });
  }
  // dueTime 無し: 「その日の終わり」規約（user 指定時刻でない＝確信度低め・honest）
  return inferredAttribute<string>(`${task.dueDate}T23:59:00+09:00`, 0.5, ["canonical_due_date_endofday"], {
    source: "known_from_user",
    status: "inferred",
    displayPolicy: "debugOnly",
  });
}

/** completed/carriedFrom → completionStatus（done / not_started）。捏造せず evidence を付ける。 */
function completionStatusAttribute(task: CanonicalTaskV0): RealityAttribute<TaskCompletionStatus> {
  if (task.completed) {
    return inferredAttribute<TaskCompletionStatus>("done", 0.85, ["canonical_completed"], {
      source: "user_confirmed",
      status: "confirmed",
      displayPolicy: "debugOnly",
    });
  }
  const carried = task.carriedFrom !== null;
  return inferredAttribute<TaskCompletionStatus>("not_started", 0.7, carried ? ["canonical_carried", `from_${task.carriedFrom}`] : ["canonical_pending"], {
    source: "inferred",
    status: "inferred",
    displayPolicy: "debugOnly",
  });
}

/**
 * projectCanonicalTaskToRealityNode — CanonicalTaskV0 → TaskRealityNodeV0（pure・honest-unknown）。
 *   salvage 可能属性（deadline/completionStatus）を写像し、欠損（duration/load/split/move/anchor）は unknownAttribute。
 *   思想 field（motivation/completionFeel）は流さない（TaskRealityNode に該当なし・温存）。governance は注入。
 */
export function projectCanonicalTaskToRealityNode(task: CanonicalTaskV0, governance: ProjectionGovernanceV0): TaskRealityNodeV0 {
  return buildTaskRealityNode({
    taskId: task.taskId,
    title: task.text,
    deadline: deadlineAttribute(task),
    estimatedDuration: unknownAttribute<number>(), // honest-unknown（canonical に無い・捏造しない）
    cognitiveLoad: unknownAttribute<number>(), // honest-unknown（motivation はヒントだが v0 推論しない）
    canSplit: unknownAttribute<boolean>(), // honest-unknown（parentId はあるが canSplit ではない）
    canMove: unknownAttribute<boolean>(), // honest-unknown
    completionStatus: completionStatusAttribute(task),
    placements: [], // block source なし
    sourceRefs: { seedId: task.taskId }, // anchorId は付けない（future input・protect 発火に別途要）
    changeEligibility: governance.changeEligibility,
    permissionLevel: governance.permissionLevel,
  });
}

/** INV: CanonicalTask の不変条件（空=適合・throw しない）。 */
export function canonicalTaskViolations(task: CanonicalTaskV0): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`canonicalTask: ${m}`);
  if (task.taskId.length === 0) push("taskId が空");
  if (task.text.length === 0) push("text が空");
  if (task.carryCount < 0) push(`carryCount は非負（got ${task.carryCount}）`);
  if (task.dueDate !== null && !YMD.test(task.dueDate)) push(`dueDate は YYYY-MM-DD（got "${task.dueDate}"）`);
  if (task.dueTime !== null && !HHMM.test(task.dueTime)) push(`dueTime は HH:mm（got "${task.dueTime}"）`);
  if (task.carriedFrom !== null && !YMD.test(task.carriedFrom)) push(`carriedFrom は YYYY-MM-DD（got "${task.carriedFrom}"）`);
  if (task.motivation !== null && !TASK_MOTIVATION_VALUES.includes(task.motivation)) push(`motivation が未知（"${task.motivation}"）`);
  if (task.completionFeel !== null && !COMPLETION_FEEL_VALUES.includes(task.completionFeel)) push(`completionFeel が未知（"${task.completionFeel}"）`);
  if (task.completed && task.completedAt === null) push("completed=true は completedAt を持つべき（honest・捏造でなく観測時刻）");
  return out;
}
