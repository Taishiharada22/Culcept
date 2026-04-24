/**
 * MorningMapView — pin-only MVP (W3-PR-13 Option A / M1 段階)
 *
 * M1 方針（runtime 変化ゼロ）:
 * - pure helpers (isValidCoord / extractPins / isSamePointCluster / computeBounds) のみ実装
 * - component body は placeholder（null return）
 * - React / JSX / `"use client"` / Google Maps / env 参照なし
 * - 依存追加なし → Vercel build 時間 regression が出ないことを検証する基準線
 *
 * 後段（この M1 では含めない）:
 * - M2: next/script + useEffect で Google Maps JS API 直叩き（legacy Marker、Map ID 不要）
 * - M3: MorningPlanCard / AskHero / AneurasyncHome / page.tsx への wiring
 *
 * 設計原則（M2+ で効いてくる）:
 * - List (MorningPlanCard の item 列) が source of truth（I-7）
 * - Map は list の補助ビュー（下に配置）
 * - pin のみ。polyline / line / directions は描かない（I-2, I-3）
 * - 2 件以上の valid 座標がないと mount しない
 * - 同一点群 (4 桁精度 ≒ 11m) では defaultZoom fallback
 *
 * 読み取り戦略 β（M2+ で効いてくる）:
 *   `persistedEvents[].where.coordinates` を直接読む。
 *   `plan.items[].location` は rebuildPlan（= transportV2 flag 依存）を
 *   経由するため、flag OFF でも map が描画できるよう events から読む。
 *
 * Refs: PR #31 (C1 landed 323e1319), Option A scope /tmp/pr34-option-a-scope.md
 */
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
// Component (M1 段階: placeholder — runtime render なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 意図的に何も描画しない。これにより:
// - React / JSX / google.maps / NEXT_PUBLIC_* への依存ゼロ
// - "use client" directive 不要（M2 で useEffect 導入時に付与）
// - どこからも import されていない状態を維持（MorningPlanCard への wiring は M3）
// - Vercel build 時間への影響ゼロを保証
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MorningMapView(_props: MorningMapViewProps): null {
  return null;
}

export default MorningMapView;
