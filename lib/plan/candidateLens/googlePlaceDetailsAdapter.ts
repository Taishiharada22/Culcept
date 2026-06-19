/**
 * lib/plan/candidateLens/googlePlaceDetailsAdapter.ts
 *   — Candidate Lens / Phase 4-b+c: 実 Google Place Details + Place Photo adapter（★server-only）
 *
 * ★server-only: `process.env.GOOGLE_MAPS_API_KEY` を使う。**client から import しない**（route.ts のみが使う）。
 * ★スコープ厳守（CEO 限定一括 GO）:
 *   - field mask は `PLACE_DETAILS_FIELD_MASK` 定数のみ（引数で mask を受けない＝逸脱不能）。
 *   - 1 候補 = **Place Details 1 回 ＋ Place Photo media 0〜1 回**（先頭写真のみ）。それ以上叩かない。
 *   - **写真は skipHttpRedirect=true で photoUri(lh3 clean URL)だけ取得**（バイトをサーバに保持しない）。
 *   - timeout 1500ms / **retry 0**（重複課金回避）/ **fail-open**（throw せず error/skipped を resolve）。
 *   - ★API キーをログ・エラーメッセージ・レスポンスに**一切出さない**（既存 placesApiClient 方針継承）。
 *   - **no persistent cache**: 本 adapter は保存層に触れない（memo は呼び側 client の責務）。
 */
import {
  PLACE_DETAILS_FIELD_MASK,
  PHOTO_MAX_WIDTH_PX,
  ENRICHMENT_FETCH_POLICY,
  buildEnrichedHours,
  skippedEnrichment,
  errorEnrichment,
  type PlaceDetailsEnrichment,
  type EnrichedPhoto,
  type EnrichedHours,
  type EnrichmentError,
} from "@/lib/plan/candidateLens/placeDetailsEnrichment";
import type { PlaceDetailsAdapter } from "@/lib/plan/candidateLens/placeDetailsAdapter";

const PLACES_API_BASE = "https://places.googleapis.com/v1";

// Google レスポンス（必要フィールドのみ・field mask に対応）。
interface GoogleAuthorAttribution {
  readonly displayName?: string;
  readonly uri?: string;
  readonly photoUri?: string;
}
interface GooglePhotoMeta {
  readonly name?: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly authorAttributions?: readonly GoogleAuthorAttribution[];
}
interface GoogleDetailsResponse {
  readonly id?: string;
  readonly photos?: readonly GooglePhotoMeta[];
  readonly regularOpeningHours?: { readonly openNow?: boolean; readonly weekdayDescriptions?: readonly string[] };
}
interface GooglePhotoMediaResponse {
  readonly name?: string;
  readonly photoUri?: string;
}

/** AbortError → timeout、それ以外 → unavailable。 */
function classifyError(e: unknown): EnrichmentError["kind"] {
  if (e instanceof Error && e.name === "AbortError") return "timeout";
  return "unavailable";
}

/** timeout 付き fetch（1500ms・external signal 合流・retry なし）。 */
async function fetchWithTimeout(url: string, init: RequestInit, externalSignal?: AbortSignal): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ENRICHMENT_FETCH_POLICY.timeoutMs);
  if (externalSignal) {
    if (externalSignal.aborted) ac.abort();
    else externalSignal.addEventListener("abort", () => ac.abort(), { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ★実 adapter。Place Details → photo media を解決し PlaceDetailsEnrichment を返す。fail-open。
 */
export class GooglePlaceDetailsAdapter implements PlaceDetailsAdapter {
  async fetchDetails(placeId: string, opts?: { signal?: AbortSignal }): Promise<PlaceDetailsEnrichment> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey || !placeId) return skippedEnrichment(placeId);

    // ── (1) Place Details（mask は定数のみ・Enterprise）。
    let data: GoogleDetailsResponse;
    try {
      const res = await fetchWithTimeout(
        // ★languageCode=ja: 営業時間(weekdayDescriptions)を日本語で受ける（JP UI 用）。
        `${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}?languageCode=ja`,
        { method: "GET", headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK } },
        opts?.signal,
      );
      if (!res.ok) {
        // ★status のみ・キー/レスポンス body は出さない。
        return errorEnrichment(placeId, "http", `details_status_${res.status}`);
      }
      data = (await res.json()) as GoogleDetailsResponse;
    } catch (e) {
      return errorEnrichment(placeId, classifyError(e), "details_fetch_failed");
    }

    // ── 営業時間（あれば honesty で openState 導出）。
    const hours: EnrichedHours | null = data.regularOpeningHours
      ? buildEnrichedHours({
          openNow: data.regularOpeningHours.openNow ?? null,
          weekdayDescriptions: [...(data.regularOpeningHours.weekdayDescriptions ?? [])],
        })
      : null;

    // ── 写真（先頭 1 枚のみ）。name があれば media(skipHttpRedirect) で photoUri を解決。
    let photo: EnrichedPhoto | null = null;
    const p0 = data.photos?.[0];
    if (p0?.name) {
      const attributions = (p0.authorAttributions ?? []).map((a) => ({
        displayName: a.displayName ?? null,
        uri: a.uri ?? null,
        photoUri: a.photoUri ?? null,
      }));
      const photoUri = await this.resolvePhotoUri(p0.name, apiKey, opts?.signal);
      photo = {
        name: p0.name,
        widthPx: p0.widthPx ?? null,
        heightPx: p0.heightPx ?? null,
        authorAttributions: attributions,
        photoUri,
      };
    }

    return { placeId, provenance: "google_places", photo, hours, fetchStatus: "ok", error: null, fetchedAtMs: null };
  }

  /** ★Place Photo media: skipHttpRedirect=true で {photoUri} だけ取得（バイト非保持・maxWidthPx 上限）。fail→null。 */
  private async resolvePhotoUri(photoName: string, apiKey: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const url = `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH_PX}&skipHttpRedirect=true`;
      const res = await fetchWithTimeout(url, { method: "GET", headers: { "X-Goog-Api-Key": apiKey } }, signal);
      if (!res.ok) return null;
      const j = (await res.json()) as GooglePhotoMediaResponse;
      return j.photoUri ?? null;
    } catch {
      return null; // media 失敗 → 写真は abstract fallback（hours は別途生きる）
    }
  }
}
