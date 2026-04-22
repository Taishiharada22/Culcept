/**
 * Places Handoff — PR-9 W3-PR-8 rev 3 接続層（commit 3）
 *
 * 位置づけ:
 *   SearchQueryDraft が readyForHandoff（anchor + chain/category）に達した時点で、
 *   Places Text Search を走らせ NormalizedPlaceCandidate[] を返す **薄い adapter**。
 *
 * 設計原則（CEO 2026-04-23 directive）:
 *   1. 薄い wrapper に徹する — 新しい巨大 resolver にしない
 *   2. candidate source は places_api のみ（web_search 等は絶対に混ぜない）
 *   3. NormalizedPlaceCandidate[] を直接返す — 多層候補統合を挟まない
 *   4. 0件 / provider error の返し方を **commit 3 単体で固定**
 *   5. reducer / route / UI を汚さない（この file は import しか持ち込まない）
 *
 * 返却 3 系統（discriminated union kind）:
 *   - success:         候補 1 件以上
 *   - zero:            API は正常応答したが候補 0 件（= S9 E パターン trigger 元）
 *   - provider_error:  API key 未設定 / draft not ready / API throw
 *
 * queryFingerprint:
 *   - (anchor, chain, category) から deterministic に生成
 *   - reducer 側で activePresentation.queryFingerprint に保存
 *   - SELECTED 時の整合性検証（stale selection reject）で使用
 *
 * 非責務（commit 3 では扱わない）:
 *   - reducer への dispatch（route 側で SEARCH_CANDIDATES_PRESENTED を dispatch）
 *   - L1/L2 cache 読み取り（legacy resolver の single-entry cache は多候補返却に非対応）
 *   - UI 表示
 *   - user 選択 → event.where.coordinates 注入（commit 5 以降）
 *   - locationBias の anchor 座標解決（anchor dict 参照は呼び元責務）
 *
 * 将来拡張時の制約:
 *   - multi-candidate cache を追加する場合、source="web_search" エントリは必ず除外
 *   - 本 file の I/F は **queryFingerprint を返す 3-kind discriminated union** で固定
 */

import type { SearchQueryDraft } from "../dialog/types";
import {
  isPlacesApiAvailable,
  searchPlacesByText,
  type PlacesApiPlace,
  type TextSearchOptions,
} from "../placesApiClient";
import type {
  GeoCoordinates,
  NormalizedPlaceCandidate,
} from "./normalizedPlace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Result types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ProviderErrorReason =
  /** GOOGLE_MAPS_API_KEY 未設定 */
  | "api_key_missing"
  /** draft が readyForHandoff=false、または anchor+subject の query を組み立てられない */
  | "draft_not_ready"
  /** Places API 呼び出しが throw（HTTP error / network / timeout） */
  | "api_throw";

/**
 * 内部ログ分類（CEO 2026-04-23 GPT review 指摘）:
 *   - draft_not_ready は呼び元（route / reducer）の invariant 不整合であり、
 *     外部 provider 起因の障害ではない。内部ログ / alerting を分けるため
 *     callsite はこの helper でタグ付けする。
 *   - user-facing の result.kind は "provider_error" で共通のまま。
 */
export type ProviderErrorLogClass =
  | "route_invariant_mismatch" // draft_not_ready — 上流 bug
  | "provider_failure"; //         api_key_missing / api_throw — 外部要因

export function classifyProviderErrorForLog(
  reason: ProviderErrorReason,
): ProviderErrorLogClass {
  return reason === "draft_not_ready"
    ? "route_invariant_mismatch"
    : "provider_failure";
}

export type PlacesHandoffResult =
  | {
      kind: "success";
      queryFingerprint: string;
      candidates: ReadonlyArray<NormalizedPlaceCandidate>;
    }
  | {
      kind: "zero";
      queryFingerprint: string;
    }
  | {
      kind: "provider_error";
      queryFingerprint: string;
      reason: ProviderErrorReason;
    };

export interface PlacesHandoffInput {
  draft: SearchQueryDraft;
  /** anchor 座標（anchor dict 解決後）。供給されると locationBias + distanceFromAnchor 計算に使用 */
  anchorCoords?: GeoCoordinates;
  /** locationBias の半径（m）。default 3000 */
  anchorBiasRadiusMeters?: number;
  /** Places API maxResultCount。default 5（Basic tier のコスト最小化） */
  maxResultCount?: number;
}

/**
 * deps 注入 — テスト seam。
 * production 呼び出しでは undefined を渡し、module 直の placesApiClient を使う。
 */
export interface PlacesHandoffDeps {
  searchPlacesByText?: typeof searchPlacesByText;
  isPlacesApiAvailable?: typeof isPlacesApiAvailable;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Query fingerprint
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * deterministic fingerprint — (anchor, chain, category) の正規化結合。
 *
 * 規則:
 *   - trim + toLowerCase + 空欄は "-" で固定化
 *   - prefix "pf:v1|" で将来のアルゴリズム変更時に migration 可
 *   - readyForHandoff 状態に非依存（draft_not_ready error でも一意に FP を返す）
 */
export function buildQueryFingerprint(draft: SearchQueryDraft): string {
  const a = normalizeToken(draft.anchorRegion);
  const ch = normalizeToken(draft.chainToken);
  const cat = normalizeToken(draft.categoryToken);
  return `pf:v1|a=${a}|ch=${ch}|cat=${cat}`;
}

function normalizeToken(raw: string | null | undefined): string {
  if (raw == null) return "-";
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : "-";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Query text builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * SearchQueryDraft → Places API 向け textQuery。
 *
 * 規則:
 *   - anchor 必須（なければ null）
 *   - chain を優先（より specific）。chain があれば category は落とす
 *   - "anchor subject" 半角空白連結
 *
 * 例:
 *   { anchor:"甲府", chain:"スタバ", category:null }        → "甲府 スタバ"
 *   { anchor:"甲府", chain:null,      category:"カフェ" }   → "甲府 カフェ"
 *   { anchor:null,  chain:"スタバ",  category:null }        → null  （draft_not_ready）
 */
function buildTextQuery(draft: SearchQueryDraft): string | null {
  const anchor = draft.anchorRegion?.trim();
  if (!anchor) return null;
  const chain = draft.chainToken?.trim();
  const category = draft.categoryToken?.trim();
  const subject = chain && chain.length > 0 ? chain : category ?? "";
  if (!subject || subject.length === 0) return null;
  return `${anchor} ${subject}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Normalization — PlacesApiPlace → NormalizedPlaceCandidate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function normalizePlacesApiPlace(
  p: PlacesApiPlace,
  draft: SearchQueryDraft,
  anchorCoords: GeoCoordinates | undefined,
): NormalizedPlaceCandidate | null {
  if (!p.id || p.id.length === 0) return null;
  if (!p.displayName?.text) return null;
  if (!p.location) return null;

  const { latitude, longitude } = p.location;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  // CLOSED_PERMANENTLY は候補から除外（OPERATIONAL / CLOSED_TEMPORARILY は残す）
  if (p.businessStatus === "CLOSED_PERMANENTLY") return null;

  const coordinates: GeoCoordinates = { lat: latitude, lng: longitude };
  const distance = anchorCoords
    ? haversineMeters(anchorCoords, coordinates)
    : null;

  const address =
    p.shortFormattedAddress?.trim() ||
    p.formattedAddress?.trim() ||
    "";

  return {
    placeId: p.id,
    displayName: p.displayName.text,
    address,
    coordinates,
    distanceFromAnchor: distance,
    category: pickPrimaryCategory(p.types),
    chainToken: draft.chainToken ?? null,
    rawRef: { provider: "google_places", placeId: p.id },
  };
}

function pickPrimaryCategory(types: readonly string[] | undefined): string | null {
  if (!types || types.length === 0) return null;
  return types[0] ?? null;
}

function haversineMeters(a: GeoCoordinates, b: GeoCoordinates): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dPhi = toRad(b.lat - a.lat);
  const dLambda = toRad(b.lng - a.lng);
  const sinDPhi = Math.sin(dPhi / 2);
  const sinDLambda = Math.sin(dLambda / 2);
  const h =
    sinDPhi * sinDPhi +
    Math.cos(phi1) * Math.cos(phi2) * sinDLambda * sinDLambda;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Execute
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_BIAS_RADIUS = 3000;

/**
 * SearchQueryDraft から Places Text Search を実行し、正規化候補を返す。
 *
 * @param input draft + optional anchor coords
 * @param deps  テスト用 seam（production は undefined）
 */
export async function executePlacesHandoff(
  input: PlacesHandoffInput,
  deps?: PlacesHandoffDeps,
): Promise<PlacesHandoffResult> {
  const { draft, anchorCoords } = input;
  const queryFingerprint = buildQueryFingerprint(draft);

  if (!draft.readyForHandoff) {
    return {
      kind: "provider_error",
      queryFingerprint,
      reason: "draft_not_ready",
    };
  }

  const textQuery = buildTextQuery(draft);
  if (!textQuery) {
    return {
      kind: "provider_error",
      queryFingerprint,
      reason: "draft_not_ready",
    };
  }

  const availableFn = deps?.isPlacesApiAvailable ?? isPlacesApiAvailable;
  if (!availableFn()) {
    return {
      kind: "provider_error",
      queryFingerprint,
      reason: "api_key_missing",
    };
  }

  const searchFn = deps?.searchPlacesByText ?? searchPlacesByText;

  const searchOptions: TextSearchOptions = {
    textQuery,
    maxResultCount: input.maxResultCount ?? DEFAULT_MAX_RESULTS,
  };
  if (anchorCoords) {
    searchOptions.locationBias = {
      lat: anchorCoords.lat,
      lng: anchorCoords.lng,
      radius: input.anchorBiasRadiusMeters ?? DEFAULT_BIAS_RADIUS,
    };
  }

  let places: PlacesApiPlace[];
  try {
    places = await searchFn(searchOptions);
  } catch {
    return {
      kind: "provider_error",
      queryFingerprint,
      reason: "api_throw",
    };
  }

  const candidates: NormalizedPlaceCandidate[] = [];
  for (const p of places) {
    const normalized = normalizePlacesApiPlace(p, draft, anchorCoords);
    if (normalized !== null) candidates.push(normalized);
  }

  if (candidates.length === 0) {
    return { kind: "zero", queryFingerprint };
  }

  return { kind: "success", queryFingerprint, candidates };
}
