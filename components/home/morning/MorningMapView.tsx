"use client";

/**
 * MorningMapView — pin-only MVP (W3-PR-13)
 *
 * 設計原則:
 * - List (MorningPlanCard の item 列) が source of truth（I-7）
 * - Map は list の補助ビュー（下に配置）
 * - pin のみ。polyline / line / directions は描かない（I-2, I-3）
 * - 2 件以上の valid 座標がないと mount しない
 * - 同一点群 (4 桁精度 ≒ 11m) では defaultZoom fallback
 * - analytics emit は C5 で別実装（本ファイルでは emit しない）
 *
 * client-only（"use client" + 上位 MorningPlanCard 側 next/dynamic ssr:false）
 *
 * 読み取り戦略 β:
 *   `persistedEvents[].where.coordinates` を直接読む。
 *   `plan.items[].location` は rebuildPlan（= transportV2 flag 依存）を
 *   経由するため、flag OFF でも map が描画できるよう events から読む。
 */
import { useMemo } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
} from "@vis.gl/react-google-maps";
import type { Event as ComprehensionEvent } from "@/lib/alter-morning/comprehension/eventSchema";
import type { GeoCoordinates } from "@/lib/alter-morning/search/normalizedPlace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MorningMapViewProps {
  events: ComprehensionEvent[];
}

interface PinPoint {
  id: string;
  coord: GeoCoordinates;
  label?: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure helpers (exported for tests)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 有効な数値 (NaN / Infinity 除外) かつ緯度経度レンジ内か */
export function isValidCoord(c: GeoCoordinates | null | undefined): c is GeoCoordinates {
  if (!c) return false;
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return false;
  if (c.lat < -90 || c.lat > 90) return false;
  if (c.lng < -180 || c.lng > 180) return false;
  return true;
}

/** events から valid な pin 群を抽出（event id と label を保持） */
export function extractPins(events: ComprehensionEvent[]): PinPoint[] {
  const pins: PinPoint[] = [];
  for (const ev of events) {
    const c = ev.where?.coordinates;
    if (!isValidCoord(c)) continue;
    pins.push({
      id: ev.event_id,
      coord: c,
      label: ev.where?.place_ref ?? null,
    });
  }
  return pins;
}

/** 全 pin が実質同一点か（4 桁精度 ≒ 11m） */
export function isSamePointCluster(pins: PinPoint[]): boolean {
  if (pins.length === 0) return true;
  const keys = new Set(
    pins.map((p) => `${p.coord.lat.toFixed(4)},${p.coord.lng.toFixed(4)}`),
  );
  return keys.size <= 1;
}

/** fitBounds 用の矩形（ne / sw）を算出 */
export function computeBounds(pins: PinPoint[]): {
  north: number;
  south: number;
  east: number;
  west: number;
} | null {
  if (pins.length === 0) return null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const p of pins) {
    if (p.coord.lat > north) north = p.coord.lat;
    if (p.coord.lat < south) south = p.coord.lat;
    if (p.coord.lng > east) east = p.coord.lng;
    if (p.coord.lng < west) west = p.coord.lng;
  }
  return { north, south, east, west };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAP_ID = "alter-morning-map";
const SAME_POINT_ZOOM = 15;

export function MorningMapView({ events }: MorningMapViewProps) {
  const browserKey = process.env.NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY;

  const pins = useMemo(() => extractPins(events), [events]);
  const allSamePoint = useMemo(() => isSamePointCluster(pins), [pins]);
  const bounds = useMemo(() => computeBounds(pins), [pins]);

  // ── Fail-safe gates（どれかに引っかかれば何も mount しない） ──
  if (!browserKey) return null;
  if (pins.length < 2) return null;

  // 同一点群 fallback: center + defaultZoom で描画
  if (allSamePoint || !bounds) {
    const center = pins[0].coord;
    return (
      <div
        className="mt-3 rounded-xl overflow-hidden border border-gray-200/50"
        style={{ height: 180 }}
        data-testid="morning-map-view"
        data-mode="same-point-fallback"
      >
        <APIProvider apiKey={browserKey}>
          <Map
            mapId={MAP_ID}
            defaultCenter={{ lat: center.lat, lng: center.lng }}
            defaultZoom={SAME_POINT_ZOOM}
            gestureHandling="cooperative"
            disableDefaultUI
          >
            {pins.map((p) => (
              <AdvancedMarker
                key={p.id}
                position={{ lat: p.coord.lat, lng: p.coord.lng }}
                title={p.label ?? undefined}
              />
            ))}
          </Map>
        </APIProvider>
      </div>
    );
  }

  // 通常: fitBounds で全 pin を収める
  return (
    <div
      className="mt-3 rounded-xl overflow-hidden border border-gray-200/50"
      style={{ height: 180 }}
      data-testid="morning-map-view"
      data-mode="fit-bounds"
    >
      <APIProvider apiKey={browserKey}>
        <Map
          mapId={MAP_ID}
          defaultBounds={{
            north: bounds.north,
            south: bounds.south,
            east: bounds.east,
            west: bounds.west,
          }}
          gestureHandling="cooperative"
          disableDefaultUI
        >
          {pins.map((p) => (
            <AdvancedMarker
              key={p.id}
              position={{ lat: p.coord.lat, lng: p.coord.lng }}
              title={p.label ?? undefined}
            />
          ))}
        </Map>
      </APIProvider>
    </div>
  );
}

export default MorningMapView;
