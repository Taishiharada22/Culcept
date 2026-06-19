/**
 * taskRealityNode — RO-1 D1（2026-06-20）: 締切駆動の「作業」を Reality Graph の第一級ノードにする（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro1-task-work-foundation-design.md（RO-1 D1・v0.1）
 * 思想（RO-0 / RJ0.1 §1）: TaskRealityNode は **作業の正本（master）**。deadline / 見積 / 負荷 / 分割 / 移動 /
 *   最小前進 / 完了状態を保持し続ける。時間帯への「配置」は ScheduledWorkBlock（D2）が担い、**task 本体は消えない**。
 *
 * 不変条件（pure・捏造禁止）:
 *   - 全 RealityAttribute は INV-RC1（`realityAttributeViolations`）に適合（unknown→null/conf0・heuristic≤0.35 等）
 *   - 供給源が無い属性は unknown（value=null・捏造しない）
 *   - id は "trn:<taskId>"（日に縛られない・乱数禁止＝taskId は注入）
 *   - 既存 ern/movement/feasibility 正本を一切変更しない（task は新ノード）
 *   - IO / RNG / now / DB / localStorage / external write を持たない
 */
import {
  unknownAttribute,
  inferredAttribute,
  realityAttributeViolations,
  type RealityAttribute,
} from "./realityAttribute";
import type { ChangeEligibilityValue } from "./eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

export const TASK_REALITY_NODE_VERSION = 0;

/**
 * TaskCompletionStatus — CEO v0.1: **blocked を分離**。
 *   dropped = 本人がやらなかった / blocked = 他人待ち・情報不足・外部条件・予定衝突で止まった。
 *   両者を分けることで Risk/Memory/Proposal の学習精度が上がる。
 */
export type TaskCompletionStatus =
  | "not_started"
  | "in_progress"
  | "partially_done"
  | "done"
  | "blocked"
  | "dropped";

export const TASK_COMPLETION_STATUS_VALUES: ReadonlyArray<TaskCompletionStatus> = [
  "not_started",
  "in_progress",
  "partially_done",
  "done",
  "blocked",
  "dropped",
];

export interface TaskRealityNodeV0 {
  readonly schemaVersion: 0;
  /** "trn:<taskId>"（deadline 駆動・日に縛られない）。採番は注入（乱数を pure kernel に入れない） */
  readonly taskRealityNodeId: string;
  readonly title: string;
  // ── CEO 強化 7 属性（全て RealityAttribute・確信度付き・断定しない） ──
  readonly deadline: RealityAttribute<string>; // ISO。user 入力→confirmed / 推測→inferred
  readonly estimatedDuration: RealityAttribute<number>; // 分。初期 heuristic（≤0.35）
  readonly cognitiveLoad: RealityAttribute<number>; // 0-1。ern.energyCost と同形の数値 heuristic
  readonly canSplit: RealityAttribute<boolean>;
  readonly canMove: RealityAttribute<boolean>;
  readonly minimalProgress: RealityAttribute<string> | null; // RJ5 で LLM 生成・v0 は null
  readonly completionStatus: RealityAttribute<TaskCompletionStatus>; // CEO 追加（blocked 含む 6 値）
  // ── 配置・派生 ──
  readonly placements: ReadonlyArray<string>; // ScheduledWorkBlock id（task→block edge の join 鍵・1:N）
  readonly sourceRefs: { readonly anchorId?: string; readonly seedId?: string };
  readonly changeEligibility: RealityAttribute<ChangeEligibilityValue>; // ern と同 derive 規約
  readonly permissionLevel: RealityAttribute<PermissionLevel>; // 同上・v0 max 2
}

/** "trn:<taskId>"。taskId は注入（pure・乱数なし）。 */
export function taskRealityNodeId(taskId: string): string {
  return `trn:${taskId}`;
}

export interface TaskRealityNodeInputV0 {
  readonly taskId: string;
  readonly title: string;
  readonly deadline: RealityAttribute<string>;
  readonly estimatedDuration: RealityAttribute<number>;
  readonly cognitiveLoad: RealityAttribute<number>;
  readonly canSplit: RealityAttribute<boolean>;
  readonly canMove: RealityAttribute<boolean>;
  readonly minimalProgress?: RealityAttribute<string> | null;
  readonly completionStatus?: RealityAttribute<TaskCompletionStatus>;
  readonly placements?: ReadonlyArray<string>;
  readonly sourceRefs?: { readonly anchorId?: string; readonly seedId?: string };
  readonly changeEligibility: RealityAttribute<ChangeEligibilityValue>;
  readonly permissionLevel: RealityAttribute<PermissionLevel>;
}

/**
 * 新規 task の既定 completionStatus = not_started（本人が作った時点の事実＝inferred・evidence 付き）。
 */
export function initialCompletionStatus(): RealityAttribute<TaskCompletionStatus> {
  return inferredAttribute<TaskCompletionStatus>("not_started", 0.8, ["task_initial_state"], {
    source: "known_from_user",
    status: "inferred",
    displayPolicy: "debugOnly",
  });
}

/** 注入された属性束から TaskRealityNode を組む（pure）。値の捏造はしない（caller が provenance を渡す）。 */
export function buildTaskRealityNode(input: TaskRealityNodeInputV0): TaskRealityNodeV0 {
  return {
    schemaVersion: 0,
    taskRealityNodeId: taskRealityNodeId(input.taskId),
    title: input.title,
    deadline: input.deadline,
    estimatedDuration: input.estimatedDuration,
    cognitiveLoad: input.cognitiveLoad,
    canSplit: input.canSplit,
    canMove: input.canMove,
    minimalProgress: input.minimalProgress ?? null,
    completionStatus: input.completionStatus ?? initialCompletionStatus(),
    placements: input.placements ?? [],
    sourceRefs: input.sourceRefs ?? {},
    changeEligibility: input.changeEligibility,
    permissionLevel: input.permissionLevel,
  };
}

/**
 * INV: TaskRealityNode の不変条件を機械検証（空=適合・throw しない）。
 *   全 RealityAttribute が INV-RC1 適合・id 形式・completionStatus 値域・placements 形式・title 非空。
 */
export function taskRealityNodeViolations(node: TaskRealityNodeV0): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`taskRealityNode: ${m}`);

  if (!node.taskRealityNodeId.startsWith("trn:") || node.taskRealityNodeId.length <= 4) {
    push(`id は "trn:<taskId>" 形式（got "${node.taskRealityNodeId}"）`);
  }
  if (node.title.length === 0) push("title が空");

  // 全 RealityAttribute の INV-RC1
  out.push(...realityAttributeViolations("task.deadline", node.deadline));
  out.push(...realityAttributeViolations("task.estimatedDuration", node.estimatedDuration));
  out.push(...realityAttributeViolations("task.cognitiveLoad", node.cognitiveLoad));
  out.push(...realityAttributeViolations("task.canSplit", node.canSplit));
  out.push(...realityAttributeViolations("task.canMove", node.canMove));
  if (node.minimalProgress !== null) out.push(...realityAttributeViolations("task.minimalProgress", node.minimalProgress));
  out.push(...realityAttributeViolations("task.completionStatus", node.completionStatus));
  out.push(...realityAttributeViolations("task.changeEligibility", node.changeEligibility));
  out.push(...realityAttributeViolations("task.permissionLevel", node.permissionLevel));

  // completionStatus の value 域（status が値を持つ場合）
  const cs = node.completionStatus;
  if (cs.value !== null && !TASK_COMPLETION_STATUS_VALUES.includes(cs.value)) {
    push(`completionStatus.value が未知（"${String(cs.value)}"）`);
  }

  // cognitiveLoad は 0-1 範囲（値がある場合）
  if (node.cognitiveLoad.value !== null && (node.cognitiveLoad.value < 0 || node.cognitiveLoad.value > 1)) {
    push(`cognitiveLoad は 0-1（got ${node.cognitiveLoad.value}）`);
  }
  // estimatedDuration は正（値がある場合）
  if (node.estimatedDuration.value !== null && node.estimatedDuration.value <= 0) {
    push(`estimatedDuration は正の分（got ${node.estimatedDuration.value}）`);
  }

  // placements は ScheduledWorkBlock id 形式（"swb:" prefix・D2 と整合）
  for (const p of node.placements) {
    if (!p.startsWith("swb:")) push(`placements は "swb:" 形式の block id（got "${p}"）`);
  }

  return out;
}
