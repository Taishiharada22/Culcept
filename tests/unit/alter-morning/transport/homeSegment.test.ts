/**
 * home segment integration — CEO 2026-04-28 Option B
 *
 * 検証観点（goal-back からの逆算）:
 *
 *   Stage 1: events.transport bound (answerBinder 既存テスト)
 *   Stage 2: planState.transport (skip — V2 経路では使用しない)
 *   Stage 3: dayConditions.mainTransport (legacyAdapter で derive — 別 test)
 *   Stage 4: buildPlanAndSegmentsFromEvents が transportSegments を生成
 *     → 本テスト
 *   Stage 5: synthesizeTravelItems が HOME_SENTINEL を解決して travel item を作る
 *     → 本テスト
 *   Stage 6: plan.items に kind:"travel" が入る
 *     → 本テスト
 *   Stage 7: MorningPlanCard が描画 (UI、既存)
 *
 * カバー:
 *   1. 1-event plan + homeAnchor + first event coords → home travel segment 生成
 *   2. 1-event plan + first event 座標なし → home segment 不生成（hallucination 防止）
 *   3. homeAnchor=null → home segment 不生成
 *   4. 0-event plan + homeAnchor → home segment 不生成
 *   5. 2-event plan + homeAnchor → home segment + event-pair segment 両方
 *   6. synthesizeTravelItems が HOME_SENTINEL fromEventId を homeAnchor.label で解決
 *   7. interleaveTravelItems が HOME_SENTINEL entry を eventItems の前に prepend
 *   8. mainTransport=public_transit + homeAnchor → travel.travelTransport="train"
 *   9. ≤0.2km の home → first event は estimateNeutralDurationMin が null → segment 不生成
 *  10. homeAnchor だけで homeAnchor 未渡し時の synthesize は HOME_SENTINEL segment を skip（defensive）
 */

import { describe, it, expect } from "vitest";
import {
  buildPlanAndSegmentsFromEvents,
} from "@/lib/alter-morning/planning/planRebuild";
import {
  synthesizeTravelItems,
  interleaveTravelItems,
} from "@/lib/alter-morning/planning/synthesizeTravelItems";
import {
  HOME_TRAVEL_SENTINEL_ID,
  type HomeAnchor,
} from "@/lib/alter-morning/planning/transportContext";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { PlanItem } from "@/lib/alter-morning/types";

function mkEvent(opts: {
  id?: string;
  startTime?: string | null;
  placeRef?: string;
  activity?: string;
  coordinates?: { lat: number; lng: number } | null;
  transport?: string | null;
}): Event {
  return {
    event_id: opts.id ?? "evt_1",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    certainty: "asserted",
    when: {
      startTime: opts.startTime ?? null,
      timeHint: null,
      provenance: opts.startTime
        ? utteranceProvenance([opts.startTime], "high")
        : inferredProvenance(),
    },
    where: {
      place_ref: opts.placeRef ?? "TSUTAYA",
      placeType: "exact_proper_noun",
      coordinates: opts.coordinates ?? null,
      provenance: utteranceProvenance([opts.placeRef ?? "TSUTAYA"], "high"),
    },
    what: {
      activity: opts.activity ?? "コーヒー",
      activityCanonical: opts.activity ?? "カフェ",
      provenance: utteranceProvenance([opts.activity ?? "コーヒー"], "high"),
    },
    who: [],
    transport: opts.transport ?? null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

const SHIBUYA: { lat: number; lng: number } = { lat: 35.6587, lng: 139.6997 };
const SHINJUKU: { lat: number; lng: number } = { lat: 35.6896, lng: 139.6917 };

const HOME_NEAR_SHIBUYA: HomeAnchor = {
  lat: 35.65,
  lng: 139.7,
  label: "現在地",
  source: "current",
};
const HOME_FAR_FROM_SHIBUYA: HomeAnchor = {
  lat: 35.6762, // 新宿付近
  lng: 139.6503,
  label: "自宅",
  source: "registered_home",
};

describe("buildPlanAndSegmentsFromEvents — home segment (CEO 2026-04-28 Option B)", () => {
  it("[1-event plan] homeAnchor + first event coords → home → first_event segment 1 件生成", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        startTime: "09:00",
        placeRef: "TSUTAYA 渋谷店",
        coordinates: SHIBUYA,
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
      mainTransport: "public_transit",
      homeAnchor: HOME_FAR_FROM_SHIBUYA,
    });

    expect(result.transportSegments).toHaveLength(1);
    const seg = result.transportSegments![0];
    expect(seg.fromEventId).toBe(HOME_TRAVEL_SENTINEL_ID);
    expect(seg.toEventId).toBe("evt_1");
    expect(seg.mode).toBe("public_transit");
    expect(seg.estimatedDurationMin).toBeGreaterThan(0);
    expect(seg.durationSource).toBe("heuristic");
    expect(seg.confidence).toBe("inferred"); // mainTransport 設定済み
  });

  it("[1-event plan] no first event coords → home segment 不生成 (hallucination 防止)", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        startTime: "09:00",
        placeRef: "渋谷のスタバ",
        coordinates: null, // ← 未確定
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
      mainTransport: "public_transit",
      homeAnchor: HOME_FAR_FROM_SHIBUYA,
    });

    expect(result.transportSegments).toHaveLength(0);
  });

  it("[1-event plan] homeAnchor=null → home segment 不生成 (CEO 案 1)", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        startTime: "09:00",
        placeRef: "TSUTAYA 渋谷店",
        coordinates: SHIBUYA,
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
      mainTransport: "public_transit",
      homeAnchor: null,
    });

    expect(result.transportSegments).toHaveLength(0);
  });

  it("[0-event plan] homeAnchor 渡しても home segment 不生成（first event 不在）", () => {
    const result = buildPlanAndSegmentsFromEvents({
      events: [],
      enableTransportV2: true,
      mainTransport: "public_transit",
      homeAnchor: HOME_FAR_FROM_SHIBUYA,
    });

    expect(result.transportSegments).toHaveLength(0);
  });

  it("[2-event plan] home segment + event-pair segment 両方生成", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        startTime: "09:00",
        placeRef: "TSUTAYA 渋谷店",
        coordinates: SHIBUYA,
      }),
      mkEvent({
        id: "evt_2",
        startTime: "12:00",
        placeRef: "新宿御苑",
        coordinates: SHINJUKU,
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
      mainTransport: "public_transit",
      homeAnchor: HOME_FAR_FROM_SHIBUYA,
    });

    expect(result.transportSegments).toHaveLength(2);
    expect(result.transportSegments![0].fromEventId).toBe(HOME_TRAVEL_SENTINEL_ID);
    expect(result.transportSegments![0].toEventId).toBe("evt_1");
    expect(result.transportSegments![1].fromEventId).toBe("evt_1");
    expect(result.transportSegments![1].toEventId).toBe("evt_2");
  });

  it("[mainTransport unspecified] mode='unknown' で home segment は生成される", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        startTime: "09:00",
        coordinates: SHIBUYA,
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
      // mainTransport unspecified
      homeAnchor: HOME_FAR_FROM_SHIBUYA,
    });

    expect(result.transportSegments).toHaveLength(1);
    expect(result.transportSegments![0].mode).toBe("unknown");
    expect(result.transportSegments![0].confidence).toBe("default"); // unknown mode
  });

  it("[flag OFF] enableTransportV2=false なら homeAnchor 渡しても transportSegments 自体不在", () => {
    const events = [
      mkEvent({ id: "evt_1", coordinates: SHIBUYA }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
      mainTransport: "public_transit",
      homeAnchor: HOME_FAR_FROM_SHIBUYA,
    });

    expect("transportSegments" in result).toBe(false);
  });
});

describe("synthesizeTravelItems — HOME_SENTINEL handling (CEO 2026-04-28 Option B)", () => {
  it("[ROOT CAUSE] HOME_SENTINEL fromEventId は homeAnchor.label で解決される", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "TSUTAYA 渋谷店",
        coordinates: SHIBUYA,
      }),
    ];
    const segments = [
      {
        fromEventId: HOME_TRAVEL_SENTINEL_ID,
        toEventId: "evt_1",
        mode: "public_transit" as const,
        estimatedDurationMin: 27,
        durationSource: "heuristic" as const,
        distanceM: null,
        confidence: "inferred" as const,
        source: "default_walk" as const,
      },
    ];
    const homeAnchor: HomeAnchor = {
      lat: 35.6762,
      lng: 139.6503,
      label: "現在地",
      source: "current",
    };

    const entries = synthesizeTravelItems(segments, events, homeAnchor);

    expect(entries).toHaveLength(1);
    expect(entries[0].afterEventId).toBe(HOME_TRAVEL_SENTINEL_ID);
    expect(entries[0].item.kind).toBe("travel");
    expect(entries[0].item.travelFrom).toBe("現在地");
    expect(entries[0].item.travelTo).toBe("TSUTAYA 渋谷店");
    expect(entries[0].item.text).toContain("現在地");
    expect(entries[0].item.text).toContain("TSUTAYA 渋谷店");
    expect(entries[0].item.travelTransport).toBe("train"); // public_transit → train (vc)
    expect(entries[0].item.durationMin).toBe(27);
  });

  it("[defensive] homeAnchor 未渡しなら HOME_SENTINEL segment を skip", () => {
    const events = [
      mkEvent({ id: "evt_1", coordinates: SHIBUYA }),
    ];
    const segments = [
      {
        fromEventId: HOME_TRAVEL_SENTINEL_ID,
        toEventId: "evt_1",
        mode: "public_transit" as const,
        estimatedDurationMin: 27,
        durationSource: "heuristic" as const,
        distanceM: null,
        confidence: "inferred" as const,
        source: "default_walk" as const,
      },
    ];

    const entries = synthesizeTravelItems(segments, events /* no homeAnchor */);

    expect(entries).toHaveLength(0); // skip home sentinel without anchor
  });

  it("[label] 自宅 source なら travelFrom='自宅'", () => {
    const events = [mkEvent({ id: "evt_1", coordinates: SHIBUYA })];
    const segments = [
      {
        fromEventId: HOME_TRAVEL_SENTINEL_ID,
        toEventId: "evt_1",
        mode: "walk" as const,
        estimatedDurationMin: 12,
        durationSource: "heuristic" as const,
        distanceM: null,
        confidence: "inferred" as const,
        source: "default_walk" as const,
      },
    ];
    const homeAnchor: HomeAnchor = {
      lat: 35.6762,
      lng: 139.6503,
      label: "自宅",
      source: "registered_home",
    };

    const entries = synthesizeTravelItems(segments, events, homeAnchor);

    expect(entries[0].item.travelFrom).toBe("自宅");
  });

  it("[null duration] estimatedDurationMin=null → travel item 不生成", () => {
    const events = [mkEvent({ id: "evt_1", coordinates: SHIBUYA })];
    const segments = [
      {
        fromEventId: HOME_TRAVEL_SENTINEL_ID,
        toEventId: "evt_1",
        mode: "public_transit" as const,
        estimatedDurationMin: null, // ≤0.2km の場合等
        durationSource: null,
        distanceM: null,
        confidence: "default" as const,
        source: "default_walk" as const,
      },
    ];
    const homeAnchor: HomeAnchor = {
      lat: 35.6762,
      lng: 139.6503,
      label: "現在地",
      source: "current",
    };

    const entries = synthesizeTravelItems(segments, events, homeAnchor);
    expect(entries).toHaveLength(0); // null-skip
  });
});

describe("interleaveTravelItems — HOME_SENTINEL prepend (CEO 2026-04-28 Option B)", () => {
  it("[1-event plan] HOME entry は eventItems の前に prepend される", () => {
    const eventItems: PlanItem[] = [
      {
        id: "evt_1",
        kind: "fixed",
        text: "09:00 TSUTAYA 渋谷店 コーヒー",
        what: "コーヒー",
        startTime: "09:00",
        durationMin: 45,
        durationSource: "inferred",
        fixedStart: true,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
      },
    ];
    const homeTravelItem: PlanItem = {
      id: "travel____home____evt_1",
      kind: "travel",
      text: "🚃 現在地→TSUTAYA 渋谷店",
      durationMin: 27,
      durationSource: "inferred",
      fixedStart: false,
      orderHint: 0,
      sourceTurnIndex: 0,
      completed: false,
      travelFrom: "現在地",
      travelTo: "TSUTAYA 渋谷店",
      travelTransport: "train",
      what: null,
    };

    const result = interleaveTravelItems(eventItems, [
      { afterEventId: HOME_TRAVEL_SENTINEL_ID, item: homeTravelItem },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("travel"); // home travel が先頭
    expect(result[0].id).toBe("travel____home____evt_1");
    expect(result[1].kind).toBe("fixed");
    expect(result[1].id).toBe("evt_1");
    // orderHint 再付番
    expect(result[0].orderHint).toBe(0);
    expect(result[1].orderHint).toBe(1);
  });

  it("[2-event plan] HOME prepend + event-pair travel が正しい順序で並ぶ", () => {
    const eventItems: PlanItem[] = [
      {
        id: "evt_1",
        kind: "fixed",
        text: "09:00 TSUTAYA",
        what: "コーヒー",
        startTime: "09:00",
        durationMin: 45,
        durationSource: "inferred",
        fixedStart: true,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
      },
      {
        id: "evt_2",
        kind: "fixed",
        text: "12:00 新宿御苑",
        what: "散策",
        startTime: "12:00",
        durationMin: 45,
        durationSource: "inferred",
        fixedStart: true,
        orderHint: 1,
        sourceTurnIndex: 0,
        completed: false,
      },
    ];
    const homeTravel: PlanItem = {
      id: "travel____home____evt_1",
      kind: "travel",
      text: "🚃 現在地→TSUTAYA",
      durationMin: 27,
      durationSource: "inferred",
      fixedStart: false,
      orderHint: 0,
      sourceTurnIndex: 0,
      completed: false,
      travelFrom: "現在地",
      travelTo: "TSUTAYA",
      travelTransport: "train",
      what: null,
    };
    const interTravel: PlanItem = {
      id: "travel__evt_1__evt_2",
      kind: "travel",
      text: "🚃 TSUTAYA→新宿御苑",
      durationMin: 30,
      durationSource: "inferred",
      fixedStart: false,
      orderHint: 0,
      sourceTurnIndex: 0,
      completed: false,
      travelFrom: "TSUTAYA",
      travelTo: "新宿御苑",
      travelTransport: "train",
      what: null,
    };

    const result = interleaveTravelItems(eventItems, [
      { afterEventId: HOME_TRAVEL_SENTINEL_ID, item: homeTravel },
      { afterEventId: "evt_1", item: interTravel },
    ]);

    expect(result).toHaveLength(4);
    expect(result.map((i) => i.id)).toEqual([
      "travel____home____evt_1", // 0: home prepend
      "evt_1", // 1: first event
      "travel__evt_1__evt_2", // 2: inter event
      "evt_2", // 3: second event
    ]);
    expect(result.map((i) => i.orderHint)).toEqual([0, 1, 2, 3]);
  });

  it("[entries=[]] events のみ pass-through", () => {
    const eventItems: PlanItem[] = [
      {
        id: "evt_1",
        kind: "fixed",
        text: "09:00 TSUTAYA",
        what: "コーヒー",
        startTime: "09:00",
        durationMin: 45,
        durationSource: "inferred",
        fixedStart: true,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
      },
    ];
    const result = interleaveTravelItems(eventItems, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("evt_1");
  });
});
