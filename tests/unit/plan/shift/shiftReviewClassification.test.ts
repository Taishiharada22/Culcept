import { describe, it, expect } from "vitest";
import {
  computeEmptyDays,
  isBlankRisk,
  classifyPreSave,
  DEFAULT_LOW_CONFIDENCE_THRESHOLD,
  type ShiftReviewCell,
} from "@/lib/plan/shift/shiftReviewClassification";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";

const T = DEFAULT_LOW_CONFIDENCE_THRESHOLD;

describe("computeEmptyDays", () => {
  it("空欄（normalize 後 ''）の日番号を集める", () => {
    const cells: ShiftReviewCell[] = [
      { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
      { day: 2, date: "2025-07-02", rawCode: "", confidence: 1 },
      { day: 3, date: "2025-07-03", rawCode: "  ", confidence: 1 }, // 空白のみ → empty
    ];
    const empties = computeEmptyDays(cells);
    expect(empties.has(2)).toBe(true);
    expect(empties.has(3)).toBe(true);
    expect(empties.has(1)).toBe(false);
  });
});

describe("isBlankRisk", () => {
  const empties = new Set<number>([4]);
  it("低信頼は blank-risk", () => {
    expect(
      isBlankRisk({ day: 10, date: "d", rawCode: "N", confidence: 0.5 }, empties, T)
    ).toBe(true);
  });
  it("空欄の隣（前後）は blank-risk", () => {
    expect(
      isBlankRisk({ day: 3, date: "d", rawCode: "N", confidence: 1 }, empties, T)
    ).toBe(true); // day4 が空
    expect(
      isBlankRisk({ day: 5, date: "d", rawCode: "N", confidence: 1 }, empties, T)
    ).toBe(true); // day4 が空
  });
  it("高信頼かつ空欄非隣接は blank-risk でない", () => {
    expect(
      isBlankRisk({ day: 20, date: "d", rawCode: "N", confidence: 1 }, empties, T)
    ).toBe(false);
  });
});

describe("classifyPreSave", () => {
  it("未知コードは unresolvedDates、候補(HREQ)は止めない、空欄隣接は blankRiskDays", () => {
    const cells: ShiftReviewCell[] = [
      { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 }, // work
      { day: 2, date: "2025-07-02", rawCode: "HREQ", confidence: 1 }, // candidate（day3 空に隣接）
      { day: 3, date: "2025-07-03", rawCode: "", confidence: 1 }, // empty
      { day: 4, date: "2025-07-04", rawCode: "ZZ", confidence: 1 }, // unknown → unresolved（day3 空に隣接）
      { day: 10, date: "2025-07-10", rawCode: "G", confidence: 1 }, // work（非隣接・高信頼）
    ];
    const c = classifyPreSave(cells, HARADA_SPRIX_DICTIONARY, T);
    expect(c.unresolvedDates).toEqual(["2025-07-04"]);
    // candidate(HREQ) は unresolved に入らない（保存を止めない）
    expect(c.unresolvedDates).not.toContain("2025-07-02");
    // 空欄(day3)に隣接する day2/day4 が blank-risk
    expect(c.blankRiskDays).toContain(2);
    expect(c.blankRiskDays).toContain(4);
    // day10 は非隣接・高信頼 → blank-risk でない
    expect(c.blankRiskDays).not.toContain(10);
  });

  it("全て既知・高信頼・空欄なしなら unresolved も blank-risk も空", () => {
    const cells: ShiftReviewCell[] = [
      { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
      { day: 2, date: "2025-07-02", rawCode: "G", confidence: 1 },
    ];
    const c = classifyPreSave(cells, HARADA_SPRIX_DICTIONARY, T);
    expect(c.unresolvedDates).toEqual([]);
    expect(c.blankRiskDays).toEqual([]);
  });
});
