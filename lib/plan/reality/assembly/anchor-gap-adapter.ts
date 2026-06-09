/**
 * Reality Control OS — 4-B Anchor commitments → AvailableWindow（**pure・interval complement**・barrel 非 export）
 *
 * 設計: docs/full-worldstate-reader-preflight.md（§2, §7）
 *
 * ★4-B 確認結果（重要・前提検証）:
 *   preflight は「anchors → buildDayGraph(pure) → GapNode → AvailableWindow」を想定したが、実調査で
 *   **`buildDayGraph` は full `ExternalAnchor`（title/sourceId/confirmedAt/rigidity 等）を要求**する一方、
 *   安全な column-restricted reader（`ColumnRestrictedAnchorRow` = id/start/end/rigidity/sensitive のみ・**title なし**）では
 *   それを feed できない（**PII 列を増やすか、欠損フィールドを捏造するしかない＝どちらも禁止**）。
 *   → よって 4-B は **buildDayGraph を使わず、安全な時刻 interval（start/end）だけから free window を出す complement** にする。
 *   これは **DayGraph 正本の再実装ではない**（anchor/edge/transition/travel modeling を一切しない・単なる区間の補集合）。
 *   travel buffer を考慮しないため **gap meaning は捏造せず null**（classifyGap は別文脈が要る）。
 *   （GapNode が full に得られる文脈＝client 側等では既存 `gapNodesToAvailableWindows` を使える）。
 *
 * 厳守: actual DB read しない・DayGraph 再実装しない・gap meaning 捏造しない（null）・pure。
 */

import type { AvailableWindow } from "../empty-day/empty-day-input";

/** busy 区間（HardConstraint 等の {startMinute,endMinute}）。 */
export interface BusyInterval {
  readonly startMinute: number;
  readonly endMinute: number;
}

/**
 * 4-B: busy 区間の **補集合**＝[dayStartMin, dayEndMin] 内の free window。overlap は merge。meaning は **捏造せず null**。
 *   不正区間 skip・day 境界で clamp。pure。
 */
export function availableWindowsFromCommitments(
  commitments: readonly BusyInterval[],
  dayStartMin: number,
  dayEndMin: number,
): readonly AvailableWindow[] {
  if (!(dayStartMin < dayEndMin)) return [];
  // 有効区間を day 境界で clamp + sort
  const busy = commitments
    .filter((c) => Number.isFinite(c.startMinute) && Number.isFinite(c.endMinute) && c.startMinute < c.endMinute)
    .map((c) => ({ s: Math.max(dayStartMin, c.startMinute), e: Math.min(dayEndMin, c.endMinute) }))
    .filter((c) => c.s < c.e)
    .sort((a, b) => a.s - b.s);

  // overlap を merge
  const merged: { s: number; e: number }[] = [];
  for (const b of busy) {
    const last = merged[merged.length - 1];
    if (last && b.s <= last.e) last.e = Math.max(last.e, b.e);
    else merged.push({ ...b });
  }

  // 補集合 = free windows
  const out: AvailableWindow[] = [];
  let cursor = dayStartMin;
  for (const m of merged) {
    if (m.s > cursor) out.push({ startMinute: cursor, endMinute: m.s, meaning: null });
    cursor = Math.max(cursor, m.e);
  }
  if (cursor < dayEndMin) out.push({ startMinute: cursor, endMinute: dayEndMin, meaning: null });
  return out;
}
