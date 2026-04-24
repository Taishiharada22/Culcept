/**
 * CoAlter Bug-1 Phase 1 — EMOTION_TAG_LEXEMES 構造テスト
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §4.3
 * Gate: docs/coalter-implementation-plan-mainstream.md §2.1 Phase 1 Gate ①-④
 *   ① 全 4 カテゴリが存在
 *   ② 各カテゴリに最低 5 語含む
 *   ③ 語彙重複 0 件
 *   ④ export シグネチャ固定
 */

import { describe, it, expect } from "vitest";
import { EMOTION_TAG_LEXEMES } from "@/lib/coalter/emotion/lexemes";
import type { EmotionCategory } from "@/lib/coalter/emotion/types";

describe("EMOTION_TAG_LEXEMES — Gate ① 4 カテゴリ存在", () => {
  it("has exactly 4 categories: mood / indecision / relation / friction", () => {
    const keys = Object.keys(EMOTION_TAG_LEXEMES).sort();
    expect(keys).toEqual(["friction", "indecision", "mood", "relation"]);
  });
});

describe("EMOTION_TAG_LEXEMES — Gate ② 各カテゴリ最低 5 語", () => {
  it("every category contains at least 5 lexemes", () => {
    for (const category of Object.keys(EMOTION_TAG_LEXEMES) as EmotionCategory[]) {
      const entry = EMOTION_TAG_LEXEMES[category];
      expect(entry.lexemes.length).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("EMOTION_TAG_LEXEMES — Gate ③ 重複 0 件", () => {
  it("has no duplicate lexemes across all categories", () => {
    const all = Object.values(EMOTION_TAG_LEXEMES).flatMap((e) => e.lexemes);
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });

  it("has no duplicate lexemes within a single category", () => {
    for (const entry of Object.values(EMOTION_TAG_LEXEMES)) {
      const unique = new Set(entry.lexemes);
      expect(unique.size).toBe(entry.lexemes.length);
    }
  });
});

describe("EMOTION_TAG_LEXEMES — Gate ④ export シグネチャ固定", () => {
  it("each category entry has { lexemes: readonly string[]; polarity: EmotionPolarity }", () => {
    for (const entry of Object.values(EMOTION_TAG_LEXEMES)) {
      expect(entry).toHaveProperty("lexemes");
      expect(Array.isArray(entry.lexemes)).toBe(true);
      expect(entry.lexemes.every((l) => typeof l === "string")).toBe(true);
      expect(entry).toHaveProperty("polarity");
      expect(["positive", "negative", "neutral"]).toContain(entry.polarity);
    }
  });

  it("mood / indecision / relation polarity is neutral (doc §4.3)", () => {
    expect(EMOTION_TAG_LEXEMES.mood.polarity).toBe("neutral");
    expect(EMOTION_TAG_LEXEMES.indecision.polarity).toBe("neutral");
    expect(EMOTION_TAG_LEXEMES.relation.polarity).toBe("neutral");
  });

  it("friction polarity is negative (doc §4.3)", () => {
    expect(EMOTION_TAG_LEXEMES.friction.polarity).toBe("negative");
  });

  it("no empty lexeme strings (fail-safe against accidental whitespace)", () => {
    for (const entry of Object.values(EMOTION_TAG_LEXEMES)) {
      for (const lexeme of entry.lexemes) {
        expect(lexeme.length).toBeGreaterThan(0);
        expect(lexeme.trim()).toBe(lexeme);
      }
    }
  });
});
