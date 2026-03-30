"use client";

import { useState, useEffect } from "react";

export type InnerWeatherSnapshot = {
  emoji: string;
  label: string;
  weatherType: string;
  energyLevel?: number;
} | null;

let cachedWeather: InnerWeatherSnapshot = null;
let fetchPromise: Promise<InnerWeatherSnapshot> | null = null;

/**
 * 共有 Inner Weather フック。
 * TodoSection と JournalSection が同じデータを二重取得しないよう、
 * モジュールレベルでキャッシュ。同一セッション内で1回だけfetch。
 */
export function useInnerWeather(): InnerWeatherSnapshot {
  const [weather, setWeather] = useState<InnerWeatherSnapshot>(cachedWeather);

  useEffect(() => {
    if (cachedWeather) {
      setWeather(cachedWeather);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = (async () => {
        try {
          const res = await fetch("/api/stargazer/inner-weather");
          const data = await res.json();
          if (data.ok && data.hasRecord && data.weather) {
            const w = data.weather;
            cachedWeather = {
              emoji: w.emoji,
              label: w.label,
              weatherType: w.weatherType,
              energyLevel: w.energyLevel,
            };
            return cachedWeather;
          }
        } catch { /* silent */ }
        return null;
      })();
    }

    fetchPromise.then((result) => {
      setWeather(result);
    });
  }, []);

  return weather;
}

/** テスト用: キャッシュクリア */
export function _clearWeatherCache() {
  cachedWeather = null;
  fetchPromise = null;
}
