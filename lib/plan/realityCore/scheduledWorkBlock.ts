/**
 * scheduledWorkBlock — RO-1 D2（2026-06-20）: task を時間帯に置いた「配置」（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro1-task-work-foundation-design.md（RO-1 D2・v0.1）
 * 思想（RJ0.1 §1）: ScheduledWorkBlock は **配置**（anchor/ern 化してよい）。task 本体は消さない。
 *   接続 = block.sourceRefs.taskId ↔ task.placements[]。**1 task : N blocks**（分割配置）。
 *   **block は deadline/見積/分解を正本化しない**（task が正本・block は参照のみ＝二重正本回避）。
 *
 * 不変条件:
 *   - id は "swb:<date>:<n>"・durationMin 正・plannedWindow は HH:MM 妥当（start<end）
 *   - placementKind=anchored ⇒ sourceRefs.anchorId あり / tentative ⇒ anchorId なし
 *   - **本 RO は external_anchors に write しない**（placementKind=anchored でも配置の computation のみ）
 *   - IO / RNG / now / DB / write を持たない
 */
import type { TaskRealityNodeV0 } from "./taskRealityNode";

export const SCHEDULED_WORK_BLOCK_VERSION = 0;

export type PlacementKind = "tentative" | "anchored";

export interface ScheduledWorkBlockV0 {
  readonly schemaVersion: 0;
  /** "swb:<date>:<n>" */
  readonly blockId: string;
  readonly sourceRefs: {
    /** task→block edge の join 鍵（block 側が taskRef を持つ） */
    readonly taskId: string;
    /** block→calendar window edge の join 鍵 */
    readonly calendarWindowRef?: string;
    /** 本人選択で anchor 化した場合のみ（配置の実体化＝task 変換ではない） */
    readonly anchorId?: string;
  };
  readonly date: string;
  readonly plannedWindow: { readonly startHHMM: string; readonly endHHMM: string };
  /** anchored = ern 化済み（external_anchors への write は別 gate＝本 RO で書かない） */
  readonly placementKind: PlacementKind;
  /** window 由来（task.estimatedDuration を超えない＝分割の単位） */
  readonly durationMin: number;
}

/** "swb:<date>:<n>"。n は注入（pure・乱数なし）。 */
export function scheduledWorkBlockId(date: string, n: number): string {
  return `swb:${date}:${n}`;
}

const HHMM = /^\d{2}:\d{2}$/;
/** "HH:MM" → 分。妥当でなければ null（捏造しない）。 */
export function hhmmToMin(s: string): number | null {
  if (!HHMM.test(s)) return null;
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(3, 5));
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export interface ScheduledWorkBlockInputV0 {
  readonly taskId: string;
  readonly date: string;
  readonly n: number;
  readonly startHHMM: string;
  readonly endHHMM: string;
  readonly placementKind?: PlacementKind;
  readonly calendarWindowRef?: string;
  readonly anchorId?: string;
}

/** 注入された window から block を組む（pure）。durationMin は window 由来。 */
export function buildScheduledWorkBlock(input: ScheduledWorkBlockInputV0): ScheduledWorkBlockV0 {
  const start = hhmmToMin(input.startHHMM);
  const end = hhmmToMin(input.endHHMM);
  const durationMin = start !== null && end !== null && end > start ? end - start : 0;
  const placementKind: PlacementKind = input.placementKind ?? "tentative";
  return {
    schemaVersion: 0,
    blockId: scheduledWorkBlockId(input.date, input.n),
    sourceRefs: {
      taskId: input.taskId,
      ...(input.calendarWindowRef !== undefined ? { calendarWindowRef: input.calendarWindowRef } : {}),
      ...(input.anchorId !== undefined ? { anchorId: input.anchorId } : {}),
    },
    date: input.date,
    plannedWindow: { startHHMM: input.startHHMM, endHHMM: input.endHHMM },
    placementKind,
    durationMin,
  };
}

/** task に block を配置する（pure・新 task を返す・1:N の placements 追加・冪等）。 */
export function attachBlockToTask(task: TaskRealityNodeV0, block: ScheduledWorkBlockV0): TaskRealityNodeV0 {
  if (task.placements.includes(block.blockId)) return task; // 冪等
  return { ...task, placements: [...task.placements, block.blockId] };
}

/** task に属する block（block.sourceRefs.taskId が一致するもの）を取り出す（pure）。 */
export function blocksForTask(task: TaskRealityNodeV0, allBlocks: ReadonlyArray<ScheduledWorkBlockV0>): ScheduledWorkBlockV0[] {
  const taskId = task.taskRealityNodeId.slice("trn:".length);
  return allBlocks.filter((b) => b.sourceRefs.taskId === taskId);
}

/** INV: ScheduledWorkBlock 単体の不変条件（空=適合）。 */
export function scheduledWorkBlockViolations(block: ScheduledWorkBlockV0): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`scheduledWorkBlock: ${m}`);
  if (!block.blockId.startsWith("swb:")) push(`id は "swb:<date>:<n>" 形式（got "${block.blockId}"）`);
  if (block.sourceRefs.taskId.length === 0) push("sourceRefs.taskId が空");
  const start = hhmmToMin(block.plannedWindow.startHHMM);
  const end = hhmmToMin(block.plannedWindow.endHHMM);
  if (start === null) push(`startHHMM 不正（"${block.plannedWindow.startHHMM}"）`);
  if (end === null) push(`endHHMM 不正（"${block.plannedWindow.endHHMM}"）`);
  if (start !== null && end !== null && !(end > start)) push("plannedWindow は start<end");
  if (block.durationMin <= 0) push(`durationMin は正（got ${block.durationMin}）`);
  if (start !== null && end !== null && block.durationMin !== end - start) {
    push(`durationMin は window 長と一致すべき（got ${block.durationMin}, window ${end - start}）`);
  }
  if (block.placementKind === "anchored" && block.sourceRefs.anchorId === undefined) {
    push("anchored は sourceRefs.anchorId 必須");
  }
  if (block.placementKind === "tentative" && block.sourceRefs.anchorId !== undefined) {
    push("tentative は anchorId を持たない");
  }
  return out;
}

/**
 * INV: 1 task : N blocks の join 整合（空=適合）。
 *   ①各 block の taskId が task と一致 ②task.placements が全 block を含む ③block が deadline/見積を正本化しない
 *   （③は型で構造保証＝ScheduledWorkBlockV0 に該当 field が無い。本 INV は join のみ検証）。
 */
export function taskBlockJoinViolations(
  task: TaskRealityNodeV0,
  blocks: ReadonlyArray<ScheduledWorkBlockV0>,
): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`taskBlockJoin: ${m}`);
  const taskId = task.taskRealityNodeId.slice("trn:".length);
  for (const b of blocks) {
    if (b.sourceRefs.taskId !== taskId) push(`block ${b.blockId} の taskId="${b.sourceRefs.taskId}" が task="${taskId}" と不一致`);
    if (!task.placements.includes(b.blockId)) push(`task.placements に block ${b.blockId} が無い（1:N 配置の未接続）`);
  }
  // placements に実在しない block id が無いか（dangling 参照）
  const blockIds = new Set(blocks.map((b) => b.blockId));
  for (const p of task.placements) {
    if (!blockIds.has(p)) push(`task.placements の ${p} に対応 block が（供給 blocks に）無い`);
  }
  return out;
}

/**
 * 配置 durationMin は task.estimatedDuration を超えない（分割の単位・値がある場合のみ検証）。
 *   canSplit=false なら単一 block が estimatedDuration 全体を覆う想定（超過は不正）。
 */
export function placementDurationViolations(
  task: TaskRealityNodeV0,
  blocks: ReadonlyArray<ScheduledWorkBlockV0>,
): string[] {
  const out: string[] = [];
  const est = task.estimatedDuration.value;
  if (est === null) return out; // 見積 unknown は検証不能（捏造しない）
  for (const b of blocks) {
    if (b.durationMin > est) {
      out.push(`placementDuration: block ${b.blockId} の ${b.durationMin}分 が task 見積 ${est}分 を超過`);
    }
  }
  return out;
}
