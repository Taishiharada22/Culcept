import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  CANONICAL_WORN_HISTORY_KEY,
  getCanonicalWornHistoryEntries,
  upsertCanonicalWornHistoryEntry,
  clearCanonicalWornHistoryEntryForDate,
} from "@/lib/shared/wornHistory/writeStore";
import { planWornRecordToEntry } from "@/lib/shared/wornHistory/converters";
import type { WornHistoryEntry } from "@/lib/shared/wornHistory/types";

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

function entry(date: string, p: Partial<WornHistoryEntry> = {}): WornHistoryEntry {
  return {
    date,
    wornAt: `${date}T20:00:00.000Z`,
    itemIds: ["w1"],
    source: "engine",
    origin: "plan",
    learningEligible: false,
    ...p,
  };
}

function dateStr(i: number): string {
  return new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
}

describe("wornHistory writeStore (canonical)", () => {
  beforeEach(() => {
    g.localStorage = makeFakeStorage();
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("空なら []", () => {
    expect(getCanonicalWornHistoryEntries()).toEqual([]);
  });

  it("upsert → getCanonicalWornHistoryEntries で復元", () => {
    upsertCanonicalWornHistoryEntry(entry("2026-05-29", { itemIds: ["w1", "w2"] }));
    const all = getCanonicalWornHistoryEntries();
    expect(all).toHaveLength(1);
    expect(all[0].date).toBe("2026-05-29");
    expect(all[0].origin).toBe("plan");
    expect(all[0].itemIds).toEqual(["w1", "w2"]);
  });

  it("同じ (date, origin) は重複させず置換（idempotent）", () => {
    upsertCanonicalWornHistoryEntry(entry("2026-05-29", { satisfaction: 2 }));
    upsertCanonicalWornHistoryEntry(entry("2026-05-29", { satisfaction: 5 }));
    const all = getCanonicalWornHistoryEntries();
    expect(all).toHaveLength(1);
    expect(all[0].satisfaction).toBe(5);
  });

  it("同じ date でも origin が違えば共存（plan + calendar）", () => {
    upsertCanonicalWornHistoryEntry(entry("2026-05-29", { origin: "plan" }));
    upsertCanonicalWornHistoryEntry(entry("2026-05-29", { origin: "calendar", source: "calendar_form" }));
    const all = getCanonicalWornHistoryEntries();
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.origin).sort()).toEqual(["calendar", "plan"]);
  });

  it("satisfaction を upsert で更新できる", () => {
    upsertCanonicalWornHistoryEntry(entry("2026-05-29"));
    upsertCanonicalWornHistoryEntry(entry("2026-05-29", { satisfaction: 4, ratedAt: "t" }));
    expect(getCanonicalWornHistoryEntries()[0].satisfaction).toBe(4);
  });

  it("clear(date, origin) は該当 (date, origin) だけ消す", () => {
    upsertCanonicalWornHistoryEntry(entry("2026-05-29", { origin: "plan" }));
    upsertCanonicalWornHistoryEntry(entry("2026-05-29", { origin: "calendar", source: "calendar_form" }));
    clearCanonicalWornHistoryEntryForDate("2026-05-29", "plan");
    const all = getCanonicalWornHistoryEntries();
    expect(all).toHaveLength(1);
    expect(all[0].origin).toBe("calendar");
  });

  it("clear(date) は origin 省略時にその日の全 origin を消す", () => {
    upsertCanonicalWornHistoryEntry(entry("2026-05-29", { origin: "plan" }));
    upsertCanonicalWornHistoryEntry(entry("2026-05-29", { origin: "calendar", source: "calendar_form" }));
    clearCanonicalWornHistoryEntryForDate("2026-05-29");
    expect(getCanonicalWornHistoryEntries()).toHaveLength(0);
  });

  it("clear は他の日付に影響しない", () => {
    upsertCanonicalWornHistoryEntry(entry("2026-05-29"));
    upsertCanonicalWornHistoryEntry(entry("2026-05-30"));
    clearCanonicalWornHistoryEntryForDate("2026-05-29", "plan");
    const all = getCanonicalWornHistoryEntries();
    expect(all).toHaveLength(1);
    expect(all[0].date).toBe("2026-05-30");
  });

  it("破損 JSON → 安全に []", () => {
    g.localStorage!.setItem(CANONICAL_WORN_HISTORY_KEY, "{broken");
    expect(getCanonicalWornHistoryEntries()).toEqual([]);
  });

  it("無効な entry は保存しない（防御）", () => {
    upsertCanonicalWornHistoryEntry({ date: "2026-05-29" } as unknown as WornHistoryEntry);
    expect(getCanonicalWornHistoryEntries()).toHaveLength(0);
    // 不正 source / origin も弾く
    upsertCanonicalWornHistoryEntry(entry("2026-05-29", { source: "weird" as WornHistoryEntry["source"] }));
    expect(getCanonicalWornHistoryEntries()).toHaveLength(0);
  });

  it("SSR (localStorage なし) → read [] / write no-op / throw しない", () => {
    delete g.localStorage;
    expect(() => upsertCanonicalWornHistoryEntry(entry("2026-05-29"))).not.toThrow();
    expect(() => clearCanonicalWornHistoryEntryForDate("2026-05-29", "plan")).not.toThrow();
    expect(getCanonicalWornHistoryEntries()).toEqual([]);
  });

  it("quota error → no-op（throw せず既存値保持）", () => {
    upsertCanonicalWornHistoryEntry(entry("2026-05-29", { itemIds: ["keep"] }));
    const ls = g.localStorage!;
    const original = ls.setItem.bind(ls);
    ls.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => upsertCanonicalWornHistoryEntry(entry("2026-05-30", { itemIds: ["new"] }))).not.toThrow();
    ls.setItem = original;
    expect(getCanonicalWornHistoryEntries()).toHaveLength(1);
    expect(getCanonicalWornHistoryEntries()[0].itemIds).toEqual(["keep"]);
  });

  it("件数上限 365: 366 件 → 新しい 365 件のみ", () => {
    for (let i = 0; i < 366; i++) upsertCanonicalWornHistoryEntry(entry(dateStr(i)));
    const all = getCanonicalWornHistoryEntries();
    expect(all).toHaveLength(365);
    expect(all.some((e) => e.date === dateStr(0))).toBe(false); // 最古は剪定
    expect(all.some((e) => e.date === dateStr(365))).toBe(true); // 最新は保持
  });

  // ── converter 連携: mock/hydrated_mock は learningEligible=false を保持（学習禁止） ──
  it("converter 連携: mock 着用は保存されるが learningEligible=false", () => {
    const e = planWornRecordToEntry({
      date: "2026-05-01",
      wornAt: "t",
      itemIds: ["w1"],
      source: "mock",
      satisfaction: 5,
    });
    upsertCanonicalWornHistoryEntry(e);
    const got = getCanonicalWornHistoryEntries()[0];
    expect(got.source).toBe("mock");
    expect(got.learningEligible).toBe(false);
  });

  it("converter 連携: hydrated_mock も learningEligible=false", () => {
    const e = planWornRecordToEntry({
      date: "2026-05-01",
      wornAt: "t",
      itemIds: ["w1"],
      source: "hydrated_mock",
      satisfaction: 5,
    });
    upsertCanonicalWornHistoryEntry(e);
    expect(getCanonicalWornHistoryEntries()[0].learningEligible).toBe(false);
  });

  it("converter 連携: engine + 評価 + itemIds → learningEligible=true（将来の learning candidate）", () => {
    const e = planWornRecordToEntry({
      date: "2026-05-02",
      wornAt: "t",
      itemIds: ["w1"],
      source: "engine",
      satisfaction: 5,
    });
    upsertCanonicalWornHistoryEntry(e);
    expect(getCanonicalWornHistoryEntries()[0].learningEligible).toBe(true);
  });
});
