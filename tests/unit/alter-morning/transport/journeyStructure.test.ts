/**
 * Journey 構造 (CEO 2026-04-28): anchor → ... → endpoint
 *
 * 検証観点:
 *   1. resolveJourneyEndAnchor が homeAnchor から round-trip default を派生
 *   2. buildTransportSegments が last_event → ENDPOINT_SENTINEL を追加
 *   3. synthesizeTravelItems が ENDPOINT_SENTINEL toEventId で journeyEnd.label を使う
 *   4. interleaveTravelItems が endpoint travel を最後の event の直後に挿入
 *   5. 構造的 invariant: [home_travel?, ...events_with_inter_travels, last_travel_to_endpoint?]
 *   6. journeyEnd=null → endpoint segment 不生成
 *   7. last event coords 無し → endpoint segment 不生成
 *   8. round-trip で homeAnchor === journeyEnd 座標 → 距離≈0 → null skip
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
  ENDPOINT_TRAVEL_SENTINEL_ID,
  resolveHomeAnchor,
  resolveJourneyEndAnchor,
  type HomeAnchor,
  type JourneyEndAnchor,
} from "@/lib/alter-morning/planning/transportContext";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

function mkEvent(opts: {
  id?: string;
  startTime?: string | null;
  placeRef?: string;
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
      activity: "コーヒー",
      activityCanonical: "カフェ",
      provenance: utteranceProvenance(["コーヒー"], "high"),
    },
    who: [],
    transport: opts.transport ?? null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

const SHIBUYA = { lat: 35.6587, lng: 139.6997 };
const SHINJUKU = { lat: 35.6896, lng: 139.6917 };
const HOME_FAR = { lat: 35.6, lng: 139.6 }; // 渋谷から数 km 離れた home
const HOME_AT_SHIBUYA = { lat: 35.6587, lng: 139.6997 }; // 渋谷とほぼ同じ場所

describe("resolveJourneyEndAnchor — round-trip default", () => {
  it("homeAnchor から座標を継承し、label='帰宅' / source='default_round_trip' を作る", () => {
    const home: HomeAnchor = {
      lat: 35.6,
      lng: 139.7,
      label: "現在地",
      source: "current",
    };
    const result = resolveJourneyEndAnchor(home);
    expect(result).toEqual({
      lat: 35.6,
      lng: 139.7,
      label: "帰宅",
      source: "default_round_trip",
    });
  });

  it("homeAnchor=null → null (CEO 案 1: hallucination 防止)", () => {
    expect(resolveJourneyEndAnchor(null)).toBeNull();
  });

  it("registered_home origin でも label='帰宅' (origin の label に依存しない)", () => {
    const home: HomeAnchor = {
      lat: 35.7,
      lng: 139.5,
      label: "自宅",
      source: "registered_home",
    };
    const result = resolveJourneyEndAnchor(home);
    expect(result?.label).toBe("帰宅");
  });
});

describe("buildPlanAndSegmentsFromEvents — endpoint segment (CEO 2026-04-28 Journey)", () => {
  const homeAnchor: HomeAnchor = {
    ...HOME_FAR,
    label: "現在地",
    source: "current",
  };

  it("[1-event plan + journey] home → first_event + last_event → endpoint の 2 segments", () => {
    const journeyEnd = resolveJourneyEndAnchor(homeAnchor)!;
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
      homeAnchor,
      journeyEnd,
    });

    expect(result.transportSegments).toHaveLength(2);
    // [0] HOME → evt_1
    expect(result.transportSegments![0].fromEventId).toBe(HOME_TRAVEL_SENTINEL_ID);
    expect(result.transportSegments![0].toEventId).toBe("evt_1");
    // [1] evt_1 → ENDPOINT
    expect(result.transportSegments![1].fromEventId).toBe("evt_1");
    expect(result.transportSegments![1].toEventId).toBe(ENDPOINT_TRAVEL_SENTINEL_ID);
  });

  it("[2-event plan + journey] home + 2 inter + endpoint = 4 segments? いや home + inter + endpoint = 3", () => {
    const journeyEnd = resolveJourneyEndAnchor(homeAnchor)!;
    const events = [
      mkEvent({ id: "evt_1", startTime: "09:00", coordinates: SHIBUYA }),
      mkEvent({
        id: "evt_2",
        startTime: "12:00",
        placeRef: "新宿",
        coordinates: SHINJUKU,
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
      mainTransport: "public_transit",
      homeAnchor,
      journeyEnd,
    });

    expect(result.transportSegments).toHaveLength(3);
    expect(result.transportSegments![0].fromEventId).toBe(HOME_TRAVEL_SENTINEL_ID);
    expect(result.transportSegments![0].toEventId).toBe("evt_1");
    expect(result.transportSegments![1].fromEventId).toBe("evt_1");
    expect(result.transportSegments![1].toEventId).toBe("evt_2");
    expect(result.transportSegments![2].fromEventId).toBe("evt_2");
    expect(result.transportSegments![2].toEventId).toBe(ENDPOINT_TRAVEL_SENTINEL_ID);
  });

  it("[journeyEnd=null] endpoint segment 不生成 (home segment はあれば残る)", () => {
    const events = [
      mkEvent({ id: "evt_1", coordinates: SHIBUYA }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
      mainTransport: "public_transit",
      homeAnchor,
      journeyEnd: null,
    });

    expect(result.transportSegments).toHaveLength(1);
    expect(result.transportSegments![0].fromEventId).toBe(HOME_TRAVEL_SENTINEL_ID);
    // ENDPOINT segment は生成されない
    expect(
      result.transportSegments!.find((s) => s.toEventId === ENDPOINT_TRAVEL_SENTINEL_ID),
    ).toBeUndefined();
  });

  it("[last event no coords] endpoint segment 不生成 (hallucination 防止)", () => {
    const journeyEnd = resolveJourneyEndAnchor(homeAnchor)!;
    const events = [
      mkEvent({ id: "evt_1", placeRef: "渋谷のスタバ", coordinates: null }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
      mainTransport: "public_transit",
      homeAnchor,
      journeyEnd,
    });

    // home も endpoint も先頭/末尾 event の coords が無いので 0 segment
    expect(result.transportSegments).toHaveLength(0);
  });

  it("[round-trip 同座標] home === endpoint 座標 → 0距離 → endpoint 不生成 (≤0.2km null skip)", () => {
    const homeAtShibuya: HomeAnchor = {
      ...HOME_AT_SHIBUYA,
      label: "現在地",
      source: "current",
    };
    const journeyEnd = resolveJourneyEndAnchor(homeAtShibuya)!;
    const events = [
      mkEvent({ id: "evt_1", coordinates: SHIBUYA }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: true,
      mainTransport: "public_transit",
      homeAnchor: homeAtShibuya,
      journeyEnd,
    });

    // home → evt_1 も evt_1 → endpoint も 0 距離 → 両方 null → 両方不生成
    // safety net: estimateNeutralDurationMin が ≤0.2km で null を返すため
    expect(result.transportSegments).toHaveLength(0);
  });
});

describe("synthesizeTravelItems — ENDPOINT_SENTINEL toEventId", () => {
  it("ENDPOINT_SENTINEL を持つ segment は journeyEnd.label を to に使う", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "TSUTAYA 渋谷店",
        coordinates: SHIBUYA,
      }),
    ];
    const segments = [
      {
        fromEventId: "evt_1",
        toEventId: ENDPOINT_TRAVEL_SENTINEL_ID,
        mode: "public_transit" as const,
        estimatedDurationMin: 25,
        durationSource: "heuristic" as const,
        distanceM: null,
        confidence: "inferred" as const,
        source: "default_walk" as const,
      },
    ];
    const journeyEnd: JourneyEndAnchor = {
      lat: HOME_FAR.lat,
      lng: HOME_FAR.lng,
      label: "帰宅",
      source: "default_round_trip",
    };

    const entries = synthesizeTravelItems(segments, events, null, journeyEnd);

    expect(entries).toHaveLength(1);
    expect(entries[0].afterEventId).toBe("evt_1"); // last event の直後
    expect(entries[0].item.travelFrom).toBe("TSUTAYA 渋谷店");
    expect(entries[0].item.travelTo).toBe("帰宅");
    expect(entries[0].item.text).toContain("帰宅");
    expect(entries[0].item.travelTransport).toBe("train"); // public_transit → train
  });

  it("[defensive] journeyEnd=null なら ENDPOINT_SENTINEL segment を skip", () => {
    const events = [mkEvent({ id: "evt_1", coordinates: SHIBUYA })];
    const segments = [
      {
        fromEventId: "evt_1",
        toEventId: ENDPOINT_TRAVEL_SENTINEL_ID,
        mode: "walk" as const,
        estimatedDurationMin: 25,
        durationSource: "heuristic" as const,
        distanceM: null,
        confidence: "inferred" as const,
        source: "default_walk" as const,
      },
    ];
    // journeyEnd 未渡し
    const entries = synthesizeTravelItems(segments, events, null);
    expect(entries).toHaveLength(0);
  });

  it("HOME + ENDPOINT 両方を 1 plan で正しく label 解決", () => {
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
      {
        fromEventId: "evt_1",
        toEventId: ENDPOINT_TRAVEL_SENTINEL_ID,
        mode: "public_transit" as const,
        estimatedDurationMin: 25,
        durationSource: "heuristic" as const,
        distanceM: null,
        confidence: "inferred" as const,
        source: "default_walk" as const,
      },
    ];
    const home: HomeAnchor = {
      lat: HOME_FAR.lat,
      lng: HOME_FAR.lng,
      label: "現在地",
      source: "current",
    };
    const journeyEnd = resolveJourneyEndAnchor(home)!;

    const entries = synthesizeTravelItems(segments, events, home, journeyEnd);

    expect(entries).toHaveLength(2);
    expect(entries[0].item.travelFrom).toBe("現在地");
    expect(entries[0].item.travelTo).toBe("TSUTAYA 渋谷店");
    expect(entries[1].item.travelFrom).toBe("TSUTAYA 渋谷店");
    expect(entries[1].item.travelTo).toBe("帰宅");
  });
});

describe("interleaveTravelItems — endpoint segment placement", () => {
  it("[ROOT CAUSE] [home, evt_1, endpoint] という travel sequence で正しい順序になる", () => {
    const eventItem = {
      id: "evt_1",
      kind: "fixed" as const,
      text: "09:00 TSUTAYA 渋谷店",
      what: "コーヒー",
      startTime: "09:00",
      durationMin: 45,
      durationSource: "inferred" as const,
      fixedStart: true,
      orderHint: 0,
      sourceTurnIndex: 0,
      completed: false,
    };
    const homeTravel = {
      id: "travel____home____evt_1",
      kind: "travel" as const,
      text: "🚃 現在地→TSUTAYA",
      durationMin: 27,
      durationSource: "inferred" as const,
      fixedStart: false,
      orderHint: 0,
      sourceTurnIndex: 0,
      completed: false,
      travelFrom: "現在地",
      travelTo: "TSUTAYA",
      travelTransport: "train" as const,
      what: null,
    };
    const endpointTravel = {
      id: "travel__evt_1____endpoint__",
      kind: "travel" as const,
      text: "🚃 TSUTAYA→帰宅",
      durationMin: 25,
      durationSource: "inferred" as const,
      fixedStart: false,
      orderHint: 0,
      sourceTurnIndex: 0,
      completed: false,
      travelFrom: "TSUTAYA",
      travelTo: "帰宅",
      travelTransport: "train" as const,
      what: null,
    };

    const result = interleaveTravelItems(
      [eventItem],
      [
        { afterEventId: HOME_TRAVEL_SENTINEL_ID, item: homeTravel },
        { afterEventId: "evt_1", item: endpointTravel },
      ],
    );

    expect(result).toHaveLength(3);
    // 期待順序: [home_travel, evt_1, endpoint_travel]
    expect(result[0].id).toBe("travel____home____evt_1");
    expect(result[1].id).toBe("evt_1");
    expect(result[2].id).toBe("travel__evt_1____endpoint__");
    // orderHint 再付番
    expect(result.map((i) => i.orderHint)).toEqual([0, 1, 2]);
  });

  it("[2-event plan] home → evt_1 → inter → evt_2 → endpoint の 5-item 順序", () => {
    const evt1 = {
      id: "evt_1",
      kind: "fixed" as const,
      text: "09:00 TSUTAYA",
      what: "コーヒー",
      startTime: "09:00",
      durationMin: 45,
      durationSource: "inferred" as const,
      fixedStart: true,
      orderHint: 0,
      sourceTurnIndex: 0,
      completed: false,
    };
    const evt2 = {
      id: "evt_2",
      kind: "fixed" as const,
      text: "12:00 新宿",
      what: "ランチ",
      startTime: "12:00",
      durationMin: 45,
      durationSource: "inferred" as const,
      fixedStart: true,
      orderHint: 1,
      sourceTurnIndex: 0,
      completed: false,
    };
    const homeTravel = {
      id: "travel____home____evt_1",
      kind: "travel" as const,
      text: "🚃 現在地→TSUTAYA",
      durationMin: 27,
      durationSource: "inferred" as const,
      fixedStart: false,
      orderHint: 0,
      sourceTurnIndex: 0,
      completed: false,
      travelFrom: "現在地",
      travelTo: "TSUTAYA",
      travelTransport: "train" as const,
      what: null,
    };
    const interTravel = {
      id: "travel__evt_1__evt_2",
      kind: "travel" as const,
      text: "🚃 TSUTAYA→新宿",
      durationMin: 30,
      durationSource: "inferred" as const,
      fixedStart: false,
      orderHint: 0,
      sourceTurnIndex: 0,
      completed: false,
      travelFrom: "TSUTAYA",
      travelTo: "新宿",
      travelTransport: "train" as const,
      what: null,
    };
    const endpointTravel = {
      id: "travel__evt_2____endpoint__",
      kind: "travel" as const,
      text: "🚃 新宿→帰宅",
      durationMin: 25,
      durationSource: "inferred" as const,
      fixedStart: false,
      orderHint: 0,
      sourceTurnIndex: 0,
      completed: false,
      travelFrom: "新宿",
      travelTo: "帰宅",
      travelTransport: "train" as const,
      what: null,
    };

    const result = interleaveTravelItems(
      [evt1, evt2],
      [
        { afterEventId: HOME_TRAVEL_SENTINEL_ID, item: homeTravel },
        { afterEventId: "evt_1", item: interTravel },
        { afterEventId: "evt_2", item: endpointTravel },
      ],
    );

    expect(result).toHaveLength(5);
    expect(result.map((i) => i.id)).toEqual([
      "travel____home____evt_1",
      "evt_1",
      "travel__evt_1__evt_2",
      "evt_2",
      "travel__evt_2____endpoint__",
    ]);
    expect(result.map((i) => i.orderHint)).toEqual([0, 1, 2, 3, 4]);
  });
});
