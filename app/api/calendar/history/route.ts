// app/api/calendar/history/route.ts
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
        const days = parseInt(url.searchParams.get("days") ?? "30", 10);
        const limitDays = Math.min(Math.max(days, 1), 90);

        const since = new Date();
        since.setDate(since.getDate() - limitDays);
        const sinceStr = since.toISOString().split("T")[0];

        const { data, error } = await supabase
            .from("calendar_outfits")
            .select("date, worn_item_ids, satisfaction, worn_note, sync_snapshot, is_worn")
            .eq("user_id", auth.user.id)
            .gte("date", sinceStr)
            .not("worn_item_ids", "is", null)
            .order("date", { ascending: false });

        if (error) {
            console.error("Calendar history error:", error);
            return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
        }

        const records = (data ?? []).map(row => ({
            date: row.date,
            itemIds: row.worn_item_ids ?? [],
            satisfaction: row.satisfaction,
            note: row.worn_note,
            syncSnapshot: row.sync_snapshot,
        }));

        return NextResponse.json({ records });
    } catch (err) {
        console.error("Calendar history API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
