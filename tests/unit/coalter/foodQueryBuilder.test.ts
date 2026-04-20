/**
 * CoAlter Food Query Builder unit tests
 * (§6.4 (6)-1 / 2026-04-20)
 *
 * 目的:
 *   - 軸別 presence / projection / dropped axis 検出の契約を回帰固定
 *   - critical axis 欠落時の clarify 優先を確認
 *   - 分単位時刻の保持を確認
 *   - summary score の重み付き平均が不変であることを確認
 *   - source priority hint の初期固定契約を確認
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  __internal,
  buildFoodQuery,
  type FoodQueryBuilderInput,
} from "@/lib/coalter/foodQueryBuilder";
import type {
  FoodOccasion,
  FoodQuery,
  RequestedTimeSlot,
} from "@/lib/coalter/types";

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const EITHER_ATMO: FoodQuery["atmosphere"] = {
  quietness: "either",
  density: "either",
  lighting: "either",
};

function baseInput(
  overrides: Partial<FoodQueryBuilderInput> = {},
): FoodQueryBuilderInput {
  return {
    area: "新宿",
    cuisineHints: ["ラーメン"],
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
    occasion: null,
    atmosphere: { ...EITHER_ATMO },
    moodTags: [],
    reservationUrgency: "flexible",
    ...overrides,
  };
}

function fullInput(): FoodQueryBuilderInput {
  return {
    area: "新宿",
    areaSource: "environmental.location",
    cuisineHints: ["ラーメン", "醤油"],
    cuisineSource: "foodContext.cuisineHints",
    excludeCuisines: [],
    priceBand: { minYen: 1000, maxYen: 2000 },
    priceBandSource: "foodContext.priceBand",
    requestedTimeSlots: [
      {
        localDate: "2026-04-20",
        startHour: 11,
        endHour: 11,
        startLocalTime: "11:00",
        endLocalTime: "11:30",
        flexMinutes: 30,
        confidence: "explicit",
      },
    ],
    targetLocalTime: "2026-04-20T11:00",
    timeWindow: "lunch",
    exactTimeSource: "foodContext.requestedTimeSlots",
    occasion: {
      label: "気楽な昼",
      confidence: "explicit",
      source: "user_utterance",
    },
    occasionSource: "foodContext.occasion",
    atmosphere: { quietness: "quiet", density: "spacious", lighting: "warm_low" },
    moodTags: ["落ち着く"],
    moodAtmosphereSource: "foodContext.atmosphere",
    reservationUrgency: "tonight",
  };
}

// ─────────────────────────────────────────────
// Main: 正常系
// ─────────────────────────────────────────────

describe("buildFoodQuery — full coverage path", () => {
  it("all 6 axes present → projected, no clarify, summaryScore=1.0", () => {
    const r = buildFoodQuery(fullInput());

    expect(r.coverage.area.presentInInput).toBe(true);
    expect(r.coverage.area.projected).toBe(true);
    expect(r.coverage.cuisine.projected).toBe(true);
    expect(r.coverage.exactTime.projected).toBe(true);
    expect(r.coverage.occasion.projected).toBe(true);
    expect(r.coverage.moodAtmosphere.projected).toBe(true);
    expect(r.coverage.priceBand.projected).toBe(true);

    expect(r.coverage.summaryScore).toBeCloseTo(1.0, 3);
    expect(r.clarifySignal.shouldClarify).toBe(false);
    expect(r.clarifySignal.clarifyReason).toBeNull();
    expect(r.clarifySignal.droppedAxes).toEqual([]);
    expect(r.clarifySignal.missingAxes).toEqual([]);
  });

  it("sourceAxis is populated from *Source fields (narration 由来引用 path)", () => {
    const r = buildFoodQuery(fullInput());
    expect(r.coverage.area.sourceAxis).toBe("environmental.location");
    expect(r.coverage.cuisine.sourceAxis).toBe("foodContext.cuisineHints");
    expect(r.coverage.moodAtmosphere.sourceAxis).toBe("foodContext.atmosphere");
  });

  it("搜索 strings include area, cuisine, time tokens", () => {
    const r = buildFoodQuery(fullInput());
    expect(r.searchStrings.length).toBeGreaterThan(0);
    expect(r.searchStrings.some((s) => s.includes("新宿"))).toBe(true);
    expect(r.searchStrings.some((s) => s.includes("ラーメン"))).toBe(true);
    expect(r.searchStrings.some((s) => s.includes("11:00-11:30"))).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Critical axis clarify
// ─────────────────────────────────────────────

describe("buildFoodQuery — critical axis missing", () => {
  it("area missing → shouldClarify=true / reason=critical_axis_missing", () => {
    const r = buildFoodQuery(baseInput({ area: null }));
    expect(r.clarifySignal.shouldClarify).toBe(true);
    expect(r.clarifySignal.clarifyReason).toBe("critical_axis_missing");
    expect(r.clarifySignal.missingAxes).toContain("area");
    expect(r.clarifySignal.suggestedClarifyQuestion).toContain("どこで");
  });

  it("exactTime missing → shouldClarify=true / reason=critical_axis_missing", () => {
    const r = buildFoodQuery(baseInput({ requestedTimeSlots: [] }));
    expect(r.clarifySignal.shouldClarify).toBe(true);
    expect(r.clarifySignal.clarifyReason).toBe("critical_axis_missing");
    expect(r.clarifySignal.missingAxes).toContain("exactTime");
    expect(r.clarifySignal.suggestedClarifyQuestion).toContain("何時頃");
  });

  it("both critical missing → question covers both axes", () => {
    const r = buildFoodQuery(
      baseInput({ area: null, requestedTimeSlots: [] }),
    );
    expect(r.clarifySignal.shouldClarify).toBe(true);
    expect(r.clarifySignal.clarifyReason).toBe("critical_axis_missing");
    expect(r.clarifySignal.missingAxes).toEqual(
      expect.arrayContaining(["area", "exactTime"]),
    );
    const q = r.clarifySignal.suggestedClarifyQuestion ?? "";
    expect(q).toContain("どこで");
    expect(q).toContain("何時頃");
  });

  it("critical axes bypass summary threshold — even if score ≥ 0.4, clarify fires", () => {
    // area 以外を全部埋めて summary を 0.75 にする → 本来閾値越えだが area 欠落で clarify
    const r = buildFoodQuery({
      area: null,
      cuisineHints: ["ラーメン"],
      excludeCuisines: [],
      priceBand: { minYen: 1000, maxYen: 2000 },
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
      occasion: {
        label: "気楽な昼",
        confidence: "explicit",
        source: "user_utterance",
      },
      atmosphere: { quietness: "quiet", density: "either", lighting: "either" },
      moodTags: [],
      reservationUrgency: "flexible",
    });
    expect(r.coverage.summaryScore).toBeGreaterThanOrEqual(0.4);
    expect(r.clarifySignal.shouldClarify).toBe(true);
    expect(r.clarifySignal.clarifyReason).toBe("critical_axis_missing");
  });
});

// ─────────────────────────────────────────────
// Minimal valid
// ─────────────────────────────────────────────

describe("buildFoodQuery — minimal valid (area+cuisine+exactTime)", () => {
  it("summaryScore ≥ 0.4, no clarify", () => {
    const r = buildFoodQuery(baseInput());
    // area 0.25 + cuisine 0.20 + exactTime 0.25 = 0.70
    expect(r.coverage.summaryScore).toBeCloseTo(0.7, 3);
    expect(r.clarifySignal.shouldClarify).toBe(false);
    expect(r.clarifySignal.clarifyReason).toBeNull();
  });
});

// ─────────────────────────────────────────────
// 分単位時刻
// ─────────────────────────────────────────────

describe("buildFoodQuery — minute precision", () => {
  it("startLocalTime/endLocalTime 両端 present → HH:MM-HH:MM token", () => {
    const slot: RequestedTimeSlot = {
      localDate: null,
      startHour: 18,
      endHour: 19,
      startLocalTime: "18:30",
      endLocalTime: "19:00",
      flexMinutes: 0,
      confidence: "explicit",
    };
    const r = buildFoodQuery(baseInput({ requestedTimeSlots: [slot] }));
    expect(r.searchStrings.some((s) => s.includes("18:30-19:00"))).toBe(true);
  });

  it("hour-only slot → 'H-H時' fallback", () => {
    const r = buildFoodQuery(baseInput()); // startHour 11 / endHour 12
    expect(r.searchStrings.some((s) => s.includes("11-12時"))).toBe(true);
  });

  it("同一 HH:MM (start=end) → 単一 token として出る", () => {
    const slot: RequestedTimeSlot = {
      localDate: null,
      startHour: 19,
      endHour: 19,
      startLocalTime: "19:30",
      endLocalTime: "19:30",
      flexMinutes: 0,
      confidence: "explicit",
    };
    const r = buildFoodQuery(baseInput({ requestedTimeSlots: [slot] }));
    const token = __internal.formatTimeToken([slot]);
    expect(token).toBe("19:30");
    expect(r.searchStrings.some((s) => s.includes("19:30"))).toBe(true);
  });

  it("ISO 形式 startLocalTime → 'HH:MM' に丸められる", () => {
    const slot: RequestedTimeSlot = {
      localDate: "2026-04-20",
      startHour: 11,
      endHour: 12,
      startLocalTime: "2026-04-20T11:15",
      endLocalTime: "2026-04-20T11:45",
      flexMinutes: 15,
      confidence: "approximate",
    };
    const token = __internal.formatTimeToken([slot]);
    expect(token).toBe("11:15-11:45");
  });
});

// ─────────────────────────────────────────────
// Dropped axis（今回の本丸）
// ─────────────────────────────────────────────

describe("buildFoodQuery — dropped axis observability", () => {
  it("moodTags だけ present で atmo all-either → moodAtmosphere が dropped", () => {
    const r = buildFoodQuery(
      baseInput({
        moodTags: ["疲労回復"],
        atmosphere: { ...EITHER_ATMO },
      }),
    );
    expect(r.coverage.moodAtmosphere.presentInInput).toBe(true);
    expect(r.coverage.moodAtmosphere.projected).toBe(false);
    expect(r.clarifySignal.droppedAxes).toContain("moodAtmosphere");
  });

  it("真の欠損（moodTags も atmo も空）→ missingAxes に載る、dropped には載らない", () => {
    const r = buildFoodQuery(baseInput()); // moodTags=[], atmo=either
    expect(r.coverage.moodAtmosphere.presentInInput).toBe(false);
    expect(r.coverage.moodAtmosphere.projected).toBe(false);
    expect(r.clarifySignal.missingAxes).toContain("moodAtmosphere");
    expect(r.clarifySignal.droppedAxes).not.toContain("moodAtmosphere");
  });

  it("occasion confidence=none → presentInInput=false 扱い", () => {
    const occ: FoodOccasion = {
      label: "なんとなく",
      confidence: "none",
      source: null,
    };
    const r = buildFoodQuery(baseInput({ occasion: occ }));
    expect(r.coverage.occasion.presentInInput).toBe(false);
    expect(r.coverage.occasion.projected).toBe(false);
  });
});

// ─────────────────────────────────────────────
// summaryScore / 重み
// ─────────────────────────────────────────────

describe("summaryScore / weights", () => {
  it("WEIGHTS 合計は 1.00", () => {
    const sum = Object.values(__internal.WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("CRITICAL_AXES = [area, exactTime] / COVERAGE_THRESHOLD = 0.4", () => {
    expect(__internal.CRITICAL_AXES).toEqual(["area", "exactTime"]);
    expect(__internal.COVERAGE_THRESHOLD).toBe(0.4);
  });

  it("minimal (area+cuisine+exactTime) = 0.70 — 重み検算と一致", () => {
    const r = buildFoodQuery(baseInput());
    const expected =
      __internal.WEIGHTS.area +
      __internal.WEIGHTS.cuisine +
      __internal.WEIGHTS.exactTime;
    expect(r.coverage.summaryScore).toBeCloseTo(expected, 3);
  });
});

// ─────────────────────────────────────────────
// Source priority hint
// ─────────────────────────────────────────────

describe("sourcePriorityHint — 初期固定契約", () => {
  it("blockedPageTypes に listicle と news が含まれる", () => {
    const r = buildFoodQuery(baseInput());
    expect(r.sourcePriorityHint.blockedPageTypes).toEqual(
      expect.arrayContaining(["listicle", "news"]),
    );
  });

  it("preferredDomains 先頭は tabelog.com（優先順配列）", () => {
    const r = buildFoodQuery(baseInput());
    expect(r.sourcePriorityHint.preferredDomains[0]).toBe("tabelog.com");
  });

  it("preferVenueDetail=true（venue_detail を最優先で取る契約）", () => {
    const r = buildFoodQuery(baseInput());
    expect(r.sourcePriorityHint.preferVenueDetail).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Normalize
// ─────────────────────────────────────────────

describe("normalize / dedupe", () => {
  it("cuisineHints は dedupe + top-3 に truncate", () => {
    const r = buildFoodQuery(
      baseInput({
        cuisineHints: ["ラーメン", "ラーメン", "寿司", "焼肉", "中華"],
      }),
    );
    expect(r.query.cuisines).toEqual(["ラーメン", "寿司", "焼肉"]);
  });

  it("空白のみの area → null 扱い（area missing として clarify）", () => {
    const r = buildFoodQuery(baseInput({ area: "   " }));
    expect(r.query.area).toBeNull();
    expect(r.clarifySignal.shouldClarify).toBe(true);
    expect(r.clarifySignal.clarifyReason).toBe("critical_axis_missing");
  });

  it("excludeCuisines は dedupe される", () => {
    const r = buildFoodQuery(
      baseInput({ excludeCuisines: ["エビ", "エビ", "カニ"] }),
    );
    expect(r.query.excludeCuisines).toEqual(["エビ", "カニ"]);
  });
});

// ─────────────────────────────────────────────
// timeWindow 併存契約
// ─────────────────────────────────────────────

describe("FoodQuery.timeWindow は exact time と併存する（CEO 指摘 #3）", () => {
  it("exact time present でも timeWindow が落ちない", () => {
    const r = buildFoodQuery(
      baseInput({
        requestedTimeSlots: [
          {
            localDate: null,
            startHour: 19,
            endHour: 20,
            startLocalTime: "19:30",
            endLocalTime: "20:00",
            confidence: "explicit",
          },
        ],
        timeWindow: "dinner",
      }),
    );
    expect(r.query.timeWindow).toBe("dinner");
    expect(r.query.requestedTimeSlots.length).toBe(1);
  });
});

// ─────────────────────────────────────────────
// Search strings
// ─────────────────────────────────────────────

describe("buildSearchStrings — 条件付き生成", () => {
  it("atmo all-either かつ occasion/price 無し → s1 のみ（1 本）", () => {
    const r = buildFoodQuery(baseInput());
    expect(r.searchStrings.length).toBe(1);
  });

  it("atmo concrete → s2 が追加される", () => {
    const r = buildFoodQuery(
      baseInput({
        atmosphere: { quietness: "quiet", density: "either", lighting: "either" },
      }),
    );
    expect(r.searchStrings.length).toBeGreaterThanOrEqual(2);
    expect(r.searchStrings.some((s) => s.includes("静か"))).toBe(true);
  });

  it("occasion present → s3 が追加される", () => {
    const r = buildFoodQuery(
      baseInput({
        occasion: {
          label: "デート",
          confidence: "explicit",
          source: "user_utterance",
        },
      }),
    );
    expect(r.searchStrings.some((s) => s.includes("デート"))).toBe(true);
  });
});
