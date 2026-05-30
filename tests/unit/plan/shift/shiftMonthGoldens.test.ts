import { describe, it, expect } from "vitest";
import { SHIFT_MONTH_GOLDENS } from "./shiftMonthGoldens";
import { normalizeRawCode } from "@/lib/plan/shift/shiftCodeDictionary";

const KNOWN = new Set(
  ["H", "HREQ", "E", "E-18", "N", "L", "G", "BD"].map(normalizeRawCode)
);

describe("SHIFT_MONTH_GOLDENS（CEO 原本適正済）", () => {
  it("各月の長さが daysInMonth と一致", () => {
    for (const g of SHIFT_MONTH_GOLDENS) {
      expect(g.codes).toHaveLength(g.daysInMonth);
    }
  });

  it("コードは既知 8 種 or 空欄のみ", () => {
    for (const g of SHIFT_MONTH_GOLDENS) {
      for (const c of g.codes) {
        if (c === "") continue;
        expect(KNOWN.has(normalizeRawCode(c))).toBe(true);
      }
    }
  });

  it("空欄の位置が CEO 適正と一致（blank-skip の対象日）", () => {
    function blanks(name: string): number[] {
      const g = SHIFT_MONTH_GOLDENS.find((x) => x.name === name)!;
      return g.codes
        .map((c, i) => (c === "" ? i + 1 : -1))
        .filter((d) => d > 0);
    }
    expect(blanks("march")).toEqual([]); // 空欄なし → 100%
    expect(blanks("april")).toEqual([25, 30]);
    expect(blanks("may")).toEqual([28]);
    expect(blanks("june")).toEqual([25]);
    expect(blanks("july")).toEqual([25]);
  });
});
