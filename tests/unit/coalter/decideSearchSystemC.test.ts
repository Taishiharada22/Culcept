/**
 * CoAlter Bug-1 Phase 3 — 系統 C: actionable + low-emotion → retrieval 発火
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §8.1 系統 C
 * Plan: docs/coalter-implementation-plan-mainstream.md §2.3
 *
 * 契約（従来健全系の維持 / 回帰ゼロ証明）:
 *   感情語が含まれない actionable 会話は Phase 3 以前と完全同挙動で発火する。
 *   Bug-1 修正が既存系の retrieval を壊していないことを担保する。
 *
 * 対象ケース（§8.1 系統 C）:
 *   C-1: food + target=ラーメン + time=今夜（感情語なし）
 *   C-2: food + location=渋谷 + time=土曜 19 時 + target=ディナー
 *   C-3: movie + target=ホラー + location=新宿
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stargazer/perspectiveEngine", () => ({
  executeSearch: vi.fn(async () => []),
}));

import { decideSearch } from "@/lib/coalter/webConnector";
import type {
  ConversationAnalysis,
  ConversationTheme,
  ConversationTurn,
  ExtractedConstraints,
} from "@/lib/coalter/types";

type PartialConstraints = Partial<ExtractedConstraints>;

function makeAnalysis(opts: {
  theme: ConversationTheme;
  body: string;
  constraints?: PartialConstraints;
}): ConversationAnalysis {
  const turns: ConversationTurn[] = [
    {
      senderId: "a",
      body: opts.body,
      createdAt: "2026-04-24T10:00:00Z",
    },
  ];
  return {
    theme: opts.theme,
    stalemate: null,
    recentMessages: turns,
    caringIntensityA: 0.5,
    caringIntensityB: 0.5,
    extractedConstraints: {
      date: null,
      location: null,
      budget: null,
      timeSlot: null,
      preferences: [],
      ...(opts.constraints ?? {}),
    },
    constraintScore: 0.5,
    agreedConstraints: [],
  };
}

describe("decideSearch 系統 C: actionable + low-emotion → shouldSearch=true", () => {
  it("C-1: food + target(ラーメン) + time(今夜) → 発火", () => {
    const d = decideSearch(
      makeAnalysis({
        theme: "food",
        body: "今夜ラーメン食べに行こう",
        constraints: {
          timeSlot: "夜",
          preferences: ["ラーメン"],
        },
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);
    expect(d.reason).toContain("food");
  });

  it("C-2: food + location(渋谷) + time(土曜 19 時) + target(ディナー) → 発火", () => {
    const d = decideSearch(
      makeAnalysis({
        theme: "food",
        body: "土曜19時に渋谷でディナー予約しよう",
        constraints: {
          location: "渋谷",
          date: "土曜",
          timeSlot: "夜",
          preferences: ["ディナー"],
        },
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);
    expect(d.reason).toContain("food");
  });

  it("C-3: movie + target(ホラー) + location(新宿) → 発火", () => {
    const d = decideSearch(
      makeAnalysis({
        theme: "movie",
        body: "ホラー映画見に行こうよ、新宿で",
        constraints: {
          location: "新宿",
          preferences: ["ホラー"],
        },
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);
    expect(d.reason).toContain("movie");
  });

  it("C-4: travel + location(京都) only → 発火（travel は location 単独で actionable）", () => {
    const d = decideSearch(
      makeAnalysis({
        theme: "travel",
        body: "京都に行きたい",
        constraints: { location: "京都" },
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);
    expect(d.reason).toContain("travel");
  });

  it("C-5: activity + target(美術館) only → 発火（activity は target 単独で actionable）", () => {
    const d = decideSearch(
      makeAnalysis({
        theme: "activity",
        body: "美術館行きたい",
        constraints: { preferences: ["美術館"] },
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);
    expect(d.reason).toContain("activity");
  });
});
