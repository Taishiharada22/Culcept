// app/api/calendar/weather-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchJmaDailyForecast, normalizeOfficeCode, weatherDailyFromStoredInput } from "@/lib/weather/jma";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/weather-check?dates=2026-03-14,2026-03-15,2026-03-16
 *
 * 保存済み天気と現在のJMA予報を比較し、ドリフトを検出する。
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const datesParam = url.searchParams.get("dates") ?? "";
    const dates = datesParam.split(",").filter(Boolean).slice(0, 7);

    if (dates.length === 0) {
      return NextResponse.json({ drifts: [], checkedAt: new Date().toISOString() });
    }

    // ユーザーの天気設定を取得
    const { data: settings } = await supabase
      .from("user_weather_settings")
      .select("default_location")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const officeCode = normalizeOfficeCode(settings?.default_location ?? "130000") ?? "130000";

    // 現在のJMA予報を取得
    let currentForecast: Map<string, import("@/lib/weather/jma").WeatherDaily> = new Map();
    try {
      currentForecast = await fetchJmaDailyForecast(officeCode);
    } catch {
      // 天気APIエラーの場合は空で返す
      return NextResponse.json({ drifts: [], checkedAt: new Date().toISOString(), error: "weather_api_failed" });
    }

    // 保存済みコーデの天気データを取得
    const { data: outfits } = await supabase
      .from("calendar_outfits")
      .select("date, weather_input")
      .eq("user_id", auth.user.id)
      .in("date", dates);

    // ドリフト検出
    const drifts: Array<{
      date: string;
      field: string;
      stored: { temp_max: number | null; weather_icon: string };
      current: { temp_max: number | null; weather_icon: string };
      severity: string;
    }> = [];

    for (const date of dates) {
      const outfit = outfits?.find(o => o.date === date);
      const storedWeather = outfit?.weather_input
        ? weatherDailyFromStoredInput(outfit.weather_input)
        : null;
      const currentWeather = currentForecast.get(date) ?? null;

      if (!storedWeather || !currentWeather) continue;

      // 気温ドリフト
      if (storedWeather.temp_max != null && currentWeather.temp_max != null) {
        const tempDiff = Math.abs(currentWeather.temp_max - storedWeather.temp_max);
        if (tempDiff >= 5) {
          drifts.push({
            date,
            field: "temp",
            stored: { temp_max: storedWeather.temp_max, weather_icon: storedWeather.weather_icon },
            current: { temp_max: currentWeather.temp_max, weather_icon: currentWeather.weather_icon },
            severity: tempDiff >= 8 ? "significant" : "minor",
          });
          continue;
        }
      }

      // 天候変化
      const SEVERITY: Record<string, number> = { sun: 0, cloud: 1, fog: 2, rain: 3, snow: 4, storm: 5, unknown: 1 };
      const storedSev = SEVERITY[storedWeather.weather_icon] ?? 1;
      const currentSev = SEVERITY[currentWeather.weather_icon] ?? 1;
      if (Math.abs(currentSev - storedSev) >= 2) {
        drifts.push({
          date,
          field: "condition",
          stored: { temp_max: storedWeather.temp_max, weather_icon: storedWeather.weather_icon },
          current: { temp_max: currentWeather.temp_max, weather_icon: currentWeather.weather_icon },
          severity: Math.abs(currentSev - storedSev) >= 3 ? "significant" : "minor",
        });
        continue;
      }

      // 降水確率ドリフト
      const storedPop = storedWeather.pop_max ?? 0;
      const currentPop = currentWeather.pop_max ?? 0;
      if (storedPop <= 20 && currentPop >= 50) {
        drifts.push({
          date,
          field: "rain",
          stored: { temp_max: storedWeather.temp_max, weather_icon: storedWeather.weather_icon },
          current: { temp_max: currentWeather.temp_max, weather_icon: currentWeather.weather_icon },
          severity: currentPop >= 70 ? "significant" : "minor",
        });
      }
    }

    return NextResponse.json({
      drifts,
      checkedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    console.error("[weather-check] error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
