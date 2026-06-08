import { describe, it, expect } from "vitest";
import {
  modeEffortLevel,
  buildMovementTolerance,
  movementToleranceReasonLine,
  DEFAULT_MOVEMENT_TOLERANCE_CONFIG,
  type ConditionalToleranceSignal,
} from "@/lib/plan/mobility/movementTolerance";
import type { MobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";
import type { Timeband, WeekdayBucket } from "@/lib/plan/mobility/mobilityObservationStore";
import type { WeatherKind } from "@/lib/plan/context/contextModifier";

function obs(mode: RouteTransportMode, over: { weatherKind?: WeatherKind; timeband?: Timeband; weekday?: WeekdayBucket } = {}): MobilityObservation {
  return {
    mode,
    timeband: over.timeband ?? "morning",
    weekday: over.weekday ?? "weekday",
    originKey: "home",
    destKey: "x",
    privacyClass: "normal",
    ...(over.weatherKind !== undefined ? { weatherKind: over.weatherKind } : {}),
  };
}
function many(mode: RouteTransportMode, over: Parameters<typeof obs>[1], n: number): MobilityObservation[] {
  return Array.from({ length: n }, () => obs(mode, over));
}

describe("modeEffortLevel — physical/exposure 負荷", () => {
  it("walk/bicycle→high・train/bus/shinkansen→medium・car/taxi→low・flight/unknown→null", () => {
    expect(modeEffortLevel("walk")).toBe("high");
    expect(modeEffortLevel("bicycle")).toBe("high");
    expect(modeEffortLevel("train")).toBe("medium");
    expect(modeEffortLevel("bus")).toBe("medium");
    expect(modeEffortLevel("shinkansen")).toBe("medium");
    expect(modeEffortLevel("car")).toBe("low");
    expect(modeEffortLevel("taxi")).toBe("low");
    expect(modeEffortLevel("flight")).toBeNull();
    expect(modeEffortLevel("unknown")).toBeNull();
  });
});

describe("buildMovementTolerance — readiness / 条件別シフト", () => {
  it("★全体 < minTotal(8) → not_enough", () => {
    expect(buildMovementTolerance(many("walk", {}, 5)).status).toBe("not_enough");
  });
  it("★flight/unknown は effort 判定外で除外（totalObserved に入らない）", () => {
    const r = buildMovementTolerance([...many("walk", {}, 8), ...many("flight", {}, 5), ...many("unknown", {}, 5)]);
    expect(r.totalObserved).toBe(8);
  });
  it("★雨の日に low-load(train) へ偏る（baseline 比 skew）→ 「移動負荷を避けやすい」signal", () => {
    // 非雨 8 = walk(high・low-load 0) / 雨 4 = train(low-load) → baseline 4/12=0.33・under rain 1.0・skew 0.67
    const r = buildMovementTolerance([...many("walk", {}, 8), ...many("train", { weatherKind: "rain" }, 4)]);
    expect(r.status).toBe("ready");
    const rain = r.signals.find((s) => s.condition.dimension === "weather" && s.condition.value === "rain");
    expect(rain?.avoidsLoadUnderCondition).toBe(true);
    expect(rain?.underCount).toBe(4);
  });
  it("★skew なし（条件下も baseline と同じ）→ signal なし", () => {
    // 全 train（baseline 1.0・rain も 1.0・skew 0）
    const r = buildMovementTolerance([...many("train", {}, 8), ...many("train", { weatherKind: "rain" }, 4)]);
    expect(r.signals.find((s) => s.condition.value === "rain")).toBeUndefined();
  });
  it("★条件下 < minUnderCondition(4) → その条件は判定しない", () => {
    const r = buildMovementTolerance([...many("walk", {}, 8), ...many("train", { weatherKind: "snow" }, 2)]);
    expect(r.signals.find((s) => s.condition.value === "snow")).toBeUndefined();
  });
  it("config 既定（minTotal8/minUnder4/skew0.2）", () => {
    expect(DEFAULT_MOVEMENT_TOLERANCE_CONFIG).toEqual({ minTotalForReady: 8, minUnderCondition: 4, skewThreshold: 0.2 });
  });
});

describe("movementToleranceReasonLine — 観測トーン・trait でない", () => {
  const sig = (value: string): ConditionalToleranceSignal => ({ condition: { dimension: "weather", value }, underCount: 4, avoidsLoadUnderCondition: true });
  it("★「雨の日は移動負荷の少ない手段を選びやすい傾向が見えます」", () => {
    expect(movementToleranceReasonLine(sig("rain"))).toContain("移動負荷の少ない手段を選びやすい");
  });
  it("★人格語（苦手/嫌い/タイプ/性格）・数字を含まない", () => {
    const line = movementToleranceReasonLine(sig("rain"))!;
    expect(line).not.toMatch(/苦手|嫌い|タイプ|性格|[0-9]/);
  });
});
