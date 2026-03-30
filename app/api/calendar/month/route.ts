// app/api/calendar/month/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchJmaDailyForecast, normalizeOfficeCode, type WeatherDaily, weatherDailyFromStoredInput } from "@/lib/weather/jma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(req.url);
        const year = parseInt(url.searchParams.get("year") ?? new Date().getFullYear().toString(), 10);
        const month = parseInt(url.searchParams.get("month") ?? (new Date().getMonth() + 1).toString(), 10);

        // 月の開始日と終了日
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const endDate = new Date(year, month, 0).toISOString().split("T")[0]; // 月末日

        // その月のコーディネートを取得
        const { data: outfits, error } = await supabase
            .from("calendar_outfits")
            .select("*")
            .eq("user_id", auth.user.id)
            .gte("date", startDate)
            .lte("date", endDate)
            .order("date", { ascending: true });

        if (error) {
            console.error("Error fetching outfits:", error);
            return NextResponse.json({ error: "Failed to fetch outfits" }, { status: 500 });
        }

        // イベントも取得
        const { data: events } = await supabase
            .from("calendar_events")
            .select("*")
            .eq("user_id", auth.user.id)
            .gte("date", startDate)
            .lte("date", endDate);

        const { data: weatherSettings } = await supabase
            .from("user_weather_settings")
            .select("default_location")
            .eq("user_id", auth.user.id)
            .maybeSingle();

        const officeCode = normalizeOfficeCode(weatherSettings?.default_location);
        let liveForecast = new Map<string, WeatherDaily>();
        if (officeCode) {
            try {
                liveForecast = await fetchJmaDailyForecast(officeCode);
            } catch (weatherError) {
                console.error("Error fetching JMA forecast:", weatherError);
            }
        }

        // 日付ごとにマップ化
        const outfitMap = new Map<string, any>();
        for (const outfit of outfits ?? []) {
            outfitMap.set(outfit.date, outfit);
        }

        const eventMap = new Map<string, any[]>();
        for (const event of events ?? []) {
            const existing = eventMap.get(event.date) ?? [];
            existing.push(event);
            eventMap.set(event.date, existing);
        }

        // カレンダーデータを生成
        const daysInMonth = new Date(year, month, 0).getDate();
        const calendarData = [];

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const outfit = outfitMap.get(dateStr) ?? null;
            calendarData.push({
                date: dateStr,
                dayOfWeek: new Date(dateStr).getDay(),
                outfit,
                events: eventMap.get(dateStr) ?? [],
                weather_daily: liveForecast.get(dateStr) ?? weatherDailyFromStoredInput(outfit?.weather_input),
            });
        }

        return NextResponse.json({
            year,
            month,
            startDate,
            endDate,
            days: calendarData,
            totalOutfits: outfits?.length ?? 0,
        });
    } catch (err) {
        console.error("Calendar month API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
