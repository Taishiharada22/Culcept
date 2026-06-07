/**
 * lib/plan/mobility/movementEventDetector.ts — A1-2: departure / arrival detector（pure layer）
 *
 * ★目的: GPS の position sample 列 + anchor 座標(from/to) から、その leg の
 *   実出発 / 実到着 / 実所要(derived) を **推定**する純粋関数。捏造しない＝検出できない側は null。
 *
 * ★誠実性・安全境界（A1-0 audit / CEO 方針）:
 *   - 出力 DetectedMovement は **derived metric のみ**（raw GPS 座標を一切含まない）。
 *     座標は本 module 内（haversine）でのみ使い、外には出さない＝「raw GPS 永続禁止」を型で担保。
 *   - 疎な foreground sample（app open 時のみ）を前提に、検出できなければ null / confidence=low。
 *     ＝ GPS 推定だけを真実にしない（後段で user confirmation を挟む前提）。
 *   - 距離→時間の捏造はしない（duration は 実出発↔実到着 の差からのみ・両端不在は null）。
 *   - mode を固定化しない / Google・external API を呼ばない / DB・network 不使用 / pure。
 *
 * detector は GPS sample からの推定のみを担うので source は常に "gps"。manual/inferred は store/UI 側。
 */

export type MovementConfidence = "high" | "medium" | "low";

/**
 * detector 入力の GPS sample（★この型は detector の引数としてのみ存在し、永続されない）。
 * at = epoch ms（並べ替え/差分用）。lat/lng/accuracyM は検出計算にのみ使う。
 */
export interface PositionSample {
  readonly at: number;
  readonly lat: number;
  readonly lng: number;
  readonly accuracyM?: number;
}

/** anchor の座標（from/to）。plan の baselineCoords / legCoordsByKey から渡す。 */
export interface DetectorAnchorCoord {
  readonly lat: number;
  readonly lng: number;
}

export interface MovementDetectorConfig {
  /** "near" 判定の geofence 半径(m)。 */
  readonly geofenceRadiusM: number;
  /** 到着確定に必要な滞留(ms)。これ未満は dwell 未確認（confidence 低下）。 */
  readonly dwellMs: number;
  /** これより精度が悪い sample は捨てる（currentLocationGating と整合）。 */
  readonly maxAccuracyM: number;
  /** これ未満の sample 数では検出しない（null）。 */
  readonly minSamples: number;
  /** 連続 sample 間隔がこれを超えると confidence 低下（疎すぎ）。 */
  readonly maxGapMs: number;
}

export const DEFAULT_MOVEMENT_DETECTOR_CONFIG: MovementDetectorConfig = {
  geofenceRadiusM: 150,
  dwellMs: 3 * 60_000,
  maxAccuracyM: 1000, // lib/alter-morning/journey/currentLocationGating.ts と揃える
  minSamples: 2,
  maxGapMs: 20 * 60_000,
};

/**
 * detector の出力（★derived only・raw 座標を含まない＝store にそのまま渡せる）。
 * source は常に "gps"（GPS sample からの推定のため）。
 */
export interface DetectedMovement {
  readonly actualDepartureAtMs: number | null;
  readonly actualArrivalAtMs: number | null;
  readonly actualDurationMin: number | null;
  readonly confidence: MovementConfidence;
  readonly source: "gps";
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 2 点間の距離(m)。pure（haversine）。 */
export function haversineMeters(a: DetectorAnchorCoord, b: DetectorAnchorCoord): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isFiniteSample(s: PositionSample): boolean {
  return Number.isFinite(s.at) && Number.isFinite(s.lat) && Number.isFinite(s.lng);
}

function maxConsecutiveGapMs(samples: readonly PositionSample[]): number {
  let max = 0;
  for (let i = 1; i < samples.length; i++) {
    const gap = samples[i].at - samples[i - 1].at;
    if (gap > max) max = gap;
  }
  return max;
}

/**
 * departure を検出（pure）: from geofence の inside→outside 遷移が観測された outside 側時刻。
 * from が無い / inside を一度も観測しない → null（出発時刻を予定値で捏造しない）。
 */
function detectDepartureMs(
  samples: readonly PositionSample[],
  from: DetectorAnchorCoord | null | undefined,
  radiusM: number,
): number | null {
  if (!from) return null;
  let wasInside = false;
  for (const s of samples) {
    const inside = haversineMeters(s, from) <= radiusM;
    if (inside) wasInside = true;
    else if (wasInside) return s.at;
  }
  return null;
}

/**
 * arrival を検出（pure）: to geofence に入った最初の sample 時刻。
 * dwellMs 以上滞留が確認できれば dwellConfirmed=true（confidence 用）。
 * to が無い / inside を一度も観測しない → arrivalMs=null。
 */
function detectArrival(
  samples: readonly PositionSample[],
  to: DetectorAnchorCoord | null | undefined,
  radiusM: number,
  dwellMs: number,
): { arrivalMs: number | null; dwellConfirmed: boolean } {
  if (!to) return { arrivalMs: null, dwellConfirmed: false };
  for (let i = 0; i < samples.length; i++) {
    if (haversineMeters(samples[i], to) > radiusM) continue;
    const enterAt = samples[i].at;
    let dwellConfirmed = false;
    for (let j = i + 1; j < samples.length; j++) {
      if (haversineMeters(samples[j], to) > radiusM) break; // dwell 前に離脱
      if (samples[j].at - enterAt >= dwellMs) {
        dwellConfirmed = true;
        break;
      }
    }
    return { arrivalMs: enterAt, dwellConfirmed };
  }
  return { arrivalMs: null, dwellConfirmed: false };
}

function scoreConfidence(input: {
  cleanCount: number;
  departureMs: number | null;
  arrivalMs: number | null;
  durationMin: number | null;
  dwellConfirmed: boolean;
  maxGapMs: number;
  configMaxGapMs: number;
}): MovementConfidence {
  const hasBoth = input.departureMs != null && input.arrivalMs != null;
  const validDuration = input.durationMin != null && input.durationMin > 0;
  const gapOk = input.maxGapMs <= input.configMaxGapMs;
  const dense = input.cleanCount >= 4;
  // high: 両端 + 正の duration + 到着 dwell 確認 + 密 + gap 健全
  if (hasBoth && validDuration && input.dwellConfirmed && dense && gapOk) return "high";
  // medium: 両端 + 正の duration（dwell/密のどちらか弱い）、または片端でも密 + gap 健全
  if ((hasBoth && validDuration) || (dense && gapOk)) return "medium";
  return "low";
}

/**
 * leg の position sample 列から実出発/実到着/実所要を推定（pure・捏造なし）。
 * - 精度の悪い sample（accuracyM > maxAccuracyM）は除外。NaN は除外。時刻昇順に整列。
 * - sample 不足（< minSamples）/ 両端とも検出不能 → null（＝当面 inert で正しい）。
 * - duration は 実出発 < 実到着 のときだけ derived。順序逆/片端欠落は null。
 * @returns DetectedMovement（derived only・raw 座標なし）or null
 */
export function detectMovement(
  samples: readonly PositionSample[],
  anchors: { from?: DetectorAnchorCoord | null; to?: DetectorAnchorCoord | null },
  config: MovementDetectorConfig = DEFAULT_MOVEMENT_DETECTOR_CONFIG,
): DetectedMovement | null {
  const clean = samples
    .filter(isFiniteSample)
    .filter((s) => s.accuracyM == null || s.accuracyM <= config.maxAccuracyM)
    .slice()
    .sort((a, b) => a.at - b.at);
  if (clean.length < config.minSamples) return null;

  const departureMs = detectDepartureMs(clean, anchors.from, config.geofenceRadiusM);
  const { arrivalMs, dwellConfirmed } = detectArrival(
    clean,
    anchors.to,
    config.geofenceRadiusM,
    config.dwellMs,
  );
  if (departureMs == null && arrivalMs == null) return null;

  const durationMin =
    departureMs != null && arrivalMs != null && arrivalMs > departureMs
      ? Math.round((arrivalMs - departureMs) / 60_000)
      : null;

  const confidence = scoreConfidence({
    cleanCount: clean.length,
    departureMs,
    arrivalMs,
    durationMin,
    dwellConfirmed,
    maxGapMs: maxConsecutiveGapMs(clean),
    configMaxGapMs: config.maxGapMs,
  });

  return {
    actualDepartureAtMs: departureMs,
    actualArrivalAtMs: arrivalMs,
    actualDurationMin: durationMin,
    confidence,
    source: "gps",
  };
}
