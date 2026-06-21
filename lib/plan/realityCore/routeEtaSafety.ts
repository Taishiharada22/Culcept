/**
 * routeEtaSafety — RD2d-b-B route/ETA 層の **共有 safety primitive**（pure・raw-location leak guard / redact / safe exception）
 *
 * 正本: docs/reality-route-eta-duration-value-rd2d-b-value-0.md §7 / CEO RD2d-b-B GO（2026-06-14・shared primitive・behavior 拡張なし）
 *
 * 思想（検出差分を排除）: capability / adapter / wrapper / 将来の value channel が **同一の raw-location 検出**を使う。
 *   従来は 3 ファイルが各々の COORD pattern を持ち強度が分裂（wrapper=最強・capability/adapter=弱）していた。本 file に
 *   wrapper（RD2d-c-A2）の magnitude-bounded 版を集約し、全層を最強検出に統一（drift 排除）。violation message は raw を
 *   echo せず、exception は safe code のみ返す。
 *
 * 規律（CEO）: provider behavior 拡張なし・value channel 実装なし・external/currentLocation/weather/RC2a/UI/DB 不接触。
 *   pure（IO・時刻 API[Date.now/new Date]・乱数[Math.random]・navigator/geolocation なし。parseFloat/Math.abs は純粋）。
 */

export const ROUTE_ETA_SAFETY_VERSION = 0;

/**
 * raw な位置情報を運ぶ token（座標小数を含まない encoding も含む）。
 * 注: "coordinate"/"currentlocation"/"rawcoord" 等は legit field 名に部分一致するため**含めない**（"coordinates" 複数形は安全）。
 */
export const FORBIDDEN_RAW_LOCATION_TOKENS: ReadonlyArray<string> = [
  "polyline",
  "encodedpolyline",
  "latitude",
  "longitude",
  "lnglat",
  "latlng",
  "geometry",
  "coordinates",
  "routeresponse",
  "address",
  "waypoints",
  "geohash",
  "pluscode",
  "plus_code",
  "what3words",
  "mgrs",
  "s2cell",
  "placeid",
  "place_id",
  "graphviewerkey",
];

/** 高精度単一座標（3 桁以上小数・~110m 以下精度も捕捉） */
const COORD_PATTERN = /\d{1,3}\.\d{3,}/;
/** Open Location Code（plus code・"8Q7XMQHC+2V"） */
const PLUS_CODE_PATTERN = /[23456789cfghjmpqrvwx]{4,}\+[23456789cfghjmpqrvwx]{2,}/i;

/**
 * coordinate-shaped pair を magnitude bound で検出。
 * "35.68 139.76"(空白)/"35.6,139.7"(1 桁)/"35,139"(整数)等の evasive form も lat∈[-90,90]∧lng∈[-180,180] なら座標と判定。
 * JSON の field 跨ぎ（"35","y":139）は delimiter が単一でないため一致せず・date "2026-06-12" は "-" が delimiter 外で一致しない。
 */
function containsCoordinatePair(s: string): boolean {
  const re = /(-?\d{1,3}(?:\.\d+)?)\s*[ ,;/|]\s*(-?\d{1,3}(?:\.\d+)?)/g;
  let m: RegExpExecArray | null = re.exec(s);
  while (m !== null) {
    const a = Math.abs(parseFloat(m[1]));
    const b = Math.abs(parseFloat(m[2]));
    const hasDecimal = m[1].indexOf(".") >= 0 || m[2].indexOf(".") >= 0;
    if (a <= 90 && b <= 180 && (hasDecimal || (a > 0 && b > 0))) return true;
    m = re.exec(s);
  }
  return false;
}

/**
 * containsRawLocation — serialized 小文字文字列に raw 座標 / 位置 encoding が含まれるか（token + 単一高精度 + ペア + plus code）。
 * route/ETA 全層（capability/adapter/wrapper/value）が共有する単一の検出。
 */
export function containsRawLocation(jsonLower: string): boolean {
  return (
    FORBIDDEN_RAW_LOCATION_TOKENS.some((t) => jsonLower.includes(t)) ||
    COORD_PATTERN.test(jsonLower) ||
    PLUS_CODE_PATTERN.test(jsonLower) ||
    containsCoordinatePair(jsonLower)
  );
}

/** redactRouteEtaUnsafeValue — 値が raw 座標/位置様なら redact（violation message が leak guard を defeat しないため） */
export function redactRouteEtaUnsafeValue(v: string): string {
  return containsRawLocation(v.toLowerCase()) ? "<redacted: matched raw-data pattern>" : v;
}

/** routeEtaSafeViolationMessage — `${label}: ${value}` を作るが value は redact 済（raw echo しない） */
export function routeEtaSafeViolationMessage(label: string, value: string): string {
  return `${label}: ${redactRouteEtaUnsafeValue(value)}`;
}

/** dependency exception 時の safe reason code（raw message/stack/payload を一切出さない） */
export const ROUTE_ETA_SAFE_EXCEPTION_REASON = "dependency_error" as const;
export function routeEtaSafeExceptionReason(): typeof ROUTE_ETA_SAFE_EXCEPTION_REASON {
  return ROUTE_ETA_SAFE_EXCEPTION_REASON;
}
