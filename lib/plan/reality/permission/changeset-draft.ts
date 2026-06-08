/**
 * Reality Control OS — R5-2 Proposal → ChangeSet Draft Mapper（**pure・no-apply**・barrel 非 export）
 *
 * 設計: docs/r5-permission-asset-audit-and-boundary.md（R5-0）/ change-set.ts（既存 consume）
 *
 * 役割: R2 empty-day proposal を **ChangeSet draft（候補）** に変換する pure mapper。**既存 ChangeSet 型を consume**し、
 *   **apply しない・実 plan を書かない・PlanCandidate 正本型を作らない**。block は抽象ラベル（具体行動でない）。
 *
 * 厳守: draft のみ（適用しない）・抽象 kind ラベル（Life Ops 具体行動にしない）・governance は tentative/droppable/proposed・
 *   itemId は deterministic（Date.now/Math.random なし）・pure。
 */

import type { ChangeOp, ChangeSet, PlanItemSnapshot } from "../change-set";
import type { PlanItemGovernance } from "../authority";
import type { EmptyDayBlockKind, EmptyDayProposal } from "../empty-day/empty-day-generator";

/** block kind → **抽象**ラベル（具体行動でない＝Life Ops 領域に踏み込まない）。 */
const KIND_LABEL: Record<EmptyDayBlockKind, string> = {
  focus_work: "集中の時間",
  light_task: "軽い用事の時間",
  recovery: "休息",
  open: "自由時間",
  buffer: "余白",
};

/** draft の governance（**tentative・droppable・proposed**＝未確定の候補）。 */
const DRAFT_GOVERNANCE: PlanItemGovernance = {
  origin: "alter_generated",
  authority: "proposed",
  flexibility: "droppable",
  protectionReasons: ["tentative"],
};

/**
 * R5-2: empty-day proposal → ChangeSet draft（add ops の候補・**apply しない**）。
 *   itemId は date/tier/開始分から deterministic。block は抽象ラベル。
 */
export function proposalToChangeSetDraft(proposal: EmptyDayProposal, date: string): ChangeSet {
  const ops: ChangeOp[] = proposal.blocks.map((b) => {
    const itemId = `draft:emptyday:${date}:${proposal.tier}:${b.startMinute}`;
    const after: PlanItemSnapshot = {
      itemId,
      startMin: b.startMinute,
      endMin: b.endMinute,
      title: KIND_LABEL[b.kind],
      governance: DRAFT_GOVERNANCE,
    };
    return { kind: "add", itemId, after };
  });
  return {
    id: `draft:emptyday:${date}:${proposal.tier}`,
    ops,
    reason: `空白の日の組み方案（${proposal.tier}）`,
    sourceTraces: [],
  };
}
