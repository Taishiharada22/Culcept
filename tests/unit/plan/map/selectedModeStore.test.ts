import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  parseStore, serializeStore, setMode, getMode, getModesForDay, applyCaps, isTransportMode,
  saveSelectedMode, loadSelectedMode, loadSelectedModesForDay, clearSelectedModeStore,
  EMPTY_SELECTED_MODE_STORE, SELECTED_MODE_STORE_KEY, SELECTED_MODE_STORE_VERSION, MAX_STORED_DAYS,
} from "@/lib/plan/map/selectedModeStore";
import type { TransportMode } from "@/lib/plan/transport/transportTypes";

const DAY = "2026-06-04";
const DAY2 = "2026-06-05";

describe("selectedModeStore — pure core", () => {
  it("isTransportMode: canonical のみ true (FH の別語彙 car 等は弾く)", () => {
    for (const m of ["walking", "driving", "transit", "flight", "unknown"]) expect(isTransportMode(m)).toBe(true);
    expect(isTransportMode("car")).toBe(false);
    expect(isTransportMode("")).toBe(false);
    expect(isTransportMode(null)).toBe(false);
    expect(isTransportMode(123)).toBe(false);
  });

  it("setMode → getMode / 上書き / 別日別leg は null", () => {
    let s = setMode(EMPTY_SELECTED_MODE_STORE, DAY, "leg-1", "transit");
    expect(getMode(s, DAY, "leg-1")).toBe("transit");
    s = setMode(s, DAY, "leg-1", "driving");
    expect(getMode(s, DAY, "leg-1")).toBe("driving");
    expect(getMode(s, DAY, "leg-2")).toBeNull();
    expect(getMode(s, DAY2, "leg-1")).toBeNull();
  });

  it("setMode: invalid (mode/day/legKey) は無視 = 同一 store 参照を返す", () => {
    const s0 = EMPTY_SELECTED_MODE_STORE;
    expect(setMode(s0, "bad-date", "leg-1", "walking")).toBe(s0);
    expect(setMode(s0, DAY, "", "walking")).toBe(s0);
    expect(setMode(s0, DAY, "leg-1", "car" as TransportMode)).toBe(s0);
  });

  it("getModesForDay: 1 日分を copy で返す", () => {
    let s = setMode(EMPTY_SELECTED_MODE_STORE, DAY, "leg-1", "transit");
    s = setMode(s, DAY, "leg-2", "walking");
    expect(getModesForDay(s, DAY)).toEqual({ "leg-1": "transit", "leg-2": "walking" });
    expect(getModesForDay(s, DAY2)).toEqual({});
  });

  it("parseStore: 破損/不正/version 違い → EMPTY (throw しない)", () => {
    expect(parseStore(null)).toEqual(EMPTY_SELECTED_MODE_STORE);
    expect(parseStore("")).toEqual(EMPTY_SELECTED_MODE_STORE);
    expect(parseStore("{ not json")).toEqual(EMPTY_SELECTED_MODE_STORE);
    expect(parseStore(JSON.stringify({ version: 999, byDay: {} }))).toEqual(EMPTY_SELECTED_MODE_STORE);
    expect(parseStore(JSON.stringify({ version: 1 }))).toEqual(EMPTY_SELECTED_MODE_STORE);
  });

  it("parseStore: 不正 mode/day/legKey を除去", () => {
    const raw = JSON.stringify({
      version: 1,
      byDay: {
        [DAY]: { "leg-1": "transit", "leg-bad": "car", "": "walking" },
        "bad-date": { "leg-1": "walking" },
        [DAY2]: "not-an-object",
      },
    });
    const s = parseStore(raw);
    expect(s.byDay[DAY]).toEqual({ "leg-1": "transit" });
    expect(s.byDay["bad-date"]).toBeUndefined();
    expect(s.byDay[DAY2]).toBeUndefined();
  });

  it("parse ↔ serialize round-trip", () => {
    let s = setMode(EMPTY_SELECTED_MODE_STORE, DAY, "leg-1", "driving");
    s = setMode(s, DAY2, "leg-1", "transit");
    expect(parseStore(serializeStore(s))).toEqual(s);
  });

  it("applyCaps: 保存日数を上限まで (古い日から破棄)", () => {
    const byDay: Record<string, Record<string, TransportMode>> = {};
    for (let i = 0; i < MAX_STORED_DAYS + 5; i++) {
      const month = String(Math.floor(i / 28) + 1).padStart(2, "0");
      const day = String((i % 28) + 1).padStart(2, "0");
      byDay[`2026-${month}-${day}`] = { "leg-1": "walking" };
    }
    expect(Object.keys(byDay).length).toBe(MAX_STORED_DAYS + 5);
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
    saveSelectedMode(DAY, "leg-1", "transit");
    expect(loadSelectedMode(DAY, "leg-1")).toBe("transit");
    expect(loadSelectedModesForDay(DAY)).toEqual({ "leg-1": "transit" });
  });

  it("clear で消える", () => {
    saveSelectedMode(DAY, "leg-1", "driving");
    clearSelectedModeStore();
    expect(loadSelectedMode(DAY, "leg-1")).toBeNull();
  });

  it("生 JSON は versioned key + 正しい形式", () => {
    saveSelectedMode(DAY, "leg-1", "walking");
    const raw = (globalThis as { localStorage: Storage }).localStorage.getItem(SELECTED_MODE_STORE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe(SELECTED_MODE_STORE_VERSION);
    expect(parsed.byDay[DAY]["leg-1"]).toBe("walking");
  });
});

describe("selectedModeStore — SSR / localStorage 不在 fail-open", () => {
  let orig: unknown;
  beforeEach(() => {
    orig = (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  afterEach(() => { (globalThis as { localStorage?: unknown }).localStorage = orig; });

  it("localStorage 不在でも throw せず空/no-op", () => {
    expect(() => saveSelectedMode(DAY, "leg-1", "transit")).not.toThrow();
    expect(loadSelectedMode(DAY, "leg-1")).toBeNull();
    expect(loadSelectedModesForDay(DAY)).toEqual({});
    expect(() => clearSelectedModeStore()).not.toThrow();
  });
});
