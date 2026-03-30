import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/weather/location?lat=35.6&lng=139.6
 * Reverse geocode using Open-Meteo's geocoding API (free).
 */
export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ ok: false, error: "lat/lng required" }, { status: 400 });
  }

  try {
    // Use Open-Meteo geocoding reverse
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ja&zoom=12`,
      {
        headers: { "User-Agent": "Aneurasync/1.0" },
        next: { revalidate: 86400 }, // cache 24h
      },
    );
    const data = await res.json();

    const city = data.address?.city || data.address?.town || data.address?.village || data.address?.suburb;
    const prefecture = data.address?.state || data.address?.province;
    const name = city ? (prefecture ? `${prefecture} ${city}` : city) : prefecture || null;

    return NextResponse.json({ ok: true, name });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
