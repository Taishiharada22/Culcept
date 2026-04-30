/**
 * computeSegmentsBuiltTelemetry / computeDisplayRenderedTelemetry
 *   — W3-PR-10 canary O2 / O3 契約テスト
 *
 * O2 カバレッジ:
 *   T-A: pure / 決定論 — 同じ入力で同じ出力
 *   T-B: bin_distribution の閾値境界
 *   T-C: sanity_violations (S1〜S4) の検知ルール
 *   T-D: 全 8 bin key を常に含む（count 0 も key あり）
 *   T-E: segments=[] / events<2 の edge case
 *   T-F: VALID_TABLE_DURATION_VALUES と durationHeuristic の table 整合
 *   T-G: mode 取り出し — segments[0].mode を採用、空なら "unknown"
 *
 * O3 カバレッジ:
 *   T-H: pure / 決定論 — display rendered telemetry
 *   T-I: segment_count / travel_rendered_count / skipped_null_count の一致
 *   T-J: fake_zero_travel_count — 0 分 travel 検知（regression canary）
 *   T-K: invariant 違反（interleave で event_id mismatch → travel 落ち）を数値で検知可能
 *   T-L: 空入力 edge case
 */

import { describe, test, expect } from "vitest";

import {
  computeSegmentsBuiltTelemetry,
  computeDisplayRenderedTelemetry,
  __VALID_TABLE_DURATION_VALUES_FOR_TEST,
  type TransportBinKey,
} from "@/lib/alter-morning/transport/telemetry";
import {
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { TransportSegment } from "@/lib/alter-morning/transport/types";
import type { PlanItem } from "@/lib/alter-morning/types";
import {
  synthesizeTravelItems,
  interleaveTravelItems,
} from "@/lib/alter-morning/planning/synthesizeTravelItems";

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// O3: computeDisplayRenderedTelemetry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * PlanItem(kind="fixed") の最小 fixture。interleave の input として events を
 * items 変換した想定で使う（build の items は event-only、travel は含まれない）。
 */
function mkEventItem(id: string): PlanItem {
  return {
    id,
    kind: "fixed",
    text: id,
    what: null,
    durationMin: 60,
    durationSource: "inferred",
    fixedStart: false,
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
  };
}

/**
 * synthesize バグ再現用: kind="travel" かつ durationMin=0 の手組み PlanItem。
 * 実装の synthesize は null-skip するので現実にはこの構造は出ないが、
 * regression canary（fake_zero_travel_count）が発火するかを直接テストする。
 */
function mkZeroTravelItem(id: string): PlanItem {
  return {
    id,
    kind: "travel",
    text: "🚗 x→y",
    what: null,
    durationMin: 0,
    durationSource: "inferred",
    fixedStart: false,
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
  };
}

describe("computeDisplayRenderedTelemetry — pure / 決定論", () => {
  test("T-H: 同じ入力で出力が等価（deep equal）", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(2) }),
    ];
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 15 })];
    const entries = synthesizeTravelItems(segs, events);
    const items = interleaveTravelItems(events.map((e) => mkEventItem(e.event_id)), entries);
    const a = computeDisplayRenderedTelemetry(segs, items);
    const b = computeDisplayRenderedTelemetry(segs, items);
    expect(a).toEqual(b);
  });
});

describe("computeDisplayRenderedTelemetry — count invariants", () => {
  test("T-I: 正常系 — segment_count === travel_rendered_count + skipped_null_count", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(0.15) }), // ≤0.2km
      mkEvent({ id: "e3", coordinates: coordsAtKmEast(5) }),
    ];
    const segs = [
      mkSegment({ from: "e1", to: "e2", estimatedDurationMin: null }), // null-skip
      mkSegment({ from: "e2", to: "e3", estimatedDurationMin: 25 }),   // renders
    ];
    const entries = synthesizeTravelItems(segs, events);
    const items = interleaveTravelItems(events.map((e) => mkEventItem(e.event_id)), entries);
    const tel = computeDisplayRenderedTelemetry(segs, items);

    expect(tel.segment_count).toBe(2);
    expect(tel.travel_rendered_count).toBe(1);
    expect(tel.skipped_null_count).toBe(1);
    expect(tel.fake_zero_travel_count).toBe(0);
    // invariant: segment_count === travel_rendered_count + skipped_null_count
    expect(tel.segment_count).toBe(
      tel.travel_rendered_count + tel.skipped_null_count,
    );
  });

  test("T-I: 全 null → travel_rendered_count=0, skipped_null_count=segment_count", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(0.15) }),
      mkEvent({ id: "e3", coordinates: coordsAtKmEast(0.1) }),
    ];
    const segs = [
      mkSegment({ from: "e1", to: "e2", estimatedDurationMin: null }),
      mkSegment({ from: "e2", to: "e3", estimatedDurationMin: null }),
    ];
    const entries = synthesizeTravelItems(segs, events);
    const items = interleaveTravelItems(events.map((e) => mkEventItem(e.event_id)), entries);
    const tel = computeDisplayRenderedTelemetry(segs, items);

    expect(tel.segment_count).toBe(2);
    expect(tel.travel_rendered_count).toBe(0);
    expect(tel.skipped_null_count).toBe(2);
  });

  test("T-J: fake_zero_travel_count — durationMin=0 travel を検知", () => {
    const zeroItems: PlanItem[] = [
      mkEventItem("e1"),
      mkZeroTravelItem("travel__e1__e2"),
      mkEventItem("e2"),
    ];
    // segments は fake 0分 source としては無関係。fake_zero は travel の durationMin のみ見る。
    const tel = computeDisplayRenderedTelemetry([], zeroItems);
    expect(tel.travel_rendered_count).toBe(1);
    expect(tel.fake_zero_travel_count).toBe(1);
  });

  test("T-J: 正常 travel (durationMin=15) は fake_zero にカウントされない", () => {
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(2) }),
    ];
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 15 })];
    const entries = synthesizeTravelItems(segs, events);
    const items = interleaveTravelItems(events.map((e) => mkEventItem(e.event_id)), entries);
    const tel = computeDisplayRenderedTelemetry(segs, items);
    expect(tel.fake_zero_travel_count).toBe(0);
  });

  test("T-K: invariant 違反 — event_id mismatch で interleave が落とした時、差分が出る", () => {
    // synthesize は e1→e2 travel を作る。interleave の eventItems が e2 のみ
    // （e1 が存在しない）の場合、entry.afterEventId='e1' がどの ev.id にもマッチせず
    // skip される → travel が UI に出ない → travel_rendered_count=0
    const events = [
      mkEvent({ id: "e1", coordinates: BASE }),
      mkEvent({ id: "e2", coordinates: coordsAtKmEast(2) }),
    ];
    const segs = [mkSegment({ from: "e1", to: "e2", estimatedDurationMin: 15 })];
    const entries = synthesizeTravelItems(segs, events);
    // 意図的に e2 だけを eventItems にして entry.afterEventId="e1" を miss させる
    const items = interleaveTravelItems([mkEventItem("e2")], entries);
    const tel = computeDisplayRenderedTelemetry(segs, items);

    expect(tel.segment_count).toBe(1);
    expect(tel.travel_rendered_count).toBe(0);
    expect(tel.skipped_null_count).toBe(0);
    // 差分: segment_count - (travel_rendered + skipped_null) === 1 → invariant 違反を SQL で検知可能
    expect(
      tel.segment_count - tel.travel_rendered_count - tel.skipped_null_count,
    ).toBe(1);
  });

  test("T-L: 空入力 → すべて 0", () => {
    const tel = computeDisplayRenderedTelemetry([], []);
    expect(tel).toEqual({
      segment_count: 0,
      travel_rendered_count: 0,
      skipped_null_count: 0,
      fake_zero_travel_count: 0,
    });
  });

  test("T-L: items は kind!=='travel' のみ → travel_rendered_count=0", () => {
    const items = [mkEventItem("e1"), mkEventItem("e2")];
    const tel = computeDisplayRenderedTelemetry([], items);
    expect(tel.travel_rendered_count).toBe(0);
  });
});
