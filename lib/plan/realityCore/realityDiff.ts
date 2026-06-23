/**
 * realityDiff — RO-3 D3（2026-06-20）: RealityDiffV0（snapshot A vs B・5 bucket・node-id 背骨）（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro3-reality-ir-learning-design.md（RO-3 §3・v0.1）
 * 思想: snapshot を単発の現在状態で終わらせず、前回 frame との差分を node id 単位で取る。
 *   added / removed / changed / resolved / collapsed の 5 bucket。learning loop の**背骨**。
 *
 * CEO 裁定（2026-06-20・RO-3 実装 GO）の厳守点:
 *   - etaKnown false→true / departureStatus 悪化 は **v0 dormant**。本 diff の発火対象にしない（捕捉例に挙げない）。
 *   - leaveByLines の resolved は **専用パス**（whyUnresolved 配列の空化を検出。generic value-monotonic walk に依らない）。
 *   - graphBaseId は「同日 **かつ** 同入力リビジョン」。不一致は crossDay=true で changed/resolved/collapsed を空に
 *     （過少報告＝捏造ではない）。同日同入力でない差を変化と誤認しない。
 *   - workLane 片欠落は workLaneDiffable=false で honest 宣言（沈黙で完全性を偽装しない）。
 *
 * 不変条件:
 *   - changed は RealityAttribute.value の差のみ（confidence 揺れ=noise は除外）。
 *   - resolved は null→non-null の単調確定のみ。collapsed は余地の悪化縮小のみ。
 *   - A=null（初回）は added のみ・他 bucket 空（変化を発明しない）。
 *   - prior snapshot を永続しない（両 frame は injected）。IO / RNG / now / Date / write を持たない。
 */
import type { RealityFrameV0, RealityNodeRef } from "./realityFrame";
import { hasWorkLane } from "./realityFrame";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { TaskRealityNodeV0 } from "./taskRealityNode";
import type { LeaveByLinesV0 } from "./leaveByLines";

export const REALITY_DIFF_VERSION = 0;

export interface NodeChangeV0 {
  readonly ref: RealityNodeRef;
  readonly field: string;
  readonly from: string | number | boolean | null;
  readonly to: string | number | boolean | null;
}

export interface ResolvedRefV0 {
  readonly ref: RealityNodeRef;
  readonly field: string;
  /** 'value_monotonic' = null→non-null 単調確定 / 'leave_by_lines' = whyUnresolved 空化（専用パス）。 */
  readonly via: "value_monotonic" | "leave_by_lines";
}

export interface CollapsedRefV0 {
  readonly ref: RealityNodeRef;
  readonly field: string;
  readonly fromGap: number;
  readonly toGap: number;
}

export interface RealityDiffV0 {
  readonly schemaVersion: 0;
  readonly diffId: string;
  readonly fromSnapshotId: string | null;
  readonly toSnapshotId: string;
  readonly fromGraphBaseId: string | null;
  readonly toGraphBaseId: string;
  /** graphBaseId 不一致（別日 or 別入力リビジョン）。true なら changed/resolved/collapsed は空。 */
  readonly crossDay: boolean;
  readonly nodes: {
    readonly added: ReadonlyArray<RealityNodeRef>;
    readonly removed: ReadonlyArray<RealityNodeRef>;
    readonly changed: ReadonlyArray<NodeChangeV0>;
  };
  readonly resolved: ReadonlyArray<ResolvedRefV0>;
  readonly collapsed: ReadonlyArray<CollapsedRefV0>;
  /** 両 frame が workLane を持つ時のみ true。false=task/block 由来の変化を見ていない（honest 宣言）。 */
  readonly workLaneDiffable: boolean;
}

// ── node ref builders ──
const ernRef = (id: string): RealityNodeRef => ({ universe: "snapshot", kind: "event", id });
const mvRef = (id: string): RealityNodeRef => ({ universe: "snapshot", kind: "movement", id });
const csRef = (id: string): RealityNodeRef => ({ universe: "snapshot", kind: "commitment", id });
const taskRef = (id: string): RealityNodeRef => ({ universe: "workLane", kind: "task", id });
const blockRef = (id: string): RealityNodeRef => ({ universe: "workLane", kind: "block", id });

type Prim = string | number | boolean | null;

/** 1 node の curated 比較 field（primitive 値のみ＝equality が単純・confidence は載せない）。 */
interface FieldSnapshot {
  readonly field: string;
  readonly value: Prim;
}

function ernFields(n: EventRealityNodeV0): FieldSnapshot[] {
  return [
    { field: "leaveBy", value: n.leaveBy.value },
    { field: "placeCertainty", value: n.placeCertainty.value },
    { field: "movementRequired", value: n.movementRequired.value },
    // 注: departureStatus / etaKnown は v0 dormant（pinned）。changed が生じれば検出はするが、
    //     resolved/collapsed の「捕捉例」としては扱わない（CEO 裁定）。
  ];
}

function taskFields(n: TaskRealityNodeV0): FieldSnapshot[] {
  return [
    { field: "completionStatus", value: n.completionStatus.value },
    { field: "deadline", value: n.deadline.value },
    { field: "estimatedDuration", value: n.estimatedDuration.value },
    { field: "cognitiveLoad", value: n.cognitiveLoad.value },
  ];
}

/** leaveByLines が解決済みか（recommended が value を持つ＝双解決）。 */
function leaveByLinesResolved(l: LeaveByLinesV0 | undefined): boolean {
  return l !== undefined && l.recommended.value !== null;
}

/** leaveByLines が未解決か（whyUnresolved 非空＝出発線 unresolved）。 */
function leaveByLinesUnresolved(l: LeaveByLinesV0 | undefined): boolean {
  return l === undefined || l.whyUnresolved.length > 0;
}

function diffFields(
  ref: RealityNodeRef,
  a: FieldSnapshot[],
  b: FieldSnapshot[],
  changed: NodeChangeV0[],
  resolved: ResolvedRefV0[],
): void {
  const aMap = new Map(a.map((f) => [f.field, f.value]));
  for (const bf of b) {
    const av = aMap.get(bf.field);
    if (av === undefined) continue; // field 集合差は changed にしない
    if (av === bf.value) continue; // value 不変（confidence noise は元から見ていない）
    changed.push({ ref, field: bf.field, from: av, to: bf.value });
    // resolved = null→non-null の単調確定のみ
    if (av === null && bf.value !== null) {
      resolved.push({ ref, field: bf.field, via: "value_monotonic" });
    }
  }
}

/**
 * diffSnapshots — frame A(prior|null) vs B の差分（pure）。
 *   A=null は added のみ。graphBaseId 不一致は crossDay=true で changed/resolved/collapsed 空。
 */
export function diffSnapshots(a: RealityFrameV0 | null, b: RealityFrameV0): RealityDiffV0 {
  const toSnapshotId = b.snapshot.snapshotId;
  const toGraphBaseId = b.snapshot.graphBaseId;

  // B の id 集合（全宇宙）
  const bRefs: RealityNodeRef[] = [
    ...b.snapshot.eventRealityNodes.map((n) => ernRef(n.eventRealityNodeId)),
    ...b.snapshot.movementRealityNodes.map((m) => mvRef(m.movementRealityId)),
    ...b.snapshot.commitmentSignals.map((c) => csRef(c.commitmentSignalId)),
    ...b.workLane.tasks.map((t) => taskRef(t.taskRealityNodeId)),
    ...b.workLane.blocks.map((bl) => blockRef(bl.blockId)),
  ];

  if (a === null) {
    // 初回: B 全ノードが added・他 bucket 空（変化を発明しない）
    return {
      schemaVersion: 0,
      diffId: `rdiff:null:${toSnapshotId}`,
      fromSnapshotId: null,
      toSnapshotId,
      fromGraphBaseId: null,
      toGraphBaseId,
      crossDay: false,
      nodes: { added: bRefs, removed: [], changed: [] },
      resolved: [],
      collapsed: [],
      workLaneDiffable: hasWorkLane(b),
    };
  }

  const fromSnapshotId = a.snapshot.snapshotId;
  const fromGraphBaseId = a.snapshot.graphBaseId;
  const diffId = `rdiff:${fromSnapshotId}:${toSnapshotId}`;
  const crossDay = fromGraphBaseId !== toGraphBaseId;

  // added / removed は id 集合の対称差（crossDay でも常に計算）
  const aIdSet = new Set([
    ...a.snapshot.eventRealityNodes.map((n) => n.eventRealityNodeId),
    ...a.snapshot.movementRealityNodes.map((m) => m.movementRealityId),
    ...a.snapshot.commitmentSignals.map((c) => c.commitmentSignalId),
    ...a.workLane.tasks.map((t) => t.taskRealityNodeId),
    ...a.workLane.blocks.map((bl) => bl.blockId),
  ]);
  const bIdSet = new Set(bRefs.map((r) => r.id));
  const added = bRefs.filter((r) => !aIdSet.has(r.id));
  const aRefs: RealityNodeRef[] = [
    ...a.snapshot.eventRealityNodes.map((n) => ernRef(n.eventRealityNodeId)),
    ...a.snapshot.movementRealityNodes.map((m) => mvRef(m.movementRealityId)),
    ...a.snapshot.commitmentSignals.map((c) => csRef(c.commitmentSignalId)),
    ...a.workLane.tasks.map((t) => taskRef(t.taskRealityNodeId)),
    ...a.workLane.blocks.map((bl) => blockRef(bl.blockId)),
  ];
  const removed = aRefs.filter((r) => !bIdSet.has(r.id));

  const workLaneDiffable = hasWorkLane(a) && hasWorkLane(b);

  const changed: NodeChangeV0[] = [];
  const resolved: ResolvedRefV0[] = [];
  const collapsed: CollapsedRefV0[] = [];

  if (!crossDay) {
    // ── ern（snapshot 宇宙）curated diff + leaveByLines 専用パス ──
    const aErn = new Map(a.snapshot.eventRealityNodes.map((n) => [n.eventRealityNodeId, n]));
    for (const bn of b.snapshot.eventRealityNodes) {
      const an = aErn.get(bn.eventRealityNodeId);
      if (an === undefined) continue;
      const ref = ernRef(bn.eventRealityNodeId);
      diffFields(ref, ernFields(an), ernFields(bn), changed, resolved);

      // leaveByLines resolved 専用パス: unresolved（whyUnresolved 非空）→ resolved（双解決）
      if (leaveByLinesUnresolved(an.leaveByLines) && leaveByLinesResolved(bn.leaveByLines)) {
        resolved.push({ ref, field: "leaveByLines", via: "leave_by_lines" });
      }
      // collapsed（唯一 v0 で発火可能な縮小）: bandGapMin 減少（余地の悪化縮小）
      const aGap = an.leaveByLines?.bandGapMin ?? null;
      const bGap = bn.leaveByLines?.bandGapMin ?? null;
      if (aGap !== null && bGap !== null && bGap < aGap) {
        collapsed.push({ ref, field: "leaveByLines.bandGapMin", fromGap: aGap, toGap: bGap });
      }
    }

    // ── task（workLane 宇宙）curated diff（workLaneDiffable 時のみ） ──
    if (workLaneDiffable) {
      const aTask = new Map(a.workLane.tasks.map((t) => [t.taskRealityNodeId, t]));
      for (const bt of b.workLane.tasks) {
        const at = aTask.get(bt.taskRealityNodeId);
        if (at === undefined) continue;
        diffFields(taskRef(bt.taskRealityNodeId), taskFields(at), taskFields(bt), changed, resolved);
      }
    }
  }

  return {
    schemaVersion: 0,
    diffId,
    fromSnapshotId,
    toSnapshotId,
    fromGraphBaseId,
    toGraphBaseId,
    crossDay,
    nodes: { added, removed, changed },
    resolved,
    collapsed,
    workLaneDiffable,
  };
}

/** INV: diff の不変条件（空=適合・throw しない）。 */
export function realityDiffViolations(diff: RealityDiffV0): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`realityDiff: ${m}`);
  if (diff.fromSnapshotId === null) {
    // 初回: added のみ・他空
    if (diff.nodes.changed.length > 0 || diff.resolved.length > 0 || diff.collapsed.length > 0 || diff.nodes.removed.length > 0) {
      push("A=null（初回）は added のみ・removed/changed/resolved/collapsed は空");
    }
  }
  if (diff.crossDay) {
    if (diff.nodes.changed.length > 0 || diff.resolved.length > 0 || diff.collapsed.length > 0) {
      push("crossDay=true は changed/resolved/collapsed を空にする（過少報告で捏造を避ける）");
    }
  }
  // resolved は changed の意味的サブクラス（value_monotonic は changed にも現れる・leave_by_lines は専用）
  for (const r of diff.resolved) {
    if (r.via !== "value_monotonic" && r.via !== "leave_by_lines") push(`resolved.via が未知（"${r.via}"）`);
  }
  for (const c of diff.collapsed) {
    if (!(c.toGap < c.fromGap)) push(`collapsed は縮小のみ（fromGap=${c.fromGap}, toGap=${c.toGap}）`);
  }
  return out;
}
