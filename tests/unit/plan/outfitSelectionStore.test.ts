import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  getSelectionForDate,
  saveSelection,
  clearSelectionForDate,
  type CalendarOutfitSelection,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitSelectionStore";

const KEY = "culcept_plan_outfit_selection_v1";
const g = globalThis as unknown as { localStorage?: Storage };

function makeFakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
  } as Storage;
}

function sel(date: string, p: Partial<CalendarOutfitSelection> = {}): CalendarOutfitSelection {
  return {
    date,
    selectedAt: `${date}T10:00:00.000Z`,
    proposalId: "p1",
    proposalTitle: "スマートカジュアル",
    itemIds: ["i1", "i2"],
    itemLabels: ["ニット", "パンツ"],
    source: "engine",
    ...p,
  };
}

function dateStr(i: number): string {
  return new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
}

describe("outfitSelectionStore", () => {
  beforeEach(() => {
    g.localStorage = makeFakeStorage();
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("save → getSelectionForDate で復元", () => {
    saveSelection(sel("2026-05-29"));
    const got = getSelectionForDate("2026-05-29");
    expect(got?.proposalId).toBe("p1");
    expect(got?.itemIds).toEqual(["i1", "i2"]);
    expect(got?.source).toBe("engine");
  });

  it("同じ date は 1 件で上書き", () => {
    saveSelection(sel("2026-05-29", { proposalId: "p1" }));
    saveSelection(sel("2026-05-29", { proposalId: "p2", proposalTitle: "きれいめ" }));
    expect(getSelectionForDate("2026-05-29")?.proposalId).toBe("p2");
  });

  it("別 date は共存", () => {
    saveSelection(sel("2026-05-29", { proposalId: "a" }));
    saveSelection(sel("2026-05-30", { proposalId: "b" }));
    expect(getSelectionForDate("2026-05-29")?.proposalId).toBe("a");
    expect(getSelectionForDate("2026-05-30")?.proposalId).toBe("b");
  });

  it("件数上限 60: 70 件保存 → 新しい 60 件のみ残る", () => {
    for (let i = 0; i < 70; i++) saveSelection(sel(dateStr(i), { proposalId: `p${i}` }));
    expect(getSelectionForDate(dateStr(0))).toBeNull(); // 最古は剪定
    expect(getSelectionForDate(dateStr(69))).not.toBeNull(); // 最新は残る
  });

  it("clearSelectionForDate で削除", () => {
    saveSelection(sel("2026-05-29"));
    clearSelectionForDate("2026-05-29");
    expect(getSelectionForDate("2026-05-29")).toBeNull();
  });

  it("SSR (localStorage なし) → read 空 / write no-op、 throw しない", () => {
    delete g.localStorage;
    expect(() => saveSelection(sel("2026-05-29"))).not.toThrow();
    expect(getSelectionForDate("2026-05-29")).toBeNull();
  });

  it("破損 JSON → 安全に null", () => {
    g.localStorage!.setItem(KEY, "{not valid json");
    expect(getSelectionForDate("2026-05-29")).toBeNull();
  });

  it("不正な要素は読み飛ばし、 正常な要素は残す", () => {
    g.localStorage!.setItem(
      KEY,
      JSON.stringify([{ date: "2026-05-29" /* proposalId/itemIds/source 欠落 */ }, sel("2026-05-30")]),
    );
    expect(getSelectionForDate("2026-05-29")).toBeNull(); // 不正 → filter
    expect(getSelectionForDate("2026-05-30")?.proposalId).toBe("p1"); // 正常 → 残る
  });

  it("quota error → no-op（throw せず既存値を保持）", () => {
    saveSelection(sel("2026-05-29", { proposalId: "keep" }));
    const ls = g.localStorage!;
    const original = ls.setItem.bind(ls);
    ls.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => saveSelection(sel("2026-05-30", { proposalId: "new" }))).not.toThrow();
    ls.setItem = original;
    expect(getSelectionForDate("2026-05-29")?.proposalId).toBe("keep");
    expect(getSelectionForDate("2026-05-30")).toBeNull();
  });
});
