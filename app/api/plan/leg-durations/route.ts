/**
 * app/api/plan/leg-durations/route.ts — A2: leg(区間)の手段別 所要時間を Google Routes API で取得
 *
 * 設計:
 *   - 既存 lib/alter-morning/routesApiClient.computeRoute を再利用(server-only・GOOGLE_MAPS_API_KEY)
 *   - card 主要手段に distinct な Google travelMode 4種(WALK/DRIVE/TRANSIT/BICYCLE)を並列取得
 *     → car/taxi=DRIVE, train/bus=TRANSIT に client 側で写像(cost 最小=4 fetch/leg ~$0.02)
 *   - flag gated: NEXT_PUBLIC_PLAN_LEG_DURATIONS==="true" かつ isRoutesApiAvailable() の時のみ着火
 *   - 偽数字なし: 失敗 mode は null(非表示) / flight・shinkansen は Google 非対応=対象外(β概念)
 *   - cost: client 側で leg ごと cache(再オープンで再 fetch しない)
 */
import { NextResponse } from "next/server";

import {
  computeRoute,
  isRoutesApiAvailable,
  type RouteTravelMode,
} from "@/lib/alter-morning/routesApiClient";

export const runtime = "nodejs";

interface LatLng {
  lat: number;
  lng: number;
}

function isValidLatLng(v: unknown): v is LatLng {
  return (
    typeof v === "object" &&
    v !== null &&
    Number.isFinite((v as LatLng).lat) &&
    Number.isFinite((v as LatLng).lng)
  );
}

const FETCH_MODES: readonly RouteTravelMode[] = ["WALK", "DRIVE", "TRANSIT", "BICYCLE"];
const RESULT_KEY: Record<RouteTravelMode, string> = {
  WALK: "walk",
  DRIVE: "drive",
  TRANSIT: "transit",
  BICYCLE: "bicycle",
  TWO_WHEELER: "two_wheeler",
};

export async function POST(req: Request) {
  const enabled = process.env.NEXT_PUBLIC_PLAN_LEG_DURATIONS === "true";
  if (!enabled || !isRoutesApiAvailable()) {
    return NextResponse.json({ enabled: false });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { origin, destination, departureTime } = (body ?? {}) as {
    origin?: unknown;
    destination?: unknown;
    departureTime?: unknown;
  };
  if (!isValidLatLng(origin) || !isValidLatLng(destination)) {
    return NextResponse.json({ error: "invalid coords" }, { status: 400 });
  }
  const dep = typeof departureTime === "string" ? departureTime : undefined;

  const settled = await Promise.allSettled(
    FETCH_MODES.map((mode) =>
      computeRoute({ origin, destination, travelMode: mode, departureTime: dep }),
    ),
  );

  const durations: Record<string, number | null> = {
    walk: null,
    drive: null,
    transit: null,
    bicycle: null,
  };
  settled.forEach((r, i) => {
    const key = RESULT_KEY[FETCH_MODES[i]!];
    if (r.status === "fulfilled" && Number.isFinite(r.value.durationMinutes)) {
      durations[key] = r.value.durationMinutes;
    }
  });

  return NextResponse.json({ enabled: true, durations });
}
