/**
 * Transport canary telemetry — W3-PR-10 Scope A 観測ログ支援
 *
 * 位置づけ:
 *   canary 観測用の pure helper。buildPlanAndSegmentsFromEvents 結果に対して
 *   bin 分布 / 生成率 / sanity_violations を計算し、analytics payload に詰める。
 *
 * 設計契約:
 *   - **pure**: env / flag を読まない。side effect なし。emit そのものは caller 責務
 *   - **defensive**: events と segments の参照整合（event_id mismatch, coords 消失等）は
 *     捏造せず `invalid_null` bin にまとめる。assert はしない（telemetry で throw しない）
 *   - **heuristic と独立**: durationHeuristic の table は NEUTRAL_DURATION_TABLE から
 *     派生する値だが、将来テーブル tune 時に暗黙連動しないよう本 file 内で
 *     明示的に定数化する（tune が入ったらここを同時更新する責務）。同期検証は
 *     単体テスト（tests/unit/alter-morning/transport/telemetry.test.ts）で行う
 *
 * 非責務:
 *   - emit そのもの（caller が trackStargazerEvent を fire-and-forget で呼ぶ）
 *   - flag 判定（caller が transportV2(userId) で判定済み）
 *   - mode 推定（segment.mode をそのまま参照）
 *
 * 参照設計:
 *   - docs/alter-morning-pr10-scope-a-canary-plan.md §2-A, §2-D, §3-B Event 1
 *   - D3 bin key 仕様: §3-B Event 1（8 stable keys、番号 prefix なし）
 */

import type { Event as ComprehensionEvent } from "../comprehension/eventSchema";
import type { TransportMode, TransportSegment } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bin keys — D3 CEO 確定（§3-B Event 1）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 段階テーブル bin（8 stable keys）。
 *
 * 順序や閾値は SQL 側で再構築する契約。payload は安定キーのみ。
 * `le_0_2km_null` は heuristic が意図的に null を返す ≤0.2km レンジ、
 * `invalid_null` は座標不正（NaN / missing）で null になった fail-safe レンジ。
 */
export type TransportBinKey =
  | "le_0_2km_null"
  | "le_1km"
  | "le_3km"
  | "le_7km"
  | "le_15km"
  | "le_30km"
  | "gt_30km"
  | "invalid_null";

export type TransportBinDistribution = Record<TransportBinKey, number>;

function emptyBinDistribution(): TransportBinDistribution {
  return {
    le_0_2km_null: 0,
    le_1km: 0,
    le_3km: 0,
    le_7km: 0,
    le_15km: 0,
    le_30km: 0,
    gt_30km: 0,
    invalid_null: 0,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sanity violations — §2-D 定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * heuristic 自身の論理矛盾検知用の sanity check。O5（Sentry 即時通知）が入らない
 * フェーズでも、payload field として残すことで事後 SQL で G3 判定可能にする。
 *
 * - S1: durationMin < 1 → テーブル最小値 10 を下回る論理矛盾
 * - S2: durationMin > 120 → テーブル上限 90 を超える値は出ないはず
 * - S3: テーブルのどの値 (null, 10, 15, 25, 40, 60, 90) にも一致しない値
 * - S4: 両端 coords が ≤ 0.2km（bin = le_0_2km_null）なのに durationMin !== null
 *       → fake placeholder 復活の兆候
 */
export type SanityViolation = "S1" | "S2" | "S3" | "S4";

/**
 * durationHeuristic.NEUTRAL_DURATION_TABLE の **非 null** 値集合。
 *
 * 同期責務: heuristic の table を tune したら本 set も更新する。
 * 検証: tests/unit/alter-morning/transport/telemetry.test.ts で同期 assert する。
 */
const VALID_TABLE_DURATION_VALUES: ReadonlySet<number> = new Set([10, 15, 25, 40, 60, 90]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Haversine — 内部 helper（durationHeuristic の haversine と挙動同期）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// durationHeuristic の haversineKm は module 外に公開されていないため、
// 同じロジックを本 file 内に persist する（API boundary の独立性優先）。
// 挙動不一致が起きないよう、テスト側で同一距離の対応を check する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
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

function hasCoordinates(event: ComprehensionEvent): boolean {
  const c = event.where.coordinates;
  return (
    c != null && typeof c.lat === "number" && typeof c.lng === "number"
  );
}

function binKeyForKm(km: number): TransportBinKey {
  if (!Number.isFinite(km)) return "invalid_null";
  if (km <= 0.2) return "le_0_2km_null";
  if (km <= 1) return "le_1km";
  if (km <= 3) return "le_3km";
  if (km <= 7) return "le_7km";
  if (km <= 15) return "le_15km";
  if (km <= 30) return "le_30km";
  return "gt_30km";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SegmentsBuiltTelemetry {
  event_count: number;
  eligible_pair_count: number;
  segment_count: number;
  duration_non_null_count: number;
  duration_null_count: number;
  bin_distribution: TransportBinDistribution;
  mode: TransportMode;
  sanity_violations: SanityViolation[];
}

/**
 * buildPlanAndSegmentsFromEvents が返した `(events, segments)` から telemetry 計算。
 *
 * 契約:
 *   - pure（入力変更なし、乱数なし、時刻依存なし）
 *   - 全 bin key を必ず出す（count 0 でも key を含める。分析 SQL の COALESCE を不要に）
 *   - sanity_violations は集合（重複なし）、安定順序（Array.from(Set).sort()）で返す
 *   - mode は segments の先頭 mode を採用。segments=[] の時は "unknown"
 *     （Scope A では build 時に単一 mode で埋まるため先頭取得で十分）
 *
 * 異常経路:
 *   - segments 内の event_id が events に無い → その segment は "invalid_null" bin 扱い、
 *     durationMin 判定はそのまま継続（null/非null に応じて non_null/null count 加算）
 *   - events が空 / events.length < 2 → eligible_pair_count=0, すべて 0
 *   - coords 欠損で segment に到達 → defensive に "invalid_null" bin
 */
export function computeSegmentsBuiltTelemetry(
  events: ComprehensionEvent[],
  segments: TransportSegment[],
): SegmentsBuiltTelemetry {
  const eventById = new Map<string, ComprehensionEvent>();
  for (const ev of events) {
    eventById.set(ev.event_id, ev);
  }

  // eligible_pair_count: 両端 coords を持つ隣接 pair 数
  let eligible_pair_count = 0;
  for (let i = 0; i < events.length - 1; i++) {
    if (hasCoordinates(events[i]) && hasCoordinates(events[i + 1])) {
      eligible_pair_count++;
    }
  }

  const bin_distribution = emptyBinDistribution();
  const violations = new Set<SanityViolation>();
  let duration_non_null_count = 0;
  let duration_null_count = 0;
  // Scope A: 全 segment が同一 mode で build される前提。先頭だけ参照で足りる。
  // segments=[] なら "unknown"（意味のある mode がない空集合の代表値）。
  const mode: TransportMode = segments[0]?.mode ?? "unknown";

  for (const seg of segments) {
    const from = eventById.get(seg.fromEventId);
    const to = eventById.get(seg.toEventId);
    let km = NaN;
    if (from && to && hasCoordinates(from) && hasCoordinates(to)) {
      km = haversineKm(from.where.coordinates!, to.where.coordinates!);
    }
    const bin = binKeyForKm(km);
    bin_distribution[bin]++;

    const dur = seg.estimatedDurationMin;
    if (dur === null) {
      duration_null_count++;
    } else {
      duration_non_null_count++;
      // S1 / S2: 範囲外
      if (dur < 1) violations.add("S1");
      if (dur > 120) violations.add("S2");
      // S3: table 値に一致しない非 null
      if (!VALID_TABLE_DURATION_VALUES.has(dur)) violations.add("S3");
      // S4: ≤ 0.2km bin で non-null（fake placeholder 兆候）
      if (bin === "le_0_2km_null") violations.add("S4");
    }
  }

  return {
    event_count: events.length,
    eligible_pair_count,
    segment_count: segments.length,
    duration_non_null_count,
    duration_null_count,
    bin_distribution,
    mode,
    sanity_violations: Array.from(violations).sort(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Exposed for test 同期 check
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** @internal tests が heuristic との同期を assert するために参照 */
export const __VALID_TABLE_DURATION_VALUES_FOR_TEST: ReadonlySet<number> =
  VALID_TABLE_DURATION_VALUES;
