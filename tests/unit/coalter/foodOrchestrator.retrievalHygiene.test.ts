/**
 * CoAlter Food Orchestrator — §6.4 (6)-1 Retrieval Hygiene integration
 * (2026-04-20)
 *
 * GPT 指示（3 パターン）:
 *   1. lens なし → legacy 経路維持（4 field は diagnostics に付かない）
 *   2. lens あり + clarify → Layer 1/2/3 skip、4 field 付きで clarify card 返却
 *   3. lens あり + clarify なし → 通常パイプライン、diagnostics に 4 field が合流
 *
 * 本テストは pipeline 全体の観点で「どこに gate が入るか」と
 * 「pollution が rank 段に流れ込まないこと」を固定する。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const runAIMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  runAI: (...args: unknown[]) => runAIMock(...args),
}));

import type {
  CoAlterPersonProfile,
  ConversationAnalysis,
  ConversationTurn,
  FoodQuery,
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";
import {
  generateFoodProposalV2,
  evaluateFoodRetrievalHygiene,
  shouldSkipFoodWebSearch,
} from "@/lib/coalter/foodOrchestrator";
import type { FoodQueryBuilderInput } from "@/lib/coalter/foodQueryBuilder";

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

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
    interests: ["和食"],
    values: [],
    archetypeCode: null,
    coreFear: null,
    coreDesire: null,
  };
}

const profileA = makeProfile("a", "たいし");
const profileB = makeProfile("b", "あやか");
const relationship: RelationshipContext = {
  commonGround: [],
  frictionPoints: [],
  fairnessLedger: [],
  pastSessionCount: 0,
};

const turns: ConversationTurn[] = [
  {
    id: "t1",
    senderId: "a",
    body: "新宿で11時頃ラーメン食べたい",
    createdAt: "2026-04-20T10:00:00Z",
  },
];

function makeAnalysis(): ConversationAnalysis {
  return {
    theme: "food",
    recentMessages: [],
    stalemate: null,
    caringIntensityA: 0.5,
    caringIntensityB: 0.5,
    extractedConstraints: {
      date: null,
      location: "新宿",
      budget: null,
      timeSlot: "昼",
      preferences: [],
    },
    constraintScore: 0.6,
    agreedConstraints: [],
  };
}

function makeSearchCandidates(): SearchCandidate[] {
  return [
    {
      title: "一蘭 新宿店 | 新宿駅南口徒歩2分",
      description: "新宿駅南口徒歩2分。豚骨ラーメン 980円。11:00〜23:00。食べログ3.6",
      externalRating: "3.6",
      practicalInfo: null,
      source: "食べログ",
      url: "https://tabelog.com/tokyo/A1304/rstdetail/ichiran-shinjuku/",
    },
    {
      title: "麺屋 彩未 新宿 | 新宿の味噌ラーメン",
      description: "新宿三丁目駅徒歩3分。味噌ラーメン 1,100円。11:00〜22:00。Retty人気店",
      externalRating: null,
      practicalInfo: null,
      source: "Retty",
      url: "https://retty.me/area/PRE13/ARE14/sai-mi-shinjuku/",
    },
  ];
}

function mockBriefOk() {
  return Promise.resolve({
    text: "",
    structured: {
      theme: "food",
      area: "新宿",
      approximateTime: {
        date: "今日",
        timeSlot: "lunch",
        preferredStartHour: 11,
      },
      mood: [],
      rankingAxes: { preset: "balance_focus", rationale: "" },
      primaryUnresolvedQuestion: null,
      confidence: 0.85,
    },
    usage: null,
    metadata: {},
    latencyMs: 10,
  });
}

const EITHER_ATMO: FoodQuery["atmosphere"] = {
  quietness: "either",
  density: "either",
  lighting: "either",
};

function fullLens(): FoodQueryBuilderInput {
  return {
    area: "新宿",
    areaSource: "environmental.location",
    cuisineHints: ["ラーメン"],
    cuisineSource: "foodContext.cuisineHints",
    excludeCuisines: [],
    priceBand: null,
    requestedTimeSlots: [
      {
        localDate: null,
        startHour: 11,
        endHour: 12,
        confidence: "approximate",
      },
    ],
    targetLocalTime: null,
    timeWindow: "lunch",
    exactTimeSource: "foodContext.requestedTimeSlots",
    occasion: null,
    atmosphere: { ...EITHER_ATMO },
    moodTags: [],
    reservationUrgency: "flexible",
  };
}

function clarifyLens(): FoodQueryBuilderInput {
  // area 欠落 → critical_axis_missing
  const l = fullLens();
  l.area = null;
  return l;
}

beforeEach(() => {
  runAIMock.mockReset();
});

// ─────────────────────────────────────────────
// Pattern 1: lens なし → legacy
// ─────────────────────────────────────────────

describe("§6.4 (6)-1 integration — Pattern 1: lens 未供給 (legacy 経路)", () => {
  it("gate を走らせず、4 field は diagnostics に付かない", async () => {
    runAIMock.mockImplementation(() => mockBriefOk());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_no_lens",
    });

    // legacy 経路: searchCandidates が消費されて catalog/rank まで走る
    expect(result.diagnostics.rawSearchCandidates).toBe(2);
    expect(result.diagnostics.parsedVenues).toBeGreaterThan(0);
    expect(result.diagnostics.rankedCount).toBeGreaterThan(0);

    // 4 field は undefined（lens 未供給時は log shape を壊さない）
    expect(result.diagnostics.queryProjectionCoverage).toBeUndefined();
    expect(result.diagnostics.clarifyReason).toBeUndefined();
    expect(result.diagnostics.missingAxes).toBeUndefined();
    expect(result.diagnostics.droppedAxes).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Pattern 2: lens あり + clarify → short-circuit
// ─────────────────────────────────────────────

describe("§6.4 (6)-1 integration — Pattern 2: lens あり / clarify で停止", () => {
  it("area 欠落 → Layer 1/2/3 skip、clarify card + 4 field 付き", async () => {
    runAIMock.mockImplementation(() => mockBriefOk());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_clarify",
      foodLens: clarifyLens(),
    });

    // Layer 1-3 が走っていない証拠
    expect(result.diagnostics.parsedVenues).toBe(0);
    expect(result.diagnostics.rankedCount).toBe(0);
    expect(result.diagnostics.latencyMsCatalog).toBe(0);
    expect(result.diagnostics.latencyMsRank).toBe(0);
    expect(result.diagnostics.latencyMsNarration).toBe(0);

    // clarify 判定
    expect(result.diagnostics.clarifyReason).toBe("critical_axis_missing");
    expect(result.diagnostics.missingAxes).toContain("area");

    // card: 分かっていることを先に返す（ラーメン or 11時頃）
    expect(result.card.candidates).toEqual([]);
    const summary = result.card.summary;
    expect(summary).toMatch(/ラーメン|11時頃/);

    // question は area に触れている
    expect(result.card.reasoning).toContain("どこで");

    // ranked=0、primaryQuestion は brief 由来で走る
    expect(result.ranked).toEqual([]);
  });

  it("rawSearchCandidates は受け取った件数として記録される（orchestrator-only path: engine 未配線シナリオ）", async () => {
    runAIMock.mockImplementation(() => mockBriefOk());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_clarify_log",
      foodLens: clarifyLens(),
    });
    // pollution が rank に流れ込んでいないことを表す: raw はあっても parsed=0
    expect(result.diagnostics.rawSearchCandidates).toBe(2);
    expect(result.diagnostics.parsedVenues).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Pattern 2b: engine-side pre-search skip (6)-1b
// ─────────────────────────────────────────────
//
// engine.ts が shouldSkipFoodWebSearch=true で ensureSearchCandidates() を呼ばなかった
// 結果、orchestrator に searchCandidates=[] が渡される。これが rawSearchCandidates=0
// を発生させる経路。GPT 条件 #1「web search より前」の真の達成パス。

describe("§6.4 (6)-1b integration — Pattern 2b: engine が web search を skip", () => {
  it("clarify lens + engine skip (searchCandidates=[]) → rawSearchCandidates=0", async () => {
    runAIMock.mockImplementation(() => mockBriefOk());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: [], // ← engine が ensureSearchCandidates() を skip した結果
      profileA,
      profileB,
      relationship,
      sessionId: "sess_engine_skip",
      foodLens: clarifyLens(),
    });

    // 真の pre-search gate 達成: raw も parsed も 0
    expect(result.diagnostics.rawSearchCandidates).toBe(0);
    expect(result.diagnostics.parsedVenues).toBe(0);
    expect(result.diagnostics.rankedCount).toBe(0);

    // clarify 判定 + card は projection 入り
    expect(result.diagnostics.clarifyReason).toBe("critical_axis_missing");
    expect(result.card.candidates).toEqual([]);
    expect(result.card.reasoning).toContain("どこで");
  });
});

// ─────────────────────────────────────────────
// Pattern 3: lens あり + clarify なし → 通常パイプライン
// ─────────────────────────────────────────────

describe("§6.4 (6)-1 integration — Pattern 3: lens あり / 通常進行", () => {
  it("clarify に倒れず Layer 1/2/3 が走る + diagnostics に 4 field 合流", async () => {
    runAIMock.mockImplementation(() => mockBriefOk());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_normal_lens",
      foodLens: fullLens(),
    });

    // 通常パイプライン完走
    expect(result.diagnostics.rawSearchCandidates).toBe(2);
    expect(result.diagnostics.parsedVenues).toBeGreaterThan(0);
    expect(result.diagnostics.rankedCount).toBeGreaterThan(0);

    // 4 field が合流（追加 emit なしで本 diagnostics 1 回のみ）
    expect(result.diagnostics.queryProjectionCoverage).toBeDefined();
    expect(result.diagnostics.clarifyReason).toBeNull();
    expect(result.diagnostics.missingAxes).toBeDefined();
    expect(result.diagnostics.droppedAxes).toBeDefined();

    // area / cuisine / exactTime は projected
    const cov = result.diagnostics.queryProjectionCoverage!;
    expect(cov.area.projected).toBe(true);
    expect(cov.cuisine.projected).toBe(true);
    expect(cov.exactTime.projected).toBe(true);
  });
});

// ─────────────────────────────────────────────
// emit 回数（二重発火禁止）
// ─────────────────────────────────────────────

describe("§6.4 (6)-1 integration — food.diagnostics は常に 1 回だけ emit", () => {
  it("Pattern 1/2/3 それぞれで food.diagnostics が 1 回ずつ", async () => {
    runAIMock.mockImplementation(() => mockBriefOk());
    const infoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    // Pattern 2 (clarify)
    await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_p2",
      foodLens: clarifyLens(),
    });
    const p2Calls = infoSpy.mock.calls.filter(
      (c) => c[0] === "[CoAlter] food.diagnostics",
    );
    expect(p2Calls.length).toBe(1);

    infoSpy.mockClear();

    // Pattern 3 (normal)
    await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_p3",
      foodLens: fullLens(),
    });
    const p3Calls = infoSpy.mock.calls.filter(
      (c) => c[0] === "[CoAlter] food.diagnostics",
    );
    expect(p3Calls.length).toBe(1);

    // error path は出ていない
    const errorCalls = warnSpy.mock.calls.filter(
      (c) => c[0] === "[CoAlter] food.orchestrator.error",
    );
    expect(errorCalls.length).toBe(0);

    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// evaluateFoodRetrievalHygiene (engine.ts 側の pre-gate helper)
// ─────────────────────────────────────────────

describe("evaluateFoodRetrievalHygiene — engine.ts pre-gate helper", () => {
  it("clarify lens → shouldClarify=true (engine 側で search を skip できる)", () => {
    const r = evaluateFoodRetrievalHygiene(clarifyLens());
    expect(r.clarifySignal.shouldClarify).toBe(true);
    expect(r.clarifySignal.clarifyReason).toBe("critical_axis_missing");
  });

  it("full lens → shouldClarify=false (engine は search を継続)", () => {
    const r = evaluateFoodRetrievalHygiene(fullLens());
    expect(r.clarifySignal.shouldClarify).toBe(false);
  });
});

// ─────────────────────────────────────────────
// shouldSkipFoodWebSearch — engine.ts が直接使う pre-search gate
// ─────────────────────────────────────────────

describe("shouldSkipFoodWebSearch — engine.ts pre-search gate", () => {
  it("lens 未供給 → false（legacy 経路）", () => {
    expect(shouldSkipFoodWebSearch(undefined)).toBe(false);
  });

  it("lens 供給 + clarify → true（engine は ensureSearchCandidates() を skip）", () => {
    expect(shouldSkipFoodWebSearch(clarifyLens())).toBe(true);
  });

  it("lens 供給 + clarify なし → false（engine は通常 search）", () => {
    expect(shouldSkipFoodWebSearch(fullLens())).toBe(false);
  });
});
