import { describe, it, expect } from "vitest";
import { scoreExtraction } from "@/lib/plan/shift/shiftExtractionScoring";
import type { ExtractedShiftCell } from "@/lib/plan/shift/shiftExtractionContract";
import { JULY_HARADA_CODES } from "./julyHaradaGolden";
import { APRIL_HARADA_CODES } from "./shiftMonthGoldens";

// July 原田行 golden（単一正本・CEO 原本確認済、day25 空欄）
const JULY_CODES = [...JULY_HARADA_CODES];

function buildCells(codes: string[]): ExtractedShiftCell[] {
  return codes.map((rawCode, i) => ({
    date: `2025-07-${String(i + 1).padStart(2, "0")}`,
    rawCode,
    rowLabel: "原田 大志",
  }));
}

const golden = buildCells(JULY_CODES);

describe("scoreExtraction — 完全一致", () => {
  it("golden 自身は 100% + 全チェック ok", () => {
    const s = scoreExtraction(golden, golden);
    expect(s.totalGoldenCells).toBe(31);
    expect(s.matchedCells).toBe(31);
    expect(s.cellAccuracy).toBe(1);
    expect(s.mismatches).toHaveLength(0);
    expect(s.publicHoliday).toEqual({ expected: 8, got: 8, match: true });
    expect(s.nightShift.ok).toBe(true);
    expect(s.nightShift.expectedDates).toHaveLength(4); // N は 4 日
    expect(s.e18.ok).toBe(true);
    expect(s.e18.expected).toBe(3); // E-18 は 3 日
  });
});

describe("scoreExtraction — 誤読の検出", () => {
  // 2 セル誤読: 4日 E-18→E（E-18 取り違え） / 6日 N→H（夜勤を公休と誤読）
  const wrong = buildCells(JULY_CODES.map((c, i) => {
    if (i === 3) return "E"; // 4日: E-18 → E
    if (i === 5) return "H"; // 6日: N → H
    return c;
  }));

  it("cellAccuracy が下がり mismatch を 2 件挙げる", () => {
    const s = scoreExtraction(wrong, golden);
    expect(s.matchedCells).toBe(29);
    expect(s.mismatches).toHaveLength(2);
    const dates = s.mismatches.map((m) => m.date).sort();
    expect(dates).toEqual(["2025-07-04", "2025-07-06"]);
  });

  it("H 個数ズレを検出（8→9、N を H と誤読したため）", () => {
    const s = scoreExtraction(wrong, golden);
    expect(s.publicHoliday).toEqual({ expected: 8, got: 9, match: false });
  });

  it("N 日跨ぎの取りこぼしを検出", () => {
    const s = scoreExtraction(wrong, golden);
    expect(s.nightShift.correct).toBe(3); // 4 日中 1 日落とした
    expect(s.nightShift.ok).toBe(false);
  });

  it("E-18 識別ミスを検出（E に縮めた）", () => {
    const s = scoreExtraction(wrong, golden);
    expect(s.e18.correct).toBe(2); // 3 日中 1 日落とした
    expect(s.e18.ok).toBe(false);
  });
});

describe("scoreExtraction — E を E-18 と誤読（false positive）", () => {
  const wrong = buildCells(JULY_CODES.map((c, i) => (i === 12 ? "E-18" : c))); // 13日: E → E-18

  it("e18 falsePositive を検出", () => {
    const s = scoreExtraction(wrong, golden);
    expect(s.e18.falsePositive).toBe(1);
    expect(s.e18.ok).toBe(false);
  });
});

describe("scoreExtraction — セル欠落", () => {
  it("抽出に無い日付は mismatch(got=null)", () => {
    const partial = golden.slice(0, 30); // 31日を欠落
    const s = scoreExtraction(partial, golden);
    expect(s.matchedCells).toBe(30);
    const miss = s.mismatches.find((m) => m.date === "2025-07-31");
    expect(miss?.got).toBeNull();
  });
});

describe("scoreExtraction — 空セル誤読（GPT B1a 指標）", () => {
  it("July golden は day25 が空欄（expectedEmpty=1・ok）", () => {
    const s = scoreExtraction(golden, golden);
    expect(s.emptyCell).toEqual({
      expectedEmpty: 1, // CEO 原本確認: day25 は空欄
      falseContent: 0,
      missedContent: 0,
      ok: true,
    });
  });

  // 空セルを含む合成 golden（3日 / 5日 が空）
  const emptyGolden = buildCells(["G", "", "N", "", "L"]);

  it("空セルを正しく空と読めば ok", () => {
    const s = scoreExtraction(emptyGolden, emptyGolden);
    expect(s.emptyCell.expectedEmpty).toBe(2);
    expect(s.emptyCell.ok).toBe(true);
  });

  it("空セルに何か読む幻覚を検出（falseContent）", () => {
    const halluc = buildCells(["G", "H", "N", "", "L"]); // 2日目: 空→H
    const s = scoreExtraction(halluc, emptyGolden);
    expect(s.emptyCell.falseContent).toBe(1);
    expect(s.emptyCell.ok).toBe(false);
  });

  it("記号セルを空と読む取りこぼしを検出（missedContent）", () => {
    const dropped = buildCells(["G", "", "", "", "L"]); // 3日目: N→空
    const s = scoreExtraction(dropped, emptyGolden);
    expect(s.emptyCell.missedContent).toBe(1);
    expect(s.emptyCell.ok).toBe(false);
  });
});

describe("scoreExtraction — blankSkipShift（GPT B1a-v3 指標）", () => {
  it("完全一致は ok（空も正読）", () => {
    const g = buildCells(["G", "", "N", "L"]);
    const s = scoreExtraction(g, g);
    expect(s.blankSkipShift.ok).toBe(true);
    expect(s.blankSkipShift.expectedBlanks).toBe(1);
    expect(s.blankSkipShift.blanksReadCorrectly).toBe(1);
  });

  it("空を飛ばして前詰めした shift を検出（blanksMissed + pullForward）", () => {
    const golden = buildCells(["G", "", "N", "L"]); // 2日目=空
    const shifted = buildCells(["G", "N", "L", ""]); // 空を飛ばし前詰め
    const s = scoreExtraction(shifted, golden);
    expect(s.blankSkipShift.blanksMissed).toBe(1); // 2日目の空を埋めた
    expect(s.blankSkipShift.pullForwardMismatches).toBeGreaterThanOrEqual(1);
    expect(s.blankSkipShift.detected).toBe(true);
    expect(s.blankSkipShift.ok).toBe(false);
  });

  it("実 April の blank-skip を検出（model 25=G で 25日空を埋めた）", () => {
    // B1a-v2 実走の April 抽出（25日空を G で埋め以降 shift）
    const modelApril = buildCells([
      "L", "E", "N", "BD", "HREQ", "H", "E-18", "L", "N", "L",
      "G", "H", "H", "L", "L", "E", "N", "BD", "H", "H",
      "E-18", "L", "N", "L", "G", "H", "H", "L", "L", "",
    ]);
    const golden = buildCells([...APRIL_HARADA_CODES]);
    const s = scoreExtraction(modelApril, golden);
    expect(s.blankSkipShift.blanksMissed).toBe(1); // 25日空を G で埋めた
    expect(s.blankSkipShift.detected).toBe(true);
    expect(s.cellAccuracy).toBeCloseTo(27 / 30, 2); // 90%
  });
});
