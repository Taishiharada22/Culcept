/**
 * CoAlter Bug-1 Phase 3 — 系統 A: actionable + emotional → retrieval 発火
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §8.1 系統 A
 * Plan: docs/coalter-implementation-plan-mainstream.md §2.3
 *
 * 契約:
 *   emotion tag が actionable retrieval を遮断しない（over-blocking 除去の証明）。
 *   感情語が含まれていても、actionable 制約が揃っていれば shouldSearch=true。
 *
 * 対象ケース（§8.1 系統 A）:
 *   A-1: movie + target=アニメ + emotion=気分/迷う
 *        （handoff Pattern A「何見たい気分?」「迷うね」再現）
 *   A-2: food + location=新宿 + target=ラーメン + emotion=気分
 *        （「今夜ラーメン食べたいけど気分が乗らない」再現）
 *   A-3: food + location + time + emotion=関係/仲
 *        （「渋谷で夕方に会おうって話で、仲の話もちょっと」再現）
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
    constraintScore: 0.3,
    agreedConstraints: [],
  };
}

describe("decideSearch 系統 A: actionable + emotional → shouldSearch=true", () => {
  it("A-1: movie + target(アニメ) + emotion(気分/迷う) → 発火", () => {
    const d = decideSearch(
      makeAnalysis({
        theme: "movie",
        body: "何見たい気分? アニメ映画にしようか迷うね",
        constraints: { preferences: ["アニメ"] },
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);
    expect(d.reason).toContain("movie");
  });

  it("A-2: food + location(新宿) + target(ラーメン) + emotion(気分) → 発火", () => {
    const d = decideSearch(
      makeAnalysis({
        theme: "food",
        body: "今夜ラーメン食べたいけど気分が乗らない",
        constraints: {
          location: "新宿",
          preferences: ["ラーメン"],
        },
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);
    expect(d.reason).toContain("food");
  });

  it("A-3: activity + location(渋谷) + date + emotion(仲) → 発火", () => {
    const d = decideSearch(
      makeAnalysis({
        theme: "activity",
        body: "渋谷で夕方に会おうって話で、仲の話もちょっと",
        constraints: {
          location: "渋谷",
          date: "今日",
          timeSlot: "夕方",
        },
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);
    expect(d.reason).toContain("activity");
  });

  it("A-4: travel + location(京都) + emotion(気分/関係) → 発火", () => {
    const d = decideSearch(
      makeAnalysis({
        theme: "travel",
        body: "京都で温泉行きたい気分、二人の関係を深めたい",
        constraints: { location: "京都" },
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);
    expect(d.reason).toContain("travel");
  });
});
