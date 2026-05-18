/**
 * Recurrence Expander (W1-5)
 *
 * RecurringExternalAnchor を date 配列に展開する **pure 関数**。
 *
 * 設計書: docs/alter-plan-w15-ui-mini-design.md §3
 * 関連: lib/plan/weekday-template.ts (生成側、W1-4pre-2)
 *
 * 不変原則:
 *   1. 副作用なし、入力 mutate なし、現在時刻参照なし（test deterministic）
 *   2. timezone は UTC 内部。表示時にローカル化（UI 側の責務）
 *   3. exceptionDates / validFrom / validUntil を厳密に適用
 *   4. dateRange と anchor validity の intersection だけを返す
 *
 * W1-5 対応範囲:
 *   - `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU` （W1-4pre-2 で生成される範囲と一致）
 *   - 上記以外は **空配列** を返す（throw しない、UI は何も表示しない）
 *
 * W1-5 範囲外:
 *   - `FREQ=DAILY` / `FREQ=MONTHLY` / `FREQ=YEARLY`
 *   - `INTERVAL=2` 等
 *   - `BYMONTHDAY` / `BYMONTH` / `BYSETPOS`
 *   - one_off の展開（呼び出し側で `date` を直接使う）
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RecurringAnchorLike {
  validFrom: string; // YYYY-MM-DD
  validUntil?: string; // YYYY-MM-DD（省略 = 終了未定）
  recurrenceRule: string; // iCal RRULE
  exceptionDates?: string[]; // YYYY-MM-DD[]
}

export interface DateRange {
  /** 開始日 (inclusive)、UTC midnight */
  start: Date;
  /** 終了日 (inclusive)、UTC midnight */
  end: Date;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// iCal BYDAY → JavaScript getUTCDay() マップ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// JS: Sunday=0, Monday=1, ..., Saturday=6
const BYDAY_TO_INDEX: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** YYYY-MM-DD を UTC midnight Date に変換。invalid なら null */
function parseDateOnly(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // round-trip check（2026-02-30 等の物理的無効を弾く）
  if (d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

/** Date を YYYY-MM-DD に変換（UTC 基準） */
function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * RRULE 文字列をパース。
 * 期待 shape: `FREQ=WEEKLY;BYDAY=MO,TU,WE`
 * 範囲外（FREQ != WEEKLY、BYDAY 不在、未対応 token 混入）→ null
 */
function parseWeeklyRrule(rrule: string): { byday: Set<number> } | null {
  if (typeof rrule !== "string" || rrule.length === 0) return null;
  const parts = rrule.split(";");
  const map: Record<string, string> = {};
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq <= 0) return null;
    const key = p.slice(0, eq).toUpperCase();
    const value = p.slice(eq + 1);
    if (key in map) return null; // duplicate key
    map[key] = value;
  }

  // FREQ=WEEKLY 必須
  if ((map.FREQ ?? "").toUpperCase() !== "WEEKLY") return null;

  // BYDAY 必須
  const byday = map.BYDAY;
  if (!byday) return null;

  // INTERVAL= は W1-5 対応外（未対応で確実に skip するため、存在したら reject）
  if ("INTERVAL" in map && map.INTERVAL !== "1") return null;

  // 他の未対応 token は無視せず reject（COUNT / UNTIL / BYMONTHDAY 等）
  const allowedKeys = new Set(["FREQ", "BYDAY", "INTERVAL"]);
  for (const k of Object.keys(map)) {
    if (!allowedKeys.has(k)) return null;
  }

  const days = byday
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);

  const indices = new Set<number>();
  for (const d of days) {
    if (!(d in BYDAY_TO_INDEX)) return null;
    indices.add(BYDAY_TO_INDEX[d]!);
  }
  if (indices.size === 0) return null;

  return { byday: indices };
}

/** 2 つの UTC midnight Date を比較。a < b なら -1、== なら 0、a > b なら 1 */
function compareDate(a: Date, b: Date): number {
  const at = a.getTime();
  const bt = b.getTime();
  if (at < bt) return -1;
  if (at > bt) return 1;
  return 0;
}

/** Date 配列の minimum を返す */
function maxDate(a: Date, b: Date): Date {
  return compareDate(a, b) >= 0 ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return compareDate(a, b) <= 0 ? a : b;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Recurring anchor を date 配列に展開する。
 *
 * - 範囲 intersection: [max(range.start, validFrom), min(range.end, validUntil ?? +∞)]
 * - その範囲を 1 日ずつ走査し、曜日が BYDAY に含まれる日を採用
 * - exceptionDates に該当する日は除外
 * - 不正な RRULE / validFrom / dateRange → 空配列
 *
 * @returns date 配列（UTC midnight、ascending sort）
 */
export function expandRecurrence(
  anchor: RecurringAnchorLike,
  range: DateRange
): Date[] {
  // RRULE parse
  const parsed = parseWeeklyRrule(anchor.recurrenceRule);
  if (!parsed) return [];

  // validFrom 必須、parse
  const validFrom = parseDateOnly(anchor.validFrom);
  if (!validFrom) return [];

  // validUntil optional
  const validUntil = anchor.validUntil ? parseDateOnly(anchor.validUntil) : null;
  if (anchor.validUntil && !validUntil) return []; // invalid validUntil → 空

  // exceptionDates set 化
  const exceptions = new Set<string>(
    (anchor.exceptionDates ?? [])
      .map((s) => (parseDateOnly(s) ? s : null))
      .filter((s): s is string => s !== null)
  );

  // range validity
  if (compareDate(range.start, range.end) > 0) return [];

  // intersection
  const lo = maxDate(range.start, validFrom);
  const hi = validUntil ? minDate(range.end, validUntil) : range.end;

  if (compareDate(lo, hi) > 0) return [];

  // 1 日ずつ走査（範囲は最長で UI 表示分 = 数十日〜数ヶ月想定）
  const result: Date[] = [];
  for (let d = lo; compareDate(d, hi) <= 0; d = addDays(d, 1)) {
    if (!parsed.byday.has(d.getUTCDay())) continue;
    if (exceptions.has(toDateOnly(d))) continue;
    result.push(d);
  }
  return result;
}

/**
 * one_off anchor の date を Date 化する helper。
 * one_off は単発、展開不要。validity check のみ。
 */
export function expandOneOff(
  anchor: { date: string },
  range: DateRange
): Date[] {
  const d = parseDateOnly(anchor.date);
  if (!d) return [];
  if (compareDate(d, range.start) < 0 || compareDate(d, range.end) > 0) return [];
  return [d];
}
