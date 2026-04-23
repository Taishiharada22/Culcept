/**
 * computeSegmentsBuiltTelemetry — W3-PR-10 canary O2 契約テスト
 *
 * カバレッジ:
 *   T-A: pure / 決定論 — 同じ入力で同じ出力
 *   T-B: bin_distribution の閾値境界
 *   T-C: sanity_violations (S1〜S4) の検知ルール
 *   T-D: 全 8 bin key を常に含む（count 0 も key あり）
 *   T-E: segments=[] / events<2 の edge case
 *   T-F: VALID_TABLE_DURATION_VALUES と durationHeuristic の table 整合
 *   T-G: mode 取り出し — segments[0].mode を採用、空なら "unknown"
 */

import { describe, test, expect } from "vitest";

import {
  computeSegmentsBuiltTelemetry,
  __VALID_TABLE_DURATION_VALUES_FOR_TEST,
  type TransportBinKey,
} from "@/lib/alter-morning/transport/telemetry";
import {
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { TransportSegment } from "@/lib/alter-morning/transport/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures（synthesizeTravelItems.test.ts の mkEvent/mkSegment と同じ構造）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EARTH_RADIUS_KM = 6371;
const BASE = { lat: 35.6895, lng: 139.6917 };

function coordsAtKmEast(km: number): { lat: number; lng: number } {
  const kmPerDegLng =
    ((2 * Math.PI * EARTH_RADIUS_KM) / 360) *
    Math.cos((BASE.lat * Math.PI) / 180);
  return { lat: BASE.lat, lng: BASE.lng + km / kmPerDegLng };
}

function mkEvent(opts: {
  id: string;
  coordinates?: { lat: number; lng: number } | null;
}): Event {
  return {
    event_id: opts.id,
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    certainty: "asserted",
    when: {
      startTime: null,
      timeHint: null,
      provenance: utteranceProvenance([], "high"),
    },
    where: {
      place_ref: opts.id,
      placeType: "exact_proper_noun",
      coordinates: opts.coordinates ?? null,
      provenance: utteranceProvenance([opts.id], "high"),
    },
    what: {
      activity: "予定",
      activityCanonical: "予定",
      provenance: utteranceProvenance(["予定"], "high"),
    },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

function mkSegment(opts: {
  from: string;
  to: string;
  mode?: TransportSegment["mode"];
  estimatedDurationMin?: number | null;
}): TransportSegment {
  const hasDur = Object.prototype.hasOwnProperty.call(
    opts,
    "estimatedDurationMin",
  );
  const dur = hasDur ? (opts.estimatedDurationMin ?? null) : 15;
  return {
    fromEventId: opts.from,
    toEventId: opts.to,
    mode: opts.mode ?? "unknown",
    estimatedDurationMin: dur,
    durationSource: dur !== null ? "heuristic" : null,
    distanceM: null,
    confidence: "default",
    source: "default_walk",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeSegmentsBuiltTelemetry — pure / 決定論", () => {
  test("T-A: 同じ入力で出力が等価（deep equal）", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(2) }),
    ];
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 15 })];
    const a = computeSegmentsBuiltTelemetry(events, segs);
    const b = computeSegmentsBuiltTelemetry(events, segs);
    expect(a).toEqual(b);
  });

  test("T-D: 全 8 bin key が常に存在（count 0 でも key を出す）", () => {
    const tel = computeSegmentsBuiltTelemetry([], []);
    const keys: TransportBinKey[] = [
      "le_0_2km_null",
      "le_1km",
      "le_3km",
      "le_7km",
      "le_15km",
      "le_30km",
      "gt_30km",
      "invalid_null",
    ];
    for (const k of keys) {
      expect(tel.bin_distribution[k]).toBe(0);
    }
    // key が 8 個ちょうどあること
    expect(Object.keys(tel.bin_distribution).sort()).toEqual(
      [...keys].sort(),
    );
  });
});

describe("computeSegmentsBuiltTelemetry — bin_distribution 境界", () => {
  test("≤ 0.2km → le_0_2km_null", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(0.15) }),
    ];
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: null })];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.bin_distribution.le_0_2km_null).toBe(1);
    expect(tel.bin_distribution.le_1km).toBe(0);
  });

  test("0.5km → le_1km", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(0.5) }),
    ];
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 10 })];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.bin_distribution.le_1km).toBe(1);
  });

  test("2km → le_3km", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(2) }),
    ];
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 15 })];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.bin_distribution.le_3km).toBe(1);
  });

  test("5km → le_7km", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(5) }),
    ];
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 25 })];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.bin_distribution.le_7km).toBe(1);
  });

  test("10km → le_15km / 20km → le_30km / 50km → gt_30km", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(10) }),
      mkEvent({ id: "e3", coordinates: coordsAtKmEast(30) }),
      mkEvent({ id: "e4", coordinates: coordsAtKmEast(80) }),
    ];
    const segs = [
      mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 40 }),
      mkSegment({ from: "e2", to: "e3", estimatedDurationMin: 60 }),
      mkSegment({ from: "e3", to: "e4", estimatedDurationMin: 90 }),
    ];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.bin_distribution.le_15km).toBe(1);
    expect(tel.bin_distribution.le_30km).toBe(1);
    expect(tel.bin_distribution.gt_30km).toBe(1);
  });

  test("events 欠損 → invalid_null bin", () => {
    // segment は参照するが events に対応 id がない defensive ケース
    const events = [mkEvent({ id: "e1", coordinates: BASE })];
    const segs = [
      mkSegment({ from: "e1", to: "missing", estimatedDurationMin: null }),
    ];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.bin_distribution.invalid_null).toBe(1);
  });
});

describe("computeSegmentsBuiltTelemetry — sanity_violations", () => {
  test("S1: durationMin < 1", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(2) }),
    ];
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 0 })];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.sanity_violations).toContain("S1");
  });

  test("S2: durationMin > 120", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(2) }),
    ];
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 200 })];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.sanity_violations).toContain("S2");
  });

  test("S3: table 外の値（5）", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(2) }),
    ];
    // 5 は table (10,15,25,40,60,90) に無い
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 5 })];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.sanity_violations).toContain("S3");
  });

  test("S4: ≤ 0.2km なのに duration 非 null（fake placeholder 兆候）", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(0.15) }),
    ];
    // 本来 null のはずが 10 min 入っている
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 10 })];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.sanity_violations).toContain("S4");
  });

  test("正常系: violations は空", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(2) }),
    ];
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 15 })];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.sanity_violations).toEqual([]);
  });

  test("violations は重複なし・安定順序（sorted）", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(2) }),
      // e2→e3 を 0.1km にするため base+2.1km east（e2→e3 ≒ 0.1km ≤ 0.2km）
      mkEvent({ id: "e3", coordinates: coordsAtKmEast(2.1) }),
    ];
    const segs = [
      mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 200 }), // S2 + S3
      mkSegment({ from: "e2", to: "e3", estimatedDurationMin: 10 }), // S4 (bin=le_0_2km_null なのに 非null)
    ];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.sanity_violations).toEqual(["S2", "S3", "S4"]);
  });
});

describe("computeSegmentsBuiltTelemetry — counts / edge cases", () => {
  test("T-E: 空入力 → すべて 0", () => {
    const tel = computeSegmentsBuiltTelemetry([], []);
    expect(tel).toEqual({
      event_count: 0,
      eligible_pair_count: 0,
      segment_count: 0,
      duration_non_null_count: 0,
      duration_null_count: 0,
      bin_distribution: {
        le_0_2km_null: 0,
        le_1km: 0,
        le_3km: 0,
        le_7km: 0,
        le_15km: 0,
        le_30km: 0,
        gt_30km: 0,
        invalid_null: 0,
      },
      mode: "unknown",
      sanity_violations: [],
    });
  });

  test("eligible_pair_count: coords ある pair のみカウント", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: null }),
      mkEvent({ id: "e3", coordinates: coordsAtKmEast(2) }),
    ];
    // build は e1-e2 / e2-e3 両方座標欠損 → segment 0
    const tel = computeSegmentsBuiltTelemetry(events, []);
    expect(tel.eligible_pair_count).toBe(0);
  });

  test("duration null / non-null count の分離", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(0.15) }),
      mkEvent({ id: "e3", coordinates: coordsAtKmEast(2) }),
    ];
    const segs = [
      mkSegment({ from: "e1", to: "e2", estimatedDurationMin: null }), // null
      mkSegment({ from: "e2", to: "e3", estimatedDurationMin: 15 }), // non-null
    ];
    const tel = computeSegmentsBuiltTelemetry(events, segs);
    expect(tel.duration_null_count).toBe(1);
    expect(tel.duration_non_null_count).toBe(1);
  });

  test("T-G: mode は segments[0].mode を採用、空なら unknown", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(2) }),
    ];
    const walk = computeSegmentsBuiltTelemetry(events, [
      mkSegment({ from: "e1", to: "e2", mode: "walk" }),
    ]);
    expect(walk.mode).toBe("walk");
    const empty = computeSegmentsBuiltTelemetry(events, []);
    expect(empty.mode).toBe("unknown");
  });
});

describe("computeSegmentsBuiltTelemetry — heuristic 整合", () => {
  test("T-F: VALID_TABLE_DURATION_VALUES は heuristic table の非 null 値集合 {10,15,25,40,60,90} と一致", () => {
    // durationHeuristic.NEUTRAL_DURATION_TABLE が module 外非公開のため、
    // 値集合を本テスト側で期待値として固定する。table を tune したら本 test も更新。
    const expected = [10, 15, 25, 40, 60, 90].sort((a, b) => a - b);
    expect(
      Array.from(__VALID_TABLE_DURATION_VALUES_FOR_TEST).sort((a, b) => a - b),
    ).toEqual(expected);
  });
});
