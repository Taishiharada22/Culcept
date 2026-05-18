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
