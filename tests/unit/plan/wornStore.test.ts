import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  getWornForDate,
  saveWorn,
  clearWornForDate,
  toWornRecord,
  type PlanWornRecord,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/wornStore";
import type { CalendarOutfitProposalVM } from "@/app/(culcept)/plan/tabs/_calendar-outfit/types";

const KEY = "culcept_plan_worn_v1";
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

function worn(date: string, p: Partial<PlanWornRecord> = {}): PlanWornRecord {
  return { date, wornAt: `${date}T20:00:00.000Z`, proposalId: "p1", itemIds: ["w1", "w2"], source: "engine", ...p };
}

function dateStr(i: number): string {
  return new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
}

describe("wornStore", () => {
  beforeEach(() => {
    g.localStorage = makeFakeStorage();
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("save → getWornForDate で復元", () => {
    saveWorn(worn("2026-05-29"));
    expect(getWornForDate("2026-05-29")?.proposalId).toBe("p1");
    expect(getWornForDate("2026-05-29")?.itemIds).toEqual(["w1", "w2"]);
  });

  it("同じ date は 1 件で上書き", () => {
    saveWorn(worn("2026-05-29", { proposalId: "p1" }));
    saveWorn(worn("2026-05-29", { proposalId: "p2" }));
    expect(getWornForDate("2026-05-29")?.proposalId).toBe("p2");
  });

  it("件数上限 60: 70 件 → 新しい 60 件のみ", () => {
    for (let i = 0; i < 70; i++) saveWorn(worn(dateStr(i), { proposalId: `p${i}` }));
    expect(getWornForDate(dateStr(0))).toBeNull();
    expect(getWornForDate(dateStr(69))).not.toBeNull();
  });

  it("clearWornForDate で削除（着用取り消し）", () => {
    saveWorn(worn("2026-05-29"));
    clearWornForDate("2026-05-29");
    expect(getWornForDate("2026-05-29")).toBeNull();
  });

  it("SSR (localStorage なし) → read 空 / write no-op、 throw しない", () => {
    delete g.localStorage;
    expect(() => saveWorn(worn("2026-05-29"))).not.toThrow();
    expect(getWornForDate("2026-05-29")).toBeNull();
  });

  it("破損 JSON → 安全に null", () => {
    g.localStorage!.setItem(KEY, "{broken");
    expect(getWornForDate("2026-05-29")).toBeNull();
  });

  it("quota error → no-op（throw せず既存値保持）", () => {
    saveWorn(worn("2026-05-29", { proposalId: "keep" }));
    const ls = g.localStorage!;
    const original = ls.setItem.bind(ls);
    ls.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => saveWorn(worn("2026-05-30", { proposalId: "new" }))).not.toThrow();
    ls.setItem = original;
    expect(getWornForDate("2026-05-29")?.proposalId).toBe("keep");
    expect(getWornForDate("2026-05-30")).toBeNull();
  });

  it("toWornRecord → 安全な最小レコード（rating なし、 ids/source のみ）", () => {
    const proposal: CalendarOutfitProposalVM = {
      id: "p-office",
      title: "きれいめオフィス",
      items: [
        { id: "w1", category: "トップス", label: "オフホワイト ブラウス", shape: "blouse", color: "#f1ede6" },
        { id: "w2", category: "ボトムス", label: "ネイビー スラックス", shape: "bottom", color: "#3b4a63" },
      ],
      syncScore: 79,
      syncBandKey: "good",
    };
    const rec = toWornRecord(proposal, "2026-05-29", "engine", "2026-05-29T20:00:00.000Z");
    expect(rec).toEqual({
      date: "2026-05-29",
      wornAt: "2026-05-29T20:00:00.000Z",
      proposalId: "p-office",
      itemIds: ["w1", "w2"],
      source: "engine",
    });
    // rating / title / label / color を含まない
    expect(rec.satisfaction).toBeUndefined();
    const blob = JSON.stringify(rec);
    expect(blob).not.toContain("きれいめ");
    expect(blob).not.toContain("ブラウス");
    expect(blob).not.toContain("#f1ede6");
  });

  it("round-trip: toWornRecord → saveWorn → getWornForDate", () => {
    const proposal: CalendarOutfitProposalVM = {
      id: "p1",
      title: "t",
      items: [{ id: "w1", category: "c", label: "l", shape: "top", color: "#000" }],
      syncScore: 70,
      syncBandKey: "good",
    };
    saveWorn(toWornRecord(proposal, "2026-05-29", "mock", "t"));
    expect(getWornForDate("2026-05-29")?.source).toBe("mock");
    expect(getWornForDate("2026-05-29")?.proposalId).toBe("p1");
  });
});
