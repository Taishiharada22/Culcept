/**
 * SR B1b-2C-4-a — hardened day-keyed prompt builder の契約
 */
import { describe, it, expect } from "vitest";
import { buildHardenedDayKeyedPrompt } from "@/lib/plan/shift/hardenedDayKeyedPrompt";

describe("buildHardenedDayKeyedPrompt", () => {
  it("追加厳守ブロックが付与される（失敗3モード名指し）", () => {
    const p = buildHardenedDayKeyedPrompt({
      year: 2026, month: 6, daysInMonth: 30,
    });
    expect(p).toContain("失敗モード対策");
    expect(p).toContain("併合しない");
    expect(p).toContain("空セルの後続の値を左に詰めない");
    expect(p).toContain("真下の列だけ");
    expect(p).toContain("sequence");
  });

  it("dayRange が範囲文に反映される", () => {
    const p = buildHardenedDayKeyedPrompt({
      year: 2026, month: 6, daysInMonth: 30, dayRange: [16, 30],
    });
    expect(p).toContain("16日〜30日");
    expect(p).toContain("15件"); // 30-16+1
  });

  it("dayRange 省略時は全日（1..daysInMonth）", () => {
    const p = buildHardenedDayKeyedPrompt({
      year: 2026, month: 6, daysInMonth: 30,
    });
    expect(p).toContain("1日〜30日");
    expect(p).toContain("30件");
  });

  it("knownCodes が prompt に並ぶ", () => {
    const p = buildHardenedDayKeyedPrompt({
      year: 2026, month: 6, daysInMonth: 30, knownCodes: ["H", "HREQ"],
    });
    expect(p).toContain("HREQ");
  });

  it("personName 既定は『本人』", () => {
    const p = buildHardenedDayKeyedPrompt({
      year: 2026, month: 6, daysInMonth: 30,
    });
    expect(p).toContain("本人");
  });

  it("personName 指定は反映", () => {
    const p = buildHardenedDayKeyedPrompt({
      personName: "原田 大志",
      year: 2026, month: 6, daysInMonth: 30,
    });
    expect(p).toContain("原田 大志");
  });

  it("Blob / base64 / dataURL を含まない（pure string）", () => {
    const p = buildHardenedDayKeyedPrompt({
      year: 2026, month: 6, daysInMonth: 30,
    });
    expect(p).not.toMatch(/blob:|data:image|base64|Blob|dataUri/i);
  });
});
