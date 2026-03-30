/**
 * Weather Loop Engine
 * Inner Weather → 1日の予測 → 夜の振り返り のループを構築する。
 * 朝: Weather + 過去データで今日の見通しを1行追加
 * 夜: 朝のWeather vs 実際の結果を比較
 */

import type { DailyOrbitStore, DailyOrbitEntry, CompletionTexture } from "./types";
import { TEXTURE_META } from "./types";
import { originLoad, originStore } from "./originStorage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WeatherPrediction = {
  text: string;
  basedOn: "weather_history" | "energy_pattern" | "insufficient";
  confidence: number; // 0-1
};

export type WeatherReflection = {
  morningWeatherType: string;
  morningEnergy: number;
  actualCompletionRate: number;
  actualDominantTexture: CompletionTexture | null;
  gap: "matched" | "better_than_expected" | "worse_than_expected";
  narrative: string;
};

type WeatherRecord = {
  date: string;
  weatherType: string;
  energyLevel: number;
};

// ---------------------------------------------------------------------------
// Storage keys (via originStorage wrapper)
// ---------------------------------------------------------------------------

const WEATHER_HISTORY_KEY = "weather_history";
const MORNING_WEATHER_KEY = "morning_weather"; // today's morning reading

// ---------------------------------------------------------------------------
// Record morning weather (called when Inner Weather is fetched)
// ---------------------------------------------------------------------------

export function recordMorningWeather(date: string, weatherType: string, energyLevel: number): void {
  originStore(MORNING_WEATHER_KEY, { date, weatherType, energyLevel });

  // Also append to weather history
  const history = originLoad<WeatherRecord[]>(WEATHER_HISTORY_KEY) ?? [];
  // Avoid duplicates for same date
  const filtered = history.filter((h) => h.date !== date);
  filtered.push({ date, weatherType, energyLevel });
  // Keep last 90 days
  const cutoff = filtered.length > 90 ? filtered.length - 90 : 0;
  originStore(WEATHER_HISTORY_KEY, filtered.slice(cutoff));
}

/** Get today's morning weather if recorded */
export function getTodayMorningWeather(today: string): WeatherRecord | null {
  const record = originLoad<WeatherRecord>(MORNING_WEATHER_KEY);
  if (!record || record.date !== today) return null;
  return record;
}

// ---------------------------------------------------------------------------
// Morning: Weather-based prediction
// ---------------------------------------------------------------------------

export function generateWeatherPrediction(
  store: DailyOrbitStore,
  weatherType: string,
  energyLevel: number,
): WeatherPrediction | null {
  const history = originLoad<WeatherRecord[]>(WEATHER_HISTORY_KEY) ?? [];
  if (history.length < 7) return null; // 最低1週間のデータ

  // Find past days with same weather type
  const sameWeatherDates = new Set(
    history.filter((h) => h.weatherType === weatherType).map((h) => h.date),
  );

  if (sameWeatherDates.size < 3) {
    // Not enough data for this weather type — try energy-based
    return generateEnergyPrediction(store, energyLevel, history);
  }

  // Calculate completion rate on days with this weather
  const entries = Object.values(store.entries).filter((e) => sameWeatherDates.has(e.date));
  if (entries.length < 3) return null;

  let totalTasks = 0, completedTasks = 0;
  let satisfying = 0, total = 0;
  for (const e of entries) {
    for (const t of e.tasks) {
      totalTasks++;
      if (t.completed) {
        completedTasks++;
        if (t.texture === "satisfying") satisfying++;
        total++;
      }
    }
  }

  if (totalTasks === 0) return null;

  const completionRate = Math.round((completedTasks / totalTasks) * 100);
  const satisfyingRate = total > 0 ? Math.round((satisfying / total) * 100) : 0;

  const WEATHER_LABELS: Record<string, string> = {
    sunny: "晴れ", cloudy: "曇り", rainy: "雨", stormy: "嵐",
    foggy: "霧", windy: "風", snow: "雪", aurora: "オーロラ",
  };
  const weatherLabel = WEATHER_LABELS[weatherType] ?? weatherType;

  let text: string;
  if (satisfyingRate >= 50) {
    text = `${weatherLabel}の日は達成感のある完了が多い傾向があります（完了率${completionRate}%）`;
  } else if (completionRate >= 70) {
    text = `${weatherLabel}の日の完了率は${completionRate}%。安定して動けるコンディションのようです`;
  } else if (completionRate <= 40) {
    text = `${weatherLabel}の日は少しペースが落ちる傾向。無理せず優先度の高いものから`;
  } else {
    text = `${weatherLabel}の日の完了率は${completionRate}%。平均的なペースです`;
  }

  return {
    text,
    basedOn: "weather_history",
    confidence: Math.min(0.5 + entries.length * 0.05, 0.9),
  };
}

function generateEnergyPrediction(
  store: DailyOrbitStore,
  energyLevel: number,
  history: WeatherRecord[],
): WeatherPrediction | null {
  // Group by energy level (low: <-0.2, mid: -0.2~0.2, high: >0.2)
  const bracket = energyLevel < -0.2 ? "low" : energyLevel > 0.2 ? "high" : "mid";
  const matchingDates = new Set(
    history
      .filter((h) => {
        const b = h.energyLevel < -0.2 ? "low" : h.energyLevel > 0.2 ? "high" : "mid";
        return b === bracket;
      })
      .map((h) => h.date),
  );

  const entries = Object.values(store.entries).filter((e) => matchingDates.has(e.date));
  if (entries.length < 3) return null;

  let totalTasks = 0, completedTasks = 0;
  for (const e of entries) {
    totalTasks += e.tasks.length;
    completedTasks += e.tasks.filter((t) => t.completed).length;
  }
  if (totalTasks === 0) return null;

  const completionRate = Math.round((completedTasks / totalTasks) * 100);
  const labels = { low: "エネルギーが低め", mid: "平常", high: "エネルギーが高め" };

  return {
    text: `${labels[bracket]}の日の完了率は平均${completionRate}%です`,
    basedOn: "energy_pattern",
    confidence: Math.min(0.4 + entries.length * 0.04, 0.8),
  };
}

// ---------------------------------------------------------------------------
// Evening: Weather reflection
// ---------------------------------------------------------------------------

export function generateWeatherReflection(
  store: DailyOrbitStore,
  today: string,
): WeatherReflection | null {
  const morning = getTodayMorningWeather(today);
  if (!morning) return null;

  const entry = store.entries[today];
  if (!entry || entry.tasks.length === 0) return null;

  const totalTasks = entry.tasks.length;
  const completedTasks = entry.tasks.filter((t) => t.completed).length;
  const actualCompletionRate = Math.round((completedTasks / totalTasks) * 100);

  // Dominant texture
  const textureCounts: Record<string, number> = {};
  for (const t of entry.tasks) {
    if (t.completed && t.texture) {
      textureCounts[t.texture] = (textureCounts[t.texture] ?? 0) + 1;
    }
  }
  const dominantTexture = Object.entries(textureCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] as CompletionTexture | undefined ?? null;

  // Compare to historical average for this weather
  const history = originLoad<WeatherRecord[]>(WEATHER_HISTORY_KEY) ?? [];
  const sameWeatherDates = new Set(
    history.filter((h) => h.weatherType === morning.weatherType && h.date !== today).map((h) => h.date),
  );
  const pastEntries = Object.values(store.entries).filter((e) => sameWeatherDates.has(e.date));

  let avgRate = 50; // default
  if (pastEntries.length >= 3) {
    let pastTotal = 0, pastCompleted = 0;
    for (const e of pastEntries) {
      pastTotal += e.tasks.length;
      pastCompleted += e.tasks.filter((t) => t.completed).length;
    }
    if (pastTotal > 0) avgRate = Math.round((pastCompleted / pastTotal) * 100);
  }

  const diff = actualCompletionRate - avgRate;
  let gap: WeatherReflection["gap"];
  let narrative: string;

  const WEATHER_LABELS: Record<string, string> = {
    sunny: "晴れ", cloudy: "曇り", rainy: "雨", stormy: "嵐",
    foggy: "霧", windy: "風", snow: "雪", aurora: "オーロラ",
  };
  const weatherLabel = WEATHER_LABELS[morning.weatherType] ?? morning.weatherType;

  if (diff > 15) {
    gap = "better_than_expected";
    const textureNote = dominantTexture === "satisfying"
      ? "、しかも達成感のある完了が多い1日でした"
      : "でした";
    narrative = `朝は「${weatherLabel}」でしたが、完了率${actualCompletionRate}%と予想以上に動けました${textureNote}`;
  } else if (diff < -15) {
    gap = "worse_than_expected";
    narrative = `「${weatherLabel}」の日としてはペースが控えめ（${actualCompletionRate}%）。コンディションの揺れかもしれません`;
  } else {
    gap = "matched";
    narrative = `「${weatherLabel}」の日の平均的なペースでした（${actualCompletionRate}%）`;
  }

  return {
    morningWeatherType: morning.weatherType,
    morningEnergy: morning.energyLevel,
    actualCompletionRate,
    actualDominantTexture: dominantTexture,
    gap,
    narrative,
  };
}

// ---------------------------------------------------------------------------
// Weather drift detection (for Profile insights)
// ---------------------------------------------------------------------------

export type WeatherDrift = {
  type: "stagnation" | "shift" | "none";
  narrative: string | null;
};

export function detectWeatherDrift(days = 14): WeatherDrift {
  const history = originLoad<WeatherRecord[]>(WEATHER_HISTORY_KEY) ?? [];
  if (history.length < days) return { type: "none", narrative: null };

  const recent = history.slice(-days);
  const typeCounts: Record<string, number> = {};
  for (const h of recent) {
    typeCounts[h.weatherType] = (typeCounts[h.weatherType] ?? 0) + 1;
  }

  const dominant = Object.entries(typeCounts).sort(([, a], [, b]) => b - a)[0];
  if (!dominant) return { type: "none", narrative: null };

  const WEATHER_LABELS: Record<string, string> = {
    sunny: "晴れ", cloudy: "曇り", rainy: "雨", stormy: "嵐",
    foggy: "霧", windy: "風", snow: "雪", aurora: "オーロラ",
  };

  const [weatherType, count] = dominant;
  const ratio = count / recent.length;

  if (ratio >= 0.6) {
    const label = WEATHER_LABELS[weatherType] ?? weatherType;
    return {
      type: "stagnation",
      narrative: `この${days}日間、「${label}」が続いています。安定とも取れますし、変化のきっかけを探してもいい時期かもしれません`,
    };
  }

  // Check for shift: first half vs second half
  const mid = Math.floor(recent.length / 2);
  const first = recent.slice(0, mid);
  const second = recent.slice(mid);

  const firstAvgEnergy = first.reduce((s, h) => s + h.energyLevel, 0) / first.length;
  const secondAvgEnergy = second.reduce((s, h) => s + h.energyLevel, 0) / second.length;
  const energyDiff = secondAvgEnergy - firstAvgEnergy;

  if (Math.abs(energyDiff) > 0.3) {
    const direction = energyDiff > 0 ? "上がってきている" : "下がってきている";
    return {
      type: "shift",
      narrative: `エネルギーレベルがここ${days}日で${direction}ようです`,
    };
  }

  return { type: "none", narrative: null };
}
