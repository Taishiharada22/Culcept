import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { normalizeOfficeCode } from "@/lib/weather/jma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: settings, error } = await supabase
      .from("user_weather_settings")
      .select("default_location, created_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) {
      console.error("Weather subscription GET error:", error);
      return NextResponse.json({ error: "Failed to fetch weather subscription" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      subscription: {
        office_code: normalizeOfficeCode(settings?.default_location),
        updated_at: settings?.created_at ?? null,
      },
    });
  } catch (err) {
    console.error("Weather subscription GET API error:", err);
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
    const officeCode = normalizeOfficeCode(body?.office_code);

    if (!officeCode) {
      return NextResponse.json({ error: "office_code must be a 6-digit JMA office code" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("user_weather_settings")
      .select("id")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (existingError) {
      console.error("Weather subscription lookup error:", existingError);
      return NextResponse.json({ error: "Failed to load weather settings" }, { status: 500 });
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("user_weather_settings")
        .update({ default_location: officeCode })
        .eq("user_id", auth.user.id);

      if (error) {
        console.error("Weather subscription update error:", error);
        return NextResponse.json({ error: "Failed to save weather settings" }, { status: 500 });
      }
    } else {
      const { error } = await supabase
        .from("user_weather_settings")
        .insert({
          user_id: auth.user.id,
          default_location: officeCode,
          temp_preference: "normal",
          rain_sensitivity: "normal",
        });

      if (error) {
        console.error("Weather subscription insert error:", error);
        return NextResponse.json({ error: "Failed to save weather settings" }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      subscription: { office_code: officeCode },
    });
  } catch (err) {
    console.error("Weather subscription POST API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
