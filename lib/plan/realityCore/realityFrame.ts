/**
 * realityFrame — RO-3 D1（2026-06-20）: Two-Universe, Single-Frame 封筒（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro3-reality-ir-learning-design.md（RO-3 §2・v0.1）
 * 思想（RO-3 §2 nodeUniverseDecision）: snapshot を 1 バイトも改変せず（assertSameIdSet guard を壊さず）、
 *   snapshot 内宇宙（ern/mv/cs）と snapshot 外宇宙（task/block）を `RealityFrameV0` 封筒で **injected に束ねる**。
 *   2 宇宙跨ぎ typed edge を **phantom = 0** で成立させる土台。phantom は「作らない」でなく
 *   **checkResolvable で id 解決必須＝作れない**。
 *
 * CEO 裁定（2026-06-20・RO-3 実装 GO）:
 *   - openDecision #1: frame 封筒の injected workLane 方針を採用。snapshot root / momentSnapshot.nodeRefs /
 *     assembleRealityGraph への task/block 正規配線は **触らない**（別 RO / owning session へ後回し）。
 *   - 実装精緻化: 設計 typeSketch の `RealityFrameV0 = { snapshot, workLane, edges, diff }` のうち edges/diff は
 *     **派生**（materializeEdges / diffSnapshots が frame を入力に取る）。frame 自体は 2 宇宙の束ねのみを保持し
 *     循環構造を作らない（snapshot 不変・workLane injected）。
 *
 * 不変条件:
 *   - snapshot / RO-1・RO-2 ノード型を **import して読むだけ**（改変ゼロ）。
 *   - 端点 id は deterministic id（trn:/swb:/ern:/mv:/cs:）のみ・array index を identity に使わない。
 *   - task_block の **正方向** join は `task.placements[]`(swb:) ↔ `block.blockId`(swb:)〔非対称なし・正規化不要〕。
 *     **逆方向** join `block.sourceRefs.taskId`(素) ↔ `task.taskRealityNodeId`(trn:) にのみ normalizeTaskRef を適用。
 *   - IO / RNG / now / Date / DB / write を持たない。
 */
import type { RealityGraphSnapshotV0 } from "./realityGraphSnapshot";
import type { TaskRealityNodeV0 } from "./taskRealityNode";
import type { ScheduledWorkBlockV0 } from "./scheduledWorkBlock";
import type { TaskCarryOverSignalV0 } from "./taskOutcome";

export const REALITY_FRAME_VERSION = 0;

/** node が属する宇宙。snapshot=宇宙A（ern/mv/cs）/ workLane=宇宙B（task/block）/ attribute=実体ノードなし合成 endpoint。 */
export type NodeUniverse = "snapshot" | "workLane" | "attribute";

/** RealityNodeRef の種別（id prefix と対応）。 */
export type NodeRefKind =
  | "event" // ern:
  | "movement" // mv:
  | "commitment" // cs:
  | "task" // trn:
  | "block" // swb:
  | "deadline" // deadline:<task>:<value>（attribute・合成 id）
  | "calendar_window" // calwin:<block>:<ref>（attribute・合成 id）
  | "proposal" // proposal:<task>（attribute・合成 id）
  | "leave_by_lines"; // ern 内 embedded value（intra-node lens・toId=親ern）

/** typed edge / diff の端点参照（id-only・宇宙 + 種別を明示）。 */
export interface RealityNodeRef {
  readonly universe: NodeUniverse;
  readonly kind: NodeRefKind;
  readonly id: string;
}

/** 宇宙B（snapshot 外）の作業レーン。injected で frame に束ねる（snapshot に注入しない）。 */
export interface WorkLaneV0 {
  readonly tasks: ReadonlyArray<TaskRealityNodeV0>;
  readonly blocks: ReadonlyArray<ScheduledWorkBlockV0>;
  readonly carryOverSignals: ReadonlyArray<TaskCarryOverSignalV0>;
}

/** Two-Universe, Single-Frame: snapshot(参照) + workLane(injected) を束ねる封筒。edges/diff は派生。 */
export interface RealityFrameV0 {
  readonly schemaVersion: 0;
  /** 宇宙A: 参照のみ・所有しない・**改変しない**。 */
  readonly snapshot: RealityGraphSnapshotV0;
  /** 宇宙B: snapshot 外・injected。workLane 欠落（空 lane）は honest に扱う（diff の workLaneDiffable）。 */
  readonly workLane: WorkLaneV0;
}

export interface BuildRealityFrameInputV0 {
  readonly snapshot: RealityGraphSnapshotV0;
  readonly workLane?: Partial<WorkLaneV0>;
}

/** frame を組む（pure）。workLane 未供給は空 lane（task/block の変化を見ない＝diff が honest 宣言）。 */
export function buildRealityFrame(input: BuildRealityFrameInputV0): RealityFrameV0 {
  return {
    schemaVersion: 0,
    snapshot: input.snapshot,
    workLane: {
      tasks: input.workLane?.tasks ?? [],
      blocks: input.workLane?.blocks ?? [],
      carryOverSignals: input.workLane?.carryOverSignals ?? [],
    },
  };
}

/** workLane が供給されているか（片方でも空なら diff の workLaneDiffable=false）。 */
export function hasWorkLane(frame: RealityFrameV0): boolean {
  return frame.workLane.tasks.length > 0 || frame.workLane.blocks.length > 0;
}

/** frame の宇宙別 id 集合（checkResolvable / diff の背骨）。pure・id だけを引く。 */
export interface FrameIdSetsV0 {
  readonly ernIds: ReadonlySet<string>; // 宇宙A: ern:
  readonly mvIds: ReadonlySet<string>; // 宇宙A: mv:
  readonly csIds: ReadonlySet<string>; // 宇宙A: cs:
  readonly taskIds: ReadonlySet<string>; // 宇宙B: trn:
  readonly blockIds: ReadonlySet<string>; // 宇宙B: swb:
}

export function frameIdSets(frame: RealityFrameV0): FrameIdSetsV0 {
  return {
    ernIds: new Set(frame.snapshot.eventRealityNodes.map((n) => n.eventRealityNodeId)),
    mvIds: new Set(frame.snapshot.movementRealityNodes.map((m) => m.movementRealityId)),
    csIds: new Set(frame.snapshot.commitmentSignals.map((c) => c.commitmentSignalId)),
    taskIds: new Set(frame.workLane.tasks.map((t) => t.taskRealityNodeId)),
    blockIds: new Set(frame.workLane.blocks.map((b) => b.blockId)),
  };
}

/**
 * normalizeTaskRef — **逆方向 join 限定**（CEO 裁定 #5）。
 *   `block.sourceRefs.taskId`（素 taskId・prefix なし・scheduledWorkBlock.ts:96 が trn: を strip 済み）を
 *   `task.taskRealityNodeId`（trn:）形式に正規化する。
 *   **正方向 task_block（placements ↔ block.blockId・両端 swb:）には適用しない**（非対称がないため不要）。
 */
export function normalizeTaskRef(bareTaskId: string): string {
  return bareTaskId.startsWith("trn:") ? bareTaskId : `trn:${bareTaskId}`;
}

/**
 * checkResolvable — 端点 ref が frame 実保持 id 集合に解決できるか（phantom edge を作れない gate）。
 *   - snapshot 宇宙: ern/mv/cs の id 集合に membership。
 *   - workLane 宇宙: task/block の id 集合に membership。
 *   - attribute 宇宙: 合成 endpoint（発生元ノードが frame 内で iterate 済み＝構造的に解決可）→ true。
 *     ただし発生元 id（deadline/proposal は task、calendar_window は block、leave_by_lines は親 ern）が
 *     resolvable であることを caller（materializeEdges）が iterate で保証する。
 */
export function checkResolvable(ref: RealityNodeRef, sets: FrameIdSetsV0): boolean {
  switch (ref.universe) {
    case "snapshot":
      if (ref.kind === "event") return sets.ernIds.has(ref.id);
      if (ref.kind === "movement") return sets.mvIds.has(ref.id);
      if (ref.kind === "commitment") return sets.csIds.has(ref.id);
      return false;
    case "workLane":
      if (ref.kind === "task") return sets.taskIds.has(ref.id);
      if (ref.kind === "block") return sets.blockIds.has(ref.id);
      return false;
    case "attribute":
      // 合成 endpoint は発生元ノード resolvable を前提に materialize 側が iterate で保証する。
      return true;
  }
}
