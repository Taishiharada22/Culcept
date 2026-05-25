/**
 * Phase 3-N Map impl sub-phase 9a-pre — ExternalAnchor → Map view model adapter
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-24 readiness v2):
 *   - **pure module** (= LLM / API / DB / network 不使用、 純粋関数のみ)
 *   - **ExternalAnchor + AnchorResolution → MapPinViewModel** 単件変換
 *   - **ExternalAnchor[] + resolutions Map → MapPinViewModel[]** list 変換 (= 順序付与、 unresolved skip)
 *   - **MapPinViewModel[] → MapRouteSegmentViewModel[]** route 生成 (= pin 順で接続、 readiness §2.3.4 fallback 整合)
 *   - **MapSheetViewModel** 単件変換 (= ExternalAnchor + List CategoryMeaning getNarrative 再利用)
 *
 *   - 9a 範囲: pure 変換のみ、 MapTab 統合は 9a-impl
 *   - 9a 範囲外:
 *     - SourceIndicator / source semantics の sheet 内 render (= 9a-impl + 9b)
 *     - meaning text の Map 固有調整 (= 9b 以降、 9a-pre は List getNarrative 流用)
 *     - 画像 truth (= ExternalAnchor に image field なし、 imageUrl 常に undefined)
 *
 *   - 規約 「DB / env / package / dependency 変更禁止」 遵守
 *   - 既存 lib/plan/* 不触 (= 既存 external-anchor / list 系から参照のみ)
 *
 * 設計書:
 *   - docs/alter-plan-map-redesign-spec-audit.md v3
 *   - docs/alter-plan-map-redesign-impl-readiness.md v2
 *   - lib/plan/external-anchor.ts (= ExternalAnchor 型)
 *   - lib/plan/list/adapters/externalAnchorAdapter.ts (= List 側、 resolveCategory 流用)
 *   - lib/plan/list/categoryMeaning.ts (= getNarrative meaning text 流用)
 *   - app/(culcept)/plan/tabs/_usePlanGeocode.ts (= AnchorResolution 型)
 *
 * 不変原則:
 *   - 入力 mutate なし
 *   - 現在時刻参照なし (= test deterministic)
 *   - sensitive anchor の locationText は表示しない (= privacy 配慮、 List 側と整合)
 *   - 緯度経度未解決 anchor は pin 化しない (= unresolved skip、 route も skip)
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { LocationCategory } from "@/lib/plan/location-category";
import { type EventCategory } from "@/lib/plan/list/types";
import { inferCategoryFromText } from "@/lib/plan/list/categoryInference";
import { getNarrative, getMeaningText } from "@/lib/plan/list/categoryMeaning";
import {
  type MapPinViewModel,
  type MapRouteSegmentViewModel,
  type MapSheetViewModel,
  type MapCoordinates,
} from "@/lib/plan/map/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AnchorResolution 型 (= _usePlanGeocode.ts 流用、 import 循環避けるため inline 定義)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 緯度経度 + 名前付き解決結果 (= _usePlanGeocode.AnchorResolution と shape 一致)
 *
 * inline 定義の理由:
 *   - tabs/_usePlanGeocode.ts は app/(culcept) 層、 lib/plan/map から逆方向 import 不適
 *   - shape のみ一致させて受け取り (= structural typing)
 */
export type AnchorResolution = {
  readonly lat: number;
  readonly lng: number;
  readonly confidence: string;
  readonly resolvedName: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category mapping (= List adapter から重複コピー、 9b で共通 helper 化検討)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LOCATION_CATEGORY_TO_EVENT_CATEGORY: Record<LocationCategory, EventCategory> = {
  home: 'home',
  office: 'work',
  school: 'work',
  cafe: 'cafe',
  outdoor: 'other',
  public: 'other',
  transit: 'other',
  unknown: 'other',
};

/**
 * 4 段階優先順位 category 解決 (= List sub-phase 8b-5 corrective と同 logic)
 *
 * 1. explicit locationCategory が決定的な値 → 直接
 * 2. title keyword heuristic
 * 3. locationText keyword heuristic
 * 4. 'other' fallback
 */
/**
 * Step γ で公開 (= MapTab PlanMapView の独自 pin marker 生成で category 取得用)
 * 9a-pre で internal だったが、 pin SVG generation で同 logic 再利用が必要なため export 化。
 */
export function resolveCategory(anchor: ExternalAnchor): EventCategory {
  if (anchor.locationCategory !== undefined) {
    const explicit = LOCATION_CATEGORY_TO_EVENT_CATEGORY[anchor.locationCategory];
    if (explicit !== undefined && explicit !== 'other') {
      return explicit;
    }
  }
  const titleHit = inferCategoryFromText(anchor.title);
  if (titleHit !== undefined) return titleHit;
  if (anchor.locationText !== undefined && anchor.locationText.length > 0) {
    const locationHit = inferCategoryFromText(anchor.locationText);
    if (locationHit !== undefined) return locationHit;
  }
  return 'other';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Time normalization (= List adapter から流用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function normalizeTimeToHHMM(time: string): string {
  if (time.includes('T')) {
    const tIndex = time.indexOf('T');
    const afterT = time.slice(tIndex + 1, tIndex + 6);
    if (/^\d{2}:\d{2}$/.test(afterT)) return afterT;
    return '00:00';
  }
  const hhmm = time.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(hhmm)) return hhmm;
  return '00:00';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single anchor → MapPinViewModel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単件 ExternalAnchor + AnchorResolution → MapPinViewModel
 *
 * - resolution が null (= unresolved) なら undefined return (= pin 化しない、 readiness §2.3 弱 case 候補)
 * - title は 8 文字制限 (= readiness §2.1.3 表示制限)、 ただし adapter では truncate しない (= 表示側で ellipsis)
 * - order は呼出側で付与 (= list 変換時の startTime 順)
 */
export function convertExternalAnchorToMapPin(
  anchor: ExternalAnchor,
  resolution: AnchorResolution | null,
  order: number,
): MapPinViewModel | undefined {
  if (resolution === null) return undefined;
  const time = normalizeTimeToHHMM(anchor.startTime);
  const category = resolveCategory(anchor);
  return {
    id: anchor.id,
    category,
    coordinates: {
      lat: resolution.lat,
      lng: resolution.lng,
    },
    title: anchor.title,
    time,
    order,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// List → MapPin 配列 (= startTime asc 整列 + order 付与 + unresolved skip)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ExternalAnchor[] + resolutions Map → MapPinViewModel[]
 *
 * - startTime 昇順整列
 * - unresolved (= resolution null) は skip
 * - 整列後の index + 1 を order として付与 (= 1-indexed、 readiness §2.4 「番号は副」 で表示控えめ)
 * - 入力 mutate なし
 */
export function convertExternalAnchorListToMapPins(
  anchors: ReadonlyArray<ExternalAnchor>,
  resolutions: ReadonlyMap<string, AnchorResolution | null>,
): ReadonlyArray<MapPinViewModel> {
  // sort by startTime first
  const sorted = [...anchors].sort((a, b) => {
    const aTime = normalizeTimeToHHMM(a.startTime);
    const bTime = normalizeTimeToHHMM(b.startTime);
    return aTime.localeCompare(bTime);
  });
  // map + filter unresolved
  const pins: MapPinViewModel[] = [];
  let order = 0;
  for (const a of sorted) {
    const resolution = resolutions.get(a.id) ?? null;
    order += 1; // increment regardless of resolution (= numbering reflects user intent order)
    const pin = convertExternalAnchorToMapPin(a, resolution, order);
    if (pin !== undefined) pins.push(pin);
  }
  return pins;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapPin[] → MapRouteSegment[] (= 順序接続 抽象 route)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * MapPinViewModel[] → MapRouteSegmentViewModel[]
 *
 * spec v3 §5 + readiness §2.3.4 整合:
 *   - 隣接 pin (= 整列順) を接続
 *   - confirmed pin のみ繋ぐ (= unresolved は既に skip 済、 入力は confirmed のみ前提)
 *   - 距離 / 交通手段は型に含まない (= ナビ精度主張禁止)
 *   - readiness §2.3 「使える時は細中立破線」 / 「弱い時 confirmed のみ」 / 「使えない時 skip」
 *     → 本 adapter は 「強 / 弱」 共通: confirmed pin を接続、 出力後の render 側で polyline 強度別に style
 *
 * 入力が 1 pin 以下 → 空配列 (= 接続不要)
 */
export function convertMapPinsToRouteSegments(
  pins: ReadonlyArray<MapPinViewModel>,
): ReadonlyArray<MapRouteSegmentViewModel> {
  if (pins.length < 2) return [];
  const segments: MapRouteSegmentViewModel[] = [];
  for (let i = 0; i < pins.length - 1; i += 1) {
    const from = pins[i];
    const to = pins[i + 1];
    segments.push({
      fromPinId: from.id,
      toPinId: to.id,
      from: from.coordinates,
      to: to.coordinates,
    });
  }
  return segments;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ExternalAnchor + AnchorResolution → MapSheetViewModel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単件 ExternalAnchor → MapSheetViewModel
 *
 * - timeRange: startTime - endTime (= endTime 未指定なら startTime のみ)
 * - location: sensitiveCategory 定義時は undefined (= privacy 配慮、 List adapter と整合)
 * - meaningText: List CategoryMeaning getNarrative 流用 (= location 込み 5W1H、 fallback getMeaningText)
 * - imageUrl: undefined (= ExternalAnchor に image field なし、 truth ない時 fake 禁止 readiness §3.1)
 */
export function convertExternalAnchorToMapSheet(
  anchor: ExternalAnchor,
): MapSheetViewModel {
  const startTime = normalizeTimeToHHMM(anchor.startTime);
  const endTime =
    anchor.endTime !== undefined ? normalizeTimeToHHMM(anchor.endTime) : undefined;
  const timeRange = endTime !== undefined ? `${startTime}-${endTime}` : startTime;
  const category = resolveCategory(anchor);
  const location =
    anchor.sensitiveCategory === undefined &&
    anchor.locationText !== undefined &&
    anchor.locationText.length > 0
      ? anchor.locationText
      : undefined;
  const meaningText =
    getNarrative(category, startTime, location, anchor.title) ??
    getMeaningText(category, startTime);
  return {
    pinId: anchor.id,
    category,
    timeRange,
    title: anchor.title,
    ...(location !== undefined ? { location } : {}),
    ...(meaningText !== undefined ? { meaningText } : {}),
  };
}
