/**
 * Flow List Helpers — pure logic tests (Phase 2-B C1)
 *
 * `app/(culcept)/plan/tabs/_helpers.ts` の Flow list 関連 helper を
 * deterministic に検証。
 *
 * 検証対象:
 *   - FLOW_LIST_DEFAULT_COUNT — 定数 = 7
 *   - buildFlowDateRange      — 今日から N 日 (UTC midnight、年跨ぎ / 月跨ぎ / 閏年含む)
 *   - formatFlowSectionLabel  — "今日 · ..." / "明日 · ..." / 通常 label
 *   - weekdayTone             — today > sunday > saturday > weekday の優先順位
 *
 * 設計書: docs/alter-plan-phase2-b-flow-list-mini-design.md §8 C1
 */

import { describe, it, expect } from "vitest";

import {
  buildFlowDateRange,
  FLOW_LIST_DEFAULT_COUNT,
  formatFlowSectionLabel,
  isoDate,
  weekdayTone,
} from "@/app/(culcept)/plan/tabs/_helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLOW_LIST_DEFAULT_COUNT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("FLOW_LIST_DEFAULT_COUNT", () => {
  it("default count は 7", () => {
    expect(FLOW_LIST_DEFAULT_COUNT).toBe(7);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildFlowDateRange
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildFlowDateRange", () => {
  it("default count = 7 で 7 件返す", () => {
    const range = buildFlowDateRange(new Date("2026-05-20T12:00:00Z"));
    expect(range).toHaveLength(7);
  });

  it("最初の要素は今日 (UTC midnight)", () => {
    const range = buildFlowDateRange(new Date("2026-05-20T15:30:00Z"));
    expect(range[0]!.toISOString()).toBe("2026-05-20T00:00:00.000Z");
  });

  it("連続する日付を返す", () => {
    const range = buildFlowDateRange(new Date("2026-05-20T00:00:00Z"), 7);
    expect(range.map(isoDate)).toEqual([
      "2026-05-20",
      "2026-05-21",
      "2026-05-22",
      "2026-05-23",
      "2026-05-24",
      "2026-05-25",
      "2026-05-26",
    ]);
  });

  it("月跨ぎ (5月末 → 6月)", () => {
    const range = buildFlowDateRange(new Date("2026-05-28T12:00:00Z"), 7);
    expect(range.map(isoDate)).toEqual([
      "2026-05-28",
      "2026-05-29",
      "2026-05-30",
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ]);
  });

  it("年跨ぎ (Dec 末 → Jan)", () => {
    const range = buildFlowDateRange(new Date("2026-12-30T12:00:00Z"), 7);
    expect(range.map(isoDate)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
      "2027-01-04",
      "2027-01-05",
    ]);
  });

  it("閏年の Feb (2028 = 閏年)", () => {
    const range = buildFlowDateRange(new Date("2028-02-26T12:00:00Z"), 7);
    expect(range.map(isoDate)).toEqual([
      "2028-02-26",
      "2028-02-27",
      "2028-02-28",
      "2028-02-29", // 閏日
      "2028-03-01",
      "2028-03-02",
      "2028-03-03",
    ]);
  });

  it("非閏年の Feb (2026)", () => {
    const range = buildFlowDateRange(new Date("2026-02-26T12:00:00Z"), 7);
    expect(range.map(isoDate)).toEqual([
      "2026-02-26",
      "2026-02-27",
      "2026-02-28", // 月末
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
    ]);
  });

  it("custom count (14)", () => {
    const range = buildFlowDateRange(new Date("2026-05-20T12:00:00Z"), 14);
    expect(range).toHaveLength(14);
    expect(isoDate(range[0]!)).toBe("2026-05-20");
    expect(isoDate(range[13]!)).toBe("2026-06-02");
  });

  it("count=1", () => {
    const range = buildFlowDateRange(new Date("2026-05-20T12:00:00Z"), 1);
    expect(range).toHaveLength(1);
    expect(isoDate(range[0]!)).toBe("2026-05-20");
  });

  it("count=0 は空配列", () => {
    expect(buildFlowDateRange(new Date("2026-05-20T12:00:00Z"), 0)).toEqual([]);
  });

  it("負の count は空配列", () => {
    expect(buildFlowDateRange(new Date("2026-05-20T12:00:00Z"), -3)).toEqual(
      []
    );
  });

  it("UTC time-of-day は today に影響しない (15:30 UTC)", () => {
    const range = buildFlowDateRange(new Date("2026-05-20T15:30:00Z"));
    expect(range[0]!.toISOString()).toBe("2026-05-20T00:00:00.000Z");
  });

  it("UTC time-of-day は today に影響しない (23:59 UTC)", () => {
    const range = buildFlowDateRange(new Date("2026-05-20T23:59:59Z"));
    expect(range[0]!.toISOString()).toBe("2026-05-20T00:00:00.000Z");
  });

  it("pure: 同じ入力で同じ出力 (deterministic)", () => {
    const now = new Date("2026-05-20T12:00:00Z");
    const r1 = buildFlowDateRange(now, 7);
    const r2 = buildFlowDateRange(now, 7);
    expect(r1.map(isoDate)).toEqual(r2.map(isoDate));
  });

  it("pure: 入力 Date を mutate しない", () => {
    const now = new Date("2026-05-20T12:00:00Z");
    const before = now.toISOString();
    buildFlowDateRange(now, 7);
    expect(now.toISOString()).toBe(before);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// formatFlowSectionLabel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatFlowSectionLabel", () => {
  // 2026-05-20 = 水曜 (Wednesday)
  // 2026-05-21 = 木曜 (Thursday)
  // 2026-05-22 = 金曜 (Friday)

  it("今日 → '今日 · M月D日(曜)'", () => {
    const today = new Date(Date.UTC(2026, 4, 20)); // 2026-05-20 (Wed)
    expect(formatFlowSectionLabel(today, today)).toBe("今日 · 5月20日(水)");
  });

  it("明日 → '明日 · M月D日(曜)'", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    const tomorrow = new Date(Date.UTC(2026, 4, 21));
    expect(formatFlowSectionLabel(tomorrow, today)).toBe("明日 · 5月21日(木)");
  });

  it("明後日以降 → 通常 label のみ (prefix なし)", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    const dayAfter = new Date(Date.UTC(2026, 4, 22));
    expect(formatFlowSectionLabel(dayAfter, today)).toBe("5月22日(金)");
  });

  it("3 日後", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    const day3 = new Date(Date.UTC(2026, 4, 23));
    expect(formatFlowSectionLabel(day3, today)).toBe("5月23日(土)");
  });

  it("年跨ぎ today (12/31 → 1/1)", () => {
    const today = new Date(Date.UTC(2026, 11, 31)); // 12/31 Thursday
    const tomorrow = new Date(Date.UTC(2027, 0, 1)); // 1/1 Friday
    expect(formatFlowSectionLabel(today, today)).toBe("今日 · 12月31日(木)");
    expect(formatFlowSectionLabel(tomorrow, today)).toBe("明日 · 1月1日(金)");
  });

  it("過去日 (today より前) は通常 label", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    const yesterday = new Date(Date.UTC(2026, 4, 19));
    expect(formatFlowSectionLabel(yesterday, today)).toBe("5月19日(火)");
  });

  it("pure: 同じ入力で同じ出力", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    const tomorrow = new Date(Date.UTC(2026, 4, 21));
    expect(formatFlowSectionLabel(tomorrow, today)).toBe(
      formatFlowSectionLabel(tomorrow, today)
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// weekdayTone
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("weekdayTone", () => {
  // 2026-05-20 = Wednesday (水)
  // 2026-05-23 = Saturday (土)
  // 2026-05-24 = Sunday (日)
  // 2026-05-25 = Monday (月)

  it("今日 → 'today'", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    expect(weekdayTone(today, today)).toBe("today");
  });

  it("日曜 (今日でない) → 'sunday'", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    const sunday = new Date(Date.UTC(2026, 4, 24));
    expect(weekdayTone(sunday, today)).toBe("sunday");
  });

  it("土曜 (今日でない) → 'saturday'", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    const saturday = new Date(Date.UTC(2026, 4, 23));
    expect(weekdayTone(saturday, today)).toBe("saturday");
  });

  it("平日 (月) → 'weekday'", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    const monday = new Date(Date.UTC(2026, 4, 25));
    expect(weekdayTone(monday, today)).toBe("weekday");
  });

  it("平日 (火) → 'weekday'", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    const tuesday = new Date(Date.UTC(2026, 4, 26));
    expect(weekdayTone(tuesday, today)).toBe("weekday");
  });

  it("平日 (木) → 'weekday'", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    const thursday = new Date(Date.UTC(2026, 4, 21));
    expect(weekdayTone(thursday, today)).toBe("weekday");
  });

  it("平日 (金) → 'weekday'", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    const friday = new Date(Date.UTC(2026, 4, 22));
    expect(weekdayTone(friday, today)).toBe("weekday");
  });

  it("優先順位: today が sunday より優先 (today on Sunday)", () => {
    const sundayToday = new Date(Date.UTC(2026, 4, 24)); // Sunday
    expect(weekdayTone(sundayToday, sundayToday)).toBe("today");
  });

  it("優先順位: today が saturday より優先 (today on Saturday)", () => {
    const saturdayToday = new Date(Date.UTC(2026, 4, 23)); // Saturday
    expect(weekdayTone(saturdayToday, saturdayToday)).toBe("today");
  });

  it("過去日 (yesterday on Tuesday) でも tone は曜日依存", () => {
    const today = new Date(Date.UTC(2026, 4, 20)); // Wed
    const yesterdayTuesday = new Date(Date.UTC(2026, 4, 19));
    expect(weekdayTone(yesterdayTuesday, today)).toBe("weekday");
  });

  it("pure: 同じ入力で同じ出力", () => {
    const today = new Date(Date.UTC(2026, 4, 20));
    const day = new Date(Date.UTC(2026, 4, 24));
    expect(weekdayTone(day, today)).toBe(weekdayTone(day, today));
  });
});
