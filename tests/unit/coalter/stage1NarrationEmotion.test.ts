/**
 * CoAlter Bug-1 Phase 3B Layer 2-A — buildEmotionSignalsBlock 契約テスト
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §9 / CEO Q-L2-2 α
 *
 * 契約:
 *   - speaker + category のみ出力（source_lexeme / 具体語は出さない）
 *   - 同一 (speaker, category) は dedupe
 *   - 出力順は入力順を維持
 *   - 空 / undefined / 全 malformed → null（出力変化最小化）
 *   - 失敗独立 (§2.3): 例外を投げず、不正 entry は skip
 *
 * 対象は新規 export `buildEmotionSignalsBlock` のみ。
 * 既存 `buildStage1Prefix` / `prependStage1Prefix` / `splitStage1Prefix`
 * の挙動は本テストでは検証しない（既存 stage1Narration.test.ts が担保）。
 */

import { describe, it, expect } from "vitest";
import { buildEmotionSignalsBlock } from "@/lib/coalter/stage1Narration";
import type { EmotionTag } from "@/lib/coalter/emotion/types";

describe("buildEmotionSignalsBlock (Phase 3B Layer 2-A)", () => {
  // ─────────────────────────────────────────────
  // 1. emotionTags 空 / undefined → null
  // ─────────────────────────────────────────────
  it("undefined → null", () => {
    expect(buildEmotionSignalsBlock(undefined)).toBeNull();
  });

  it("empty array → null", () => {
    expect(buildEmotionSignalsBlock([])).toBeNull();
  });

  // ─────────────────────────────────────────────
  // 2. 単一 entry → speaker + category のみ
  // ─────────────────────────────────────────────
  it("user_a 1 件 → speaker + category のみ出力", () => {
    const tags: EmotionTag[] = [
      {
        tag: "mood",
        source_lexeme: "気分",
        speaker: "user_a",
        polarity: "neutral",
      },
    ];
    expect(buildEmotionSignalsBlock(tags)).toBe(
      ["emotion_signals:", "- speaker: user_a", "  category: mood"].join("\n"),
    );
  });

  // ─────────────────────────────────────────────
  // 3. source_lexeme は prompt に出ない (CEO α 方針)
  // ─────────────────────────────────────────────
  it("出力に source_lexeme は含まれない", () => {
    const tags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "気分", speaker: "user_a" },
      { tag: "friction", source_lexeme: "すれ違い", speaker: "both" },
    ];
    const result = buildEmotionSignalsBlock(tags);
    expect(result).not.toBeNull();
    // 具体語彙がリーク していないか
    expect(result).not.toContain("気分");
    expect(result).not.toContain("すれ違い");
    expect(result).not.toContain("source_lexeme");
    // 'tag' field 名も出ない (speaker / category のみ)
    expect(result).not.toMatch(/^\s*tag:/m);
  });

  // ─────────────────────────────────────────────
  // 4. 異 speaker / 異 category → 別 entry
  // ─────────────────────────────────────────────
  it("異 speaker / 異 category → 2 entries", () => {
    const tags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "気分", speaker: "user_a" },
      { tag: "friction", source_lexeme: "すれ違い", speaker: "both" },
    ];
    expect(buildEmotionSignalsBlock(tags)).toBe(
      [
        "emotion_signals:",
        "- speaker: user_a",
        "  category: mood",
        "- speaker: both",
        "  category: friction",
      ].join("\n"),
    );
  });

  // ─────────────────────────────────────────────
  // 5. 同 (speaker, category) で異 source_lexeme → dedupe で 1 entry
  // ─────────────────────────────────────────────
  it("同 (speaker, category) の異 lexeme は 1 entry に集約", () => {
    const tags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "気分", speaker: "user_a" },
      { tag: "mood", source_lexeme: "気持ち", speaker: "user_a" },
      { tag: "mood", source_lexeme: "心境", speaker: "user_a" },
    ];
    expect(buildEmotionSignalsBlock(tags)).toBe(
      ["emotion_signals:", "- speaker: user_a", "  category: mood"].join("\n"),
    );
  });

  // ─────────────────────────────────────────────
  // 6. 出力順は入力順維持
  // ─────────────────────────────────────────────
  it("出力順は入力順を維持", () => {
    const tags: EmotionTag[] = [
      { tag: "friction", source_lexeme: "すれ違い", speaker: "both" },
      { tag: "mood", source_lexeme: "気分", speaker: "user_a" },
      { tag: "indecision", source_lexeme: "迷う", speaker: "user_b" },
    ];
    const result = buildEmotionSignalsBlock(tags);
    expect(result).not.toBeNull();
    const idxFriction = result!.indexOf("category: friction");
    const idxMood = result!.indexOf("category: mood");
    const idxIndecision = result!.indexOf("category: indecision");
    expect(idxFriction).toBeGreaterThan(-1);
    expect(idxMood).toBeGreaterThan(idxFriction);
    expect(idxIndecision).toBeGreaterThan(idxMood);
  });

  // ─────────────────────────────────────────────
  // 7. malformed entry は skip、正常 entry のみ拾う
  // ─────────────────────────────────────────────
  it("malformed entry を skip しても正常 entry は出る", () => {
    const tags = [
      null,
      undefined,
      { tag: "invalid_category", source_lexeme: "?", speaker: "user_a" },
      { tag: "mood", source_lexeme: "気分", speaker: "invalid_speaker" },
      { tag: "mood", source_lexeme: "気分", speaker: "user_a" },
    ] as unknown as EmotionTag[];
    expect(buildEmotionSignalsBlock(tags)).toBe(
      ["emotion_signals:", "- speaker: user_a", "  category: mood"].join("\n"),
    );
  });

  // ─────────────────────────────────────────────
  // 8. 全 entry が malformed → null
  // ─────────────────────────────────────────────
  it("全 entry が malformed → null（header だけ残さない）", () => {
    const tags = [
      null,
      { tag: "invalid", source_lexeme: "?", speaker: "user_a" },
      { tag: "mood", source_lexeme: "?", speaker: "invalid" },
    ] as unknown as EmotionTag[];
    expect(buildEmotionSignalsBlock(tags)).toBeNull();
  });

  // ─────────────────────────────────────────────
  // 9. 4 category 全部対応
  // ─────────────────────────────────────────────
  it("4 category (mood/indecision/relation/friction) 全部対応", () => {
    const tags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "x", speaker: "user_a" },
      { tag: "indecision", source_lexeme: "x", speaker: "user_b" },
      { tag: "relation", source_lexeme: "x", speaker: "both" },
      { tag: "friction", source_lexeme: "x", speaker: "unknown" },
    ];
    const result = buildEmotionSignalsBlock(tags);
    expect(result).not.toBeNull();
    expect(result).toContain("category: mood");
    expect(result).toContain("category: indecision");
    expect(result).toContain("category: relation");
    expect(result).toContain("category: friction");
  });

  // ─────────────────────────────────────────────
  // 10. 4 speaker 全部対応
  // ─────────────────────────────────────────────
  it("4 speaker (user_a/user_b/both/unknown) 全部対応", () => {
    const tags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "x", speaker: "user_a" },
      { tag: "indecision", source_lexeme: "x", speaker: "user_b" },
      { tag: "relation", source_lexeme: "x", speaker: "both" },
      { tag: "friction", source_lexeme: "x", speaker: "unknown" },
    ];
    const result = buildEmotionSignalsBlock(tags);
    expect(result).not.toBeNull();
    expect(result).toContain("speaker: user_a");
    expect(result).toContain("speaker: user_b");
    expect(result).toContain("speaker: both");
    expect(result).toContain("speaker: unknown");
  });

  // ─────────────────────────────────────────────
  // 11. fail-open: 不正型でも例外を投げない
  // ─────────────────────────────────────────────
  it("不正型入力で例外を投げない (fail-open)", () => {
    expect(() => {
      buildEmotionSignalsBlock(null as unknown as EmotionTag[]);
    }).not.toThrow();
    expect(() => {
      buildEmotionSignalsBlock("string" as unknown as EmotionTag[]);
    }).not.toThrow();
    expect(() => {
      buildEmotionSignalsBlock(123 as unknown as EmotionTag[]);
    }).not.toThrow();
    expect(buildEmotionSignalsBlock(null as unknown as EmotionTag[])).toBeNull();
    expect(buildEmotionSignalsBlock("string" as unknown as EmotionTag[])).toBeNull();
  });

  // ─────────────────────────────────────────────
  // 12. 形式整合: header + entry のフォーマット規範
  // ─────────────────────────────────────────────
  it("出力は 'emotion_signals:' header で始まる", () => {
    const tags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "x", speaker: "user_a" },
    ];
    const result = buildEmotionSignalsBlock(tags);
    expect(result).not.toBeNull();
    expect(result!.split("\n")[0]).toBe("emotion_signals:");
  });

  it("各 entry は 2 行 (- speaker: ... / 2 space-indent category: ...)", () => {
    const tags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "x", speaker: "user_a" },
      { tag: "friction", source_lexeme: "x", speaker: "both" },
    ];
    const result = buildEmotionSignalsBlock(tags);
    expect(result).not.toBeNull();
    const lines = result!.split("\n");
    // header 1 + entry 2 件 × 2 行 = 5 行
    expect(lines.length).toBe(5);
    expect(lines[1]).toBe("- speaker: user_a");
    expect(lines[2]).toBe("  category: mood");
    expect(lines[3]).toBe("- speaker: both");
    expect(lines[4]).toBe("  category: friction");
  });
});
