/**
 * CoAlter F-5 — foodLensInputBuilder unit tests
 *
 * F-5 (2026-04-20) の中核ロジック「brief > lens priority」を固定する。
 *
 * CEO lock 条件 2:
 *   time の優先順位 = brief > exact time > lens 補完。
 *   lens は brief に欠損がある軸だけを埋めて、上書きしてはいけない。
 *
 * 4 wiring scenarios 相当（CEO lock 条件 4）:
 *   (a) flag 相当: foodLensToday なしでも brief のみで FoodQueryBuilderInput が組める
 *   (b) lens 正常: brief + foodLensToday 両方あり → brief が時間軸に勝つ
 *   (c) brief time 欠落: lens timeWindow が fallback で埋める
 *   (d) 衝突: brief.preferredStartHour=19 vs lens.foodContext.timeWindow=lunch → brief 19時
 */

import { describe, expect, it } from "vitest";

import {
  buildFoodLensInput,
  __internal,
} from "@/lib/coalter/foodLensInputBuilder";
import type { FoodLensToday } from "@/lib/coalter/understanding/foodLensAdapter";
import type { ConversationBrief } from "@/lib/coalter/types";
import type { TwoPersonLensToday, UserId } from "@/lib/coalter/understanding/types";

// ═════════════════════════════════════════════════════════════════════════
// Fixtures
// ═════════════════════════════════════════════════════════════════════════

function makeBrief(overrides?: Partial<ConversationBrief>): ConversationBrief {
  return {
    theme: "food",
    area: "渋谷",
    approximateTime: {
      date: null,
      timeSlot: "evening",
      preferredStartHour: 19,
    },
    mood: [],
    hardConstraints: [],
    rankingAxes: {
      preset: "balance_focus",
      roles: ["balance", "aFocus", "bFocus"],
      rationale: "default",
    },
    primaryUnresolvedQuestion: null,
    confidence: 0.85,
    source: "llm",
    ...overrides,
  };
}

function makeLens(): TwoPersonLensToday {
  return {
    personalLenses: {
      a: {
        userId: "a" as UserId,
        displayName: "A",
        coreDecisionPrinciples: [],
        currentEmotionalHue: "",
        todaySensitivities: [],
        comfortPathways: [],
        sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
      },
      b: {
        userId: "b" as UserId,
        displayName: "B",
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
      confidence: 0.6,
    },
    fairnessAdjustment: {
      favorSide: null,
      rationale: null,
      strength: 0,
      basedOnSessionCount: 0,
    },
    understanding_confidence: 0.6,
    dataGaps: [],
    computedAt: "2026-04-20T10:00:00Z",
    lensVersion: "1.0.0",
  };
}

function makeFoodLensToday(
  timeWindow: FoodLensToday["foodContext"]["timeWindow"] = "lunch",
  overrideLens?: TwoPersonLensToday,
): FoodLensToday {
  return {
    lens: overrideLens ?? makeLens(),
    foodContext: {
      hungerLevel: "hungry",
      timeWindow,
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

// ═════════════════════════════════════════════════════════════════════════
// (a) brief only — foodLensToday なし
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensInput — brief only (foodLensToday なし)", () => {
  it("preferredStartHour 19 → requestedTimeSlots 19-20 (explicit)", () => {
    const input = buildFoodLensInput({ brief: makeBrief() });
    expect(input.requestedTimeSlots).toEqual([
      {
        localDate: null,
        startHour: 19,
        endHour: 20,
        confidence: "explicit",
      },
    ]);
    expect(input.targetLocalTime).toBe("19:00");
    expect(input.timeWindow).toBe("dinner");
    expect(input.exactTimeSource).toBe("brief.approximateTime");
  });

  it("lens 無し → occasion/moodTags は lens 由来のため空/null", () => {
    const input = buildFoodLensInput({ brief: makeBrief() });
    expect(input.occasion).toBeNull();
    expect(input.moodTags).toEqual([]);
    expect(input.atmosphere).toEqual({
      quietness: "either",
      density: "either",
      lighting: "either",
    });
  });

  it("brief time 全欠落 → requestedTimeSlots 空、timeWindow null", () => {
    const brief = makeBrief({
      approximateTime: { date: null, timeSlot: null, preferredStartHour: null },
    });
    const input = buildFoodLensInput({ brief });
    expect(input.requestedTimeSlots).toEqual([]);
    expect(input.timeWindow).toBeNull();
    expect(input.targetLocalTime).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// (b) brief + lens 両方あり
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensInput — brief + lens 両方あり", () => {
  it("area は brief 由来、occasion/atmos/moodTags は lens 由来", () => {
    const input = buildFoodLensInput({
      brief: makeBrief(),
      foodLensToday: makeFoodLensToday("dinner"),
    });
    expect(input.area).toBe("渋谷");
    expect(input.areaSource).toBe("brief.area");
    expect(input.occasion).toEqual({
      label: "近づく時間",
      confidence: "inferred",
      source: "s1_derivation",
    });
    expect(input.atmosphere).toEqual({
      quietness: "quiet",
      density: "intimate",
      lighting: "warm_low",
    });
    expect(input.moodTags).toEqual(["近づく"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// (c) brief time 欠落 → lens fallback
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensInput — brief time 欠落 → lens が fallback で埋める", () => {
  it("brief 時間なし + lens.timeWindow=lunch → requestedTimeSlots 12-13 (inferred)", () => {
    const brief = makeBrief({
      approximateTime: { date: null, timeSlot: null, preferredStartHour: null },
    });
    const input = buildFoodLensInput({
      brief,
      foodLensToday: makeFoodLensToday("lunch"),
    });
    expect(input.requestedTimeSlots).toEqual([
      {
        localDate: null,
        startHour: 12,
        endHour: 13,
        confidence: "inferred",
      },
    ]);
    expect(input.timeWindow).toBe("lunch");
    expect(input.targetLocalTime).toBeNull(); // lens 由来は targetLocalTime を埋めない
    expect(input.exactTimeSource).toBe("foodContext.timeWindow");
  });

  it("brief 時間なし + lens.timeWindow=dinner → 19-20 (inferred)", () => {
    const brief = makeBrief({
      approximateTime: { date: null, timeSlot: null, preferredStartHour: null },
    });
    const input = buildFoodLensInput({
      brief,
      foodLensToday: makeFoodLensToday("dinner"),
    });
    expect(input.requestedTimeSlots).toEqual([
      {
        localDate: null,
        startHour: 19,
        endHour: 20,
        confidence: "inferred",
      },
    ]);
    expect(input.timeWindow).toBe("dinner");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// (d) 衝突 — brief が勝つ
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensInput — brief/lens 衝突時は brief が勝つ (CEO lock 条件 2)", () => {
  it("brief.preferredStartHour=19 + lens.timeWindow=lunch → 19時 explicit", () => {
    const input = buildFoodLensInput({
      brief: makeBrief({
        approximateTime: {
          date: null,
          timeSlot: "evening",
          preferredStartHour: 19,
        },
      }),
      foodLensToday: makeFoodLensToday("lunch"),
    });
    expect(input.requestedTimeSlots).toEqual([
      {
        localDate: null,
        startHour: 19,
        endHour: 20,
        confidence: "explicit",
      },
    ]);
    // timeWindow も brief の "evening" → "dinner" が勝つ、lens の "lunch" ではない
    expect(input.timeWindow).toBe("dinner");
    expect(input.exactTimeSource).toBe("brief.approximateTime");
    expect(input.targetLocalTime).toBe("19:00");
  });

  it("brief timeSlot=morning + lens.timeWindow=dinner → morning が勝つ", () => {
    const input = buildFoodLensInput({
      brief: makeBrief({
        approximateTime: {
          date: null,
          timeSlot: "morning",
          preferredStartHour: null,
        },
      }),
      foodLensToday: makeFoodLensToday("dinner"),
    });
    expect(input.requestedTimeSlots[0].startHour).toBe(7);
    expect(input.requestedTimeSlots[0].endHour).toBe(10);
    expect(input.requestedTimeSlots[0].confidence).toBe("approximate");
    expect(input.timeWindow).toBe("breakfast");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// occasion mapping
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensInput — occasion は todayReading.mode から派生", () => {
  it.each([
    ["recover", "疲労回復の夜"],
    ["celebrate", "お祝い"],
    ["connect", "近づく時間"],
    ["challenge", "刺激のある時間"],
    ["maintain", "日常"],
  ] as const)("mode=%s → occasion.label=%s", (mode, label) => {
    const lens = makeLens();
    lens.todayReading.mode = mode;
    const today = makeFoodLensToday("dinner", lens);
    const input = buildFoodLensInput({ brief: makeBrief(), foodLensToday: today });
    expect(input.occasion?.label).toBe(label);
    expect(input.occasion?.confidence).toBe("inferred");
    expect(input.occasion?.source).toBe("s1_derivation");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 日付正規化
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensInput — localDate 正規化", () => {
  it("YYYY-MM-DD は採用", () => {
    const brief = makeBrief({
      approximateTime: {
        date: "2026-04-20",
        timeSlot: null,
        preferredStartHour: 19,
      },
    });
    const input = buildFoodLensInput({ brief });
    expect(input.requestedTimeSlots[0].localDate).toBe("2026-04-20");
  });

  it("「今週末」など非 ISO は null", () => {
    const brief = makeBrief({
      approximateTime: {
        date: "今週末",
        timeSlot: null,
        preferredStartHour: 19,
      },
    });
    const input = buildFoodLensInput({ brief });
    expect(input.requestedTimeSlots[0].localDate).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// clampHour
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensInput — clampHour", () => {
  it("preferredStartHour=-2 は 0 に clamp", () => {
    const brief = makeBrief({
      approximateTime: { date: null, timeSlot: null, preferredStartHour: -2 },
    });
    const input = buildFoodLensInput({ brief });
    expect(input.requestedTimeSlots[0].startHour).toBe(0);
    expect(input.requestedTimeSlots[0].endHour).toBe(1);
  });

  it("preferredStartHour=99 は 23 に clamp", () => {
    const brief = makeBrief({
      approximateTime: { date: null, timeSlot: null, preferredStartHour: 99 },
    });
    const input = buildFoodLensInput({ brief });
    expect(input.requestedTimeSlots[0].startHour).toBe(23);
    expect(input.requestedTimeSlots[0].endHour).toBe(24);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 決定論
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodLensInput — 決定論", () => {
  it("同一入力 → 同一出力", () => {
    const params = {
      brief: makeBrief(),
      foodLensToday: makeFoodLensToday("dinner"),
    };
    expect(buildFoodLensInput(params)).toEqual(buildFoodLensInput(params));
  });
});

// ═════════════════════════════════════════════════════════════════════════
// __internal sanity
// ═════════════════════════════════════════════════════════════════════════

describe("__internal sanity", () => {
  it("lensTimeWindowHours — 全 enum 値で有効レンジを返す", () => {
    const all = [
      "breakfast",
      "lunch",
      "late_lunch",
      "tea",
      "dinner",
      "late_night",
    ] as const;
    for (const w of all) {
      const r = __internal.lensTimeWindowHours(w);
      expect(r.start).toBeLessThan(r.end);
      expect(r.start).toBeGreaterThanOrEqual(0);
      expect(r.end).toBeLessThanOrEqual(24);
    }
  });

  it("mapBriefTimeSlotToFoodWindow — null は null", () => {
    expect(__internal.mapBriefTimeSlotToFoodWindow(null)).toBeNull();
  });
});
