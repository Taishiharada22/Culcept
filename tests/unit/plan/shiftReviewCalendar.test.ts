/**
 * shiftReviewCalendar — 曜日配置 fix の pure 固定
 *
 * 主目的（CEO 2026-06-04・正確性バグ）:
 *   欠け日があっても各日が **真の曜日列** に座ること（連番詰め回帰の防止）。
 */
import { describe, it, expect } from "vitest";
import {
  dayOfWeek,
  daysInMonth,
  buildShiftReviewWeeks,
  type ShiftReviewSlot,
} from "@/lib/plan/shift/shiftReviewCalendar";
import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";

function cell(
  year: number,
  month: number,
  day: number,
  rawCode = "G"
): ShiftReviewCell {
  return {
    day,
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    rawCode,
    confidence: 1,
  };
}

/** flatten した grid で「ある日」の通し index を返す（pad は除外で day 一致探索）。 */
function flatIndexOfDay(
  weeks: (ShiftReviewSlot | null)[][],
  day: number
): number {
  return weeks.flat().findIndex((s) => s !== null && s.day === day);
}

/** その日が座っている列（0=日..6=土）。 */
function columnOfDay(
  weeks: (ShiftReviewSlot | null)[][],
  day: number
): number {
  return flatIndexOfDay(weeks, day) % 7;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("dayOfWeek / daysInMonth（既知値）", () => {
  it("dayOfWeek 既知値（0=日..6=土）", () => {
    expect(dayOfWeek(2025, 7, 1)).toBe(2); // 2025-07-01 = 火
    expect(dayOfWeek(2025, 7, 3)).toBe(4); // 2025-07-03 = 木（GPT 例）
    expect(dayOfWeek(2025, 7, 4)).toBe(5); // 2025-07-04 = 金
    expect(dayOfWeek(2026, 6, 1)).toBe(1); // 2026-06-01 = 月
    expect(dayOfWeek(2026, 6, 3)).toBe(3); // 2026-06-03 = 水（smoke の day3）
    expect(dayOfWeek(2026, 6, 4)).toBe(4); // 2026-06-04 = 木
    expect(dayOfWeek(2026, 6, 5)).toBe(5); // 2026-06-05 = 金
  });

  it("daysInMonth（閏含む）", () => {
    expect(daysInMonth(2025, 7)).toBe(31);
    expect(daysInMonth(2026, 6)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28); // 平年
    expect(daysInMonth(2024, 2)).toBe(29); // 閏年
    expect(daysInMonth(2000, 2)).toBe(29); // 400 で割り切れる
    expect(daysInMonth(1900, 2)).toBe(28); // 100 で割り切れるが 400 で割れない
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("buildShiftReviewWeeks — ★欠け日があっても真の曜日列（バグ修正の核）", () => {
  // smoke 再現: 2026年6月、cells = day3/4/5 のみ（1,2 と 6 以降は欠け）。
  const sparse: ShiftReviewCell[] = [
    cell(2026, 6, 3, "E-18"),
    cell(2026, 6, 4, "H"),
    cell(2026, 6, 5, "HREQ"),
  ];
  const weeks = buildShiftReviewWeeks(sparse, 2026, 6);

  it("day3 は水曜列・day4 は木曜列・day5 は金曜列（真の曜日）", () => {
    expect(columnOfDay(weeks, 3)).toBe(dayOfWeek(2026, 6, 3)); // 水(3)
    expect(columnOfDay(weeks, 4)).toBe(dayOfWeek(2026, 6, 4)); // 木(4)
    expect(columnOfDay(weeks, 5)).toBe(dayOfWeek(2026, 6, 5)); // 金(5)
  });

  it("連番詰めの旧バグ（月/火/水へ 2 列ズレ）には戻らない", () => {
    // 旧実装は day3 を「先頭 pad 直後」= 月(1) に置いていた。回帰防止で明示固定。
    expect(columnOfDay(weeks, 3)).toBe(3); // 水（1=月 ではない）
    expect(columnOfDay(weeks, 4)).toBe(4); // 木
    expect(columnOfDay(weeks, 5)).toBe(5); // 金
    expect(columnOfDay(weeks, 3)).not.toBe(1);
  });

  it("欠け日（1,2,6...）は当月スロットとして存在し cell=null", () => {
    const flat = weeks.flat();
    const day1 = flat.find((s) => s !== null && s.day === 1);
    const day2 = flat.find((s) => s !== null && s.day === 2);
    const day6 = flat.find((s) => s !== null && s.day === 6);
    expect(day1).toBeDefined();
    expect(day1?.cell).toBeNull();
    expect(day2?.cell).toBeNull();
    expect(day6?.cell).toBeNull();
  });

  it("抽出セルのある日は cell を保持（rawCode 一致）", () => {
    const flat = weeks.flat();
    expect(flat.find((s) => s !== null && s.day === 3)?.cell?.rawCode).toBe("E-18");
    expect(flat.find((s) => s !== null && s.day === 4)?.cell?.rawCode).toBe("H");
    expect(flat.find((s) => s !== null && s.day === 5)?.cell?.rawCode).toBe("HREQ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("buildShiftReviewWeeks — 構造の不変条件", () => {
  it("先頭 pad は firstDow 個 null（前月分）", () => {
    const weeks = buildShiftReviewWeeks([], 2026, 6); // 6/1=月 → firstDow=1
    const flat = weeks.flat();
    expect(flat[0]).toBeNull(); // 日曜 pad
    expect(flat[1]).not.toBeNull(); // 1 日（月曜）
    expect((flat[1] as ShiftReviewSlot).day).toBe(1);
  });

  it("当月全日（1..daysInMonth）がスロット化される", () => {
    const weeks = buildShiftReviewWeeks([], 2026, 6);
    const days = weeks
      .flat()
      .filter((s): s is ShiftReviewSlot => s !== null)
      .map((s) => s.day);
    expect(days).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("各週は 7 要素", () => {
    const weeks = buildShiftReviewWeeks([], 2026, 6);
    for (const w of weeks) expect(w.length).toBe(7);
  });

  it("連続入力（1..7）は旧連番詰めと同じ配置＝既存 contract を壊さない", () => {
    // 2025年7月: 7/1=火(firstDow=2)。1..7 連続なので連番詰めと真曜日配置は一致。
    const contiguous = Array.from({ length: 7 }, (_, i) => cell(2025, 7, i + 1));
    const weeks = buildShiftReviewWeeks(contiguous, 2025, 7);
    for (let d = 1; d <= 7; d += 1) {
      expect(columnOfDay(weeks, d)).toBe(dayOfWeek(2025, 7, d));
    }
    // day1 は火(2)、day7 は月(1)（翌週頭）
    expect(columnOfDay(weeks, 1)).toBe(2);
    expect(columnOfDay(weeks, 7)).toBe(1);
  });

  it("範囲外 day の cell は無視（防御）", () => {
    const weeks = buildShiftReviewWeeks(
      [cell(2026, 6, 0, "X"), cell(2026, 6, 31, "Y"), cell(2026, 6, 10, "G")],
      2026,
      6
    );
    const flat = weeks.flat().filter((s): s is ShiftReviewSlot => s !== null);
    expect(flat.some((s) => s.day === 10 && s.cell?.rawCode === "G")).toBe(true);
    // day 0 / 31 は配置先が無い（当月外）
    expect(flat.some((s) => s.cell?.rawCode === "X")).toBe(false);
    expect(flat.some((s) => s.cell?.rawCode === "Y")).toBe(false);
  });
});
