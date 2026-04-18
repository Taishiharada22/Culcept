/**
 * CoAlter Phase B Commit 3 (2026-04-19): food 検索クエリ再設計の回帰テスト
 *
 * 方針:
 *   - 食べログ / Retty 等の listing site は venue-bearing なので保持
 *   - "おすすめ10選" "まとめ" "ランキング" 等の article-listing 用語のみ除外
 *   - 公式導線誘引クエリを 1 本追加 (bookingProviderDistribution 多様性確保)
 *
 * CEO 追加条件 (着手前固定):
 *   - 公式誘引クエリには negative を過剰適用しない
 *     → "公式サイト 予約" クエリに "-まとめ" 等を含めない
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stargazer/perspectiveEngine", () => ({
  executeSearch: vi.fn(async () => []),
}));

import { decideSearch } from "@/lib/coalter/webConnector";
import type { ConversationAnalysis, ConversationTurn } from "@/lib/coalter/types";

function foodAnalysis(
  overrides: Partial<ConversationAnalysis> = {},
): ConversationAnalysis {
  const turns: ConversationTurn[] = [
    { senderId: "a", body: "ご飯どこ行く？", createdAt: "2026-04-19T10:00:00Z" },
  ];
  return {
    theme: "food",
    stalemate: null,
    recentMessages: turns,
    caringIntensityA: 0.5,
    caringIntensityB: 0.5,
    extractedConstraints: {
      date: null,
      location: "渋谷",
      budget: null,
      timeSlot: null,
      preferences: [],
    },
    constraintScore: 0.5,
    agreedConstraints: [],
    ...overrides,
  };
}

// listing-venue 判定用（食べログ / Retty トークン）
const LISTING_TOKEN_RE = /食べログ|Retty|ぐるなび|ホットペッパー|レストラン|人気店/;
// 公式誘引判定用
const OFFICIAL_INVITE_TOKEN_RE = /公式サイト|公式|予約/;
// article-listing 除外 negative
const ARTICLE_LISTING_NEGATIVE_RE = /-まとめ|-おすすめ10選|-ランキング/;

describe("webConnector: food queries (Phase B Commit 3)", () => {
  it("listing-venue bearing クエリに article-listing 用語が negative で入る", () => {
    const d = decideSearch(foodAnalysis());
    expect(d.shouldSearch).toBe(true);
    // 少なくとも 1 本は listing 用語を含む
    const listingQueries = d.queries.filter((q) => LISTING_TOKEN_RE.test(q));
    expect(listingQueries.length).toBeGreaterThanOrEqual(1);
    // listing クエリの少なくとも 1 本は article-listing negative を持つ
    const withNegatives = listingQueries.filter((q) =>
      ARTICLE_LISTING_NEGATIVE_RE.test(q),
    );
    expect(withNegatives.length).toBeGreaterThanOrEqual(1);
  });

  it("公式誘引クエリが 1 本生成される", () => {
    const d = decideSearch(foodAnalysis());
    const officialQueries = d.queries.filter((q) =>
      OFFICIAL_INVITE_TOKEN_RE.test(q),
    );
    expect(officialQueries.length).toBeGreaterThanOrEqual(1);
  });

  it("公式誘引クエリには article-listing negative を過剰適用しない", () => {
    // CEO 追加条件: 公式誘引クエリは公式トップや予約ページを除外しないため
    // negative を**あえて**つけない
    const d = decideSearch(foodAnalysis());
    const officialQueries = d.queries.filter(
      (q) =>
        OFFICIAL_INVITE_TOKEN_RE.test(q) &&
        // listing token は含まない（listing クエリと区別）
        !LISTING_TOKEN_RE.test(q),
    );
    expect(officialQueries.length).toBeGreaterThanOrEqual(1);
    for (const q of officialQueries) {
      expect(q).not.toMatch(ARTICLE_LISTING_NEGATIVE_RE);
    }
  });

  it("food 食べログ等の listing site は保持（排除されない）", () => {
    const d = decideSearch(foodAnalysis());
    const hasListingSite = d.queries.some((q) =>
      /食べログ|Retty|ぐるなび|ホットペッパー/.test(q),
    );
    expect(hasListingSite).toBe(true);
  });

  it("location=null でも少なくとも 1 本のクエリが発火する", () => {
    const d = decideSearch(
      foodAnalysis({
        extractedConstraints: {
          date: null,
          location: null,
          budget: null,
          timeSlot: null,
          preferences: [],
        },
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThanOrEqual(1);
  });

  it("styleHint ある場合は style 人気店クエリが出る", () => {
    const d = decideSearch(
      foodAnalysis({
        agreedConstraints: [
          {
            kind: "style",
            normalizedValue: "style:イタリアン",
            rawText: "イタリアン",
            strength: "hard",
            confidence: 0.9,
          } as never,
        ],
      }),
    );
    const styleQuery = d.queries.find((q) => /イタリアン/.test(q) && /人気店/.test(q));
    expect(styleQuery).toBeTruthy();
  });
});
