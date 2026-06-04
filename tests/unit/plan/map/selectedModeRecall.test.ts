import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  setMode, recallPriorLegMode, loadPriorLegMode, saveSelectedMode,
  EMPTY_SELECTED_MODE_STORE,
} from "@/lib/plan/map/selectedModeStore";

const D1 = "2026-06-01", D2 = "2026-06-02", D3 = "2026-06-03", TODAY = "2026-06-04";

describe("recallPriorLegMode — S2-A 前回こう動いた (pure)", () => {
  it("過去日の mode + その日を返す", () => {
    const s = setMode(EMPTY_SELECTED_MODE_STORE, D2, "leg-1", "transit");
    expect(recallPriorLegMode(s, TODAY, "leg-1")).toEqual({ mode: "transit", dayISO: D2 });
  });
  it("複数過去日 → 最も新しい過去日", () => {
    let s = setMode(EMPTY_SELECTED_MODE_STORE, D1, "leg-1", "walking");
    s = setMode(s, D2, "leg-1", "driving");
    s = setMode(s, D3, "leg-1", "transit");
    expect(recallPriorLegMode(s, TODAY, "leg-1")).toEqual({ mode: "transit", dayISO: D3 });
  });
  it("同日現在値は対象外 (当日のみ → null)", () => {
    const s = setMode(EMPTY_SELECTED_MODE_STORE, TODAY, "leg-1", "driving");
    expect(recallPriorLegMode(s, TODAY, "leg-1")).toBeNull();
  });
  it("未来日は見ない (未来のみ → null)", () => {
    const s = setMode(EMPTY_SELECTED_MODE_STORE, "2026-06-10", "leg-1", "driving");
    expect(recallPriorLegMode(s, TODAY, "leg-1")).toBeNull();
  });
  it("当日と過去日 両方 → 過去日を返す (当日除外)", () => {
    let s = setMode(EMPTY_SELECTED_MODE_STORE, D2, "leg-1", "walking");
    s = setMode(s, TODAY, "leg-1", "driving");
    expect(recallPriorLegMode(s, TODAY, "leg-1")).toEqual({ mode: "walking", dayISO: D2 });
  });
  it("legKey が過去日に無ければ null", () => {
    const s = setMode(EMPTY_SELECTED_MODE_STORE, D2, "leg-other", "transit");
    expect(recallPriorLegMode(s, TODAY, "leg-1")).toBeNull();
  });
  it("空 store / 不正 dayISO / 空 legKey → null", () => {
    expect(recallPriorLegMode(EMPTY_SELECTED_MODE_STORE, TODAY, "leg-1")).toBeNull();
    const s = setMode(EMPTY_SELECTED_MODE_STORE, D2, "leg-1", "transit");
    expect(recallPriorLegMode(s, "bad-date", "leg-1")).toBeNull();
    expect(recallPriorLegMode(s, TODAY, "")).toBeNull();
  });
});

describe("loadPriorLegMode — localStorage 版 (mocked)", () => {
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
  it("過去日に保存 → 当日 recall で返る", () => {
    saveSelectedMode(D2, "leg-1", "transit");
    expect(loadPriorLegMode(TODAY, "leg-1")).toEqual({ mode: "transit", dayISO: D2 });
  });
  it("過去日に無ければ null", () => {
    expect(loadPriorLegMode(TODAY, "leg-x")).toBeNull();
  });
});

describe("loadPriorLegMode — SSR fail-open", () => {
  let orig: unknown;
  beforeEach(() => {
    orig = (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  afterEach(() => { (globalThis as { localStorage?: unknown }).localStorage = orig; });
  it("localStorage 不在でも throw せず null", () => {
    expect(() => loadPriorLegMode(TODAY, "leg-1")).not.toThrow();
    expect(loadPriorLegMode(TODAY, "leg-1")).toBeNull();
  });
});
