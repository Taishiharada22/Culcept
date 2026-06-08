import { describe, it, expect } from "vitest";
import {
  buildPlaceConditionAffinity,
  placeConditionReasonLine,
  DEFAULT_PLACE_CONDITION_CONFIG,
  type ConditionalPlaceProfile,
  type PlaceCondition,
} from "@/lib/plan/compose/placeConditionAffinity";
import type { MobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";
import type { Timeband, WeekdayBucket } from "@/lib/plan/mobility/mobilityObservationStore";
import type { WeatherKind } from "@/lib/plan/context/contextModifier";

function obs(
  destKey: string | null,
  over: { weekday?: WeekdayBucket; timeband?: Timeband; weatherKind?: WeatherKind; redacted?: boolean } = {},
): MobilityObservation {
  const redacted = over.redacted ?? false;
  return {
    mode: "walk",
    timeband: over.timeband ?? "morning",
    weekday: over.weekday ?? "weekday",
    originKey: redacted ? null : "home",
    destKey: redacted ? null : destKey,
    privacyClass: redacted ? "redacted" : "normal",
    ...(over.weatherKind !== undefined ? { weatherKind: over.weatherKind } : {}),
  };
}
function many(destKey: string, over: Parameters<typeof obs>[1], n: number): MobilityObservation[] {
  return Array.from({ length: n }, () => obs(destKey, over));
}

const RAIN: PlaceCondition = { dimension: "weather", value: "rain" };
const WEEKEND: PlaceCondition = { dimension: "weekday", value: "weekend" };

describe("buildPlaceConditionAffinity — readiness", () => {
  it("条件下 < minUnderCondition(3) → not_enough", () => {
    const r = buildPlaceConditionAffinity([...many("cafe", { weatherKind: "rain" }, 2), ...many("gym", { weatherKind: "normal" }, 5)], RAIN);
    expect(r.status).toBe("not_enough");
    expect(r.underConditionTotal).toBe(2);
  });
  it("★redacted（sensitive）除外", () => {
    const r = buildPlaceConditionAffinity([...many("cafe", { weatherKind: "rain" }, 4), obs(null, { weatherKind: "rain", redacted: true })], RAIN);
    expect(r.underConditionTotal).toBe(4);
  });
});

describe("buildPlaceConditionAffinity — profiles / skew", () => {
  it("★weather=rain: 条件下 modal を underConditionCount 降順で・sufficient のみ", () => {
    const r = buildPlaceConditionAffinity(
      [...many("cafe", { weatherKind: "rain" }, 5), ...many("gym", { weatherKind: "rain" }, 3), ...many("park", { weatherKind: "rain" }, 1)],
      RAIN,
    );
    expect(r.status).toBe("ready");
    expect(r.profiles.map((p) => p.placeKey)).toEqual(["cafe", "gym"]); // park は 1<3 で除外
  });
  it("★skewsToCondition: under/total ≥ 0.6", () => {
    // cafe: rain 4 / normal 1 → 4/5=0.8 skew true。gym: rain 3 / normal 5 → 3/8=0.375 skew false
    const r = buildPlaceConditionAffinity(
      [...many("cafe", { weatherKind: "rain" }, 4), ...many("cafe", { weatherKind: "normal" }, 1), ...many("gym", { weatherKind: "rain" }, 3), ...many("gym", { weatherKind: "normal" }, 5)],
      RAIN,
    );
    expect(r.profiles.find((p) => p.placeKey === "cafe")?.skewsToCondition).toBe(true);
    expect(r.profiles.find((p) => p.placeKey === "gym")?.skewsToCondition).toBe(false);
  });
  it("★dimension=weekday も動く（週末に行く場所）", () => {
    const r = buildPlaceConditionAffinity([...many("park", { weekday: "weekend" }, 4), ...many("office", { weekday: "weekday" }, 6)], WEEKEND);
    expect(r.status).toBe("ready");
    expect(r.profiles.map((p) => p.placeKey)).toEqual(["park"]);
  });
  it("config 既定（minUnder3/skew0.6/freq4/habitual8）", () => {
    expect(DEFAULT_PLACE_CONDITION_CONFIG).toEqual({ minUnderCondition: 3, skewThreshold: 0.6, frequentThreshold: 4, habitualThreshold: 8 });
  });
});

describe("placeConditionReasonLine — 観測トーン・人格診断にしない", () => {
  const p = (strength: ConditionalPlaceProfile["strength"]): ConditionalPlaceProfile => ({ placeKey: "cafe", underConditionCount: 5, totalCount: 6, skewsToCondition: true, strength });
  it("★雨の日 × frequent → 「雨の日に行くことが多い場所のようです」", () => {
    expect(placeConditionReasonLine(p("frequent"), RAIN)).toContain("雨の日に行くことが多い");
  });
  it("週末 → 「週末に行くことが多い」", () => {
    expect(placeConditionReasonLine(p("habitual"), WEEKEND)).toContain("週末に行くことが多い");
  });
  it("occasional / normal（ラベル無し）→ null（沈黙）", () => {
    expect(placeConditionReasonLine(p("occasional"), RAIN)).toBeNull();
    expect(placeConditionReasonLine(p("frequent"), { dimension: "weather", value: "normal" })).toBeNull();
  });
  it("★人格語/数字/place 名を含まない", () => {
    const line = placeConditionReasonLine(p("habitual"), RAIN)!;
    expect(line).not.toMatch(/好き|タイプ|性格|[0-9]|cafe/);
  });
});
