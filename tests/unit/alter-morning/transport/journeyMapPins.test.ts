/**
 * journey map pins — CEO 2026-04-28 G5
 *
 * Audit で判明した gap:
 *   MorningMapView は events.where.coordinates / planItems.location のみ pin 化していた。
 *   plan.journeyOrigin / plan.journeyEnd の coords が **完全に無視** されていた。
 *   結果、1-event plan は永遠に map mount しない（pins.length < 2 gate）。
 *
 * 修正 (G5):
 *   - extractJourneyPins(origin, end) で anchor / endpoint を pin 化
 *   - round-trip default (origin === endpoint coords) は dedupe で 1 pin
 *   - composeJourneyPinList で「origin → events → endpoint」順に結合
 *
 * 検証観点:
 *   1. extractJourneyPins
 *      - 両方 valid + 異 coords → [origin, end]
 *      - round-trip 同 coords → [origin] (endpoint dedupe)
 *      - origin のみ → [origin]
 *      - end のみ → [end]
 *      - 両方 null → []
 *      - invalid coords (NaN/Infinity/range外) → 該当 pin skip
 *   2. composeJourneyPinList
 *      - [origin] + events → [origin, ...events]
 *      - [origin, end] + events → [origin, ...events, end]
 *      - [end] + events → [...events, end]
 *      - [] + events → events のみ
 *      - 順序保持 (events の入力順を維持)
 */

import { describe, it, expect } from "vitest";
import {
  extractJourneyPins,
  composeJourneyPinList,
  isValidCoord,
} from "@/components/home/morning/MorningMapView";
import {
  HOME_TRAVEL_SENTINEL_ID,
  ENDPOINT_TRAVEL_SENTINEL_ID,
} from "@/lib/alter-morning/planning/transportContext";

describe("extractJourneyPins — origin/endpoint 抽出 + dedupe", () => {
  it("両方 valid + 異 coords → [origin, end]", () => {
    const result = extractJourneyPins(
      { label: "現在地", lat: 35.6587, lng: 139.6997 },
      { label: "帰宅", lat: 35.6762, lng: 139.6503 },
    );
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(HOME_TRAVEL_SENTINEL_ID);
    expect(result[0].label).toBe("現在地");
    expect(result[1].id).toBe(ENDPOINT_TRAVEL_SENTINEL_ID);
    expect(result[1].label).toBe("帰宅");
  });

  it("[ROOT CAUSE] round-trip default (origin === endpoint coords) → [origin] のみ (dedupe)", () => {
    const result = extractJourneyPins(
      { label: "現在地", lat: 35.6587, lng: 139.6997 },
      { label: "帰宅", lat: 35.6587, lng: 139.6997 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(HOME_TRAVEL_SENTINEL_ID);
    expect(result[0].label).toBe("現在地");
  });

  it("4 桁精度内のわずかな差は同点扱い (≈11m)", () => {
    const result = extractJourneyPins(
      { label: "現在地", lat: 35.65871, lng: 139.69971 },
      { label: "帰宅", lat: 35.65872, lng: 139.69972 }, // 4 桁切り捨て後同じ
    );
    expect(result).toHaveLength(1); // dedupe
  });

  it("4 桁精度を超える差は別 pin", () => {
    const result = extractJourneyPins(
      { label: "現在地", lat: 35.658, lng: 139.699 },
      { label: "帰宅", lat: 35.659, lng: 139.7 }, // 明らかに離れている
    );
    expect(result).toHaveLength(2);
  });

  it("origin のみ valid → [origin]", () => {
    const result = extractJourneyPins(
      { label: "現在地", lat: 35.6587, lng: 139.6997 },
      null,
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(HOME_TRAVEL_SENTINEL_ID);
  });

  it("end のみ valid → [end]", () => {
    const result = extractJourneyPins(null, {
      label: "帰宅",
      lat: 35.6762,
      lng: 139.6503,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(ENDPOINT_TRAVEL_SENTINEL_ID);
    expect(result[0].label).toBe("帰宅");
  });

  it("両方 null → []", () => {
    expect(extractJourneyPins(null, null)).toEqual([]);
    expect(extractJourneyPins(undefined, undefined)).toEqual([]);
  });

  it("origin coords NaN → origin skip", () => {
    const result = extractJourneyPins(
      { label: "現在地", lat: NaN, lng: 139.6997 },
      { label: "帰宅", lat: 35.6762, lng: 139.6503 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(ENDPOINT_TRAVEL_SENTINEL_ID);
  });

  it("end coords Infinity → end skip", () => {
    const result = extractJourneyPins(
      { label: "現在地", lat: 35.6587, lng: 139.6997 },
      { label: "帰宅", lat: 35.6762, lng: Infinity },
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(HOME_TRAVEL_SENTINEL_ID);
  });

  it("origin coords 範囲外 (lat>90) → origin skip", () => {
    const result = extractJourneyPins(
      { label: "現在地", lat: 100, lng: 139.6997 },
      null,
    );
    expect(result).toHaveLength(0);
  });

  it("end coords 範囲外 (lng>180) → end skip", () => {
    const result = extractJourneyPins(null, {
      label: "帰宅",
      lat: 35.6762,
      lng: 200,
    });
    expect(result).toHaveLength(0);
  });

  it("(0, 0) 赤道 / 子午線交点も valid coord として扱う", () => {
    const result = extractJourneyPins(
      { label: "現在地", lat: 0, lng: 0 },
      null,
    );
    expect(result).toHaveLength(1);
    expect(result[0].coord).toEqual({ lat: 0, lng: 0 });
  });
});

describe("composeJourneyPinList — origin → events → endpoint 順序", () => {
  const eventPin1 = {
    id: "evt_1",
    coord: { lat: 35.66, lng: 139.7 },
    label: "TSUTAYA",
  };
  const eventPin2 = {
    id: "evt_2",
    coord: { lat: 35.67, lng: 139.71 },
    label: "新宿",
  };
  const originPin = {
    id: HOME_TRAVEL_SENTINEL_ID,
    coord: { lat: 35.65, lng: 139.69 },
    label: "現在地",
  };
  const endPin = {
    id: ENDPOINT_TRAVEL_SENTINEL_ID,
    coord: { lat: 35.68, lng: 139.65 },
    label: "帰宅",
  };

  it("[origin, end] + 2 events → [origin, evt_1, evt_2, end] (4-pin journey)", () => {
    const result = composeJourneyPinList(
      [originPin, endPin],
      [eventPin1, eventPin2],
    );
    expect(result.map((p) => p.id)).toEqual([
      HOME_TRAVEL_SENTINEL_ID,
      "evt_1",
      "evt_2",
      ENDPOINT_TRAVEL_SENTINEL_ID,
    ]);
  });

  it("[origin] only + 1 event → [origin, evt_1] (round-trip dedupe で endpoint 消失パス)", () => {
    const result = composeJourneyPinList([originPin], [eventPin1]);
    expect(result.map((p) => p.id)).toEqual([
      HOME_TRAVEL_SENTINEL_ID,
      "evt_1",
    ]);
  });

  it("[end] only + events → [...events, end]", () => {
    const result = composeJourneyPinList([endPin], [eventPin1, eventPin2]);
    expect(result.map((p) => p.id)).toEqual([
      "evt_1",
      "evt_2",
      ENDPOINT_TRAVEL_SENTINEL_ID,
    ]);
  });

  it("[] + events → events のみ", () => {
    const result = composeJourneyPinList([], [eventPin1, eventPin2]);
    expect(result.map((p) => p.id)).toEqual(["evt_1", "evt_2"]);
  });

  it("[origin, end] + 0 events → [origin, end]", () => {
    const result = composeJourneyPinList([originPin, endPin], []);
    expect(result.map((p) => p.id)).toEqual([
      HOME_TRAVEL_SENTINEL_ID,
      ENDPOINT_TRAVEL_SENTINEL_ID,
    ]);
  });

  it("event 順序を保持 (input 順 = output 順)", () => {
    const result = composeJourneyPinList(
      [],
      [eventPin1, eventPin2, eventPin1], // 重複も保持（dedupe しない）
    );
    expect(result.map((p) => p.id)).toEqual(["evt_1", "evt_2", "evt_1"]);
  });
});

describe("CEO 2026-04-28 シナリオ: 1-event plan で map mount 達成", () => {
  it("[ROOT CAUSE FIXED] 1 event + home anchor → 2 pins (map mount 可能)", () => {
    const eventPins = [
      { id: "evt_1", coord: { lat: 35.66, lng: 139.7 }, label: "TSUTAYA" },
    ];
    const journeyPins = extractJourneyPins(
      { label: "現在地", lat: 35.65, lng: 139.69 },
      { label: "帰宅", lat: 35.65, lng: 139.69 }, // round-trip
    );
    const allPins = composeJourneyPinList(journeyPins, eventPins);

    // dedupe で endpoint は消えるので、合計 2 pins
    expect(allPins).toHaveLength(2);
    expect(allPins[0].id).toBe(HOME_TRAVEL_SENTINEL_ID);
    expect(allPins[1].id).toBe("evt_1");
    // map gate (pins >= 2) を通過する
    expect(allPins.length >= 2).toBe(true);
  });

  it("0 event + home only → 1 pin (map mount しない、CEO 案 1 通り)", () => {
    const eventPins: Array<{ id: string; coord: { lat: number; lng: number }; label: string | null }> = [];
    const journeyPins = extractJourneyPins(
      { label: "現在地", lat: 35.65, lng: 139.69 },
      { label: "帰宅", lat: 35.65, lng: 139.69 }, // round-trip dedupe
    );
    const allPins = composeJourneyPinList(journeyPins, eventPins);
    expect(allPins).toHaveLength(1);
  });

  it("home なし (CEO 案 1: hallucination 防止) → events のみで gate 判定", () => {
    const eventPins = [
      { id: "evt_1", coord: { lat: 35.66, lng: 139.7 }, label: "TSUTAYA" },
    ];
    const journeyPins = extractJourneyPins(null, null);
    const allPins = composeJourneyPinList(journeyPins, eventPins);
    expect(allPins).toHaveLength(1); // event のみ
    // map gate (pins >= 2) を通らない → mount しない
    expect(allPins.length >= 2).toBe(false);
  });

  it("multi-event + home + endpoint → 全部含めた journey pins", () => {
    const eventPins = [
      { id: "evt_1", coord: { lat: 35.66, lng: 139.7 }, label: "TSUTAYA" },
      { id: "evt_2", coord: { lat: 35.67, lng: 139.71 }, label: "新宿" },
    ];
    const journeyPins = extractJourneyPins(
      { label: "現在地", lat: 35.65, lng: 139.69 },
      { label: "帰宅", lat: 35.68, lng: 139.65 }, // hotel 等で別 coord
    );
    const allPins = composeJourneyPinList(journeyPins, eventPins);
    expect(allPins.map((p) => p.id)).toEqual([
      HOME_TRAVEL_SENTINEL_ID,
      "evt_1",
      "evt_2",
      ENDPOINT_TRAVEL_SENTINEL_ID,
    ]);
  });
});

// ─── 型確認: extractJourneyPins の戻り値が PinPoint[] (id/coord/label) ───
describe("型契約", () => {
  it("isValidCoord と extractJourneyPins の判定基準が一致", () => {
    // (0,0) は valid（isValidCoord と整合）
    expect(isValidCoord({ lat: 0, lng: 0 })).toBe(true);
    expect(
      extractJourneyPins({ label: "x", lat: 0, lng: 0 }, null),
    ).toHaveLength(1);

    // 範囲外は invalid（一致）
    expect(isValidCoord({ lat: 91, lng: 0 })).toBe(false);
    expect(
      extractJourneyPins({ label: "x", lat: 91, lng: 0 }, null),
    ).toHaveLength(0);
  });
});
