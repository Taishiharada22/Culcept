/**
 * CoAlter Phase A: buildCandidateDetail + movieOrchestrator detail attach (2026-04-18)
 *
 * 検証:
 *  - narrationBuilder.buildCandidateDetail が why2People / alternatives / booking / sources を埋める
 *  - movieOrchestrator の出力 candidate に detail が付与される
 *  - LLM 全落ちでも detail は logic 合成で必ず存在
 *  - 映画 theme では booking.label が「予約」を含まない
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const runAIMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  runAI: (...args: unknown[]) => runAIMock(...args),
}));

import { buildCandidateDetail } from "@/lib/coalter/narrationBuilder";
import { generateMovieProposalV2 } from "@/lib/coalter/movieOrchestrator";
import type {
  CoAlterPersonProfile,
  ConversationAnalysis,
  ConversationBrief,
  ConversationTurn,
  RankedAlternative,
  RankedCandidate,
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";

function rc(): RankedCandidate {
  return {
    candidateKey: "ラストマイル::TOHOシネマズ渋谷::19:00",
    role: "balance",
    title: "ラストマイル",
    theater: "TOHOシネマズ渋谷",
    showtime: "19:00",
    runtimeMinutes: 118,
    releaseStatus: "showing",
    rating: "4.2",
    sourceUrl: "https://eiga.com/movie/last-mile",
    axisScores: { balance: 0.8 },
    totalScore: 0.8,
    rationale: {
      matchedInterestsA: ["サスペンス"],
      matchedInterestsB: ["ヒューマンドラマ"],
      matchedValuesA: [],
      matchedValuesB: [],
      appealedAxis: ["balance"],
      tradeoff: null,
      contingencyHint: null,
    },
    breakdown: {
      metrics: {
        novelty: 0.5,
        safety: 0.7,
        runtimeFit: 1,
        timeslotFit: 1,
        areaFit: 1,
        genreMatchA: 0.8,
        genreMatchB: 0.7,
        moodMatch: 0.5,
      },
      roleScores: { balance: 0.8 },
      assignedRole: "balance",
    },
  };
}

function brief(): ConversationBrief {
  return {
    theme: "movie",
    area: "渋谷",
    approximateTime: { date: "今週末", timeSlot: "night", preferredStartHour: 19 },
    mood: [],
    hardConstraints: [],
    rankingAxes: {
      preset: "balance_focus",
      roles: ["balance", "aFocus", "bFocus"],
      rationale: "折り合い優先",
    },
    primaryUnresolvedQuestion: null,
    confidence: 0.8,
    source: "llm",
  };
}

function searchCandidates(): SearchCandidate[] {
  return [
    {
      title: "ラストマイル",
      description: "TOHOシネマズ渋谷で上映中。渋谷駅 徒歩 3 分。118分。",
      externalRating: "4.2",
      practicalInfo: null,
      source: "eiga.com",
      url: "https://eiga.com/movie/last-mile",
    },
  ];
}

describe("buildCandidateDetail", () => {
  it("why2People / address / access / operatingHours / booking / sources を埋める", () => {
    const detail = buildCandidateDetail({
      candidate: rc(),
      alternatives: [
        {
          title: "アナログ",
          theater: "TOHOシネマズ渋谷",
          showtime: "20:00",
          releaseStatus: "showing",
          sourceUrl: "https://eiga.com/movie/analog",
          rating: "4.0",
          reason: "折り合い枠としてもあり得た候補",
          topRole: "balance",
          topRoleScore: 0.7,
        } as RankedAlternative,
      ],
      searchCandidates: searchCandidates(),
      brief: brief(),
    });
    expect(detail.why2People).toBeTruthy();
    expect(detail.address).toBe("TOHOシネマズ渋谷");
    expect(detail.access).toContain("徒歩");
    expect(detail.operatingHours).toContain("19:00");
    expect(detail.booking).not.toBeNull();
    // movie → 予約 CTA を出さない
    expect(detail.booking!.label).not.toContain("予約");
    expect(detail.sources.length).toBeGreaterThan(0);
    expect(detail.alternatives.length).toBe(1);
    expect(detail.alternatives[0].title).toBe("アナログ");
  });

  it("alternatives は上限 2", () => {
    const detail = buildCandidateDetail({
      candidate: rc(),
      alternatives: [
        { title: "A", theater: null, showtime: null, releaseStatus: "showing", sourceUrl: "", rating: null, reason: "r", topRole: "balance", topRoleScore: 0.5 },
        { title: "B", theater: null, showtime: null, releaseStatus: "showing", sourceUrl: "", rating: null, reason: "r", topRole: "balance", topRoleScore: 0.5 },
        { title: "C", theater: null, showtime: null, releaseStatus: "showing", sourceUrl: "", rating: null, reason: "r", topRole: "balance", topRoleScore: 0.5 },
      ],
      searchCandidates: [],
      brief: brief(),
    });
    expect(detail.alternatives.length).toBe(2);
  });
});

// ─── orchestrator 統合 ───

function makeProfile(id: string, name: string): CoAlterPersonProfile {
  return {
    userId: id,
    displayName: name,
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
    interests: ["サスペンス", "ヒューマンドラマ"],
    values: [],
    archetypeCode: null,
    coreFear: null,
    coreDesire: null,
  };
}

function makeAnalysis(): ConversationAnalysis {
  return {
    theme: "movie",
    recentMessages: [],
    stalemate: null,
    caringIntensityA: 0.5,
    caringIntensityB: 0.5,
    extractedConstraints: {
      date: null,
      location: "渋谷",
      budget: null,
      timeSlot: "夜",
      preferences: [],
    },
    constraintScore: 0.6,
    agreedConstraints: [],
  };
}

const turns: ConversationTurn[] = [
  { id: "t1", senderId: "a", body: "今週末、渋谷で映画見ない？", createdAt: "2026-04-18T10:00:00Z" },
  { id: "t2", senderId: "b", body: "いいね、夜がいいな", createdAt: "2026-04-18T10:01:00Z" },
];

const relationship: RelationshipContext = {
  commonGround: [],
  frictionPoints: [],
  fairnessLedger: [],
  pastSessionCount: 0,
};

const bigSearchCandidates: SearchCandidate[] = [
  {
    title: "ラストマイル",
    description: "TOHOシネマズ渋谷で19:00〜、21:30〜。118分。Filmarks 4.2。サスペンス",
    externalRating: "4.2",
    practicalInfo: null,
    source: "eiga.com",
    url: "https://eiga.com/movie/last-mile",
  },
  {
    title: "アナログ",
    description: "TOHOシネマズ渋谷で20:00〜。106分。ヒューマンドラマ。★4.0",
    externalRating: "4.0",
    practicalInfo: null,
    source: "filmarks",
    url: "https://filmarks.com/movies/analog",
  },
  {
    title: "PERFECT DAYS",
    description: "TOHOシネマズ渋谷で18:30〜。124分。ヒューマンドラマ。★4.5",
    externalRating: "4.5",
    practicalInfo: null,
    source: "eiga.com",
    url: "https://eiga.com/movie/perfect-days",
  },
];

describe("movieOrchestrator — candidate.detail が埋まる", () => {
  beforeEach(() => {
    runAIMock.mockReset();
  });

  it("LLM 全落ちでも detail は logic で必ず埋まる", async () => {
    runAIMock.mockRejectedValue(new Error("provider all down"));

    const result = await generateMovieProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: bigSearchCandidates,
      profileA: makeProfile("a", "たいし"),
      profileB: makeProfile("b", "あやか"),
      relationship,
    });

    expect(result.card.candidates.length).toBeGreaterThan(0);
    for (const c of result.card.candidates) {
      expect(c.detail).toBeDefined();
      expect(c.detail!.why2People).toBeTruthy();
      // booking は catalog sourceUrl から最低でも third_party で resolve される
      if (c.detail!.booking) {
        // movie CTA は "予約" を含まない
        expect(c.detail!.booking.label).not.toContain("予約");
      }
      // sources は最低 1 件（catalog sourceUrl）
      expect(c.detail!.sources.length).toBeGreaterThan(0);
    }
  });
});
