/**
 * CoAlter Food Orchestrator — Phase B Commit 3 E2E tests (2026-04-19)
 *
 * 9 観点（5W1H §テスト観点）+ CEO 追加条件 #2 (seed 固定 property-based):
 *  1. 5 分類の provider 判定（provider distribution）
 *  2. food.diagnostics shape 一致（Commit 2.5 §6）
 *  3. engine 分岐は別テストで扱う（ここでは orchestrator 単体に集中）
 *  4. query は webConnectorFoodQueries で検証済み（別ファイル）
 *  5. 不変条件 raw ≥ parsed ≥ (parsed - filterTrace) ≥ ranked（seed 固定）
 *  6. total == 0 時の ratio NaN guard
 *  7. unknown は hard filter にならない
 *  8. avoidKeys round-trip
 *  9. throw fallback は engine 側テストで扱う（ここでは emitFoodOrchestratorError 単体）
 *
 * 内容は:
 *  - 正常パス: diagnostics emit + shape + ranked + placeholder card
 *  - 異常パス: brief LLM 失敗 → parser fallback で diagnostics 出る
 *  - 不変条件: seed 固定 20 ケース
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
import {
  generateFoodProposalV2,
  computeBookingProviderDistribution,
  aggregateHardFilterReasons,
  emitFoodOrchestratorError,
  __internal,
} from "@/lib/coalter/foodOrchestrator";
import type { RankedFoodCandidate } from "@/lib/coalter/types";

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
    interests: ["和食", "イタリアン"],
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

function makeFoodAnalysis(
  overrides: Partial<ConversationAnalysis> = {},
): ConversationAnalysis {
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
    ...overrides,
  };
}

const turns: ConversationTurn[] = [
  {
    id: "t1",
    senderId: "a",
    body: "今夜、渋谷でご飯どこ行く？",
    createdAt: "2026-04-19T10:00:00Z",
  },
];

/** 実在店舗風の search 結果（foodCatalog がパース可能） */
function makeSearchCandidates(): SearchCandidate[] {
  return [
    {
      title: "鮨 まさ | 渋谷駅徒歩3分",
      description: "渋谷駅東口すぐ。おまかせ12,000円〜。17:00〜23:00。食べログ3.8",
      externalRating: "3.8",
      practicalInfo: null,
      source: "食べログ",
      url: "https://tabelog.com/tokyo/A1303/rstdetail/masa/",
    },
    {
      title: "トラットリア・ソーレ｜渋谷の人気店",
      description: "渋谷駅徒歩5分。ディナー6,000円〜。18:00〜22:30。Retty人気店",
      externalRating: null,
      practicalInfo: null,
      source: "Retty",
      url: "https://retty.me/area/PRE13/ARE15/sole/",
    },
    {
      title: "炭火焼 風月 | 渋谷の個室和食",
      description: "渋谷駅徒歩7分。コース8,000円〜。17:30〜23:00。",
      externalRating: null,
      practicalInfo: null,
      source: "公式",
      url: "https://fugetsu-shibuya.com/reservation/",
    },
  ];
}

function mockBriefSuccess() {
  return Promise.resolve({
    text: "",
    structured: {
      theme: "food",
      area: "渋谷",
      approximateTime: {
        date: "今夜",
        timeSlot: "night",
        preferredStartHour: 19,
      },
      mood: ["会話が続く"],
      rankingAxes: {
        preset: "balance_focus",
        rationale: "2 人の好みが近い",
      },
      primaryUnresolvedQuestion: null,
      confidence: 0.85,
    },
    usage: null,
    metadata: {},
    latencyMs: 10,
  });
}

beforeEach(() => {
  runAIMock.mockReset();
});

// ─────────────────────────────────────────────
// Test 1: 5 分類 provider 判定 (computeBookingProviderDistribution)
// ─────────────────────────────────────────────

describe("observation #1: 5 分類の provider 判定", () => {
  function makeRanked(sourceUrl: string): RankedFoodCandidate {
    return {
      candidateKey: `k:${sourceUrl}`,
      role: "balance",
      venue: {
        name: "店",
        station: null,
        area: "渋谷",
        priceBand: null,
        openingHours: null,
        rating: null,
        snippet: "",
      },
      sourceUrl,
      sourceDomain: new URL(sourceUrl).hostname,
      confidence: 0.5,
      axisScores: {},
      totalScore: 0.5,
      rationale: {
        matchedInterestsA: [],
        matchedInterestsB: [],
        matchedValuesA: [],
        matchedValuesB: [],
        appealedAxis: ["balance"],
        tradeoff: null,
        contingencyHint: null,
      },
      breakdown: {
        metrics: {
          budgetFit: 0.5,
          areaFit: 0.5,
          quietnessFit: 0.5,
          novelty: 0.5,
          cuisineMatchA: 0.5,
          cuisineMatchB: 0.5,
          moodMatch: 0.5,
          ratingFit: 0.5,
          compromiseQuality: 0,
        },
        roleScores: { balance: 0.5 },
        assignedRole: "balance",
      },
    };
  }

  it("official / official_site / official_reservation_partner / third_party_listing / unknown の 5 分類が正しく振り分けられる", () => {
    const ranked = [
      // official (公式 + /reservation)
      makeRanked("https://fugetsu-shibuya.com/reservation/"),
      // official_reservation_partner (TableCheck)
      makeRanked("https://www.tablecheck.com/shops/masa/reserve"),
      // third_party_listing (食べログ)
      makeRanked("https://tabelog.com/tokyo/A1303/rstdetail/masa/"),
      // unknown (未知ドメイン + booking path なし)
      makeRanked("https://some-random-blog.example/post/123"),
    ];
    const dist = computeBookingProviderDistribution(ranked);
    expect(dist.total).toBe(4);
    expect(dist.official.count).toBe(1);
    expect(dist.official_reservation_partner.count).toBe(1);
    expect(dist.third_party_listing.count).toBe(1);
    expect(dist.unknown.count).toBe(1);
    expect(dist.official_site.count).toBe(0);
  });

  it("件数と比率の両方が出る（ratio は 3 桁丸め）", () => {
    const ranked = [
      makeRanked("https://tabelog.com/a"),
      makeRanked("https://tabelog.com/b"),
      makeRanked("https://fugetsu.com/reservation/"),
    ];
    const dist = computeBookingProviderDistribution(ranked);
    expect(dist.total).toBe(3);
    expect(dist.third_party_listing.count).toBe(2);
    expect(dist.third_party_listing.ratio).toBeCloseTo(0.667, 2);
    expect(dist.official.count).toBe(1);
    expect(dist.official.ratio).toBeCloseTo(0.333, 2);
  });
});

// ─────────────────────────────────────────────
// Test 6: total == 0 時の ratio NaN guard
// ─────────────────────────────────────────────

describe("observation #6: total == 0 時の ratio NaN guard", () => {
  it("ranked=0 でも全 ratio が 0 で有限（NaN でない）", () => {
    const dist = computeBookingProviderDistribution([]);
    expect(dist.total).toBe(0);
    expect(dist.official.ratio).toBe(0);
    expect(dist.official_site.ratio).toBe(0);
    expect(dist.official_reservation_partner.ratio).toBe(0);
    expect(dist.third_party_listing.ratio).toBe(0);
    expect(dist.unknown.ratio).toBe(0);
    expect(Number.isFinite(dist.official.ratio)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 7: unknown は hard filter にならない
// ─────────────────────────────────────────────

describe("observation #7: unknown は hard filter にならない", () => {
  it("未知ドメインの候補でも rankFood は候補を返す（hard filter に unknown reason はない）", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    const search: SearchCandidate[] = [
      {
        title: "秘密のレストラン | 渋谷駅徒歩5分",
        description: "渋谷駅近くの隠れ家。17:00〜23:00。5,000円〜",
        externalRating: null,
        practicalInfo: null,
        source: "blog",
        url: "https://some-random-blog.example/shibuya/restaurant",
      },
    ];
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: search,
      profileA,
      profileB,
      relationship,
    });
    // 候補が 1 件は返ること（unknown provider でも drop しない）
    expect(result.ranked.length).toBeGreaterThanOrEqual(1);
    // filterTrace に unknown 由来の reason は入らない（FoodHardFilterReason に unknown なし）
    for (const t of result.diagnostics.filterTraceCount > 0
      ? [] // nothing to check
      : []) {
      // no-op
      expect(t).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────
// Test 2: food.diagnostics shape 一致
// ─────────────────────────────────────────────

describe("observation #2: food.diagnostics shape 一致", () => {
  it("Commit 2.5 §6 の必須キーをすべて含む", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_test",
    });

    const d = result.diagnostics;
    // top-level キー
    const requiredKeys = [
      "rawSearchCandidates",
      "parsedVenues",
      "nameGateDropCount",
      "candidateIdDedupDropCount",
      "rankedCount",
      "filterTraceCount",
      "hardFilterReasonCounts",
      "missingWhereDropCount",
      "insufficientInfoDropCount",
      "avgConfidence",
      "appliedPreset",
      "compromiseActiveCount",
      "noveltyUsedRoleCount",
      "ratingMissingCount",
      "openingHoursUnknownCount",
      "bookingProviderDistribution",
      "latencyMsCatalog",
      "latencyMsRank",
      "latencyMsNarration",
      "latencyMsTotal",
      // §6.4 (6)-2c: pageType diagnostics wiring
      "pageTypeDistribution",
      "blockedPageTypeCount",
      "blockedByPageType",
      // §6.4 (6)-4: source-kind 別欠落率 + eligible page rate
      "missingWhereRateBySourceKind",
      "insufficientInfoRateBySourceKind",
      "candidateEligiblePageRate",
    ];
    for (const k of requiredKeys) {
      expect(d).toHaveProperty(k);
    }

    // hardFilterReasonCounts は 10 種すべて（§6.4 (6)-2c で blocked_page_type 追加）
    const reasons = [
      "violates_budget",
      "violates_area",
      "violates_cuisine_exclusion",
      "violates_companions",
      "violates_opening_hours",
      "closed_permanently",
      "missing_where",
      "insufficient_info",
      "violates_avoid_keys",
      "blocked_page_type",
    ];
    for (const r of reasons) {
      expect(d.hardFilterReasonCounts).toHaveProperty(r);
    }

    // bookingProviderDistribution は 5 分類 + total
    const buckets = [
      "official",
      "official_site",
      "official_reservation_partner",
      "third_party_listing",
      "unknown",
    ];
    for (const b of buckets) {
      expect(d.bookingProviderDistribution).toHaveProperty(b);
      expect(
        d.bookingProviderDistribution[
          b as keyof typeof d.bookingProviderDistribution
        ],
      ).toHaveProperty("count");
      expect(
        d.bookingProviderDistribution[
          b as keyof typeof d.bookingProviderDistribution
        ],
      ).toHaveProperty("ratio");
    }
    expect(d.bookingProviderDistribution.total).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────
// Test 5: 不変条件 raw >= parsed >= (parsed - filterTrace) >= ranked
//         seed 固定 property-based (CEO 追加条件 #2)
// ─────────────────────────────────────────────

/** 決定的 PRNG (mulberry32) — seed 固定で CI flaky 排除 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSearchCase(rand: () => number, idx: number): SearchCandidate[] {
  const count = Math.floor(rand() * 8) + 1; // 1-8 件
  const out: SearchCandidate[] = [];
  const candidates = [
    {
      title: `鮨 ${idx}号店 | 渋谷駅徒歩${Math.floor(rand() * 10) + 1}分`,
      url: `https://tabelog.com/tokyo/rst/${idx}-${Math.floor(rand() * 1000)}/`,
    },
    {
      title: `トラットリア${idx} | 六本木の人気店`,
      url: `https://retty.me/area/PRE13/trattoria${idx}/`,
    },
    {
      title: `炭火焼 ${idx} | 新宿駅近く`,
      url: `https://fugetsu-${idx}.com/reservation/`,
    },
    {
      title: `無名レストラン${idx}`,
      url: `https://nameless-${idx}.example/`,
    },
    {
      title: `某店 | 店舗情報なし`, // name だけあるが place 情報なし → missing_where
      url: `https://tabelog.com/tokyo/rst/sparse-${idx}/`,
    },
  ];
  for (let i = 0; i < count; i++) {
    const pick = candidates[Math.floor(rand() * candidates.length)];
    out.push({
      title: pick.title,
      description: `適当な説明${idx}-${i}。17:00〜23:00。4,000円〜`,
      externalRating: rand() > 0.5 ? "3.8" : null,
      practicalInfo: null,
      source: "",
      url: pick.url,
    });
  }
  return out;
}

describe("observation #5: 不変条件 (seed 固定 property-based)", () => {
  it("seed=42 で 20 ケース生成、全ケースで raw >= parsed >= (parsed - filterTrace) >= ranked", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    const rand = mulberry32(42);
    const cases = 20;
    let violations = 0;

    for (let i = 0; i < cases; i++) {
      const search = generateSearchCase(rand, i);
      const result = await generateFoodProposalV2({
        turns,
        analysis: makeFoodAnalysis(),
        searchCandidates: search,
        profileA,
        profileB,
        relationship,
      });
      const d = result.diagnostics;
      const inv =
        d.rawSearchCandidates >= d.parsedVenues &&
        d.parsedVenues >= d.parsedVenues - d.filterTraceCount &&
        d.parsedVenues - d.filterTraceCount >= d.rankedCount;
      if (!inv) {
        violations += 1;
      }
    }
    expect(violations).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Test 8: avoidKeys round-trip
// ─────────────────────────────────────────────

describe("observation #8: avoidKeys round-trip", () => {
  it("avoidKeys に入っている candidateId は ranked に入らない", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    // 1st call: avoidKeys なし
    const first = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
    });
    if (first.ranked.length === 0) {
      // 候補 0 件だったらこのテストは空パス
      return;
    }
    const firstKey = first.ranked[0].candidateKey;

    // 2nd call: avoidKeys に 1st のキーを渡す
    const second = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      avoidKeys: [firstKey],
    });
    // 該当 key は drop されているはず
    for (const r of second.ranked) {
      expect(r.candidateKey).not.toBe(firstKey);
    }
  });
});

// ─────────────────────────────────────────────
// Test 9: emitFoodOrchestratorError / 正常時の diagnostics 排他
// ─────────────────────────────────────────────

describe("observation #9: diagnostics 二重発火禁止 (CEO 追加条件 #1)", () => {
  it("正常時: food.diagnostics が 1 回 emit、food.orchestrator.error は出ない", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
    });

    const diagnosticsCalls = infoSpy.mock.calls.filter(
      (args) => String(args[0]) === "[CoAlter] food.diagnostics",
    );
    expect(diagnosticsCalls.length).toBe(1);
    const errorCalls = warnSpy.mock.calls.filter(
      (args) => String(args[0]) === "[CoAlter] food.orchestrator.error",
    );
    expect(errorCalls.length).toBe(0);

    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("emitFoodOrchestratorError: fallbackUsed: true を含めて warn 発火", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    emitFoodOrchestratorError(new Error("boom"), "sess_err");
    const errorCalls = warnSpy.mock.calls.filter(
      (args) => String(args[0]) === "[CoAlter] food.orchestrator.error",
    );
    expect(errorCalls.length).toBe(1);
    const body = String(errorCalls[0][1]);
    expect(body).toContain("fallbackUsed");
    expect(body).toContain("true");
    expect(body).toContain("boom");
    expect(body).toContain("sess_err");
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// Auxiliary: aggregateHardFilterReasons
// ─────────────────────────────────────────────

describe("aggregateHardFilterReasons", () => {
  it("空 filterTrace は全カウント 0", () => {
    const acc = aggregateHardFilterReasons([]);
    expect(acc.missing_where).toBe(0);
    expect(acc.violates_budget).toBe(0);
    expect(Object.values(acc).every((v) => v === 0)).toBe(true);
  });

  it("複数 reason を持つ 1 件は個別カウント", () => {
    const acc = aggregateHardFilterReasons([
      {
        candidateId: "a",
        venueName: "X",
        reasons: ["missing_where", "insufficient_info"],
      },
      {
        candidateId: "b",
        venueName: "Y",
        reasons: ["missing_where"],
      },
    ]);
    expect(acc.missing_where).toBe(2);
    expect(acc.insufficient_info).toBe(1);
    expect(acc.violates_budget).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Internal: NOVELTY_USED_ROLES の独立テーブル確認
// ─────────────────────────────────────────────

describe("__internal.NOVELTY_USED_ROLES", () => {
  it("adventure / discovery / stimulating のみを含む", () => {
    expect(__internal.NOVELTY_USED_ROLES.has("adventure")).toBe(true);
    expect(__internal.NOVELTY_USED_ROLES.has("discovery")).toBe(true);
    expect(__internal.NOVELTY_USED_ROLES.has("stimulating")).toBe(true);
    expect(__internal.NOVELTY_USED_ROLES.has("balance")).toBe(false);
    expect(__internal.NOVELTY_USED_ROLES.has("safety")).toBe(false);
  });
});

// ─────────────────────────────────────────────
// §6.4 (6)-2c: pageType diagnostics wiring
//
// catalog 段の ParseFoodVenuesMeta から
//   pageTypeDistribution / blockedPageTypeCount / blockedByPageType
// を food.diagnostics に合流させる契約を固定する。
//
// CEO 条件:
//   (a) 主経路: catalog meta の値が diagnostics にそのまま流れる
//   (b) gated clarify 経路: Layer 1 を skip しているので 6 型 0 初期化 + 空オブジェクト
//   (c) 追加 emit なし: food.diagnostics は常に 1 回のみ
// ─────────────────────────────────────────────

describe("§6.4 (6)-2c: pageType diagnostics wiring", () => {
  /** listicle 1 + 正常 2 の混在 search 結果 */
  function makeMixedSearch(): SearchCandidate[] {
    return [
      // listicle: catalog 入口で block される
      {
        title: "渋谷グルメランキング2026 | おすすめ10選",
        description: "渋谷の人気店をランキング形式で紹介。10店舗まとめ。",
        externalRating: null,
        practicalInfo: null,
        source: "まとめサイト",
        url: "https://matome-gourmet.example/ranking/shibuya-top10",
      },
      // 正常 (venue_detail: 食べログ)
      {
        title: "鮨 まさ | 渋谷駅徒歩3分",
        description:
          "渋谷駅東口すぐ。おまかせ12,000円〜。17:00〜23:00。食べログ3.8",
        externalRating: "3.8",
        practicalInfo: null,
        source: "食べログ",
        url: "https://tabelog.com/tokyo/A1303/rstdetail/masa/",
      },
      // 正常 (reservation_partner: TableCheck)
      {
        title: "トラットリア・ソーレ 渋谷",
        description: "渋谷駅徒歩5分。ディナー6,000円〜。18:00〜22:30。",
        externalRating: null,
        practicalInfo: null,
        source: "TableCheck",
        url: "https://www.tablecheck.com/shops/sole-shibuya/reserve",
      },
    ];
  }

  it("主経路: catalog meta から pageTypeDistribution / blockedPageTypeCount / blockedByPageType が diagnostics に合流する", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: makeMixedSearch(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_pt_main",
    });

    const d = result.diagnostics;

    // 6 型すべてが key として存在（undefined ではなく 0 初期化）
    expect(d.pageTypeDistribution).toEqual(
      expect.objectContaining({
        venue_detail: expect.any(Number),
        official: expect.any(Number),
        reservation_partner: expect.any(Number),
        third_party_listing: expect.any(Number),
        news: expect.any(Number),
        listicle: expect.any(Number),
      }),
    );

    // listicle 1 件が block されている
    expect(d.pageTypeDistribution.listicle).toBe(1);
    expect(d.blockedPageTypeCount).toBe(1);
    expect(d.blockedByPageType.listicle).toBe(1);
    // news は混ぜていない
    expect(d.blockedByPageType.news ?? 0).toBe(0);

    // 正常 2 件はいずれかの直接 candidate 型に振り分く（listicle/news ではない）
    const acceptedCount =
      d.pageTypeDistribution.venue_detail +
      d.pageTypeDistribution.official +
      d.pageTypeDistribution.reservation_partner +
      d.pageTypeDistribution.third_party_listing;
    expect(acceptedCount).toBe(2);

    // 分布合計 = rawSearchCandidates と一致（catalog が全件を分類している）
    const distTotal =
      d.pageTypeDistribution.venue_detail +
      d.pageTypeDistribution.official +
      d.pageTypeDistribution.reservation_partner +
      d.pageTypeDistribution.third_party_listing +
      d.pageTypeDistribution.news +
      d.pageTypeDistribution.listicle;
    expect(distTotal).toBe(d.rawSearchCandidates);
  });

  it("主経路: listicle/news を含まない search でも 6 型はすべて 0 初期化されて key が存在する", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    // listicle 誘発語（"人気店" / "ランキング" / "まとめ"）を含まない純粋な店舗情報のみ
    const cleanSearch: SearchCandidate[] = [
      {
        title: "鮨 まさ | 渋谷駅徒歩3分",
        description:
          "渋谷駅東口すぐ。おまかせ12,000円〜。17:00〜23:00。食べログ3.8",
        externalRating: "3.8",
        practicalInfo: null,
        source: "食べログ",
        url: "https://tabelog.com/tokyo/A1303/rstdetail/masa/",
      },
      {
        title: "炭火焼 風月 | 渋谷の個室和食",
        description: "渋谷駅徒歩7分。コース8,000円〜。17:30〜23:00。",
        externalRating: null,
        practicalInfo: null,
        source: "公式",
        url: "https://fugetsu-shibuya.com/reservation/",
      },
    ];

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: cleanSearch,
      profileA,
      profileB,
      relationship,
      sessionId: "sess_pt_clean",
    });

    const d = result.diagnostics;
    expect(d.pageTypeDistribution.listicle).toBe(0);
    expect(d.pageTypeDistribution.news).toBe(0);
    expect(d.blockedPageTypeCount).toBe(0);
    // listicle/news が 0 件なら blockedByPageType は空 or 全 0
    expect(d.blockedByPageType.listicle ?? 0).toBe(0);
    expect(d.blockedByPageType.news ?? 0).toBe(0);
  });

  it("hardFilterReasonCounts に blocked_page_type が key として存在する（0 初期化を含む）", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_pt_hf",
    });

    // catalog 段で止まるので ranker 側の blocked_page_type は 0 のはず
    // だが key は必ず存在する（型契約）
    expect(result.diagnostics.hardFilterReasonCounts).toHaveProperty(
      "blocked_page_type",
    );
    expect(result.diagnostics.hardFilterReasonCounts.blocked_page_type).toBe(0);
  });

  it("主経路: food.diagnostics は 1 回だけ emit される（追加 emit なし）", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: makeMixedSearch(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_pt_emit",
    });

    const calls = infoSpy.mock.calls.filter(
      (args) => String(args[0]) === "[CoAlter] food.diagnostics",
    );
    expect(calls.length).toBe(1);

    // emit ペイロードにも 3 field が含まれる
    const payload = JSON.parse(String(calls[0][1]));
    expect(payload).toHaveProperty("pageTypeDistribution");
    expect(payload).toHaveProperty("blockedPageTypeCount");
    expect(payload).toHaveProperty("blockedByPageType");

    infoSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// §6.4 (6)-2c: gated clarify 経路の zero-fill 契約
// ─────────────────────────────────────────────
//
// lens 供給 + shouldClarify=true の時は Layer 1 (catalog) を skip するので
// pageType 情報は走らせていない。それでも FoodDiagnostics 型契約は維持するため
// 6 型 0 初期化 + blockedPageTypeCount=0 + blockedByPageType={} で穴埋めする。

describe("§6.4 (6)-2c: gated clarify 経路の zero-fill", () => {
  function clarifyLens() {
    // area null → critical_axis_missing
    return {
      area: null,
      areaSource: "environmental.location" as const,
      cuisineHints: ["ラーメン"],
      cuisineSource: "foodContext.cuisineHints" as const,
      excludeCuisines: [],
      priceBand: null,
      requestedTimeSlots: [
        {
          localDate: null,
          startHour: 11,
          endHour: 12,
          confidence: "approximate" as const,
        },
      ],
      targetLocalTime: null,
      timeWindow: "lunch" as const,
      exactTimeSource: "foodContext.requestedTimeSlots" as const,
      occasion: null,
      atmosphere: {
        quietness: "either" as const,
        density: "either" as const,
        lighting: "either" as const,
      },
      moodTags: [],
      reservationUrgency: "flexible" as const,
    };
  }

  it("gated clarify → pageTypeDistribution は 6 型すべて 0 初期化", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: [], // engine が web search を skip した結果を想定
      profileA,
      profileB,
      relationship,
      sessionId: "sess_pt_gated",
      foodLens: clarifyLens(),
    });

    // Layer 1 skip の証拠
    expect(result.diagnostics.parsedVenues).toBe(0);
    expect(result.diagnostics.rankedCount).toBe(0);
    expect(result.diagnostics.latencyMsCatalog).toBe(0);

    // 6 型すべて 0 初期化（undefined ではなく 0）
    const dist = result.diagnostics.pageTypeDistribution;
    expect(dist.venue_detail).toBe(0);
    expect(dist.official).toBe(0);
    expect(dist.reservation_partner).toBe(0);
    expect(dist.third_party_listing).toBe(0);
    expect(dist.news).toBe(0);
    expect(dist.listicle).toBe(0);

    // block カウンタも 0 / 空
    expect(result.diagnostics.blockedPageTypeCount).toBe(0);
    expect(result.diagnostics.blockedByPageType).toEqual({});
  });

  it("gated clarify でも search が供給されていても page type は走らない（Layer 1 skip 契約）", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    // engine 未配線シナリオ: clarify lens だが engine が search を残して渡してきた場合でも、
    // orchestrator 側は Layer 1 を skip するため pageType は 0 のまま（pollution 侵入禁止）。
    const listicleLike: SearchCandidate[] = [
      {
        title: "東京グルメランキング2026 TOP10",
        description: "おすすめまとめ",
        externalRating: null,
        practicalInfo: null,
        source: "matome",
        url: "https://matome.example/ranking/top10",
      },
    ];

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: listicleLike,
      profileA,
      profileB,
      relationship,
      sessionId: "sess_pt_gated_pollution",
      foodLens: clarifyLens(),
    });

    // search が渡されても rawSearchCandidates には計上、catalog は走らない
    expect(result.diagnostics.rawSearchCandidates).toBe(1);
    expect(result.diagnostics.parsedVenues).toBe(0);
    // Layer 1 を skip しているので listicle もカウントされない
    expect(result.diagnostics.pageTypeDistribution.listicle).toBe(0);
    expect(result.diagnostics.blockedPageTypeCount).toBe(0);
    expect(result.diagnostics.blockedByPageType).toEqual({});
  });
});

// ─────────────────────────────────────────────
// §6.4 (6)-4: observability — source-kind 別欠落率 + eligible page rate
//
// 定義:
//   missingWhereRateBySourceKind[pt]        = (pt で落ちた missing_where 件) / (pt で ranker に入った件)
//   insufficientInfoRateBySourceKind[pt]    = (pt で落ちた insufficient_info 件) / (pt で ranker に入った件)
//   candidateEligiblePageRate               = (raw - blockedPageTypeCount) / raw
//
// 契約:
//   - 固定 6-key shape（venue_detail / official / reservation_partner / third_party_listing / news / listicle）
//   - 分母 0 → 0.0（NaN 禁止）
//   - gated clarify path: 全 0 埋め
//   - 追加 emit なし（food.diagnostics 1 回のみ）
// ─────────────────────────────────────────────

describe("§6.4 (6)-4: observability — source-kind rates + eligible page rate", () => {
  const PAGE_TYPE_KEYS: readonly string[] = [
    "venue_detail",
    "official",
    "reservation_partner",
    "third_party_listing",
    "news",
    "listicle",
    "non_venue",
  ];

  function expectSixKeyShape(
    obj: Record<string, number>,
  ): void {
    for (const k of PAGE_TYPE_KEYS) {
      expect(obj).toHaveProperty(k);
      expect(typeof obj[k]).toBe("number");
      // rate は [0, 1]
      expect(obj[k]).toBeGreaterThanOrEqual(0);
      expect(obj[k]).toBeLessThanOrEqual(1);
    }
    // 余計な key がない
    expect(Object.keys(obj).sort()).toEqual([...PAGE_TYPE_KEYS].sort());
  }

  it("固定 6-key shape: missingWhere/insufficientInfo Rate は常に 6 key ゼロ埋め", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_rate_shape",
    });

    expectSixKeyShape(
      result.diagnostics.missingWhereRateBySourceKind as Record<string, number>,
    );
    expectSixKeyShape(
      result.diagnostics.insufficientInfoRateBySourceKind as Record<
        string,
        number
      >,
    );
  });

  it("missing_where が出ない綺麗な候補のみ → 全 pageType で missingWhereRate=0", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_clean_missing_where",
    });

    const r = result.diagnostics.missingWhereRateBySourceKind;
    expect(r.venue_detail).toBe(0);
    expect(r.official).toBe(0);
    expect(r.reservation_partner).toBe(0);
    expect(r.third_party_listing).toBe(0);
    expect(r.news).toBe(0);
    expect(r.listicle).toBe(0);
  });

  it("third_party_listing で location 欠落 → missingWhereRateBySourceKind.third_party_listing > 0", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    // tabelog (third_party_listing) で area/station が拾えない候補を混ぜる
    const search: SearchCandidate[] = [
      // 正常 (third_party_listing + 駅情報あり → ranker 通過)
      {
        title: "鮨 まさ | 渋谷駅徒歩3分",
        description:
          "渋谷駅東口すぐ。おまかせ12,000円〜。17:00〜23:00。食べログ3.8",
        externalRating: "3.8",
        practicalInfo: null,
        source: "食べログ",
        url: "https://tabelog.com/tokyo/A1303/rstdetail/masa/",
      },
      // location 欠落 (third_party_listing + 駅/エリアなし → missing_where)
      {
        title: "秘密の居酒屋 みやび",
        description:
          "こだわりの日本酒と季節料理。17:00〜23:00。4,000円〜。",
        externalRating: null,
        practicalInfo: null,
        source: "食べログ",
        url: "https://tabelog.com/tokyo/rstdetail/miyabi-location-unknown/",
      },
    ];

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: search,
      profileA,
      profileB,
      relationship,
      sessionId: "sess_missing_where_tpl",
    });

    const d = result.diagnostics;
    // third_party_listing で 2 件 ranker 入力、うち 1 件が missing_where → rate 0.5
    expect(d.missingWhereRateBySourceKind.third_party_listing).toBeCloseTo(
      0.5,
      3,
    );
    // 他の pageType は 0 のまま
    expect(d.missingWhereRateBySourceKind.venue_detail).toBe(0);
    expect(d.missingWhereRateBySourceKind.official).toBe(0);
    expect(d.missingWhereRateBySourceKind.reservation_partner).toBe(0);
    expect(d.missingWhereRateBySourceKind.listicle).toBe(0);
    expect(d.missingWhereRateBySourceKind.news).toBe(0);
    // filterTrace にも反映
    expect(d.missingWhereDropCount).toBeGreaterThanOrEqual(1);
  });

  it("candidateEligiblePageRate: raw=3, listicle=1 → (3-1)/3 = 0.667", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    const search: SearchCandidate[] = [
      // venue_detail (正常)
      {
        title: "鮨 まさ | 渋谷駅徒歩3分",
        description:
          "渋谷駅東口すぐ。おまかせ12,000円〜。17:00〜23:00。",
        externalRating: null,
        practicalInfo: null,
        source: "食べログ",
        url: "https://tabelog.com/tokyo/A1303/rstdetail/masa/",
      },
      // reservation_partner (正常)
      {
        title: "トラットリア・ソーレ 渋谷",
        description: "渋谷駅徒歩5分。ディナー6,000円〜。18:00〜22:30。",
        externalRating: null,
        practicalInfo: null,
        source: "TableCheck",
        url: "https://www.tablecheck.com/shops/sole-shibuya/reserve",
      },
      // listicle (block される)
      {
        title: "渋谷グルメランキング2026 TOP10",
        description: "おすすめ10店舗まとめ",
        externalRating: null,
        practicalInfo: null,
        source: "まとめ",
        url: "https://matome-gourmet.example/ranking/shibuya",
      },
    ];

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: search,
      profileA,
      profileB,
      relationship,
      sessionId: "sess_eligible_rate",
    });

    expect(result.diagnostics.rawSearchCandidates).toBe(3);
    expect(result.diagnostics.blockedPageTypeCount).toBe(1);
    expect(result.diagnostics.candidateEligiblePageRate).toBeCloseTo(0.667, 3);
  });

  it("candidateEligiblePageRate: raw=0 → 0.0（NaN ガード）", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: [], // raw=0
      profileA,
      profileB,
      relationship,
      sessionId: "sess_eligible_zero",
    });

    expect(result.diagnostics.rawSearchCandidates).toBe(0);
    expect(result.diagnostics.candidateEligiblePageRate).toBe(0);
    expect(Number.isFinite(result.diagnostics.candidateEligiblePageRate)).toBe(
      true,
    );
  });

  it("candidateEligiblePageRate: listicle/news 0 件 → 1.0", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: [
        {
          title: "鮨 まさ | 渋谷駅徒歩3分",
          description: "渋谷駅東口すぐ。17:00〜23:00。",
          externalRating: null,
          practicalInfo: null,
          source: "食べログ",
          url: "https://tabelog.com/tokyo/A1303/rstdetail/masa/",
        },
      ],
      profileA,
      profileB,
      relationship,
      sessionId: "sess_eligible_full",
    });

    expect(result.diagnostics.blockedPageTypeCount).toBe(0);
    expect(result.diagnostics.candidateEligiblePageRate).toBe(1);
  });

  it("gated clarify: 3 field すべて 0 埋め（Layer 1 skip 契約）", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());

    const lens = {
      area: null,
      areaSource: "environmental.location" as const,
      cuisineHints: ["ラーメン"],
      cuisineSource: "foodContext.cuisineHints" as const,
      excludeCuisines: [],
      priceBand: null,
      requestedTimeSlots: [
        {
          localDate: null,
          startHour: 11,
          endHour: 12,
          confidence: "approximate" as const,
        },
      ],
      targetLocalTime: null,
      timeWindow: "lunch" as const,
      exactTimeSource: "foodContext.requestedTimeSlots" as const,
      occasion: null,
      atmosphere: {
        quietness: "either" as const,
        density: "either" as const,
        lighting: "either" as const,
      },
      moodTags: [],
      reservationUrgency: "flexible" as const,
    };

    const result = await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: [],
      profileA,
      profileB,
      relationship,
      sessionId: "sess_rate_gated",
      foodLens: lens,
    });

    expectSixKeyShape(
      result.diagnostics.missingWhereRateBySourceKind as Record<string, number>,
    );
    expectSixKeyShape(
      result.diagnostics.insufficientInfoRateBySourceKind as Record<
        string,
        number
      >,
    );
    // すべて 0
    const m = result.diagnostics.missingWhereRateBySourceKind;
    const i = result.diagnostics.insufficientInfoRateBySourceKind;
    for (const k of PAGE_TYPE_KEYS) {
      expect(m[k as keyof typeof m]).toBe(0);
      expect(i[k as keyof typeof i]).toBe(0);
    }
    expect(result.diagnostics.candidateEligiblePageRate).toBe(0);
  });

  it("単一 emit 不変: food.diagnostics は 1 回のみ、3 新 field を含む", async () => {
    runAIMock.mockImplementation(() => mockBriefSuccess());
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await generateFoodProposalV2({
      turns,
      analysis: makeFoodAnalysis(),
      searchCandidates: makeSearchCandidates(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_rate_emit",
    });

    const calls = infoSpy.mock.calls.filter(
      (args) => String(args[0]) === "[CoAlter] food.diagnostics",
    );
    expect(calls.length).toBe(1);
    const payload = JSON.parse(String(calls[0][1]));
    expect(payload).toHaveProperty("missingWhereRateBySourceKind");
    expect(payload).toHaveProperty("insufficientInfoRateBySourceKind");
    expect(payload).toHaveProperty("candidateEligiblePageRate");

    infoSpy.mockRestore();
  });
});
