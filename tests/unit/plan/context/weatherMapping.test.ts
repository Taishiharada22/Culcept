import { describe, it, expect } from "vitest";
import { weatherDailyToWeatherKind, DEFAULT_WEATHER_MAPPING_CONFIG, type WeatherDailyLike } from "@/lib/plan/context/weatherMapping";

function d(over: Partial<WeatherDailyLike> = {}): WeatherDailyLike {
  return { weather_icon: "cloud", pop_max: null, temp_min: null, temp_max: null, ...over };
}

describe("weatherDailyToWeatherKind — JMA → WeatherKind", () => {
  it("null/undefined → null（捏造しない）", () => {
    expect(weatherDailyToWeatherKind(null)).toBeNull();
    expect(weatherDailyToWeatherKind(undefined)).toBeNull();
  });
  it("★データ皆無（unknown ∧ pop/temp 全 null）→ null", () => {
    expect(weatherDailyToWeatherKind(d({ weather_icon: "unknown" }))).toBeNull();
  });
  it("★A2-8: rain→rain / storm→storm（独立）/ snow→snow（cold で沈黙させない）", () => {
    expect(weatherDailyToWeatherKind(d({ weather_icon: "rain" }))).toBe("rain");
    expect(weatherDailyToWeatherKind(d({ weather_icon: "storm" }))).toBe("storm");
    expect(weatherDailyToWeatherKind(d({ weather_icon: "snow" }))).toBe("snow");
  });
  it("★pop_max≥60（rain icon でなくても）→ rain / <60 → rain でない", () => {
    expect(weatherDailyToWeatherKind(d({ weather_icon: "cloud", pop_max: 70 }))).toBe("rain");
    expect(weatherDailyToWeatherKind(d({ weather_icon: "cloud", pop_max: 50 }))).not.toBe("rain");
  });
  it("temp_max≥30 → heat", () => {
    expect(weatherDailyToWeatherKind(d({ weather_icon: "sun", temp_max: 32 }))).toBe("heat");
  });
  it("★temp_min≤3（precip でない）→ cold", () => {
    expect(weatherDailyToWeatherKind(d({ weather_icon: "cloud", temp_min: 1 }))).toBe("cold");
  });
  it("穏やか（sun/cloud・通常気温）→ normal", () => {
    expect(weatherDailyToWeatherKind(d({ weather_icon: "sun", temp_max: 22, temp_min: 14 }))).toBe("normal");
    expect(weatherDailyToWeatherKind(d({ weather_icon: "cloud", temp_max: 18, temp_min: 10, pop_max: 20 }))).toBe("normal");
  });
  it("★優先: 雨 icon + 高温 → rain（降水優先）", () => {
    expect(weatherDailyToWeatherKind(d({ weather_icon: "rain", temp_max: 31 }))).toBe("rain");
  });
  it("config 既定（pop60/heat30/cold3）", () => {
    expect(DEFAULT_WEATHER_MAPPING_CONFIG).toEqual({ popRainThreshold: 60, heatMaxC: 30, coldMinC: 3 });
  });
});
