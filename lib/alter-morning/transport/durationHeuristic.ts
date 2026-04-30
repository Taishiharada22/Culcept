/**
 * 中立距離 duration heuristic — W3-PR-10 Scope A（2026-04-24 CEO 確定）
 *
 * 設計契約:
 *   - **mode-free**: signature は mode を受け取らない。「中立」であることが型に表れる
 *   - **段階テーブル**: 連続 curve ではなく距離ビンごとの固定値（近距離/遠距離の歪みを吸収）
 *   - **≤ 0.2km は null**: 同一地点・極近距離は travel を作らない（fake duration 禁止）
 *   - **NaN / invalid coords は null**: failure-safe（fabricated value 禁止）
 *
 * Scope 原則:
 *   - Scope A で生まれる唯一の duration 値が `durationSource: "heuristic"`
 *   - Scope B（Routes API 本接続）でこの fn は差し替え可能（pure fn で独立）
 *   - mode-aware 精度向上は候補 4（mode 推定エンジン）の領域。本 file に mode を導入しない
 *
 * 呼び出し側契約:
 *   - number 返り値 → segment は `estimatedDurationMin = N, durationSource = "heuristic"` をペアで書く
 *   - null 返り値 → segment は `estimatedDurationMin = null, durationSource = null` をペアで書く
 *   - 両 field の null / non-null は必ず同期する
 */

export interface Coords {
  lat: number;
  lng: number;
}

/**
 * 中立距離 curve の段階テーブル（km → min）。
 * CEO 確定値 2026-04-24。tune は CEO 判断で本 table のみを編集する。
 */
const NEUTRAL_DURATION_TABLE: Array<{ maxKm: number; durationMin: number | null }> = [
  { maxKm: 0.2, durationMin: null },  // 同一地点 / 極近距離: travel 不生成
  { maxKm: 1, durationMin: 10 },
  { maxKm: 3, durationMin: 15 },
  { maxKm: 7, durationMin: 25 },
  { maxKm: 15, durationMin: 40 },
  { maxKm: 30, durationMin: 60 },
  { maxKm: Infinity, durationMin: 90 },
];

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance between two coords (km).
 * 入力が NaN / 非有限値なら NaN を返す（fail-fast）。
 */
function haversineKm(a: Coords, b: Coords): number {
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return NaN;
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return NaN;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

/**
 * mode 非依存の中立距離 heuristic。
 *
 * 挙動:
 *   - 両端 coords の haversine 距離 km から段階テーブルで duration を決定
 *   - ≤ 0.2km: null を返す（呼び出し側 = buildTransportSegments で null と同期）
 *   - NaN / invalid coords: null を返す
 *   - number を返すのは 0.2km < 距離 の時のみ
 */
export function estimateNeutralDurationMin(
  fromCoords: Coords,
  toCoords: Coords,
): number | null {
  const km = haversineKm(fromCoords, toCoords);
  if (!Number.isFinite(km)) return null;
  for (const bin of NEUTRAL_DURATION_TABLE) {
    if (km <= bin.maxKm) return bin.durationMin;
  }
  return null;
}
