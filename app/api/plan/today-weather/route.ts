// app/api/plan/today-weather/route.ts — Phase A2-6b: 今日の天気を WeatherKind で返す（fail-open）
//
// ★A2 context modifier 専用の最小 route。既存 route を一切触らない（隔離）。
// ★安全境界:
//   - server-only な fetchJmaDailyForecast を server で実行（client は jma.ts を呼べない）。
//   - 出力は WeatherKind(rain/heat/cold/normal) **category のみ**。office code/座標/住所は server 内に留め
//     client に渡さない（sensitive-free）。
//   - ★fail-open: 未認証 / office code 無し / JMA 失敗 / 例外 → すべて { weather: null }（200）。
//     A2 はヒントなので、取得失敗は「天気なし」に degrade（エラーを client に投げない）。
//   - 消費は dev/dogfood の flag-gated client hook のみ（production の A2 は hard block）。
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchJmaDailyForecast, normalizeOfficeCode, type WeatherDaily } from "@/lib/weather/jma";
import { weatherDailyToWeatherKind } from "@/lib/plan/context/weatherMapping";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ weather: null });

    const { data: weatherSettings } = await supabase
      .from("user_weather_settings")
      .select("default_location")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const officeCode = normalizeOfficeCode(weatherSettings?.default_location);
    if (!officeCode) return NextResponse.json({ weather: null });

    let forecast = new Map<string, WeatherDaily>();
    try {
      forecast = await fetchJmaDailyForecast(officeCode);
    } catch {
      return NextResponse.json({ weather: null }); // ★JMA 失敗 → fail-open
    }

    // JST 暦日（JMA forecast は JST date key・日本前提）。UTC だと 00:00-09:00 で前日にズレる。
    const jstTodayIso = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const weather = weatherDailyToWeatherKind(forecast.get(jstTodayIso) ?? null);
    return NextResponse.json({ weather });
  } catch {
    return NextResponse.json({ weather: null }); // ★何があっても fail-open
  }
}
