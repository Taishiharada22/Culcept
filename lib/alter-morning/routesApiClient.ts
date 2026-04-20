/**
 * Google Routes API クライアント — Phase C-1
 *
 * セグメント間の移動時間（duration）と距離（distance）を取得する。
 * polyline / traffic は Phase C では不要（時間推定のみ）。
 *
 * 呼び出し条件:
 *   - origin / destination の両方に lat/lng 座標がある場合のみ呼ぶ
 *   - 座標が欠ける場合は travelTimeEngine のヒューリスティックにフォールバック
 *
 * コスト最適化:
 *   - Routes Basic field mask（routes.duration, routes.distanceMeters）
 *   - ~$0.005/req
 *   - 典型朝プラン（3セグメント）= 3req = $0.015
 *
 * セキュリティ:
 *   - API キーは process.env.GOOGLE_MAPS_API_KEY 経由のみ（Places API と共用）
 *   - ログにキー文字列を出力しない
 */

const ROUTES_API_BASE = "https://routes.googleapis.com/directions/v2:computeRoutes";

// Basic fields only — cheapest tier (~$0.005/req)
// routes.duration: 総所要時間
// routes.distanceMeters: 総距離
// legs は現時点で不要（origin→destination の1レグのみ）
const ROUTE_FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
].join(",");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 座標 */
export interface LatLng {
  lat: number;
  lng: number;
}

/** ルート計算結果 */
export interface RouteResult {
  /** 総所要時間（秒） */
  durationSeconds: number;
  /** 総所要時間（分、切り上げ） */
  durationMinutes: number;
  /** 総距離（メートル） */
  distanceMeters: number;
  /** 移動手段 */
  travelMode: RouteTravelMode;
}

/** Routes API の移動手段 */
export type RouteTravelMode =
  | "DRIVE"
  | "BICYCLE"
  | "WALK"
  | "TRANSIT"
  | "TWO_WHEELER";

/** ルート計算オプション */
export interface ComputeRouteOptions {
  origin: LatLng;
  destination: LatLng;
  travelMode: RouteTravelMode;
  /** 出発時刻（ISO 8601）— TRANSIT の場合に精度向上 */
  departureTime?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transport Mode Mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * アプリ内の TransportMode → Routes API の travelMode に変換する。
 *
 * Routes API のモード:
 *   DRIVE: 自動車（タクシー含む）
 *   BICYCLE: 自転車
 *   WALK: 徒歩
 *   TRANSIT: 公共交通機関（電車・バス）
 *   TWO_WHEELER: 二輪車
 */
const TRANSPORT_TO_ROUTE_MODE: Record<string, RouteTravelMode> = {
  car: "DRIVE",
  taxi: "DRIVE",
  train: "TRANSIT",
  bus: "TRANSIT",
  walk: "WALK",
  bicycle: "BICYCLE",
  motorcycle: "TWO_WHEELER",
};

/**
 * アプリ内の TransportMode 文字列を Routes API の RouteTravelMode に変換する。
 * 不明な場合は DRIVE をデフォルトとする。
 */
export function toRouteTravelMode(transport?: string): RouteTravelMode {
  if (!transport) return "DRIVE";
  const normalized = transport.toLowerCase();

  // 日本語 → 英語
  const jaMap: Record<string, string> = {
    "電車": "train",
    "車": "car",
    "徒歩": "walk",
    "歩き": "walk",
    "自転車": "bicycle",
    "チャリ": "bicycle",
    "バス": "bus",
    "タクシー": "taxi",
    "バイク": "motorcycle",
  };
  const eng = jaMap[normalized] ?? normalized;
  return TRANSPORT_TO_ROUTE_MODE[eng] ?? "DRIVE";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Key
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Routes API が利用可能か確認（Places API と同じキー） */
export function isRoutesApiAvailable(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("[RoutesAPI] GOOGLE_MAPS_API_KEY is not set");
  }
  return key;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compute Routes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 2地点間のルートを計算し、所要時間と距離を返す。
 *
 * @throws API キー未設定 or HTTP エラー時（caller 側で catch → フォールバック）
 */
export async function computeRoute(
  options: ComputeRouteOptions,
): Promise<RouteResult> {
  const apiKey = getApiKey();

  const body: Record<string, unknown> = {
    origin: {
      location: {
        latLng: {
          latitude: options.origin.lat,
          longitude: options.origin.lng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: options.destination.lat,
          longitude: options.destination.lng,
        },
      },
    },
    travelMode: options.travelMode,
    // languageCode は duration には不要だが、エラーメッセージの言語に影響
    languageCode: "ja",
  };

  // TRANSIT の場合、出発時刻を指定すると精度向上
  if (options.departureTime && options.travelMode === "TRANSIT") {
    body.departureTime = options.departureTime;
  }

  const res = await fetch(ROUTES_API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": ROUTE_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errSnippet = await res.text().catch(() => "unknown");
    console.error(
      `[RoutesAPI] computeRoute failed: ${res.status} (${errSnippet.slice(0, 200)})`,
    );
    throw new Error(`Routes API computeRoute failed: ${res.status}`);
  }

  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) {
    throw new Error("[RoutesAPI] No route found in response");
  }

  // duration は "123s" 形式の文字列
  const durationStr: string = route.duration ?? "0s";
  const durationSeconds = parseDurationString(durationStr);
  const distanceMeters: number = route.distanceMeters ?? 0;

  return {
    durationSeconds,
    durationMinutes: Math.ceil(durationSeconds / 60),
    distanceMeters,
    travelMode: options.travelMode,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Routes API の duration 文字列をパースする。
 *
 * 形式: "123s"（秒数の文字列）
 * 例: "1800s" → 1800
 */
export function parseDurationString(duration: string): number {
  if (!duration) return 0;
  const match = duration.match(/^(\d+)s$/);
  return match ? parseInt(match[1], 10) : 0;
}
