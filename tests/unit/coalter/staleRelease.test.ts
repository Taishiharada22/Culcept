/**
 * CoAlter Phase A.6 P1: "上映終了 / 古すぎるリリース年" の除外回帰テスト
 *
 * 背景:
 *   P0 で検索クエリを theater ドメインに寄せた結果、1 候補 (クランクイン！の公開予定作)
 *   までは引けるようになった。しかし `旅と日々` のような 2024 年作品が listicle で
 *   theater 付きで引けた場合、title×theater が揃ってしまい「すでに上映が終わってる作品」が
 *   提案されてしまう。これは「映画館でもう見られない」UX 破綻に直結する。
 *
 * P1 で入れる不変条件:
 *   1. extractStatus は「上映終了」「公開終了」「終映」を検出して "ended" を返す
 *   2. extractStatus は reference 日付より 2 年以上前の release year を "ended" に倒す
 *   3. extractStatus は reference 日付より 1 年 + 数ヶ月以上前のリリースも "ended" に倒す
 *   4. 明示的 showing キーワードが出たら release year によらず "showing"（リバイバル対応）
 *   5. movieRanker は status="ended" の候補を stale_release reason で reject する
 *   6. movieOrchestrator の diagnostics に staleReleaseRejectCount / endedStatusCount が出る
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const runAIMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  runAI: (...args: unknown[]) => runAIMock(...args),
}));

import {
  extractStatus,
  extractReleaseYear,
  parseMovieScreenings,
} from "@/lib/coalter/movieCatalog";
import { rankMovies } from "@/lib/coalter/movieRanker";
import { generateMovieProposalV2 } from "@/lib/coalter/movieOrchestrator";
import type {
  CoAlterPersonProfile,
  ConversationAnalysis,
  ConversationBrief,
  ConversationTurn,
  MovieScreening,
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";

// ──────────── helpers ────────────

const NOW_2026_04 = new Date("2026-04-18T10:00:00Z");

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

function brief(): ConversationBrief {
  return {
    theme: "movie",
    area: null,
    approximateTime: { date: null, timeSlot: null, preferredStartHour: null },
    mood: [],
    hardConstraints: [],
    rankingAxes: {
      preset: "balance_focus",
      roles: ["balance", "aFocus", "bFocus"],
      rationale: "テスト",
    },
    primaryUnresolvedQuestion: null,
    confidence: 0.8,
    source: "llm",
  };
}

function scr(overrides: Partial<MovieScreening>): MovieScreening {
  return {
    title: "テスト作品",
    theater: "TOHOシネマズ渋谷",
    status: "showing",
    showtimes: ["19:00"],
    runtimeMinutes: 120,
    rating: "★4.0",
    sourceUrl: "",
    source: "eiga.com",
    snippet: "",
    releaseYear: null,
    ...overrides,
  };
}

// ──────────── extractReleaseYear ────────────

describe("extractReleaseYear: リリース年抽出", () => {
  it("'2024年公開' → 2024", () => {
    expect(extractReleaseYear("2024年公開の話題作『旅と日々』")).toBe(2024);
  });

  it("'（2024）' → 2024", () => {
    expect(extractReleaseYear("旅と日々（2024）")).toBe(2024);
  });

  it("'(2025)' → 2025", () => {
    expect(extractReleaseYear("ラストマイル (2025)")).toBe(2025);
  });

  it("複数の年が混じったら最新を返す", () => {
    // "1995年のリメイクで 2024 年公開" → 2024 を拾ってほしい
    expect(extractReleaseYear("1995年の原作を 2024年に映画化")).toBe(2024);
  });

  it("年が無ければ null", () => {
    expect(extractReleaseYear("あらすじ: 主人公が旅をする")).toBeNull();
  });

  it("電話番号・4桁 ID は年と誤認しない", () => {
    // "0120-1234" や "shop12345" などは年として拾わない
    // 1960-2099 の範囲外 or "年" 文脈が無ければ拾わない
    expect(extractReleaseYear("お問合せ: 0120-1234 shop12345")).toBeNull();
  });
});

// ──────────── extractStatus ────────────

describe("extractStatus: 'ended' 判定", () => {
  it("明示的『上映終了』→ ended", () => {
    expect(extractStatus("※上映は終了しました", NOW_2026_04)).toBe("ended");
    expect(extractStatus("公開終了", NOW_2026_04)).toBe("ended");
    expect(extractStatus("終映", NOW_2026_04)).toBe("ended");
  });

  it("release year が 2 年以上前 → ended", () => {
    expect(extractStatus("2024年公開の話題作", NOW_2026_04)).toBe("ended");
    expect(extractStatus("2023年12月に公開", NOW_2026_04)).toBe("ended");
  });

  it("release year = 前年 + reference 月が 4 月以降 → ended (14ヶ月以上経過)", () => {
    // 2025 年公開で今 2026-04 → 1 年以上経ってる扱い
    expect(extractStatus("2025年公開", NOW_2026_04)).toBe("ended");
  });

  it("release year が 1 年前でも『上映中』明示があれば showing（リバイバル）", () => {
    // リバイバル上映などのケースは showing が勝つ
    expect(extractStatus("2024年公開の名作。現在上映中", NOW_2026_04)).toBe(
      "showing",
    );
  });

  it("明示的『上映中』→ showing", () => {
    expect(extractStatus("絶賛上映中", NOW_2026_04)).toBe("showing");
    expect(extractStatus("好評公開中", NOW_2026_04)).toBe("showing");
  });

  it("明示的『公開予定』→ upcoming", () => {
    expect(extractStatus("2026年5月公開予定", NOW_2026_04)).toBe("upcoming");
    expect(extractStatus("近日公開", NOW_2026_04)).toBe("upcoming");
  });

  it("何も手がかりが無ければ unknown", () => {
    expect(extractStatus("主人公がある日、旅に出る", NOW_2026_04)).toBe("unknown");
  });
});

// ──────────── movieRanker: stale_release ────────────

describe("movieRanker: status='ended' は stale_release で reject", () => {
  it("ended は filterTrace に stale_release として出る", () => {
    const catalog: MovieScreening[] = [
      scr({ title: "ラストマイル", status: "showing" }),
      scr({ title: "旅と日々", status: "ended", releaseYear: 2024 }),
    ];
    const out = rankMovies({
      brief: brief(),
      catalog,
      avoidKeys: [],
      profileA: profile("a"),
      profileB: profile("b"),
    });
    const stale = out.filterTrace.filter((t) =>
      t.reasons.includes("stale_release"),
    );
    expect(stale.map((t) => t.title)).toContain("旅と日々");
    // showing は ranked に残る
    expect(out.ranked.map((r) => r.title)).toContain("ラストマイル");
    expect(out.ranked.map((r) => r.title)).not.toContain("旅と日々");
  });
});

// ──────────── parseMovieScreenings: 統合 ────────────

describe("parseMovieScreenings: 2024 年 listicle から ended が立つ", () => {
  it("2024 年公開作品は catalog で status='ended' になる", () => {
    const scs: SearchCandidate[] = [
      {
        title: "旅と日々",
        description:
          "2024年公開。主人公がある日、四国を旅する物語。TOHOシネマズ渋谷で上映されていた。",
        externalRating: null,
        practicalInfo: null,
        source: "eiga.com",
        url: "https://eiga.com/movie/travel-days",
      },
    ];
    const catalog = parseMovieScreenings(scs);
    expect(catalog.length).toBe(1);
    expect(catalog[0].status).toBe("ended");
    expect(catalog[0].releaseYear).toBe(2024);
  });
});

// ──────────── orchestrator diagnostics ────────────

function makeAnalysis(): ConversationAnalysis {
  return {
    theme: "movie",
    recentMessages: [],
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
}

const turns: ConversationTurn[] = [
  { id: "t1", senderId: "a", body: "映画見たい", createdAt: "2026-04-18T10:00:00Z" },
];

const relationship: RelationshipContext = {
  commonGround: [],
  frictionPoints: [],
  fairnessLedger: [],
  pastSessionCount: 0,
};

describe("movieOrchestrator: staleRelease diagnostics", () => {
  beforeEach(() => {
    runAIMock.mockReset();
    runAIMock.mockRejectedValue(new Error("provider down"));
  });

  it("staleReleaseRejectCount / endedStatusCount が diagnostics に出る", async () => {
    const searchCandidates: SearchCandidate[] = [
      // 現在上映中 + theater 付き → 採用される
      {
        title: "ラストマイル",
        description:
          "現在上映中。TOHOシネマズ渋谷で19:00〜。118分。★4.2。2026年公開。",
        externalRating: "4.2",
        practicalInfo: null,
        source: "eiga.com",
        url: "https://eiga.com/movie/last-mile",
      },
      // 2024 年作品 + theater 付き → stale_release で落ちる
      {
        title: "旅と日々",
        description:
          "2024年公開。主人公が四国を旅する物語。TOHOシネマズ渋谷にて上映されていた。118分。",
        externalRating: null,
        practicalInfo: null,
        source: "eiga.com",
        url: "https://eiga.com/movie/travel-days",
      },
    ];

    const result = await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates,
      profileA: profile("a"),
      profileB: profile("b"),
      relationship,
    });

    expect(result.diagnostics.catalogCount).toBe(2);
    expect(result.diagnostics.endedStatusCount).toBe(1);
    expect(result.diagnostics.staleReleaseRejectCount).toBe(1);
    // ラストマイル のみ ranked
    expect(result.ranked.map((r) => r.title)).toEqual(["ラストマイル"]);
    expect(result.ranked.map((r) => r.title)).not.toContain("旅と日々");
  });
});
