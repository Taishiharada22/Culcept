"use client";
/**
 * lib/plan/context/useTodayWeather.ts — Phase A2-6b: 今日の天気を取得する client hook（fail-open）
 *
 * ★安全境界:
 *   - flag ON（isContextModifierEnabled）のときだけ fetch（**production / flag OFF は fetch しない**）。
 *   - mount 時 1 回だけ（毎 render しない）。fail-open（失敗 → 天気なし＝null）。
 *   - 受け取るのは WeatherKind category のみ（route が location を server 内に留める）。
 */
import { useEffect, useState } from "react";
import { isContextModifierEnabled, type Sourced, type WeatherKind } from "@/lib/plan/context/contextModifier";

/** 今日の天気（source="observed"=実予報）。未取得/失敗/flag OFF → null。 */
export function useTodayWeather(): Sourced<WeatherKind> | null {
  const [weather, setWeather] = useState<Sourced<WeatherKind> | null>(null);

  useEffect(() => {
    if (!isContextModifierEnabled()) return; // ★flag OFF / production → fetch しない
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/plan/today-weather", { cache: "no-store" });
        if (!res.ok) return; // fail-open
        const json = (await res.json()) as { weather?: WeatherKind | null };
        if (!cancelled && json.weather) setWeather({ value: json.weather, source: "observed" });
      } catch {
        // fail-open: 天気なし
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return weather;
}
