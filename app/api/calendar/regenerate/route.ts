// app/api/calendar/regenerate/route.ts
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
        const { date, weather } = body;

        if (!date) {
            return NextResponse.json({ error: "Date is required" }, { status: 400 });
        }

        const targetDate = new Date(date);

        // 天気を取得
        const weatherInput: WeatherInput = weather ?? {
            temp: estimateDefaultTemp(targetDate),
            condition: "sunny",
        };

        // イベントを取得
        const { data: events } = await supabase
            .from("calendar_events")
            .select("*")
            .eq("user_id", auth.user.id)
            .eq("date", date)
            .limit(1);

        const event: CalendarEvent | null = events?.[0] ? {
            event_type: events[0].event_type,
            event_name: events[0].event_name,
        } : null;

        // 前後3日のコーデを取得（重複回避用）
        const nearbyDate = new Date(targetDate);
        nearbyDate.setDate(nearbyDate.getDate() - 3);
        const nearbyStartDate = nearbyDate.toISOString().split("T")[0];
        nearbyDate.setDate(nearbyDate.getDate() + 6);
        const nearbyEndDate = nearbyDate.toISOString().split("T")[0];

        const { data: nearbyOutfits } = await supabase
            .from("calendar_outfits")
            .select("outfit_items")
            .eq("user_id", auth.user.id)
            .gte("date", nearbyStartDate)
            .lte("date", nearbyEndDate)
            .neq("date", date);

        const recentCardIds: string[] = [];
        for (const outfit of nearbyOutfits ?? []) {
            for (const item of outfit.outfit_items ?? []) {
                recentCardIds.push(item.card_id);
            }
        }

        // 新しいコーデを生成
        const newOutfit = await generateDailyOutfit(
            supabase,
            auth.user.id,
            targetDate,
            weatherInput,
            event,
            recentCardIds
        );

        // DBに保存
        const { data: saved, error } = await supabase
            .from("calendar_outfits")
            .upsert({
                user_id: auth.user.id,
                date,
                outfit_items: newOutfit.items,
                weather_input: weatherInput,
                scene: event?.event_type ?? null,
                style_notes: newOutfit.style_notes,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: "user_id,date",
            })
            .select()
            .single();

        if (error) {
            console.error("Error saving regenerated outfit:", error);
            return NextResponse.json({ error: "Failed to save outfit" }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            date,
            outfit: saved,
        });
    } catch (err) {
        console.error("Calendar regenerate API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
