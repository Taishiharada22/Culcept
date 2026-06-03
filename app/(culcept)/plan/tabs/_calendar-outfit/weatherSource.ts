/**
 * Slice 2 (Option B-2) — hero カードの天気を実データ化する weather source (client 専用)
 *
 * 目的:
 *   - section ② hero カードの天気 (icon / label / 最高 / 最低 / 降水確率) を mock → 実データへ。
 *   - SYNC スコア・おすすめコーデ AI 推薦には触れない (generateTodayProposal は呼ばない)。
 *
 * データ経路 (調査で確定):
 *   - 居住地: `lib/shared/location.ts` の `fetchSharedLocation()` (= /api/weather/subscription、 client 可)。
 *   - 座標: 同 `PREFECTURE_COORDS[prefecture]` (location.ts が「Open-Meteo 用」と明記する正本座標)。
 *   - 天気: **Open-Meteo daily** を client から直接取得 (公開・APIキー不要・CORS 可。
 *     repo 既存の /api/weather/current や my-style/weatherService も Open-Meteo を使用)。
 *
 * なぜ既存 weather 実装を流用しないか (調査結果):
 *   - `lib/weather/jma.ts` は `lib/calendar/generator` 経由で `@supabase/supabase-js` を import するため
 *     client 取り込みが不適 (server 結合)。 また JMA は server route からのみ呼ばれており CORS 未検証。
 *   - `/api/weather/current` は Tokyo 固定 + current のみ (最高/最低/降水なし) で hero カードに不足。
 *   → in-scope を保つため、 公開 Open-Meteo daily を client で直接読む最小実装にする。
 *
 * 不変原則 (CEO/GPT Option B-2):
 *   - 失敗 / 居住地未設定 / 取得不可 → `null` を返す (caller は mock weather を維持＝退化ゼロ)。
 *   - browser 専用: module top-level で window/fetch に触らない。 throw しない。
 *   - DB / Supabase / AI / engine / /calendar/_lib / facade に触れない (読むのは既存 shared のみ)。
 */

import { fetchSharedLocation, PREFECTURE_COORDS } from "@/lib/shared/location";

import type { CalendarOutfitWeatherVM } from "./types";

/** Open-Meteo daily レスポンスの必要部分 (配列、 index=対象日) */
export interface OpenMeteoDaily {
  weather_code?: Array<number | null>;
  temperature_2m_max?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
  precipitation_probability_max?: Array<number | null>;
}

/** WMO weather code → 表示 emoji + 日本語ラベル (DaySelectorStrip の emoji 体系に合わせる) */
export function wmoToIconLabel(code: number | null | undefined): { icon: string; label: string } {
  if (code == null) return { icon: "☀️", label: "晴れ" };
  if (code === 0) return { icon: "☀️", label: "快晴" };
  if (code === 1) return { icon: "☀️", label: "晴れ" };
  if (code === 2) return { icon: "⛅", label: "晴れ時々曇り" };
  if (code === 3) return { icon: "☁️", label: "曇り" };
  if (code <= 48) return { icon: "🌫️", label: "霧" };
  if (code <= 57) return { icon: "🌧️", label: "霧雨" };
  if (code <= 67) return { icon: "🌧️", label: "雨" };
  if (code <= 77) return { icon: "🌨️", label: "雪" };
  if (code <= 82) return { icon: "🌦️", label: "にわか雨" };
  if (code <= 86) return { icon: "🌨️", label: "にわか雪" };
  if (code <= 99) return { icon: "⛈️", label: "雷雨" };
  return { icon: "☀️", label: "晴れ" };
}

/**
 * Open-Meteo daily → hero カード weather VM (pure)。
 *   - 最高/最低気温がどちらも無ければ `null` (= 表示に足りない → mock 維持)。
 *   - 片方のみある場合は補完。 降水確率は欠落時 0。
 */
export function openMeteoDailyToWeatherVM(
  daily: OpenMeteoDaily,
  index = 0,
): CalendarOutfitWeatherVM | null {
  const code = daily.weather_code?.[index];
  const tMax = daily.temperature_2m_max?.[index];
  const tMin = daily.temperature_2m_min?.[index];
  const pop = daily.precipitation_probability_max?.[index];

  if (tMax == null && tMin == null) return null;

  const max = tMax ?? (tMin as number);
  const min = tMin ?? (tMax as number);
  const { icon, label } = wmoToIconLabel(code);

  return {
    icon,
    label,
    tempMax: Math.round(max),
    tempMin: Math.round(min),
    pop: pop != null ? Math.round(pop) : 0,
  };
}

/** Open-Meteo daily エンドポイント URL (今日 1 日分、 日本時間) */
function openMeteoDailyUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "Asia/Tokyo",
    forecast_days: "1",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

/**
 * 居住地の今日の天気を取得して hero カード VM へ写像する (client 専用)。
 * 失敗・居住地未設定・取得不可は **すべて `null`** (caller は mock weather を維持)。
 */
export async function fetchOutfitWeather(): Promise<CalendarOutfitWeatherVM | null> {
  if (typeof window === "undefined") return null;
  try {
    const location = await fetchSharedLocation();
    if (!location) return null; // 居住地未設定 → mock 維持
    const coords = PREFECTURE_COORDS[location.prefecture];
    if (!coords) return null;

    const res = await fetch(openMeteoDailyUrl(coords.lat, coords.lon), { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { daily?: OpenMeteoDaily } | null;
    if (!json?.daily) return null;
    return openMeteoDailyToWeatherVM(json.daily, 0);
  } catch {
    return null;
  }
}
