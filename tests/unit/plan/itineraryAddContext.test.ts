/**
 * Phase E-3C-1 — 旅程追加 day/trip 文脈（type/context only）
 *
 * 検証:
 *   - buildAddedEntry: context あり→dayId/tripId/sourceDate 付与 / context なし→従来どおり（item 変換不変）
 *   - localStorage 後方互換: optional 文脈の round-trip / 旧 shape（文脈なし）も読める
 *   - public hook signature 不変: addToItinerary は arity 1（(item) のみ）/ Provider は context props あり/なし両方で動く
 *
 * DB/Supabase 不触。SSR（renderToStaticMarkup）で effect は走らないため store には触れない。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAddedEntry, locationItemToScheduleItem } from "@/app/(culcept)/calendar/_lib/travel/itineraryConvert";
import { readAddedEntries, writeAddedEntries, TRAVEL_LS_KEYS, type StoredAddedEntry } from "@/app/(culcept)/calendar/_lib/travel/travelLocalStore";
import { TravelItineraryProvider, useTravelItinerary } from "@/app/(culcept)/calendar/_components/travel/state/ItineraryContext";
import type { LocationItem } from "@/app/(culcept)/calendar/_lib/travel/types";

const ITEM: LocationItem = {
  id: "loc-1",
  kind: "spot",
  prefecture: "京都府",
  title: "清水寺",
  areaLabel: "東山",
  classification: "standard",
  source: "traveler",
  author: { name: "あなた", source: "traveler" },
  genre: "寺社",
  themeKeys: [],
  tags: ["静か", "写真映え"],
  rating: 0,
  ratingCount: 0,
  description: "舞台からの絶景",
  photo: null,
};

describe("buildAddedEntry", () => {
  it("context ありで dayId/tripId/sourceDate を付与", () => {
    const e = buildAddedEntry(ITEM, { dayId: "d1", tripId: "t1", sourceDate: "2026-06-24" });
    expect(e.sourceId).toBe("loc-1");
    expect(e.dayId).toBe("d1");
    expect(e.tripId).toBe("t1");
    expect(e.sourceDate).toBe("2026-06-24");
    expect(e.item).toEqual(locationItemToScheduleItem(ITEM)); // 変換は従来不変
  });

  it("context なしは従来どおり（文脈フィールド無し）", () => {
    const e = buildAddedEntry(ITEM);
    expect(e.sourceId).toBe("loc-1");
    expect(e.dayId).toBeUndefined();
    expect(e.tripId).toBeUndefined();
    expect(e.sourceDate).toBeUndefined();
  });

  it("空文字 context は付与しない（falsy ガード）", () => {
    const e = buildAddedEntry(ITEM, { dayId: "", tripId: "", sourceDate: "" });
    expect(e.dayId).toBeUndefined();
    expect(e.tripId).toBeUndefined();
    expect(e.sourceDate).toBeUndefined();
  });
});

describe("localStorage 後方互換（optional 文脈）", () => {
  function createMockStorage() {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      _store: store,
    };
  }
  let mockLS: ReturnType<typeof createMockStorage>;
  beforeEach(() => {
    mockLS = createMockStorage();
    vi.stubGlobal("window", { localStorage: mockLS });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("文脈付き entry を round-trip で保持", () => {
    const entries: StoredAddedEntry[] = [
      buildAddedEntry(ITEM, { dayId: "d1", tripId: "t1", sourceDate: "2026-06-24" }),
    ];
    writeAddedEntries(entries);
    const back = readAddedEntries();
    expect(back).toHaveLength(1);
    expect(back[0].dayId).toBe("d1");
    expect(back[0].tripId).toBe("t1");
    expect(back[0].sourceDate).toBe("2026-06-24");
    expect(back[0].sourceId).toBe("loc-1");
  });

  it("旧 shape（文脈なし）も読める＝後方互換", () => {
    // E-1 以前の永続形（dayId 等が無い）
    mockLS.setItem(
      TRAVEL_LS_KEYS.itinerary,
      JSON.stringify([{ sourceId: "old-1", item: { id: "added-old-1", name: "旧スポット", startTime: "", categories: [], photo: null } }])
    );
    const back = readAddedEntries();
    expect(back).toHaveLength(1);
    expect(back[0].sourceId).toBe("old-1");
    expect(back[0].dayId).toBeUndefined();
    expect(back[0].tripId).toBeUndefined();
    expect(back[0].sourceDate).toBeUndefined();
  });

  it("文脈なし entry の write は文脈キーを書かない", () => {
    writeAddedEntries([buildAddedEntry(ITEM)]);
    const raw = JSON.parse(mockLS.getItem(TRAVEL_LS_KEYS.itinerary)!);
    expect(raw[0].dayId).toBeUndefined();
    expect(raw[0].tripId).toBeUndefined();
    expect(raw[0].sourceDate).toBeUndefined();
  });
});

describe("public hook signature 不変（SSR）", () => {
  type Captured = { addArity: number; hasFns: boolean; addedCount: number };
  let captured: Captured | null = null;
  function Probe() {
    const ctx = useTravelItinerary();
    captured = {
      addArity: ctx.addToItinerary.length,
      hasFns:
        typeof ctx.addToItinerary === "function" &&
        typeof ctx.removeAdded === "function" &&
        typeof ctx.hasAdded === "function",
      addedCount: ctx.addedCount,
    };
    return null;
  }

  it("context props ありで addToItinerary は arity 1（(item) のみ）", () => {
    captured = null;
    renderToStaticMarkup(
      createElement(TravelItineraryProvider, {
        currentTripId: "t1",
        currentDayId: "d1",
        currentDate: "2026-06-24",
        children: createElement(Probe),
      })
    );
    expect(captured!.addArity).toBe(1);
    expect(captured!.hasFns).toBe(true);
    expect(captured!.addedCount).toBe(0); // SSR: effect 未実行＝空
  });

  it("context props なしでも Provider が動く（後方互換）", () => {
    captured = null;
    renderToStaticMarkup(createElement(TravelItineraryProvider, { children: createElement(Probe) }));
    expect(captured!.hasFns).toBe(true);
    expect(captured!.addArity).toBe(1);
  });
});
