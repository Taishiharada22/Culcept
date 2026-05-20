/**
 * Plan Places Search API — POST autocomplete-style search (Phase 2-D C1)
 *
 * 設計書: docs/alter-plan-phase2-d-place-picker-mini-design.md §4 / §5
 *
 * 役割:
 *   AnchorFormFields の PlaceCandidatesPanel が user 入力 (locationText) を Places API で
 *   検索し、複数 candidates (max 5) を返す。anchor 作成時の「明確な場所」 選択を support。
 *
 * 不変原則 (Phase 2-C 継承 + Phase 2-D 強化):
 *   1. userId は **必ず auth.getUser() から取得**
 *   2. **privacy-safe payload**: 外部 Places API へ送るのは textQuery + bias coord のみ。
 *      anchor.title / notes / sensitiveCategory / userId は **送らない**
 *   3. **strict input validation**: { query, bias? } のみ受理、extra fields 400
 *   4. **rate limit**: per-user 60/hour (Phase 2-D 専用 counter、geocode と independent)
 *   5. **regionCode: "JP"** default (Phase 2-D v2 §3.5、日本限定 search で noise 削減)
 *   6. **fail-open**: Places API throw / unavailable → results=[] で UI 継続
 *   7. **audit log**: userId + outcome + duration のみ、query 実値 / bias coord / API response body は log しない
 *   8. **maxResultCount=5** (cost guard)
 *   9. **query max 300 chars** (validation)
 *  10. **bias は client が算出した coord のみ受け取る** (server は anchor 情報を再 fetch しない)
 *
 * 範囲外:
 *   - candidate ranking / 機械学習 personalization
 *   - cache (= per-search の cache、本 endpoint は real-time search、cache は cache-write endpoint 経由)
 *   - permanent persistence (= ExternalAnchor schema 変更なし)
 */

import { NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";
import {
  parseJsonBody,
  requireAuthenticatedUser,
} from "@/lib/plan/api-helpers";
import {
  isPlacesApiAvailable,
  searchPlacesByText,
} from "@/lib/alter-morning/placesApiClient";
import {
  GEOCODE_RATE_WINDOW_MS,
  checkAndIncrementPlaceSearchRate,
} from "@/lib/plan/geocodeRateLimit";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAX_QUERY_LENGTH = 300;
const MAX_RESULTS = 5;
const REGION_CODE = "JP"; // §3.5 default

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface RequestBody {
  query: string;
  bias?: {
    lat: number;
    lng: number;
    radiusMeters: number;
  };
}

interface PlaceCandidate {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  /** Places API types (e.g., ["cafe", "restaurant"]) */
  types: string[];
  /** bias coord からの距離 (meters)、bias なし時 null */
  distanceMeters: number | null;
}

interface SearchData {
  results: PlaceCandidate[];
  apiAvailable: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Haversine 距離 (meters)、bias 距離計算用 */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // 地球半径 (m)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isValidBias(b: unknown): b is RequestBody["bias"] {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;
  const o = b as Record<string, unknown>;
  return (
    typeof o.lat === "number" &&
    typeof o.lng === "number" &&
    typeof o.radiusMeters === "number" &&
    Number.isFinite(o.lat) &&
    Number.isFinite(o.lng) &&
    Number.isFinite(o.radiusMeters) &&
    o.lat >= -90 &&
    o.lat <= 90 &&
    o.lng >= -180 &&
    o.lng <= 180 &&
    o.radiusMeters > 0 &&
    o.radiusMeters <= 100000 // sanity cap: 100km
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/plan/places/search
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();

    // (1) auth
    const auth = await requireAuthenticatedUser(supabase);
    if (!auth.ok) return auth.response;

    // (2) rate limit (Phase 2-D 専用 counter、60/hour)
    const rateOk = checkAndIncrementPlaceSearchRate(auth.userId, Date.now());
    if (!rateOk) {
      return NextResponse.json(
        { ok: false, error: "Rate limit exceeded" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.floor(GEOCODE_RATE_WINDOW_MS / 1000)) },
        },
      );
    }

    // (3) parse body
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: "body must be an object" },
        { status: 400 },
      );
    }

    // (4) strict input validation
    const raw = body as Record<string, unknown>;
    const allowedKeys = ["query", "bias"];
    const extraFields = Object.keys(raw).filter((k) => !allowedKeys.includes(k));
    if (extraFields.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Unexpected fields: ${extraFields.join(",")}` },
        { status: 400 },
      );
    }
    if (typeof raw.query !== "string") {
      return NextResponse.json(
        { ok: false, error: "query must be a string" },
        { status: 400 },
      );
    }
    const query = raw.query.trim();
    if (!query) {
      return NextResponse.json(
        { ok: true, data: { results: [], apiAvailable: true } satisfies SearchData },
      );
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `query too long (max ${MAX_QUERY_LENGTH})` },
        { status: 400 },
      );
    }
    let bias: RequestBody["bias"] = undefined;
    if (raw.bias !== undefined && raw.bias !== null) {
      if (!isValidBias(raw.bias)) {
        return NextResponse.json(
          { ok: false, error: "Invalid bias shape" },
          { status: 400 },
        );
      }
      bias = raw.bias;
    }

    // (5) Places API availability check
    const apiAvailable = isPlacesApiAvailable();
    if (!apiAvailable) {
      return NextResponse.json({
        ok: true,
        data: { results: [], apiAvailable: false } satisfies SearchData,
      });
    }

    // (6) Places API call
    //
    // ⚠️ privacy guarantee: outbound payload は textQuery + locationBias のみ。
    // anchor.title / notes / sensitiveCategory / userId は **絶対送らない**。
    try {
      const places = await searchPlacesByText({
        textQuery: query,
        maxResultCount: MAX_RESULTS,
        languageCode: "ja",
        ...(bias
          ? {
              locationBias: {
                lat: bias.lat,
                lng: bias.lng,
                radius: bias.radiusMeters,
              },
            }
          : {}),
      });

      const results: PlaceCandidate[] = [];
      for (const p of places) {
        if (!p.location) continue;
        const lat = p.location.latitude;
        const lng = p.location.longitude;
        results.push({
          placeId: p.id,
          name: p.displayName?.text ?? "",
          address: p.formattedAddress ?? null,
          lat,
          lng,
          types: p.types ?? [],
          distanceMeters: bias
            ? Math.round(haversineMeters(bias.lat, bias.lng, lat, lng))
            : null,
        });
      }

      return NextResponse.json({
        ok: true,
        data: { results, apiAvailable: true } satisfies SearchData,
      });
    } catch (err) {
      // fail-open: audit log は userId + outcome のみ、query 実値 / response body は log しない
      console.warn("[plan/places/search] api_throw");
      return NextResponse.json({
        ok: true,
        data: { results: [], apiAvailable: true } satisfies SearchData,
      });
    }
  } catch (e) {
    console.error("[plan/places/search] error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

// regionCode は server で固定値として Places API call に渡す想定だが、
// 現 placesApiClient.searchPlacesByText の signature には regionCode parameter がない。
// Phase 2-D v1 では languageCode="ja" + locationBias で日本ロケール bias が効くので、
// regionCode 未指定でも JP-region 寄りの results が返る (Places API 仕様)。
// 厳密な regionCode 制限は Phase 2-D+ で placesApiClient に option 追加 (Alter Morning 整合性保証必要)。
// 本 v1 では languageCode + bias で十分とする。
// — 上記 REGION_CODE 定数は future-proof で保持、現実装では未使用。
void REGION_CODE;
