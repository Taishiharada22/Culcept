/**
 * SR B1b-1 — シフト抽出 月次レポート（pure）の採点契約
 *
 * VLM は実行しない。VLM 出力を **mock / fixture（golden 由来）** で受け、
 * 採点ロジック（5ヶ月集約 / coverage / blank-skip / invalid code / code 識別）を固定する。
 */
import { describe, it, expect } from "vitest";
import {
  monthGoldenToExtracted,
  scoreMonthExtraction,
  scoreMultiMonthExtraction,
  TRACKED_CODES,
  DEFAULT_GOLDEN_YEAR,
  type MonthGoldenInput,
  type MonthExtractionInput,
} from "@/lib/plan/shift/shiftExtractionMonthlyReport";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";
import type { ExtractedShiftCell } from "@/lib/plan/shift/shiftExtractionContract";
import { SHIFT_MONTH_GOLDENS } from "./shiftMonthGoldens";

// mock VLM = perfect 抽出（golden をそのまま date-keyed 化）
function perfect(golden: MonthGoldenInput): ExtractedShiftCell[] {
  return monthGoldenToExtracted(golden, DEFAULT_GOLDEN_YEAR);
}
const clone = (cells: ExtractedShiftCell[]): ExtractedShiftCell[] =>
  cells.map((c) => ({ ...c }));

const MARCH = SHIFT_MONTH_GOLDENS[0]; // 空セルなし
const APRIL = SHIFT_MONTH_GOLDENS[1];
const MAY = SHIFT_MONTH_GOLDENS[2]; // 28=空欄あり

describe("monthGoldenToExtracted", () => {
  it("codes を 1 日始まりの date 付き ExtractedShiftCell[] にする", () => {
    const g: MonthGoldenInput = {
      name: "t",
      month: 3,
      daysInMonth: 3,
      codes: ["H", "", "N"],
    };
    const e = monthGoldenToExtracted(g, 2025);
    expect(e.map((c) => c.date)).toEqual([
      "2025-03-01",
      "2025-03-02",
      "2025-03-03",
    ]);
    expect(e.map((c) => c.rawCode)).toEqual(["H", "", "N"]);
  });
});

describe("scoreMonthExtraction — 完全抽出（mock perfect）", () => {
  it("cellAccuracy 1 / 全 code ok / invalid 0 / coverage ok / blankSkip ok / pass", () => {
    const r = scoreMonthExtraction(perfect(MARCH), MARCH, HARADA_SPRIX_DICTIONARY);
    expect(r.score.cellAccuracy).toBe(1);
    expect(r.invalidCodes).toHaveLength(0);
    expect(r.coverage.ok).toBe(true);
    expect(r.score.blankSkipShift.ok).toBe(true);
    expect(r.codeIdentification.every((c) => c.ok)).toBe(true);
    expect(r.pass).toBe(true);
  });

  it("空欄ありの月（may）でも perfect なら blankSkip ok / pass", () => {
    const r = scoreMonthExtraction(perfect(MAY), MAY, HARADA_SPRIX_DICTIONARY);
    expect(r.score.blankSkipShift.expectedBlanks).toBeGreaterThanOrEqual(1);
    expect(r.score.blankSkipShift.ok).toBe(true);
    expect(r.pass).toBe(true);
  });
});

describe("scoreMonthExtraction — 劣化検出（mock degraded）", () => {
  it("辞書外コード → invalidCodes + pass false", () => {
    const e = clone(perfect(MAY));
    e[0] = { ...e[0], rawCode: "XX" };
    const r = scoreMonthExtraction(e, MAY, HARADA_SPRIX_DICTIONARY);
    expect(r.invalidCodes.map((i) => i.rawCode)).toContain("XX");
    expect(r.pass).toBe(false);
  });

  it("空セルは invalid 扱いしない", () => {
    const r = scoreMonthExtraction(perfect(MAY), MAY, HARADA_SPRIX_DICTIONARY);
    // may は空セルを含むが invalidCodes は 0
    expect(r.invalidCodes).toHaveLength(0);
  });

  it("E→E-18 誤読 → e18 falsePositive + code 識別 ok=false", () => {
    const e = clone(perfect(MAY));
    const eIdx = MAY.codes.findIndex((c) => c === "E");
    e[eIdx] = { ...e[eIdx], rawCode: "E-18" };
    const r = scoreMonthExtraction(e, MAY, HARADA_SPRIX_DICTIONARY);
    const e18 = r.codeIdentification.find((c) => c.code === "E-18");
    expect(e18?.falsePositive).toBeGreaterThanOrEqual(1);
    expect(e18?.ok).toBe(false);
  });

  it("blank-skip（空を翌日コードで埋める）→ blankSkipShift.detected + pass false", () => {
    const e = clone(perfect(MAY));
    const blankIdx = MAY.codes.findIndex((c) => c === "");
    e[blankIdx] = { ...e[blankIdx], rawCode: MAY.codes[blankIdx + 1] };
    const r = scoreMonthExtraction(e, MAY, HARADA_SPRIX_DICTIONARY);
    expect(r.score.blankSkipShift.blanksMissed).toBeGreaterThanOrEqual(1);
    expect(r.score.blankSkipShift.detected).toBe(true);
    expect(r.pass).toBe(false);
  });

  it("欠落日 → coverage.missingDays + pass false", () => {
    const e = clone(perfect(MAY)).filter((_, i) => i !== 4); // 5 日目を落とす
    const r = scoreMonthExtraction(e, MAY, HARADA_SPRIX_DICTIONARY);
    expect(r.coverage.missingDays).toContain(5);
    expect(r.coverage.ok).toBe(false);
    expect(r.pass).toBe(false);
  });

  it("重複日 → coverage.duplicateDays + ok=false", () => {
    const e = clone(perfect(MAY));
    e.push({ ...e[0] }); // 1 日目を重複
    const r = scoreMonthExtraction(e, MAY, HARADA_SPRIX_DICTIONARY);
    expect(r.coverage.duplicateDays).toContain(1);
    expect(r.coverage.ok).toBe(false);
  });
});

describe("scoreMultiMonthExtraction — 5ヶ月集約", () => {
  const inputs: MonthExtractionInput[] = SHIFT_MONTH_GOLDENS.map((g) => ({
    golden: g,
    extracted: perfect(g),
  }));

  it("TRACKED_CODES は H / BD / HREQ / N / E-18", () => {
    expect([...TRACKED_CODES]).toEqual(["H", "BD", "HREQ", "N", "E-18"]);
  });

  it("全月 perfect → overall 100% / monthsPassed=5 / allPass / 合算 code 全 ok", () => {
    const r = scoreMultiMonthExtraction(inputs, HARADA_SPRIX_DICTIONARY);
    expect(r.overall.cellAccuracy).toBe(1);
    expect(r.overall.monthsPassed).toBe(5);
    expect(r.overall.monthsTotal).toBe(5);
    expect(r.overall.invalidCodeTotal).toBe(0);
    expect(r.overall.blankSkipDetectedMonths).toBe(0);
    expect(r.overall.allPass).toBe(true);
    expect(r.overall.codeIdentification.every((c) => c.ok)).toBe(true);
    // 合算 expected は各月の合計（例: H は 5ヶ月分 > 0）
    const h = r.overall.codeIdentification.find((c) => c.code === "H");
    expect(h?.expected).toBeGreaterThan(0);
  });

  it("1ヶ月だけ劣化 → monthsPassed=4 / allPass false / invalidCodeTotal=1", () => {
    const degraded: MonthExtractionInput[] = inputs.map((i) => ({
      golden: i.golden,
      extracted: clone(i.extracted),
    }));
    degraded[1].extracted[0] = {
      ...degraded[1].extracted[0],
      rawCode: "ZZ",
    }; // april 1 日目を辞書外
    const r = scoreMultiMonthExtraction(degraded, HARADA_SPRIX_DICTIONARY);
    expect(r.overall.monthsPassed).toBe(4);
    expect(r.overall.allPass).toBe(false);
    expect(r.overall.invalidCodeTotal).toBe(1);
  });

  it("入力を破壊しない（pure・参照安全）", () => {
    const before = JSON.stringify(inputs[0].extracted);
    scoreMultiMonthExtraction(inputs, HARADA_SPRIX_DICTIONARY);
    expect(JSON.stringify(inputs[0].extracted)).toBe(before);
  });
});
