/**
 * CoAlter Phase A.5: theater=null の候補は "missing_where" で hardFilter 落ち
 *
 * CEO 方針: 映画は「作品×映画館×上映時刻」の束で初めて 1 候補。
 * theater が無い候補は UI 上「作品だけカード」という退化を生む → 落とす。
 *
 * 本テストは:
 *  - ranker が missing_where reason を正しく付けて reject する
 *  - movieOrchestrator が diagnostics.missingWhereRejectCount /
 *    titleWithoutTheaterCount を正しく集計する
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const runAIMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  runAI: (...args: unknown[]) => runAIMock(...args),
}));

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

function scr(title: string, theater: string | null): MovieScreening {
  return {
    title,
    theater,
    status: "showing",
    showtimes: ["19:00"],
    runtimeMinutes: 120,
    rating: "★4.0",
    sourceUrl: "",
    source: "eiga.com",
    snippet: `${title}の解説`,
  };
}

describe("movieRanker: missing_where hard filter", () => {
  it("theater が null の候補は missing_where で reject される", () => {
    const catalog: MovieScreening[] = [
      scr("ラストマイル", "TOHOシネマズ渋谷"),
      scr("PERFECT DAYS", null), // ← missing where
      scr("アナログ", "MOVIX昭島"),
    ];
    const out = rankMovies({
      brief: brief(),
      catalog,
      avoidKeys: [],
      profileA: profile("a"),
      profileB: profile("b"),
    });
    const rejectedTitles = out.filterTrace
      .filter((t) => t.reasons.includes("missing_where"))
      .map((t) => t.title);
    expect(rejectedTitles).toContain("PERFECT DAYS");
    // theater 付きは通る
    const rankedTitles = out.ranked.map((r) => r.title);
    expect(rankedTitles).toContain("ラストマイル");
    expect(rankedTitles).not.toContain("PERFECT DAYS");
  });

  it("title も theater も null なら missing_identity（missing_where は出さなくてよいが両方出ても挙動は同じ）", () => {
    const catalog: MovieScreening[] = [scr("", null)];
    const out = rankMovies({
      brief: brief(),
      catalog,
      avoidKeys: [],
      profileA: profile("a"),
      profileB: profile("b"),
    });
    const reasons = out.filterTrace[0]?.reasons ?? [];
    expect(reasons).toContain("missing_identity");
  });
});

// ─── orchestrator diagnostics ───

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

describe("movieOrchestrator: diagnostics counters", () => {
  beforeEach(() => {
    runAIMock.mockReset();
    runAIMock.mockRejectedValue(new Error("provider down"));
  });

  it("missing_where で落ちた件数と title_without_theater 件数を diagnostics に出す", async () => {
    const searchCandidates: SearchCandidate[] = [
      // theater ちゃんと付く
      {
        title: "ラストマイル",
        description: "現在上映中。TOHOシネマズ渋谷で19:00〜。118分。★4.2",
        externalRating: "4.2",
        practicalInfo: null,
        source: "eiga.com",
        url: "https://eiga.com/movie/last-mile",
      },
      // listicle → theater null になる作品が混ざる
      {
        title: "【2026年4月】東京の注目映画まとめ | 映画.com",
        description:
          "今月は『PERFECT DAYS』『アナログ』が話題。好評につき多くの劇場で上映中。",
        externalRating: null,
        practicalInfo: null,
        source: "eiga.com",
        url: "https://eiga.com/feature/april",
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

    // catalog は ラストマイル + PERFECT DAYS + アナログ = 3
    expect(result.diagnostics.catalogCount).toBe(3);
    // theater 付きは 1 件のみ (ラストマイル)
    expect(result.diagnostics.titleWithoutTheaterCount).toBe(2);
    // 落とされた件数
    expect(result.diagnostics.missingWhereRejectCount).toBe(2);
    // 最終候補は theater 付きのものだけ
    expect(result.diagnostics.rankedCount).toBe(1);
    expect(result.ranked[0].title).toBe("ラストマイル");
    expect(result.ranked[0].theater).toBe("TOHOシネマズ渋谷");
  });
});
