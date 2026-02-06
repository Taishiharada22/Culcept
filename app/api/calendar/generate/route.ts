// app/api/calendar/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
    generateDailyOutfit,
    estimateDefaultTemp,
    WeatherInput,
    CalendarEvent,
} from "@/lib/calendar/generator";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { year, month, weatherOverrides = {} } = body;

        const targetYear = year ?? new Date().getFullYear();
        const targetMonth = month ?? new Date().getMonth() + 1;

        // 月の日数を計算
        const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();

        // 既存イベントを取得
        const startDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
        const endDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${daysInMonth}`;

        const { data: events } = await supabase
            .from("calendar_events")
            .select("*")
            .eq("user_id", auth.user.id)
            .gte("date", startDate)
            .lte("date", endDate);

        const eventMap = new Map<string, CalendarEvent>();
        for (const event of events ?? []) {
            eventMap.set(event.date, {
                event_type: event.event_type,
                event_name: event.event_name,
            });
        }

        // 直近のコーデ（重複回避用）
        const recentCardIds: string[] = [];
        const generatedOutfits = [];

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const date = new Date(dateStr);

            // 天気を取得（オーバーライドがあればそれを使用、なければ季節から推定）
            const weather: WeatherInput = weatherOverrides[dateStr] ?? {
                temp: estimateDefaultTemp(date),
                condition: "sunny",
            };

            // イベントを取得
            const event = eventMap.get(dateStr) ?? null;

            // コーデを生成
            const outfit = await generateDailyOutfit(
                supabase,
                auth.user.id,
                date,
                weather,
                event,
                recentCardIds.slice(-9) // 直近3日×3アイテム
            );

            // 使用したカードIDを記録
            for (const item of outfit.items) {
                recentCardIds.push(item.card_id);
            }

            // DBに保存（upsert）
            const { data: saved, error } = await supabase
                .from("calendar_outfits")
                .upsert({
                    user_id: auth.user.id,
                    date: dateStr,
                    outfit_items: outfit.items,
                    weather_input: weather,
                    scene: event?.event_type ?? null,
                    style_notes: outfit.style_notes,
                    updated_at: new Date().toISOString(),
                }, {
                    onConflict: "user_id,date",
                })
                .select()
                .single();

            if (error) {
                console.error(`Error saving outfit for ${dateStr}:`, error);
            }

            generatedOutfits.push({
                date: dateStr,
                outfit: saved ?? outfit,
            });
        }

        return NextResponse.json({
            success: true,
            year: targetYear,
            month: targetMonth,
            generatedCount: generatedOutfits.length,
            outfits: generatedOutfits,
        });
    } catch (err) {
        console.error("Calendar generate API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
