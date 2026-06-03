/**
 * SR B1b-2C-8-c-3 — targetMonth pure helpers
 *
 * 不変条件:
 *   ① isLeapYear: グレゴリオ暦（4/100/400 ルール）
 *   ② daysInMonth: 1..12 各月 + 閏 2 月 29 / 平 2 月 28 + 30/31 月 + 範囲外防御 30
 *   ③ formatMonthInput: zero-pad "YYYY-MM"
 *   ④ parseMonthInput: 正常 / 形式不正 / 範囲外（year 2020..2100, month 1..12）→ null
 *   ⑤ server parseFormData と range 整合（daysInMonth 28..31 を全月で満たす）
 */
import { describe, it, expect } from "vitest";

import {
  daysInMonth,
  formatMonthInput,
  isLeapYear,
  parseMonthInput,
} from "@/lib/plan/shift/targetMonth";

describe("isLeapYear", () => {
  it("4 の倍数は閏（2024）", () => {
    expect(isLeapYear(2024)).toBe(true);
  });
  it("100 の倍数は非閏（1900）", () => {
    expect(isLeapYear(1900)).toBe(false);
  });
  it("400 の倍数は閏（2000）", () => {
    expect(isLeapYear(2000)).toBe(true);
  });
  it("通常年は非閏（2025）", () => {
    expect(isLeapYear(2025)).toBe(false);
  });
});

describe("daysInMonth", () => {
  it("各月の標準日数（平年 2025）", () => {
    const expected = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    expected.forEach((d, i) => {
      expect(daysInMonth(2025, i + 1)).toBe(d);
    });
  });
  it("閏年 2 月は 29（2024）", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
  });
  it("平年 2 月は 28（2025）", () => {
    expect(daysInMonth(2025, 2)).toBe(28);
  });
  it("範囲外 month は防御値 30", () => {
    expect(daysInMonth(2025, 0)).toBe(30);
    expect(daysInMonth(2025, 13)).toBe(30);
  });
  it("全月が server parseFormData の範囲 28..31 に収まる", () => {
    for (let m = 1; m <= 12; m++) {
      const d = daysInMonth(2024, m); // 閏年で 2 月 29 も確認
      expect(d).toBeGreaterThanOrEqual(28);
      expect(d).toBeLessThanOrEqual(31);
    }
  });
});

describe("formatMonthInput", () => {
  it("zero-pad 1 桁月", () => {
    expect(formatMonthInput(2026, 6)).toBe("2026-06");
  });
  it("2 桁月", () => {
    expect(formatMonthInput(2025, 12)).toBe("2025-12");
  });
});

describe("parseMonthInput", () => {
  it("正常 '2026-06' → {2026, 6}", () => {
    expect(parseMonthInput("2026-06")).toEqual({ year: 2026, month: 6 });
  });
  it("前後空白を許容", () => {
    expect(parseMonthInput("  2025-12  ")).toEqual({ year: 2025, month: 12 });
  });
  it("形式不正 → null", () => {
    expect(parseMonthInput("")).toBeNull();
    expect(parseMonthInput("2026/06")).toBeNull();
    expect(parseMonthInput("2026-6")).toBeNull(); // month は 2 桁
    expect(parseMonthInput("abcd-ef")).toBeNull();
  });
  it("month 範囲外 → null", () => {
    expect(parseMonthInput("2026-00")).toBeNull();
    expect(parseMonthInput("2026-13")).toBeNull();
  });
  it("year 範囲外 → null（2020..2100）", () => {
    expect(parseMonthInput("2019-06")).toBeNull();
    expect(parseMonthInput("2101-06")).toBeNull();
  });
  it("境界 year は受理（2020 / 2100）", () => {
    expect(parseMonthInput("2020-01")).toEqual({ year: 2020, month: 1 });
    expect(parseMonthInput("2100-12")).toEqual({ year: 2100, month: 12 });
  });

  it("format → parse の round-trip", () => {
    const s = formatMonthInput(2026, 6);
    expect(parseMonthInput(s)).toEqual({ year: 2026, month: 6 });
  });
});
