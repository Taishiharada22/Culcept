/**
 * CoAlter Bug-1 Phase 1 — EmotionCategory / EmotionPolarity / EmotionTag 型テスト
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §4.1
 * Gate: docs/coalter-implementation-plan-mainstream.md §2.1 Phase 1
 *   - EmotionCategory が正確に 4 値
 *   - EmotionTag の shape 固定
 *
 * 注: TypeScript の型は実行時には存在しないため、型の網羅性は `tsc --noEmit` が
 *     保証する。本テストは「公表された literal 値がすべて EmotionCategory として
 *     受理される」「EmotionTag の shape が期待通りに構築できる」を実行時検証する。
 */

import { describe, it, expect } from "vitest";
import type {
  EmotionCategory,
  EmotionPolarity,
  EmotionTag,
} from "@/lib/coalter/emotion/types";

describe("EmotionCategory", () => {
  it("accepts exactly 4 values: mood / indecision / relation / friction", () => {
    const all: EmotionCategory[] = ["mood", "indecision", "relation", "friction"];
    expect(all).toHaveLength(4);
    expect(new Set(all).size).toBe(4);
  });
});

describe("EmotionPolarity", () => {
  it("accepts exactly 3 values: positive / negative / neutral", () => {
    const all: EmotionPolarity[] = ["positive", "negative", "neutral"];
    expect(all).toHaveLength(3);
    expect(new Set(all).size).toBe(3);
  });
});

describe("EmotionTag shape", () => {
  it("has required fields: tag / source_lexeme / speaker (polarity optional)", () => {
    const minimal: EmotionTag = {
      tag: "mood",
      source_lexeme: "気持ち",
      speaker: "unknown",
    };
    expect(minimal.tag).toBe("mood");
    expect(minimal.source_lexeme).toBe("気持ち");
    expect(minimal.speaker).toBe("unknown");
    expect(minimal.polarity).toBeUndefined();
  });

  it("polarity is optional and accepts EmotionPolarity values", () => {
    const withNegative: EmotionTag = {
      tag: "friction",
      source_lexeme: "喧嘩",
      speaker: "both",
      polarity: "negative",
    };
    expect(withNegative.polarity).toBe("negative");

    const withNeutral: EmotionTag = {
      tag: "relation",
      source_lexeme: "距離感",
      speaker: "user_a",
      polarity: "neutral",
    };
    expect(withNeutral.polarity).toBe("neutral");
  });

  it("speaker accepts 4 discriminants: user_a / user_b / both / unknown", () => {
    const speakers: Array<EmotionTag["speaker"]> = [
      "user_a",
      "user_b",
      "both",
      "unknown",
    ];
    expect(speakers).toHaveLength(4);
    expect(new Set(speakers).size).toBe(4);
  });

  it("tag field accepts each EmotionCategory literal", () => {
    const categories: EmotionCategory[] = [
      "mood",
      "indecision",
      "relation",
      "friction",
    ];
    for (const cat of categories) {
      const tag: EmotionTag = {
        tag: cat,
        source_lexeme: "dummy",
        speaker: "unknown",
      };
      expect(tag.tag).toBe(cat);
    }
  });
});
