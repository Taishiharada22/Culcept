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
import type { PlanItem } from "@/lib/alter-morning/types";
import { emitVisualFlowClientEvent } from "@/lib/alter-morning/visualFlow/analytics";
// CEO 2026-04-28 G5: journey anchor pin 用 sentinel id (実 event_id と衝突しない)
import {
  HOME_TRAVEL_SENTINEL_ID,
  ENDPOINT_TRAVEL_SENTINEL_ID,
} from "@/lib/alter-morning/planning/transportContext";

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

/**
 * MorningMapView の入力 prop。
 *
 * W3-PR-13 M5 fix:
 *   v1 経路 (`events`: ComprehensionEvent[]) と v2 経路 (`planItems`: PlanItem[])
 *   の両方を受ける。pin 抽出は events を優先し、events から有効 pin が 2 未満
 *   しか取れなかった場合に planItems から fallback で抽出する。
 *
 *   背景 (M5 Stage 3 canary 観測時に判明):
 *     現在の data flow では server 側 `legacyAdapter.ts` が `currentEvents = result.comprehension?.events ?? []`
 *     を読むが、Place Search v2 経路に乗っているケースでは comprehension.events が
 *     populate されず `persistedEvents: null` のまま返る。一方 `plan.items[].location`
 *     には Places API resolver が解決した lat/lng が確実に乗っている。
 *     map の唯一の真の source として両方を見ることで、server 改修なしに描画可能にする。
 */
interface MorningMapViewProps {
  /** v1 経路 (legacyAdapter.persistedEvents)。空 / 不足時は planItems を使う */
  events?: ComprehensionEvent[];
  /** v2 経路 fallback (PlanItem[].location.lat/lng)。events が 2 未満の時に使う */
  planItems?: PlanItem[];
  /**
   * CEO 2026-04-28 G5 (Journey 構造): 起点 anchor (現在地 / 自宅)。
   * `plan.journeyOrigin` から渡される。coords があれば map pin として **先頭** に追加。
   * 1-event plan でも anchor + event + endpoint = 3 pins で map mount 可能になる。
   */
  journeyOrigin?: { label: string; lat: number; lng: number } | null;
  /**
   * CEO 2026-04-28 G5: 終点 anchor (帰宅 / hotel / friend's house)。
   * `plan.journeyEnd` から渡される。coords があれば map pin として **末尾** に追加。
   * round-trip default (origin と同 coords) は dedupe で 1 pin に集約される。
   */
  journeyEnd?: { label: string; lat: number; lng: number } | null;
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

/**
 * v2 plan.items から valid な pin 群を抽出（W3-PR-13 M5 fix）。
 *
 * 設計:
 *   - kind === "fixed" のみ対象（todo / travel / proposal は pin にしない）
 *   - location.lat / location.lng が両方 number で valid range の item のみ
 *   - id は PlanItem.id（seg_1 / seg_2 等）
 *   - label は location.resolvedName ?? location.label
 *
 * 「fixed のみ」の根拠:
 *   - "todo" は時間未確定の柔軟タスク（まだプラン上の場所が決まっていない可能性）
 *   - "travel" は移動セグメントで、出発地/到着地の二点を持つので pin 化に追加実装が必要
 *   - "proposal" は Alter の提案（ユーザー予定ではない）
 *   M5 段階では「ユーザーが確定した場所」だけを pin として描く方針。
 *
 * 重複防止:
 *   events からも planItems からも同一座標が取れる可能性があるが、
 *   呼び出し側で「events ≥ 2 ならそちらを使う / 不足時のみ planItems を使う」
 *   排他選択をするので、両方を merge する処理は本関数では行わない。
 */
export function extractPinsFromPlanItems(items: PlanItem[]): PinPoint[] {
  const pins: PinPoint[] = [];
  for (const item of items) {
    if (item.kind !== "fixed") continue;
    const lat = item.location?.lat;
    const lng = item.location?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    const coord: GeoCoordinates = { lat, lng };
    if (!isValidCoord(coord)) continue;
    pins.push({
      id: item.id,
      coord,
      label: item.location?.resolvedName ?? item.location?.label ?? null,
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

/**
 * CEO 2026-04-28 G5: journey anchor (origin / endpoint) を pin として抽出。
 *
 * 仕様:
 *   - origin / end の coords が valid (Number.isFinite + 緯度経度範囲内) なら pin 化
 *   - id は HOME_TRAVEL_SENTINEL_ID / ENDPOINT_TRAVEL_SENTINEL_ID (sentinel)
 *   - label は anchor.label ("現在地" / "自宅" / "帰宅")
 *   - **dedupe**: origin と end の coords が 4 桁精度（≈11m）で同点なら endpoint pin を skip
 *     （round-trip default の場合、anchor 1 個で済ます）
 *
 * 戻り値:
 *   - origin のみ valid → [origin pin]
 *   - end のみ valid    → [end pin]
 *   - 両方 valid + 異coord → [origin pin, end pin] (順序保持)
 *   - 両方 valid + 同 coord → [origin pin] (endpoint dedupe)
 *   - どちらも invalid  → []
 *
 * 設計判断:
 *   - dedupe 精度は isSamePointCluster と同じ 4 桁（精度の一貫性）
 *   - round-trip 時に endpoint label "帰宅" を見せたいか議論余地あるが、
 *     map pin は座標位置を示すもので「重複位置に 2 pin」は混乱を招く
 *     → 1 pin にまとめる（label は origin の "現在地" or "自宅" になる）
 */
export function extractJourneyPins(
  origin?: { label: string; lat: number; lng: number } | null,
  end?: { label: string; lat: number; lng: number } | null,
): PinPoint[] {
  const pins: PinPoint[] = [];
  const originCoord: GeoCoordinates | null =
    origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)
      ? { lat: origin.lat, lng: origin.lng }
      : null;
  const endCoord: GeoCoordinates | null =
    end && Number.isFinite(end.lat) && Number.isFinite(end.lng)
      ? { lat: end.lat, lng: end.lng }
      : null;

  if (originCoord && isValidCoord(originCoord)) {
    pins.push({
      id: HOME_TRAVEL_SENTINEL_ID,
      coord: originCoord,
      label: origin!.label,
    });
  }

  if (endCoord && isValidCoord(endCoord)) {
    // dedupe: origin と end が同 coord (round-trip default) なら endpoint は skip
    if (originCoord && isSameCoordPrecision(originCoord, endCoord)) {
      // skip — origin pin が既に同位置を示している
    } else {
      pins.push({
        id: ENDPOINT_TRAVEL_SENTINEL_ID,
        coord: endCoord,
        label: end!.label,
      });
    }
  }

  return pins;
}

/**
 * 2 つの coord が 4 桁精度（≈11m）で同点か。
 * isSamePointCluster と精度を揃えることで「同点 cluster なら全部同位置」と
 * 「journey dedupe」の判定基準を一致させる。
 */
function isSameCoordPrecision(a: GeoCoordinates, b: GeoCoordinates): boolean {
  return (
    a.lat.toFixed(4) === b.lat.toFixed(4) &&
    a.lng.toFixed(4) === b.lng.toFixed(4)
  );
}

/**
 * CEO 2026-04-28 G5: pin 順序を「origin → events → endpoint」 に組成する。
 *
 * journeyPins は extractJourneyPins の出力（[origin] / [end] / [origin, end] / []）。
 * eventPins は extractPins or extractPinsFromPlanItems の出力。
 *
 * 出力順序:
 *   1. origin pin (HOME_TRAVEL_SENTINEL_ID) があれば先頭
 *   2. eventPins
 *   3. endpoint pin (ENDPOINT_TRAVEL_SENTINEL_ID) があれば末尾
 *
 * Map fitBounds は順序非依存だが、UI 上で pin 順序が意味を持つ将来拡張
 * （pin tooltip / polyline / 検索順序）に備えて canonical 順序を保証する。
 */
export function composeJourneyPinList(
  journeyPins: PinPoint[],
  eventPins: PinPoint[],
): PinPoint[] {
  const originPin = journeyPins.find((p) => p.id === HOME_TRAVEL_SENTINEL_ID);
  const endPin = journeyPins.find(
    (p) => p.id === ENDPOINT_TRAVEL_SENTINEL_ID,
  );
  const result: PinPoint[] = [];
  if (originPin) result.push(originPin);
  result.push(...eventPins);
  if (endPin) result.push(endPin);
  return result;
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

export function MorningMapView({
  events,
  planItems,
  journeyOrigin,
  journeyEnd,
}: MorningMapViewProps) {
  const browserKey = process.env.NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY;
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapsReady, setMapsReady] = useState<boolean>(false);

  /**
   * W3-PR-13 M5 + CEO 2026-04-28 G5: pin source の三段階解決
   *
   *   1. event pins:
   *      a. v1 events から有効 pin が 2 件以上取れればそれを使う
   *      b. 取れなければ v2 planItems から fallback で抽出
   *      c. どちらも 2 未満なら多い方（gate_rejected 報告用）
   *   2. journey pins (anchor + endpoint):
   *      extractJourneyPins で origin / endpoint を pin 化
   *      （round-trip 同 coords は dedupe で 1 pin に集約）
   *   3. composeJourneyPinList で「origin → events → endpoint」 順に結合
   *
   * 「v1 を優先する」理由: comprehension が走った場合 ev.where.coordinates は
   * Places API 解決済みで信頼度が高い。planItems の location は v2 PlanState
   * 由来で、resolutionConfidence が "low" のケースもある。
   *
   * 「journey pin を加える」理由 (CEO 2026-04-28 G5):
   *   1-event plan でも origin + event = 2 pins で map mount できるようにする。
   *   anchor / endpoint の coords は plan.journeyOrigin / journeyEnd 経由で渡る。
   */
  const pins = useMemo(() => {
    const v1Pins = events ? extractPins(events) : [];
    const v2Pins = planItems ? extractPinsFromPlanItems(planItems) : [];
    // event pin source: v1 を優先、不足時 v2、どちらも 2 未満なら多い方
    let eventPins: PinPoint[];
    if (v1Pins.length >= 2) {
      eventPins = v1Pins;
    } else if (v2Pins.length >= 2) {
      eventPins = v2Pins;
    } else {
      eventPins = v1Pins.length >= v2Pins.length ? v1Pins : v2Pins;
    }
    const journeyPins = extractJourneyPins(journeyOrigin, journeyEnd);
    return composeJourneyPinList(journeyPins, eventPins);
  }, [events, planItems, journeyOrigin, journeyEnd]);
  const allSamePoint = useMemo(() => isSamePointCluster(pins), [pins]);
  const bounds = useMemo(() => computeBounds(pins), [pins]);

  // ── Script loader（singleton） ───────────────────────────────────────────
  // 複数 instance が mount されても script は一つだけ挿入されるように guard。
  //
  // M4 analytics:
  //   - 新規 script を挿入したときのみ script_loaded を emit（既存 script / 既ロード時は emit しない）
  //   - onload / onerror の両方を捕捉して status を区別
  //   - duration_ms は script.src 設定〜onload までを計測
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
    const startedAt = Date.now();
    const loadHandler = () => {
      setMapsReady(true);
      void emitVisualFlowClientEvent({
        event: "visual_flow_script_loaded",
        metadata: { status: "succeeded", duration_ms: Date.now() - startedAt },
      });
    };
    const errorHandler = () => {
      void emitVisualFlowClientEvent({
        event: "visual_flow_script_loaded",
        metadata: { status: "failed" },
      });
    };
    script.addEventListener("load", loadHandler, { once: true });
    script.addEventListener("error", errorHandler, { once: true });
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

    const fitBoundsMode: "bounds" | "single_fallback" =
      allSamePoint || !bounds ? "single_fallback" : "bounds";

    if (fitBoundsMode === "single_fallback") {
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

    // M4 analytics: map が実際に描画されたことを emit
    // fire-and-forget（network 失敗でも UI 影響なし）
    void emitVisualFlowClientEvent({
      event: "visual_flow_map_mounted",
      metadata: {
        pin_count: pins.length,
        fit_bounds_mode: fitBoundsMode,
      },
    });

    return () => {
      for (const m of markers) m.setMap(null);
    };
  }, [mapsReady, pins, allSamePoint, bounds]);

  // ── Gate rejected analytics ─────────────────────────────────────────────
  // render-time の return null より先に effect で emit する（同 cause を連打しない）。
  // deps: browserKey, pins.length の片方が変わった時だけ再評価。
  // 両方 NG の時は no_browser_key 優先（early return）で 1 event のみ。
  useEffect(() => {
    if (!browserKey) {
      void emitVisualFlowClientEvent({
        event: "visual_flow_gate_rejected",
        metadata: { reason: "no_browser_key" },
      });
      return;
    }
    if (pins.length < 2) {
      void emitVisualFlowClientEvent({
        event: "visual_flow_gate_rejected",
        metadata: {
          reason: "insufficient_pins",
          pin_count: pins.length,
        },
      });
    }
  }, [browserKey, pins.length]);

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
