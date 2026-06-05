/**
 * SR B1b-2C-4-b — assistedDraftToShiftReviewCells の契約
 *
 * 不変条件:
 *   - dayNumber → date 変換が決定論
 *   - confidence default 0.8 で埋まる / 範囲外は clamp
 *   - 範囲外 day（<1, >daysInMonth）は drop（throw しない）
 *   - 重複 day は最初の出現を採用（rawCode を後処理で混ぜない）
 *   - 出力は day 昇順
 *   - rawCode は raw 保持（trim/normalize しない）
 *   - Blob / base64 / dataURL を含まない
 */
import { describe, it, expect } from "vitest";
import {
  assistedDraftToShiftReviewCells,
  DEFAULT_CONFIDENCE,
} from "@/lib/plan/shift/assistedDraftToShiftReviewCells";
import type { DayKeyedShiftCell } from "@/lib/plan/shift/shiftExtractionContract";

const META = { year: 2026, month: 6, daysInMonth: 30 };
const cell = (day: number, rawCode: string, confidence?: number | null): DayKeyedShiftCell => ({
  day, rawCode, rowLabel: "本人",
  ...(confidence === undefined ? {} : { confidence }),
});

describe("assistedDraftToShiftReviewCells", () => {
  it("dayNumber → date 変換（YYYY-MM-DD）", () => {
    const r = assistedDraftToShiftReviewCells([cell(1, "H"), cell(15, "N")], META);
    expect(r[0]).toMatchObject({ day: 1, date: "2026-06-01", rawCode: "H" });
    expect(r[1]).toMatchObject({ day: 15, date: "2026-06-15", rawCode: "N" });
  });

  it("月/日が 1 桁でも 0 padding", () => {
    const r = assistedDraftToShiftReviewCells(
      [cell(3, "H")],
      { year: 2026, month: 1, daysInMonth: 31 }
    );
    expect(r[0].date).toBe("2026-01-03");
  });

  it("DEFAULT_CONFIDENCE は 0.8（B1b-2B blank-risk 閾値 0.7 を soft 過剰発火させない値）", () => {
    expect(DEFAULT_CONFIDENCE).toBe(0.8);
    const r = assistedDraftToShiftReviewCells([cell(1, "H")], META);
    expect(r[0].confidence).toBe(0.8);
  });

  it("confidence 指定は保持", () => {
    const r = assistedDraftToShiftReviewCells([cell(1, "H", 0.95)], META);
    expect(r[0].confidence).toBe(0.95);
  });

  it("confidence が NaN/Infinity/負/>1 → 範囲外は default に丸める or clamp", () => {
    const r = assistedDraftToShiftReviewCells(
      [cell(1, "A", Number.NaN), cell(2, "B", Number.POSITIVE_INFINITY), cell(3, "C", -1), cell(4, "D", 5)],
      META
    );
    expect(r[0].confidence).toBe(DEFAULT_CONFIDENCE); // NaN → default
    expect(r[1].confidence).toBe(DEFAULT_CONFIDENCE); // Infinity は finite でない → default
    expect(r[2].confidence).toBe(0); // <0 → clamp
    expect(r[3].confidence).toBe(1); // >1 → clamp
  });

  it("範囲外 day（<1, >daysInMonth）は drop（throw しない）", () => {
    const r = assistedDraftToShiftReviewCells(
      [cell(0, "X"), cell(-1, "Y"), cell(31, "Z"), cell(1, "H"), cell(30, "L")],
      META
    );
    expect(r.map((c) => c.day)).toEqual([1, 30]);
  });

  it("重複 day は最初の出現を採用（後処理で混ぜない）", () => {
    const r = assistedDraftToShiftReviewCells(
      [cell(5, "H"), cell(5, "N")],
      META
    );
    expect(r).toHaveLength(1);
    expect(r[0].rawCode).toBe("H");
  });

  it("出力は day 昇順", () => {
    const r = assistedDraftToShiftReviewCells(
      [cell(15, "A"), cell(1, "B"), cell(7, "C")],
      META
    );
    expect(r.map((c) => c.day)).toEqual([1, 7, 15]);
  });

  it("rawCode は raw 保持（trim/normalize しない）", () => {
    const r = assistedDraftToShiftReviewCells(
      [cell(1, " e-18 "), cell(2, "HReq")],
      META
    );
    expect(r[0].rawCode).toBe(" e-18 ");
    expect(r[1].rawCode).toBe("HReq");
  });

  it("空配列 → 空配列（throw しない）", () => {
    expect(assistedDraftToShiftReviewCells([], META)).toEqual([]);
  });

  it("output に Blob / base64 / dataURL を含まない", () => {
    const r = assistedDraftToShiftReviewCells([cell(1, "H")], META);
    expect(JSON.stringify(r)).not.toMatch(/blob:|data:image|base64|Blob|dataUri/i);
  });

  it("整数でない day（小数）は drop", () => {
    const r = assistedDraftToShiftReviewCells([cell(1.5, "X"), cell(2, "H")], META);
    expect(r.map((c) => c.day)).toEqual([2]);
  });

  it("defaultConfidence option を上書きできる", () => {
    const r = assistedDraftToShiftReviewCells(
      [cell(1, "H")],
      META,
      { defaultConfidence: 0.5 }
    );
    expect(r[0].confidence).toBe(0.5);
  });

  // ── A2B-1: rowLabel carry-through ──
  it("rowLabel を carry（DayKeyed → ShiftReviewCell・review 専用 metadata）", () => {
    const r = assistedDraftToShiftReviewCells([cell(1, "H")], META); // cell() は rowLabel "本人"
    expect(r[0].rowLabel).toBe("本人");
  });

  it("rowLabel が空/空白 → carry しない（key 自体を持たない）", () => {
    const cells: DayKeyedShiftCell[] = [
      { day: 1, rawCode: "H", rowLabel: "" },
      { day: 2, rawCode: "N", rowLabel: "   " },
    ];
    const r = assistedDraftToShiftReviewCells(cells, META);
    expect(r[0]).not.toHaveProperty("rowLabel");
    expect(r[1]).not.toHaveProperty("rowLabel");
  });

  it("rowLabel missing でも変換は壊れない（day/date/rawCode/confidence は正常）", () => {
    const cells = [{ day: 1, rawCode: "H" } as unknown as DayKeyedShiftCell];
    const r = assistedDraftToShiftReviewCells(cells, META);
    expect(r[0]).toMatchObject({ day: 1, rawCode: "H", date: "2026-06-01", confidence: DEFAULT_CONFIDENCE });
    expect(r[0]).not.toHaveProperty("rowLabel");
  });
});
