// app/api/widget/route.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Widget API — ホーム画面ウィジェット用の軽量エンドポイント
//
// PWAウィジェットやネイティブウィジェットに
// Inner Weather + ストリーク + SYNC% を提供する。
// レスポンスは最小限（<1KB）で高速。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    // 3つのデータを並列取得（最小限のクエリ）
    const [weatherResult, streakResult, profileResult] = await Promise.all([
      // Inner Weather（今日分）
      supabase
        .from("stargazer_inner_weather")
        .select("weather_type, emoji, label")
        .eq("user_id", user.id)
        .eq("date", todayStr)
        .maybeSingle(),
      // ストリーク（連続観測日数を概算）
      supabase
        .from("stargazer_daily_states")
        .select("observation_date")
        .eq("user_id", user.id)
        .order("observation_date", { ascending: false })
        .limit(60),
      // SYNC%（confidence）
      supabase
        .from("stargazer_profiles")
        .select("understanding_level")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    // ストリーク計算（連続日数）
    let streakDays = 0;
    if (streakResult.data && streakResult.data.length > 0) {
      const dates = streakResult.data
        .map((r: { observation_date: string }) => r.observation_date)
        .sort()
        .reverse();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      let checkDate = yesterday;

      for (const date of dates) {
        const checkStr = checkDate.toISOString().split("T")[0];
        if (date === todayStr) {
          // 今日の観測は特別扱い
          streakDays = Math.max(streakDays, 1);
          continue;
        }
        if (date === checkStr) {
          streakDays++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (date < checkStr) {
          break;
        }
      }
    }

    const weather = weatherResult.data;
    const sync = profileResult.data?.understanding_level ?? 0;

    return NextResponse.json({
      ok: true,
      widget: {
        weather: weather
          ? { type: weather.weather_type, emoji: weather.emoji, label: weather.label }
          : null,
        streak: streakDays,
        sync: Math.round(sync),
        date: todayStr,
      },
    });
  } catch (err) {
    console.error("[widget] Error:", err);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
