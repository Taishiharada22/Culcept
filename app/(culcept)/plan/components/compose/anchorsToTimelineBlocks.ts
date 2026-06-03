/**
 * anchorsToTimelineBlocks — 当日の既存 anchor → 俯瞰タイムラインの read-only block（A-4b・pure）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md §4.2 / §7
 *
 * 入力は `anchorsForDay()`（既存 _helpers・recurring 展開済み）の当日 ExternalAnchor[]。
 * これを compose の左タイムライン用 TimelineBlock[]（tone="existing"）に写像する。
 *
 * 注意（pure・表示専用）:
 *   - end_time 無 / wrap（end ≤ start）は **表示用に既定長**で確保（保存値ではない）。
 *   - 不正時刻は防御的にスキップ。
 *   - lib → app 依存は作らない（本 file は app 配下。lib の parseMinutes / ExternalAnchor を import）。
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { parseMinutes } from "@/lib/plan/timeline-geometry";

import type { ExistingColorKey, TimelineBlock } from "./DayTimelineCanvas";

/** end 無 / wrap の既存予定を表示するための既定ブロック長（表示専用）。 */
export const EXISTING_FALLBACK_BLOCK_MIN = 60;

/** 既存ブロックのパステル配色（UI-5・表示専用）。id 安定ハッシュで割当て。 */
const EXISTING_COLOR_KEYS: readonly ExistingColorKey[] = [
  "sky",
  "amber",
  "emerald",
  "teal",
];

function colorKeyForId(id: string): ExistingColorKey {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return EXISTING_COLOR_KEYS[h % EXISTING_COLOR_KEYS.length];
}

export function anchorsToTimelineBlocks(
  anchors: ExternalAnchor[],
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  for (const a of anchors) {
    const startMin = parseMinutes(a.startTime);
    if (startMin == null) continue; // 不正時刻はスキップ（防御的）
    const rawEnd = a.endTime != null ? parseMinutes(a.endTime) : null;
    // end 無 or wrap(end ≤ start) は表示用に既定長で確保（保存値ではない）。
    const endMin =
      rawEnd != null && rawEnd > startMin
        ? rawEnd
        : startMin + EXISTING_FALLBACK_BLOCK_MIN;
    blocks.push({
      id: a.id,
      label: a.title,
      startMin,
      endMin,
      tone: "existing",
      colorKey: colorKeyForId(a.id),
    });
  }
  return blocks.sort((x, y) => x.startMin - y.startMin);
}
