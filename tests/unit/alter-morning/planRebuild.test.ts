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
 *   C8: PlanItem.location 写像（PR-11 Step 3 最小根治）
 *     - event.where.place_ref → location.label / resolvedName
 *     - event.where.coordinates (有限数値) → location.lat / lng
 *     - label 空/空白のみ → location key 自体を返り値に含めない
 *     - 無効 coords (null/NaN/Infinity) → lat/lng を key ごと除外
 *     - canonicalId="" / source="user_explicit" (intentParser precedent)
 *     - flag (enableTransportV2) は location の構築に影響しない
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
    // Scope A: 両端 coords が揃った pair では中立距離 heuristic で duration を埋める。
    //   number 返り値なら durationSource="heuristic" と同期する（invariant）
    expect(typeof seg.estimatedDurationMin).toBe("number");
    expect(seg.durationSource).toBe("heuristic");
    // Scope A は Routes API 非接続なので distanceM は null 継続
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

describe("buildPlanAndSegmentsFromEvents — C8 location field (PR-11 Step 3 最小根治)", () => {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 位置づけ:
  //   eventToPlanItem が event.where を PlanItem.location に写像することの検証。
  //   MorningPlanCard render gate `whereSharpness === "fixed" && item.location?.label`
  //   が通るための必要条件。修正前は text field への join のみで、location を
  //   一切構築せず「確定済なのに場所名が UI に出ない」現象を起こしていた。
  //
  // 不変項（eventWhereToLocation 仕様、planRebuild.ts の JSDoc と一対一対応）:
  //   - label が空（空文字/空白のみ）なら location 自体 undefined → conditional spread で key 不含
  //   - label 在 + coords 有限数値 → lat/lng を含める
  //   - label 在 + coords null/NaN/Infinity → lat/lng は含めない（key 自体を落とす）
  //   - canonicalId は "" 固定（intentParser.ts:714-720 の precedent）
  //   - source は "user_explicit"（place_ref は user 発話 or selection 明示由来）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  test("place_ref + valid coordinates → PlanItem.location に label/resolvedName/lat/lng が揃う", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "サドヤ",
        activity: "コーヒー",
        coordinates: { lat: 35.68, lng: 139.77 },
      }),
    ];
    const { items } = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });

    expect(items).toHaveLength(1);
    expect(items[0].location).toBeDefined();
    expect(items[0].location!.label).toBe("サドヤ");
    expect(items[0].location!.resolvedName).toBe("サドヤ");
    // placeTable 解決は別レイヤなので canonicalId は "" precedent
    expect(items[0].location!.canonicalId).toBe("");
    // place_ref は utterance/selection いずれも user 明示として扱う
    expect(items[0].location!.source).toBe("user_explicit");
    expect(items[0].location!.lat).toBe(35.68);
    expect(items[0].location!.lng).toBe(139.77);
  });

  test("place_ref あり + coordinates=null → location は生成されるが lat/lng は key ごと除外", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "渋谷駅",
        activity: "集合",
        coordinates: null,
      }),
    ];
    const { items } = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });

    expect(items[0].location).toBeDefined();
    expect(items[0].location!.label).toBe("渋谷駅");
    expect(items[0].location!.resolvedName).toBe("渋谷駅");
    // conditional spread precedent: undefined 詰めずに key 自体を落とす
    expect("lat" in items[0].location!).toBe(false);
    expect("lng" in items[0].location!).toBe(false);
  });

  test("place_ref='' → PlanItem.location key 自体が含まれない（render gate と整合）", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "",
        activity: "予定",
        coordinates: null,
      }),
    ];
    const { items } = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });

    expect(items).toHaveLength(1);
    // MorningPlanCard `item.location?.label` guard と整合、
    // C6 conditional spread precedent（transportSegments）の踏襲
    expect(items[0].location).toBeUndefined();
    expect("location" in items[0]).toBe(false);
  });

  test("place_ref が空白のみ → label 扱いせず location を含めない（trim 判定）", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "   ",
        activity: "予定",
        coordinates: null,
      }),
    ];
    const { items } = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });

    expect("location" in items[0]).toBe(false);
  });

  test("coordinates.lat が NaN → label は入るが lat/lng は key ごと除外", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "渋谷",
        activity: "集合",
        coordinates: { lat: NaN, lng: 139.7 },
      }),
    ];
    const { items } = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });

    expect(items[0].location).toBeDefined();
    expect(items[0].location!.label).toBe("渋谷");
    expect("lat" in items[0].location!).toBe(false);
    expect("lng" in items[0].location!).toBe(false);
  });

  test("coordinates.lng が Infinity → label は入るが lat/lng は key ごと除外", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "渋谷",
        activity: "集合",
        coordinates: { lat: 35.66, lng: Infinity },
      }),
    ];
    const { items } = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });

    expect(items[0].location).toBeDefined();
    expect(items[0].location!.label).toBe("渋谷");
    expect("lat" in items[0].location!).toBe(false);
    expect("lng" in items[0].location!).toBe(false);
  });

  test("MorningPlanCard render gate 必要条件: whereSharpness='fixed' + location?.label 両立", () => {
    // 本 test は UI gate に対する Contract test。
    // mkEvent は placeType="exact_proper_noun" 固定のため whereSharpness は "fixed"。
    // 両方成立して初めて `{whereSharpness === "fixed" && item.location?.label}` が通る。
    const events = [
      mkEvent({
        id: "evt_1",
        startTime: "09:00",
        placeRef: "サドヤ",
        activity: "コーヒー",
        coordinates: { lat: 35.68, lng: 139.77 },
      }),
    ];
    const { items } = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });

    expect(items[0].whereSharpness).toBe("fixed");
    expect(items[0].location?.label).toBe("サドヤ");
  });

  test("複数 events 混在 → 各 item の location は独立に決定される", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "サドヤ",
        activity: "コーヒー",
        coordinates: { lat: 35.68, lng: 139.77 },
      }),
      mkEvent({
        id: "evt_2",
        placeRef: "",
        activity: "予定",
        coordinates: null,
      }),
      mkEvent({
        id: "evt_3",
        placeRef: "新宿",
        activity: "夕食",
        coordinates: { lat: 35.69, lng: 139.7 },
      }),
    ];
    const { items } = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });

    expect(items).toHaveLength(3);
    // evt_1: 完全な location
    expect(items[0].location?.label).toBe("サドヤ");
    expect(items[0].location?.lat).toBe(35.68);
    // evt_2: 空 placeRef → location key 不含
    expect("location" in items[1]).toBe(false);
    // evt_3: 完全な location（independent）
    expect(items[2].location?.label).toBe("新宿");
    expect(items[2].location?.lat).toBe(35.69);
  });

  test("flag ON でも location field 挙動は不変（enableTransportV2 は location に影響しない）", () => {
    const events = [
      mkEvent({
        id: "evt_1",
        placeRef: "サドヤ",
        activity: "コーヒー",
        coordinates: { lat: 35.68, lng: 139.77 },
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

    // items の JSON 等価（location は flag とは無関係）
    expect(JSON.stringify(off.items)).toBe(JSON.stringify(on.items));
    expect(off.items[0].location?.label).toBe("サドヤ");
    expect(on.items[0].location?.label).toBe("サドヤ");
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
