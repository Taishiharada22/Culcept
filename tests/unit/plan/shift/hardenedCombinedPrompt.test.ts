/**
 * SR B1b-2C-9-FIX-2 — combined 用 hardened prompt の必須文言検証（pure）
 *
 * 不変条件:
 *   ① 画像構造（上下 2 段 / 上段=日付ヘッダ / 下段=本人行 / 同じ縦列が同じ日付）が明示される
 *   ② 列対応の絶対厳守（真下のセル / 前詰めしない / 空欄保持 / 1 日 1 件）
 *   ③ chunk 範囲の明示（範囲外不要 / 範囲内すべて）
 *   ④ split prompt との非干渉（buildHardenedDayKeyedPrompt は変更なし）
 */
import { describe, it, expect } from "vitest";

import {
  buildHardenedCombinedDayKeyedPrompt,
  buildHardenedDayKeyedPrompt,
} from "@/lib/plan/shift/hardenedDayKeyedPrompt";

const BASE = {
  personName: "原田",
  year: 2025,
  month: 7,
  daysInMonth: 31,
};

describe("buildHardenedCombinedDayKeyedPrompt — 画像構造", () => {
  const p = buildHardenedCombinedDayKeyedPrompt({ ...BASE, dayRange: [1, 15] });
  it("上下 2 段 / 上段 / 下段 / 同じ縦列 を明示", () => {
    expect(p).toContain("上下 2 段");
    expect(p).toContain("上段");
    expect(p).toContain("下段");
    expect(p).toContain("同じ縦列が同じ日付に対応");
  });
});

describe("buildHardenedCombinedDayKeyedPrompt — 列対応の絶対厳守", () => {
  const p = buildHardenedCombinedDayKeyedPrompt({ ...BASE, dayRange: [1, 15] });
  it("真下のセル / 前詰めしない / 空欄保持 / 1 日 1 件 / 隣接同一", () => {
    expect(p).toContain("真下");
    expect(p).toContain("前詰めしない");
    expect(p).toContain("空欄として出力");
    expect(p).toContain("1 つだけ");
    expect(p).toContain("1 日ずつ別のセル");
  });
});

describe("buildHardenedCombinedDayKeyedPrompt — chunk 範囲", () => {
  const p = buildHardenedCombinedDayKeyedPrompt({ ...BASE, dayRange: [16, 31] });
  it("range from..to / 範囲外不要 / 範囲内すべて", () => {
    expect(p).toContain("16 日〜31 日");
    expect(p).toContain("16 件");
    expect(p).toContain("chunk 範囲外");
    expect(p).toContain("chunk 範囲内の日付は **すべて**");
  });
});

describe("buildHardenedCombinedDayKeyedPrompt vs split — 非干渉", () => {
  it("split prompt は combined 専用文言を含まない（既存挙動の互換維持）", () => {
    const split = buildHardenedDayKeyedPrompt({ ...BASE, dayRange: [1, 15] });
    expect(split).not.toContain("上下 2 段");
    expect(split).not.toContain("前詰めしない");
    expect(split).not.toContain("同じ縦列が同じ日付に対応");
  });

  it("combined prompt は split の既存厳守も継承（base prompt 共通）", () => {
    const c = buildHardenedCombinedDayKeyedPrompt({ ...BASE, dayRange: [1, 15] });
    // base buildDayKeyedExtractionPrompt の共通文言（年月 / 本人名）を継承
    expect(c).toContain("2025");
    expect(c).toContain("7");
    expect(c).toContain("原田");
  });
});
