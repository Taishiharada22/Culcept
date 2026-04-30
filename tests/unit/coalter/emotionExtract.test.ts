/**
 * CoAlter Bug-1 Phase 2 — extractEmotionTags 抽出条件テスト
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §4.3
 * Plan: docs/coalter-implementation-plan-mainstream.md §2.2 Phase 2 テスト仕様
 *   ① mood 語検出
 *   ② indecision 語検出
 *   ③ relation 語検出
 *   ④ friction 語検出
 *   ⑤ 複数カテゴリ同時検出
 *   ⑥ 空文字・null・非文字列で [] 返却
 *   ⑦ 100ms 以内 completion
 */

import { describe, it, expect } from "vitest";
import { extractEmotionTags } from "@/lib/coalter/emotion/extract";

describe("extractEmotionTags — カテゴリ別検出", () => {
  it("① mood: 気分 を検出", () => {
    const tags = extractEmotionTags("今日は気分が乗らない");
    const moods = tags.filter((t) => t.tag === "mood");
    expect(moods.length).toBeGreaterThan(0);
    // "気分" も "気分が乗らない" も mood lexeme なので両方 or どちらかが hit
    const lexemes = moods.map((t) => t.source_lexeme);
    expect(lexemes.some((l) => l === "気分" || l === "気分が乗らない")).toBe(
      true,
    );
  });

  it("② indecision: 迷う を検出", () => {
    const tags = extractEmotionTags("ちょっと迷うな");
    expect(
      tags.some((t) => t.tag === "indecision" && t.source_lexeme === "迷う"),
    ).toBe(true);
  });

  it("③ relation: 関係 を検出", () => {
    const tags = extractEmotionTags("関係について話したい");
    expect(
      tags.some((t) => t.tag === "relation" && t.source_lexeme === "関係"),
    ).toBe(true);
  });

  it("④ friction: 喧嘩 を検出し polarity=negative", () => {
    const tags = extractEmotionTags("昨日喧嘩した");
    const friction = tags.find(
      (t) => t.tag === "friction" && t.source_lexeme === "喧嘩",
    );
    expect(friction).toBeDefined();
    expect(friction?.polarity).toBe("negative");
  });

  it("⑤ 複数カテゴリ同時検出（mood + indecision + friction）", () => {
    const tags = extractEmotionTags(
      "気分が乗らないし、迷うし、ちょっとすれ違いもあった",
    );
    const cats = new Set(tags.map((t) => t.tag));
    expect(cats.has("mood")).toBe(true);
    expect(cats.has("indecision")).toBe(true);
    expect(cats.has("friction")).toBe(true);
  });
});

describe("extractEmotionTags — ⑥ fail-open（不正入力で []）", () => {
  it("空文字で []", () => {
    expect(extractEmotionTags("")).toEqual([]);
  });

  it("null で []", () => {
    expect(extractEmotionTags(null)).toEqual([]);
  });

  it("undefined で []", () => {
    expect(extractEmotionTags(undefined)).toEqual([]);
  });

  it("number で []", () => {
    expect(extractEmotionTags(123)).toEqual([]);
  });

  it("object で []", () => {
    expect(extractEmotionTags({})).toEqual([]);
  });

  it("lexeme hit ゼロのテキストで []", () => {
    expect(extractEmotionTags("天気がいいね")).toEqual([]);
  });
});

describe("extractEmotionTags — 仕様不変", () => {
  it("speaker は常に 'unknown'（low-level API、speaker 判定は上位 wrapper の責務）", () => {
    const tags = extractEmotionTags("気分 迷う 関係 喧嘩");
    expect(tags.length).toBeGreaterThan(0);
    for (const t of tags) {
      expect(t.speaker).toBe("unknown");
    }
  });

  it("決定的（同一入力で同一結果）", () => {
    const text = "気持ち 迷い 距離感 すれ違い";
    const r1 = extractEmotionTags(text);
    const r2 = extractEmotionTags(text);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("⑦ 100ms 以内で完了（長文でも）", () => {
    const longText = "気持ち ".repeat(500) + "迷う ".repeat(500) + "喧嘩 ".repeat(500);
    const start = performance.now();
    extractEmotionTags(longText);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
