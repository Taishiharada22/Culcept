/**
 * Location Resolver — 3-Layer Location Resolution for Morning Protocol
 *
 * Phase C-3: ユーザーの現在地をプラン生成に反映する。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 3 レイヤー構成
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Layer 1 — Saved Base（保存基点）
 *   ソース: baseline の prefecture + city → PREFECTURE_COORDS / city-level 座標
 *   特性: プロセス非依存。baseline 完了後は常に利用可能。
 *   用途: Places API の area コンテキスト（「渋谷区周辺」等）
 *         + Routes API の origin フォールバック
 *
 * Layer 2 — Session Origin（今日の起点）
 *   ソース: PlanState.startPoint（ユーザー明示: 「ホテルから」「実家から」等）
 *           + placeResolver で解決された resolvedLat/resolvedLng
 *   特性: セッション内のみ有効。ターンごとに更新される可能性あり。
 *   用途: Routes API の origin（最高精度）
 *
 * Layer 3 — GPS（将来拡張用プレースホルダー）
 *   ソース: ブラウザ Geolocation API
 *   特性: 未実装。インターフェースのみ定義。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 優先順位ルール（CEO方針 C-3 #1）
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 1. Layer 2 explicit: ユーザーが startPlace を明示 → その場所の座標を origin に使う
 *    例: 「ホテルオークラから出発」→ ホテルオークラの resolvedLat/resolvedLng
 *
 * 2. Layer 2 inferred: startPlace なしだが departure + 自宅基点
 *    → Layer 1 の座標を origin に使う（自宅 = baseline 住所）
 *
 * 3. Layer 1 city: baseline の prefecture + city → 市区町村レベル座標
 *    例: 東京都渋谷区 → 渋谷区役所付近の座標
 *
 * 4. Layer 1 prefecture: city 未設定 → 県庁所在地の座標（PREFECTURE_COORDS）
 *    例: 東京都 → 都庁付近 (35.6762, 139.6503)
 *
 * 5. null: baseline 未完了 → 座標なし（Routes API 不使用、ヒューリスティック移動時間）
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 衝突回避ルール（CEO方針 C-3 #2）
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * - startPlace / departureTime はユーザーの明示的な意図。
 *   resolvedLat/resolvedLng はそれを「補助」するだけで、上書きしない。
 *
 * 具体的には:
 * A) startPlace=「ホテル」 → placeResolver が解決 → lat/lng を付加
 *    → PlanState.startPoint は「ホテル」のまま。lat/lng は routing 計算に使用。
 *
 * B) startPlace 未指定 + departureTime=「08:00」 → 自宅（Layer 1）が暗黙の origin
 *    → PlanState.startPoint は設定しない（暗黙の自宅起点）
 *    → Layer 1 座標を routing origin に使用。
 *
 * C) startPlace=「会社から」 → lat/lng 未解決（placeResolver で候補なし）
 *    → startPoint は「会社」のまま。routing は lat/lng なしでヒューリスティック。
 *    → ❌ Layer 1 座標で「勝手に上書き」しない。
 *
 * 要約: resolvedLat/resolvedLng は「enrichment」であり「override」ではない。
 */

import { PREFECTURE_COORDS } from "@/lib/shared/location";
import { getMunicipalityCoords } from "@/lib/shared/municipalityCoords";
import type { PlanState, PlanSegment } from "./planState";
import type { EndpointAnchor } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 座標 */
export interface LatLng {
  lat: number;
  lng: number;
}

/** レイヤー種別 */
export type LocationLayer =
  | "layer2_explicit"    // (1) ユーザー明示の起点（startPlace 解決済み）
  | "current_location"   // (2) CEO方針 2026-04-18 Bug 6+1: 現在地（GPS / 近傍推定）
  | "today_origin"       // (3) CEO方針 2026-04-18 Bug 6+1: セッション確定起点
  | "layer2_inferred"    // (4) 暗黙の自宅起点（departure あり + baseline 住所）
  | "layer1_city"        // (5) baseline 市区町村レベル
  | "layer1_prefecture"  // (6) baseline 都道府県レベル（県庁所在地）
  | "none";              // 位置情報なし

/** 解決結果 */
export interface ResolvedOrigin {
  /** 座標（null = 不明） */
  coords: LatLng | null;
  /** どのレイヤーで解決したか */
  layer: LocationLayer;
  /** 解決に使用した場所ラベル（「渋谷区」「ホテルオークラ」等）— ログ/デバッグ用 */
  sourceLabel: string;
}

/** Baseline から取得した保存基点情報 */
export interface SavedBase {
  prefecture: string;
  city?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 1: Saved Base Resolution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Layer 1 — baseline の prefecture + city から座標を解決する。
 *
 * city が設定されていれば MUNICIPALITY_COORDS で市区町村レベル座標を取得。
 * 未収録の市区町村は PREFECTURE_COORDS（県庁所在地）にフォールバック。
 */
export function resolveLayer1(base: SavedBase | null): ResolvedOrigin {
  if (!base?.prefecture) {
    return { coords: null, layer: "none", sourceLabel: "" };
  }

  const prefCoords = PREFECTURE_COORDS[base.prefecture];
  if (!prefCoords) {
    return { coords: null, layer: "none", sourceLabel: base.prefecture };
  }

  // city → MUNICIPALITY_COORDS で市区町村レベル座標を取得
  if (base.city) {
    const cityCoords = getMunicipalityCoords(base.city);
    if (cityCoords) {
      return {
        coords: { lat: cityCoords.lat, lng: cityCoords.lon },
        layer: "layer1_city",
        sourceLabel: `${base.prefecture}${base.city}`,
      };
    }
    // 未収録の市区町村 → PREFECTURE_COORDS にフォールバック（layer は city）
    return {
      coords: { lat: prefCoords.lat, lng: prefCoords.lon },
      layer: "layer1_city",
      sourceLabel: `${base.prefecture}${base.city}`,
    };
  }

  return {
    coords: { lat: prefCoords.lat, lng: prefCoords.lon },
    layer: "layer1_prefecture",
    sourceLabel: base.prefecture,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 2: Session Origin Resolution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Layer 2 — セッション中の起点を解決する。
 *
 * (A) startPoint が明示されている場合:
 *     → セグメントの resolvedLat/resolvedLng を探す（placeResolver で解決済み）
 *     → 見つかれば layer2_explicit
 *     → 見つからなければ null（ヒューリスティックフォールバック）
 *
 * (B) startPoint 未指定 + departureTime あり:
 *     → 「自宅出発」と推定 → Layer 1 に委任
 *     → layer2_inferred として返す（Layer 1 と区別するため）
 *
 * (C) どちらもなし:
 *     → Layer 2 解決不能 → null
 */
export function resolveLayer2(
  planState: PlanState,
  layer1: ResolvedOrigin,
): ResolvedOrigin | null {
  // (A) startPoint が明示されている
  if (planState.startPoint) {
    // startPoint に対応する解決済み座標を探す
    // → セグメントの中で startPoint と一致する場所の lat/lng を使う
    const startCoords = findStartPointCoords(planState);
    if (startCoords) {
      return {
        coords: startCoords,
        layer: "layer2_explicit",
        sourceLabel: planState.startPoint,
      };
    }
    // startPoint はあるが座標未解決 → null（Layer 1 にフォールバックさせない）
    // 理由: 衝突回避ルール C — Layer 1 で上書きしない
    return null;
  }

  // (B) departureTime がある → 暗黙の自宅出発
  if (planState.departureTime && layer1.coords) {
    return {
      coords: layer1.coords,
      layer: "layer2_inferred",
      sourceLabel: `自宅（${layer1.sourceLabel}）`,
    };
  }

  // (C) Layer 2 解決不能
  return null;
}

/**
 * startPoint に対応する座標を PlanState のセグメントから探す。
 *
 * 方法: startPoint ラベルと resolvedPlaceName / place が一致するセグメントの
 * resolvedLat/resolvedLng を返す。
 *
 * 「ホテルオークラから出発」→ startPoint="ホテルオークラ"
 * → セグメントの中で resolvedPlaceName="ホテルオークラ東京" を発見
 * → その resolvedLat/resolvedLng を返す
 */
function findStartPointCoords(planState: PlanState): LatLng | null {
  if (!planState.startPoint) return null;

  const startLower = planState.startPoint.toLowerCase();

  for (const seg of planState.segments) {
    // resolvedPlaceName との前方一致・部分一致
    if (seg.resolvedLat != null && seg.resolvedLng != null) {
      const resolved = seg.resolvedPlaceName?.toLowerCase() ?? "";
      const place = seg.place?.toLowerCase() ?? "";

      if (
        resolved.includes(startLower) || startLower.includes(resolved) ||
        place.includes(startLower) || startLower.includes(place)
      ) {
        return { lat: seg.resolvedLat, lng: seg.resolvedLng };
      }
    }
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Unified Resolution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * origin を解決する（CEO方針 2026-04-18 Bug 6+1: 4層優先順位）。
 *
 * 優先順位（上から順に、座標が取れたら確定）:
 *   1. explicit startPoint  (layer2_explicit) — 現ターンの明示起点
 *   2. currentLocation       (current_location) — GPS / 近傍推定
 *   3. todayOrigin           (today_origin) — セッション確定起点
 *   4. layer2 inferred       (layer2_inferred) — departureTime + 自宅
 *   5. layer1 city/prefecture — baseline home のみ
 *
 * 衝突回避:
 * - startPoint が明示されているのに座標未解決 → null を返す（Layer 1 で上書きしない）
 *   ※ todayOrigin / currentLocation にはフォールバックせず null を優先。
 *     理由: 現ターンの明示は「意図の宣言」であり、過去の起点で勝手に置き換えない。
 *
 * 衝突例:
 *   「会社から」と言ったが会社座標が辞書になかった → ヒューリスティック移動時間にする
 *   （baseline 座標や過去の todayOrigin で「勝手に上書き」しない）
 */
export function resolveOrigin(
  planState: PlanState,
  savedBase: SavedBase | null,
): ResolvedOrigin {
  const layer1 = resolveLayer1(savedBase);

  // (1) explicit startPoint — 現ターンの明示意図
  if (planState.startPoint) {
    const startCoords = findStartPointCoords(planState);
    if (startCoords) {
      return {
        coords: startCoords,
        layer: "layer2_explicit",
        sourceLabel: planState.startPoint,
      };
    }
    // startPoint ラベルあり・座標なし → 明示意図を尊重して null 返却
    //   currentLocation / todayOrigin / baseline にフォールバックしない（勝手に上書き禁止）
    return {
      coords: null,
      layer: "none",
      sourceLabel: planState.startPoint,
    };
  }

  // (2) currentLocation（GPS or 近傍）— CEO方針 2026-04-18 Bug 6+1
  if (planState.currentLocation?.coords) {
    return {
      coords: planState.currentLocation.coords,
      layer: "current_location",
      sourceLabel: planState.currentLocation.label,
    };
  }

  // (3) todayOrigin（セッション確定起点）— CEO方針 2026-04-18 Bug 6+1
  if (planState.todayOrigin?.coords) {
    return {
      coords: planState.todayOrigin.coords,
      layer: "today_origin",
      sourceLabel: planState.todayOrigin.label,
    };
  }

  // (4) layer2_inferred — departureTime + baseline home（既存挙動）
  if (planState.departureTime && layer1.coords) {
    return {
      coords: layer1.coords,
      layer: "layer2_inferred",
      sourceLabel: `自宅（${layer1.sourceLabel}）`,
    };
  }

  // (5) Layer 1 フォールバック（baseline home のみ）
  return layer1;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Destination Resolution (各セグメントの座標)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * セグメントから destination 座標を取得する。
 *
 * placeResolver が resolvedLat/resolvedLng を付与済みであればそれを使う。
 * なければ null（Routes API 不使用）。
 */
export function getSegmentCoords(segment: PlanSegment): LatLng | null {
  if (segment.resolvedLat != null && segment.resolvedLng != null) {
    return { lat: segment.resolvedLat, lng: segment.resolvedLng };
  }
  return null;
}

/**
 * origin → destination ペアが Routes API に投げられるか判定する。
 *
 * 条件: 両方の座標が存在すること。
 * 片方でも null なら Routes API は使えず、ヒューリスティック移動時間にフォールバック。
 */
export function canUseRoutesApi(
  origin: LatLng | null,
  destination: LatLng | null,
): boolean {
  return origin != null && destination != null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Endpoint Resolution (W2-2 2026-04-19)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Endpoint 解決結果 */
export interface ResolvedEndpoint {
  /** 表示ラベル（travelTimeEngine / gapFillEngine が使う） */
  label: string;
  /** 座標（null = 不明、Routes API 不使用） */
  coords: LatLng | null;
  /** 解決経路（ログ/テスト用） */
  source: "endpoint_anchor_resolved" | "endpoint_anchor_home" | "endpoint_anchor_label_only" | "end_action_home" | "baseline_home" | "none";
}

/**
 * 終点（帰り先）を解決する（CEO方針 2026-04-19 W2-2）。
 *
 * 優先順位（上から順、確定したら返す）:
 *   1. endpointAnchor（ユーザー明示の終点: 「ホテルに戻る」「田中さん家で終わり」）
 *      a. anchor.canonicalId / label が segments で解決済みならその座標
 *      b. anchor.type === "home" なら baseline home
 *      c. それ以外は label だけ（coords=null、ヒューリスティック travel）
 *   2. endAction "帰宅" / endpointType "home" → baseline home
 *   3. 明示的な終点指示なし → baseline home （implicit 帰宅）
 *   4. baseline 未設定 → none
 *
 * CEO ケース2 再発防止: endpointAnchor が parse されているのに使われず、
 *   代わりに startPoint（origin）が returnDestination として流用されていた semantic バグを修正。
 */
export function resolveEndpoint(
  planState: PlanState,
  endpointAnchor: EndpointAnchor | undefined,
  savedBase: SavedBase | null,
): ResolvedEndpoint {
  const layer1 = resolveLayer1(savedBase);

  // (1) 明示的 endpointAnchor
  if (endpointAnchor) {
    // (1a) anchor が segments で既に解決済みか確認
    const anchorCoords = findEndpointAnchorCoords(planState, endpointAnchor);
    if (anchorCoords) {
      return {
        label: endpointAnchor.label,
        coords: anchorCoords,
        source: "endpoint_anchor_resolved",
      };
    }
    // (1b) home 型 → baseline にフォールバック
    if (endpointAnchor.type === "home" && layer1.coords) {
      return {
        label: endpointAnchor.label || "自宅",
        coords: layer1.coords,
        source: "endpoint_anchor_home",
      };
    }
    // (1c) label だけ保持（coords 不明）
    return {
      label: endpointAnchor.label,
      coords: null,
      source: "endpoint_anchor_label_only",
    };
  }

  // (2) endAction "帰宅" / endpointType "home"
  if (planState.endAction === "帰宅" || planState.endpointType === "home") {
    if (layer1.coords) {
      return {
        label: "自宅",
        coords: layer1.coords,
        source: "end_action_home",
      };
    }
  }

  // (3) 明示なし → implicit 帰宅（baseline home）
  if (layer1.coords) {
    return {
      label: "自宅",
      coords: layer1.coords,
      source: "baseline_home",
    };
  }

  // (4) baseline 未設定 → 解決不能
  return { label: "自宅", coords: null, source: "none" };
}

/**
 * endpointAnchor に対応する座標を PlanState.segments から探す。
 *
 * マッチングは findStartPointCoords と同じく「ラベル部分一致 + resolvedPlaceName 部分一致」。
 * canonicalId があれば placeCanonical との一致も試みる。
 */
function findEndpointAnchorCoords(
  planState: PlanState,
  endpoint: EndpointAnchor,
): LatLng | null {
  const label = endpoint.label?.toLowerCase() ?? "";
  const canonical = endpoint.canonicalId?.toLowerCase() ?? "";
  if (!label && !canonical) return null;

  for (const seg of planState.segments) {
    if (seg.resolvedLat == null || seg.resolvedLng == null) continue;

    if (canonical) {
      const placeCanon = seg.placeCanonical?.toLowerCase() ?? "";
      if (placeCanon && (placeCanon === canonical || placeCanon.includes(canonical) || canonical.includes(placeCanon))) {
        return { lat: seg.resolvedLat, lng: seg.resolvedLng };
      }
    }

    if (label) {
      const resolvedName = seg.resolvedPlaceName?.toLowerCase() ?? "";
      const place = seg.place?.toLowerCase() ?? "";
      if (
        (resolvedName && (resolvedName.includes(label) || label.includes(resolvedName))) ||
        (place && (place.includes(label) || label.includes(place)))
      ) {
        return { lat: seg.resolvedLat, lng: seg.resolvedLng };
      }
    }
  }

  return null;
}

/**
 * coarse area を解決する（Places API の検索コンテキスト用）。
 *
 * 優先順位:
 * 1. city が設定されていれば「市区町村, 都道府県」
 * 2. prefecture のみなら「都道府県」
 * 3. なし → undefined
 */
export function resolveCoarseArea(savedBase: SavedBase | null): string | undefined {
  if (!savedBase?.prefecture) return undefined;
  if (savedBase.city) return `${savedBase.city}, ${savedBase.prefecture}`;
  return savedBase.prefecture;
}
