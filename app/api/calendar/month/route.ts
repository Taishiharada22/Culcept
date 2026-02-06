// app/api/calendar/month/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

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
            calendarData.push({
                date: dateStr,
                dayOfWeek: new Date(dateStr).getDay(),
                outfit: outfitMap.get(dateStr) ?? null,
                events: eventMap.get(dateStr) ?? [],
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
