// app/api/calendar/weather/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { normalizeOfficeCode } from "@/lib/weather/jma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: settings } = await supabase
            .from("user_weather_settings")
            .select("*")
            .eq("user_id", auth.user.id)
            .maybeSingle();

        return NextResponse.json({
            settings: settings ?? {
                default_location: null,
                temp_preference: "normal",
                rain_sensitivity: "normal",
            },
            office_code: normalizeOfficeCode(settings?.default_location),
        });
    } catch (err) {
        console.error("Weather settings GET API error:", err);
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
        const requestedOfficeCode = normalizeOfficeCode(body?.office_code ?? body?.default_location);
        const { temp_preference, rain_sensitivity } = body;
        const default_location = requestedOfficeCode ?? (typeof body?.default_location === "string" ? body.default_location.trim() || null : null);

        const { data: settings, error } = await supabase
            .from("user_weather_settings")
            .upsert({
                user_id: auth.user.id,
                default_location,
                temp_preference: temp_preference ?? "normal",
                rain_sensitivity: rain_sensitivity ?? "normal",
            }, {
                onConflict: "user_id",
            })
            .select()
            .single();

        if (error) {
            console.error("Error saving weather settings:", error);
            return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
        }

        return NextResponse.json({ success: true, settings, office_code: normalizeOfficeCode(settings?.default_location) });
    } catch (err) {
        console.error("Weather settings POST API error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
