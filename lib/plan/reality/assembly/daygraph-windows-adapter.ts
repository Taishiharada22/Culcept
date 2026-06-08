/**
 * Reality Control OS — Assembly: DayGraph GapNode → AvailableWindow（**pure・type-only consume**・barrel 非 export）
 *
 * 設計: docs/live-reader-integration-design.md（§2.1）/ docs/r2-empty-day-asset-audit-and-boundary.md
 *
 * 役割: DayGraph の **GapNode（implicit gap）** を R2 の `AvailableWindow` に変換する pure adapter。
 *   **DayGraph 正本を再実装しない**（startTime/endTime を type-only consume するだけ）。
 *
 * 厳守: **meaning を捏造しない**（classifyGap は travel/energy/meal 等の文脈が必要＝GapNode 単体で揃わない → 既定 null。
 *   文脈が揃う caller が meaningOf resolver で渡せる）。無効時刻は skip（捏造しない）。pure・Date.now なし。
 */

import type { GapNode } from "../../dayGraph/dayGraphTypes";
import type { AvailableWindow } from "../empty-day/empty-day-input";
import type { GapMeaning } from "../gap-meaning";

/** GapNode から必要な部分のみ consume（type-only・DayGraph 正本に密結合しない）。 */
export type GapWindowSource = Pick<GapNode, "startTime" | "endTime">;

const DAY_MAX = 24 * 60;

/** "HH:MM" → 分（0..1440）。不正/範囲外は null（捏造しない）。 */
export function hhmmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 24 || min < 0 || min > 59) return null;
  const total = h * 60 + min;
  return total >= 0 && total <= DAY_MAX ? total : null;
}

/**
 * GapNode[] → AvailableWindow[]。meaning は **resolver 注入時のみ**（既定 null＝捏造しない）。無効時刻 skip。
 */
export function gapNodesToAvailableWindows(
  gaps: readonly GapWindowSource[],
  meaningOf?: (gap: GapWindowSource) => GapMeaning | null,
): readonly AvailableWindow[] {
  const out: AvailableWindow[] = [];
  for (const g of gaps) {
    const s = hhmmToMinutes(g.startTime);
    const e = hhmmToMinutes(g.endTime);
    if (s == null || e == null || s >= e) continue; // 無効/逆転は捏造せず skip
    out.push({ startMinute: s, endMinute: e, meaning: meaningOf ? meaningOf(g) ?? null : null });
  }
  return out;
}
