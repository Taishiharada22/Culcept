/**
 * planRebuild — W3-PR-10 Phase 1 Domain Model
 *
 * カバレッジ:
 *   C6: flag OFF compat
 *     - enableTransportV2=false 時 transportSegments key を返り値に含めない
 *       （undefined も含めない、conditional spread で object から落ちる）
 *     - items 内容は pre-PR-10 の eventToPlanItem 出力と同一
 *   C7: flag ON + coordinates 未確定 pair invariant
 *     - 両端 where.coordinates が揃った隣接 event pair のみ segment を生成
 *     - 片方でも null/undefined の pair は segment 不生成（heuristic 禁止）
 *     - mainTransport を受ければ全 segment の mode として使う（per-segment 推定なし）
 *     - segment の estimatedDurationMin / distanceM は null（Phase 2 以降で埋める）
 *     - confidence は mainTransport ありなら "inferred"、なしなら "default"
 *     - source は "default_walk"（Phase 1 固定）
 */
import { describe, test, expect } from "vitest";

import { buildPlanAndSegmentsFromEvents } from "@/lib/alter-morning/planning/planRebuild";
import {
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";

function mkEvent(opts: {
  id: string;
  startTime?: string | null;
  placeRef: string;
  activity: string;
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
      startTime: opts.startTime ?? null,
      timeHint: null,
      provenance: utteranceProvenance(
        opts.startTime ? [opts.startTime] : [],
        "high",
      ),
    },
    where: {
      place_ref: opts.placeRef,
      placeType: "exact_proper_noun",
      coordinates: opts.coordinates ?? null,
      provenance: utteranceProvenance([opts.placeRef], "high"),
    },
    what: {
      activity: opts.activity,
      activityCanonical: opts.activity,
      provenance: utteranceProvenance([opts.activity], "high"),
    },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

describe("buildPlanAndSegmentsFromEvents — C6 flag OFF compat", () => {
  test("enableTransportV2=false → 返り値に transportSegments key が含まれない", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        startTime: "09:00",
        placeRef: "サドヤ",
        activity: "コーヒー",
        coordinates: { lat: 35.68, lng: 139.77 },
      }),
      mkEvent({
        id: "evt_2",
        startTime: "12:00",
        placeRef: "渋谷",
        activity: "ランチ",
        coordinates: { lat: 35.66, lng: 139.7 },
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });

    expect(result.items).toHaveLength(2);
    // conditional spread 契約: key 自体が存在しない（undefined も含めない）
    expect("transportSegments" in result).toBe(false);
    // JSON 直列化で転送される前提: stringify しても transportSegments は出ない
    expect(JSON.stringify(result)).not.toContain("transportSegments");
  });

  test("enableTransportV2=false でも coordinates 欠落があっても items は正常生成される", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        startTime: "09:00",
        placeRef: "未確定",
        activity: "予定",
        coordinates: null,
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("evt_1");
    expect("transportSegments" in result).toBe(false);
  });

  test("events=[] でも空 items を返し、flag OFF では transportSegments key は立たない", () => {
    const result = buildPlanAndSegmentsFromEvents({
      events: [],
      enableTransportV2: false,
    });

    expect(result.items).toEqual([]);
    expect("transportSegments" in result).toBe(false);
  });
});

describe("buildPlanAndSegmentsFromEvents — C7 flag ON", () => {
  test("両端 coordinates 揃った隣接 pair → segment 生成", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        startTime: "09:00",
        placeRef: "サドヤ",
        activity: "コーヒー",
        coordinates: { lat: 35.68, lng: 139.77 },
      }),
      mkEvent({
        id: "evt_2",
        startTime: "12:00",
        placeRef: "渋谷",
        activity: "ランチ",
        coordinates: { lat: 35.66, lng: 139.7 },
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
    });

    expect(result.transportSegments).toBeDefined();
    expect(result.transportSegments).toHaveLength(1);
    const seg = result.transportSegments![0];
    expect(seg.fromEventId).toBe("evt_1");
    expect(seg.toEventId).toBe("evt_2");
    // Phase 1: mode 推定なし、mainTransport 未指定 → "unknown"
    expect(seg.mode).toBe("unknown");
    // Phase 1: Routes API 未接続 → null
    expect(seg.estimatedDurationMin).toBeNull();
    expect(seg.distanceM).toBeNull();
    // mainTransport なしは "default"
    expect(seg.confidence).toBe("default");
    expect(seg.source).toBe("default_walk");
  });

  test("片方の coordinates 欠落 → segment 不生成（heuristic placeholder 禁止）", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "サドヤ",
        activity: "コーヒー",
        coordinates: { lat: 35.68, lng: 139.77 },
      }),
      mkEvent({
        id: "evt_2",
        placeRef: "未確定",
        activity: "ランチ",
        coordinates: null,
      }),
      mkEvent({
        id: "evt_3",
        placeRef: "渋谷",
        activity: "ミーティング",
        coordinates: { lat: 35.66, lng: 139.7 },
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
    });

    // 3 events → 隣接 pair は (1,2) と (2,3)。どちらも evt_2 の coordinates null のため
    // 全て skip される。canonical edge は 0 件（不完全情報で捏造しない invariant）
    expect(result.transportSegments).toEqual([]);
  });

  test("両端 coordinates 揃った pair + 欠落 pair 混在 → 揃った pair のみ segment 生成", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "サドヤ",
        activity: "コーヒー",
        coordinates: { lat: 35.68, lng: 139.77 },
      }),
      mkEvent({
        id: "evt_2",
        placeRef: "渋谷",
        activity: "ランチ",
        coordinates: { lat: 35.66, lng: 139.7 },
      }),
      mkEvent({
        id: "evt_3",
        placeRef: "未確定",
        activity: "買い物",
        coordinates: null,
      }),
      mkEvent({
        id: "evt_4",
        placeRef: "新宿",
        activity: "夕食",
        coordinates: { lat: 35.69, lng: 139.7 },
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
    });

    // (1,2) → 揃っているので生成
    // (2,3) → evt_3 座標欠落で skip
    // (3,4) → evt_3 座標欠落で skip
    expect(result.transportSegments).toHaveLength(1);
    expect(result.transportSegments![0].fromEventId).toBe("evt_1");
    expect(result.transportSegments![0].toEventId).toBe("evt_2");
  });

  test("mainTransport 指定時は全 segment の mode として使う + confidence='inferred'", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "サドヤ",
        activity: "コーヒー",
        coordinates: { lat: 35.68, lng: 139.77 },
      }),
      mkEvent({
        id: "evt_2",
        placeRef: "渋谷",
        activity: "ランチ",
        coordinates: { lat: 35.66, lng: 139.7 },
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
      mainTransport: "walk",
    });

    expect(result.transportSegments).toHaveLength(1);
    expect(result.transportSegments![0].mode).toBe("walk");
    expect(result.transportSegments![0].confidence).toBe("inferred");
  });

  test("events.length < 2 → segment は空配列（key は存在する）", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "サドヤ",
        activity: "コーヒー",
        coordinates: { lat: 35.68, lng: 139.77 },
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
    });

    expect(result.items).toHaveLength(1);
    // flag ON 契約: 0 件でも空配列を返す（undefined にしない）
    expect(result.transportSegments).toEqual([]);
    expect("transportSegments" in result).toBe(true);
  });

  test("events=[] + flag ON → items=[] + transportSegments=[]", () => {
    const result = buildPlanAndSegmentsFromEvents({
      events: [],
      enableTransportV2: true,
    });

    expect(result.items).toEqual([]);
    expect(result.transportSegments).toEqual([]);
  });
});

describe("buildPlanAndSegmentsFromEvents — purity invariant", () => {
  test("関数は副作用なく、同じ input で deterministic に同じ output を返す", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        startTime: "09:00",
        placeRef: "サドヤ",
        activity: "コーヒー",
        coordinates: { lat: 35.68, lng: 139.77 },
      }),
      mkEvent({
        id: "evt_2",
        startTime: "12:00",
        placeRef: "渋谷",
        activity: "ランチ",
        coordinates: { lat: 35.66, lng: 139.7 },
      }),
    ];

    const a = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
    });
    const b = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
    });

    // JSON 等価（参照は別だが中身は同じ = pure）
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("enableTransportV2 差分のみで output 形状が変わる（env を読まない契約）", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "サドヤ",
        activity: "コーヒー",
        coordinates: { lat: 35.68, lng: 139.77 },
      }),
      mkEvent({
        id: "evt_2",
        placeRef: "渋谷",
        activity: "ランチ",
        coordinates: { lat: 35.66, lng: 139.7 },
      }),
    ];

    const off = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    const on = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
    });

    // items は flag に依存しない
    expect(JSON.stringify(off.items)).toBe(JSON.stringify(on.items));
    // transportSegments だけが差分
    expect("transportSegments" in off).toBe(false);
    expect("transportSegments" in on).toBe(true);
  });
});
