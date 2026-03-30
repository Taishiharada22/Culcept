import { NextResponse } from "next/server";

/**
 * GET /api/weather/current
 * Returns current weather for Tokyo (default).
 * Uses Open-Meteo (free, no API key required).
 */
export async function GET() {
  try {
    // Default: Tokyo (35.6762, 139.6503)
    const lat = 35.6762;
    const lng = 139.6503;
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=Asia/Tokyo`,
      { next: { revalidate: 1800 } }, // cache 30 min
    );
    const data = await res.json();
    if (!data.current) {
      return NextResponse.json({ ok: false });
    }

    const temp = Math.round(data.current.temperature_2m);
    const code = data.current.weather_code;
    const { description, icon } = weatherCodeToInfo(code);

    return NextResponse.json({ ok: true, temp, description, icon });
  } catch {
    return NextResponse.json({ ok: false });
  }
}

function weatherCodeToInfo(code: number): { description: string; icon: string } {
  if (code === 0) return { description: "快晴", icon: "☀️" };
  if (code <= 3) return { description: "晴れ", icon: "🌤" };
  if (code <= 48) return { description: "曇り", icon: "☁️" };
  if (code <= 57) return { description: "霧雨", icon: "🌧" };
  if (code <= 67) return { description: "雨", icon: "🌧" };
  if (code <= 77) return { description: "雪", icon: "🌨" };
  if (code <= 82) return { description: "にわか雨", icon: "🌦" };
  if (code <= 86) return { description: "にわか雪", icon: "🌨" };
  if (code <= 99) return { description: "雷雨", icon: "⛈" };
  return { description: "不明", icon: "🌤" };
}
