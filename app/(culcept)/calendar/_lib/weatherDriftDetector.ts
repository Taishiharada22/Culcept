/**
 * 天気ドリフト検出モジュール
 *
 * 保存済みの天気データと現在の予報を比較し、
 * 有意な変化（ドリフト）を検出してコーデ再提案を促す。
 */

import type { WeatherDaily, WeatherDrift } from "./types";

/* ── 天気アイコンの重大度マップ ── */
const CONDITION_SEVERITY: Record<string, number> = {
  sun: 0, cloud: 1, fog: 2, rain: 3, snow: 4, storm: 5, unknown: 1,
};

/* ── 単一日のドリフト検出 ── */
export function detectWeatherDrift(
  date: string,
  stored: WeatherDaily | null,
  current: WeatherDaily | null,
): WeatherDrift | null {
  if (!stored || !current) return null;

  // 気温ドリフト
  if (stored.temp_max != null && current.temp_max != null) {
    const tempDiff = Math.abs(current.temp_max - stored.temp_max);
    if (tempDiff >= 5) {
      return {
        date,
        field: "temp",
        stored: { temp_max: stored.temp_max, weather_icon: stored.weather_icon },
        current: { temp_max: current.temp_max, weather_icon: current.weather_icon },
        severity: tempDiff >= 8 ? "significant" : "minor",
      };
    }
  }

  // 天候条件ドリフト（晴→雨など）
  const storedSeverity = CONDITION_SEVERITY[stored.weather_icon] ?? 1;
  const currentSeverity = CONDITION_SEVERITY[current.weather_icon] ?? 1;
  const conditionDiff = Math.abs(currentSeverity - storedSeverity);

  if (conditionDiff >= 2) {
    return {
      date,
      field: "condition",
      stored: { temp_max: stored.temp_max, weather_icon: stored.weather_icon },
      current: { temp_max: current.temp_max, weather_icon: current.weather_icon },
      severity: conditionDiff >= 3 ? "significant" : "minor",
    };
  }

  // 降水確率ドリフト
  const storedPop = stored.pop_max ?? 0;
  const currentPop = current.pop_max ?? 0;
  if (storedPop <= 20 && currentPop >= 50) {
    return {
      date,
      field: "rain",
      stored: { temp_max: stored.temp_max, weather_icon: stored.weather_icon },
      current: { temp_max: current.temp_max, weather_icon: current.weather_icon },
      severity: currentPop >= 70 ? "significant" : "minor",
    };
  }

  return null;
}

/* ── 複数日のドリフト検出 ── */
export function detectMultiDayDrift(
  daysData: Array<{
    date: string;
    storedWeather: WeatherDaily | null;
    currentWeather: WeatherDaily | null;
  }>,
): WeatherDrift[] {
  const drifts: WeatherDrift[] = [];

  for (const day of daysData) {
    const drift = detectWeatherDrift(day.date, day.storedWeather, day.currentWeather);
    if (drift) drifts.push(drift);
  }

  // significantを先に表示
  return drifts.sort((a, b) => {
    if (a.severity === "significant" && b.severity !== "significant") return -1;
    if (b.severity === "significant" && a.severity !== "significant") return 1;
    return a.date.localeCompare(b.date);
  });
}

/* ── 最終天気チェック時刻管理 ── */
const WEATHER_CHECK_KEY = "culcept_calendar_weather_check_v1";

export function getLastWeatherCheck(): number {
  try {
    const raw = localStorage.getItem(WEATHER_CHECK_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

export function setLastWeatherCheck(): void {
  try {
    localStorage.setItem(WEATHER_CHECK_KEY, Date.now().toString());
  } catch {
    // ignore
  }
}

export function shouldCheckWeather(): boolean {
  const last = getLastWeatherCheck();
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  return Date.now() - last > THREE_HOURS;
}
