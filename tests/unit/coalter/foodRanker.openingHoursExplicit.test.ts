/**
 * CoAlter F-6 — Opening Hours explicit-hour 昇格テスト
 *
 * CEO lock 2026-04-20 F-6:
 *   - `query.requestedTimeSlots` が供給されたら explicit hour を **優先**
 *   - query なし → 従来の brief.approximateTime.timeSlot（coarse）にフォールバック
 *   - openingHours 未知は常に通す（ハルシ禁止）
 *
 * 検証点:
 *   1. explicit hour が overlap → 通す
 *   2. explicit hour が overlap せず coarse timeSlot は overlap → **落とす**（explicit 優先）
 *   3. query なし → coarse timeSlot 判定（既存互換）
 *   4. openingHours null → 通す
 *   5. requestedTimeSlots 複数 → **いずれか** 1 本でも overlap すれば通す
 */

import { describe, it, expect } from "vitest";

import { hardFilterOne } from "@/lib/coalter/foodRanker";
import type {
  ActivityCandidate,
  ConversationBrief,
  FoodQuery,
  FoodVenue,
} from "@/lib/coalter/types";

function venue(overrides: Partial<FoodVenue> = {}): FoodVenue {
  return {
    name: "夜カフェ",
    station: "渋谷駅",
    area: "渋谷",
    priceBand: "¥2,000〜¥2,999",
    openingHours: "21:00〜24:00",
    rating: "3.6",
    snippet: "夜営業 カフェ",
    ...overrides,
  };
}

function candidate(
  venueOverrides: Partial<FoodVenue> = {},
): ActivityCandidate<FoodVenue> {
  const v = venue(venueOverrides);
  return {
    candidateId: `food:test:${v.name}`,
    sourceUrl: "https://tabelog.com/tokyo/A/1",
    sourceDomain: "tabelog.com",
    confidence: 0.8,
    domain: "food",
    entity: v,
    durationEstimate: null,
    bestTimeWindows: [],
    reservationNeed: "unknown",
  };
}

function brief(
  overrides: Partial<ConversationBrief> = {},
): ConversationBrief {
  return {
    theme: "food",
    area: "渋谷",
    approximateTime: { date: null, timeSlot: null, preferredStartHour: null },
    mood: [],
    hardConstraints: [],
    rankingAxes: {
      preset: "balance_focus",
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
    timeWindow: null,
    requestedTimeSlots: [],
    targetLocalTime: null,
    occasion: null,
    atmosphere: { quietness: "either", density: "either", lighting: "either" },
    moodTags: [],
    reservationUrgency: "flexible",
    ...overrides,
  };
}

describe("F-6 openingHours explicit-hour 昇格", () => {
  it("query.requestedTimeSlots=[{22-23}] vs venue 21-24 → overlap → 通す", () => {
    const c = candidate({ openingHours: "21:00〜24:00" });
    const q = makeQuery({
      requestedTimeSlots: [
        { localDate: null, startHour: 22, endHour: 23, confidence: "explicit" },
      ],
    });
    const r = hardFilterOne(c, brief(), new Set(), q);
    expect(r.reasons).not.toContain("violates_opening_hours");
  });

  it("query.requestedTimeSlots=[{19-20}] vs venue 21-24 → no overlap → 落とす", () => {
    const c = candidate({ openingHours: "21:00〜24:00" });
    const q = makeQuery({
      requestedTimeSlots: [
        { localDate: null, startHour: 19, endHour: 20, confidence: "explicit" },
      ],
    });
    const r = hardFilterOne(c, brief(), new Set(), q);
    expect(r.reasons).toContain("violates_opening_hours");
  });

  it("explicit hour 優先: brief.timeSlot=night(20-23) で coarse だと overlap するが、explicit query=19-20 は no overlap → 落とす", () => {
    // venue 21-24: coarse night(20-23) は overlap（21<23 && 24>20）するが、
    // query explicit 19-20 は no overlap（21<20=false）
    const c = candidate({ openingHours: "21:00〜24:00" });
    const q = makeQuery({
      requestedTimeSlots: [
        { localDate: null, startHour: 19, endHour: 20, confidence: "explicit" },
      ],
    });
    const b = brief({
      approximateTime: { date: null, timeSlot: "night", preferredStartHour: null },
    });
    const r = hardFilterOne(c, b, new Set(), q);
    expect(r.reasons).toContain("violates_opening_hours");
  });

  it("query なし → brief.timeSlot coarse fallback（既存互換）", () => {
    // venue 21-24, brief.timeSlot=evening(17-20) → 21<20=false → no overlap → 落とす
    const c = candidate({ openingHours: "21:00〜24:00" });
    const b = brief({
      approximateTime: { date: null, timeSlot: "evening", preferredStartHour: null },
    });
    const r = hardFilterOne(c, b, new Set()); // query 無し
    expect(r.reasons).toContain("violates_opening_hours");
  });

  it("openingHours 未知 → 常に通す（explicit hour でも coarse でも）", () => {
    const c = candidate({ openingHours: null });
    const q = makeQuery({
      requestedTimeSlots: [
        { localDate: null, startHour: 19, endHour: 20, confidence: "explicit" },
      ],
    });
    const r = hardFilterOne(c, brief(), new Set(), q);
    expect(r.reasons).not.toContain("violates_opening_hours");
  });

  it("requestedTimeSlots 複数 → いずれか 1 本でも overlap すれば通す", () => {
    // venue 21-24: [19-20]（no overlap）+ [22-23]（overlap）→ 通す
    const c = candidate({ openingHours: "21:00〜24:00" });
    const q = makeQuery({
      requestedTimeSlots: [
        { localDate: null, startHour: 19, endHour: 20, confidence: "approximate" },
        { localDate: null, startHour: 22, endHour: 23, confidence: "approximate" },
      ],
    });
    const r = hardFilterOne(c, brief(), new Set(), q);
    expect(r.reasons).not.toContain("violates_opening_hours");
  });
});

describe("F-6 violatesArea query 優先", () => {
  it("query.area='新宿' が brief.area='渋谷' を上書き → venue(渋谷) は violates_area", () => {
    // venue area=渋谷, station=渋谷駅。query.area=新宿 → 不一致 → 落とす
    const c = candidate({ area: "渋谷", station: "渋谷駅" });
    const q = makeQuery({ area: "新宿" });
    const r = hardFilterOne(c, brief({ area: "渋谷" }), new Set(), q);
    expect(r.reasons).toContain("violates_area");
  });

  it("query.area=null + brief.area='渋谷' → brief fallback で通す", () => {
    const c = candidate({ area: "渋谷", station: "渋谷駅" });
    const q = makeQuery({ area: null });
    const r = hardFilterOne(c, brief({ area: "渋谷" }), new Set(), q);
    expect(r.reasons).not.toContain("violates_area");
  });
});
