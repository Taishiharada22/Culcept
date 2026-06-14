/**
 * recurringDayResolver — RD1b operator 当日の recurring anchor 解決（既存 expandRecurrence を consume・新規 RRULE parser 禁止）
 *
 * 正本: docs/reality-recurring-expansion-coverage-rd1b-0.md（RD1b-0）/ CEO RD1b 実装 GO（2026-06-14）
 *
 * 思想（既存 tested 展開器に委譲・便利に補完しない）: production `anchorsForDay`（`countOccurrences(a, day, day) > 0`）と
 *   同契約で、当日 occur する recurring anchor を **AS-IS（materialize しない・pass-through）**で返す。展開判定は
 *   `lib/plan/recurrence-expander.ts` の `expandRecurrence`（WEEKLY RRULE・exceptionDates/validFrom/validUntil 厳密適用・
 *   不正 RRULE → 空）に委譲。**新規 RRULE parser を書かない**。
 *
 * 不変条件（CEO RD1b）:
 *   - **不正 RRULE / 展開不能 → 当日に入れない**（過少 > 過剰/捏造）。invalidCount に計上。
 *   - exceptionDates / validFrom / validUntil → 既存 expandRecurrence が適用（窓外・cancelled は出さない）。
 *   - fake 補完しない（occur しない instance を作らない）。materialize しない（recurring kind のまま返す）。
 *   - timezone は JST v0（subjectiveDate は呼び元が JST で決定・本関数は date 文字列粒度）。
 *
 * 注: date util ゆえ `new Date(constant string)` を使う（recurrence-expander.ts と同様・決定論的・Date.now/乱数は使わない）。
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { expandRecurrence, type RecurringAnchorLike } from "@/lib/plan/recurrence-expander";

const DAY_MS = 86_400_000;
const PROBE_WINDOW_DAYS = 6; // 7 日窓（WEEKLY 検出: valid-but-not-today vs invalid を区別）

/** YYYY-MM-DD → UTC midnight Date（不正は null・決定論的） */
function dayUtc(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== dateStr) return null; // 2026-02-30 等を弾く
  return d;
}

export interface RecurringDayResolution {
  /** 当日 occur する recurring（AS-IS・materialize しない・eventNodes が展開済として処理） */
  readonly included: ExternalAnchor[];
  /** valid だが当日でない（probe 窓に occur） */
  readonly excludedCount: number;
  /** 展開不能（unparseable / 非 WEEKLY / 窓外・期限切れ）→ 当日に入れない */
  readonly invalidCount: number;
}

/**
 * 当日 occur する recurring anchor を解決する（pure・決定論的・既存 expandRecurrence 委譲・materialize しない）。
 * production `anchorsForDay` の recurring 判定（`expandRecurrence(r, {day,day}).length > 0`）と同契約。
 */
export function resolveTodayRecurring(recurring: ReadonlyArray<ExternalAnchor>, subjectiveDate: string): RecurringDayResolution {
  const day = dayUtc(subjectiveDate);
  if (!day) return { included: [], excludedCount: 0, invalidCount: recurring.length }; // subjectiveDate 不正 → 全 invalid（過少安全）
  const probeEnd = new Date(day.getTime() + PROBE_WINDOW_DAYS * DAY_MS);

  const included: ExternalAnchor[] = [];
  let excludedCount = 0;
  let invalidCount = 0;
  for (const r of recurring) {
    const like = r as unknown as RecurringAnchorLike; // recurring は validFrom/validUntil/recurrenceRule/exceptionDates を持つ
    const occursToday = expandRecurrence(like, { start: day, end: day }).length > 0;
    if (occursToday) {
      included.push(r); // AS-IS（materialize しない）
      continue;
    }
    // 当日でない: probe 窓に occur すれば valid-but-not-today、occur しなければ invalid（不正/非 WEEKLY/期限外）
    const validInWindow = expandRecurrence(like, { start: day, end: probeEnd }).length > 0;
    if (validInWindow) excludedCount += 1;
    else invalidCount += 1;
  }
  return { included, excludedCount, invalidCount };
}
