/**
 * synthesizeTravelItems — W3-PR-10 Phase 2 Display Cache 契約テスト
 *
 * カバレッジ:
 *   C2-A: pure / 決定論 — 同じ入力で同じ出力、id は deterministic
 *   C2-B: shape — kind="travel" / travelFrom / travelTo / travelTransport /
 *           durationMin の扱い
 *   C2-C: label 生成 — place_ref / icon / text format
 *   C2-D: defensive — segments が参照する event が events に無ければ skip
 *   C2-E: empty — segments=[] or events=[]
 *   C2-F: interleaveTravelItems — event 直後に対応 travel、orderHint 再付番、
 *          event_id に `__` を含んでも id parse しないので安全
 */

import { describe, test, expect } from "vitest";

import {
  synthesizeTravelItems,
  interleaveTravelItems,
  buildSynthesizedTravelId,
  type SynthesizedTravelEntry,
} from "@/lib/alter-morning/planning/synthesizeTravelItems";
import {
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { TransportSegment } from "@/lib/alter-morning/transport/types";
import type { PlanItem } from "@/lib/alter-morning/types";

function mkEvent(opts: {
  id: string;
  placeRef: string;
  activity?: string;
  coordinates?: { lat: number; lng: number } | null;
  startTime?: string | null;
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
      activity: opts.activity ?? "予定",
      activityCanonical: opts.activity ?? "予定",
      provenance: utteranceProvenance([opts.activity ?? "予定"], "high"),
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
  confidence?: TransportSegment["confidence"];
  source?: TransportSegment["source"];
}): TransportSegment {
  return {
    fromEventId: opts.from,
    toEventId: opts.to,
    mode: opts.mode ?? "unknown",
    estimatedDurationMin: opts.estimatedDurationMin ?? null,
    distanceM: null,
    confidence: opts.confidence ?? "default",
    source: opts.source ?? "default_walk",
  };
}

function mkEventPlanItem(id: string, orderHint: number): PlanItem {
  return {
    id,
    kind: "fixed",
    text: `event ${id}`,
    what: "予定",
    durationMin: 45,
    fixedStart: true,
    orderHint,
    sourceTurnIndex: 0,
    completed: false,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// C2-A: pure / deterministic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("synthesizeTravelItems — C2-A pure / deterministic", () => {
  test("同じ入力で JSON 等価（副作用なし）", () => {
    const events = [
      mkEvent({ id: "evt_1", placeRef: "サドヤ" }),
      mkEvent({ id: "evt_2", placeRef: "渋谷" }),
    ];
    const segments = [mkSegment({ from: "evt_1", to: "evt_2", mode: "walk" })];

    const a = synthesizeTravelItems(segments, events);
    const b = synthesizeTravelItems(segments, events);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("id は deterministic: travel__<fromEventId>__<toEventId>", () => {
    const events = [
      mkEvent({ id: "evt_alpha", placeRef: "A" }),
      mkEvent({ id: "evt_beta", placeRef: "B" }),
    ];
    const segments = [mkSegment({ from: "evt_alpha", to: "evt_beta" })];
    const entries = synthesizeTravelItems(segments, events);

    expect(entries[0].item.id).toBe("travel__evt_alpha__evt_beta");
    expect(buildSynthesizedTravelId("evt_alpha", "evt_beta")).toBe(
      "travel__evt_alpha__evt_beta",
    );
  });

  test("afterEventId は segment.fromEventId と一致（id parse を回避）", () => {
    const events = [
      mkEvent({ id: "evt_1", placeRef: "A" }),
      mkEvent({ id: "evt_2", placeRef: "B" }),
    ];
    const entries = synthesizeTravelItems(
      [mkSegment({ from: "evt_1", to: "evt_2" })],
      events,
    );
    expect(entries[0].afterEventId).toBe("evt_1");
  });

  test("入力 events / segments を mutate しない", () => {
    const events = [
      mkEvent({ id: "evt_1", placeRef: "A" }),
      mkEvent({ id: "evt_2", placeRef: "B" }),
    ];
    const segments = [mkSegment({ from: "evt_1", to: "evt_2" })];
    const eventsSnap = JSON.stringify(events);
    const segmentsSnap = JSON.stringify(segments);

    synthesizeTravelItems(segments, events);

    expect(JSON.stringify(events)).toBe(eventsSnap);
    expect(JSON.stringify(segments)).toBe(segmentsSnap);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// C2-B: shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("synthesizeTravelItems — C2-B shape", () => {
  test("kind=travel + travelFrom/travelTo/travelTransport が segment から埋まる", () => {
    const events = [
      mkEvent({ id: "evt_1", placeRef: "サドヤ" }),
      mkEvent({ id: "evt_2", placeRef: "渋谷" }),
    ];
    const segments = [
      mkSegment({ from: "evt_1", to: "evt_2", mode: "walk" }),
    ];
    const entries = synthesizeTravelItems(segments, events);

    expect(entries).toHaveLength(1);
    const t = entries[0].item;
    expect(t.kind).toBe("travel");
    expect(t.travelFrom).toBe("サドヤ");
    expect(t.travelTo).toBe("渋谷");
    expect(t.travelTransport).toBe("walk");
    expect(t.what).toBeNull();
    expect(t.fixedStart).toBe(false);
    expect(t.completed).toBe(false);
    expect(t.sourceTurnIndex).toBe(0);
  });

  test("durationMin: estimatedDurationMin が number ならそれ、null なら 0", () => {
    const events = [
      mkEvent({ id: "evt_1", placeRef: "A" }),
      mkEvent({ id: "evt_2", placeRef: "B" }),
      mkEvent({ id: "evt_3", placeRef: "C" }),
    ];
    const segments = [
      mkSegment({ from: "evt_1", to: "evt_2", estimatedDurationMin: 15 }),
      mkSegment({ from: "evt_2", to: "evt_3", estimatedDurationMin: null }),
    ];
    const entries = synthesizeTravelItems(segments, events);

    expect(entries[0].item.durationMin).toBe(15);
    expect(entries[1].item.durationMin).toBe(0);
  });

  test("durationSource は inferred（user 指定相当の override は持たない）", () => {
    const events = [
      mkEvent({ id: "evt_1", placeRef: "A" }),
      mkEvent({ id: "evt_2", placeRef: "B" }),
    ];
    const entries = synthesizeTravelItems(
      [mkSegment({ from: "evt_1", to: "evt_2" })],
      events,
    );
    expect(entries[0].item.durationSource).toBe("inferred");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// C2-C: label / text format
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("synthesizeTravelItems — C2-C label / icon / text", () => {
  test("text は `<icon> <from>→<to>` 形式（mode 毎に icon が切り替わる）", () => {
    const events = [
      mkEvent({ id: "evt_1", placeRef: "サドヤ" }),
      mkEvent({ id: "evt_2", placeRef: "渋谷" }),
    ];
    const walk = synthesizeTravelItems(
      [mkSegment({ from: "evt_1", to: "evt_2", mode: "walk" })],
      events,
    );
    const car = synthesizeTravelItems(
      [mkSegment({ from: "evt_1", to: "evt_2", mode: "car" })],
      events,
    );
    const train = synthesizeTravelItems(
      [mkSegment({ from: "evt_1", to: "evt_2", mode: "public_transit" })],
      events,
    );
    const bicycle = synthesizeTravelItems(
      [mkSegment({ from: "evt_1", to: "evt_2", mode: "bicycle" })],
      events,
    );
    const taxi = synthesizeTravelItems(
      [mkSegment({ from: "evt_1", to: "evt_2", mode: "taxi" })],
      events,
    );
    const unknown = synthesizeTravelItems(
      [mkSegment({ from: "evt_1", to: "evt_2", mode: "unknown" })],
      events,
    );

    expect(walk[0].item.text).toBe("🚶 サドヤ→渋谷");
    expect(car[0].item.text).toBe("🚗 サドヤ→渋谷");
    expect(train[0].item.text).toBe("🚃 サドヤ→渋谷");
    expect(bicycle[0].item.text).toBe("🚲 サドヤ→渋谷");
    expect(taxi[0].item.text).toBe("🚕 サドヤ→渋谷");
    // unknown は car fallback（既存 travelTimeEngine.getTravelIcon と同じ）
    expect(unknown[0].item.text).toBe("🚗 サドヤ→渋谷");
  });

  test("place_ref が空文字でも text 生成は壊れない（fabricate しない）", () => {
    const events = [
      mkEvent({ id: "evt_1", placeRef: "" }),
      mkEvent({ id: "evt_2", placeRef: "渋谷" }),
    ];
    const entries = synthesizeTravelItems(
      [mkSegment({ from: "evt_1", to: "evt_2", mode: "walk" })],
      events,
    );
    const t = entries[0].item;
    expect(t.travelFrom).toBe("");
    expect(t.travelTo).toBe("渋谷");
    expect(t.text).toBe("🚶 →渋谷");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// C2-D: defensive — event lookup fail
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("synthesizeTravelItems — C2-D defensive", () => {
  test("segment が参照する event が events に無ければ skip（defensive）", () => {
    const events = [mkEvent({ id: "evt_1", placeRef: "A" })];
    const segments = [
      mkSegment({ from: "evt_1", to: "evt_2" }), // evt_2 が events に無い
    ];
    expect(synthesizeTravelItems(segments, events)).toEqual([]);
  });

  test("複数 segment のうち一部だけ event 欠落 → その segment だけ skip", () => {
    const events = [
      mkEvent({ id: "evt_1", placeRef: "A" }),
      mkEvent({ id: "evt_2", placeRef: "B" }),
      // evt_3 は無い
    ];
    const segments = [
      mkSegment({ from: "evt_1", to: "evt_2" }), // OK
      mkSegment({ from: "evt_2", to: "evt_3" }), // skip
    ];
    const entries = synthesizeTravelItems(segments, events);
    expect(entries).toHaveLength(1);
    expect(entries[0].item.travelFrom).toBe("A");
    expect(entries[0].item.travelTo).toBe("B");
    expect(entries[0].afterEventId).toBe("evt_1");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// C2-E: empty inputs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("synthesizeTravelItems — C2-E empty", () => {
  test("segments=[] → []", () => {
    const events = [mkEvent({ id: "evt_1", placeRef: "A" })];
    expect(synthesizeTravelItems([], events)).toEqual([]);
  });

  test("events=[] + segments=[] → []", () => {
    expect(synthesizeTravelItems([], [])).toEqual([]);
  });

  test("events=[] + segments 非空 → defensive で全 skip → []", () => {
    const segments = [mkSegment({ from: "evt_1", to: "evt_2" })];
    expect(synthesizeTravelItems(segments, [])).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// C2-F: interleaveTravelItems
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("interleaveTravelItems — C2-F", () => {
  test("event の直後に対応 travel を挟む + orderHint は 0..n の連番", () => {
    const events = [
      mkEvent({ id: "evt_1", placeRef: "A" }),
      mkEvent({ id: "evt_2", placeRef: "B" }),
      mkEvent({ id: "evt_3", placeRef: "C" }),
    ];
    const eventItems = [
      mkEventPlanItem("evt_1", 0),
      mkEventPlanItem("evt_2", 1),
      mkEventPlanItem("evt_3", 2),
    ];
    const segments = [
      mkSegment({ from: "evt_1", to: "evt_2", mode: "walk" }),
      mkSegment({ from: "evt_2", to: "evt_3", mode: "walk" }),
    ];
    const entries = synthesizeTravelItems(segments, events);
    const interleaved = interleaveTravelItems(eventItems, entries);

    expect(interleaved.map((i) => i.id)).toEqual([
      "evt_1",
      "travel__evt_1__evt_2",
      "evt_2",
      "travel__evt_2__evt_3",
      "evt_3",
    ]);
    expect(interleaved.map((i) => i.orderHint)).toEqual([0, 1, 2, 3, 4]);
  });

  test("entries=[] → eventItems をそのまま返す + orderHint 再付番のみ", () => {
    const eventItems = [
      mkEventPlanItem("evt_1", 99),
      mkEventPlanItem("evt_2", 99),
    ];
    const interleaved = interleaveTravelItems(eventItems, []);
    expect(interleaved.map((i) => i.id)).toEqual(["evt_1", "evt_2"]);
    expect(interleaved.map((i) => i.orderHint)).toEqual([0, 1]);
  });

  test("一部 pair だけ travel 有り（coords 欠落で segment が落ちた想定）", () => {
    const events = [
      mkEvent({ id: "evt_1", placeRef: "A" }),
      mkEvent({ id: "evt_2", placeRef: "B" }),
      mkEvent({ id: "evt_3", placeRef: "C" }),
    ];
    const eventItems = [
      mkEventPlanItem("evt_1", 0),
      mkEventPlanItem("evt_2", 1),
      mkEventPlanItem("evt_3", 2),
    ];
    const segments = [
      mkSegment({ from: "evt_1", to: "evt_2" }),
    ];
    const entries = synthesizeTravelItems(segments, events);
    const interleaved = interleaveTravelItems(eventItems, entries);

    expect(interleaved.map((i) => i.id)).toEqual([
      "evt_1",
      "travel__evt_1__evt_2",
      "evt_2",
      "evt_3",
    ]);
    expect(interleaved.map((i) => i.orderHint)).toEqual([0, 1, 2, 3]);
  });

  test("event_id が `__` を含んでも entry.afterEventId 経由で安全に挿入される", () => {
    const events = [
      mkEvent({ id: "evt__1", placeRef: "A" }),
      mkEvent({ id: "evt__2", placeRef: "B" }),
    ];
    const eventItems = [
      mkEventPlanItem("evt__1", 0),
      mkEventPlanItem("evt__2", 1),
    ];
    const segments = [mkSegment({ from: "evt__1", to: "evt__2" })];
    const entries = synthesizeTravelItems(segments, events);
    const interleaved = interleaveTravelItems(eventItems, entries);

    expect(entries[0].afterEventId).toBe("evt__1");
    expect(interleaved.map((i) => i.id)).toEqual([
      "evt__1",
      "travel__evt__1__evt__2",
      "evt__2",
    ]);
  });

  test("afterEventId が eventItems に無ければ skip（defensive: 捏造しない）", () => {
    const eventItems = [mkEventPlanItem("evt_1", 0)];
    const entry: SynthesizedTravelEntry = {
      afterEventId: "evt_missing",
      item: {
        id: "travel__evt_missing__evt_x",
        kind: "travel",
        text: "🚗 X→Y",
        what: null,
        durationMin: 0,
        fixedStart: false,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
        travelFrom: "X",
        travelTo: "Y",
        travelTransport: "walk",
      },
    };
    const interleaved = interleaveTravelItems(eventItems, [entry]);
    expect(interleaved.map((i) => i.id)).toEqual(["evt_1"]);
  });

  test("pure: 同じ入力で同じ出力（入力 mutate なし）", () => {
    const eventItems = [
      mkEventPlanItem("evt_1", 0),
      mkEventPlanItem("evt_2", 1),
    ];
    const entries: SynthesizedTravelEntry[] = [
      {
        afterEventId: "evt_1",
        item: {
          id: "travel__evt_1__evt_2",
          kind: "travel",
          text: "🚶 A→B",
          what: null,
          durationMin: 0,
          durationSource: "inferred",
          fixedStart: false,
          orderHint: 0,
          sourceTurnIndex: 0,
          completed: false,
          travelFrom: "A",
          travelTo: "B",
          travelTransport: "walk",
        },
      },
    ];
    const evSnap = JSON.stringify(eventItems);
    const enSnap = JSON.stringify(entries);
    const a = interleaveTravelItems(eventItems, entries);
    const b = interleaveTravelItems(eventItems, entries);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(eventItems)).toBe(evSnap);
    expect(JSON.stringify(entries)).toBe(enSnap);
  });
});
