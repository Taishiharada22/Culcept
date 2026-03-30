import { NextResponse } from "next/server";
import { fetchWeatherOfficeOptions } from "@/lib/weather/jma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const offices = await fetchWeatherOfficeOptions();
    return NextResponse.json({ ok: true, offices });
  } catch (err) {
    console.error("Weather offices GET API error:", err);
    return NextResponse.json({ ok: true, offices: [] });
  }
}
