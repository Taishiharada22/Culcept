/**
 * Plan tabs 共通 helpers (W1-5)
 *
 * Calendar / Flow / Map の 3 tab が共有する pure 関数群。
 * UI ロジックではなく、anchor 集合 → 表示用データ への変換に閉じる。
 *
 * 設計書: docs/alter-plan-w15-ui-mini-design.md
 *
 * 不変原則:
 *   - すべて pure（副作用なし、現在時刻参照なし、入力 mutate なし）
 *   - timezone: UTC 内部
 *   - test deterministic（now を引数で受ける、または引数 Date を信頼）
 */

import type {
  AnchorSensitiveCategory,
  ExternalAnchor,
} from "@/lib/plan/external-anchor";
import { expandOneOff, expandRecurrence } from "@/lib/plan/recurrence-expander";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Date helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(d.getUTCDate() + n);
  return r;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 与えられた Date が含まれる週の月曜（UTC midnight）を返す */
export function getMondayOf(now: Date): Date {
  const d = utcMidnight(now);
  const day = d.getUTCDay(); // 0 (Sun) - 6 (Sat)
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** monday からの 7 日分（月〜日） */
export function getWeekDays(now: Date): Date[] {
  const monday = getMondayOf(now);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Month helpers (Phase 2-A: Compact week strip + selected day agenda)
//
// 設計書: docs/alter-plan-phase2-a-calendar-month-view-mini-design.md §4.3
// 不変原則:
//   - すべて pure (副作用なし、現在時刻参照なし、入力 mutate なし)
//   - timezone: UTC 内部 (既存 helper と統一)
//   - test deterministic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 与えられた Date が含まれる月の月初 (1 日 UTC midnight) を返す */
export function getMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * 月末日を返す (28/29/30/31)。閏年対応。
 *
 * @param year 西暦年 (例: 2026)
 * @param month 0-indexed (Date.getUTCMonth() と同じ、0=Jan, 11=Dec)
 */
export function getLastDayOfMonth(year: number, month: number): number {
  // JS の Date は month overflow で次月の "0 日" = 当月末日になる
  // 例: new Date(Date.UTC(2026, 2, 0)) = 2026-02-28 (Feb 末日)
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * 指定日付を target year/month に clamp。同日が存在しない場合は target month の末日。
 *
 * @example
 *   clampDateToMonth(2026, 1, 31) // → 2026-02-28 (Feb 28、非閏年)
 *   clampDateToMonth(2028, 1, 31) // → 2028-02-29 (Feb 29、閏年)
 *   clampDateToMonth(2026, 4, 31) // → 2026-05-31 (May は 31 日まである)
 *   clampDateToMonth(2026, 1, 15) // → 2026-02-15 (普通の case)
 */
export function clampDateToMonth(
  year: number,
  month: number,
  day: number
): Date {
  const lastDay = getLastDayOfMonth(year, month);
  const clampedDay = Math.min(Math.max(1, day), lastDay);
  return new Date(Date.UTC(year, month, clampedDay));
}

/**
 * 月加算。月末 overflow は最終日に clamp (1/31 → 2/28 or 2/29 閏年)。
 *
 * @example
 *   addMonths(new Date("2026-01-31"), 1) // → 2026-02-28
 *   addMonths(new Date("2028-01-31"), 1) // → 2028-02-29 (閏年)
 *   addMonths(new Date("2026-12-15"), 1) // → 2027-01-15 (年跨ぎ)
 *   addMonths(new Date("2026-01-15"), -1) // → 2025-12-15 (前月、年跨ぎ)
 */
export function addMonths(d: Date, n: number): Date {
  const totalMonths = d.getUTCMonth() + n;
  const newYear = d.getUTCFullYear() + Math.floor(totalMonths / 12);
  const newMonth = ((totalMonths % 12) + 12) % 12;
  return clampDateToMonth(newYear, newMonth, d.getUTCDate());
}

/**
 * 1 週ストリップ用の cell 配列を返す (Phase 2-A の compact week strip 用)。
 *
 * selectedDate が属する週 (日-土 7 日、日本標準) を返す。月跨ぎ週も含む。
 * 各 cell に inCurrentMonth flag 付き (currentMonth と異なる月の日は薄色表示用)。
 *
 * 日本標準: 週の始まりは **日曜日** (iOS / Google Calendar 日本ロケール default)
 *
 * @param selectedDate 選択日 (UTC)
 * @param currentMonth 現在表示中の月 (月初 1 日 UTC) — inCurrentMonth 判定用
 */
export function buildWeekStrip(
  selectedDate: Date,
  currentMonth: Date
): WeekStripCell[] {
  // 当週の日曜日 (UTC midnight) を計算
  const utc = utcMidnight(selectedDate);
  const dayOfWeek = utc.getUTCDay(); // 0 = Sun
  utc.setUTCDate(utc.getUTCDate() - dayOfWeek);
  const sunday = new Date(utc);

  const currentMonthIndex = currentMonth.getUTCMonth();
  const currentMonthYear = currentMonth.getUTCFullYear();

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(sunday, i);
    return {
      date,
      iso: isoDate(date),
      dayOfMonth: date.getUTCDate(),
      inCurrentMonth:
        date.getUTCMonth() === currentMonthIndex &&
        date.getUTCFullYear() === currentMonthYear,
    };
  });
}

export interface WeekStripCell {
  date: Date;
  iso: string;
  dayOfMonth: number;
  /** false = currentMonth と異なる月の日 (薄色表示用) */
  inCurrentMonth: boolean;
}

/**
 * 月名 + 年の日本語表示 (CEO mock 整合: "4月 2026"、月-スペース-年)
 *
 * @example formatJpYearMonth(new Date("2026-04-15")) // → "4月 2026"
 */
export function formatJpYearMonth(d: Date): string {
  return `${d.getUTCMonth() + 1}月 ${d.getUTCFullYear()}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Time helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function formatTime(t: string): string {
  return t.slice(0, 5);
}

/** "HH:MM[:SS]" → minutes */
export function minutesOf(t: string): number {
  const [h, m] = t.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

/** 前 anchor の endTime(なければ startTime) → 次 anchor の startTime の差（分） */
export function gapMinutes(prev: ExternalAnchor, next: ExternalAnchor): number {
  const prevEnd = prev.endTime ?? prev.startTime;
  return minutesOf(next.startTime) - minutesOf(prevEnd);
}

export function formatGap(mins: number): string {
  if (mins <= 0) return "間隔なし";
  if (mins < 60) return `${mins} 分`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} 時間` : `${h} 時間 ${m} 分`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Flow gap add affordance helpers (W1-X3)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Flow gap add 導線を出すしきい値（CEO 補正 2: 30 分未満は出さない） */
export const FLOW_GAP_MIN_MINUTES = 30;

/** anchor 間 gap が add 導線を出すべきサイズか */
export function shouldShowGapAdd(
  gapMins: number,
  minGapMins: number = FLOW_GAP_MIN_MINUTES
): boolean {
  return gapMins >= minGapMins;
}

/**
 * anchor 間 gap の「中央時刻」を 15 分単位で下方丸めして返す。
 *
 * 例: prev.endTime=10:00, next.startTime=12:00 → mid=11:00 → "11:00"
 *     prev.endTime=10:00, next.startTime=10:50 → mid=10:25 → "10:15"
 *
 * CEO 補正 2: 15 分単位丸めで Flow gap pre-fill を整える。
 */
export function suggestGapStartTime(
  prevEndOrStart: string,
  nextStart: string
): string {
  const prev = minutesOf(prevEndOrStart);
  const next = minutesOf(nextStart);
  const mid = Math.floor((prev + next) / 2);
  const rounded = Math.floor(mid / 15) * 15;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Anchor expansion helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** anchor が指定範囲 [start, end] で何日出現するかを数える */
export function countOccurrences(
  anchor: ExternalAnchor,
  start: Date,
  end: Date
): number {
  const range = { start, end };
  if (anchor.anchorKind === "one_off") {
    return expandOneOff({ date: anchor.date }, range).length;
  }
  return expandRecurrence(
    {
      validFrom: anchor.validFrom,
      ...(anchor.validUntil !== undefined ? { validUntil: anchor.validUntil } : {}),
      recurrenceRule: anchor.recurrenceRule,
      ...(anchor.exceptionDates !== undefined
        ? { exceptionDates: anchor.exceptionDates }
        : {}),
    },
    range
  ).length;
}

/** 指定日（UTC midnight）に該当する anchor を時刻順で返す */
export function anchorsForDay(
  anchors: ExternalAnchor[],
  day: Date
): ExternalAnchor[] {
  const hits: ExternalAnchor[] = [];
  for (const a of anchors) {
    if (countOccurrences(a, day, day) > 0) hits.push(a);
  }
  return hits.sort((x, y) => x.startTime.localeCompare(y.startTime));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Map (location) helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type LocationCategory =
  | "home"
  | "office"
  | "school"
  | "cafe"
  | "outdoor"
  | "public"
  | "transit"
  | "unknown";

export type LocationGroupKey = LocationCategory | "none";

export const LOCATION_GROUP_ORDER: ReadonlyArray<LocationGroupKey> = [
  "home",
  "office",
  "school",
  "cafe",
  "public",
  "outdoor",
  "transit",
  "unknown",
  "none",
];

/** anchor → location group key */
export function categoryOf(a: ExternalAnchor): LocationGroupKey {
  if (a.locationCategory) return a.locationCategory as LocationCategory;
  if (a.locationText && a.locationText.length > 0) return "unknown";
  return "none";
}

export interface CategoryGroup {
  category: LocationGroupKey;
  totalCount: number;
  anchors: Array<{ anchor: ExternalAnchor; count: number }>;
}

/**
 * anchors を location_category 別に group-by。
 * 各 group 内は count 降順、count 同点なら title asc。
 * group 配列は LOCATION_GROUP_ORDER 順、totalCount=0 の group は除外。
 */
export function groupAnchorsByLocation(
  anchors: ExternalAnchor[],
  start: Date,
  end: Date
): CategoryGroup[] {
  const map = new Map<LocationGroupKey, CategoryGroup>();
  for (const a of anchors) {
    const c = countOccurrences(a, start, end);
    if (c === 0) continue;
    const cat = categoryOf(a);
    if (!map.has(cat)) {
      map.set(cat, { category: cat, totalCount: 0, anchors: [] });
    }
    const g = map.get(cat)!;
    g.totalCount += c;
    g.anchors.push({ anchor: a, count: c });
  }

  for (const g of map.values()) {
    g.anchors.sort((x, y) =>
      x.count !== y.count
        ? y.count - x.count
        : x.anchor.title.localeCompare(y.anchor.title)
    );
  }

  return LOCATION_GROUP_ORDER.map((k) => map.get(k)).filter(
    (g): g is CategoryGroup => g !== undefined && g.totalCount > 0
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Label maps (UI から参照)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const WEEKDAY_LABELS: ReadonlyArray<string> = [
  "日",
  "月",
  "火",
  "水",
  "木",
  "金",
  "土",
];

export const CATEGORY_META: Record<
  LocationGroupKey,
  { label: string; emoji: string; hint: string }
> = {
  home: { label: "家", emoji: "🏠", hint: "自分の聖域" },
  office: { label: "職場", emoji: "🏢", hint: "労働の場" },
  school: { label: "学校", emoji: "🎓", hint: "学びの場" },
  cafe: { label: "カフェ", emoji: "☕", hint: "ひと息の場" },
  outdoor: { label: "屋外", emoji: "🌿", hint: "外の空気" },
  public: { label: "公共", emoji: "🏛️", hint: "市民の場" },
  transit: { label: "移動", emoji: "🚃", hint: "通り道" },
  unknown: { label: "未分類", emoji: "📍", hint: "場所カテゴリ未設定" },
  none: { label: "場所なし", emoji: "·", hint: "場所が指定されていない予定" },
};

export const SENSITIVE_LABEL: Record<AnchorSensitiveCategory, string> = {
  medical: "医療",
  legal: "法務",
  exam: "試験",
  other: "敏感",
};

export function formatJpDate(d: Date): string {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const wd = WEEKDAY_LABELS[d.getUTCDay()];
  return `${m}月${day}日(${wd})`;
}
