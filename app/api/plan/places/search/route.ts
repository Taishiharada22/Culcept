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
import { buildPlaceSearchQuery } from "@/lib/plan/placeSearchQueryBuilder";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAX_QUERY_LENGTH = 300;
const MAX_RESULTS = 5;
const REGION_CODE = "JP"; // §3.5 default

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface RequestBody {
  query: string;
  /**
   * Phase 2-H: 予定名 (= anchor.title) optional 受取。
   * server 側で `buildPlaceSearchQuery` 経由で combine し、 Places API には combine 結果のみ送信。
   * Privacy: title は **textQuery として combine 後送信**、独立 field では送らない。
   */
  title?: string;
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
    // Phase 2-H: "title" を allowedKeys に追加 (optional、欠落でも 200)
    const allowedKeys = ["query", "bias", "title"];
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
    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `query too long (max ${MAX_QUERY_LENGTH})` },
        { status: 400 },
      );
    }
    // Phase 2-H: title optional 受取 (= 早期 empty return より前に parse、
    // intent_only ケース (query 空 + title あり) も後段 buildPlaceSearchQuery で処理するため)
    let title = "";
    if (raw.title !== undefined && raw.title !== null) {
      if (typeof raw.title !== "string") {
        return NextResponse.json(
          { ok: false, error: "title must be a string" },
          { status: 400 },
        );
      }
      if (raw.title.length > MAX_QUERY_LENGTH) {
        return NextResponse.json(
          { ok: false, error: `title too long (max ${MAX_QUERY_LENGTH})` },
          { status: 400 },
        );
      }
      title = raw.title;
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

    /*
     * Phase 2-H: 予定意図ベースの textQuery 構築 (= mini design §6)
     *
     * Client から受け取った { query (= locationText), title } を pure helper で combine。
     * 4 階層 IntentType:
     *   - explicit_place   → textQuery = query (= locationText、 既存 Phase 2-D 挙動)
     *   - intent_with_area → textQuery = `${query} ${title}` (例: "新宿 ショッピング")
     *   - intent_only      → textQuery = title (= bias で area 補正)
     *   - ambiguous        → textQuery = "" (= panel 側で非表示判定、 server は早期 200 + empty)
     *
     * Privacy: anchor metadata は組み込まない、 textQuery 文字列のみ送信。
     */
    const queryPlan = buildPlaceSearchQuery({ title, locationText: query });
    if (!queryPlan.textQuery) {
      // ambiguous → empty results、 graceful (= 既存 empty query 同様の 200 応答)
      return NextResponse.json(
        { ok: true, data: { results: [], apiAvailable: true } satisfies SearchData },
      );
    }
    const finalTextQuery = queryPlan.textQuery;

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
    // Phase 2-H: textQuery は buildPlaceSearchQuery で title + locationText を combine 後の文字列のみ。
    try {
      const places = await searchPlacesByText({
        textQuery: finalTextQuery,
        maxResultCount: MAX_RESULTS,
        languageCode: "ja",
        regionCode: REGION_CODE, // ★日本固定（bias 無し時に US 既定へ落ちるのを防ぐ・§3.5）
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

// regionCode = "JP" を Places API call に固定で渡す（searchPlacesByText の regionCode option 経由）。
// languageCode="ja" は結果の言語のみで地域は制限しないため、bias（居住地座標）が無い環境では
// サーバ IP（Vercel US）依存で US の場所が返っていた。regionCode="JP" でこれを構造的に防ぐ。
// bias がある時はさらに居住地付近へ偏重（locationBias）。両者は併存。
