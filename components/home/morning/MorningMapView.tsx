"use client";

/**
 * MorningMapView — pin-only MVP (W3-PR-13 Option A / M2 段階)
 *
 * M2 方針（依存追加ゼロ・dead-code 維持）:
 * - `@vis.gl/react-google-maps` は使わない（PR #31 で Vercel build 45:22 timeout の原因）
 * - Google Maps JS API を `document.createElement("script")` で singleton 挿入
 * - `@types/google.maps` は追加せず、本ファイル内で `declare global` して最小型のみ宣言
 * - legacy Marker（Map ID 不要、AdvancedMarker 非採用）
 * - helpers 4 つ（M1 で確定）は無変更 → 既存 22 tests PASS を維持
 * - どこからも import されない状態を維持（wiring は M3）→ Vercel build 時間回帰ゼロ
 *
 * 設計原則:
 * - List (MorningPlanCard の item 列) が source of truth（I-7）
 * - Map は list の補助ビュー（下に配置）
 * - pin のみ。polyline / line / directions は描かない（I-2, I-3）
 * - 2 件以上の valid 座標がないと mount しない
 * - 同一点群 (4 桁精度 ≒ 11m) では defaultZoom fallback
 *
 * 読み取り戦略 β（M3 wiring 時に効く）:
 *   `persistedEvents[].where.coordinates` を直接読む。
 *   `plan.items[].location` は rebuildPlan（= transportV2 flag 依存）を
 *   経由するため、flag OFF でも map が描画できるよう events から読む。
 *
 * Fail-safe gates（早期 return）:
 *   - NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY 未設定 → null
 *   - pins.length < 2 → null
 *   - script load 失敗 → mapsReady=false のまま、空 <div> 残留（UI 破壊なし）
 *
 * Refs: PR #31 (C1 landed 323e1319), PR #34 (M1 landed 8d0ce253)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Event as ComprehensionEvent } from "@/lib/alter-morning/comprehension/eventSchema";
import type { GeoCoordinates } from "@/lib/alter-morning/search/normalizedPlace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Minimal Google Maps JS API types
// （@types/google.maps を入れずに strict mode を通すための最小宣言）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface GmapsLatLng {
  lat: number;
  lng: number;
}
interface GmapsMapOptions {
  center?: GmapsLatLng;
  zoom?: number;
  gestureHandling?: string;
  disableDefaultUI?: boolean;
}
interface GmapsMap {
  setCenter(c: GmapsLatLng): void;
  setZoom(z: number): void;
  fitBounds(bounds: GmapsLatLngBounds): void;
}
interface GmapsMarkerOptions {
  position?: GmapsLatLng;
  map?: GmapsMap;
  title?: string;
}
interface GmapsMarker {
  setMap(m: GmapsMap | null): void;
}
interface GmapsLatLngBounds {
  extend(c: GmapsLatLng): void;
}
interface GmapsApi {
  Map: new (el: HTMLElement, opts?: GmapsMapOptions) => GmapsMap;
  Marker: new (opts?: GmapsMarkerOptions) => GmapsMarker;
  LatLngBounds: new () => GmapsLatLngBounds;
}

declare global {
  interface Window {
    google?: {
      maps?: GmapsApi;
    };
  }
}

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
// Pure helpers (exported for tests) — M1 から無変更
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
// Component (M2 段階: 実装本体 — 依存追加ゼロ、依然として未 wiring)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAP_HEIGHT = 180;
const SAME_POINT_ZOOM = 15;
const SCRIPT_ID = "alter-morning-gmaps";
const SCRIPT_URL_BASE = "https://maps.googleapis.com/maps/api/js";

export function MorningMapView({ events }: MorningMapViewProps) {
  const browserKey = process.env.NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY;
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapsReady, setMapsReady] = useState<boolean>(false);

  const pins = useMemo(() => extractPins(events), [events]);
  const allSamePoint = useMemo(() => isSamePointCluster(pins), [pins]);
  const bounds = useMemo(() => computeBounds(pins), [pins]);

  // ── Script loader（singleton） ───────────────────────────────────────────
  // 複数 instance が mount されても script は一つだけ挿入されるように guard。
  useEffect(() => {
    if (!browserKey) return;
    if (typeof window === "undefined") return;
    if (window.google?.maps) {
      setMapsReady(true);
      return;
    }
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      const handler = () => setMapsReady(true);
      existing.addEventListener("load", handler, { once: true });
      return () => existing.removeEventListener("load", handler);
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `${SCRIPT_URL_BASE}?key=${encodeURIComponent(browserKey)}`;
    const handler = () => setMapsReady(true);
    script.addEventListener("load", handler, { once: true });
    document.head.appendChild(script);
  }, [browserKey]);

  // ── Map + markers init ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsReady) return;
    const el = mapRef.current;
    if (!el) return;
    const maps = window.google?.maps;
    if (!maps) return;
    if (pins.length < 2) return;

    const map = new maps.Map(el, {
      gestureHandling: "cooperative",
      disableDefaultUI: true,
    });

    if (allSamePoint || !bounds) {
      const center = pins[0].coord;
      map.setCenter({ lat: center.lat, lng: center.lng });
      map.setZoom(SAME_POINT_ZOOM);
    } else {
      const b = new maps.LatLngBounds();
      for (const p of pins) {
        b.extend({ lat: p.coord.lat, lng: p.coord.lng });
      }
      map.fitBounds(b);
    }

    const markers: GmapsMarker[] = pins.map(
      (p) =>
        new maps.Marker({
          map,
          position: { lat: p.coord.lat, lng: p.coord.lng },
          title: p.label ?? undefined,
        }),
    );

    return () => {
      for (const m of markers) m.setMap(null);
    };
  }, [mapsReady, pins, allSamePoint, bounds]);

  // ── Fail-safe gates ─────────────────────────────────────────────────────
  if (!browserKey) return null;
  if (pins.length < 2) return null;

  return (
    <div
      ref={mapRef}
      className="mt-3 rounded-xl overflow-hidden border border-gray-200/50"
      style={{ height: MAP_HEIGHT }}
      data-testid="morning-map-view"
      data-mode={allSamePoint ? "same-point-fallback" : "fit-bounds"}
    />
  );
}

export default MorningMapView;
