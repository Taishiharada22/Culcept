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
  HARADA_CONFUSABLE_SPECS,
  confusablePartners,
  isConfusableCode,
  resolveConfusable,
  detectConfusableCells,
  confusableCellAmberDays,
  summarizeConfusable,
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

  it("at-risk な出力だけ hint 化（A1-tune-1 directionality・E-18 は信頼で除外・day 昇順・soft）", () => {
    // CELLS = E(1) / L(2) / E-18(3) / ""(4) / H(5) / G(6)。
    //   directionality: E(1)=strong / E-18(3)=信頼で除外 / H(5)=medium → [1, 5]。
    const hints = detectConfusableCells(CELLS);
    expect(hints.map((h) => h.day)).toEqual([1, 5]);
    expect(hints.every((h) => h.severity === "soft")).toBe(true);
  });

  it("各 hint は rawCode（normalized）+ confusableWith + tier + message を持つ", () => {
    const hints = detectConfusableCells(CELLS);
    const e = hints.find((h) => h.day === 1)!;
    expect(e.rawCode).toBe("E");
    expect(e.confusableWith).toEqual(["E-18"]);
    expect(e.tier).toBe("strong");
    expect(e.message).toContain("E-18");
    const h = hints.find((h) => h.day === 5)!;
    expect(h.confusableWith).toEqual(["HREQ", "N"]);
    expect(h.tier).toBe("medium"); // H は H/HREQ(medium) + H/N(weak) → effective medium
  });

  it("confidence は見ない＝高信頼セルでも at-risk なら hint（CEO #5）", () => {
    // ConfusableCell は confidence を型に持たない。高 conf 相当でも at-risk(E) は hint。E-18 は信頼で除外。
    const withConf = [
      { day: 1, rawCode: "E", confidence: 0.99 },
      { day: 2, rawCode: "E-18", confidence: 1.0 },
    ] as unknown as ConfusableCell[];
    const hints = detectConfusableCells(withConf);
    expect(hints.map((h) => h.day)).toEqual([1]); // E のみ（E-18 は directionality で除外）
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

describe("A1-tune-1 — tier / directionality / 表示振り分け（CEO test 1-8）", () => {
  it("#1 E は strong / #3 H は medium / #5 N は weak（resolveConfusable）", () => {
    expect(resolveConfusable("E")?.tier).toBe("strong");
    expect(resolveConfusable("H")?.tier).toBe("medium"); // H/HREQ(medium) ∨ H/N(weak) → medium
    expect(resolveConfusable("N")?.tier).toBe("weak");
  });

  it("#2 E-18 / #4 HREQ は directionality で at-risk 対象外（null）", () => {
    expect(resolveConfusable("E-18")).toBeNull();
    expect(resolveConfusable("HREQ")).toBeNull();
  });

  it("#6 strong だけ cell amber（confusableCellAmberDays = E のみ）", () => {
    const hints = detectConfusableCells([
      { day: 1, rawCode: "E" }, // strong
      { day: 2, rawCode: "H" }, // medium
      { day: 3, rawCode: "N" }, // weak
    ]);
    const amber = confusableCellAmberDays(hints);
    expect([...amber]).toEqual([1]); // E だけ
    expect(amber.has(2)).toBe(false); // H(medium) は cell amber 対象外
    expect(amber.has(3)).toBe(false); // N(weak) は cell amber 対象外
  });

  it("#7 panel summary = strong(日付) + medium(件数) / #8 weak は除外", () => {
    const hints = detectConfusableCells([
      { day: 5, rawCode: "E" }, // strong
      { day: 10, rawCode: "H" }, // medium
      { day: 20, rawCode: "H" }, // medium
      { day: 25, rawCode: "N" }, // weak
    ]);
    const s = summarizeConfusable(hints);
    expect(s.strongDays).toEqual([5]); // strong は日付
    expect(s.mediumCount).toBe(2); // medium は件数（H×2）。weak(N) は入らない
  });

  it("HARADA_CONFUSABLE_SPECS は tier + atRisk（E/E-18 strong / H/HREQ medium / H/N weak）", () => {
    expect(HARADA_CONFUSABLE_SPECS.map((s) => [s.pair[0], s.pair[1], s.tier])).toEqual([
      ["E", "E-18", "strong"],
      ["H", "HREQ", "medium"],
      ["H", "N", "weak"],
    ]);
  });

  it("tier 別 message は safe-copy（error/誤/失敗/間違 不使用）", () => {
    const hints = detectConfusableCells([
      { day: 1, rawCode: "E" },
      { day: 2, rawCode: "H" },
    ]);
    for (const h of hints) expect(h.message).not.toMatch(/error|wrong|failed|誤|失敗|間違/i);
  });
});
