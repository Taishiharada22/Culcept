/**
 * eventToPlanItem 5W1H 写像 fidelity テスト
 *
 * CEO 2026-04-28 監査結果に基づく PR #40 拡張:
 *   G1: event.who[] → item.withWhom (Who 軸)
 *   G2: event.transport → item.transport (How 軸)
 *
 * 監査で判明した gap:
 *   eventToPlanItem は who / transport を写像していなかった。
 *   - UI (MorningPlanCard.tsx L819) は item.withWhom が来れば「👤」 render する用意あり
 *   - travel item は travelTransport を持つが、event item の transport も持てる設計
 *
 * 本テストは「LLM が抽出した Who/How が PlanItem まで届く」契約を保証する。
 *
 * Scope:
 *   - Phase 1 (G1): who → withWhom 写像
 *   - Phase 2 (G2): transport → transport 写像
 */

import { describe, it, expect } from "vitest";
import { buildPlanAndSegmentsFromEvents } from "@/lib/alter-morning/planning/planRebuild";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

function mkEventFull(opts: {
  id?: string;
  startTime?: string | null;
  placeRef?: string;
  coordinates?: { lat: number; lng: number } | null;
  who?: string[];
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
    who: opts.who ?? [],
    transport: opts.transport ?? null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
}

describe("G1: event.who[] → item.withWhom 写像", () => {
  it("[ROOT CAUSE] event.who=['田中'] → item.withWhom='田中'", () => {
    const events = [mkEventFull({ id: "evt_1", who: ["田中"] })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中");
  });

  it("event.who=['田中','佐藤'] → item.withWhom='田中、佐藤' (Japanese 列挙)", () => {
    const events = [mkEventFull({ id: "evt_1", who: ["田中", "佐藤"] })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中、佐藤");
  });

  it("event.who=['田中','佐藤','鈴木'] 3 名以上でも全員 join", () => {
    const events = [
      mkEventFull({ id: "evt_1", who: ["田中", "佐藤", "鈴木"] }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中、佐藤、鈴木");
  });

  it("event.who=[] → item に withWhom field 自体含まれない (conditional spread)", () => {
    const events = [mkEventFull({ id: "evt_1", who: [] })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBeUndefined();
    expect("withWhom" in result.items[0]).toBe(false);
  });

  it("event.who=['', '田中', ''] 空文字を除外して残るものだけ join (defensive)", () => {
    const events = [
      mkEventFull({ id: "evt_1", who: ["", "田中", ""] }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中");
  });

  it("event.who=['  ', ' '] 空白のみは undefined (defensive)", () => {
    const events = [mkEventFull({ id: "evt_1", who: ["  ", " "] })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBeUndefined();
  });

  it("event.who=['  田中  '] trim される", () => {
    const events = [mkEventFull({ id: "evt_1", who: ["  田中  "] })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中");
  });

  it("複数 event でそれぞれ異なる who を持つケース", () => {
    const events = [
      mkEventFull({ id: "evt_1", who: ["田中"] }),
      mkEventFull({ id: "evt_2", who: ["佐藤", "鈴木"] }),
      mkEventFull({ id: "evt_3", who: [] }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中");
    expect(result.items[1].withWhom).toBe("佐藤、鈴木");
    expect(result.items[2].withWhom).toBeUndefined();
  });
});

describe("G2: event.transport → item.transport 写像 (vcTypes 正規化)", () => {
  it("[ROOT CAUSE] event.transport='電車' → item.transport='train'", () => {
    const events = [mkEventFull({ id: "evt_1", transport: "電車" })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].transport).toBe("train");
  });

  it("event.transport=null → field 自体不在 (conditional spread)", () => {
    const events = [mkEventFull({ id: "evt_1", transport: null })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].transport).toBeUndefined();
    expect("transport" in result.items[0]).toBe(false);
  });

  it.each([
    ["徒歩", "walk"],
    ["歩き", "walk"],
    ["歩いて", "walk"],
    ["自転車", "bicycle"],
    ["チャリ", "bicycle"],
    ["車", "car"],
    ["クルマ", "car"],
    ["タクシー", "taxi"],
    ["Uber", "taxi"],
    ["バス", "bus"],
    ["地下鉄", "train"],
    ["JR", "train"],
    ["私鉄", "train"],
  ] as const)("event.transport='%s' → item.transport='%s'", (raw, expected) => {
    const events = [mkEventFull({ id: "evt_1", transport: raw })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].transport).toBe(expected);
  });

  it("event.transport='飛行機' (parse 不能) → undefined (hallucination 防止)", () => {
    const events = [mkEventFull({ id: "evt_1", transport: "飛行機" })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].transport).toBeUndefined();
  });

  it("event.transport='' (空文字) → undefined", () => {
    const events = [mkEventFull({ id: "evt_1", transport: "" })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].transport).toBeUndefined();
  });

  it("event.transport='   ' (空白のみ) → undefined", () => {
    const events = [mkEventFull({ id: "evt_1", transport: "   " })];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].transport).toBeUndefined();
  });

  it("複数 event でそれぞれ異なる transport を持つケース", () => {
    const events = [
      mkEventFull({ id: "evt_1", transport: "電車" }),
      mkEventFull({ id: "evt_2", transport: "徒歩" }),
      mkEventFull({ id: "evt_3", transport: null }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].transport).toBe("train");
    expect(result.items[1].transport).toBe("walk");
    expect(result.items[2].transport).toBeUndefined();
  });
});

describe("G1 + G2 統合: 同 event に Who/How 両方が乗るケース", () => {
  it("event.who + event.transport 両方ある → item に withWhom + transport 両方乗る", () => {
    const events = [
      mkEventFull({
        id: "evt_1",
        who: ["田中", "佐藤"],
        transport: "電車",
      }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中、佐藤");
    expect(result.items[0].transport).toBe("train");
  });

  it("event.who のみ (transport なし) → withWhom only", () => {
    const events = [
      mkEventFull({ id: "evt_1", who: ["田中"], transport: null }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBe("田中");
    expect(result.items[0].transport).toBeUndefined();
  });

  it("event.transport のみ (who なし) → transport only", () => {
    const events = [
      mkEventFull({ id: "evt_1", who: [], transport: "電車" }),
    ];
    const result = buildPlanAndSegmentsFromEvents({
      events,
      enableTransportV2: false,
    });
    expect(result.items[0].withWhom).toBeUndefined();
    expect(result.items[0].transport).toBe("train");
  });
});
