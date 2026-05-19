/**
 * Calendar Week Strip Helpers — pure logic tests (Phase 2-A C1)
 *
 * `app/(culcept)/plan/tabs/_helpers.ts` の月関連 helper を
 * deterministic に検証。
 *
 * 検証対象:
 *   - getMonthStart        — 月初 1 日
 *   - getLastDayOfMonth    — 月末日 (28/29/30/31、閏年含む)
 *   - clampDateToMonth     — 日付の月内 clamp (1/31 → 2/28 or 2/29)
 *   - addMonths            — 月加算 (clamp 付き、年跨ぎ含む)
 *   - buildWeekStrip       — 1 週ストリップ生成 (月跨ぎ inCurrentMonth flag)
 *   - formatJpYearMonth    — "X月 YYYY" (mock 整合)
 */

import { describe, it, expect } from "vitest";

import {
  getMonthStart,
  getLastDayOfMonth,
  clampDateToMonth,
  addMonths,
  buildWeekStrip,
  formatJpYearMonth,
  isoDate,
} from "@/app/(culcept)/plan/tabs/_helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getMonthStart
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getMonthStart", () => {
  it("月中の日付 → 当月 1 日", () => {
    const r = getMonthStart(new Date(Date.UTC(2026, 3, 15))); // 2026-04-15
    expect(isoDate(r)).toBe("2026-04-01");
  });

  it("月初 (1 日) → 同 1 日", () => {
    const r = getMonthStart(new Date(Date.UTC(2026, 3, 1)));
    expect(isoDate(r)).toBe("2026-04-01");
  });

  it("月末 (30 日) → 当月 1 日", () => {
    const r = getMonthStart(new Date(Date.UTC(2026, 3, 30)));
    expect(isoDate(r)).toBe("2026-04-01");
  });

  it("UTC midnight に丸まる", () => {
    const r = getMonthStart(new Date("2026-04-15T15:30:00.000Z"));
    expect(r.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getLastDayOfMonth
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getLastDayOfMonth", () => {
  it("31 日月 (1月)", () => {
    expect(getLastDayOfMonth(2026, 0)).toBe(31);
  });

  it("30 日月 (4月)", () => {
    expect(getLastDayOfMonth(2026, 3)).toBe(30);
  });

  it("2月 非閏年 (2026)", () => {
    expect(getLastDayOfMonth(2026, 1)).toBe(28);
  });

  it("2月 閏年 (2028)", () => {
    expect(getLastDayOfMonth(2028, 1)).toBe(29);
  });

  it("2月 閏年 (2000、4 で割切れて 400 でも割切れる年)", () => {
    expect(getLastDayOfMonth(2000, 1)).toBe(29);
  });

  it("2月 非閏年 (2100、4 で割切れるが 100 で割切れて 400 で割切れない)", () => {
    expect(getLastDayOfMonth(2100, 1)).toBe(28);
  });

  it("12月", () => {
    expect(getLastDayOfMonth(2026, 11)).toBe(31);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// clampDateToMonth
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("clampDateToMonth", () => {
  describe("同日付存在 → 維持", () => {
    it("4 月 15 日 → 5 月 → 5/15 (普通)", () => {
      expect(isoDate(clampDateToMonth(2026, 4, 15))).toBe("2026-05-15");
    });

    it("3 月 31 日 → 5 月 → 5/31 (両月 31 日まで存在)", () => {
      expect(isoDate(clampDateToMonth(2026, 4, 31))).toBe("2026-05-31");
    });
  });

  describe("存在しない → 月末 clamp", () => {
    it("1/31 → 2 月 → 2/28 (非閏年 2026)", () => {
      expect(isoDate(clampDateToMonth(2026, 1, 31))).toBe("2026-02-28");
    });

    it("1/31 → 2 月 → 2/29 (閏年 2028)", () => {
      expect(isoDate(clampDateToMonth(2028, 1, 31))).toBe("2028-02-29");
    });

    it("5/31 → 6 月 → 6/30 (6 月は 30 日まで)", () => {
      expect(isoDate(clampDateToMonth(2026, 5, 31))).toBe("2026-06-30");
    });

    it("3/30 → 2 月 → 2/28 (非閏年)", () => {
      expect(isoDate(clampDateToMonth(2026, 1, 30))).toBe("2026-02-28");
    });

    it("3/29 → 2 月 → 2/28 (非閏年)", () => {
      expect(isoDate(clampDateToMonth(2026, 1, 29))).toBe("2026-02-28");
    });
  });

  describe("day 異常値の clamp", () => {
    it("day = 0 → 月初 1 日 (下限)", () => {
      expect(isoDate(clampDateToMonth(2026, 3, 0))).toBe("2026-04-01");
    });

    it("day = -5 → 月初 1 日 (下限)", () => {
      expect(isoDate(clampDateToMonth(2026, 3, -5))).toBe("2026-04-01");
    });

    it("day = 99 → 月末 (上限 clamp)", () => {
      expect(isoDate(clampDateToMonth(2026, 3, 99))).toBe("2026-04-30");
    });
  });

  it("UTC midnight に丸まる", () => {
    expect(clampDateToMonth(2026, 3, 15).toISOString()).toBe(
      "2026-04-15T00:00:00.000Z"
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// addMonths
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("addMonths", () => {
  describe("普通の case (day 維持)", () => {
    it("4/15 + 1 → 5/15", () => {
      expect(isoDate(addMonths(new Date(Date.UTC(2026, 3, 15)), 1))).toBe(
        "2026-05-15"
      );
    });

    it("4/15 - 1 → 3/15", () => {
      expect(isoDate(addMonths(new Date(Date.UTC(2026, 3, 15)), -1))).toBe(
        "2026-03-15"
      );
    });

    it("4/15 + 0 → 4/15 (no-op)", () => {
      expect(isoDate(addMonths(new Date(Date.UTC(2026, 3, 15)), 0))).toBe(
        "2026-04-15"
      );
    });
  });

  describe("年跨ぎ", () => {
    it("12/15 + 1 → 翌年 1/15", () => {
      expect(isoDate(addMonths(new Date(Date.UTC(2026, 11, 15)), 1))).toBe(
        "2027-01-15"
      );
    });

    it("1/15 - 1 → 前年 12/15", () => {
      expect(isoDate(addMonths(new Date(Date.UTC(2026, 0, 15)), -1))).toBe(
        "2025-12-15"
      );
    });

    it("4/15 + 12 → 翌年 4/15", () => {
      expect(isoDate(addMonths(new Date(Date.UTC(2026, 3, 15)), 12))).toBe(
        "2027-04-15"
      );
    });

    it("4/15 + 24 → 2 年後 4/15", () => {
      expect(isoDate(addMonths(new Date(Date.UTC(2026, 3, 15)), 24))).toBe(
        "2028-04-15"
      );
    });
  });

  describe("月末 clamp", () => {
    it("1/31 + 1 → 2/28 (2026 非閏年)", () => {
      expect(isoDate(addMonths(new Date(Date.UTC(2026, 0, 31)), 1))).toBe(
        "2026-02-28"
      );
    });

    it("1/31 + 1 → 2/29 (2028 閏年)", () => {
      expect(isoDate(addMonths(new Date(Date.UTC(2028, 0, 31)), 1))).toBe(
        "2028-02-29"
      );
    });

    it("5/31 + 1 → 6/30 (6 月は 30 日まで)", () => {
      expect(isoDate(addMonths(new Date(Date.UTC(2026, 4, 31)), 1))).toBe(
        "2026-06-30"
      );
    });

    it("3/31 - 1 → 2/28 (3 月から前月 = 2 月 clamp)", () => {
      expect(isoDate(addMonths(new Date(Date.UTC(2026, 2, 31)), -1))).toBe(
        "2026-02-28"
      );
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildWeekStrip
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildWeekStrip", () => {
  // 日本標準: Sun-Sat 7 日 (週始まり = 日曜)
  // 2026 年の参考: Apr 1 = Wed, Apr 12 = Sun, Apr 15 = Wed, Apr 18 = Sat
  // → Apr 15 (Wed) が含まれる週 = Apr 12 (Sun) ～ Apr 18 (Sat)

  describe("基本動作", () => {
    it("水曜 4/15 含む週 → 日-土 7 日 (4/12-4/18)", () => {
      const cells = buildWeekStrip(
        new Date(Date.UTC(2026, 3, 15)), // Wed 4/15
        new Date(Date.UTC(2026, 3, 1))   // April 2026
      );
      expect(cells).toHaveLength(7);
      expect(cells[0]!.iso).toBe("2026-04-12"); // Sunday
      expect(cells[6]!.iso).toBe("2026-04-18"); // Saturday
    });

    it("各 cell に date / iso / dayOfMonth / inCurrentMonth がある", () => {
      const cells = buildWeekStrip(
        new Date(Date.UTC(2026, 3, 15)),
        new Date(Date.UTC(2026, 3, 1))
      );
      const wed = cells[3]; // Wed = index 3 (Sun=0)
      expect(wed?.iso).toBe("2026-04-15");
      expect(wed?.dayOfMonth).toBe(15);
      expect(wed?.inCurrentMonth).toBe(true);
      expect(wed?.date).toBeInstanceOf(Date);
    });
  });

  describe("月跨ぎ inCurrentMonth flag", () => {
    // 2026/4/30 = Thu、5/1 = Fri、5/2 = Sat
    // → 4/26 (Sun) ～ 5/2 (Sat) が 1 週
    it("4/30 (Thu) 含む週 (4/26-5/2)、currentMonth=April なら 5/1-5/2 = false", () => {
      const cells = buildWeekStrip(
        new Date(Date.UTC(2026, 3, 30)), // Thu 4/30
        new Date(Date.UTC(2026, 3, 1))   // April 2026
      );
      expect(cells[0]!.iso).toBe("2026-04-26"); // Sun (April)
      expect(cells[4]!.iso).toBe("2026-04-30"); // Thu (April 末日)
      expect(cells[5]!.iso).toBe("2026-05-01"); // Fri (May)
      expect(cells[6]!.iso).toBe("2026-05-02"); // Sat (May)

      expect(cells[0]!.inCurrentMonth).toBe(true);  // 4/26
      expect(cells[4]!.inCurrentMonth).toBe(true);  // 4/30
      expect(cells[5]!.inCurrentMonth).toBe(false); // 5/1
      expect(cells[6]!.inCurrentMonth).toBe(false); // 5/2
    });

    it("5/1 (Fri) 含む週で currentMonth=May に変更すれば inCurrentMonth が反転", () => {
      const cells = buildWeekStrip(
        new Date(Date.UTC(2026, 4, 1)),  // Fri 5/1
        new Date(Date.UTC(2026, 4, 1))   // May 2026
      );
      expect(cells[0]!.iso).toBe("2026-04-26"); // Sun (April)
      expect(cells[5]!.iso).toBe("2026-05-01"); // Fri (May)
      expect(cells[0]!.inCurrentMonth).toBe(false); // 4/26 = April
      expect(cells[5]!.inCurrentMonth).toBe(true);  // 5/1 = May
    });
  });

  describe("年跨ぎ", () => {
    // 2026/12/31 = Thu、2027/1/1 = Fri、1/2 = Sat
    // → 2026/12/27 (Sun) ～ 2027/1/2 (Sat) が 1 週
    it("12/31 含む週で 1/x 部分は inCurrentMonth=false (currentMonth=December)", () => {
      const cells = buildWeekStrip(
        new Date(Date.UTC(2026, 11, 31)),
        new Date(Date.UTC(2026, 11, 1))
      );
      expect(cells[0]!.iso).toBe("2026-12-27"); // Sun
      expect(cells[4]!.iso).toBe("2026-12-31"); // Thu
      expect(cells[5]!.iso).toBe("2027-01-01"); // Fri
      expect(cells[6]!.iso).toBe("2027-01-02"); // Sat
      expect(cells[4]!.inCurrentMonth).toBe(true);
      expect(cells[5]!.inCurrentMonth).toBe(false);
    });
  });

  describe("曜日端の入力", () => {
    it("Sunday 入力 → cells[0] が自身 (4/12 Sun)", () => {
      const cells = buildWeekStrip(
        new Date(Date.UTC(2026, 3, 12)), // Sun 4/12
        new Date(Date.UTC(2026, 3, 1))
      );
      expect(cells[0]!.iso).toBe("2026-04-12");
      expect(cells[6]!.iso).toBe("2026-04-18");
    });

    it("Saturday 入力 → cells[6] が自身 (4/18 Sat)", () => {
      const cells = buildWeekStrip(
        new Date(Date.UTC(2026, 3, 18)), // Sat 4/18
        new Date(Date.UTC(2026, 3, 1))
      );
      expect(cells[0]!.iso).toBe("2026-04-12"); // Sun (前週から)
      expect(cells[6]!.iso).toBe("2026-04-18");
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// formatJpYearMonth
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatJpYearMonth", () => {
  it("4月 2026 (mock 整合)", () => {
    expect(formatJpYearMonth(new Date(Date.UTC(2026, 3, 15)))).toBe("4月 2026");
  });

  it("1月 2027 (1 桁月)", () => {
    expect(formatJpYearMonth(new Date(Date.UTC(2027, 0, 1)))).toBe("1月 2027");
  });

  it("12月 2026 (2 桁月)", () => {
    expect(formatJpYearMonth(new Date(Date.UTC(2026, 11, 1)))).toBe("12月 2026");
  });

  it("月初 / 月末で値が変わらない (月 + 年のみ依存)", () => {
    expect(formatJpYearMonth(new Date(Date.UTC(2026, 3, 1)))).toBe("4月 2026");
    expect(formatJpYearMonth(new Date(Date.UTC(2026, 3, 30)))).toBe("4月 2026");
  });
});
