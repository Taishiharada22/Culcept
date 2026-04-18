/**
 * CoAlter Phase B Commit 2: foodRanker テスト
 *
 * 実装ガード（CEO 方針）:
 *   1. novelty は balance / safety / aFocus / bFocus に入らない
 *   2. quietnessFit と moodMatch が二重加点にならない
 *   3. compromiseQuality は balance のみ、重み 0.15、active 条件あり
 *   4. ratingFit 欠損は 0.5 中立
 *   5. violates_opening_hours は 既知 AND 明確不一致 のみ発火
 *
 * Hard filter 9 種:
 *   violates_budget / violates_area / violates_cuisine_exclusion /
 *   violates_companions / violates_opening_hours / closed_permanently /
 *   missing_where / insufficient_info / violates_avoid_keys
 *
 * Output shape:
 *   ranked[] / alternatives[] / filterTrace[] / appliedPreset / counts
 *   FoodFilterTrace に confidence / missingFields が出る
 */

import { describe, it, expect } from "vitest";

import {
  rankFood,
  foodRoleScore,
  scoreFoodMetrics,
  hardFilterOne,
  __assertNoveltyNotUsedIn,
  __internal,
} from "@/lib/coalter/foodRanker";
import type {
  ActivityCandidate,
  AgreedConstraint,
  ConversationBrief,
  CoAlterPersonProfile,
  FoodMetrics,
  FoodVenue,
  RankingAxesPreset,
  RankingRole,
} from "@/lib/coalter/types";

// ──────────── helpers ────────────

function venue(overrides: Partial<FoodVenue> = {}): FoodVenue {
  return {
    name: "焼肉ABC",
    station: "渋谷駅",
    area: null,
    priceBand: null,
    openingHours: null,
    rating: null,
    snippet: "",
    ...overrides,
  };
}

function candidate(
  venueOverrides: Partial<FoodVenue> = {},
  overrides: Partial<ActivityCandidate<FoodVenue>> = {},
): ActivityCandidate<FoodVenue> {
  const v = venue(venueOverrides);
  return {
    candidateId: `food:tabelog.com:${v.name.replace(/\s+/g, "")}:${(v.station ?? v.area ?? "").replace(/駅$/, "")}`,
    sourceUrl: "https://tabelog.com/tokyo/A/1",
    sourceDomain: "tabelog.com",
    confidence: 0.8,
    domain: "food",
    entity: v,
    durationEstimate: null,
    bestTimeWindows: [],
    reservationNeed: "unknown",
    ...overrides,
  };
}

function profile(id: string, interests: string[] = []): CoAlterPersonProfile {
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
    interests,
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
      roles:
        preset === "balance_focus"
          ? ["balance", "aFocus", "bFocus"]
          : preset === "safety_adventure_discovery"
            ? ["safety", "adventure", "discovery"]
            : ["calm", "stimulating", "nostalgic"],
      rationale: "test",
    },
    primaryUnresolvedQuestion: null,
    confidence: 0.8,
    source: "llm",
    ...overrides,
  };
}

function constraint(
  kind: AgreedConstraint["kind"],
  sourceText: string,
  strength: AgreedConstraint["strength"] = "hard",
): AgreedConstraint {
  return {
    kind,
    normalizedValue: sourceText,
    sourceText,
    confidence: 0.9,
    strength,
  };
}

// ──────────── 実装ガード #1: novelty が balance/safety/focus に入らない ────────────

describe("実装ガード #1: novelty 非使用 role", () => {
  it("balance では novelty の値が変わっても totalScore が動かない", () => {
    expect(__assertNoveltyNotUsedIn("balance")).toBe(true);
  });

  it("safety では novelty が寄与しない", () => {
    expect(__assertNoveltyNotUsedIn("safety")).toBe(true);
  });

  it("aFocus / bFocus も novelty は使わない", () => {
    expect(__assertNoveltyNotUsedIn("aFocus")).toBe(true);
    expect(__assertNoveltyNotUsedIn("bFocus")).toBe(true);
  });

  it("adventure / discovery / stimulating は novelty を使う（逆方向確認）", () => {
    expect(__assertNoveltyNotUsedIn("adventure")).toBe(false);
    expect(__assertNoveltyNotUsedIn("discovery")).toBe(false);
    expect(__assertNoveltyNotUsedIn("stimulating")).toBe(false);
  });
});

// ──────────── 実装ガード #2: quietnessFit / moodMatch 責務分離 ────────────

describe("実装ガード #2: quietness と moodMatch の語彙分離", () => {
  it("quietness mood のみ設定 → moodMatch は 0.5 中立、quietnessFit のみ反映", () => {
    const v = venue({ snippet: "落ち着いた雰囲気の個室" });
    const b = brief({ mood: ["静か"] });
    const q = __internal.scoreQuietnessFit(v, b);
    const mm = __internal.scoreMoodMatch(v, b);
    expect(q).toBeGreaterThan(0.5);
    expect(mm).toBeCloseTo(0.5, 2);
  });

  it("moodMatch の mood のみ設定 → quietnessFit は 0.5 中立", () => {
    const v = venue({ snippet: "老舗のレトロな雰囲気" });
    const b = brief({ mood: ["ノスタルジア"] });
    const q = __internal.scoreQuietnessFit(v, b);
    const mm = __internal.scoreMoodMatch(v, b);
    expect(q).toBeCloseTo(0.5, 2);
    expect(mm).toBeGreaterThan(0.5);
  });

  it("静か希望 + venue がにぎやか → quietnessFit 低下", () => {
    const v = venue({ snippet: "賑やかな立ち飲みで活気ある店" });
    const b = brief({ mood: ["静か"] });
    expect(__internal.scoreQuietnessFit(v, b)).toBeLessThan(0.5);
  });
});

// ──────────── 実装ガード #3: compromiseQuality active 条件 ────────────

describe("実装ガード #3: compromiseQuality", () => {
  it("両側低 (max<0.5) は 0", () => {
    expect(__internal.scoreCompromiseQuality(0.3, 0.2, 0.1)).toBe(0);
  });

  it("両側高で差が小さい (|diff|<0.2) は 0", () => {
    // prefA = 0.6*0.8 + 0.4*0.7 = 0.76, prefB = 0.6*0.85 + 0.4*0.7 = 0.79 → diff 0.03
    expect(__internal.scoreCompromiseQuality(0.8, 0.85, 0.7)).toBe(0);
  });

  it("差が大きく片側以上高ければ 1 に近い値", () => {
    // prefA = 0.6*0.9 + 0.4*0.5 = 0.74, prefB = 0.6*0.2 + 0.4*0.5 = 0.32 → diff 0.42
    const v = __internal.scoreCompromiseQuality(0.9, 0.2, 0.5);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });

  it("balance role は compromiseQuality に重み 0.15", () => {
    const m: FoodMetrics = {
      budgetFit: 0.5,
      areaFit: 0.5,
      quietnessFit: 0.5,
      novelty: 0.5,
      cuisineMatchA: 0.5,
      cuisineMatchB: 0.5,
      moodMatch: 0.5,
      ratingFit: 0.5,
      compromiseQuality: 0,
    };
    const base = foodRoleScore("balance", m);
    const withCompromise = foodRoleScore("balance", { ...m, compromiseQuality: 1 });
    expect(withCompromise - base).toBeCloseTo(0.15, 4);
  });

  it("aFocus / bFocus は compromiseQuality を使わない", () => {
    const m: FoodMetrics = {
      budgetFit: 0.5,
      areaFit: 0.5,
      quietnessFit: 0.5,
      novelty: 0.5,
      cuisineMatchA: 0.5,
      cuisineMatchB: 0.5,
      moodMatch: 0.5,
      ratingFit: 0.5,
      compromiseQuality: 0,
    };
    expect(foodRoleScore("aFocus", m)).toBeCloseTo(
      foodRoleScore("aFocus", { ...m, compromiseQuality: 1 }),
      9,
    );
    expect(foodRoleScore("bFocus", m)).toBeCloseTo(
      foodRoleScore("bFocus", { ...m, compromiseQuality: 1 }),
      9,
    );
  });
});

// ──────────── 実装ガード #4: ratingFit 欠損中立 ────────────

describe("実装ガード #4: ratingFit 欠損は 0.5 中立", () => {
  it("rating=null → 0.5", () => {
    expect(__internal.scoreRatingFit(venue({ rating: null }))).toBe(0.5);
  });

  it("rating=食べログ 3.5 → 1", () => {
    expect(
      __internal.scoreRatingFit(venue({ rating: "食べログ 3.5" })),
    ).toBe(1);
  });

  it("rating=★3.0 → 0.5", () => {
    expect(__internal.scoreRatingFit(venue({ rating: "★3.0" }))).toBe(0.5);
  });
});

// ──────────── 実装ガード #5: violates_opening_hours は既知かつ不一致のみ ────────────

describe("実装ガード #5: violates_opening_hours", () => {
  it("openingHours 不明 + timeSlot 夜 → 通す", () => {
    const c = candidate({ openingHours: null });
    const b = brief({
      approximateTime: { date: null, timeSlot: "night", preferredStartHour: null },
    });
    const step = hardFilterOne(c, b, new Set());
    expect(step.reasons).not.toContain("violates_opening_hours");
  });

  it("openingHours=11:30〜14:30 + timeSlot=night → 違反", () => {
    const c = candidate({ openingHours: "11:30〜14:30" });
    const b = brief({
      approximateTime: { date: null, timeSlot: "night", preferredStartHour: null },
    });
    const step = hardFilterOne(c, b, new Set());
    expect(step.reasons).toContain("violates_opening_hours");
  });

  it("openingHours=17:00〜24:00 + timeSlot=night → 通す", () => {
    const c = candidate({ openingHours: "17:00〜24:00" });
    const b = brief({
      approximateTime: { date: null, timeSlot: "night", preferredStartHour: null },
    });
    const step = hardFilterOne(c, b, new Set());
    expect(step.reasons).not.toContain("violates_opening_hours");
  });
});

// ──────────── Hard filter 9 種 ────────────

describe("Hard filter 9 種", () => {
  it("violates_budget", () => {
    const c = candidate({ priceBand: "¥6,000〜¥8,000" });
    const b = brief({
      hardConstraints: [constraint("budget", "予算5,000円")],
    });
    expect(hardFilterOne(c, b, new Set()).reasons).toContain("violates_budget");
  });

  it("violates_area", () => {
    const c = candidate({ area: "六本木", station: null });
    const b = brief({ area: "渋谷" });
    expect(hardFilterOne(c, b, new Set()).reasons).toContain("violates_area");
  });

  it("violates_cuisine_exclusion", () => {
    const c = candidate({
      name: "チェーン焼肉店",
      snippet: "全国チェーン展開",
    });
    const b = brief({
      hardConstraints: [constraint("exclusion", "チェーン以外")],
    });
    expect(hardFilterOne(c, b, new Set()).reasons).toContain(
      "violates_cuisine_exclusion",
    );
  });

  it("closed_permanently", () => {
    const c = candidate({ snippet: "この店は閉店しました" });
    expect(hardFilterOne(c, brief(), new Set()).reasons).toContain(
      "closed_permanently",
    );
  });

  it("missing_where: station=null && area=null", () => {
    const c = candidate({ station: null, area: null });
    expect(hardFilterOne(c, brief(), new Set()).reasons).toContain(
      "missing_where",
    );
  });

  it("insufficient_info: confidence < 0.1", () => {
    const c = candidate({}, { confidence: 0.05 });
    expect(hardFilterOne(c, brief(), new Set()).reasons).toContain(
      "insufficient_info",
    );
  });

  it("violates_avoid_keys: candidateId が avoidKeys に含まれる", () => {
    const c = candidate();
    expect(
      hardFilterOne(c, brief(), new Set([c.candidateId])).reasons,
    ).toContain("violates_avoid_keys");
  });

  it("budget 上限と一致する priceBand は通す", () => {
    const c = candidate({ priceBand: "¥3,000〜¥5,000" });
    const b = brief({
      hardConstraints: [constraint("budget", "予算5,000円")],
    });
    expect(hardFilterOne(c, b, new Set()).reasons).not.toContain(
      "violates_budget",
    );
  });
});

// ──────────── Metric sanity ────────────

describe("Metric computation sanity", () => {
  it("9 metrics 全てが 0-1 に収まる", () => {
    const c = candidate({
      rating: "食べログ 3.8",
      priceBand: "¥3,000〜¥3,999",
      openingHours: "17:00〜24:00",
      snippet: "落ち着いた個室で焼肉が楽しめる",
    });
    const b = brief({
      area: "渋谷",
      mood: ["静か", "安心"],
      hardConstraints: [constraint("budget", "予算5,000円")],
    });
    const m = scoreFoodMetrics(
      c,
      b,
      profile("a", ["焼肉"]),
      profile("b", ["焼肉"]),
    );
    for (const key of Object.keys(m) as (keyof FoodMetrics)[]) {
      expect(m[key]).toBeGreaterThanOrEqual(0);
      expect(m[key]).toBeLessThanOrEqual(1);
    }
  });

  it("novelty: 既知商用ドメイン(tabelog)=0.3 / 独自ドメイン=0.7", () => {
    const cKnown = candidate({}, { sourceDomain: "tabelog.com" });
    const cIndie = candidate({}, { sourceDomain: "indieblog.example" });
    expect(__internal.scoreNovelty(cKnown)).toBe(0.3);
    expect(__internal.scoreNovelty(cIndie)).toBe(0.7);
  });

  it("cuisineMatch: interests ヒットで上がる", () => {
    const cFocus = profile("a", ["焼肉", "ホルモン"]);
    const vYakiniku = venue({ name: "焼肉名店", snippet: "ホルモンが名物" });
    const vItalian = venue({ name: "イタリアン", snippet: "パスタとワイン" });
    expect(
      __internal.scoreMoodMatch === undefined
        ? true
        : true, // sanity passthrough
    ).toBe(true);
    const sYaki = scoreFoodMetrics(
      candidate(vYakiniku),
      brief(),
      cFocus,
      profile("b"),
    );
    const sIta = scoreFoodMetrics(
      candidate(vItalian),
      brief(),
      cFocus,
      profile("b"),
    );
    expect(sYaki.cuisineMatchA).toBeGreaterThan(sIta.cuisineMatchA);
  });
});

// ──────────── rankFood output shape ────────────

describe("rankFood output shape (movie RankOutput 並行形)", () => {
  it("3 candidate → ranked 3 / appliedPreset / counts / filterTrace", () => {
    const catalog: ActivityCandidate<FoodVenue>[] = [
      candidate({ name: "店A", snippet: "落ち着いた雰囲気" }),
      candidate(
        { name: "店B", station: "新宿駅", snippet: "人気の焼肉" },
        { candidateId: "food:tabelog.com:店B:新宿", sourceUrl: "https://x/2" },
      ),
      candidate(
        { name: "店C", area: "代官山", station: null, snippet: "隠れ家カフェ" },
        {
          candidateId: "food:indie.example:店C:代官山",
          sourceDomain: "indie.example",
          sourceUrl: "https://x/3",
        },
      ),
    ];
    const result = rankFood({
      brief: brief(),
      catalog,
      avoidKeys: [],
      profileA: profile("a"),
      profileB: profile("b"),
    });
    expect(result.ranked.length).toBe(3);
    expect(result.appliedPreset).toBe("balance_focus");
    expect(result.counts.inputCatalog).toBe(3);
    expect(result.counts.afterHardFilter).toBe(3);
    expect(result.counts.afterDiversity).toBe(3);
    expect(result.filterTrace).toEqual([]);
    // 各 ranked に breakdown.metrics / roleScores / assignedRole が揃っている
    for (const r of result.ranked) {
      expect(r.breakdown.metrics).toBeDefined();
      expect(r.breakdown.roleScores).toBeDefined();
      expect(r.breakdown.assignedRole).toBe(r.role);
      expect(r.venue.name).toBeTruthy();
    }
  });

  it("filterTrace に confidence と missingFields が載る", () => {
    const c = candidate({ station: null, area: null }, { confidence: 0.05 });
    const result = rankFood({
      brief: brief(),
      catalog: [c],
      avoidKeys: [],
      profileA: profile("a"),
      profileB: profile("b"),
    });
    expect(result.filterTrace.length).toBe(1);
    const trace = result.filterTrace[0];
    expect(trace.reasons).toContain("insufficient_info");
    expect(trace.reasons).toContain("missing_where");
    expect(trace.confidence).toBe(0.05);
    expect(trace.missingFields).toContain("station");
    expect(trace.missingFields).toContain("area");
  });

  it("avoidKeys で reroll: 同じ candidateId を含めないように候補が回る", () => {
    const c1 = candidate({ name: "店A" });
    const c2 = candidate(
      { name: "店B", station: "新宿駅" },
      { candidateId: "food:tabelog.com:店B:新宿", sourceUrl: "https://x/2" },
    );
    const out = rankFood({
      brief: brief(),
      catalog: [c1, c2],
      avoidKeys: [c1.candidateId],
      profileA: profile("a"),
      profileB: profile("b"),
    });
    expect(out.ranked.map((r) => r.candidateKey)).not.toContain(c1.candidateId);
  });

  it("alternatives は最大 2 件で、ranked に含まれない candidate が入る", () => {
    const catalog: ActivityCandidate<FoodVenue>[] = Array.from(
      { length: 7 },
      (_, i) => {
        const name = `店${i}`;
        return candidate(
          { name },
          {
            candidateId: `food:tabelog.com:${name}:渋谷`,
            sourceUrl: `https://x/${i}`,
          },
        );
      },
    );
    const out = rankFood({
      brief: brief(),
      catalog,
      avoidKeys: [],
      profileA: profile("a"),
      profileB: profile("b"),
    });
    expect(out.ranked.length).toBe(3);
    expect(out.alternatives.length).toBeLessThanOrEqual(2);
    const rankedIds = new Set(out.ranked.map((r) => r.candidateKey));
    for (const a of out.alternatives) {
      expect(rankedIds.has(a.candidateKey)).toBe(false);
    }
  });

  it("全 hard filter 落ち → ranked=0 / counts.afterHardFilter=0", () => {
    const c = candidate({ station: null, area: null }, { confidence: 0.05 });
    const out = rankFood({
      brief: brief(),
      catalog: [c],
      avoidKeys: [],
      profileA: profile("a"),
      profileB: profile("b"),
    });
    expect(out.ranked.length).toBe(0);
    expect(out.counts.afterHardFilter).toBe(0);
    expect(out.filterTrace.length).toBe(1);
  });

  it("3 preset 全てで role assign が動く", () => {
    const catalog: ActivityCandidate<FoodVenue>[] = [
      candidate({ name: "店A", snippet: "老舗の名店" }),
      candidate(
        { name: "店B", station: "新宿駅", snippet: "新感覚の刺激" },
        {
          candidateId: "food:indie.example:店B:新宿",
          sourceDomain: "indie.example",
          sourceUrl: "https://x/2",
        },
      ),
      candidate(
        { name: "店C", area: "代官山", station: null, snippet: "静かな個室" },
        { candidateId: "food:tabelog.com:店C:代官山", sourceUrl: "https://x/3" },
      ),
    ];
    for (const preset of [
      "balance_focus",
      "safety_adventure_discovery",
      "calm_stimulating_nostalgic",
    ] as const) {
      const out = rankFood({
        brief: brief({}, preset),
        catalog,
        avoidKeys: [],
        profileA: profile("a"),
        profileB: profile("b"),
      });
      expect(out.appliedPreset).toBe(preset);
      expect(out.ranked.length).toBeGreaterThanOrEqual(1);
      const expectedRoles: Record<RankingAxesPreset, RankingRole[]> = {
        balance_focus: ["balance", "aFocus", "bFocus"],
        safety_adventure_discovery: ["safety", "adventure", "discovery"],
        calm_stimulating_nostalgic: ["calm", "stimulating", "nostalgic"],
      };
      for (const r of out.ranked) {
        expect(expectedRoles[preset]).toContain(r.role);
      }
    }
  });
});
