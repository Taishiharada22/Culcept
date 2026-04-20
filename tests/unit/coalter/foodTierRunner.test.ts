/**
 * CoAlter F-6 — Food Tier Runner tests
 *
 * CEO lock 2026-04-20 F-6 契約:
 *   1. Tier 入力は query 主体 + brief fallback
 *   2. 成功閾値 = ranked.length >= 1（"豊富" 3 は diagnostics/narration 用のみ）
 *   3. Tier 結果は混ぜない。最初に success した tier の ranked をそのまま採用
 *
 * 本テストの検証対象:
 *   - T0 hit: 最初に成功した tier で停止、以降は試行しない
 *   - T1a hit: T0 で 0 件 → T1a（時間拡張）で hit → ranked 1 件でも停止
 *   - T1b hit: T0/T1a で 0 件 → T1b（地理拡張）で hit
 *   - T2 thin: 全 tier 0 件 → T2 結果 + thinReason セット
 *   - query.area 優先: brief.area=null / query.area="渋谷" → tier loop が走る
 *   - no merge: T0 で 2 件あれば T1a を試行しない（rankedCount=2 でも停止）
 *   - no mutation: 入力 brief / query は mutate されない
 */

import { describe, it, expect } from "vitest";

import {
  runTieredRanking,
  FOOD_TIER_SUCCESS_THRESHOLD,
  __internal,
} from "@/lib/coalter/foodTierRunner";
import type {
  ActivityCandidate,
  ConversationBrief,
  CoAlterPersonProfile,
  FoodQuery,
  FoodVenue,
  RankingAxesPreset,
} from "@/lib/coalter/types";

// ──────────── helpers ────────────

function venue(overrides: Partial<FoodVenue> = {}): FoodVenue {
  return {
    name: "和食ABC",
    station: "渋谷駅",
    area: "渋谷",
    priceBand: "¥3,000〜¥3,999",
    openingHours: "18:00〜23:00",
    rating: "3.7",
    snippet: "渋谷 和食 落ち着いた 個室",
    ...overrides,
  };
}

function candidate(
  venueOverrides: Partial<FoodVenue> = {},
  idSuffix = "a",
): ActivityCandidate<FoodVenue> {
  const v = venue(venueOverrides);
  return {
    candidateId: `food:tabelog.com:${v.name}:${idSuffix}`,
    sourceUrl: `https://tabelog.com/tokyo/A/${idSuffix}`,
    sourceDomain: "tabelog.com",
    confidence: 0.8,
    domain: "food",
    entity: v,
    durationEstimate: null,
    bestTimeWindows: [],
    reservationNeed: "unknown",
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
    interests: ["和食"],
    values: [],
    archetypeCode: null,
    coreFear: null,
    coreDesire: null,
  };
}

function brief(
  overrides: Partial<ConversationBrief> = {},
  preset: RankingAxesPreset = "balance_focus",
): ConversationBrief {
  return {
    theme: "food",
    area: null,
    approximateTime: { date: null, timeSlot: null, preferredStartHour: null },
    mood: [],
    hardConstraints: [],
    rankingAxes: {
      preset,
      roles: ["balance", "aFocus", "bFocus"],
      rationale: "test",
    },
    primaryUnresolvedQuestion: null,
    confidence: 0.8,
    source: "llm",
    ...overrides,
  };
}

function makeQuery(overrides: Partial<FoodQuery> = {}): FoodQuery {
  return {
    cuisines: [],
    excludeCuisines: [],
    priceBand: null,
    area: "渋谷",
    timeWindow: "dinner",
    requestedTimeSlots: [
      {
        localDate: null,
        startHour: 19,
        endHour: 20,
        confidence: "explicit",
      },
    ],
    targetLocalTime: "19:00",
    occasion: null,
    atmosphere: { quietness: "either", density: "either", lighting: "either" },
    moodTags: [],
    reservationUrgency: "flexible",
    ...overrides,
  };
}

const pA = profile("a");
const pB = profile("b");

// ═════════════════════════════════════════════════════════════════════════
// T0 hit
// ═════════════════════════════════════════════════════════════════════════

describe("F-6 T0 hit — 指定エリア × 指定時間で成功", () => {
  it("T0 で ranked >= 1 → appliedTier='T0'、以降の tier は試行しない", () => {
    const catalog = [
      candidate({ area: "渋谷", openingHours: "18:00〜23:00" }, "shibuya-1"),
      candidate({ area: "渋谷", openingHours: "17:00〜22:00" }, "shibuya-2"),
    ];
    const out = runTieredRanking({
      brief: brief({ area: "渋谷" }),
      query: makeQuery({ area: "渋谷" }),
      catalog,
      avoidKeys: [],
      profileA: pA,
      profileB: pB,
    });
    expect(out).not.toBeNull();
    expect(out!.appliedTier).toBe("T0");
    expect(out!.ranked.length).toBeGreaterThanOrEqual(FOOD_TIER_SUCCESS_THRESHOLD);
    // T0 で止まっている: tierAttempts は 1 件（T0 のみ）
    expect(out!.tierAttempts).toHaveLength(1);
    expect(out!.tierAttempts[0].tier).toBe("T0");
    expect(out!.tierThinReason).toBeUndefined();
  });

  it("T0 で ranked=1 でも T1a を試行しない（件数より精度優先）", () => {
    // 19-20 に営業する渋谷の venue は 1 つだけ
    const catalog = [
      candidate({ area: "渋谷", openingHours: "18:00〜23:00" }, "only"),
    ];
    const out = runTieredRanking({
      brief: brief({ area: "渋谷" }),
      query: makeQuery({ area: "渋谷" }),
      catalog,
      avoidKeys: [],
      profileA: pA,
      profileB: pB,
    });
    expect(out).not.toBeNull();
    expect(out!.appliedTier).toBe("T0");
    expect(out!.ranked.length).toBe(1);
    expect(out!.tierAttempts).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// T1a hit — 時間拡張
// ═════════════════════════════════════════════════════════════════════════

describe("F-6 T1a hit — 時間拡張で成功", () => {
  it("T0 で 0 件 → T1a（隣接時間）で hit", () => {
    //   query.requestedTimeSlots = [{19-20}]
    //   venue opens 11:00-19:00 (close ちょうど 19:00 = query start)
    //   T0 (19-20): 11<20 && 19>19=false → 全て violates_opening_hours で 0 件
    //   T1a (18-19 / 20-21 / 明日 19-20):
    //     18-19: 11<19 && 19>18 → true → 通る ✓
    //   → T1a で hit
    const catalog = [
      candidate({ area: "渋谷", openingHours: "11:00〜19:00" }, "cafe"),
    ];
    const out = runTieredRanking({
      brief: brief({ area: "渋谷" }),
      query: makeQuery({ area: "渋谷" }),
      catalog,
      avoidKeys: [],
      profileA: pA,
      profileB: pB,
    });
    expect(out).not.toBeNull();
    expect(out!.appliedTier).toBe("T1a");
    expect(out!.ranked.length).toBeGreaterThanOrEqual(FOOD_TIER_SUCCESS_THRESHOLD);
    expect(out!.tierAttempts.map((a) => a.tier)).toEqual(["T0", "T1a"]);
    expect(out!.tierAttempts[0].rankedCount).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// T1b hit — 地理拡張
// ═════════════════════════════════════════════════════════════════════════

describe("F-6 T1b hit — 地理拡張で成功", () => {
  it("渋谷に venue 無し / 恵比寿に venue あり → T1b で hit", () => {
    // T0 渋谷 19-20: venue が存在しない → 0 件
    // T1a 渋谷 隣接時間: venue が存在しないので同じく 0 件
    // T1b 表参道/恵比寿/... 19-20: 恵比寿の venue が通る
    const catalog = [
      candidate(
        { area: "恵比寿", station: "恵比寿駅", openingHours: "18:00〜23:00" },
        "ebisu-1",
      ),
    ];
    const out = runTieredRanking({
      brief: brief({ area: "渋谷" }),
      query: makeQuery({ area: "渋谷" }),
      catalog,
      avoidKeys: [],
      profileA: pA,
      profileB: pB,
    });
    expect(out).not.toBeNull();
    expect(out!.appliedTier).toBe("T1b");
    expect(out!.ranked.length).toBeGreaterThanOrEqual(FOOD_TIER_SUCCESS_THRESHOLD);
    expect(out!.tierAttempts.map((a) => a.tier)).toEqual(["T0", "T1a", "T1b"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// T2 thin — 全 tier 0 件
// ═════════════════════════════════════════════════════════════════════════

describe("F-6 T2 thin — 全 tier 0 件で打ち止め", () => {
  it("catalog 空 → appliedTier='T2'、tierThinReason セット", () => {
    const out = runTieredRanking({
      brief: brief({ area: "渋谷" }),
      query: makeQuery({ area: "渋谷" }),
      catalog: [],
      avoidKeys: [],
      profileA: pA,
      profileB: pB,
    });
    expect(out).not.toBeNull();
    expect(out!.appliedTier).toBe("T2");
    expect(out!.ranked).toHaveLength(0);
    expect(out!.tierAttempts).toHaveLength(4);
    expect(out!.tierAttempts.every((a) => a.rankedCount === 0)).toBe(true);
    expect(out!.tierThinReason).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// skip 条件 — area / time derive 不能
// ═════════════════════════════════════════════════════════════════════════

describe("F-6 skip — area / time が derive 不能なら null", () => {
  it("query.area / brief.area 両方欠落 → null（caller は plain rankFood にフォールバック）", () => {
    const out = runTieredRanking({
      brief: brief(),
      query: makeQuery({ area: null }),
      catalog: [candidate({}, "x")],
      avoidKeys: [],
      profileA: pA,
      profileB: pB,
    });
    expect(out).toBeNull();
  });

  it("query なし + brief.area なし + brief.approximateTime 全欠落 → null", () => {
    const out = runTieredRanking({
      brief: brief(),
      catalog: [candidate({}, "x")],
      avoidKeys: [],
      profileA: pA,
      profileB: pB,
    });
    expect(out).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// query > brief priority (CEO 修正 1)
// ═════════════════════════════════════════════════════════════════════════

describe("F-6 priority — query.area / query.requestedTimeSlots が brief より優先", () => {
  it("brief.area=null / query.area='渋谷' → tier loop が走る（CEO 追加テスト）", () => {
    const catalog = [
      candidate({ area: "渋谷", openingHours: "18:00〜23:00" }, "only"),
    ];
    const out = runTieredRanking({
      brief: brief({ area: null }),
      query: makeQuery({ area: "渋谷" }),
      catalog,
      avoidKeys: [],
      profileA: pA,
      profileB: pB,
    });
    expect(out).not.toBeNull();
    expect(out!.appliedTier).toBe("T0");
    expect(out!.ranked.length).toBeGreaterThanOrEqual(1);
  });

  it("brief.area='新宿' / query.area='渋谷' → query 優先で渋谷 catalog が通る", () => {
    // brief.area が新宿だと新宿 venue しか通らないはず。
    // query.area=渋谷 が優先されれば、渋谷 venue が T0 で通る。
    const catalog = [
      candidate({ area: "渋谷", openingHours: "18:00〜23:00" }, "shibuya"),
    ];
    const out = runTieredRanking({
      brief: brief({ area: "新宿" }),
      query: makeQuery({ area: "渋谷" }),
      catalog,
      avoidKeys: [],
      profileA: pA,
      profileB: pB,
    });
    expect(out).not.toBeNull();
    expect(out!.appliedTier).toBe("T0");
    expect(out!.ranked.length).toBe(1);
  });

  it("query.requestedTimeSlots の explicit hour が brief.timeSlot より優先", () => {
    // brief.timeSlot=evening (17-20) / query.requestedTimeSlots=[19-20]
    // venue opens 15:00-16:00 → coarse evening でも explicit 19-20 でも NG
    // venue opens 19:00-21:00 → coarse evening OK、explicit 19-20 OK
    // このテストは derive が query から取れることを確認すれば足りる
    const priorityTime = __internal.derivePrimaryTimeSlot(
      brief({ approximateTime: { date: null, timeSlot: "evening", preferredStartHour: null } }),
      makeQuery({
        requestedTimeSlots: [
          { localDate: null, startHour: 11, endHour: 12, confidence: "explicit" },
        ],
      }),
    );
    expect(priorityTime).toEqual({ startHour: 11, endHour: 12, dayOffset: 0 });
  });

  it("query 欠落時は brief.approximateTime.preferredStartHour → [h, h+1]", () => {
    const t = __internal.derivePrimaryTimeSlot(
      brief({ approximateTime: { date: null, timeSlot: null, preferredStartHour: 19 } }),
      undefined,
    );
    expect(t).toEqual({ startHour: 19, endHour: 20, dayOffset: 0 });
  });

  it("query / preferredStartHour 欠落時は brief.timeSlot → 粗い window", () => {
    const t = __internal.derivePrimaryTimeSlot(
      brief({ approximateTime: { date: null, timeSlot: "evening", preferredStartHour: null } }),
      undefined,
    );
    expect(t).toEqual({ startHour: 18, endHour: 20, dayOffset: 0 });
  });
});

// ═════════════════════════════════════════════════════════════════════════
// no merge (CEO 修正 3)
// ═════════════════════════════════════════════════════════════════════════

describe("F-6 no merge — Tier 間 union/merge はしない", () => {
  it("T0 hit したら tierAttempts に T1a 以降を記録しない", () => {
    const catalog = [
      candidate({ area: "渋谷", openingHours: "18:00〜23:00" }, "a"),
      candidate({ area: "渋谷", openingHours: "17:00〜22:00" }, "b"),
      candidate(
        { area: "恵比寿", station: "恵比寿駅", openingHours: "18:00〜23:00" },
        "ebisu-extra",
      ),
    ];
    const out = runTieredRanking({
      brief: brief({ area: "渋谷" }),
      query: makeQuery({ area: "渋谷" }),
      catalog,
      avoidKeys: [],
      profileA: pA,
      profileB: pB,
    });
    expect(out!.appliedTier).toBe("T0");
    // T1b ならもっと取れるが、T0 が success したので試行しない
    expect(out!.tierAttempts).toHaveLength(1);
    // 渋谷 venue のみが ranked（恵比寿は混ざっていない）
    for (const r of out!.ranked) {
      expect(r.venue.area).toBe("渋谷");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════
// no mutation
// ═════════════════════════════════════════════════════════════════════════

describe("F-6 purity — 入力 brief / query を mutate しない", () => {
  it("brief.area / query.area / query.requestedTimeSlots 無変化", () => {
    const b = brief({ area: "渋谷" });
    const q = makeQuery({ area: "渋谷" });
    const bSnap = JSON.stringify(b);
    const qSnap = JSON.stringify(q);
    runTieredRanking({
      brief: b,
      query: q,
      catalog: [candidate({ area: "渋谷" }, "a")],
      avoidKeys: [],
      profileA: pA,
      profileB: pB,
    });
    expect(JSON.stringify(b)).toBe(bSnap);
    expect(JSON.stringify(q)).toBe(qSnap);
  });
});
