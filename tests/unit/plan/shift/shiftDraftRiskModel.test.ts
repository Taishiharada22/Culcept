/**
 * SR B1b-2A — シフト下書き golden-free risk model の契約
 *
 * risk model は「誤り確定検出」ではなく review hint（ここを原稿照合して、の補助）。
 * golden を一切使わない（入力は draft cells + 辞書 + daysInMonth のみ）。
 */
import { describe, it, expect } from "vitest";
import {
  detectDraftRisks,
  type DraftRiskCell,
  type RiskKind,
} from "@/lib/plan/shift/shiftDraftRiskModel";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";

// 連続同一を避けた有効コードの巡回（adjacent dup / blank / unknown / low-conf なし）。
// A1B で confusable_code soft hint を追加したため、「完全に clean な下書き」基準には
// 混同コード（E/E-18/H/HREQ/N）を**含めず** 非混同の L/G/BD のみで作る。
const VALID = ["L", "G", "BD"];
function cleanCells(n: number): DraftRiskCell[] {
  return Array.from({ length: n }, (_, i) => ({
    day: i + 1,
    rawCode: VALID[i % VALID.length],
    confidence: 1,
  }));
}
const opt = (extra?: Partial<{ chunkBoundaries: number[] }>) => ({
  daysInMonth: 31,
  ...extra,
});
const kinds = (r: { hints: { kind: RiskKind }[] }) => r.hints.map((h) => h.kind);
const find = (r: { hints: { kind: RiskKind; severity: string; dayNumbers: number[] }[] }, k: RiskKind) =>
  r.hints.find((h) => h.kind === k);

describe("detectDraftRisks — 完全な下書き", () => {
  it("欠落/重複/未知/空欄/連続/低信頼 なし + chunk境界未指定 → hint ゼロ・非ブロック", () => {
    const r = detectDraftRisks(cleanCells(31), HARADA_SPRIX_DICTIONARY, opt());
    expect(r.hints).toHaveLength(0);
    expect(r.hasBlockingRisk).toBe(false);
    expect(r.hardCount).toBe(0);
    expect(r.softCount).toBe(0);
  });
});

describe("detectDraftRisks — hard risk（保存前解消必須）", () => {
  it("missing_day", () => {
    const cells = cleanCells(31).filter((c) => c.day !== 5);
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt());
    const h = find(r, "missing_day");
    expect(h?.severity).toBe("hard");
    expect(h?.dayNumbers).toContain(5);
    expect(r.hasBlockingRisk).toBe(true);
  });

  it("duplicate_day", () => {
    const cells = [...cleanCells(31), { day: 5, rawCode: "N", confidence: 1 }];
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt());
    const h = find(r, "duplicate_day");
    expect(h?.severity).toBe("hard");
    expect(h?.dayNumbers).toContain(5);
    expect(r.hasBlockingRisk).toBe(true);
  });

  it("unknown_code（辞書外・非空）", () => {
    const cells = cleanCells(31).map((c) => (c.day === 3 ? { ...c, rawCode: "XX" } : c));
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt());
    const h = find(r, "unknown_code");
    expect(h?.severity).toBe("hard");
    expect(h?.dayNumbers).toEqual([3]);
    expect(r.hasBlockingRisk).toBe(true);
  });
});

describe("detectDraftRisks — soft risk（確認後は保存可）", () => {
  it("low_confidence", () => {
    const cells = cleanCells(31).map((c) => (c.day === 7 ? { ...c, confidence: 0.4 } : c));
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt());
    const h = find(r, "low_confidence");
    expect(h?.severity).toBe("soft");
    expect(h?.dayNumbers).toContain(7);
    expect(r.hasBlockingRisk).toBe(false);
  });

  it("blank_risk + suspicious_shift（空欄 → 直後 E+1,E+2）", () => {
    const cells = cleanCells(31).map((c) => (c.day === 10 ? { ...c, rawCode: "" } : c));
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt());
    expect(find(r, "blank_risk")?.severity).toBe("soft");
    expect(find(r, "blank_risk")?.dayNumbers).toContain(10);
    const shift = find(r, "suspicious_shift");
    expect(shift?.severity).toBe("soft");
    expect(shift?.dayNumbers).toEqual([11, 12]);
    expect(r.hasBlockingRisk).toBe(false);
  });

  it("adjacent_duplicate は soft（HREQ/HREQ は本当に連続し得る → block しない）", () => {
    const cells = cleanCells(31).map((c) =>
      c.day === 4 || c.day === 5 ? { ...c, rawCode: "HREQ" } : c
    );
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt());
    const h = find(r, "adjacent_duplicate");
    expect(h?.severity).toBe("soft");
    expect(h?.dayNumbers).toEqual([4, 5]);
    expect(r.hasBlockingRisk).toBe(false); // soft のみなら非ブロック
  });

  it("adjacent_duplicate 3 連続も全日フラグ", () => {
    // VALID=[L,G,BD] の cycle 上、day3=BD・day7=L なので run を [4,5,6] に収めるには
    // 両隣（BD/L）と異なる "G" を 3 連続させる（"L" だと day7 の自然 L と繋がり [4,5,6,7] になる）。
    const cells = cleanCells(31).map((c) =>
      c.day === 4 || c.day === 5 || c.day === 6 ? { ...c, rawCode: "G" } : c
    );
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt());
    expect(find(r, "adjacent_duplicate")?.dayNumbers).toEqual([4, 5, 6]);
  });

  it("chunk_boundary（[15] → 15,16）", () => {
    const r = detectDraftRisks(cleanCells(31), HARADA_SPRIX_DICTIONARY, opt({ chunkBoundaries: [15] }));
    const h = find(r, "chunk_boundary");
    expect(h?.severity).toBe("soft");
    expect(h?.dayNumbers).toEqual([15, 16]);
    expect(r.hasBlockingRisk).toBe(false);
  });
});

describe("detectDraftRisks — confusable_code（A1B・似た形で紛らわしいコード・soft）", () => {
  it("E は confusable_code soft hint（confidence 高くても要確認）", () => {
    const cells = cleanCells(31).map((c) =>
      c.day === 4 ? { ...c, rawCode: "E", confidence: 1 } : c
    );
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt());
    const h = find(r, "confusable_code");
    expect(h?.severity).toBe("soft");
    expect(h?.dayNumbers).toContain(4);
    expect(r.hasBlockingRisk).toBe(false); // soft = 保存を止めない
  });

  it("H / E-18 / N も confusable（複数日まとめて soft・昇順）", () => {
    const cells = cleanCells(31).map((c) =>
      c.day === 2
        ? { ...c, rawCode: "H" }
        : c.day === 8
          ? { ...c, rawCode: "E-18" }
          : c.day === 20
            ? { ...c, rawCode: "N" }
            : c
    );
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt());
    expect(find(r, "confusable_code")?.dayNumbers).toEqual([2, 8, 20]);
  });

  it("非 confusable（L/G/BD）のみ → confusable_code なし", () => {
    const r = detectDraftRisks(cleanCells(31), HARADA_SPRIX_DICTIONARY, opt());
    expect(find(r, "confusable_code")).toBeUndefined();
  });

  it("confusable_code は保存を hard block しない（soft のみなら hasBlockingRisk=false）", () => {
    const cells = cleanCells(31).map((c) => (c.day === 4 ? { ...c, rawCode: "E" } : c));
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt());
    expect(r.hasBlockingRisk).toBe(false);
  });

  it("confusable_code message は安全文言（error/誤/失敗/間違 を含まない）", () => {
    const cells = cleanCells(31).map((c) => (c.day === 4 ? { ...c, rawCode: "E" } : c));
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt());
    const msg = r.hints.find((h) => h.kind === "confusable_code")?.message;
    expect(msg).toBeDefined();
    expect(msg).not.toMatch(/error|wrong|failed|誤|失敗|間違/i);
  });
});

describe("detectDraftRisks — 不変条件", () => {
  it("golden-free（入力に正解を渡さない）+ hard/soft 集計が整合", () => {
    const cells = cleanCells(31)
      .filter((c) => c.day !== 5) // missing(hard)
      .map((c) => (c.day === 3 ? { ...c, rawCode: "XX" } : c.day === 7 ? { ...c, confidence: 0.4 } : c));
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt());
    expect(r.hardCount + r.softCount).toBe(r.hints.length);
    expect(r.hasBlockingRisk).toBe(r.hardCount > 0);
    expect(r.hardCount).toBeGreaterThanOrEqual(2); // missing + unknown
  });

  it("user-facing copy は安全（error/wrong/failed/誤/失敗/間違 を含まない）", () => {
    const cells = cleanCells(31)
      .filter((c) => c.day !== 5)
      .map((c) => (c.day === 3 ? { ...c, rawCode: "XX" } : c.day === 10 ? { ...c, rawCode: "" } : c));
    const r = detectDraftRisks(cells, HARADA_SPRIX_DICTIONARY, opt({ chunkBoundaries: [15] }));
    const bad = /error|wrong|failed|誤|失敗|間違/i;
    for (const h of r.hints) expect(h.message).not.toMatch(bad);
    expect(kinds(r).length).toBeGreaterThan(0);
  });
});
