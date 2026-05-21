/**
 * Phase 2-G: Lived Geography Confidence Fallback (Pure helper)
 *
 * 設計書: docs/alter-plan-phase2-g-lived-geography-confidence-fallback-mini-design.md
 *
 * 役割:
 *   resolved anchor (= place_resolution_cache hit、 直近 freshDays 内、 非 sensitive、 有効座標) の
 *   重心を計算し、 confidence gate を通過した場合のみ非 null を返す。
 *   gate fail 時は null (= 呼出側で既存 baseline (home / city / prefecture) へ silent fallback)。
 *
 * 不変原則 (GPT 補正 1-7 + 自立推論):
 *   - confidence gate (minSamples / sensitive exclude / stale exclude / invalid exclude / dispersion) 通過時のみ非 null
 *   - gate fail → null、 呼出側で baseline へ silent fallback
 *   - pure (= no fetch / no Date.now() global、 引数 now で injection、 入力 mutate なし)
 *   - sensitive anchor 座標は集計対象外 (= privacy)
 *   - recurring anchor も one_off も 1 anchor = 1 sample (= 通勤先 overweight 回避)
 *   - LocationCategory enum / place_resolution_cache schema 不変 (= 既存 data 構造の読み取り専用利用)
 *
 * Complexity: O(N) (= sample 抽出 + centroid + max distance、 N < 50 typical)
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { AnchorResolution } from "@/app/(culcept)/plan/tabs/_usePlanGeocode";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Default thresholds (= mini design §3.3、 override 可能)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_MIN_SAMPLES = 3;
const DEFAULT_FRESH_DAYS = 30;
const DEFAULT_MAX_DISTANCE_KM = 30;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LivedGeographyFallback {
  /** 生活圏中心 latitude */
  lat: number;
  /** 生活圏中心 longitude */
  lng: number;
  /** 集計に使った resolved anchor 数 (= >= minSamples) */
  sampleCount: number;
  /** 集計期間 (days) */
  freshDays: number;
  /** 重心から最も離れた sample までの距離 (km、 dispersion 指標) */
  maxDistanceKm: number;
  /** fallback source 識別子 (UI / debug 用) */
  source: "lived_geography";
  /**
   * 信頼度。 現 Phase 2-G では "medium" のみ。
   * 将来 sampleCount / maxDistanceKm で "high" / "low" を細分化可能。
   */
  confidence: "medium";
}

export interface LivedGeographyOptions {
  /** sample 数下限 (default: 3) */
  minSamples?: number;
  /** 集計期間 (days、 default: 30) */
  freshDays?: number;
  /** dispersion threshold (km、 default: 30、 これ以上は null) */
  maxDistanceKm?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal helpers (export しない、 test は computeLivedGeographyFallback 経由)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** "YYYY-MM-DD" → UTC midnight Date or null (malformed なら null) */
function toDateUtc(dateStr: string): Date | null {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

/** 2 Date 間の |days| (= 浮動小数、 abs) */
function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 86400000;
  return Math.abs(a.getTime() - b.getTime()) / MS_PER_DAY;
}

/**
 * anchor が freshDays 内の occurrence を持つか判定。
 * mini design §3.6 簡略化案採用:
 *   - OneOff:   anchor.date と now の差 <= freshDays AND date <= now
 *   - Recurring: validFrom <= now AND (validUntil == null OR validUntil >= now - freshDays)
 *     (= 「valid 期間が今より freshDays 内 と 重なる」 簡略判定)
 */
function isFreshAnchor(
  anchor: ExternalAnchor,
  now: Date,
  freshDays: number,
): boolean {
  if (anchor.anchorKind === "one_off") {
    const d = toDateUtc(anchor.date);
    if (!d) return false;
    if (d.getTime() > now.getTime()) return false; // 未来の anchor は対象外 (= past only)
    return daysBetween(now, d) <= freshDays;
  }
  // recurring
  const validFrom = toDateUtc(anchor.validFrom);
  if (!validFrom) return false;
  if (validFrom.getTime() > now.getTime()) return false; // validFrom が未来 → 未開始
  if (anchor.validUntil) {
    const validUntil = toDateUtc(anchor.validUntil);
    if (!validUntil) return false;
    // validUntil が freshDays より前なら stale
    const cutoff = new Date(now.getTime() - freshDays * 86400000);
    if (validUntil.getTime() < cutoff.getTime()) return false;
  }
  return true;
}

/** lat / lng 範囲 + NaN チェック */
function isValidCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

/** Haversine 距離 (km) */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // 地球半径 km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** sample 群の重心 (= mean of lat/lng) */
function computeCentroid(
  samples: ReadonlyArray<{ lat: number; lng: number }>,
): { lat: number; lng: number } {
  let sumLat = 0;
  let sumLng = 0;
  for (const s of samples) {
    sumLat += s.lat;
    sumLng += s.lng;
  }
  return { lat: sumLat / samples.length, lng: sumLng / samples.length };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 渡された anchor / resolutions / now から、 生活圏 fallback を計算。
 *
 * 判定順 (= mini design §3.2 confidence gate):
 *   1. anchors / resolutions から sensitive 除外 + stale 除外 + invalid coord 除外 + resolved-only filter
 *   2. sample 数 < minSamples → null
 *   3. 重心計算
 *   4. 重心から最遠 sample までの Haversine 距離 >= maxDistanceKm → null (= dispersion 大、 信頼性低)
 *   5. PASS → LivedGeographyFallback 返却 (confidence="medium")
 *
 * @param anchors 全 anchor 配列
 * @param resolutions usePlanGeocode の戻り値 Map (anchor.id → AnchorResolution | null)
 * @param now 現在時刻 (= test 用 inject 可能)
 * @param options 閾値の override (default 推奨)
 * @returns LivedGeographyFallback or null (= confidence gate fail、 silent fallback)
 */
export function computeLivedGeographyFallback(
  anchors: ReadonlyArray<ExternalAnchor>,
  resolutions: ReadonlyMap<string, AnchorResolution | null>,
  now: Date,
  options?: LivedGeographyOptions,
): LivedGeographyFallback | null {
  const minSamples = options?.minSamples ?? DEFAULT_MIN_SAMPLES;
  const freshDays = options?.freshDays ?? DEFAULT_FRESH_DAYS;
  const maxDistanceKm = options?.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM;

  // 1. sample 抽出 (= 全 filter PASS のみ含める)
  const samples: Array<{ lat: number; lng: number }> = [];
  for (const a of anchors) {
    if (a.sensitiveCategory) continue; // privacy
    if (!isFreshAnchor(a, now, freshDays)) continue; // stale exclude
    const r = resolutions.get(a.id);
    if (!r) continue; // resolved only
    if (!isValidCoord(r.lat, r.lng)) continue; // invalid exclude
    samples.push({ lat: r.lat, lng: r.lng });
  }

  // 2. sample 数 gate
  if (samples.length < minSamples) return null;

  // 3. 重心
  const centroid = computeCentroid(samples);

  // 4. dispersion gate: 重心から最遠 sample の距離 (km)
  let maxDist = 0;
  for (const s of samples) {
    const d = haversineKm(centroid.lat, centroid.lng, s.lat, s.lng);
    if (d > maxDist) maxDist = d;
  }
  // 「>=」 で boundary 厳しめ (= mini design §8 edge 16、 30km ちょうどは fail)
  if (maxDist >= maxDistanceKm) return null;

  // 5. PASS
  return {
    lat: centroid.lat,
    lng: centroid.lng,
    sampleCount: samples.length,
    freshDays,
    maxDistanceKm: maxDist,
    source: "lived_geography",
    confidence: "medium",
  };
}
