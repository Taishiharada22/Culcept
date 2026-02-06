// app/api/calendar/events/route.ts
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

        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const daysInMonth = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`;

        const { data: events, error } = await supabase
            .from("calendar_events")
            .select("*")
            .eq("user_id", auth.user.id)
            .gte("date", startDate)
            .lte("date", endDate)
            .order("date", { ascending: true });

        if (error) {
            console.error("Error fetching events:", error);
            return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
        }

        return NextResponse.json({ events: events ?? [] });
    } catch (err) {
        console.error("Calendar events GET API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { date, event_type, event_name, notes } = body;

        if (!date || !event_type) {
            return NextResponse.json({ error: "Date and event_type are required" }, { status: 400 });
        }

        const { data: event, error } = await supabase
            .from("calendar_events")
            .insert({
                user_id: auth.user.id,
                date,
                event_type,
                event_name: event_name ?? event_type,
                notes,
            })
            .select()
            .single();

        if (error) {
            console.error("Error creating event:", error);
            return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
        }

        return NextResponse.json({ success: true, event });
    } catch (err) {
        console.error("Calendar events POST API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(req.url);
        const eventId = url.searchParams.get("id");

        if (!eventId) {
            return NextResponse.json({ error: "Event ID is required" }, { status: 400 });
        }

        const { error } = await supabase
            .from("calendar_events")
            .delete()
            .eq("id", eventId)
            .eq("user_id", auth.user.id);

        if (error) {
            console.error("Error deleting event:", error);
            return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Calendar events DELETE API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
