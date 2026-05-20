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
// Flow list helpers (Phase 2-B: 今後 N 日リスト表示)
//
// 設計書: docs/alter-plan-phase2-b-flow-list-mini-design.md §8 C1
// 不変原則:
//   - すべて pure (副作用なし、現在時刻参照なし、入力 mutate なし)
//   - timezone: UTC 内部 (既存 helper と統一)
//   - test deterministic
//
// 注: formatFlowSectionLabel が formatJpDate を forward reference するが、
// function declaration の hoisting で runtime 解決される (既存 pattern 踏襲)。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Phase 2-B 標準: Flow list の表示日数 (今日含む) */
export const FLOW_LIST_DEFAULT_COUNT = 7;

/**
 * 今日を起点に count 日分の UTC midnight Date 配列を返す。
 *
 * @param now 現在時刻 (test 用に引数で受ける)
 * @param count 取得日数 (default: FLOW_LIST_DEFAULT_COUNT = 7)
 *
 * @example
 *   buildFlowDateRange(new Date("2026-05-20T12:00:00Z"), 7)
 *   // → [5/20, 5/21, 5/22, 5/23, 5/24, 5/25, 5/26] (UTC midnight 7 件)
 *
 *   buildFlowDateRange(new Date("2026-12-30T12:00:00Z"), 7)
 *   // → [12/30, 12/31, 1/1, 1/2, 1/3, 1/4, 1/5] (年跨ぎ)
 */
export function buildFlowDateRange(
  now: Date,
  count: number = FLOW_LIST_DEFAULT_COUNT
): Date[] {
  if (count <= 0) return [];
  const today = utcMidnight(now);
  return Array.from({ length: count }, (_, i) => addDays(today, i));
}

/**
 * Flow list の section header label を返す。
 *
 * 今日 → "今日 · 5月20日(水)"
 * 明日 → "明日 · 5月21日(木)"
 * それ以外 → "5月22日(金)"
 *
 * @param day 対象日 (UTC midnight)
 * @param today 今日 (UTC midnight、test 用に引数で受ける)
 */
export function formatFlowSectionLabel(day: Date, today: Date): string {
  const dayIso = isoDate(day);
  const todayIso = isoDate(today);
  const tomorrowIso = isoDate(addDays(today, 1));
  const base = formatJpDate(day);
  if (dayIso === todayIso) return `今日 · ${base}`;
  if (dayIso === tomorrowIso) return `明日 · ${base}`;
  return base;
}

/**
 * Flow list の section header tone (色味の分類)。
 *
 * 優先順位: today > sunday > saturday > weekday
 * Tailwind class mapping は UI 側 (FlowTab) に閉じる。helper は pure な分類のみ。
 *
 * - today: 今日。最優先 (日曜・土曜よりも先に判定)
 * - sunday: 日曜 (text-rose-500 等の locale 色)
 * - saturday: 土曜 (text-blue-500 等の locale 色)
 * - weekday: 月-金 (中立色)
 */
export type FlowWeekdayTone = "today" | "sunday" | "saturday" | "weekday";

export function weekdayTone(day: Date, today: Date): FlowWeekdayTone {
  if (isoDate(day) === isoDate(today)) return "today";
  const dow = day.getUTCDay();
  if (dow === 0) return "sunday";
  if (dow === 6) return "saturday";
  return "weekday";
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Geocoding helpers (Phase 2-C v3、§5.2 / §5.9 / §0.5.2 強化 4)
//
// 設計書: docs/alter-plan-phase2-c-map-tab-mini-design.md
// 不変原則:
//   - すべて pure (副作用なし、現在時刻参照なし、入力 mutate なし)
//   - test deterministic
//   - server-side / client-side 両方で import 可能
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 同 locationText を持つ複数 anchor を 1 Places API call に dedupe するための normalize。
 *
 * - `NFKC`: 全角英数字 → 半角英数字、半角カナ → 全角カナの統一 (Unicode normalization)
 * - lowercase: ASCII / 全角英大文字 を統一 ("Tokyo" === "tokyo" === "ＴＯＫＹＯ")
 * - whitespace 連続 → 1 個 ("Tokyo  Tower" === "Tokyo Tower")
 * - trim: 前後空白除去
 *
 * 例:
 *   - "スターバックス 代官山店" === "スターバックス　代官山店" (全角→半角空白)
 *   - "Tokyo Tower" === "tokyo tower" (lowercase)
 *   - "  渋谷駅  " === "渋谷駅" (trim)
 *
 * 注意: 半角カナ→全角カナの変換も NFKC で起こるが、これは Places API クエリでも好ましい
 * (Places API 側で半角カナを認識する保証がないため、全角統一が安全)。
 */
export function normalizeLocationText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * placeResolver の cache に保存される ResolutionConfidence のうち、
 * Plan の MapTab で pin として **表示してよい** 信頼度か判定する。
 *
 * Phase 2-C v3 §0.5.2 強化 5 (Cached low-confidence guard):
 *   - Alter Morning の resolver は context (chain_brand / generic_place / area match 等) で
 *     "low" confidence を返すことがある (例: "図書館" のみで area 不明)
 *   - Plan の anchor は user 自己申告で「私の予定 = 私の地理」 なので、誤 pin (= 違う場所を pin にしてしまう) は混乱を招く
 *   - そこで Plan 側では "medium" 以上の confidence のみ pin に採用、"low" は semantic fallback に回す
 */
export function confidenceAtLeastMedium(confidence: string): boolean {
  return confidence === "medium" || confidence === "high";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 2-C MapTab voice / signature helpers (additive)
//
// 設計書: docs/alter-plan-phase2-c-map-tab-mini-design.md §3.3 + §12.3.2-3
// 不変原則:
//   - すべて pure (副作用なし、現在時刻参照なし、入力 mutate なし)
//   - test deterministic
//   - server / client 両方で import 可能
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 期間内の visit count を Aneurasync voice (自然語) で返す。
 *
 * - count=0 → "今は静か" (Phase 2-B §11.10 / Phase 2-C §0.5.2 empty as silence 哲学整合)
 * - count >= windowDays/7 → "週 N 回" (週 1+ ペース)
 * - 0 < count < windowDays/7 → 30 日換算 → "月 N 回"
 * - 計算不能 (e.g. windowDays<=0) → "{count} 回" (フォールバック)
 *
 * 例 (windowDays=14):
 *   - count=0 → "今は静か"
 *   - count=14 → "週 7 回"
 *   - count=7 → "週 4 回" (Math.round(7 / 2) = 4)
 *   - count=2 → "週 1 回" (Math.round(2 / 2) = 1)
 *   - count=1 → "月 2 回" (1 * (30/14) = ~2.14 → Math.round = 2)
 */
export function categoryFrequencyVoice(
  count: number,
  windowDays: number,
): string {
  if (count <= 0) return "今は静か";
  if (windowDays <= 0) return `${count} 回`;
  const perWeek = count / (windowDays / 7);
  if (perWeek >= 1) return `週 ${Math.max(1, Math.round(perWeek))} 回`;
  const perMonth = count * (30 / windowDays);
  if (perMonth >= 1) return `月 ${Math.max(1, Math.round(perMonth))} 回`;
  return `${count} 回 (${windowDays} 日間)`;
}

/**
 * Anchor 集合の startTime を集計して、生活リズムの voice を返す。
 *
 * 時間帯定義 (24h):
 *   - 朝   = 5-10 時
 *   - 日中 = 11-16 時
 *   - 夜   = 17-21 時
 *   - 深夜 = 22-4 時
 *
 * Voice 判定 (優先順):
 *   1. anchors 空 → null
 *   2. 過半数 (>= 50%) が単一帯 → "朝中心" / "日中中心" / "夜中心" / "深夜中心"
 *   3. 朝 + 夜 の合計 >= 60% → "朝晩中心"
 *   4. それ以外 → null (signature を出さない、混在しすぎ)
 *
 * pure: anchors 配列を mutate しない、現在時刻参照なし。
 */
export type AnchorWithStartTime = { startTime: string };

export function categoryTimeSignature(
  anchors: ReadonlyArray<AnchorWithStartTime>,
): string | null {
  if (anchors.length === 0) return null;

  let morning = 0; // 5-10
  let day = 0; // 11-16
  let evening = 0; // 17-21
  let night = 0; // 22-4

  for (const a of anchors) {
    const hour = Number(a.startTime.slice(0, 2)) || 0;
    if (hour >= 5 && hour <= 10) morning++;
    else if (hour >= 11 && hour <= 16) day++;
    else if (hour >= 17 && hour <= 21) evening++;
    else night++;
  }

  const total = anchors.length;
  const top = Math.max(morning, day, evening, night);

  // 単一帯過半数
  if (top / total >= 0.5) {
    if (top === morning) return "朝中心";
    if (top === day) return "日中中心";
    if (top === evening) return "夜中心";
    if (top === night) return "深夜中心";
  }

  // 朝晩混在 (= 通勤・通学・夕食パターン)
  if ((morning + evening) / total >= 0.6) return "朝晩中心";

  // それ以外: 混在しすぎで signature 出さない
  return null;
}

/**
 * Category-themed marker icon spec (Map pin の色 + emoji symbol mapping)。
 *
 * 設計書 §4.3:
 *   - locationCategory 別の色 + emoji で「これは家 / 職場 / カフェ」 を pin 視覚で即時識別
 *   - sensitive anchor は CATEGORY_META[cat].emoji を使わず 🔒 (privacy)
 *   - Google Maps Marker.icon に渡す SVG path + fillColor として消費
 */
export const MAP_CATEGORY_MARKER: Record<
  LocationGroupKey,
  { color: string; emoji: string }
> = {
  home: { color: "#6366f1", emoji: "🏠" }, // indigo
  office: { color: "#475569", emoji: "🏢" }, // slate
  school: { color: "#0ea5e9", emoji: "🎓" }, // sky
  cafe: { color: "#d97706", emoji: "☕" }, // amber
  outdoor: { color: "#16a34a", emoji: "🌿" }, // green
  public: { color: "#7c3aed", emoji: "🏛️" }, // violet
  transit: { color: "#64748b", emoji: "🚃" }, // slate-500
  unknown: { color: "#94a3b8", emoji: "📍" }, // slate-400
  none: { color: "#cbd5e1", emoji: "·" }, // slate-300
};

/** Sensitive marker (privacy preserved、locationCategory 不問) */
export const MAP_SENSITIVE_MARKER = { color: "#94a3b8", emoji: "🔒" };
