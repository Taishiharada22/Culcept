/**
 * lib/plan/map/routeStyle.ts — leg ルート線のガラス質スタイル (= 移動 OS v2.3)。FH から忠実 port。
 * Slice 2b: per-state ガラス style + glassy 線(body+glow+白芯 / done=丸点線)。
 *   オーラ呼吸 animation は 2c、道路沿い path は Tier 3。★距離→mode 推定はしない。
 */
import type {
  GmapsApi,
  GmapsLatLng,
  GmapsMap,
  GmapsPolyline,
  GmapsPolylineOptions,
} from "@/lib/shared/googleMapsLoader";

import type { RouteLegState } from "./legState";
import { ROUTE_MODE_COLORS, type RouteTransportMode } from "./routeMode";

const ROUTE_DONE_COLOR = "#94a3b8";
const ROUTE_CORE_COLOR = "#ffffff";
const ROUTE_FOCUS_WEIGHT = 7;
const ROUTE_BREATH_MIN_OPACITY = 0.1;
// z-index: done < ahead < previous < current。各 leg は glow(z-2) < body(z-1) < core(z)。
const ROUTE_Z_DONE = 10;
const ROUTE_Z_AHEAD = 22;
const ROUTE_Z_PREVIOUS = 32;
const ROUTE_Z_FOCUS_MAIN = 62;

/** 1 区間の解決済み視覚スタイル。 */
export interface RouteLegStyle {
  color: string;
  weight: number;
  bodyOpacity: number;
  glowExtra: number;
  glowOpacity: number;
  coreWeight: number;
  coreOpacity: number;
  dashed: boolean;
  animate: boolean;
  zIndex: number;
}

interface RouteSymbol {
  path: string | number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  fillColor?: string;
  fillOpacity?: number;
  scale?: number;
}
type RoutePolylineOptions = Omit<GmapsPolylineOptions, "icons"> & {
  zIndex?: number;
  clickable?: boolean;
  icons?: Array<{ icon: RouteSymbol; offset?: string; repeat?: string }>;
};

/** (state, mode) → ガラス質スタイル。done=丸点線 / previous・ahead=控えめガラス / current=発光する主役。 */
export function getRouteStyleForLeg(
  state: RouteLegState,
  mode: RouteTransportMode,
): RouteLegStyle {
  if (state === "done") {
    return { color: ROUTE_DONE_COLOR, weight: 3, bodyOpacity: 0.5, glowExtra: 0, glowOpacity: 0, coreWeight: 0, coreOpacity: 0, dashed: true, animate: false, zIndex: ROUTE_Z_DONE };
  }
  if (state === "previous") {
    return { color: ROUTE_MODE_COLORS[mode], weight: 5, bodyOpacity: 0.5, glowExtra: 6, glowOpacity: 0.14, coreWeight: 2, coreOpacity: 0.5, dashed: false, animate: false, zIndex: ROUTE_Z_PREVIOUS };
  }
  if (state === "ahead") {
    return { color: ROUTE_MODE_COLORS[mode], weight: 4.5, bodyOpacity: 0.38, glowExtra: 5, glowOpacity: 0.1, coreWeight: 1.5, coreOpacity: 0.38, dashed: false, animate: false, zIndex: ROUTE_Z_AHEAD };
  }
  // current = 今→次 = 太い半透明ガラス + 白芯 + 呼吸 glow(初期値) = 主役
  return { color: ROUTE_MODE_COLORS[mode], weight: ROUTE_FOCUS_WEIGHT, bodyOpacity: 0.6, glowExtra: 9, glowOpacity: ROUTE_BREATH_MIN_OPACITY, coreWeight: 2.5, coreOpacity: 0.72, dashed: false, animate: true, zIndex: ROUTE_Z_FOCUS_MAIN };
}

/** 丸点線 icons (= done / 未対応区間用)。Google 純正 CIRCLE の塗りドット。 */
export function dottedRouteIcons(maps: GmapsApi, color: string, opacity: number) {
  return [
    {
      icon: { path: maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: opacity, strokeOpacity: 0, scale: 2.5 },
      offset: "0",
      repeat: "14px",
    },
  ];
}

/**
 * 1 区間をガラス質ホログラムとして描画。
 *   active = 外側グロー + 本体(半透明 mode 色) + 白い芯 の 3 層 / done = 丸点線。
 *   戻り値 glow は current の呼吸 animation(2c)で参照する(done/静的は null)。
 */
export function buildGlassyLegLines(
  maps: GmapsApi,
  map: GmapsMap,
  path: GmapsLatLng[],
  style: RouteLegStyle,
): { lines: GmapsPolyline[]; glow: GmapsPolyline | null } {
  if (style.dashed) {
    return {
      lines: [
        new maps.Polyline({ map, path, strokeOpacity: 0, icons: dottedRouteIcons(maps, style.color, style.bodyOpacity), zIndex: style.zIndex, clickable: false } as RoutePolylineOptions),
      ],
      glow: null,
    };
  }
  const glow = new maps.Polyline({ map, path, strokeColor: style.color, strokeOpacity: style.glowOpacity, strokeWeight: style.weight + style.glowExtra, zIndex: style.zIndex - 2, clickable: false } as RoutePolylineOptions);
  const body = new maps.Polyline({ map, path, strokeColor: style.color, strokeOpacity: style.bodyOpacity, strokeWeight: style.weight, zIndex: style.zIndex - 1, clickable: false } as RoutePolylineOptions);
  const core = new maps.Polyline({ map, path, strokeColor: ROUTE_CORE_COLOR, strokeOpacity: style.coreOpacity, strokeWeight: style.coreWeight, zIndex: style.zIndex, clickable: false } as RoutePolylineOptions);
  return { lines: [glow, body, core], glow };
}
