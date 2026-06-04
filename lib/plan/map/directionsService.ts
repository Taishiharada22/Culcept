/**
 * lib/plan/map/directionsService.ts — Google Maps JS DirectionsService(client) 経由で
 *   ① 区間の道路沿い path ② 手段別 所要時間/乗換数 を取得。FH から忠実 port。
 * frozen googleMapsLoader を触らないため DirectionsService 型は local 宣言。
 * cache / in-flight 合流 / timeout / REQUEST_DENIED で session 停止 / fail-open。★距離→mode 推定なし。
 */
import type { GmapsLatLng } from "@/lib/shared/googleMapsLoader";

import type { RouteTransportMode } from "./routeMode";

const ROUTE_CACHE_COORD_DIGITS = 5; // ≒ 1.1m 解像度で区間 key を量子化
const DIRECTIONS_SEGMENT_TIMEOUT_MS = 5000;

// ── 最小 DirectionsService 型 (local 宣言) ──
interface GmapsLatLngObj {
  lat(): number;
  lng(): number;
}
interface GmapsDirectionsResult {
  routes?: Array<{
    overview_path?: GmapsLatLngObj[];
    legs?: Array<{
      duration?: { value?: number; text?: string };
      steps?: Array<{ travel_mode?: string }>;
    }>;
  }>;
}
export interface GmapsDirectionsService {
  route(
    request: { origin: GmapsLatLng; destination: GmapsLatLng; travelMode: string },
    callback: (result: GmapsDirectionsResult | null, status: string) => void,
  ): void;
}

const roadSegmentPathCache = new Map<string, GmapsLatLng[] | null>();
const roadSegmentInflight = new Map<string, Promise<GmapsLatLng[] | null>>();
let directionsApiUnavailable = false;

export function roadSegmentKey(from: GmapsLatLng, to: GmapsLatLng, mode: string): string {
  const q = (n: number) => n.toFixed(ROUTE_CACHE_COORD_DIGITS);
  return `${q(from.lat)},${q(from.lng)}|${q(to.lat)},${q(to.lng)}|${mode}`;
}

/** displayMode → DirectionsService travelMode (flight は null = 道路ルートにしない)。 */
export function toApiTravelMode(maps: unknown, mode: RouteTransportMode): string | null {
  const tm = (maps as { TravelMode?: Record<string, string> }).TravelMode;
  const v = (k: string) => tm?.[k] ?? k;
  switch (mode) {
    case "walk":
      return v("WALKING");
    case "car":
    case "taxi":
      return v("DRIVING");
    case "train":
    case "bus":
    case "shinkansen":
      return v("TRANSIT");
    case "bicycle":
      return v("BICYCLING");
    case "flight":
      return null;
    default:
      return v("DRIVING");
  }
}

/** 2 点間の空路風 arc (= 飛行機の概念表示)。垂直方向へ膨らませた二次ベジェ。 */
export function flightArcPath(from: GmapsLatLng, to: GmapsLatLng): GmapsLatLng[] {
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  const cLat = (from.lat + to.lat) / 2 - dLng * 0.18;
  const cLng = (from.lng + to.lng) / 2 + dLat * 0.18;
  const pts: GmapsLatLng[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push({
      lat: mt * mt * from.lat + 2 * mt * t * cLat + t * t * to.lat,
      lng: mt * mt * from.lng + 2 * mt * t * cLng + t * t * to.lng,
    });
  }
  return pts;
}

/** DirectionsService instance を生成 (不可なら null = 直線 fallback)。 */
export function createDirectionsService(maps: unknown): GmapsDirectionsService | null {
  if (directionsApiUnavailable) return null;
  const ctor = (maps as { DirectionsService?: new () => GmapsDirectionsService }).DirectionsService;
  if (typeof ctor !== "function") return null;
  try {
    return new ctor();
  } catch {
    return null;
  }
}

/** 1 区間の道路 path を取得。cache / in-flight 合流 / timeout / fail-open 込み。 */
export function fetchRoadSegmentPath(
  service: GmapsDirectionsService,
  from: GmapsLatLng,
  to: GmapsLatLng,
  travelMode: string,
): Promise<GmapsLatLng[] | null> {
  const key = roadSegmentKey(from, to, travelMode);
  if (roadSegmentPathCache.has(key)) return Promise.resolve(roadSegmentPathCache.get(key) ?? null);
  const existing = roadSegmentInflight.get(key);
  if (existing) return existing;
  const promise = new Promise<GmapsLatLng[] | null>((resolve) => {
    let settled = false;
    const settle = (value: GmapsLatLng[] | null, cache: boolean) => {
      if (settled) return;
      settled = true;
      if (cache) roadSegmentPathCache.set(key, value);
      resolve(value);
    };
    const timer = setTimeout(() => settle(null, false), DIRECTIONS_SEGMENT_TIMEOUT_MS);
    try {
      service.route({ origin: from, destination: to, travelMode }, (result, status) => {
        clearTimeout(timer);
        if (status === "OK") {
          const path = result?.routes?.[0]?.overview_path;
          if (path && path.length > 0) {
            settle(path.map((pt) => ({ lat: pt.lat(), lng: pt.lng() })), true);
          } else {
            settle(null, true);
          }
          return;
        }
        if (status === "REQUEST_DENIED") {
          directionsApiUnavailable = true;
          settle(null, false);
          return;
        }
        if (status === "ZERO_RESULTS" || status === "NOT_FOUND") {
          settle(null, true);
          return;
        }
        settle(null, false);
      });
    } catch {
      clearTimeout(timer);
      settle(null, false);
    }
  }).finally(() => {
    roadSegmentInflight.delete(key);
  });
  roadSegmentInflight.set(key, promise);
  return promise;
}

// ── 所要時間比較 (= 実 Google duration / 乗換数。推薦せず・偽数字なし) ──
export interface LegInfo {
  minutes: number;
  transfers: number | null;
}
export interface LegDurState {
  loading: boolean;
  walk: LegInfo | null;
  drive: LegInfo | null;
  transit: LegInfo | null;
}
const legInfoCache = new Map<string, LegInfo | null>();
const legInfoInflight = new Map<string, Promise<LegInfo | null>>();

/** 1 区間 1 手段の所要時間/乗換数。transit は TRANSIT steps−1 を乗換数に。取れなければ null。 */
export function fetchLegInfo(
  service: GmapsDirectionsService,
  from: GmapsLatLng,
  to: GmapsLatLng,
  travelMode: string,
): Promise<LegInfo | null> {
  if (directionsApiUnavailable) return Promise.resolve(null);
  const key = roadSegmentKey(from, to, travelMode);
  if (legInfoCache.has(key)) return Promise.resolve(legInfoCache.get(key) ?? null);
  const existing = legInfoInflight.get(key);
  if (existing) return existing;
  const promise = new Promise<LegInfo | null>((resolve) => {
    let settled = false;
    const settle = (value: LegInfo | null, cache: boolean) => {
      if (settled) return;
      settled = true;
      if (cache) legInfoCache.set(key, value);
      resolve(value);
    };
    const timer = setTimeout(() => settle(null, false), DIRECTIONS_SEGMENT_TIMEOUT_MS);
    try {
      service.route({ origin: from, destination: to, travelMode }, (result, status) => {
        clearTimeout(timer);
        if (status === "OK") {
          const legs = result?.routes?.[0]?.legs;
          if (legs && legs.length > 0) {
            const sec = legs.reduce((s, l) => s + (l.duration?.value ?? 0), 0);
            let transitSteps = 0;
            for (const l of legs) {
              for (const st of l.steps ?? []) {
                if (st.travel_mode === "TRANSIT") transitSteps += 1;
              }
            }
            if (sec > 0) {
              const transfers = transitSteps > 0 ? Math.max(0, transitSteps - 1) : null;
              settle({ minutes: Math.max(1, Math.round(sec / 60)), transfers }, true);
            } else {
              settle(null, true);
            }
          } else {
            settle(null, true);
          }
          return;
        }
        if (status === "REQUEST_DENIED") {
          directionsApiUnavailable = true;
          settle(null, false);
          return;
        }
        if (status === "ZERO_RESULTS" || status === "NOT_FOUND") {
          settle(null, true);
          return;
        }
        settle(null, false);
      });
    } catch {
      clearTimeout(timer);
      settle(null, false);
    }
  }).finally(() => {
    legInfoInflight.delete(key);
  });
  legInfoInflight.set(key, promise);
  return promise;
}
