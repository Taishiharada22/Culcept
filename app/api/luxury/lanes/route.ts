// app/api/luxury/lanes/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const supabase = await supabaseServer();

        const { data: lanes, error } = await supabase
            .from("luxury_lanes")
            .select("*")
            .order("display_order", { ascending: true });

        if (error) {
            console.error("Error fetching lanes:", error);
            return NextResponse.json({ error: "Failed to fetch lanes" }, { status: 500 });
        }

        return NextResponse.json({ lanes: lanes ?? [] });
    } catch (err) {
        console.error("Lanes API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
