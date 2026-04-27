/**
 * transportContext — CEO 2026-04-28 Option B (transport rendering 基盤)
 *
 * 検証観点:
 *   1. parseJapaneseTransportToVc: 「電車 / 徒歩 / 自転車 / 車 / バス / タクシー」 → vcTypes
 *   2. mapVcTransportToPlanMode: vcTypes → transport/types
 *   3. deriveDayTransport: events scan で最初の non-null transport を採用
 *   4. resolveHomeAnchor: 現在地 → 自宅 → null の優先順
 *   5. HOME_TRAVEL_SENTINEL_ID は実 event_id と衝突しない sentinel
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  HOME_TRAVEL_SENTINEL_ID,
  parseJapaneseTransportToVc,
  mapVcTransportToPlanMode,
  deriveDayTransport,
  resolveHomeAnchor,
} from "@/lib/alter-morning/planning/transportContext";
import {
  type Event,
  resetEventCounter,
  inferredProvenance,
  utteranceProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

beforeEach(() => {
  resetEventCounter();
});

function mkEvent(overrides: Partial<Event>): Event {
  const base: Event = {
    event_id: "event_x",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: { startTime: null, timeHint: null, provenance: inferredProvenance() },
    where: {
      place_ref: null,
      placeType: null,
      coordinates: null,
      provenance: inferredProvenance(),
    },
    what: {
      activity: "",
      activityCanonical: "",
      provenance: inferredProvenance(),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
  return { ...base, ...overrides } as Event;
}

describe("HOME_TRAVEL_SENTINEL_ID", () => {
  it("is a stable sentinel that won't collide with real event_ids", () => {
    expect(HOME_TRAVEL_SENTINEL_ID).toBe("__home__");
    // 実 event_id は generateEventId() で "event_N" 形式
    expect(HOME_TRAVEL_SENTINEL_ID.startsWith("event_")).toBe(false);
  });
});

describe("parseJapaneseTransportToVc", () => {
  it.each([
    ["電車", "train"],
    ["地下鉄", "train"],
    ["JR", "train"],
    ["私鉄", "train"],
    ["バス", "bus"],
    ["徒歩", "walk"],
    ["歩き", "walk"],
    ["歩いて", "walk"],
    ["自転車", "bicycle"],
    ["チャリ", "bicycle"],
    ["タクシー", "taxi"],
    ["Uber", "taxi"],
    ["uber", "taxi"],
    ["車", "car"],
    ["クルマ", "car"],
  ])("'%s' → '%s'", (input, expected) => {
    expect(parseJapaneseTransportToVc(input)).toBe(expected);
  });

  it("returns undefined for unknown input", () => {
    expect(parseJapaneseTransportToVc("飛行機")).toBeUndefined();
    expect(parseJapaneseTransportToVc("")).toBeUndefined();
    expect(parseJapaneseTransportToVc("ジェット機")).toBeUndefined();
  });

  it("normalizes NFKC (full-width digits / latin)", () => {
    expect(parseJapaneseTransportToVc("ＪＲ")).toBe("train");
  });
});

describe("mapVcTransportToPlanMode", () => {
  it.each([
    ["walk", "walk"],
    ["bicycle", "bicycle"],
    ["car", "car"],
    ["motorcycle", "car"],
    ["taxi", "taxi"],
    ["train", "public_transit"],
    ["bus", "public_transit"],
    ["plane", "unknown"],
  ] as const)("'%s' → '%s'", (input, expected) => {
    expect(mapVcTransportToPlanMode(input)).toBe(expected);
  });

  it("returns undefined for undefined input", () => {
    expect(mapVcTransportToPlanMode(undefined)).toBeUndefined();
  });
});

describe("deriveDayTransport", () => {
  it("[ROOT CAUSE] derives both vc and plan from first non-null events.transport", () => {
    const events = [mkEvent({ transport: "電車" })];
    const result = deriveDayTransport(events);
    expect(result).toEqual({ vc: "train", plan: "public_transit" });
  });

  it("scans multiple events and returns first non-null transport", () => {
    const events = [
      mkEvent({ transport: null }),
      mkEvent({ transport: null }),
      mkEvent({ transport: "徒歩" }),
    ];
    const result = deriveDayTransport(events);
    expect(result).toEqual({ vc: "walk", plan: "walk" });
  });

  it("returns null when no event has transport", () => {
    const events = [mkEvent({ transport: null }), mkEvent({ transport: null })];
    expect(deriveDayTransport(events)).toBeNull();
  });

  it("returns null when transport string is unparseable", () => {
    const events = [mkEvent({ transport: "ジェット機" })];
    expect(deriveDayTransport(events)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(deriveDayTransport([])).toBeNull();
  });

  it("handles all 5 main Japanese transport words", () => {
    expect(deriveDayTransport([mkEvent({ transport: "電車" })])).toEqual({
      vc: "train",
      plan: "public_transit",
    });
    expect(deriveDayTransport([mkEvent({ transport: "徒歩" })])).toEqual({
      vc: "walk",
      plan: "walk",
    });
    expect(deriveDayTransport([mkEvent({ transport: "自転車" })])).toEqual({
      vc: "bicycle",
      plan: "bicycle",
    });
    expect(deriveDayTransport([mkEvent({ transport: "車" })])).toEqual({
      vc: "car",
      plan: "car",
    });
    expect(deriveDayTransport([mkEvent({ transport: "バス" })])).toEqual({
      vc: "bus",
      plan: "public_transit",
    });
  });
});

describe("resolveHomeAnchor — CEO 2026-04-28 priority order", () => {
  it("[Priority 1] returns current location when both current and home are set", () => {
    const result = resolveHomeAnchor({
      currentLat: 35.6586,
      currentLng: 139.7454,
      homeLat: 35.6762,
      homeLng: 139.6503,
    });
    expect(result).toEqual({
      lat: 35.6586,
      lng: 139.7454,
      label: "現在地",
      source: "current",
    });
  });

  it("[Priority 2] falls back to registered home when current is null", () => {
    const result = resolveHomeAnchor({
      currentLat: null,
      currentLng: null,
      homeLat: 35.6762,
      homeLng: 139.6503,
    });
    expect(result).toEqual({
      lat: 35.6762,
      lng: 139.6503,
      label: "自宅",
      source: "registered_home",
    });
  });

  it("[Priority 2] falls back to registered home when current is undefined", () => {
    const result = resolveHomeAnchor({
      homeLat: 35.6762,
      homeLng: 139.6503,
    });
    expect(result).toEqual({
      lat: 35.6762,
      lng: 139.6503,
      label: "自宅",
      source: "registered_home",
    });
  });

  it("[Priority 3] returns null when both are missing (CEO hallucination prevention)", () => {
    expect(resolveHomeAnchor({})).toBeNull();
    expect(
      resolveHomeAnchor({
        currentLat: null,
        currentLng: null,
        homeLat: null,
        homeLng: null,
      }),
    ).toBeNull();
  });

  it("rejects partial coordinates (lat without lng)", () => {
    expect(
      resolveHomeAnchor({ currentLat: 35.6586 }),
    ).toBeNull();
    expect(resolveHomeAnchor({ homeLat: 35.6762 })).toBeNull();
  });

  it("rejects NaN / Infinity coordinates (defensive)", () => {
    expect(
      resolveHomeAnchor({ currentLat: NaN, currentLng: 139.7 }),
    ).toBeNull();
    expect(
      resolveHomeAnchor({ currentLat: Infinity, currentLng: 139.7 }),
    ).toBeNull();
    expect(
      resolveHomeAnchor({ homeLat: 35.6, homeLng: NaN }),
    ).toBeNull();
  });

  it("falls back from invalid current to registered home", () => {
    const result = resolveHomeAnchor({
      currentLat: NaN,
      currentLng: 139.7,
      homeLat: 35.6762,
      homeLng: 139.6503,
    });
    expect(result?.source).toBe("registered_home");
  });

  it("accepts (0, 0) — equator/meridian intersection (downstream null-skip handles ≤0.2km)", () => {
    const result = resolveHomeAnchor({ currentLat: 0, currentLng: 0 });
    expect(result).toEqual({
      lat: 0,
      lng: 0,
      label: "現在地",
      source: "current",
    });
  });
});
