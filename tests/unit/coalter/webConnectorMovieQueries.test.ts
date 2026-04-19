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

  it("mentioned candidate の movie クエリも theater 引き込みトークンを含む", () => {
    // 「ラストマイルはどう？」のような候補提示パターン
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
    // 候補ベースのクエリが先頭に出る
    expect(d.queries.length).toBeGreaterThan(0);
    const candidateQuery = d.queries.find((q) => q.includes("ラストマイル"));
    expect(candidateQuery).toBeDefined();
    expect(candidateQuery!).toMatch(THEATER_TOKEN_RE);
  });

  it("年月トークン (2026年4月 等) が少なくとも 1 本のクエリに含まれる", () => {
    const d = decideSearch(baseAnalysis());
    const now = new Date();
    const ym = `${now.getFullYear()}年${now.getMonth() + 1}月`;
    const hasYearMonth = d.queries.some((q) => q.includes(ym));
    expect(hasYearMonth).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Phase A.7 (A2 / 2026-04-19): movie 初回 fallback
//
// preview 本カウント Pattern A 対応: theme=movie なのに「気分」「迷う」等で
// NO_SEARCH_PATTERNS に引っかかって shouldSearch=false に落ちる退化を、
// 「明白な movie 意図」がある場合だけ迂回する。
// food / travel には適用しない。queries が組めない場合は空打ちしない。
// ─────────────────────────────────────────────
describe("webConnector: movie fallback — 感情語があっても movie 意図が明白なら検索発火 (A2)", () => {
  it("theme=movie + '映画' + '気分' → NO_SEARCH_PATTERNS を迂回して検索発火", () => {
    const d = decideSearch(
      baseAnalysis({
        recentMessages: [
          {
            senderId: "a",
            body: "今夜映画見たい気分なんだよね",
            createdAt: "2026-04-18T10:00:00Z",
          },
        ],
      }),
    );
    expect(d.shouldSearch).toBe(true);
    expect(d.queries.length).toBeGreaterThan(0);
  });

  it("theme=movie + '劇場' + '迷う' → fallback 発火", () => {
    const d = decideSearch(
      baseAnalysis({
        recentMessages: [
          {
            senderId: "a",
            body: "劇場で何観るか迷う",
            createdAt: "2026-04-18T10:00:00Z",
          },
        ],
      }),
    );
    expect(d.shouldSearch).toBe(true);
  });

  it("theme=movie + '上映' + '喧嘩' → fallback 発火", () => {
    const d = decideSearch(
      baseAnalysis({
        recentMessages: [
          {
            senderId: "a",
            body: "上映時間チェックしたい。この前喧嘩したから仲直りに",
            createdAt: "2026-04-18T10:00:00Z",
          },
        ],
      }),
    );
    expect(d.shouldSearch).toBe(true);
  });

  it("theme=movie + 'シネマ' alone (感情語無し) → 通常ルートで発火", () => {
    const d = decideSearch(
      baseAnalysis({
        recentMessages: [
          {
            senderId: "a",
            body: "シネマに行きたい",
            createdAt: "2026-04-18T10:00:00Z",
          },
        ],
      }),
    );
    expect(d.shouldSearch).toBe(true);
  });

  it("theme=movie でも movie 明示語が無いまま感情語が入ると従来通り block", () => {
    // 「観る」「見る」のみでは明白な movie 意図とみなさない
    const d = decideSearch(
      baseAnalysis({
        recentMessages: [
          {
            senderId: "a",
            body: "何観たい気分か迷うね",
            createdAt: "2026-04-18T10:00:00Z",
          },
        ],
      }),
    );
    expect(d.shouldSearch).toBe(false);
    expect(d.reason).toContain("感情");
  });

  it("theme=food + '感情' → fallback は food に適用されない（block される）", () => {
    const d = decideSearch(
      baseAnalysis({
        theme: "food",
        recentMessages: [
          {
            senderId: "a",
            body: "何食べたい気分？映画のあと",
            createdAt: "2026-04-18T10:00:00Z",
          },
        ],
      }),
    );
    // body に「映画」が含まれるが theme=food なので fallback は発動しない
    expect(d.shouldSearch).toBe(false);
    expect(d.reason).toContain("感情");
  });

  it("theme=travel + '仲' → fallback は travel に適用されない", () => {
    const d = decideSearch(
      baseAnalysis({
        theme: "travel",
        recentMessages: [
          {
            senderId: "a",
            body: "旅行に行きたい。映画好きな仲間で",
            createdAt: "2026-04-18T10:00:00Z",
          },
        ],
      }),
    );
    expect(d.shouldSearch).toBe(false);
  });

  it("fallback 発火時も queries が組めなければ shouldSearch=false（空打ち禁止）", () => {
    // theme=movie, movie signal あり、感情語あり、だが実質的 analysis は空っぽに近い
    // → queries は常に生成される (buildSearchQueries が保険で出す) ので
    //   この test では shouldSearch=true を期待するが、「queries が無ければ空打ちしない」
    //   invariant が守られていることを形式的に確認する。
    const d = decideSearch(
      baseAnalysis({
        recentMessages: [
          {
            senderId: "a",
            body: "映画の気分",
            createdAt: "2026-04-18T10:00:00Z",
          },
        ],
      }),
    );
    if (d.queries.length === 0) {
      expect(d.shouldSearch).toBe(false);
    } else {
      expect(d.shouldSearch).toBe(true);
    }
  });
});
