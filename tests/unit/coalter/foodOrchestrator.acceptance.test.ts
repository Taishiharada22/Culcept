/**
 * CoAlter Food §6.4 (6)-5 Acceptance Test (2026-04-20)
 *
 * CEO 固定ケース: 新宿 / 11時 / ラーメン / 醤油
 *
 * 目的:
 *   「(6)-1 〜 (6)-4 で実装した構造が、本当に既知失敗ケースを塞いだか」
 *   を CI レベルで固定する。個別 layer のテストは他ファイルに分散しているが、
 *   本テストは 1 つの既知シナリオで end-to-end の integrated 挙動を pin する。
 *
 * 既知失敗ケース（修正前の挙動）:
 *   - 新宿/11時/ラーメン/醤油の会話で、listicle/まとめサイトが direct candidate として
 *     返っていた。retrieval hygiene は効いていなかった。rankedCount=0 で落ちるか、
 *     まとめページを鮨ねて返していた。
 *
 * 修正後の期待:
 *   A. foodQueryBuilder が area + cuisine + time を projected=true で乗せる
 *      （query に location + cuisine + time が乗る）
 *   B. catalog 段で listicle/news が direct candidate に上がらない
 *      （blockedPageTypeCount >= 1 / blockedByPageType.listicle >= 1）
 *   C. rankedCount > 0（単一店舗ページが少なくとも 1 件 rank される）
 *   D. observability 指標が期待形:
 *      - pageTypeDistribution 7 key ゼロ埋め（2026-04-20 non_venue 追加）
 *      - missingWhereRateBySourceKind / insufficientInfoRateBySourceKind 7 key ∈ [0,1]
 *      - candidateEligiblePageRate ∈ [0,1]（listicle を含む場合は < 1）
 *      - food.diagnostics は 1 回のみ emit
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
  PageType,
  RelationshipContext,
  SearchCandidate,
} from "@/lib/coalter/types";
import {
  generateFoodProposalV2,
  evaluateFoodRetrievalHygiene,
} from "@/lib/coalter/foodOrchestrator";
import type { FoodQueryBuilderInput } from "@/lib/coalter/foodQueryBuilder";

// ─────────────────────────────────────────────
// 固定ケース（新宿 / 11時 / ラーメン / 醤油）
// ─────────────────────────────────────────────

const profileA: CoAlterPersonProfile = {
  userId: "a",
  displayName: "たいし",
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
  interests: ["ラーメン"],
  values: [],
  archetypeCode: null,
  coreFear: null,
  coreDesire: null,
};

const profileB: CoAlterPersonProfile = {
  ...profileA,
  userId: "b",
  displayName: "あやか",
};

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
    body: "新宿で11時頃、醤油ラーメン食べたい",
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
      preferences: ["醤油"],
    },
    constraintScore: 0.7,
    agreedConstraints: [],
  };
}

/** 固定 FoodLens（新宿 + ラーメン + 11時 + 醤油）。clarify に倒れない完全形。 */
function acceptanceLens(): FoodQueryBuilderInput {
  const atmosphere: FoodQuery["atmosphere"] = {
    quietness: "either",
    density: "either",
    lighting: "either",
  };
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
    atmosphere,
    // 醤油: narration/ranking で活きる mood タグとして本ケースを特定
    moodTags: ["醤油"],
    reservationUrgency: "flexible",
  };
}

/**
 * 固定 SearchCandidates:
 *   - 単一店舗ページ 2 件（venue_detail / reservation_partner）
 *   - listicle 1 件（新宿ラーメンまとめ）→ catalog で block されるべき
 *   - news 1 件（ラーメン業界ニュース）→ catalog で block されるべき
 *
 * すべて 新宿 + ラーメン + 11:00 オープン + 醤油ラーメン表記を含む。
 */
function acceptanceSearch(): SearchCandidate[] {
  return [
    {
      title: "醤油ラーメン 麺屋 こだま | 新宿駅南口徒歩3分",
      description:
        "新宿駅南口すぐ。熟成醤油ラーメン 980円。11:00〜22:00。食べログ3.6",
      externalRating: "3.6",
      practicalInfo: null,
      source: "食べログ",
      url: "https://tabelog.com/tokyo/A1304/rstdetail/kodama-shinjuku/",
    },
    {
      title: "らーめん 彩 新宿",
      description:
        "新宿駅東口徒歩5分。中華そば（醤油）1,100円。11:00〜23:00。",
      externalRating: null,
      practicalInfo: null,
      source: "TableCheck",
      url: "https://www.tablecheck.com/shops/sai-shinjuku/reserve",
    },
    // listicle（blockedPageTypeCount カウント対象）
    {
      title: "新宿の醤油ラーメンおすすめ10選 | 2026年ランキング",
      description: "新宿エリアで食べられる醤油ラーメンを厳選まとめ。",
      externalRating: null,
      practicalInfo: null,
      source: "まとめ",
      url: "https://matome-ramen.example/ranking/shinjuku-shoyu-top10",
    },
    // news（blockedPageTypeCount カウント対象）
    //   title に NEWS_TITLE_PATTERNS の「グランドオープン」
    //   domain に NEWS_ORIENTED_DOMAINS の prtimes.jp を使う
    {
      title: "【新宿】醤油ラーメン新店 グランドオープンのお知らせ",
      description: "新店オープンに関するプレスリリース記事。特定店舗情報ではない。",
      externalRating: null,
      practicalInfo: null,
      source: "プレスリリース",
      url: "https://prtimes.jp/main/html/rd/p/shinjuku-ramen-open-2026.html",
    },
  ];
}

function mockBrief() {
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
      mood: ["醤油"],
      rankingAxes: { preset: "balance_focus", rationale: "" },
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
// A. query に location + cuisine + time が乗る
// ─────────────────────────────────────────────

describe("§6.4 (6)-5 acceptance — A. query に location + cuisine + time", () => {
  it("buildFoodQuery: 新宿 / ラーメン / 11時 が searchStrings に乗る", () => {
    const r = evaluateFoodRetrievalHygiene(acceptanceLens());
    // clarify に倒れていない
    expect(r.clarifySignal.shouldClarify).toBe(false);

    // coverage: 3 軸すべて projected
    expect(r.coverage.area.projected).toBe(true);
    expect(r.coverage.cuisine.projected).toBe(true);
    expect(r.coverage.exactTime.projected).toBe(true);

    // searchStrings に token が少なくとも 1 本には入っている
    const joined = r.searchStrings.join(" | ");
    expect(joined).toContain("新宿");
    expect(joined).toContain("ラーメン");
    // 11 時 or 11:00 相当の表現が入る
    expect(joined).toMatch(/11/);
  });

  it("orchestrator: diagnostics.queryProjectionCoverage に 3 軸が projected で合流", async () => {
    runAIMock.mockImplementation(() => mockBrief());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: acceptanceSearch(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_accept_A",
      foodLens: acceptanceLens(),
    });
    const cov = result.diagnostics.queryProjectionCoverage;
    expect(cov).toBeDefined();
    expect(cov!.area.projected).toBe(true);
    expect(cov!.cuisine.projected).toBe(true);
    expect(cov!.exactTime.projected).toBe(true);
  });
});

// ─────────────────────────────────────────────
// B. listicle/news が direct candidate に上がらない
// ─────────────────────────────────────────────

describe("§6.4 (6)-5 acceptance — B. listicle/news は direct candidate に昇格しない", () => {
  it("catalog 段で listicle + news が 2 件 block される", async () => {
    runAIMock.mockImplementation(() => mockBrief());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: acceptanceSearch(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_accept_B",
      foodLens: acceptanceLens(),
    });

    const d = result.diagnostics;
    // 入力 4 件のうち listicle 1 + news 1 が block される
    expect(d.pageTypeDistribution.listicle).toBe(1);
    expect(d.pageTypeDistribution.news).toBe(1);
    expect(d.blockedPageTypeCount).toBe(2);
    expect(d.blockedByPageType.listicle).toBe(1);
    expect(d.blockedByPageType.news).toBe(1);

    // ranked に listicle/news URL が絶対に含まれない（契約の核）
    for (const r of result.ranked) {
      expect(r.sourceUrl).not.toMatch(/matome-ramen/);
      expect(r.sourceUrl).not.toMatch(/prtimes\.jp/);
    }
  });
});

// ─────────────────────────────────────────────
// B'. 2026-04-20 venue quality gate — municipal / directory は non_venue で block
// ─────────────────────────────────────────────

describe("§6.4 (6)-5 acceptance — B'. municipal / directory は non_venue で block (2026-04-20)", () => {
  function acceptanceSearchWithMunicipal(): SearchCandidate[] {
    return [
      ...acceptanceSearch(),
      // 追加: 新宿区役所（live smoke で candidate に昇格していた実例）
      {
        title: "新宿区役所 | 公式サイト",
        description: "住民票・戸籍・各種サービス",
        externalRating: null,
        practicalInfo: null,
        source: "公式",
        url: "https://www.city.shinjuku.lg.jp/index.html",
      },
      // 追加: listing domain の directory path（retty /category/）
      {
        title: "焼肉 | ジャンルから探す",
        description: "エリア別に焼肉店を検索",
        externalRating: null,
        practicalInfo: null,
        source: "Retty",
        url: "https://retty.me/category/yakiniku/",
      },
    ];
  }

  it("municipal host と directory path は non_venue で block され ranked に昇格しない", async () => {
    runAIMock.mockImplementation(() => mockBrief());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: acceptanceSearchWithMunicipal(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_accept_Bprime",
      foodLens: acceptanceLens(),
    });

    const d = result.diagnostics;
    // listicle 1 + news 1 + non_venue 2 = 4 件 block
    expect(d.pageTypeDistribution.non_venue).toBe(2);
    expect(d.blockedByPageType.non_venue).toBe(2);
    expect(d.blockedPageTypeCount).toBe(4);

    // 核契約: 市役所 URL と directory URL が ranked に絶対入らない
    for (const r of result.ranked) {
      expect(r.sourceUrl).not.toMatch(/city\.shinjuku\.lg\.jp/);
      expect(r.sourceUrl).not.toMatch(/retty\.me\/category\//);
    }
  });
});

// ─────────────────────────────────────────────
// C. rankedCount > 0
// ─────────────────────────────────────────────

describe("§6.4 (6)-5 acceptance — C. rankedCount > 0", () => {
  it("単一店舗ページから少なくとも 1 件が ranked に入る", async () => {
    runAIMock.mockImplementation(() => mockBrief());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: acceptanceSearch(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_accept_C",
      foodLens: acceptanceLens(),
    });

    expect(result.diagnostics.rankedCount).toBeGreaterThan(0);
    expect(result.ranked.length).toBeGreaterThan(0);

    // ranked の URL はすべて単一店舗ページ（tabelog rstdetail / tablecheck reserve）
    for (const r of result.ranked) {
      const okUrl =
        /tabelog\.com\/.*\/rstdetail\//.test(r.sourceUrl) ||
        /tablecheck\.com\/shops\/.*\/reserve/.test(r.sourceUrl);
      expect(okUrl).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────
// D. observability 指標が期待形
// ─────────────────────────────────────────────

describe("§6.4 (6)-5 acceptance — D. observability 指標が期待形", () => {
  const PAGE_TYPE_KEYS: readonly PageType[] = [
    "venue_detail",
    "official",
    "reservation_partner",
    "third_party_listing",
    "news",
    "listicle",
    "non_venue",
  ];

  it("pageTypeDistribution / blockedBy / rate は固定 7-key shape (2026-04-20 venue quality gate で non_venue 追加)", async () => {
    runAIMock.mockImplementation(() => mockBrief());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: acceptanceSearch(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_accept_D_shape",
      foodLens: acceptanceLens(),
    });
    const d = result.diagnostics;

    // 6-key shape (distribution)
    for (const k of PAGE_TYPE_KEYS) {
      expect(d.pageTypeDistribution).toHaveProperty(k);
      expect(typeof d.pageTypeDistribution[k]).toBe("number");
      expect(d.missingWhereRateBySourceKind).toHaveProperty(k);
      expect(d.insufficientInfoRateBySourceKind).toHaveProperty(k);
      expect(d.missingWhereRateBySourceKind[k]).toBeGreaterThanOrEqual(0);
      expect(d.missingWhereRateBySourceKind[k]).toBeLessThanOrEqual(1);
      expect(d.insufficientInfoRateBySourceKind[k]).toBeGreaterThanOrEqual(0);
      expect(d.insufficientInfoRateBySourceKind[k]).toBeLessThanOrEqual(1);
    }
    // 余計な key がない
    expect(Object.keys(d.pageTypeDistribution).sort()).toEqual(
      [...PAGE_TYPE_KEYS].sort(),
    );
    expect(Object.keys(d.missingWhereRateBySourceKind).sort()).toEqual(
      [...PAGE_TYPE_KEYS].sort(),
    );
    expect(Object.keys(d.insufficientInfoRateBySourceKind).sort()).toEqual(
      [...PAGE_TYPE_KEYS].sort(),
    );
  });

  it("candidateEligiblePageRate: raw=4, blocked=2 → (4-2)/4 = 0.5", async () => {
    runAIMock.mockImplementation(() => mockBrief());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: acceptanceSearch(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_accept_D_rate",
      foodLens: acceptanceLens(),
    });

    expect(result.diagnostics.rawSearchCandidates).toBe(4);
    expect(result.diagnostics.blockedPageTypeCount).toBe(2);
    expect(result.diagnostics.candidateEligiblePageRate).toBeCloseTo(0.5, 3);
    expect(Number.isFinite(result.diagnostics.candidateEligiblePageRate)).toBe(
      true,
    );
  });

  it("food.diagnostics は 1 回だけ emit（追加 emit なし）", async () => {
    runAIMock.mockImplementation(() => mockBrief());
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: acceptanceSearch(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_accept_D_emit",
      foodLens: acceptanceLens(),
    });

    const infoCalls = infoSpy.mock.calls.filter(
      (args) => String(args[0]) === "[CoAlter] food.diagnostics",
    );
    expect(infoCalls.length).toBe(1);
    const errorCalls = warnSpy.mock.calls.filter(
      (args) => String(args[0]) === "[CoAlter] food.orchestrator.error",
    );
    expect(errorCalls.length).toBe(0);

    // (6)-2c/(6)-4 の全 key が emit payload に合流している
    const payload = JSON.parse(String(infoCalls[0][1]));
    expect(payload).toHaveProperty("pageTypeDistribution");
    expect(payload).toHaveProperty("blockedPageTypeCount");
    expect(payload).toHaveProperty("blockedByPageType");
    expect(payload).toHaveProperty("missingWhereRateBySourceKind");
    expect(payload).toHaveProperty("insufficientInfoRateBySourceKind");
    expect(payload).toHaveProperty("candidateEligiblePageRate");
    expect(payload).toHaveProperty("queryProjectionCoverage");

    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// 回帰防止: 既知失敗ケースの total assertion（A+B+C+D 同時）
// ─────────────────────────────────────────────

describe("§6.4 (6)-5 acceptance — 新宿/11時/ラーメン/醤油 ケース total assertion", () => {
  it("1 回の run で A+B+C+D がすべて満たされる（CI 回帰ガード）", async () => {
    runAIMock.mockImplementation(() => mockBrief());
    const result = await generateFoodProposalV2({
      turns,
      analysis: makeAnalysis(),
      searchCandidates: acceptanceSearch(),
      profileA,
      profileB,
      relationship,
      sessionId: "sess_accept_total",
      foodLens: acceptanceLens(),
    });
    const d = result.diagnostics;

    // A. query に location + cuisine + time が乗る
    expect(d.queryProjectionCoverage!.area.projected).toBe(true);
    expect(d.queryProjectionCoverage!.cuisine.projected).toBe(true);
    expect(d.queryProjectionCoverage!.exactTime.projected).toBe(true);

    // B. listicle/news は direct candidate に昇格しない
    expect(d.blockedPageTypeCount).toBe(2);
    expect(d.pageTypeDistribution.listicle).toBe(1);
    expect(d.pageTypeDistribution.news).toBe(1);

    // C. rankedCount > 0
    expect(d.rankedCount).toBeGreaterThan(0);

    // D. observability 指標が期待形
    expect(d.candidateEligiblePageRate).toBeCloseTo(0.5, 3);
    expect(Number.isFinite(d.candidateEligiblePageRate)).toBe(true);
    // 6 key shape は別テストで shape-level 確認済み。ここでは rate が [0,1] に収まることのみ再確認
    for (const k of Object.keys(
      d.missingWhereRateBySourceKind,
    ) as PageType[]) {
      expect(d.missingWhereRateBySourceKind[k]).toBeGreaterThanOrEqual(0);
      expect(d.missingWhereRateBySourceKind[k]).toBeLessThanOrEqual(1);
    }
  });
});
