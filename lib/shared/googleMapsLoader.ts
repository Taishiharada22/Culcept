"use client";

/**
 * Shared vanilla Google Maps JS API script loader (Phase 2-C v3 §5.1.1)
 *
 * 設計書: docs/alter-plan-phase2-c-map-tab-mini-design.md §5.1
 *
 * 目的:
 *   - Plan MapTab が Google Maps script を vanilla JS で読み込むための shared hook
 *   - MorningMapView (`components/home/morning/MorningMapView.tsx`) と独立、ただし
 *     **SCRIPT_ID 統一 ("alter-morning-gmaps") で singleton 共有** → script tag 実体は 1 つ
 *
 * MorningMapView 不可触原則 (CEO 補正 3、§5.1.1):
 *   - 本 file は **新規追加のみ**、MorningMapView には touch なし
 *   - Morning と Plan が同 SCRIPT_ID で同一の script を共有
 *   - Morning が先に mount: Morning が script inject → Plan は既存 script を検出して待つ
 *   - Plan が先に mount: Plan が script inject → Morning は既存 script を検出して待つ
 *   - 両者: `window.google?.maps` の fast-path で重複 load 回避
 *
 * @vis.gl/react-google-maps NG (PR #31 で Vercel build 45:22 timeout 経験) → vanilla 一択
 *
 * Fail-safe:
 *   - browserKey 未設定 → `keyAvailable=false`、script inject せず
 *   - script load fail → `ready=false` のまま、UI 側で semantic fallback
 *   - SSR: typeof window === "undefined" で安全に noop
 *
 * Type 戦略:
 *   - `@types/google.maps` install NG (新 dep、§19 中断 trigger)
 *   - 必要最小限の型を本 file で `declare global` + interface 宣言
 *   - Morning の MorningMapView と同 pattern
 */

import { useEffect, useState } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Minimal Google Maps JS API types (本 file 内で完結、@types/google.maps 不要)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface GmapsLatLng {
  lat: number;
  lng: number;
}

export interface GmapsPoint {
  x: number;
  y: number;
}

export interface GmapsIcon {
  path?: string | number;
  url?: string;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWeight?: number;
  scale?: number;
  anchor?: GmapsPoint;
  labelOrigin?: GmapsPoint;
}

export interface GmapsMapOptions {
  center?: GmapsLatLng;
  zoom?: number;
  gestureHandling?: string;
  disableDefaultUI?: boolean;
  zoomControl?: boolean;
  mapTypeControl?: boolean;
  scaleControl?: boolean;
  streetViewControl?: boolean;
  rotateControl?: boolean;
  fullscreenControl?: boolean;
  clickableIcons?: boolean;
}

export interface GmapsMap {
  setCenter(c: GmapsLatLng): void;
  setZoom(z: number): void;
  fitBounds(bounds: GmapsLatLngBounds, padding?: number): void;
}

export interface GmapsMarkerOptions {
  position?: GmapsLatLng;
  map?: GmapsMap;
  title?: string;
  icon?: GmapsIcon | string;
  label?: string | { text: string; color?: string; fontSize?: string; fontWeight?: string };
}

export interface GmapsListener {
  remove(): void;
}

export interface GmapsMarker {
  setMap(m: GmapsMap | null): void;
  addListener(event: string, handler: () => void): GmapsListener;
}

export interface GmapsLatLngBounds {
  extend(c: GmapsLatLng): void;
  isEmpty(): boolean;
}

export interface GmapsPolylineOptions {
  path?: GmapsLatLng[];
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  geodesic?: boolean;
  map?: GmapsMap;
  icons?: Array<{
    icon: {
      path: string | number;
      strokeOpacity?: number;
      strokeColor?: string;
      scale?: number;
    };
    offset?: string;
    repeat?: string;
  }>;
}

export interface GmapsPolyline {
  setMap(m: GmapsMap | null): void;
}

export interface GmapsApi {
  Map: new (el: HTMLElement, opts?: GmapsMapOptions) => GmapsMap;
  Marker: new (opts?: GmapsMarkerOptions) => GmapsMarker;
  Polyline: new (opts?: GmapsPolylineOptions) => GmapsPolyline;
  LatLngBounds: new () => GmapsLatLngBounds;
  Point: new (x: number, y: number) => GmapsPoint;
  /** SymbolPath constants (CIRCLE=0、BACKWARD_CLOSED_ARROW=1 等) */
  SymbolPath: {
    CIRCLE: number;
  };
}

declare global {
  interface Window {
    google?: { maps?: GmapsApi };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * SCRIPT_ID は MorningMapView と統一 ("alter-morning-gmaps")。
 * 両 component が singleton 共有することで script tag の実体は 1 つに収まる。
 *
 * ⚠️ この値を変更すると MorningMapView の挙動が変わる (新規 script が別 ID で inject される)。
 * MorningMapView 不可触原則 (CEO 補正 3) の観点で、この ID は touch 禁止。
 */
const SCRIPT_ID = "alter-morning-gmaps";

const SCRIPT_URL_BASE = "https://maps.googleapis.com/maps/api/js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UseGoogleMapsScriptResult {
  /** Google Maps JS API が利用可能か (window.google.maps が初期化済) */
  ready: boolean;
  /** Browser key が env に設定済か (false の場合は keyMissing placeholder UI を表示) */
  keyAvailable: boolean;
}

/**
 * Google Maps script を vanilla `<script>` tag で読み込む hook。
 *
 * 使用例:
 *   const { ready, keyAvailable } = useGoogleMapsScript();
 *   if (!keyAvailable) return <KeyMissingPlaceholder />;
 *   if (!ready) return <LoadingPlaceholder />;
 *   // ready=true 時に window.google.maps を使う
 *
 * Race condition / dedupe:
 *   - 複数 instance が mount されても script は 1 つだけ inject (SCRIPT_ID dedupe)
 *   - 既存 script が読み込み中なら "load" event を await
 *   - 既に `window.google.maps` がある場合 (Morning 側で先に load 済) は即 ready=true
 *
 * Cleanup:
 *   - mount/unmount で script tag は **削除しない** (= keep alive、再 mount 時に重複 load 回避)
 *   - listener は cleanup で除去
 */
export function useGoogleMapsScript(): UseGoogleMapsScriptResult {
  const browserKey = process.env.NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY;
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    if (!browserKey) return;
    if (typeof window === "undefined") return;

    // Fast path: 既に Google Maps が初期化済
    if (window.google?.maps) {
      setReady(true);
      return;
    }

    // 既存 script tag を検出 (Morning が先に inject していた場合)
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // 既存 script の load event を待つ
      const handler = () => setReady(true);
      existing.addEventListener("load", handler, { once: true });
      // 既に load 済の可能性 (script tag があるが google.maps はまだ?) を考慮
      if (window.google?.maps) {
        setReady(true);
      }
      return () => existing.removeEventListener("load", handler);
    }

    // 新規 script tag を inject (本 hook が先 mount のケース)
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `${SCRIPT_URL_BASE}?key=${encodeURIComponent(browserKey)}`;
    const onLoad = () => setReady(true);
    const onError = () => {
      // fail-open: ready=false のまま、UI 側 semantic fallback
    };
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    document.head.appendChild(script);

    // cleanup: script tag は keep (再 mount 時の重複 load 回避)、listener も既に { once: true } で自動除去
  }, [browserKey]);

  return { ready, keyAvailable: !!browserKey };
}
