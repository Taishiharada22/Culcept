import { describe, it, expect } from "vitest";

import {
  openMeteoDailyToWeatherVM,
  wmoToIconLabel,
  fetchOutfitWeather,
  type OpenMeteoDaily,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/weatherSource";

/**
 * Slice 2 (Option B-2) — hero カード天気の実データ化。
 * pure mapper の正しさと、 取得不能時に mock へ戻せる (= null を返す) ことを固定する。
 */
describe("wmoToIconLabel (WMO code → emoji/label)", () => {
  it("快晴/晴れ/曇り/雨/雪/雷雨 を妥当に分類", () => {
    expect(wmoToIconLabel(0)).toEqual({ icon: "☀️", label: "快晴" });
    expect(wmoToIconLabel(1).label).toBe("晴れ");
    expect(wmoToIconLabel(3)).toEqual({ icon: "☁️", label: "曇り" });
    expect(wmoToIconLabel(63).icon).toBe("🌧️"); // 雨
    expect(wmoToIconLabel(73).icon).toBe("🌨️"); // 雪
    expect(wmoToIconLabel(95).icon).toBe("⛈️"); // 雷雨
  });
  it("code が無くても安全なデフォルトを返す", () => {
    expect(wmoToIconLabel(null).icon).toBe("☀️");
    expect(wmoToIconLabel(undefined).label).toBe("晴れ");
  });
});

describe("openMeteoDailyToWeatherVM", () => {
  it("code/最高/最低/降水 を VM へ写像し、 気温は四捨五入", () => {
    const daily: OpenMeteoDaily = {
      weather_code: [0],
      temperature_2m_max: [26.7],
      temperature_2m_min: [17.4],
      precipitation_probability_max: [10],
    };
    expect(openMeteoDailyToWeatherVM(daily, 0)).toEqual({
      icon: "☀️",
      label: "快晴",
      tempMax: 27,
      tempMin: 17,
      pop: 10,
    });
  });

  it("降水確率が欠落していれば 0", () => {
    const daily: OpenMeteoDaily = {
      weather_code: [3],
      temperature_2m_max: [20],
      temperature_2m_min: [12],
      precipitation_probability_max: [null],
    };
    expect(openMeteoDailyToWeatherVM(daily, 0)?.pop).toBe(0);
  });

  it("最高/最低のどちらかしか無くても補完して返す", () => {
    const onlyMax: OpenMeteoDaily = { weather_code: [61], temperature_2m_max: [19] };
    const vm = openMeteoDailyToWeatherVM(onlyMax, 0);
    expect(vm).not.toBeNull();
    expect(vm!.tempMax).toBe(19);
    expect(vm!.tempMin).toBe(19);
    expect(vm!.icon).toBe("🌧️");
  });

  it("最高/最低が両方無ければ null (= 表示に不足 → mock 維持)", () => {
    const empty: OpenMeteoDaily = { weather_code: [0], precipitation_probability_max: [30] };
    expect(openMeteoDailyToWeatherVM(empty, 0)).toBeNull();
  });
});

describe("fetchOutfitWeather — 安全フォールバック", () => {
  it("browser 外 (window 無し) では throw せず null を返す", async () => {
    await expect(fetchOutfitWeather()).resolves.toBeNull();
  });
});
