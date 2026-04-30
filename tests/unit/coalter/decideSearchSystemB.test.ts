/**
 * CoAlter Bug-1 Phase 3 — 系統 B: non-actionable + emotional → retrieval skip
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §8.1 系統 B
 * Plan: docs/coalter-implementation-plan-mainstream.md §2.3
 *
 * 契約（precision ガード）:
 *   naive fix（「NO_SEARCH_PATTERNS を外した」だけ）では emotion のみの会話で
 *   無意味な EXA クエリが連発される。本テストは actionable=false のとき
 *   emotion 有無に関わらず skip することを保証する。
 *
 * 対象ケース（§8.1 系統 B）:
 *   B-1: food theme + emotion=relation のみ（actionable 制約ゼロ）
 *   B-2: food theme + emotion=mood のみ
 *   B-3: food theme + emotion=friction のみ
 *
 * skip 理由: reason は "actionable" を含む（Gate 2 の reason 文言固定）。
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
    constraintScore: 0.1,
    agreedConstraints: [],
  };
}

describe("decideSearch 系統 B: non-actionable + emotional → shouldSearch=false", () => {
  it("B-1: food + emotion(relation) のみ → skip", () => {
    const d = decideSearch(
      makeAnalysis({ theme: "food", body: "関係性について話したい" }),
    );
    expect(d.shouldSearch).toBe(false);
    expect(d.queries).toEqual([]);
    expect(d.reason).toContain("actionable");
  });

  it("B-2: food + emotion(mood) のみ → skip", () => {
    const d = decideSearch(
      makeAnalysis({ theme: "food", body: "なんか気分が乗らない" }),
    );
    expect(d.shouldSearch).toBe(false);
    expect(d.queries).toEqual([]);
    expect(d.reason).toContain("actionable");
  });

  it("B-3: food + emotion(friction) のみ → skip", () => {
    const d = decideSearch(
      makeAnalysis({ theme: "food", body: "最近すれ違いが多いよね" }),
    );
    expect(d.shouldSearch).toBe(false);
    expect(d.queries).toEqual([]);
    expect(d.reason).toContain("actionable");
  });

  it("B-4: movie + emotion のみ（location/time/target 全て不在）→ skip", () => {
    const d = decideSearch(
      makeAnalysis({ theme: "movie", body: "気持ちが落ち着かない" }),
    );
    expect(d.shouldSearch).toBe(false);
    expect(d.queries).toEqual([]);
    expect(d.reason).toContain("actionable");
  });

  it("B-5: travel + emotion のみ → skip", () => {
    const d = decideSearch(
      makeAnalysis({ theme: "travel", body: "距離感が気になる" }),
    );
    expect(d.shouldSearch).toBe(false);
    expect(d.queries).toEqual([]);
    expect(d.reason).toContain("actionable");
  });

  it("B-6: activity + emotion のみ → skip", () => {
    const d = decideSearch(
      makeAnalysis({ theme: "activity", body: "感情が追いつかない" }),
    );
    expect(d.shouldSearch).toBe(false);
    expect(d.queries).toEqual([]);
    expect(d.reason).toContain("actionable");
  });
});

describe("境界系統 — SEARCH_REQUIRED_THEMES 外 × emotion", () => {
  it("theme=general + emotion → skip（Gate 1 で skip, reason は theme 名）", () => {
    const d = decideSearch(
      makeAnalysis({
        theme: "general" as ConversationTheme,
        body: "気分が乗らない",
      }),
    );
    expect(d.shouldSearch).toBe(false);
    expect(d.queries).toEqual([]);
    expect(d.reason).toContain("general");
  });

  it("空会話（body 空, 制約ゼロ）→ Gate 2 で skip", () => {
    const d = decideSearch(makeAnalysis({ theme: "food", body: "" }));
    expect(d.shouldSearch).toBe(false);
    expect(d.queries).toEqual([]);
  });
});
