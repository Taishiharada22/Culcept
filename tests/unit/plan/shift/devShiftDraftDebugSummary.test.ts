/**
 * SR B1b-2C-9-FIX — devShiftDraftDebugSummary（pure・safe）
 *
 * 不変条件:
 *   ① computeChunkRanges: [15],31 → [[1,15],[16,31]] / [] → [[1,n]] / 範囲外境界は無視
 *   ② buildDevShiftDraftDebugSummary: 座標・寸法・件数を素通し
 *   ③ crops 未指定 → null（crop_review 前は寸法不明）
 *   ④ cells 未指定 → cellsCount/blankCount = null、指定 → 件数 + blank（空 rawCode）
 *   ⑤ 出力に raw / base64 / dataURL / key / userid が**構造的に存在しない**（key set 固定）
 */
import { describe, it, expect } from "vitest";

import {
  buildDevShiftDraftDebugSummary,
  computeChunkRanges,
} from "@/lib/plan/shift/devShiftDraftDebugSummary";
import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";

describe("computeChunkRanges", () => {
  it("[15], 31 → [[1,15],[16,31]]", () => {
    expect(computeChunkRanges(31, [15])).toEqual([
      { from: 1, to: 15 },
      { from: 16, to: 31 },
    ]);
  });
  it("[], 30 → [[1,30]]", () => {
    expect(computeChunkRanges(30, [])).toEqual([{ from: 1, to: 30 }]);
  });
  it("範囲外の境界は無視（0 / daysInMonth は除外）", () => {
    expect(computeChunkRanges(28, [0, 28, 14])).toEqual([
      { from: 1, to: 14 },
      { from: 15, to: 28 },
    ]);
  });
  it("daysInMonth < 1 → []", () => {
    expect(computeChunkRanges(0, [15])).toEqual([]);
  });
});

const BASE = {
  imageW: 1860,
  imageH: 846,
  year: 2025,
  month: 7,
  daysInMonth: 31,
  headerBand: { top: 40, bottom: 80 },
  personRowBand: { top: 120, bottom: 180 },
  chunkBoundaries: [15],
};

describe("buildDevShiftDraftDebugSummary", () => {
  it("座標・寸法・chunk を素通し（crops 無し → null）", () => {
    const s = buildDevShiftDraftDebugSummary(BASE);
    expect(s.imageW).toBe(1860);
    expect(s.targetYear).toBe(2025);
    expect(s.targetMonth).toBe(7);
    expect(s.daysInMonth).toBe(31);
    expect(s.headerBandTop).toBe(40);
    expect(s.personRowBandBottom).toBe(180);
    expect(s.headerCrop).toBeNull();
    expect(s.personRowCrop).toBeNull();
    expect(s.combinedCrop).toBeNull();
    expect(s.chunkRanges).toEqual([
      { from: 1, to: 15 },
      { from: 16, to: 31 },
    ]);
    expect(s.model).toBeNull();
    expect(s.elapsedMs).toBeNull();
    expect(s.cellsCount).toBeNull();
    expect(s.blankCount).toBeNull();
  });

  it("crops 指定 → 寸法を保持", () => {
    const s = buildDevShiftDraftDebugSummary({
      ...BASE,
      crops: {
        header: { width: 1860, height: 40, sizeBytes: 1000 },
        personRow: { width: 1860, height: 60, sizeBytes: 1500 },
        combined: { width: 1860, height: 100, sizeBytes: 2400 },
      },
    });
    expect(s.headerCrop).toEqual({ width: 1860, height: 40, sizeBytes: 1000 });
    expect(s.combinedCrop?.height).toBe(100);
  });

  it("cells 指定 → cellsCount + blankCount（空 rawCode が blank）", () => {
    const cells: ShiftReviewCell[] = [
      { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
      { day: 2, date: "2025-07-02", rawCode: "", confidence: 1 }, // blank
      { day: 3, date: "2025-07-03", rawCode: "  ", confidence: 1 }, // blank（空白のみ）
      { day: 4, date: "2025-07-04", rawCode: "H", confidence: 1 },
    ];
    const s = buildDevShiftDraftDebugSummary({ ...BASE, cells, model: "gemini-x", elapsedMs: 1234 });
    expect(s.cellsCount).toBe(4);
    expect(s.blankCount).toBe(2);
    expect(s.model).toBe("gemini-x");
    expect(s.elapsedMs).toBe(1234);
  });

  it("出力 key set が固定（raw / base64 / key / userid が構造的に存在しない）", () => {
    const s = buildDevShiftDraftDebugSummary(BASE);
    expect(Object.keys(s).sort()).toEqual(
      [
        "blankCount",
        "cellsCount",
        "chunkRanges",
        "combinedCrop",
        "daysInMonth",
        "elapsedMs",
        "headerBandBottom",
        "headerBandTop",
        "headerCrop",
        "imageH",
        "imageW",
        "model",
        "personRowBandBottom",
        "personRowBandTop",
        "personRowCrop",
        "targetMonth",
        "targetYear",
      ].sort()
    );
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/base64|data:image|blob:|apikey|api_key|userid|user_id/i);
  });
});
