import { describe, it, expect } from "vitest";
import { buildWeatherReactionReadiness, DEFAULT_WEATHER_REACTION_CONFIG } from "@/lib/plan/mobility/weatherReactionReadiness";
import type { MobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";
import type { WeatherKind } from "@/lib/plan/context/contextModifier";

function obs(mode: RouteTransportMode, weatherKind?: WeatherKind, redacted = false): MobilityObservation {
  return {
    mode,
    timeband: "morning",
    weekday: "weekday",
    originKey: redacted ? null : "home",
    destKey: redacted ? null : "work",
    privacyClass: redacted ? "redacted" : "normal",
    ...(weatherKind !== undefined ? { weatherKind } : {}),
  };
}
function many(mode: RouteTransportMode, weather: WeatherKind | undefined, count: number): MobilityObservation[] {
  return Array.from({ length: count }, () => obs(mode, weather));
}

describe("buildWeatherReactionReadiness — readiness", () => {
  it("空 → not_enough", () => {
    expect(buildWeatherReactionReadiness([], "rain").status).toBe("not_enough");
  });
  it("★weather 下 < minObs(4) → not_enough", () => {
    const r = buildWeatherReactionReadiness([...many("train", "rain", 2), ...many("bicycle", "normal", 6)], "rain");
    expect(r.status).toBe("not_enough");
    expect(r.nUnderWeather).toBe(2);
  });
  it("★baseline < minObs → not_enough", () => {
    expect(buildWeatherReactionReadiness([...many("train", "rain", 6), ...many("bicycle", "normal", 2)], "rain").status).toBe("not_enough");
  });
  it("★weatherKind 無し観測は集計から除外（redacted も）", () => {
    const r = buildWeatherReactionReadiness([...many("train", undefined, 10), obs("bus", undefined, true)], "rain");
    expect(r.status).toBe("not_enough");
    expect(r.nUnderWeather).toBe(0);
    expect(r.nBaseline).toBe(0);
  });
});

describe("buildWeatherReactionReadiness — personal signal", () => {
  it("★weather 下 modal が baseline と違う → personal_reaction（leansToward）", () => {
    // 雨は train 寄り / 普段(normal) は bicycle 寄り
    const r = buildWeatherReactionReadiness([...many("train", "rain", 5), ...many("bicycle", "normal", 6)], "rain");
    expect(r.status).toBe("personal_reaction");
    expect(r.leansToward).toBe("train");
    expect(r.usualMode).toBe("bicycle");
  });
  it("★weather 下 modal が baseline と同じ → no_personal_signal", () => {
    const r = buildWeatherReactionReadiness([...many("bicycle", "rain", 5), ...many("bicycle", "normal", 6)], "rain");
    expect(r.status).toBe("no_personal_signal");
  });
  it("★weather 下が同率（明確な最頻なし）→ no_personal_signal（断定しない）", () => {
    const tied = [...many("train", "rain", 3), ...many("bicycle", "rain", 3)]; // 3-3 tie
    const r = buildWeatherReactionReadiness([...tied, ...many("car", "normal", 6)], "rain");
    expect(r.status).toBe("no_personal_signal");
  });
  it("baseline は target でない全天気を含む（snow を rain の baseline に算入）", () => {
    const r = buildWeatherReactionReadiness([...many("train", "rain", 5), ...many("bicycle", "snow", 5)], "rain");
    expect(r.nBaseline).toBe(5);
    expect(r.usualMode).toBe("bicycle");
  });
  it("config 既定 minObs=4・偽数値（確率/係数）を出さない", () => {
    expect(DEFAULT_WEATHER_REACTION_CONFIG.minObs).toBe(4);
    const r = buildWeatherReactionReadiness([...many("train", "rain", 5), ...many("bicycle", "normal", 6)], "rain");
    expect(JSON.stringify(r)).not.toMatch(/0\.\d|%|probability|score/); // 実カウント以外の数値なし
  });
});
