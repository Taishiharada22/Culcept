/**
 * lib/shared/ スモークテスト
 *
 * 対象: 共有データ層の型安全性・データ一貫性の最低保証。
 * 純関数 + localStorage モックのみ。fetch 依存の関数はスキップ。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── location.ts ──
import {
  PREFECTURES,
  PREFECTURE_OFFICE_MAP,
  PREFECTURE_COORDS,
  prefectureToOfficeCode,
  officeCodeToPrefecture,
} from "@/lib/shared/location";

// ── wearEvents.ts ──
import {
  saveWearEvent,
  updateWearSatisfaction,
  loadAllWearEvents,
  buildWearSummaries,
  type WearEvent,
} from "@/lib/shared/wearEvents";

// ── timeOfDay.ts ──
import { getTimeOfDay, getTimeOfDayDetail } from "@/lib/shared/timeOfDay";

/* ═══════════════════════════════════════════
   localStorage モック
   ═══════════════════════════════════════════ */

let store: Record<string, string> = {};

const lsMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { store = {}; },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
};

beforeEach(() => {
  store = {};
  // window が存在しないと typeof window === "undefined" ガードに引っかかる
  vi.stubGlobal("window", { localStorage: lsMock });
  vi.stubGlobal("localStorage", lsMock);
});

/* ═══════════════════════════════════════════
   1. location.ts
   ═══════════════════════════════════════════ */

describe("lib/shared/location", () => {
  it("PREFECTURES は47都道府県を含む", () => {
    expect(PREFECTURES).toHaveLength(47);
    expect(PREFECTURES).toContain("東京都");
    expect(PREFECTURES).toContain("北海道");
    expect(PREFECTURES).toContain("沖縄県");
  });

  it("prefectureToOfficeCode — 有効な都道府県 → 6桁コード", () => {
    const code = prefectureToOfficeCode("東京都");
    expect(code).toBe("130000");
    expect(code).toMatch(/^\d{6}$/);
  });

  it("prefectureToOfficeCode — 無効な入力 → null", () => {
    expect(prefectureToOfficeCode("存在しない県")).toBeNull();
    expect(prefectureToOfficeCode("")).toBeNull();
  });

  it("officeCodeToPrefecture — 有効なコード → 都道府県名", () => {
    expect(officeCodeToPrefecture("130000")).toBe("東京都");
    expect(officeCodeToPrefecture("016000")).toBe("北海道");
  });

  it("officeCodeToPrefecture — 北海道分割コード → 北海道", () => {
    expect(officeCodeToPrefecture("011000")).toBe("北海道");
    expect(officeCodeToPrefecture("012000")).toBe("北海道");
  });

  it("officeCodeToPrefecture — 無効コード → null", () => {
    expect(officeCodeToPrefecture("999999")).toBeNull();
  });

  it("全47都道府県が正引き→逆引きで一致", () => {
    for (const pref of PREFECTURES) {
      const code = prefectureToOfficeCode(pref);
      expect(code).not.toBeNull();
      const back = officeCodeToPrefecture(code!);
      expect(back).toBe(pref);
    }
  });

  it("PREFECTURE_COORDS は全47都道府県に座標を持つ", () => {
    for (const pref of PREFECTURES) {
      const coord = PREFECTURE_COORDS[pref];
      expect(coord).toBeDefined();
      expect(coord.lat).toBeGreaterThan(20);
      expect(coord.lat).toBeLessThan(46);
      expect(coord.lon).toBeGreaterThan(122);
      expect(coord.lon).toBeLessThan(154);
    }
  });
});

/* ═══════════════════════════════════════════
   2. wearEvents.ts
   ═══════════════════════════════════════════ */

describe("lib/shared/wearEvents", () => {
  it("saveWearEvent → loadAllWearEvents で読み出せる", () => {
    saveWearEvent({
      date: "2026-04-01",
      itemIds: ["item-a", "item-b"],
      satisfaction: 4,
    });

    const events = loadAllWearEvents();
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-04-01");
    expect(events[0].itemIds).toEqual(["item-a", "item-b"]);
    expect(events[0].satisfaction).toBe(4);
    // saveWearEvent は source 未指定時 "my-style" をデフォルトで保存する
    expect(events[0].source).toBe("my-style");
  });

  it("saveWearEvent — source を明示指定できる", () => {
    saveWearEvent({
      date: "2026-04-02",
      itemIds: ["item-c"],
      source: "calendar",
    });
    const events = loadAllWearEvents();
    expect(events[0].source).toBe("calendar");
  });

  it("updateWearSatisfaction — 既存レコードの満足度を更新", () => {
    saveWearEvent({ date: "2026-04-01", itemIds: ["item-a"] });
    saveWearEvent({ date: "2026-04-01", itemIds: ["item-b"] });

    updateWearSatisfaction("2026-04-01", 5);

    const events = loadAllWearEvents();
    // 同日の最新レコード（item-b）が更新される
    const updated = events.find(e => e.itemIds.includes("item-b"));
    expect(updated?.satisfaction).toBe(5);
  });

  it("loadAllWearEvents — Calendar + My-Style を統合する", () => {
    // Calendar source
    store["culcept_calendar_worn_v1"] = JSON.stringify([
      { date: "2026-04-01", itemIds: ["cal-1"], satisfaction: 3 },
    ]);
    // My-Style source (costPerWear 形式)
    store["culcept_wear_records_v1"] = JSON.stringify([
      { itemId: "ms-1", date: "2026-04-02" },
      { itemId: "ms-2", date: "2026-04-02" },
    ]);

    const events = loadAllWearEvents();
    expect(events).toHaveLength(2);
    // 降順ソート
    expect(events[0].date).toBe("2026-04-02");
    expect(events[0].source).toBe("my-style");
    expect(events[0].itemIds).toEqual(["ms-1", "ms-2"]);
    expect(events[1].date).toBe("2026-04-01");
    expect(events[1].source).toBe("calendar");
  });

  it("loadAllWearEvents — Calendar と同日の My-Style は重複排除", () => {
    store["culcept_calendar_worn_v1"] = JSON.stringify([
      { date: "2026-04-01", itemIds: ["cal-1"] },
    ]);
    store["culcept_wear_records_v1"] = JSON.stringify([
      { itemId: "ms-1", date: "2026-04-01" },
    ]);

    const events = loadAllWearEvents();
    // Calendar が優先、My-Style の同日レコードは除外
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("calendar");
  });

  it("loadAllWearEvents — 空ストレージでもエラーにならない", () => {
    const events = loadAllWearEvents();
    expect(events).toEqual([]);
  });

  it("buildWearSummaries — アイテム別の集計が正しい", () => {
    const events: WearEvent[] = [
      { date: "2026-04-03", itemIds: ["a", "b"], source: "calendar" },
      { date: "2026-04-01", itemIds: ["a", "c"], source: "calendar" },
      { date: "2026-03-28", itemIds: ["a"], source: "my-style" },
    ];

    const summaries = buildWearSummaries(events);
    expect(summaries.size).toBe(3);

    const a = summaries.get("a")!;
    expect(a.count).toBe(3);
    expect(a.lastWornAt).toBe("2026-04-03");

    const b = summaries.get("b")!;
    expect(b.count).toBe(1);

    const c = summaries.get("c")!;
    expect(c.count).toBe(1);
    expect(c.lastWornAt).toBe("2026-04-01");
  });

  it("buildWearSummaries — 空配列 → 空 Map", () => {
    const summaries = buildWearSummaries([]);
    expect(summaries.size).toBe(0);
  });
});

/* ═══════════════════════════════════════════
   3. timeOfDay.ts
   ═══════════════════════════════════════════ */

describe("lib/shared/timeOfDay", () => {
  it("getTimeOfDay は 3 値のいずれかを返す", () => {
    const result = getTimeOfDay();
    expect(["morning", "afternoon", "night"]).toContain(result);
  });

  it("getTimeOfDayDetail は 5 値のいずれかを返す", () => {
    const result = getTimeOfDayDetail();
    expect(["late_night", "morning", "afternoon", "late_afternoon", "evening"]).toContain(result);
  });
});

/* ═══════════════════════════════════════════
   4. wardrobe.ts (localStorage フォールバック)
   ═══════════════════════════════════════════ */

import { loadWardrobeFromLocal } from "@/lib/shared/wardrobe";

describe("lib/shared/wardrobe", () => {
  it("loadWardrobeFromLocal — 有効データ → WardrobeItem[]", () => {
    store["culcept_my_style_v3"] = JSON.stringify({
      wardrobe: [
        { id: "w1", name: "白Tシャツ", category: "tops" },
        { id: "w2", name: "デニム", category: "bottoms" },
      ],
    });

    const items = loadWardrobeFromLocal();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe("w1");
  });

  it("loadWardrobeFromLocal — キーなし → 空配列", () => {
    expect(loadWardrobeFromLocal()).toEqual([]);
  });

  it("loadWardrobeFromLocal — 不正JSON → 空配列", () => {
    store["culcept_my_style_v3"] = "broken{json";
    expect(loadWardrobeFromLocal()).toEqual([]);
  });

  it("loadWardrobeFromLocal — wardrobe が配列でない → 空配列", () => {
    store["culcept_my_style_v3"] = JSON.stringify({ wardrobe: "not-array" });
    expect(loadWardrobeFromLocal()).toEqual([]);
  });
});
