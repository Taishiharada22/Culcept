import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { normalizeOfficeCode } from "@/lib/weather/jma";
import { prefectureToOfficeCode, officeCodeToPrefecture, PREFECTURES } from "@/lib/shared/location";

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
      .select("default_location, prefecture, created_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) {
      console.error("Weather subscription GET error:", error);
      return NextResponse.json({ error: "Failed to fetch weather subscription" }, { status: 500 });
    }

    const officeCode = normalizeOfficeCode(settings?.default_location);
    // prefecture が未保存の場合、office_code から逆引き
    const prefecture = settings?.prefecture ?? (officeCode ? officeCodeToPrefecture(officeCode) : null);

    return NextResponse.json({
      ok: true,
      subscription: {
        office_code: officeCode,
        prefecture: prefecture ?? null,
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

    // prefecture または office_code のどちらかで受け付ける
    let officeCode: string | null = null;
    let prefecture: string | null = null;

    if (body?.prefecture && PREFECTURES.includes(body.prefecture)) {
      prefecture = body.prefecture as string;
      officeCode = prefectureToOfficeCode(prefecture) ?? null;
    } else if (body?.office_code) {
      officeCode = normalizeOfficeCode(body.office_code);
      prefecture = officeCode ? officeCodeToPrefecture(officeCode) : null;
    }

    if (!officeCode) {
      return NextResponse.json({ error: "都道府県を選択してください" }, { status: 400 });
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

    const payload = {
      default_location: officeCode,
      prefecture,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("user_weather_settings")
        .update(payload)
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
          ...payload,
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
      subscription: { office_code: officeCode, prefecture },
    });
  } catch (err) {
    console.error("Weather subscription POST API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
