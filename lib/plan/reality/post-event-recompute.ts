/**
 * Reality Control OS — Post-Event Recompute（Slice 2F / INV-20）
 *
 * 「予定の超過/早期終了が後続へどう波及するか」を synthetic DayGraph に対して
 * 純計算する（live 実装前の契約）。後続 hard/important を壊すなら repair へ回す。
 *
 * 制約: 純関数のみ。実 DayGraph・DB なし（minimal node 列を入力に取る）。
 */

export type NodeImportance = "low" | "normal" | "high" | "critical";

export interface DayNode {
  readonly id: string;
  readonly startMin: number;
  readonly endMin: number;
  readonly importance: NodeImportance;
  readonly hard: boolean; // 動かせない（他人/予約等）
}

export interface RecomputeResult {
  readonly impactedIds: readonly string[];
  readonly breaksHardOrImportant: boolean;
  readonly needsRepair: boolean;
  readonly shiftMin: number; // 超過量（正=遅れ / 負=早期終了）
}

/**
 * eventId の実終了時刻 actualEndMin を反映し、後続への波及を計算する。
 * 超過で後続と重なる項を impacted に、hard/important を壊すなら needsRepair。
 */
export function recomputeAfterDrift(
  nodes: readonly DayNode[],
  eventId: string,
  actualEndMin: number
): RecomputeResult {
  const idx = nodes.findIndex((n) => n.id === eventId);
  if (idx < 0) {
    return { impactedIds: [], breaksHardOrImportant: false, needsRepair: false, shiftMin: 0 };
  }
  const ev = nodes[idx];
  const shiftMin = actualEndMin - ev.endMin;

  const after = nodes.filter((n) => n.id !== eventId && n.startMin >= ev.startMin).slice().sort((a, b) => a.startMin - b.startMin);

  const impactedIds: string[] = [];
  let breaks = false;
  let cursor = actualEndMin;

  for (const n of after) {
    if (cursor > n.startMin) {
      // 重なる＝押し出される
      impactedIds.push(n.id);
      if (n.hard || n.importance === "high" || n.importance === "critical") breaks = true;
      cursor = cursor + (n.endMin - n.startMin); // 後続を所要分ぶん押し出す
    } else {
      // 余白で吸収 → 以降は元のペース
      cursor = n.endMin;
    }
  }

  const needsRepair = shiftMin > 0 && impactedIds.length > 0;
  return { impactedIds, breaksHardOrImportant: breaks, needsRepair, shiftMin };
}
