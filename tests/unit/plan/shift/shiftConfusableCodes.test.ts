/**
 * SR A1A — shiftConfusableCodes（混同しやすいコードの soft 検出）
 *
 * 不変条件:
 *   - E↔E-18 / H↔HREQ / H↔N を相互に confusable と判定する。
 *   - 非該当コード（L/G 等）は risk なし。
 *   - **confidence に関係なく** hint 対象（高 conf でも flag）。
 *   - 大小/空白を normalize して判定。空欄/非 string は throw せず非該当。
 *   - hint は **soft のみ**（hard block しない）・day 昇順・deterministic。
 */
import { describe, it, expect } from "vitest";

import {
  HARADA_CONFUSABLE_PAIRS,
  confusablePartners,
  isConfusableCode,
  detectConfusableCells,
  type ConfusableCell,
} from "@/lib/plan/shift/shiftConfusableCodes";

describe("confusablePartners — 相互判定", () => {
  it("E は E-18 と confusable（CEO #1）", () => {
    expect(confusablePartners("E")).toContain("E-18");
    expect(isConfusableCode("E")).toBe(true);
  });

  it("E-18 は E と confusable（CEO #2）", () => {
    expect(confusablePartners("E-18")).toContain("E");
    expect(isConfusableCode("E-18")).toBe(true);
  });

  it("HREQ は H と confusable（CEO #3）", () => {
    expect(confusablePartners("HREQ")).toContain("H");
    expect(isConfusableCode("HREQ")).toBe(true);
  });

  it("H は HREQ と N の両方と confusable（partners は dedup・昇順）", () => {
    expect(confusablePartners("H")).toEqual(["HREQ", "N"]);
  });

  it("N は H と confusable", () => {
    expect(confusablePartners("N")).toEqual(["H"]);
  });

  it("non-confusable コード（L / G / BD）は risk なし（CEO #4）", () => {
    expect(confusablePartners("L")).toEqual([]);
    expect(confusablePartners("G")).toEqual([]);
    expect(confusablePartners("BD")).toEqual([]);
    expect(isConfusableCode("L")).toBe(false);
  });

  it("大小/前後空白を normalize して判定（'e-18' / ' h ' も confusable）", () => {
    expect(confusablePartners("e-18")).toContain("E");
    expect(confusablePartners(" h ")).toEqual(["HREQ", "N"]);
  });

  it("空欄/空白のみ → 非該当（[]・空欄は blank-risk が担当）", () => {
    expect(confusablePartners("")).toEqual([]);
    expect(confusablePartners("   ")).toEqual([]);
  });

  it("throw しない（null / undefined / 非 string）（CEO #10）", () => {
    expect(() => confusablePartners(null as unknown as string)).not.toThrow();
    expect(() => confusablePartners(undefined as unknown as string)).not.toThrow();
    expect(() => confusablePartners(123 as unknown as string)).not.toThrow();
    expect(confusablePartners(null as unknown as string)).toEqual([]);
  });

  it("自分自身は partners に含めない", () => {
    expect(confusablePartners("E")).not.toContain("E");
  });

  it("HARADA_CONFUSABLE_PAIRS は初期 3 ペア（E↔E-18 / H↔HREQ / H↔N）", () => {
    expect(HARADA_CONFUSABLE_PAIRS).toEqual([
      ["E", "E-18"],
      ["H", "HREQ"],
      ["H", "N"],
    ]);
  });
});

describe("detectConfusableCells — cells → soft hints", () => {
  const CELLS: ConfusableCell[] = [
    { day: 1, rawCode: "E" }, // confusable
    { day: 2, rawCode: "L" }, // 非該当
    { day: 3, rawCode: "E-18" }, // confusable
    { day: 4, rawCode: "" }, // 空欄 → skip
    { day: 5, rawCode: "H" }, // confusable（partners 2 つ）
    { day: 6, rawCode: "G" }, // 非該当
  ];

  it("confusable セルだけ hint 化（day 昇順・soft）", () => {
    const hints = detectConfusableCells(CELLS);
    expect(hints.map((h) => h.day)).toEqual([1, 3, 5]);
    expect(hints.every((h) => h.severity === "soft")).toBe(true);
  });

  it("各 hint は rawCode（normalized）+ confusableWith + message を持つ", () => {
    const hints = detectConfusableCells(CELLS);
    const e = hints.find((h) => h.day === 1)!;
    expect(e.rawCode).toBe("E");
    expect(e.confusableWith).toEqual(["E-18"]);
    expect(e.message).toContain("E-18");
    const h = hints.find((h) => h.day === 5)!;
    expect(h.confusableWith).toEqual(["HREQ", "N"]);
  });

  it("confidence は見ない＝高信頼セルでも confusable なら hint（CEO #5）", () => {
    // ConfusableCell は confidence を型に持たない。高 conf 相当の値を混ぜても hint は出る。
    const withConf = [
      { day: 1, rawCode: "E", confidence: 0.99 },
      { day: 2, rawCode: "E-18", confidence: 1.0 },
    ] as unknown as ConfusableCell[];
    const hints = detectConfusableCells(withConf);
    expect(hints.map((h) => h.day)).toEqual([1, 2]);
  });

  it("空配列 / 非該当のみ → []", () => {
    expect(detectConfusableCells([])).toEqual([]);
    expect(detectConfusableCells([{ day: 1, rawCode: "L" }])).toEqual([]);
  });

  it("throw しない（rawCode 非 string 混入）（CEO #10）", () => {
    const bad = [{ day: 1, rawCode: null }, { day: 2, rawCode: "E" }] as unknown as ConfusableCell[];
    expect(() => detectConfusableCells(bad)).not.toThrow();
    expect(detectConfusableCells(bad).map((h) => h.day)).toEqual([2]);
  });

  it("deterministic（同入力 → 同出力）", () => {
    expect(detectConfusableCells(CELLS)).toEqual(detectConfusableCells(CELLS));
  });
});
