/**
 * CoAlter Phase A.6 P0: movie 検索クエリ再設計の回帰テスト
 *
 * 背景:
 *   本番 diagnostics ログで `catalogCount===titleWithoutTheaterCount` が頻発し
 *   「catalog は作品を引けるが全件 theater=null → A.5 の missing_where で drop → 0 候補」
 *   という血流停止が起きていた。原因は webConnector の movie 用クエリ 3 本が
 *   listicle ばかり返し、映画館ページ (hlo.tohotheater.jp 等) を引けていなかったこと。
 *
 * P0 で入れた不変条件を本テストで固定する:
 *   1. 3 本全てが「映画館 / 劇場 / TOHOシネマズ / 109シネマズ / 上映館」の
 *      どれかを含む (映画館ドメイン誘引)
 *   2. location が null でも全クエリが発火する (旧実装では q3 が location 依存だった)
 *   3. "Filmarks ランキング" を単独で含むクエリは出さない (listicle 生成源)
 *   4. mentioned candidate の movie クエリも theater 引き込みトークンを含む
 */

import { describe, it, expect, vi } from "vitest";

// perspectiveEngine が "server-only" を引くので test 実行時は空 module にする
vi.mock("server-only", () => ({}));
vi.mock("@/lib/stargazer/perspectiveEngine", () => ({
  executeSearch: vi.fn(async () => []),
}));

import { decideSearch } from "@/lib/coalter/webConnector";
import type { ConversationAnalysis, ConversationTurn } from "@/lib/coalter/types";

function baseAnalysis(overrides: Partial<ConversationAnalysis> = {}): ConversationAnalysis {
  const turns: ConversationTurn[] = [
    { senderId: "a", body: "映画見たいね", createdAt: "2026-04-18T10:00:00Z" },
  ];
  return {
    theme: "movie",
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
    },
    constraintScore: 0.5,
    agreedConstraints: [],
    ...overrides,
  };
}

// ──────────── theater 引き込みトークン ────────────
const THEATER_TOKEN_RE = /映画館|劇場|TOHOシネマズ|109シネマズ|MOVIX|上映館/;

describe("webConnector: movie queries target theater-bearing pages (P0)", () => {
  it("location=null でも 3 本全部が theater 引き込みトークンを含む", () => {
    const d = decideSearch(baseAnalysis());
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThanOrEqual(1);
    expect(d.queries.length).toBeLessThanOrEqual(3);
    for (const q of d.queries) {
      expect(q).toMatch(THEATER_TOKEN_RE);
    }
  });

  it("location が入ると全クエリが area prefix を含む", () => {
    const d = decideSearch(
      baseAnalysis({
        extractedConstraints: {
          date: null,
          location: "渋谷",
          budget: null,
          timeSlot: null,
          preferences: [],
        },
      }),
    );
    expect(d.queries.length).toBeGreaterThanOrEqual(1);
    for (const q of d.queries) {
      expect(q.startsWith("渋谷")).toBe(true);
    }
  });

  it("listicle 生成源である 'Filmarks ランキング' を単独クエリに含まない", () => {
    const d = decideSearch(baseAnalysis());
    for (const q of d.queries) {
      // 'Filmarks' と 'ランキング' を同時に含むクエリは出さない
      const hasFilmarks = /Filmarks/i.test(q);
      const hasRanking = /ランキング/.test(q);
      expect(hasFilmarks && hasRanking).toBe(false);
    }
  });

  it("旧クエリ '公開中 映画 話題作' (location=null fallback) は出さない", () => {
    const d = decideSearch(baseAnalysis());
    for (const q of d.queries) {
      // 「公開中 映画 話題作」は theater を引けない listicle 用クエリだった
      expect(/公開中 映画 話題作/.test(q)).toBe(false);
    }
  });

  it("mentioned candidate のみ（actionable 制約なし）→ skip（Bug-1 Phase 3 §4.4 / §8.2 precision）", () => {
    // 旧契約（Phase A.6 P0）: title mention のみで fallback クエリを生成していた。
    // Phase 3 §4.4 移行で actionable-only gate に統一。"ラストマイル" は
    // TARGET_PATTERNS.movie 非該当 + location/time 欠落 → hasActionable=false → skip
    // （§8.2 precision KPI: `retrieval_fired=true && hasActionable=false = 0%`）。
    const d = decideSearch(
      baseAnalysis({
        recentMessages: [
          {
            senderId: "a",
            body: "ラストマイルはどう？",
            createdAt: "2026-04-18T10:00:00Z",
          },
        ],
      }),
    );
    expect(d.shouldSearch).toBe(false);
    expect(d.queries).toEqual([]);
    expect(d.reason).toContain("actionable");
  });

  it("年月トークン (2026年4月 等) が少なくとも 1 本のクエリに含まれる", () => {
    const d = decideSearch(baseAnalysis());
    const now = new Date();
    const ym = `${now.getFullYear()}年${now.getMonth() + 1}月`;
    const hasYearMonth = d.queries.some((q) => q.includes(ym));
    expect(hasYearMonth).toBe(true);
  });
});
