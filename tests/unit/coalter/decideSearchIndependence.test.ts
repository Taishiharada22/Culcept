/**
 * CoAlter Bug-1 Phase 3 — §8.1.5 失敗独立テスト（decideSearch 側）
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §2.3 / §8.1.5
 * Plan: docs/coalter-implementation-plan-mainstream.md §2.3
 *
 * 契約（§2.3 条文の decideSearch 保護）:
 *   extractEmotionTags の成否が decideSearch の挙動を左右してはいけない。
 *   将来 conversationParser 側で emotion 抽出が失敗しても、decideSearch は
 *   actionable 制約のみから決断を下す（失敗独立）。
 *
 * 検証観点（§8.1.5）:
 *   ① emotion 抽出が throw しても decideSearch は正常判定（= 一切呼ばない）
 *   ② 同一 analysis に対する決定的挙動（2 回呼び同結果）
 *   ③ analysis に emotionTags を付けても無視される（behavior invariance）
 *   ④ decideSearch は fetch / XMLHttpRequest を呼ばない（外界 touch ゼロ）
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

describe("§8.1.5-① emotion 抽出失敗 → decideSearch 正常判定", () => {
  it("extractEmotionTags を throw mock しても decideSearch は actionable のみで判定", async () => {
    // extractEmotionTags モジュールを throw する mock で上書き。
    //   decideSearch がこれを参照していれば throw が伝播する（= 失敗独立違反）。
    //   本実装では decideSearch は extractEmotionTags を import していないので throw しない。
    vi.doMock("@/lib/coalter/emotion/extract", () => ({
      extractEmotionTags: () => {
        throw new Error("extract failed — 失敗独立テスト用 mock");
      },
    }));

    // mock 適用後に webConnector を再 import（module cache を avoidance）
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/stargazer/perspectiveEngine", () => ({
      executeSearch: vi.fn(async () => []),
    }));

    const { decideSearch: ds } = await import("@/lib/coalter/webConnector");

    const d = ds(
      makeAnalysis({
        theme: "food",
        body: "新宿でラーメン食べたい気分",
        constraints: { location: "新宿", preferences: ["ラーメン"] },
      }),
    );

    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);

    vi.doUnmock("@/lib/coalter/emotion/extract");
    vi.resetModules();
  });
});

describe("§8.1.5-② 決定性（pure function）", () => {
  it("同一 analysis で 2 回呼んでも同一 shouldSearch / queries", () => {
    const a = makeAnalysis({
      theme: "food",
      body: "新宿でラーメン食べたい",
      constraints: { location: "新宿", preferences: ["ラーメン"] },
    });
    const d1 = decideSearch(a);
    const d2 = decideSearch(a);
    expect(d1.shouldSearch).toBe(d2.shouldSearch);
    expect(JSON.stringify(d1.queries)).toBe(JSON.stringify(d2.queries));
    expect(d1.reason).toBe(d2.reason);
  });

  it("actionable=false でも決定的", () => {
    const a = makeAnalysis({ theme: "food", body: "気分が乗らない" });
    const d1 = decideSearch(a);
    const d2 = decideSearch(a);
    expect(d1.shouldSearch).toBe(false);
    expect(d2.shouldSearch).toBe(false);
    expect(d1.reason).toBe(d2.reason);
  });
});

describe("§8.1.5-③ emotion tag 付帯による behavior 不変", () => {
  it("同一 actionable でも analysis に emotion 語を足し引きして同一結果", () => {
    const withEmotion = decideSearch(
      makeAnalysis({
        theme: "food",
        body: "新宿でラーメン食べたい気分が乗らない",
        constraints: { location: "新宿", preferences: ["ラーメン"] },
      }),
    );
    const withoutEmotion = decideSearch(
      makeAnalysis({
        theme: "food",
        body: "新宿でラーメン食べたい",
        constraints: { location: "新宿", preferences: ["ラーメン"] },
      }),
    );
    // 感情語の有無に関わらず shouldSearch は同一（§2.3 条文 2 の保証）
    expect(withEmotion.shouldSearch).toBe(withoutEmotion.shouldSearch);
    expect(withEmotion.shouldSearch).toBe(true);
  });

  it("non-actionable 側でも emotion の有無で挙動が変わらない", () => {
    const withEmotion = decideSearch(
      makeAnalysis({ theme: "food", body: "気分が乗らない" }),
    );
    const neutral = decideSearch(
      makeAnalysis({ theme: "food", body: "何食べようかな" }),
    );
    expect(withEmotion.shouldSearch).toBe(false);
    expect(neutral.shouldSearch).toBe(false);
  });
});

describe("§8.1.5-④ 外界 touch ゼロ（失敗独立 §2.3 条文 1）", () => {
  it("decideSearch 実行中に fetch / XMLHttpRequest を呼ばない", () => {
    const g = globalThis as Record<string, unknown>;
    const originalFetch = g.fetch;
    const originalXHR = g.XMLHttpRequest;

    g.fetch = () => {
      throw new Error("decideSearch は fetch を呼んではいけない");
    };
    g.XMLHttpRequest = class {
      constructor() {
        throw new Error("decideSearch は XMLHttpRequest を呼んではいけない");
      }
    };

    try {
      const d = decideSearch(
        makeAnalysis({
          theme: "food",
          body: "新宿でラーメン食べたい",
          constraints: { location: "新宿", preferences: ["ラーメン"] },
        }),
      );
      expect(d.shouldSearch).toBe(true);
    } finally {
      g.fetch = originalFetch;
      g.XMLHttpRequest = originalXHR;
    }
  });
});
