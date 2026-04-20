/**
 * CoAlter F-6 — foodOrchestrator tierLoop wiring tests
 *
 * CEO lock 2026-04-20 F-6:
 *   - `COALTER_FOOD_TIER_LOOP=false` → 従来どおり `rankFood` 単発。diagnostics に tier 系 field 無し。
 *   - `COALTER_FOOD_TIER_LOOP=true` + lens 供給 → `runTieredRanking` が走り、
 *     `diagnostics.appliedTier` / `tierAttempts` が付く。最初に ranked >= 1 を得た tier で停止。
 *   - flag ON でも lens/area 欠落 → tier loop skip（runner null）、従来経路に fallback。
 *
 * 本テストは orchestrator 配線の確認のみ。tier 切替の意味論は
 * `tests/unit/coalter/foodTierRunner.test.ts` 側で担保する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const runAIMock = vi.fn();
vi.mock("@/lib/ai", () => ({
  runAI: (...args: unknown[]) => runAIMock(...args),
}));

import type {
  CoAlterPersonProfile,
  ConversationAnalysis,
  ConversationTurn,
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";
import { generateFoodProposalV2 } from "@/lib/coalter/foodOrchestrator";
import type { FoodLensToday } from "@/lib/coalter/understanding/foodLensAdapter";
import type {
  TwoPersonLensToday,
  UserId,
} from "@/lib/coalter/understanding/types";

// ═════════════════════════════════════════════════════════════════════════
// Fixtures
// ═════════════════════════════════════════════════════════════════════════

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
    body: "渋谷で19時頃ディナー",
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
      location: "渋谷",
      budget: null,
      timeSlot: "夜",
      preferences: [],
    },
    constraintScore: 0.6,
    agreedConstraints: [],
  };
}

function makeSearchCandidates(): SearchCandidate[] {
  return [
    {
      title: "和食処 しぶや | 渋谷駅徒歩3分",
      description:
        "渋谷駅徒歩3分。会席 6000円。18:00〜23:00。食べログ3.7。渋谷",
      externalRating: "3.7",
      practicalInfo: null,
      source: "食べログ",
      url: "https://tabelog.com/tokyo/A1303/rstdetail/shibuya-washoku/",
    },
  ];
}

function mockBriefOk() {
  return Promise.resolve({
    text: "",
    structured: {
      theme: "food",
      area: "渋谷",
      approximateTime: {
        date: "今日",
        timeSlot: "evening",
        preferredStartHour: 19,
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

function makeLens(): TwoPersonLensToday {
  return {
    personalLenses: {
      a: {
        userId: "a" as UserId,
        displayName: "たいし",
        coreDecisionPrinciples: [],
        currentEmotionalHue: "",
        todaySensitivities: [],
        comfortPathways: [],
        sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
      },
      b: {
        userId: "b" as UserId,
        displayName: "あやか",
        coreDecisionPrinciples: [],
        currentEmotionalHue: "",
        todaySensitivities: [],
        comfortPathways: [],
        sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
      },
    },
    relationalLens: {
      temperature: "warm",
      dominantDynamic: "",
      careAxes: [],
      avoidElements: [],
      interactionPace: "steady",
    },
    todayReading: {
      mode: "connect",
      energyBudget: "mid",
      timeBudget: "ample",
      implicitIntent: "",
      latentNeeds: [],
      confidence: 0.7,
    },
    fairnessAdjustment: {
      favorSide: null,
      rationale: null,
      strength: 0,
      basedOnSessionCount: 0,
    },
    understanding_confidence: 0.7,
    dataGaps: [],
    computedAt: "2026-04-20T10:00:00Z",
    lensVersion: "1.0.0",
  };
}

function makeFoodLensToday(): FoodLensToday {
  return {
    lens: makeLens(),
    foodContext: {
      hungerLevel: "hungry",
      timeWindow: "dinner",
      atmosphereDesire: {
        quietness: "quiet",
        density: "intimate",
        lighting: "warm_low",
      },
      moodTags: ["近づく"],
    },
    derivationSource: {
      hungerLevel: [],
      timeWindow: [],
      atmosphereDesire: [],
      moodTags: [],
    },
  };
}

const ORIG_FLAG = process.env.COALTER_FOOD_TIER_LOOP;

beforeEach(() => {
  runAIMock.mockReset();
  runAIMock.mockImplementation(() => mockBriefOk());
});

afterEach(() => {
  if (ORIG_FLAG === undefined) delete process.env.COALTER_FOOD_TIER_LOOP;
  else process.env.COALTER_FOOD_TIER_LOOP = ORIG_FLAG;
});

// ═════════════════════════════════════════════════════════════════════════
// (a) flag OFF — tier loop は走らない（legacy 経路、rankFood 単発）
// ═════════════════════════════════════════════════════════════════════════

describe("F-6 tierLoop (a) — flag OFF → tier loop skip、diagnostics に tier 情報なし", () => {
  it("foodLensToday 供給でも flag OFF なら appliedTier / tierAttempts が出ない", async () => {
    process.env.COALTER_FOOD_TIER_LOOP = "false";
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_f6_a",
      foodLensToday: makeFoodLensToday(),
      lens: makeLens(),
    });

    expect(result.diagnostics.appliedTier).toBeUndefined();
    expect(result.diagnostics.tierAttempts).toBeUndefined();
    expect(result.diagnostics.tierThinReason).toBeUndefined();
    // legacy でも catalog/rank は従来どおり走る
    expect(result.diagnostics.rawSearchCandidates).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// (b) flag ON + lens 供給 + T0 hit — appliedTier="T0"、tierAttempts.length===1
// ═════════════════════════════════════════════════════════════════════════

describe("F-6 tierLoop (b) — flag ON + lens 供給 → tier loop 実行、T0 で hit", () => {
  it("最初の tier で ranked >= 1 → tierAttempts 1 本のみ、以降の tier は試行しない", async () => {
    process.env.COALTER_FOOD_TIER_LOOP = "true";
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_f6_b",
      foodLensToday: makeFoodLensToday(),
      lens: makeLens(),
    });

    // T0 で取れていれば appliedTier=T0、tierAttempts は 1 本のみ
    expect(result.diagnostics.appliedTier).toBeDefined();
    expect(result.diagnostics.tierAttempts).toBeDefined();
    const attempts = result.diagnostics.tierAttempts!;
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    // 成功閾値は 1 件 — 採用 tier で ranked>=1 を満たしているはず
    const last = attempts[attempts.length - 1];
    expect(last.rankedCount).toBeGreaterThanOrEqual(1);
    expect(result.ranked.length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// (c) flag ON + lens 供給なし — runner null → legacy fallback
// ═════════════════════════════════════════════════════════════════════════

describe("F-6 tierLoop (c) — flag ON でも lens 未供給 → tier loop skip", () => {
  it("foodLensToday/foodLens 両方 undefined なら従来経路（appliedTier なし）", async () => {
    process.env.COALTER_FOOD_TIER_LOOP = "true";
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_f6_c",
      // foodLensToday / foodLens / lens いずれも未供給
    });

    expect(result.diagnostics.appliedTier).toBeUndefined();
    expect(result.diagnostics.tierAttempts).toBeUndefined();
    expect(result.diagnostics.tierThinReason).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// (d) flag ON + lens 供給 + catalog 空 → 全 tier 0 件 → T2 採用 + thinReason
// ═════════════════════════════════════════════════════════════════════════

describe("F-6 tierLoop (d) — 全 tier 0 件 → T2 採用 + thinReason 付与", () => {
  it("searchCandidates が空で catalog 0 → 全 tier で ranked=0 → appliedTier=T2", async () => {
    process.env.COALTER_FOOD_TIER_LOOP = "true";
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: [], // catalog 0
      profileA,
      profileB,
      relationship,
      sessionId: "sess_f6_d",
      foodLensToday: makeFoodLensToday(),
      lens: makeLens(),
    });

    expect(result.diagnostics.appliedTier).toBe("T2");
    expect(result.diagnostics.tierAttempts).toBeDefined();
    const attempts = result.diagnostics.tierAttempts!;
    // 全 4 tier を試す（T0 → T1a → T1b → T2）
    expect(attempts.length).toBe(4);
    expect(attempts.every((a) => a.rankedCount === 0)).toBe(true);
    expect(result.diagnostics.tierThinReason).toBeDefined();
    expect(result.ranked.length).toBe(0);
  });
});
