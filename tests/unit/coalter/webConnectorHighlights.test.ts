/**
 * CoAlter Phase A.7 D4 実験 (2026-04-19): highlights 連結の効果測定
 *
 * 仮説 G: EXA の `r.highlights` (sentence-level 重要文) を webConnector が捨てており、
 *   theater 情報がそこに含まれている場合に parseMovieScreenings が拾えない。
 *   本実験ブランチでは r.text slice(0,200) + highlights を " / " で連結し、
 *   最大 500 字の description を生成する。
 *
 * このファイルは feat/coalter-highlights-experiment ブランチ専用テスト。
 * merge/deploy せず、効果の見積もりのみに使う。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const executeSearchMock = vi.fn();
vi.mock("@/lib/stargazer/perspectiveEngine", () => ({
  executeSearch: (...args: unknown[]) => executeSearchMock(...args),
}));

import { decideSearch, searchAndFilter } from "@/lib/coalter/webConnector";
import type {
  CoAlterPersonProfile,
  ConversationAnalysis,
  SearchDecision,
} from "@/lib/coalter/types";

function profile(id: string): CoAlterPersonProfile {
  return {
    userId: id,
    displayName: id,
    communicationStyle: {
      directVsDiplomatic: null,
      conflictStyle: null,
      attachmentStyle: null,
      reassuranceNeed: null,
      emotionalVariability: null,
    },
    decisionStyle: {
      noveltyPreference: 0.5,
      decisionSpeed: null,
      riskTolerance: 0.5,
    },
    interests: [],
    values: [],
    archetypeCode: null,
    coreFear: null,
    coreDesire: null,
  };
}

function decisionOf(queries: string[]): SearchDecision {
  return {
    shouldSearch: true,
    reason: "test",
    queries,
  };
}

describe("searchAndFilter — D4 highlights concatenation experiment", () => {
  beforeEach(() => {
    executeSearchMock.mockReset();
  });

  it("highlights が空なら従来どおり description = r.text.slice(0, 200)", async () => {
    executeSearchMock.mockResolvedValueOnce([
      {
        title: "ラストマイル",
        url: "https://eiga.com/movie/last-mile",
        text: "サスペンス映画。118分。評価★4.2。監督は野木亜紀子。",
        highlights: [],
      },
    ]);

    const cands = await searchAndFilter(
      decisionOf(["映画館 今週末 上映スケジュール"]),
      profile("a"),
      profile("b"),
    );
    expect(cands.length).toBe(1);
    expect(cands[0].description).toBe(
      "サスペンス映画。118分。評価★4.2。監督は野木亜紀子。",
    );
  });

  it("highlights があれば description に ' / ' で連結され、500 字で上限 cap される", async () => {
    const longText = "A".repeat(400);
    executeSearchMock.mockResolvedValueOnce([
      {
        title: "ラストマイル",
        url: "https://eiga.com/movie/last-mile",
        text: longText,
        highlights: ["TOHOシネマズ新宿で上映中。", "19:00 / 21:30 の 2 回。"],
      },
    ]);

    const cands = await searchAndFilter(
      decisionOf(["映画館 今週末"]),
      profile("a"),
      profile("b"),
    );
    expect(cands.length).toBe(1);
    // 先頭 200 字が r.text から、続いて highlights が " / " で連結
    expect(cands[0].description.startsWith("A".repeat(200))).toBe(true);
    expect(cands[0].description).toMatch(/TOHOシネマズ新宿で上映中。/);
    // 500 字 cap
    expect(cands[0].description.length).toBeLessThanOrEqual(500);
  });

  it("listicle meta + highlights に theater が入っていれば parseMovieScreenings が拾える経路", async () => {
    // listicle meta 部分 (r.text slice 200) では作品名だけ並び、
    // highlights 部分に「TOHOシネマズ渋谷で上映中」が入るケース。
    executeSearchMock.mockResolvedValueOnce([
      {
        title: "【2026年4月】東京の注目映画10選 | 映画.com",
        url: "https://eiga.com/feature/tokyo-april",
        text: "今月の注目作。『ラストマイル』『PERFECT DAYS』『アナログ』『怪物』が人気。",
        highlights: [
          "TOHOシネマズ渋谷で上映中の『ラストマイル』は必見。",
          "MOVIX昭島では『PERFECT DAYS』が好評。",
        ],
      },
    ]);

    const cands = await searchAndFilter(
      decisionOf(["映画館 今週末"]),
      profile("a"),
      profile("b"),
    );
    expect(cands.length).toBe(1);
    // highlights が description に入っている → theater 抽出の材料が増えた
    expect(cands[0].description).toContain("TOHOシネマズ渋谷");
    expect(cands[0].description).toContain("MOVIX昭島");
  });

  it("decideSearch 経由の統合: movie theme で highlights 付きの raw を受けて candidate が作られる", async () => {
    const analysis: ConversationAnalysis = {
      theme: "movie",
      recentMessages: [
        { senderId: "a", body: "映画見たいね", createdAt: "2026-04-18T10:00:00Z" },
      ],
      stalemate: null,
      caringIntensityA: 0.5,
      caringIntensityB: 0.5,
      extractedConstraints: {
        date: null,
        location: null,
        budget: null,
        timeSlot: null,
        preferences: [],
      },
      constraintScore: 0.5,
      agreedConstraints: [],
    };
    const decision = decideSearch(analysis);
    expect(decision.shouldSearch).toBe(true);

    executeSearchMock.mockResolvedValueOnce([
      {
        title: "ラストマイル",
        url: "https://hlo.tohotheater.jp/net/movie/last-mile",
        text: "サスペンス。118分。",
        highlights: ["TOHOシネマズ渋谷 19:00 / 21:30"],
      },
    ]);
    const cands = await searchAndFilter(decision, profile("a"), profile("b"));
    expect(cands.length).toBe(1);
    expect(cands[0].description).toContain("TOHOシネマズ渋谷");
  });
});
