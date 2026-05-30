import { describe, it, expect, afterEach } from "vitest";

import { saveWearEvent, updateWearSatisfaction } from "@/lib/shared/wearEvents";
import { getCanonicalWornHistoryEntries } from "@/lib/shared/wornHistory/writeStore";

const WORN_KEY = "culcept_calendar_worn_v1";
const CANONICAL_KEY = "culcept_worn_history_v1";
// wearEvents は typeof window でガードし bare localStorage を使う。 writeStore も bare localStorage。
// node 環境では window 未定義なので window を truthy にし、 localStorage を同一 fake へ向ける。
const g = globalThis as unknown as { localStorage?: Storage; window?: unknown };

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

function install(ls: Storage): void {
  g.localStorage = ls;
  g.window = {}; // wearEvents は typeof window === "undefined" のガードのみ（bare localStorage を使う）
}

describe("wearEvents — canonical shadow mirror（Phase 4-4c）", () => {
  afterEach(() => {
    delete g.localStorage;
    delete g.window;
  });

  it("saveWearEvent: 旧 calendar key に保存する", () => {
    install(makeFakeStorage());
    saveWearEvent({ date: "2026-05-29", itemIds: ["m1"], source: "my-style" });
    const raw = JSON.parse(g.localStorage!.getItem(WORN_KEY)!);
    expect(raw[0].date).toBe("2026-05-29");
    expect(raw[0].itemIds).toEqual(["m1"]);
  });

  it("saveWearEvent: canonical へ origin=style / source=my_style で mirror", () => {
    install(makeFakeStorage());
    saveWearEvent({ date: "2026-05-29", itemIds: ["m1", "m2"], source: "my-style" });
    const canon = getCanonicalWornHistoryEntries();
    expect(canon).toHaveLength(1);
    expect(canon[0].origin).toBe("style");
    expect(canon[0].source).toBe("my_style");
    expect(canon[0].itemIds).toEqual(["m1", "m2"]);
  });

  it("canonical の learningEligible は satisfaction が無くても false", () => {
    install(makeFakeStorage());
    saveWearEvent({ date: "2026-05-29", itemIds: ["m1"], source: "my-style" });
    expect(getCanonicalWornHistoryEntries()[0].learningEligible).toBe(false);
  });

  it("satisfaction 付き wear でも learningEligible=false（satisfaction は保持）", () => {
    install(makeFakeStorage());
    saveWearEvent({ date: "2026-05-29", itemIds: ["m1"], satisfaction: 5, source: "my-style" });
    const canon = getCanonicalWornHistoryEntries();
    expect(canon[0].satisfaction).toBe(5);
    expect(canon[0].learningEligible).toBe(false);
  });

  it("updateWearSatisfaction: 旧 key を更新する", () => {
    install(makeFakeStorage());
    saveWearEvent({ date: "2026-05-29", itemIds: ["m1"], source: "my-style" });
    updateWearSatisfaction("2026-05-29", 4);
    const raw = JSON.parse(g.localStorage!.getItem(WORN_KEY)!);
    expect(raw[raw.length - 1].satisfaction).toBe(4);
  });

  it("updateWearSatisfaction: canonical の style entry の satisfaction も更新（learningEligible は false のまま）", () => {
    install(makeFakeStorage());
    saveWearEvent({ date: "2026-05-29", itemIds: ["m1"], source: "my-style" });
    updateWearSatisfaction("2026-05-29", 4);
    const canon = getCanonicalWornHistoryEntries();
    expect(canon).toHaveLength(1);
    expect(canon[0].satisfaction).toBe(4);
    expect(canon[0].learningEligible).toBe(false);
  });

  it("同日複数 saveWearEvent → canonical は (date, origin=style) で 1 件（最後が代表）", () => {
    install(makeFakeStorage());
    saveWearEvent({ date: "2026-05-29", itemIds: ["a"], source: "my-style" });
    saveWearEvent({ date: "2026-05-29", itemIds: ["b"], source: "my-style" });
    const canon = getCanonicalWornHistoryEntries();
    expect(canon).toHaveLength(1);
    expect(canon[0].itemIds).toEqual(["b"]); // 最後の wear が代表
    // old key は push 型で 2 件持つ（既存挙動は不変）
    expect(JSON.parse(g.localStorage!.getItem(WORN_KEY)!)).toHaveLength(2);
  });

  it("canonical mirror が失敗しても old key 保存は壊れない", () => {
    install(makeFakeStorage(new Set([CANONICAL_KEY])));
    expect(() => saveWearEvent({ date: "2026-05-29", itemIds: ["m1"], source: "my-style" })).not.toThrow();
    expect(JSON.parse(g.localStorage!.getItem(WORN_KEY)!)[0].date).toBe("2026-05-29"); // old key OK
    expect(getCanonicalWornHistoryEntries()).toHaveLength(0); // canonical no-op
  });

  it("note / moodTag は canonical に載らない", () => {
    install(makeFakeStorage());
    saveWearEvent({ date: "2026-05-29", itemIds: ["m1"], note: "[秘密] メモ", moodTag: "planned", source: "my-style" });
    const canon = getCanonicalWornHistoryEntries();
    expect(canon[0]).not.toHaveProperty("note");
    expect(canon[0]).not.toHaveProperty("moodTag");
    expect(JSON.stringify(canon[0])).not.toContain("秘密");
  });

  it("source=calendar の saveWearEvent は style として canonical に入れない（誤ラベル防止）", () => {
    install(makeFakeStorage());
    saveWearEvent({ date: "2026-05-29", itemIds: ["c1"], source: "calendar" });
    // old key には書かれるが、 canonical の style mirror はされない
    expect(JSON.parse(g.localStorage!.getItem(WORN_KEY)!)).toHaveLength(1);
    expect(getCanonicalWornHistoryEntries()).toHaveLength(0);
  });
});
