/**
 * Google Places API (New) クライアント — Phase B-1
 *
 * chain_brand / generic_place の場所解決に使用。
 *
 * コスト最適化:
 *   - Basic フィールドマスクのみ（最安ティア: ~$0.032/req）
 *   - maxResultCount を最小限に設定
 *   - キャッシュは resolver 側で積極制御
 *
 * セキュリティ:
 *   - API キーは process.env.GOOGLE_MAPS_API_KEY 経由のみ
 *   - ログにキー文字列を出力しない
 *   - エラーメッセージからもキーを除外
 */

const PLACES_API_BASE = "https://places.googleapis.com/v1";

// Basic fields only — cheapest tier
// 参考: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.location",
  "places.types",
  "places.businessStatus",
].join(",");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Places API (New) のレスポンス型（Basic fields） */
export interface PlacesApiPlace {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  /** OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY */
  businessStatus?: string;
}

export interface TextSearchOptions {
  textQuery: string;
  /** locationBias: 検索結果をこの地点付近に偏重（Phase C で GPS 連携後に使用） */
  locationBias?: { lat: number; lng: number; radius: number };
  languageCode?: string;
  /** 最大結果数（コスト節約のため最小限に） */
  maxResultCount?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Key
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** API キーが設定されているか確認（resolver が事前チェックに使う） */
export function isPlacesApiAvailable(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("[PlacesAPI] GOOGLE_MAPS_API_KEY is not set");
  }
  return key;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Text Search (New)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Text Search (New) — テキストクエリで場所を検索
 *
 * chain_brand: "マクドナルド 甲府" 等
 * generic_place: "図書館 甲府市" 等
 *
 * @throws API キー未設定 or HTTP エラー時（resolver 側で catch → fail-open）
 */
export async function searchPlacesByText(
  options: TextSearchOptions,
): Promise<PlacesApiPlace[]> {
  const apiKey = getApiKey();

  const body: Record<string, unknown> = {
    textQuery: options.textQuery,
    languageCode: options.languageCode ?? "ja",
    maxResultCount: options.maxResultCount ?? 5,
  };

  if (options.locationBias) {
    body.locationBias = {
      circle: {
        center: {
          latitude: options.locationBias.lat,
          longitude: options.locationBias.lng,
        },
        radius: options.locationBias.radius,
      },
    };
  }

  const res = await fetch(`${PLACES_API_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": SEARCH_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // ログにキー文字列を出さない（ステータスとエラー概要のみ）
    const errSnippet = await res.text().catch(() => "unknown");
    console.error(
      `[PlacesAPI] Text Search failed: ${res.status} (${errSnippet.slice(0, 200)})`,
    );
    throw new Error(`Places Text Search failed: ${res.status}`);
  }

  const data = await res.json();
  return (data.places ?? []) as PlacesApiPlace[];
}
