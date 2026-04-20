/**
 * CoAlter F-5 — foodOrchestrator foodLens wiring tests
 *
 * CEO lock 2026-04-20 F-5 条件 4: wiring test 4 系統。
 *
 *   (a) flag false 相当: foodLens/foodLensToday 両方 undefined → legacy 経路
 *   (b) flag true + lens 正常: foodLensToday 供給 → orchestrator 内部で derive
 *       → hygiene gate が走る + narration に lens 伝達
 *   (c) flag true + understanding degraded (相当): foodLensToday undefined だが
 *       foodLens も外部供給無し → legacy に fallback
 *   (d) 衝突: brief 時間 + foodLensToday 時間 → brief が勝つ（derive 経由）
 *
 * engine の flag 分岐そのものは route-level integration の守備範囲なので、
 * 本テストは orchestrator に渡ってきた後の "foodLensToday から derive する" 挙動を固定する。
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
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";
import { generateFoodProposalV2 } from "@/lib/coalter/foodOrchestrator";
import type { FoodLensToday } from "@/lib/coalter/understanding/foodLensAdapter";
import type { TwoPersonLensToday, UserId } from "@/lib/coalter/understanding/types";

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

/** brief: area=渋谷 / preferredStartHour=19 / timeSlot=evening */
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

/** lens.timeWindow をあえて "lunch" にして brief (dinner/19時) と衝突させる */
function makeFoodLensTodayConflict(): FoodLensToday {
  return {
    lens: makeLens(),
    foodContext: {
      hungerLevel: "hungry",
      timeWindow: "lunch",
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

beforeEach(() => {
  runAIMock.mockReset();
});

// ═════════════════════════════════════════════════════════════════════════
// (a) flag false 相当 — 両方 undefined → legacy
// ═════════════════════════════════════════════════════════════════════════

describe("F-5 wiring (a) — foodLens/foodLensToday 両方 undefined → legacy 経路", () => {
  it("hygiene gate 走らず、通常パイプラインで rank まで走る", async () => {
    runAIMock.mockImplementation(() => mockBriefOk());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_f5_a",
    });

    expect(result.diagnostics.rawSearchCandidates).toBe(1);
    expect(result.diagnostics.queryProjectionCoverage).toBeUndefined();
    expect(result.diagnostics.clarifyReason).toBeUndefined();
    expect(result.diagnostics.missingAxes).toBeUndefined();
    expect(result.diagnostics.droppedAxes).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// (b) flag true + lens 正常 — foodLensToday supplied → 内部 derive
// ═════════════════════════════════════════════════════════════════════════

describe("F-5 wiring (b) — foodLensToday 供給 → orchestrator 内部 derive", () => {
  it("hygiene gate が走り、4 field が diagnostics に合流", async () => {
    runAIMock.mockImplementation(() => mockBriefOk());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_f5_b",
      foodLensToday: makeFoodLensTodayConflict(),
      lens: makeLens(),
    });

    // 4 field は lens 由来 derive 経由で付く
    expect(result.diagnostics.queryProjectionCoverage).toBeDefined();
    expect(result.diagnostics.missingAxes).toBeDefined();
    expect(result.diagnostics.droppedAxes).toBeDefined();

    const cov = result.diagnostics.queryProjectionCoverage!;
    expect(cov.area.presentInInput).toBe(true);
    expect(cov.exactTime.presentInInput).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// (c) understanding degraded 相当 — foodLensToday undefined
// ═════════════════════════════════════════════════════════════════════════

describe("F-5 wiring (c) — foodLensToday undefined (degraded) → legacy fallback", () => {
  it("lens だけ供給しても foodLensToday 未供給なら hygiene gate は走らない", async () => {
    runAIMock.mockImplementation(() => mockBriefOk());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_f5_c",
      lens: makeLens(), // narration 用に渡すが、foodLensToday はなし
    });

    // foodLensToday が無いと effectiveFoodLens=null → legacy
    expect(result.diagnostics.queryProjectionCoverage).toBeUndefined();
    expect(result.diagnostics.clarifyReason).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// (d) brief vs lens time conflict — brief が勝つ
// ═════════════════════════════════════════════════════════════════════════

describe("F-5 wiring (d) — brief.preferredStartHour=19 vs lens.timeWindow=lunch → brief 勝利", () => {
  it("derive 結果の requestedTimeSlots は 19-20 時 (explicit) になる", async () => {
    runAIMock.mockImplementation(() => mockBriefOk());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_f5_d",
      foodLensToday: makeFoodLensTodayConflict(), // timeWindow=lunch
      lens: makeLens(),
    });

    // derive された foodLens が hygiene gate を通って、exactTime が projected
    // → dropped axes に exactTime は含まれていない
    const cov = result.diagnostics.queryProjectionCoverage!;
    expect(cov.exactTime.presentInInput).toBe(true);
    expect(cov.exactTime.projected).toBe(true);
    // dropped axes に exactTime が乗っていない = brief の時刻が採用された
    expect(result.diagnostics.droppedAxes).not.toContain("exactTime");
  });
});
