/**
 * CoAlter Bug-1 Phase 3B Layer 1 — analysis.emotionTags 接続契約テスト
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §4.3 / §2.3
 *
 * 契約:
 *   - `collectEmotionTagsForAnalysis` は recentMessages window 内で EmotionTag を集約
 *   - speaker は senderId から user_a / user_b / both / unknown に書き換え
 *   - dedupe key = `${tag}:${source_lexeme}`
 *   - 同 user 同 lexeme 重複 → 1 entry
 *   - 異 user 同 lexeme → "both"
 *   - unknown 後に named → named 昇格
 *   - 失敗独立条文 (§2.3) 遵守: 不正入力 / 例外で空配列 fallback
 *   - 過去全履歴は拾わない（messages 引数の範囲のみ）
 *   - analyzeConversation() の戻り値に emotionTags が必ず載る（統合テスト）
 */

import { describe, it, expect } from "vitest";
import {
  __internal,
  analyzeConversation,
} from "@/lib/coalter/conversationParser";
import type { ConversationTurn } from "@/lib/coalter/types";

const { collectEmotionTagsForAnalysis } = __internal;

const USER_A = "alice";
const USER_B = "bob";

function turn(
  senderId: string,
  body: string,
  createdAt = "2026-04-26T10:00:00Z",
): ConversationTurn {
  return { senderId, body, createdAt };
}

describe("collectEmotionTagsForAnalysis (Phase 3B Layer 1)", () => {
  // ─────────────────────────────────────────────
  // 1. user_a の emotion 語 → speaker=user_a
  // ─────────────────────────────────────────────
  it("test 1: user_a の emotion 語 → 全 entry が speaker=user_a", () => {
    const msgs = [turn(USER_A, "気分が乗らない")];
    const tags = collectEmotionTagsForAnalysis(msgs, USER_A, USER_B);
    expect(tags.length).toBeGreaterThan(0);
    for (const t of tags) {
      expect(t.speaker).toBe("user_a");
    }
  });

  // ─────────────────────────────────────────────
  // 2. user_b の emotion 語 → speaker=user_b
  // ─────────────────────────────────────────────
  it("test 2: user_b の emotion 語 → 全 entry が speaker=user_b", () => {
    const msgs = [turn(USER_B, "気持ちが整理できない")];
    const tags = collectEmotionTagsForAnalysis(msgs, USER_A, USER_B);
    expect(tags.length).toBeGreaterThan(0);
    for (const t of tags) {
      expect(t.speaker).toBe("user_b");
    }
  });

  // ─────────────────────────────────────────────
  // 3. user_a / user_b が同一 lexeme → "both" に集約
  // ─────────────────────────────────────────────
  it("test 3: user_a と user_b が同一 lexeme '気分' → 1 entry, speaker=both", () => {
    const msgs = [
      turn(USER_A, "気分が違う"),
      turn(USER_B, "私も気分わかる"),
    ];
    const tags = collectEmotionTagsForAnalysis(msgs, USER_A, USER_B);
    const moodKibun = tags.filter((t) => t.source_lexeme === "気分");
    expect(moodKibun.length).toBe(1);
    expect(moodKibun[0].speaker).toBe("both");
  });

  // ─────────────────────────────────────────────
  // 4. user_a / user_b が異なる lexeme → 別 entry, それぞれの speaker
  // ─────────────────────────────────────────────
  it("test 4: 異 lexeme は別 entry、それぞれの speaker を保持", () => {
    const msgs = [
      turn(USER_A, "気分が違う"),
      turn(USER_B, "迷うなあ"),
    ];
    const tags = collectEmotionTagsForAnalysis(msgs, USER_A, USER_B);
    const aTag = tags.find(
      (t) => t.source_lexeme === "気分" && t.speaker === "user_a",
    );
    const bTag = tags.find(
      (t) => t.source_lexeme === "迷う" && t.speaker === "user_b",
    );
    expect(aTag).toBeDefined();
    expect(bTag).toBeDefined();
  });

  // ─────────────────────────────────────────────
  // 5. emotion 語なし → 空配列
  // ─────────────────────────────────────────────
  it("test 5: emotion 語なし → 空配列", () => {
    const msgs = [
      turn(USER_A, "今日は天気がいいね"),
      turn(USER_B, "そうだね"),
    ];
    const tags = collectEmotionTagsForAnalysis(msgs, USER_A, USER_B);
    expect(tags).toEqual([]);
  });

  // ─────────────────────────────────────────────
  // 6. unknown senderId → speaker=unknown
  // ─────────────────────────────────────────────
  it("test 6: senderId が userAId/userBId と不一致 → speaker=unknown", () => {
    const msgs = [turn("stranger", "気分が違う")];
    const tags = collectEmotionTagsForAnalysis(msgs, USER_A, USER_B);
    expect(tags.length).toBeGreaterThan(0);
    for (const t of tags) {
      expect(t.speaker).toBe("unknown");
    }
  });

  // ─────────────────────────────────────────────
  // 6.5. unknown 後に named speaker → named に昇格
  // ─────────────────────────────────────────────
  it("test 6.5: unknown 後に user_a の同 lexeme → user_a に昇格", () => {
    const msgs = [
      turn("stranger", "気分が違う"),
      turn(USER_A, "気分が乗らないわ"),
    ];
    const tags = collectEmotionTagsForAnalysis(msgs, USER_A, USER_B);
    const moodKibun = tags.filter((t) => t.source_lexeme === "気分");
    expect(moodKibun.length).toBe(1);
    expect(moodKibun[0].speaker).toBe("user_a");
  });

  // ─────────────────────────────────────────────
  // 7. malformed input → fail-open (例外なし、空配列または skip)
  // ─────────────────────────────────────────────
  it("test 7: malformed input でも例外を投げず空配列または skip", () => {
    // 空配列
    expect(collectEmotionTagsForAnalysis([], USER_A, USER_B)).toEqual([]);

    // 非配列入力
    expect(
      collectEmotionTagsForAnalysis(
        null as unknown as ConversationTurn[],
        USER_A,
        USER_B,
      ),
    ).toEqual([]);
    expect(
      collectEmotionTagsForAnalysis(
        undefined as unknown as ConversationTurn[],
        USER_A,
        USER_B,
      ),
    ).toEqual([]);

    // 配列内 malformed turn が混在しても全体は崩れない
    const messy = [
      null,
      undefined,
      { senderId: USER_A, body: 123 },
      { senderId: USER_A, body: "気分が違う", createdAt: "2026-04-26T10:00:00Z" },
    ] as unknown as ConversationTurn[];
    expect(() => collectEmotionTagsForAnalysis(messy, USER_A, USER_B)).not.toThrow();
    const tags = collectEmotionTagsForAnalysis(messy, USER_A, USER_B);
    expect(Array.isArray(tags)).toBe(true);
    // 正常 turn 由来の "気分" entry は拾う
    const moodKibun = tags.filter((t) => t.source_lexeme === "気分");
    expect(moodKibun.length).toBe(1);
    expect(moodKibun[0].speaker).toBe("user_a");
  });

  // ─────────────────────────────────────────────
  // 8. 同 user 同 lexeme 重複 → 1 entry
  // ─────────────────────────────────────────────
  it("test 8: 同 user の同 lexeme '気分' を 2 turn に渡って繰り返す → 1 entry", () => {
    const msgs = [
      turn(USER_A, "気分が違う"),
      turn(USER_A, "ほんと気分が下がってる"),
    ];
    const tags = collectEmotionTagsForAnalysis(msgs, USER_A, USER_B);
    const moodKibun = tags.filter((t) => t.source_lexeme === "気分");
    expect(moodKibun.length).toBe(1);
    expect(moodKibun[0].speaker).toBe("user_a");
  });

  // ─────────────────────────────────────────────
  // 統合: analyzeConversation() の戻り値に emotionTags が載る
  // ─────────────────────────────────────────────
  it("integration: analyzeConversation() 戻り値に emotionTags が必ず載る", () => {
    const msgs = [turn(USER_A, "気分が違うんだよね")];
    const r = analyzeConversation(msgs, USER_A, USER_B);
    expect(r.emotionTags).toBeDefined();
    expect(Array.isArray(r.emotionTags)).toBe(true);
    expect((r.emotionTags ?? []).length).toBeGreaterThan(0);
    for (const t of r.emotionTags ?? []) {
      expect(t.speaker).toBe("user_a");
    }
  });

  it("integration: emotion 語ゼロでも emotionTags は空配列で必ず存在する", () => {
    const msgs = [turn(USER_A, "今日は天気がいいね")];
    const r = analyzeConversation(msgs, USER_A, USER_B);
    expect(r.emotionTags).toBeDefined();
    expect(r.emotionTags).toEqual([]);
  });
});
