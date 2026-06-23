/**
 * realityGraphEdge — RO-3 D2（2026-06-20）: typed RealityGraphEdgeV0（9 kind）+ materializeEdges（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro3-reality-ir-learning-design.md（RO-3 §4-①・v0.1）
 * 思想: RO-1 が「typed edge は作らない・RO-3 所管」（taskEdgePrep.ts:9）とした edge を materialize する。
 *   端点が frame 実保持 id 集合に解決できない edge は **構造的に生成しない**（checkResolvable・phantom=0）。
 *   解決不能は捏造せず `EdgeJoinReadinessV0`(ready=false) に honest 記録。
 *
 * CEO 裁定（2026-06-20・RO-3 実装 GO）の厳守点:
 *   - task_block は `placements`(swb:) ↔ `block.blockId`(swb:) が**正方向**（非対称なし）。
 *     `normalizeTaskRef` は逆 join 限定。checkResolvable は **両方向 membership** を検査。
 *   - event_movement は `ern:<date>:<anchorId>` 再構成 membership gate を必須（toAnchorId fallback 対策）。
 *   - unresolved は捏造せず ready=false に落とす。
 *
 * 不変条件:
 *   - RO-1 の 5 accessor（taskEdgePrep）を import 流用（reinvent しない）。RO-1/RO-2 型を改変しない。
 *   - edgeId / 端点 id は deterministic 文字列（乱数なし）。
 *   - IO / RNG / now / Date / DB / write を持たない。
 */
import type { RealityFrameV0, RealityNodeRef, FrameIdSetsV0 } from "./realityFrame";
import { frameIdSets, normalizeTaskRef, checkResolvable } from "./realityFrame";
import {
  type TaskEdgeKind,
  taskBlockJoinKeys,
  taskDeadlineJoinKey,
  blockCalendarWindowJoinKey,
  taskProposalJoinKey,
  type EdgeJoinReadinessV0,
} from "./taskEdgePrep";

export const REALITY_GRAPH_EDGE_VERSION = 0;

/** 9 edge kind = RO-1 の 5（TaskEdgeKind 継承・再定義しない）+ RO-3 新設 4。 */
export type RealityEdgeKind =
  | TaskEdgeKind // task_block / task_deadline / block_calendar_window / task_carry_over / task_proposal
  | "event_movement"
  | "event_leave_by_lines"
  | "intervention_outcome"
  | "correction_model_adjustment";

export const RO3_NEW_EDGE_KINDS: ReadonlyArray<RealityEdgeKind> = [
  "event_movement",
  "event_leave_by_lines",
  "intervention_outcome",
  "correction_model_adjustment",
];

export interface RealityGraphEdgeV0 {
  readonly schemaVersion: 0;
  /** `redge:${kind}:${fromId}:${toId}`・deterministic・乱数なし。 */
  readonly edgeId: string;
  readonly kind: RealityEdgeKind;
  readonly from: RealityNodeRef;
  readonly to: RealityNodeRef;
  /** join 鍵の出所文字列（監査可能・例 'placements↔block.blockId'）。 */
  readonly joinBasis: string;
  readonly resolvable: boolean;
  readonly evidenceRefs: ReadonlyArray<string>;
}

export interface MaterializeEdgesResultV0 {
  readonly edges: ReadonlyArray<RealityGraphEdgeV0>;
  /** 解決不能で edge にできなかった join（honest・捏造で埋めない）。 */
  readonly unresolved: ReadonlyArray<EdgeJoinReadinessV0>;
}

function edgeId(kind: RealityEdgeKind, fromId: string, toId: string): string {
  return `redge:${kind}:${fromId}:${toId}`;
}

const taskRef = (id: string): RealityNodeRef => ({ universe: "workLane", kind: "task", id });
const blockRef = (id: string): RealityNodeRef => ({ universe: "workLane", kind: "block", id });
const eventRef = (id: string): RealityNodeRef => ({ universe: "snapshot", kind: "event", id });
const movementRef = (id: string): RealityNodeRef => ({ universe: "snapshot", kind: "movement", id });
const attrRef = (kind: RealityNodeRef["kind"], id: string): RealityNodeRef => ({ universe: "attribute", kind, id });

/** ern:<date>:<anchorId>（compileEventRealityNodes.ts:191 と一致・event_movement gate 用に再構成）。 */
function reconstructErnId(date: string, anchorId: string): string {
  return `ern:${date}:${anchorId}`;
}

/** mv:<date>:<from>:<to> から date を取り出す（id は deterministic・split 安全）。 */
function dateFromMovementId(movementRealityId: string): string | null {
  const parts = movementRealityId.split(":");
  return parts.length >= 4 && parts[0] === "mv" ? parts[1] : null;
}

/**
 * materializeEdges — frame の両宇宙から 9 kind の typed edge を生成（pure）。
 *   解決不能な端点を持つ edge は生成せず unresolved に ready=false で記録（phantom=0）。
 */
export function materializeEdges(frame: RealityFrameV0): MaterializeEdgesResultV0 {
  const sets: FrameIdSetsV0 = frameIdSets(frame);
  const edges: RealityGraphEdgeV0[] = [];
  const unresolved: EdgeJoinReadinessV0[] = [];

  const push = (kind: RealityEdgeKind, from: RealityNodeRef, to: RealityNodeRef, joinBasis: string, evidenceRefs: string[]) => {
    const resolvable = checkResolvable(from, sets) && checkResolvable(to, sets);
    if (!resolvable) {
      // RO-1 の honest-null 規律を全 edge kind に一般化（kind が TaskEdgeKind の時のみ readiness に転記可能）。
      if (isTaskEdgeKind(kind)) unresolved.push({ kind, ready: false, missing: `${joinBasis} が frame で未解決` });
      return;
    }
    edges.push({ schemaVersion: 0, edgeId: edgeId(kind, from.id, to.id), kind, from, to, joinBasis, resolvable: true, evidenceRefs });
  };

  // ── workLane（task/block）由来の edge ──
  for (const task of frame.workLane.tasks) {
    // task_block（正方向: placements(swb:) ↔ block.blockId(swb:)・両端 swb:・正規化不要）
    const tb = taskBlockJoinKeys(task);
    for (const blockId of tb.toBlockIds) {
      // checkResolvable が block 実在を検査（dangling placements は edge にならない）
      push("task_block", taskRef(task.taskRealityNodeId), blockRef(blockId), "placements↔block.blockId", [
        "task_block_forward",
      ]);
    }

    // task_deadline（合成 endpoint・value=null なら edge なし）
    const td = taskDeadlineJoinKey(task);
    if (td.deadlineIso !== null) {
      const deadlineId = `deadline:${task.taskRealityNodeId}:${td.deadlineIso}`;
      push("task_deadline", taskRef(task.taskRealityNodeId), attrRef("deadline", deadlineId), "task.deadline.value", [
        "task_deadline",
      ]);
    }

    // task_proposal（taskRealityNodeId は常存）
    const tp = taskProposalJoinKey(task);
    const proposalId = `proposal:${tp.fromId}`;
    push("task_proposal", taskRef(tp.fromId), attrRef("proposal", proposalId), "task.taskRealityNodeId", ["task_proposal"]);
  }

  for (const block of frame.workLane.blocks) {
    // task_block 逆方向 back-reference の resolvable 検査（normalizeTaskRef は逆 join 限定）。
    // 正方向 edge は task ループで生成済み。ここは逆方向の dangling（参照先 task 不在）を unresolved に落とす。
    const normalizedTaskId = normalizeTaskRef(block.sourceRefs.taskId);
    if (!sets.taskIds.has(normalizedTaskId)) {
      unresolved.push({ kind: "task_block", ready: false, missing: `block.sourceRefs.taskId(${block.sourceRefs.taskId})↔task 逆 join が frame で未解決` });
    }

    // block_calendar_window（合成 endpoint・ref=null なら edge なし）
    const bc = blockCalendarWindowJoinKey(block);
    if (bc.calendarWindowRef !== null) {
      const calwinId = `calwin:${block.blockId}:${bc.calendarWindowRef}`;
      push("block_calendar_window", blockRef(block.blockId), attrRef("calendar_window", calwinId), "block.sourceRefs.calendarWindowRef", [
        "block_calendar_window",
      ]);
    }
  }

  // task_carry_over（carryOverSignal の口・signal が指す task が frame に居れば edge）
  for (const signal of frame.workLane.carryOverSignals) {
    if (!signal.carriedOver) continue;
    const carryId = `carryover:${signal.taskRealityNodeId}:${signal.reason}`;
    push("task_carry_over", taskRef(signal.taskRealityNodeId), attrRef("proposal", carryId), "carryOverSignal.taskRealityNodeId", [
      "task_carry_over",
      `reason_${signal.reason}`,
    ]);
  }

  // ── snapshot（ern/mv）由来の edge ──
  for (const ern of frame.snapshot.eventRealityNodes) {
    // event_leave_by_lines（intra-node lens・toId=親ern・leaveByLines は id なし embedded value）
    if (ern.leaveByLines !== undefined) {
      push("event_leave_by_lines", eventRef(ern.eventRealityNodeId), attrRef("leave_by_lines", `lbl:${ern.eventRealityNodeId}`), "ern.leaveByLines(intra-node lens)", [
        "event_leave_by_lines",
      ]);
    }
  }

  // event_movement（ern.sourceRefs.anchorId ↔ mv.sourceRefs.toAnchorId・ern:id 再構成 membership gate）
  for (const mv of frame.snapshot.movementRealityNodes) {
    const date = dateFromMovementId(mv.movementRealityId);
    if (date === null) {
      unresolved.push({ kind: "task_block", ready: false, missing: `movement id 形式不正(${mv.movementRealityId})` } as EdgeJoinReadinessV0);
      continue;
    }
    // mv.sourceRefs.toAnchorId は anchor lookup miss 時 toNodeId に fallback（movementReality.ts:99）。
    // 再構成した ern:id が frame に実在する時のみ edge（fallback で node id になった場合は解決不能）。
    const candidateErnId = reconstructErnId(date, mv.sourceRefs.toAnchorId);
    const to = movementRef(mv.movementRealityId);
    const from = eventRef(candidateErnId);
    const resolvable = checkResolvable(from, sets) && checkResolvable(to, sets);
    if (!resolvable) {
      // toAnchorId fallback で対応 ern なし → phantom を作らず honest 記録（TaskEdgeKind ではないので注記のみ）。
      unresolved.push({ kind: "task_block", ready: false, missing: `event_movement: 再構成 ern(${candidateErnId}) が frame に不在（toAnchorId fallback 疑い）` } as EdgeJoinReadinessV0);
      continue;
    }
    edges.push({
      schemaVersion: 0,
      edgeId: edgeId("event_movement", from.id, to.id),
      kind: "event_movement",
      from,
      to,
      joinBasis: "ern.sourceRefs.anchorId↔mv.sourceRefs.toAnchorId(ern:id 再構成 gate)",
      resolvable: true,
      evidenceRefs: ["event_movement"],
    });
  }

  return { edges, unresolved };
}

const TASK_EDGE_KIND_SET: ReadonlySet<string> = new Set<RealityEdgeKind>([
  "task_block",
  "task_deadline",
  "block_calendar_window",
  "task_carry_over",
  "task_proposal",
]);

function isTaskEdgeKind(kind: RealityEdgeKind): kind is TaskEdgeKind {
  return TASK_EDGE_KIND_SET.has(kind);
}

/** INV: edge の不変条件（空=適合・throw しない）。 */
export function realityGraphEdgeViolations(edge: RealityGraphEdgeV0): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`realityGraphEdge: ${m}`);
  if (!edge.edgeId.startsWith("redge:")) push(`edgeId は "redge:" 形式（got "${edge.edgeId}"）`);
  if (edge.edgeId !== `redge:${edge.kind}:${edge.from.id}:${edge.to.id}`) push("edgeId が kind/from/to と不整合");
  if (edge.joinBasis.length === 0) push("joinBasis が空（監査不能）");
  if (!edge.resolvable) push("resolvable=false の edge を materialize してはならない（phantom 排除）");
  return out;
}
