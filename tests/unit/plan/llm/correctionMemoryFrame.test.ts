/**
 * Phase 3-N Plan P2 Step 2 v3.1 — Correction Memory Frame contract test
 *
 * 検証範囲 (= readiness v3.1 §2 + GPT Q2 確定):
 *   - recordAlterNoteReaction (= stub、 fail-open)
 *   - summarizeReactions (= pure aggregation)
 *
 * 不変原則:
 *   - pure aggregation 部分は LLM / API / DB 不使用
 *   - record stub は fail-open (= 例外 throw しない)
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  recordAlterNoteReaction,
  summarizeReactions,
  type AlterNoteReactionEvent,
} from "@/lib/plan/llm/correctionMemoryFrame";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// recordAlterNoteReaction (= stub)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("recordAlterNoteReaction (= Step 2 v3.1 stub)", () => {
  it("viewed event を受領 (= 例外 throw しない)", async () => {
    const ev: AlterNoteReactionEvent = {
      eventKind: "viewed",
      anchorId: "anchor-1",
      alterNoteText: "夕方のカフェ、 静かに沈む時間",
      alterNoteSource: "llm",
      category: "cafe",
      observedAt: new Date().toISOString(),
    };
    await expect(recordAlterNoteReaction(ev)).resolves.toBeUndefined();
  });

  it("opened_detail / edited / deleted 全 event 受領", async () => {
    for (const kind of ["opened_detail", "edited_anchor", "deleted_anchor"] as const) {
      const ev: AlterNoteReactionEvent = {
        eventKind: kind,
        anchorId: "anchor-1",
        alterNoteText: "test",
        alterNoteSource: "llm",
        category: "cafe",
        observedAt: new Date().toISOString(),
      };
      await expect(recordAlterNoteReaction(ev)).resolves.toBeUndefined();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// summarizeReactions (= pure aggregation)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("summarizeReactions: pure aggregation", () => {
  it("空配列 → 全 zero summary", () => {
    const s = summarizeReactions([]);
    expect(s.totalViewed).toBe(0);
    expect(s.llmEditedRate).toBe(0);
    expect(s.llmDeletedRate).toBe(0);
    expect(s.categoryEditRates).toEqual({});
  });

  it("viewed のみ → llmEditedRate 0", () => {
    const events: AlterNoteReactionEvent[] = [
      {
        eventKind: "viewed",
        anchorId: "a1",
        alterNoteText: "test",
        alterNoteSource: "llm",
        category: "cafe",
        observedAt: new Date().toISOString(),
      },
    ];
    const s = summarizeReactions(events);
    expect(s.totalViewed).toBe(1);
    expect(s.llmEditedRate).toBe(0);
  });

  it("3 viewed + 1 edited (= llm) → llmEditedRate ≒ 0.33", () => {
    const ts = new Date().toISOString();
    const events: AlterNoteReactionEvent[] = [
      { eventKind: "viewed", anchorId: "a1", alterNoteText: "t", alterNoteSource: "llm", category: "cafe", observedAt: ts },
      { eventKind: "viewed", anchorId: "a2", alterNoteText: "t", alterNoteSource: "llm", category: "cafe", observedAt: ts },
      { eventKind: "viewed", anchorId: "a3", alterNoteText: "t", alterNoteSource: "llm", category: "cafe", observedAt: ts },
      { eventKind: "edited_anchor", anchorId: "a1", alterNoteText: "t", alterNoteSource: "llm", category: "cafe", observedAt: ts },
    ];
    const s = summarizeReactions(events);
    expect(s.llmEditedRate).toBeCloseTo(1 / 3, 2);
  });

  it("category 別集計 → 該当 category のみ rate 出る", () => {
    const ts = new Date().toISOString();
    const events: AlterNoteReactionEvent[] = [
      { eventKind: "viewed", anchorId: "a1", alterNoteText: "t", alterNoteSource: "llm", category: "cafe", observedAt: ts },
      { eventKind: "viewed", anchorId: "a2", alterNoteText: "t", alterNoteSource: "llm", category: "work", observedAt: ts },
      { eventKind: "edited_anchor", anchorId: "a2", alterNoteText: "t", alterNoteSource: "llm", category: "work", observedAt: ts },
    ];
    const s = summarizeReactions(events);
    expect(s.categoryEditRates.cafe).toBe(0);
    expect(s.categoryEditRates.work).toBe(1);
  });

  it("deterministic と llm を分けて集計", () => {
    const ts = new Date().toISOString();
    const events: AlterNoteReactionEvent[] = [
      { eventKind: "viewed", anchorId: "a1", alterNoteText: "t", alterNoteSource: "llm", category: "cafe", observedAt: ts },
      { eventKind: "viewed", anchorId: "a2", alterNoteText: "t", alterNoteSource: "deterministic", category: "cafe", observedAt: ts },
      { eventKind: "deleted_anchor", anchorId: "a1", alterNoteText: "t", alterNoteSource: "llm", category: "cafe", observedAt: ts },
      { eventKind: "deleted_anchor", anchorId: "a2", alterNoteText: "t", alterNoteSource: "deterministic", category: "cafe", observedAt: ts },
    ];
    const s = summarizeReactions(events);
    expect(s.llmDeletedRate).toBe(1);
    expect(s.deterministicDeletedRate).toBe(1);
  });

  it("deterministic (= 同入力 → 同 summary)", () => {
    const events: AlterNoteReactionEvent[] = [];
    expect(summarizeReactions(events)).toEqual(summarizeReactions(events));
  });

  it("入力 mutate なし", () => {
    const events: AlterNoteReactionEvent[] = [
      { eventKind: "viewed", anchorId: "a1", alterNoteText: "t", alterNoteSource: "llm", category: "cafe", observedAt: "2026-05-25T00:00:00Z" },
    ];
    const snapshot = JSON.stringify(events);
    summarizeReactions(events);
    expect(JSON.stringify(events)).toBe(snapshot);
  });
});
