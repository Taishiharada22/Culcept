/**
 * SR A3-1 — read-miss / 空欄分離 の prompt contract（pure 文字列）
 *
 * 不変条件（CEO test #1, #2）:
 *   ① prompt は visible-but-unreadable（判読できないセル）を **低 confidence** に寄せる
 *      （= 空欄に化けて高 confidence で silent skip させない）。
 *   ② prompt は "" を **確実な空欄** に予約している（自信を持って空のときだけ高 confidence の ""）。
 *   ③ 出力 schema は変えない（rawCode/"" + confidence のみで表現）。
 *   ④ true-blank の既存指示（空の日は正常 / 無理にコードを入れない）は壊さない。
 *   ⑤ hardened combined の旧 OR「空または低 confidence」は解消されている。
 *
 * pure（IO/LLM/DB なし）。文字列を組むだけの builder を検証。
 */
import { describe, it, expect } from "vitest";

import {
  buildDayKeyedExtractionPrompt,
  DAY_KEYED_EXTRACTION_JSON_SCHEMA,
} from "@/lib/plan/shift/shiftExtractionPrompt";
import {
  buildHardenedDayKeyedPrompt,
  buildHardenedCombinedDayKeyedPrompt,
} from "@/lib/plan/shift/hardenedDayKeyedPrompt";

const BASE = { personName: "原田 大志", year: 2026, month: 6, daysInMonth: 30 };

describe("A3-1 read-miss prompt — base（buildDayKeyedExtractionPrompt）", () => {
  const p = buildDayKeyedExtractionPrompt(BASE);

  it("#1 visible-but-unreadable を低 confidence に寄せる（判読できない → confidence 0.3 以下）", () => {
    expect(p).toContain("判読できない");
    expect(p).toContain("confidence を 0.3 以下");
  });

  it("#2 \"\" を確実な空欄に予約（確実に何も書かれていない 空セルだけ高 confidence の \"\"）", () => {
    expect(p).toContain("確実に何も書かれていない");
    // 高い=確実に空 / 低い=読めない、を confidence で区別する文言
    expect(p).toContain("confidence で区別");
  });

  it("#3 出力 schema は不変（rawCode \"\" + confidence のみ。新 field を案内しない）", () => {
    // read-miss も rawCode は "" で表現（当て推量のコードを入れさせない）。
    expect(p).toContain("当て推量");
    expect(p).not.toContain("illegible");
    expect(p).not.toContain("readMiss");
  });

  it("#3b D1: 出力 JSON schema オブジェクトに新 field を足していない（schema 自体を固定）", () => {
    // D1 = schema を変えず rawCode \"\"+confidence で表現。required / properties / 追加禁止を直接 pin。
    expect(DAY_KEYED_EXTRACTION_JSON_SCHEMA.items.required).toEqual([
      "day",
      "rawCode",
      "rowLabel",
    ]);
    expect(Object.keys(DAY_KEYED_EXTRACTION_JSON_SCHEMA.items.properties).sort()).toEqual([
      "confidence",
      "day",
      "rawCode",
      "rowLabel",
    ]);
    expect(DAY_KEYED_EXTRACTION_JSON_SCHEMA.items.additionalProperties).toBe(false);
  });

  it("#4 true-blank の既存指示を壊さない（空の日は正常 / 無理にコードを入れない / \"\"）", () => {
    expect(p).toContain("空の日があるのは正常");
    expect(p).toContain("無理にコードを入れない");
    expect(p).toContain('空文字 ""');
  });
});

describe("A3-1 read-miss prompt — hardened split（buildHardenedDayKeyedPrompt）", () => {
  const p = buildHardenedDayKeyedPrompt(BASE);

  it("base の read-miss 指示を継承（判読できない / confidence 0.3 以下）", () => {
    expect(p).toContain("判読できない");
    expect(p).toContain("confidence を 0.3 以下");
  });

  it("split 自身の『読めない時は confidence を下げる』も保持（OR を含まない）", () => {
    expect(p).toContain("読めない時は confidence を下げる");
    expect(p).not.toContain("空または低 confidence");
  });
});

describe("A3-1 read-miss prompt — hardened combined（buildHardenedCombinedDayKeyedPrompt）", () => {
  const p = buildHardenedCombinedDayKeyedPrompt({ ...BASE, dayRange: [1, 15] });

  it("base の read-miss 指示を継承（判読できない / confidence 0.3 以下）", () => {
    expect(p).toContain("判読できない");
    expect(p).toContain("confidence を 0.3 以下");
  });

  it("#5 旧 OR『空または低 confidence』は解消（read-miss を高 conf \"\" で逃がさない）", () => {
    expect(p).not.toContain("空または低 confidence");
    // chunk 全件返す指示自体は維持（読めない日も dayNumber は返す）
    expect(p).toContain("chunk 範囲内の日付は **すべて**");
    expect(p).toContain("読めない日も dayNumber は返す");
  });
});
