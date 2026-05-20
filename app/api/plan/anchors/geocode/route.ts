/**
 * Plan Anchors Geocode API — POST batch resolve (Phase 2-C v3、C1)
 *
 * 設計書: docs/alter-plan-phase2-c-map-tab-mini-design.md §5.2
 *
 * 役割:
 *   - Plan MapTab が anchor.locationText → { lat, lng } を batch 解決するための endpoint
 *   - 既存 Alter Morning 資産 (placeResolver + placesApiClient) を call signature 経由で流用
 *   - 新 env / 新 migration / 新 dep すべて 0
 *
 * 不変原則:
 *   1. userId は **必ず auth.getUser() から取得**。request body の userId は無視
 *   2. **privacy-safe payload**: 外部 API (Google Places) へ送信するのは textQuery (= locationText) のみ
 *      anchor.title / notes / sensitiveCategory / userId / 会話履歴 等は **一切送信しない**
 *   3. **sensitive anchor 外部送信禁止**: anchor.sensitiveCategory が設定済の anchor は
 *      Places API を呼ばず unresolved 扱い (semantic fallback) で client に返す
 *   4. **ownership check**: auth user が所有する anchor のみ resolve、他 user は silently 除外
 *   5. **input strict validation**: { items: [{ anchorId, locationText }] } のみ受理、extra fields は 400
 *   6. **rate limit**: per-user 100 calls / hour (§5.2)、超過は 429 + Retry-After
 *   7. **dedupe**: normalize 後の同 locationText を持つ N anchor は 1 Places API call で全て解決
 *   8. **fail-open**: API throw / network error / API unavailable は null を返す (client が semantic fallback に回す)
 *   9. **audit log policy**: anchorId + outcome + duration のみ、locationText 実値 / API response body は log しない
 *
 * 範囲外:
 *   - lat/lng 永続化 (ExternalAnchor schema 変更、別 wave)
 *   - confidence の細分化 (Plan は "medium" 固定、Alter Morning resolver の "low" は unresolved 扱い)
 *   - W1-6 / DraftPlan / CoAlter / Mirror 関連
 *   - service_role の使用
 */

import { NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";
import {
  parseJsonBody,
  requireAuthenticatedUser,
} from "@/lib/plan/api-helpers";
import {
  getCachedResolution,
  setCachedResolution,
} from "@/lib/alter-morning/placeResolver";
import {
  isPlacesApiAvailable,
  searchPlacesByText,
} from "@/lib/alter-morning/placesApiClient";
import {
  GEOCODE_RATE_WINDOW_MS,
  checkAndIncrementGeocodeRate,
} from "@/lib/plan/geocodeRateLimit";
import {
  confidenceAtLeastMedium,
  normalizeLocationText,
} from "@/app/(culcept)/plan/tabs/_helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAX_ITEMS_PER_REQUEST = 50;
const MAX_LOCATION_TEXT_LENGTH = 300;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface RequestItem {
  anchorId: string;
  locationText: string;
}

interface Resolution {
  lat: number;
  lng: number;
  confidence: string;
  resolvedName: string;
}

/**
 * 各 anchor の unresolved 理由 (audit / smoke 観測用、client 表示には使わない)
 *
 * - `resolved_cache`         : L1/L2 cache hit (medium 以上 confidence)
 * - `resolved_api`           : Places API 経由で解決済 (confidence=medium 書き込み)
 * - `unresolved_empty`       : locationText 空 or 300 文字超え
 * - `unresolved_sensitive`   : sensitiveCategory 設定済、外部送信スキップ
 * - `unresolved_not_owned`   : auth user 所有外 anchor
 * - `unresolved_low_confidence` : cache hit したが confidence<medium (誤 pin 回避)
 * - `unresolved_api_unavailable`: server 側 GOOGLE_MAPS_API_KEY 未設定
 * - `unresolved_api_throw`   : Places API throw / network error / location なし
 */
type UnresolvedReason =
  | "unresolved_empty"
  | "unresolved_sensitive"
  | "unresolved_not_owned"
  | "unresolved_low_confidence"
  | "unresolved_api_unavailable"
  | "unresolved_api_throw";

interface ResultEntry {
  anchorId: string;
  resolution: Resolution | null;
  reason: "resolved_cache" | "resolved_api" | UnresolvedReason;
}

interface BatchGeocodeData {
  results: ResultEntry[];
  apiAvailable: boolean;
}

interface DedupeGroup {
  normalized: string;
  /** group 内の代表 item (Places API には sample.locationText.trim() を送る) */
  sample: RequestItem;
  items: RequestItem[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/plan/anchors/geocode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();

    // ── (1) auth gate ──
    const auth = await requireAuthenticatedUser(supabase);
    if (!auth.ok) return auth.response;

    // ── (2) rate limit (per-user, process-local in-memory) ──
    const rateOk = checkAndIncrementGeocodeRate(auth.userId, Date.now());
    if (!rateOk) {
      return NextResponse.json(
        { ok: false, error: "Rate limit exceeded" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.floor(GEOCODE_RATE_WINDOW_MS / 1000)) },
        },
      );
    }

    // ── (3) body parse ──
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: "body must be an object" },
        { status: 400 },
      );
    }

    // ── (4) strict input validation (extra fields reject) ──
    const raw = body as Record<string, unknown>;
    const extraRootFields = Object.keys(raw).filter((k) => k !== "items");
    if (extraRootFields.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Unexpected fields: ${extraRootFields.join(",")}` },
        { status: 400 },
      );
    }
    if (!Array.isArray(raw.items)) {
      return NextResponse.json(
        { ok: false, error: "items must be an array" },
        { status: 400 },
      );
    }
    if (raw.items.length > MAX_ITEMS_PER_REQUEST) {
      return NextResponse.json(
        { ok: false, error: `Max ${MAX_ITEMS_PER_REQUEST} items per request` },
        { status: 400 },
      );
    }

    const items: RequestItem[] = [];
    for (const it of raw.items) {
      if (!it || typeof it !== "object" || Array.isArray(it)) {
        return NextResponse.json(
          { ok: false, error: "Invalid item" },
          { status: 400 },
        );
      }
      const obj = it as Record<string, unknown>;
      const itemExtra = Object.keys(obj).filter(
        (k) => k !== "anchorId" && k !== "locationText",
      );
      if (itemExtra.length > 0) {
        return NextResponse.json(
          { ok: false, error: `Item has unexpected fields: ${itemExtra.join(",")}` },
          { status: 400 },
        );
      }
      if (
        typeof obj.anchorId !== "string" ||
        typeof obj.locationText !== "string"
      ) {
        return NextResponse.json(
          { ok: false, error: "Invalid item shape" },
          { status: 400 },
        );
      }
      items.push({ anchorId: obj.anchorId, locationText: obj.locationText });
    }

    // ── (5) anchor ownership + sensitive check ──
    // RLS-respecting query (二重防御: .eq("user_id", userId) + RLS Policy)
    // sensitive_category は外部送信スキップ判定に使う
    const anchorIds = items.map((i) => i.anchorId);
    const ownedSet = new Set<string>();
    const sensitiveSet = new Set<string>();
    if (anchorIds.length > 0) {
      const ownership = await supabase
        .from("external_anchors")
        .select("id, sensitive_category")
        .in("id", anchorIds)
        .eq("user_id", auth.userId);
      const rows = (ownership.data ?? []) as Array<{
        id: string;
        sensitive_category: string | null;
      }>;
      for (const row of rows) {
        ownedSet.add(row.id);
        if (row.sensitive_category) sensitiveSet.add(row.id);
      }
    }

    // ── (6) prepare for processing: filter + dedupe ──
    const apiAvailable = isPlacesApiAvailable();
    const results: ResultEntry[] = [];
    const groups = new Map<string, DedupeGroup>();

    for (const item of items) {
      // ownership check
      if (!ownedSet.has(item.anchorId)) {
        results.push({
          anchorId: item.anchorId,
          resolution: null,
          reason: "unresolved_not_owned",
        });
        continue;
      }
      // sensitive check (Plan 哲学整合: sensitive は外部送信せず unresolved 扱い)
      if (sensitiveSet.has(item.anchorId)) {
        results.push({
          anchorId: item.anchorId,
          resolution: null,
          reason: "unresolved_sensitive",
        });
        continue;
      }
      // empty / too long locationText
      const text = (item.locationText ?? "").trim();
      if (!text || text.length > MAX_LOCATION_TEXT_LENGTH) {
        results.push({
          anchorId: item.anchorId,
          resolution: null,
          reason: "unresolved_empty",
        });
        continue;
      }
      // dedupe by normalized text
      const normalized = normalizeLocationText(text);
      let group = groups.get(normalized);
      if (!group) {
        group = {
          normalized,
          sample: { anchorId: item.anchorId, locationText: text },
          items: [],
        };
        groups.set(normalized, group);
      }
      group.items.push(item);
    }

    // ── (7) resolve each group (cache-first, then Places API) ──
    for (const group of groups.values()) {
      const userText = group.sample.locationText;

      // (7a) L1 + L2 cache lookup (area=undefined: Plan は user-area context を渡さない、§5.3)
      let cached: Awaited<ReturnType<typeof getCachedResolution>> = null;
      try {
        cached = await getCachedResolution(auth.userId, userText, undefined);
      } catch (err) {
        // cache 読み取り失敗は fail-open (cache=null として扱う)
        console.warn(
          "[plan/geocode] cache_read_throw",
          group.items.map((i) => i.anchorId).join(","),
        );
        cached = null;
      }

      if (
        cached &&
        cached.lat !== undefined &&
        cached.lng !== undefined &&
        confidenceAtLeastMedium(cached.confidence)
      ) {
        for (const it of group.items) {
          results.push({
            anchorId: it.anchorId,
            resolution: {
              lat: cached.lat,
              lng: cached.lng,
              confidence: cached.confidence,
              resolvedName: cached.resolvedName,
            },
            reason: "resolved_cache",
          });
        }
        continue;
      }

      // (7b) cache hit but low confidence → unresolved (誤 pin 回避、§0.5.2 強化 5)
      if (
        cached &&
        cached.lat !== undefined &&
        cached.lng !== undefined &&
        !confidenceAtLeastMedium(cached.confidence)
      ) {
        for (const it of group.items) {
          results.push({
            anchorId: it.anchorId,
            resolution: null,
            reason: "unresolved_low_confidence",
          });
        }
        continue;
      }

      // (7c) cache miss → Places API (or fail-open)
      if (!apiAvailable) {
        for (const it of group.items) {
          results.push({
            anchorId: it.anchorId,
            resolution: null,
            reason: "unresolved_api_unavailable",
          });
        }
        continue;
      }

      try {
        // ⚠️ privacy guarantee: outbound payload は textQuery のみ
        // anchor.title / notes / sensitiveCategory / userId 等は **絶対送らない**
        const places = await searchPlacesByText({
          textQuery: userText,
          maxResultCount: 1,
          languageCode: "ja",
        });
        const top = places[0];
        if (!top || !top.location) {
          for (const it of group.items) {
            results.push({
              anchorId: it.anchorId,
              resolution: null,
              reason: "unresolved_api_throw",
            });
          }
          continue;
        }
        const { latitude, longitude } = top.location;

        // (7d) cache write (Plan は confidence="medium" 固定、L2 は fire-and-forget 内部実装)
        // setCachedResolution(userId, placeText, area, resolution: PlaceResolution, placeType?)
        //   - placeType を渡すと L2 (Supabase) にも永続化される
        //   - Plan は generic な anchor location なので placeType="generic_place" を採用
        //   - source="places_api" にして L2 write 条件を満たす
        try {
          const candidate = {
            name: top.displayName?.text ?? userText,
            ...(top.formattedAddress !== undefined
              ? { address: top.formattedAddress }
              : {}),
            placeId: top.id,
            lat: latitude,
            lng: longitude,
            source: "places_api" as const,
            matchScore: 1.0,
          };
          await setCachedResolution(
            auth.userId,
            userText,
            undefined,
            {
              originalText: userText,
              candidates: [candidate],
              bestCandidate: candidate,
              confidence: "medium",
              reason: "plan_geocode_resolved",
            },
            "generic_place",
          );
        } catch (err) {
          // cache 書き込み失敗は fail-open (解決結果は client に返す)
          console.warn(
            "[plan/geocode] cache_write_throw",
            group.items.map((i) => i.anchorId).join(","),
          );
        }

        for (const it of group.items) {
          results.push({
            anchorId: it.anchorId,
            resolution: {
              lat: latitude,
              lng: longitude,
              confidence: "medium",
              resolvedName: top.displayName?.text ?? userText,
            },
            reason: "resolved_api",
          });
        }
      } catch (err) {
        // ⚠️ audit log policy: anchorId + outcome のみ
        // locationText 実値 / Places API response body は log に出さない (privacy)
        console.warn(
          "[plan/geocode] api_throw",
          group.items.map((i) => i.anchorId).join(","),
        );
        for (const it of group.items) {
          results.push({
            anchorId: it.anchorId,
            resolution: null,
            reason: "unresolved_api_throw",
          });
        }
      }
    }

    const data: BatchGeocodeData = { results, apiAvailable };
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[plan/geocode] error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
