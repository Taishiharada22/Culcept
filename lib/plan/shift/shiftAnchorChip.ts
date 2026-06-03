/**
 * 勤務 anchor → 月 grid 表示 chip（原稿コード）— Plan 月ビュー M3-b polish 案1
 *
 * anchor.title（projection で displayLabel 早番/夜勤/遅番/日勤/早番ロング が入る）から
 * HARADA 辞書を **strict 完全一致** で逆引きし、rawCode（E/N/L/G/E-18）を chip にして返す。
 *
 * 不変原則:
 *   - **fuzzy 一致禁止**（contains / startsWith 等はしない）。完全一致のみ。
 *   - 一致しない anchor（非シフト Google/ICS/手動 等）は **null** を返す
 *     （= 呼び出し側 MonthGridView が短縮 title / 予定 に fallback。無理にコード化しない）。
 *   - work category のみ逆引き対象（off は PlanDayIndicator.rawCode 経由で別途表示）。
 *
 * 疎結合: MonthGridView は本 resolver を props（getAnchorChip）で受けるだけで、
 *   HARADA 辞書を直接 import しない（汎用カレンダー部品のまま）。
 *
 * 注: 現状辞書は HARADA 固有（MVP・1 ユーザー）。多ユーザー対応時は per-user 辞書 +
 *   anchor への rawCode 保存（案3・production 前 backlog）でクリーンになる。
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { MonthGridChip } from "@/lib/plan/monthGridChip";

import { HARADA_SPRIX_DICTIONARY } from "./shiftCodeDictionary";

/** displayLabel（完全一致キー）→ rawCode の逆引き index（work category のみ） */
const WORK_LABEL_TO_RAWCODE: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const entry of Object.values(HARADA_SPRIX_DICTIONARY.codes)) {
    if (entry.category === "work") {
      m.set(entry.displayLabel, entry.rawCode);
    }
  }
  return m;
})();

/**
 * 勤務 anchor → chip（rawCode）。完全一致しなければ null。
 *
 * @example
 *   resolveShiftAnchorChip({ title: "早番", ... }) // → { label: "E", tone: "work" }
 *   resolveShiftAnchorChip({ title: "夜勤", ... }) // → { label: "N", tone: "work" }
 *   resolveShiftAnchorChip({ title: "会議", ... }) // → null（非シフト → 呼び出し側 fallback）
 */
export function resolveShiftAnchorChip(
  anchor: ExternalAnchor
): MonthGridChip | null {
  const code = WORK_LABEL_TO_RAWCODE.get(anchor.title); // strict 完全一致
  if (code === undefined) return null;
  return { label: code, tone: "work" };
}
