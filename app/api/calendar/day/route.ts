// app/api/calendar/day/route.ts
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
        const date = url.searchParams.get("date");

        if (!date) {
            return NextResponse.json({ error: "Date parameter is required" }, { status: 400 });
        }

        // その日のコーディネートを取得
        const { data: outfit } = await supabase
            .from("calendar_outfits")
            .select("*")
            .eq("user_id", auth.user.id)
            .eq("date", date)
            .maybeSingle();

        // その日のイベントを取得
        const { data: events } = await supabase
            .from("calendar_events")
            .select("*")
            .eq("user_id", auth.user.id)
            .eq("date", date);

        return NextResponse.json({
            date,
            outfit,
            events: events ?? [],
        });
    } catch (err) {
        console.error("Calendar day API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { date, weather_input, is_worn } = body;

        if (!date) {
            return NextResponse.json({ error: "Date is required" }, { status: 400 });
        }

        const updateData: any = { updated_at: new Date().toISOString() };
        if (weather_input !== undefined) updateData.weather_input = weather_input;
        if (is_worn !== undefined) updateData.is_worn = is_worn;

        const { data: updated, error } = await supabase
            .from("calendar_outfits")
            .update(updateData)
            .eq("user_id", auth.user.id)
            .eq("date", date)
            .select()
            .single();

        if (error) {
            console.error("Error updating outfit:", error);
            return NextResponse.json({ error: "Failed to update outfit" }, { status: 500 });
        }

        return NextResponse.json({ success: true, outfit: updated });
    } catch (err) {
        console.error("Calendar day PUT API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
