import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  parseStore, serializeStore, setMode, getMode, getModesForDay, applyCaps,
  saveSelectedMode, loadSelectedMode, loadSelectedModesForDay, clearSelectedModeStore,
  EMPTY_SELECTED_MODE_STORE, SELECTED_MODE_STORE_KEY, SELECTED_MODE_STORE_VERSION, MAX_STORED_DAYS,
} from "@/lib/plan/map/selectedModeStore";
import { isRouteTransportMode, type RouteTransportMode } from "@/lib/plan/map/routeMode";

const DAY = "2026-06-04";
const DAY2 = "2026-06-05";

describe("selectedModeStore — pure core (RouteTransportMode 9語)", () => {
  it("isRouteTransportMode: 9語のみ true・canonical 語(walking/driving/transit)は false", () => {
    for (const m of ["walk","car","taxi","train","shinkansen","bus","bicycle","flight","unknown"]) expect(isRouteTransportMode(m)).toBe(true);
    expect(isRouteTransportMode("walking")).toBe(false);
    expect(isRouteTransportMode("driving")).toBe(false);
    expect(isRouteTransportMode("transit")).toBe(false);
    expect(isRouteTransportMode("")).toBe(false);
    expect(isRouteTransportMode(null)).toBe(false);
    expect(isRouteTransportMode(123)).toBe(false);
  });
  it("setMode → getMode / 上書き / 別日別leg は null", () => {
    let s = setMode(EMPTY_SELECTED_MODE_STORE, DAY, "leg-1", "train");
    expect(getMode(s, DAY, "leg-1")).toBe("train");
    s = setMode(s, DAY, "leg-1", "car");
    expect(getMode(s, DAY, "leg-1")).toBe("car");
    expect(getMode(s, DAY, "leg-2")).toBeNull();
    expect(getMode(s, DAY2, "leg-1")).toBeNull();
  });
  it("setMode: invalid(mode/day/legKey)は無視 = 同一参照・canonical 語も弾く", () => {
    const s0 = EMPTY_SELECTED_MODE_STORE;
    expect(setMode(s0, "bad-date", "leg-1", "walk")).toBe(s0);
    expect(setMode(s0, DAY, "", "walk")).toBe(s0);
    expect(setMode(s0, DAY, "leg-1", "walking" as RouteTransportMode)).toBe(s0);
  });
  it("getModesForDay: 1 日分を copy で返す", () => {
    let s = setMode(EMPTY_SELECTED_MODE_STORE, DAY, "leg-1", "train");
    s = setMode(s, DAY, "leg-2", "walk");
    expect(getModesForDay(s, DAY)).toEqual({ "leg-1": "train", "leg-2": "walk" });
    expect(getModesForDay(s, DAY2)).toEqual({});
  });
  it("parseStore: 破損/version 違い → EMPTY", () => {
    expect(parseStore(null)).toEqual(EMPTY_SELECTED_MODE_STORE);
    expect(parseStore("{ not json")).toEqual(EMPTY_SELECTED_MODE_STORE);
    expect(parseStore(JSON.stringify({ version: 999, byDay: {} }))).toEqual(EMPTY_SELECTED_MODE_STORE);
  });
  it("parseStore: 不正 mode(canonical 語含む)/day/legKey を除去", () => {
    const raw = JSON.stringify({
      version: 1,
      byDay: {
        [DAY]: { "leg-1": "train", "leg-bad": "walking", "leg-2": "taxi", "": "walk" },
        "bad-date": { "leg-1": "walk" },
      },
    });
    const s = parseStore(raw);
    expect(s.byDay[DAY]).toEqual({ "leg-1": "train", "leg-2": "taxi" });
    expect(s.byDay["bad-date"]).toBeUndefined();
  });
  it("parse ↔ serialize round-trip", () => {
    let s = setMode(EMPTY_SELECTED_MODE_STORE, DAY, "leg-1", "car");
    s = setMode(s, DAY2, "leg-1", "train");
    expect(parseStore(serializeStore(s))).toEqual(s);
  });
  it("applyCaps: 保存日数を上限まで(古い日から破棄)", () => {
    const byDay: Record<string, Record<string, RouteTransportMode>> = {};
    for (let i = 0; i < MAX_STORED_DAYS + 5; i++) {
      const month = String(Math.floor(i / 28) + 1).padStart(2, "0");
      const day = String((i % 28) + 1).padStart(2, "0");
      byDay[`2026-${month}-${day}`] = { "leg-1": "walk" };
    }
    const capped = applyCaps({ version: SELECTED_MODE_STORE_VERSION, byDay });
    expect(Object.keys(capped.byDay).length).toBe(MAX_STORED_DAYS);
    const sorted = Object.keys(byDay).sort();
    expect(capped.byDay[sorted[0]]).toBeUndefined();
    expect(capped.byDay[sorted[sorted.length - 1]]).toBeDefined();
  });
});

describe("selectedModeStore — localStorage wrapper (mocked)", () => {
  let orig: unknown;
  beforeEach(() => {
    const map = new Map<string, string>();
    orig = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
      clear: () => map.clear(), key: () => null, length: 0,
    };
  });
  afterEach(() => { (globalThis as { localStorage?: unknown }).localStorage = orig; });
  it("save → load round-trip", () => {
    saveSelectedMode(DAY, "leg-1", "train");
    expect(loadSelectedMode(DAY, "leg-1")).toBe("train");
    expect(loadSelectedModesForDay(DAY)).toEqual({ "leg-1": "train" });
  });
  it("clear で消える", () => {
    saveSelectedMode(DAY, "leg-1", "car");
    clearSelectedModeStore();
    expect(loadSelectedMode(DAY, "leg-1")).toBeNull();
  });
  it("生 JSON は versioned key + 正しい形式", () => {
    saveSelectedMode(DAY, "leg-1", "walk");
    const raw = (globalThis as { localStorage: Storage }).localStorage.getItem(SELECTED_MODE_STORE_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe(SELECTED_MODE_STORE_VERSION);
    expect(parsed.byDay[DAY]["leg-1"]).toBe("walk");
  });
});

describe("selectedModeStore — SSR fail-open", () => {
  let orig: unknown;
  beforeEach(() => {
    orig = (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  afterEach(() => { (globalThis as { localStorage?: unknown }).localStorage = orig; });
  it("localStorage 不在でも throw せず空/no-op", () => {
    expect(() => saveSelectedMode(DAY, "leg-1", "train")).not.toThrow();
    expect(loadSelectedMode(DAY, "leg-1")).toBeNull();
    expect(loadSelectedModesForDay(DAY)).toEqual({});
    expect(() => clearSelectedModeStore()).not.toThrow();
  });
});
