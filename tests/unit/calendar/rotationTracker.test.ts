import { describe, it, expect, afterEach, vi } from "vitest";

import { saveWornRecord } from "@/app/(culcept)/calendar/_lib/rotationTracker";
import { saveWearEvent } from "@/lib/shared/wearEvents";
import { getCanonicalWornHistoryEntries } from "@/lib/shared/wornHistory/writeStore";
import type { WornRecord } from "@/app/(culcept)/calendar/_lib/types";

const WORN_KEY = "culcept_calendar_worn_v1";
const CANONICAL_KEY = "culcept_worn_history_v1";
// rotationTracker は window.localStorage、 writeStore/wearEvents は bare localStorage を使う。
// 両者を同一 fake に向けるため window.localStorage と globalThis.localStorage を同じ object にする。
const g = globalThis as unknown as {
  localStorage?: Storage;
  window?: unknown;
};

function makeFakeStorage(throwOnKeys?: Set<string>): Storage {
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
      if (throwOnKeys?.has(k)) throw new Error("QuotaExceededError");
      m.set(k, String(v));
    },
  } as Storage;
}

function record(date: string, p: Partial<WornRecord> = {}): WornRecord {
  return { date, itemIds: ["c1", "c2"], satisfaction: 4, ...p };
}

/** node 環境で rotationTracker（window.localStorage）+ writeStore（bare localStorage）を同一 fake へ向ける。 */
function install(ls: Storage): void {
  ls.setItem(WORN_KEY, "[]"); // loadWornHistory が present を見て memoryWornHistory をリセット（テスト間汚染防止）
  g.localStorage = ls;
  // node 環境では window 未定義 → rotationTracker の getStorage が memory-only に落ちる。
  // window.localStorage を同一 fake に向ける（writeStore/wearEvents は bare localStorage を使うため g.localStorage も同 object）。
  g.window = { localStorage: ls, sessionStorage: makeFakeStorage(), addEventListener: () => {} };
}

describe("rotationTracker — canonical shadow mirror（Phase 4-3）", () => {
  afterEach(() => {
    delete g.localStorage;
    delete g.window;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("saveWornRecord → 旧 calendar key に保存される", () => {
    install(makeFakeStorage());
    saveWornRecord(record("2026-05-29"));
    const raw = g.localStorage!.getItem(WORN_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)[0].date).toBe("2026-05-29");
  });

  it("同時に canonical へ origin=calendar / source=calendar_form で mirror される", () => {
    install(makeFakeStorage());
    saveWornRecord(record("2026-05-29", { itemIds: ["c1", "c2"], satisfaction: 4 }));
    const canon = getCanonicalWornHistoryEntries();
    expect(canon).toHaveLength(1);
    expect(canon[0].origin).toBe("calendar");
    expect(canon[0].source).toBe("calendar_form");
    expect(canon[0].itemIds).toEqual(["c1", "c2"]);
    expect(canon[0].satisfaction).toBe(4);
  });

  it("note は canonical entry に持ち越さない（privacy-minimal）", () => {
    install(makeFakeStorage());
    saveWornRecord(record("2026-05-29", { note: "[会食] 大事な日" }));
    const canon = getCanonicalWornHistoryEntries();
    expect(canon[0]).not.toHaveProperty("note");
    expect(JSON.stringify(canon[0])).not.toContain("会食");
  });

  it("同じ日を再保存しても canonical は重複しない（idempotent: date+origin=calendar）", () => {
    install(makeFakeStorage());
    saveWornRecord(record("2026-05-29", { itemIds: ["a"] }));
    saveWornRecord(record("2026-05-29", { itemIds: ["b"] }));
    expect(getCanonicalWornHistoryEntries()).toHaveLength(1);
  });

  it("satisfaction 更新相当の再保存で canonical が更新される", () => {
    install(makeFakeStorage());
    saveWornRecord(record("2026-05-29", { satisfaction: 2 }));
    saveWornRecord(record("2026-05-29", { satisfaction: 5 }));
    const canon = getCanonicalWornHistoryEntries();
    expect(canon).toHaveLength(1);
    expect(canon[0].satisfaction).toBe(5);
    // calendar_form + satisfaction + itemIds → learningEligible candidate（engine はまだ読まない）
    expect(canon[0].learningEligible).toBe(true);
  });

  it("canonical mirror 失敗時も saveWornRecord は壊れない（旧 key は保存される）", () => {
    // canonical key の setItem だけ throw、 calendar key は成功する fake
    install(makeFakeStorage(new Set([CANONICAL_KEY])));
    expect(() => saveWornRecord(record("2026-05-29"))).not.toThrow();
    expect(g.localStorage!.getItem(WORN_KEY)).toBeTruthy(); // 旧 calendar 保存は成功
    expect(getCanonicalWornHistoryEntries()).toHaveLength(0); // canonical は no-op
  });

  it("通常 localStorage 成功時に /api/calendar/day fetch は呼ばれない", () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal("fetch", fetchSpy);
    install(makeFakeStorage());
    saveWornRecord(record("2026-05-29"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("wearEvents.saveWearEvent は canonical mirror 対象外（My-Style/Home は別経路）", () => {
    install(makeFakeStorage());
    saveWearEvent({ date: "2026-05-29", itemIds: ["m1"], source: "my-style" });
    expect(getCanonicalWornHistoryEntries()).toHaveLength(0); // canonical に入らない
    expect(g.localStorage!.getItem(WORN_KEY)).toBeTruthy(); // 旧 calendar key には書かれる（既存挙動）
  });
});
