/**
 * Plan CalendarTab Month Grid — pure model tests (Phase 2-A+ M1)
 *
 * `app/(culcept)/plan/tabs/_monthGrid.ts` を deterministic に検証。
 * 設計: Plan 月ビュー mini design（2026-06-03 CEO chat 承認、M1）。
 *
 * CEO 必須検証項目:
 *   - 6 行 × 7 列 = 42 cells
 *   - 2025 年 6 月 / 2025 年 7 月
 *   - 2 月通常年 / 2 月閏年
 *   - 月初が日曜の月 / 月初が土曜の月
 *   - 月末 leading / trailing
 *   - selectedDate が月末超過 → clamp
 *   - date key が既存 anchors / dayIndicators と一致する形式（isoDate "YYYY-MM-DD"）
 *
 * 曜日事実（UTC・検証済）:
 *   - 2025-06-01 = 日曜（月初が日曜）/ 2025-07-01 = 火曜（dow=2）
 *   - 2025-02-01 = 土曜（月初が土曜・末日 28）/ 2028-02-01 = 火曜（末日 29、閏年）
 */
import { describe, it, expect } from "vitest";

import {
  buildMonthGrid,
  clampSelectedDateToMonth,
  MONTH_GRID_CELLS,
  MONTH_GRID_ROWS,
  DAYS_PER_WEEK,
} from "@/app/(culcept)/plan/tabs/_monthGrid";
import { isoDate } from "@/app/(culcept)/plan/tabs/_helpers";

/** UTC midnight Date を組む short helper */
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 構造: 6 × 7 = 42 cells（固定）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMonthGrid — 構造（6×7 = 42 cells）", () => {
  it("定数: MONTH_GRID_CELLS=42 / ROWS=6 / DAYS_PER_WEEK=7", () => {
    expect(MONTH_GRID_CELLS).toBe(42);
    expect(MONTH_GRID_ROWS).toBe(6);
    expect(DAYS_PER_WEEK).toBe(7);
  });

  it("常に 42 cell / 6 週 / 各週 7 cell", () => {
    const g = buildMonthGrid(utc(2025, 5, 1)); // June 2025
    expect(g.cells).toHaveLength(42);
    expect(g.weeks).toHaveLength(6);
    for (const w of g.weeks) expect(w).toHaveLength(7);
  });

  it("weeks は cells を 7 ずつ分割した同一参照（コピーでない）", () => {
    const g = buildMonthGrid(utc(2025, 5, 1));
    expect(g.weeks.flat()).toEqual(g.cells);
    expect(g.weeks[0][0]).toBe(g.cells[0]); // 同一参照
    expect(g.weeks[5][6]).toBe(g.cells[41]);
  });

  it("monthAnchor は月内の任意の日でよい（getMonthStart 正規化）", () => {
    const fromFirst = buildMonthGrid(utc(2025, 5, 1));
    const fromMid = buildMonthGrid(utc(2025, 5, 23));
    expect(fromMid.cells.map((c) => c.iso)).toEqual(
      fromFirst.cells.map((c) => c.iso)
    );
    expect(fromMid.year).toBe(2025);
    expect(fromMid.month).toBe(5); // 0-indexed June
    expect(isoDate(fromMid.monthStart)).toBe("2025-06-01");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2025 年 6 月（月初が日曜 → leading 0）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMonthGrid — 2025 年 6 月（月初が日曜）", () => {
  const g = buildMonthGrid(utc(2025, 5, 1));

  it("6/1 は日曜 → leading なし、cells[0] = 6/1（当月）", () => {
    expect(g.cells[0].iso).toBe("2025-06-01");
    expect(g.cells[0].inCurrentMonth).toBe(true);
    expect(g.cells[0].dayOfMonth).toBe(1);
  });

  it("末尾 trailing は翌月 7/12 まで（42 cell 充填）", () => {
    expect(g.cells[41].iso).toBe("2025-07-12");
    expect(g.cells[41].inCurrentMonth).toBe(false);
  });

  it("末日 30 / 当月 cell 数 = 30", () => {
    expect(g.lastDayOfMonth).toBe(30);
    expect(g.cells.filter((c) => c.inCurrentMonth)).toHaveLength(30);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2025 年 7 月（月初が火曜 → leading 2 日）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMonthGrid — 2025 年 7 月（月初が火曜）", () => {
  const g = buildMonthGrid(utc(2025, 6, 1));

  it("leading 2 日（6/29, 6/30）、cells[0]=6/29（前月）", () => {
    expect(g.cells[0].iso).toBe("2025-06-29");
    expect(g.cells[0].inCurrentMonth).toBe(false);
    expect(g.cells[1].iso).toBe("2025-06-30");
    expect(g.cells[1].inCurrentMonth).toBe(false);
  });

  it("cells[2] = 7/1（当月の最初、dow=2 = 火曜位置）", () => {
    expect(g.cells[2].iso).toBe("2025-07-01");
    expect(g.cells[2].inCurrentMonth).toBe(true);
    expect(g.cells[2].dayOfMonth).toBe(1);
  });

  it("末尾 trailing 8/9 まで / 末日 31", () => {
    expect(g.cells[41].iso).toBe("2025-08-09");
    expect(g.cells[41].inCurrentMonth).toBe(false);
    expect(g.lastDayOfMonth).toBe(31);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2 月: 通常年（28）/ 閏年（29）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMonthGrid — 2 月通常年（2025）/ 閏年（2028）", () => {
  it("2025 年 2 月 = 28 日（非閏年）", () => {
    const g = buildMonthGrid(utc(2025, 1, 1));
    expect(g.lastDayOfMonth).toBe(28);
    expect(g.cells.filter((c) => c.inCurrentMonth)).toHaveLength(28);
    const feb28 = g.cells.find((c) => c.iso === "2025-02-28");
    expect(feb28?.inCurrentMonth).toBe(true);
    // 2/29 は存在しない（非閏年）
    expect(g.cells.some((c) => c.iso === "2025-02-29")).toBe(false);
  });

  it("2028 年 2 月 = 29 日（閏年）", () => {
    const g = buildMonthGrid(utc(2028, 1, 1));
    expect(g.lastDayOfMonth).toBe(29);
    expect(g.cells.filter((c) => c.inCurrentMonth)).toHaveLength(29);
    const feb29 = g.cells.find((c) => c.iso === "2028-02-29");
    expect(feb29?.inCurrentMonth).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 月初が土曜の月（2025 年 2 月、2/1 = 土 → leading 6 日）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMonthGrid — 月初が土曜の月（2025 年 2 月）", () => {
  const g = buildMonthGrid(utc(2025, 1, 1));

  it("leading 6 日（1/26〜1/31）、cells[6] = 2/1", () => {
    expect(g.cells[0].iso).toBe("2025-01-26");
    for (let i = 0; i < 6; i++) {
      expect(g.cells[i].inCurrentMonth).toBe(false);
    }
    expect(g.cells[6].iso).toBe("2025-02-01");
    expect(g.cells[6].inCurrentMonth).toBe(true);
    expect(g.cells[6].dayOfMonth).toBe(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// leading / trailing の月所属
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMonthGrid — leading / trailing の月所属", () => {
  it("leading は前月・trailing は翌月・inCurrentMonth=false（2025/7）", () => {
    const g = buildMonthGrid(utc(2025, 6, 1)); // July
    // leading（6/29, 6/30）は前月 = 6 月（getUTCMonth 5）
    expect(g.cells[0].date.getUTCMonth()).toBe(5);
    expect(g.cells[1].date.getUTCMonth()).toBe(5);
    // trailing（monthStart より後の非当月）は翌月 = 8 月（getUTCMonth 7）
    const trailing = g.cells.filter(
      (c) => !c.inCurrentMonth && c.date > g.monthStart
    );
    expect(trailing.length).toBeGreaterThan(0);
    expect(trailing.every((c) => c.date.getUTCMonth() === 7)).toBe(true);
    // 非当月 cell 数 = 42 - 31（7 月日数）
    expect(g.cells.filter((c) => !c.inCurrentMonth)).toHaveLength(42 - 31);
  });

  it("cell 列は連続 1 日刻み（gap なし・重複なし）", () => {
    const g = buildMonthGrid(utc(2025, 5, 1));
    for (let i = 1; i < g.cells.length; i++) {
      const prev = g.cells[i - 1].date.getTime();
      const cur = g.cells[i].date.getTime();
      expect(cur - prev).toBe(24 * 60 * 60 * 1000); // 厳密 1 日
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// clampSelectedDateToMonth — 月末超過 clamp
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("clampSelectedDateToMonth — 月末超過 clamp", () => {
  it("1/31 → 2 月（2025 非閏年）= 2/28", () => {
    const r = clampSelectedDateToMonth(utc(2025, 0, 31), utc(2025, 1, 15));
    expect(isoDate(r)).toBe("2025-02-28");
  });

  it("1/31 → 2 月（2028 閏年）= 2/29", () => {
    const r = clampSelectedDateToMonth(utc(2028, 0, 31), utc(2028, 1, 10));
    expect(isoDate(r)).toBe("2028-02-29");
  });

  it("同日が存在する月はそのまま（1/15 → 2/15）", () => {
    const r = clampSelectedDateToMonth(utc(2025, 0, 15), utc(2025, 1, 1));
    expect(isoDate(r)).toBe("2025-02-15");
  });

  it("targetMonthAnchor は月内任意の日でよい（2/27 でも 2 月扱い）", () => {
    const r = clampSelectedDateToMonth(utc(2025, 0, 31), utc(2025, 1, 27));
    expect(isoDate(r)).toBe("2025-02-28");
  });

  it("31 日月 → 31 日月はそのまま（1/31 → 3/31）", () => {
    const r = clampSelectedDateToMonth(utc(2025, 0, 31), utc(2025, 2, 5));
    expect(isoDate(r)).toBe("2025-03-31");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// date key 形式（既存 anchors / dayIndicators と一致）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMonthGrid — date key 形式（anchors / dayIndicators 整合）", () => {
  it("全 cell.iso が YYYY-MM-DD 形式", () => {
    const g = buildMonthGrid(utc(2025, 5, 1));
    for (const c of g.cells) {
      expect(c.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("cell.iso === isoDate(cell.date)（共通 helper と完全一致）", () => {
    const g = buildMonthGrid(utc(2025, 5, 1));
    for (const c of g.cells) {
      expect(c.iso).toBe(isoDate(c.date));
    }
  });

  it("既知日の key が一致（6/15 → 2025-06-15、当月）", () => {
    const g = buildMonthGrid(utc(2025, 5, 1));
    const c = g.cells.find((x) => x.iso === "2025-06-15");
    expect(c).toBeDefined();
    expect(c!.inCurrentMonth).toBe(true);
    expect(c!.dayOfMonth).toBe(15);
  });
});
