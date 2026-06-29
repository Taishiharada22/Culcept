// tests/unit/plan/aneuraCanaryOptIn.test.ts
// 評価OS S1/S2 canary scope guard（runtime opt-in）の検証。
//   opt-in なし→false / localStorage=1→true / sync(?evalOsCanary=1)→永続 / =0→削除 / per-user rollback /
//   localStorage 不在(SSR)→false(fail-closed)。jsdom 不使用ゆえ globalThis に Map-backed mock 注入（既存流儀）。
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isAneuraCanaryOptedIn,
  syncAneuraCanaryOptInFromUrl,
  EVAL_OS_CANARY_OPTIN_KEY,
} from "@/lib/plan/aneuraCanaryOptIn";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe("isAneuraCanaryOptedIn", () => {
  it("opt-in なし（localStorage 空）→ false（安全側）", () => {
    expect(isAneuraCanaryOptedIn()).toBe(false);
  });
  it("localStorage=1 → true", () => {
    globalThis.localStorage.setItem(EVAL_OS_CANARY_OPTIN_KEY, "1");
    expect(isAneuraCanaryOptedIn()).toBe(true);
  });
  it("localStorage 不在（SSR/非ブラウザ）→ false（fail-closed）", () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(isAneuraCanaryOptedIn()).toBe(false);
  });
});

describe("syncAneuraCanaryOptInFromUrl", () => {
  it("?evalOsCanary=1 → localStorage 永続・opted-in", () => {
    expect(syncAneuraCanaryOptInFromUrl("?evalOsCanary=1")).toBe("opted-in");
    expect(globalThis.localStorage.getItem(EVAL_OS_CANARY_OPTIN_KEY)).toBe("1");
  });
  it("?evalOsCanary=0 → localStorage 削除・opted-out", () => {
    globalThis.localStorage.setItem(EVAL_OS_CANARY_OPTIN_KEY, "1");
    expect(syncAneuraCanaryOptInFromUrl("?evalOsCanary=0")).toBe("opted-out");
    expect(globalThis.localStorage.getItem(EVAL_OS_CANARY_OPTIN_KEY)).toBeNull();
  });
  it("query なし → unchanged（既存値を変えない）", () => {
    globalThis.localStorage.setItem(EVAL_OS_CANARY_OPTIN_KEY, "1");
    expect(syncAneuraCanaryOptInFromUrl("")).toBe("unchanged");
    expect(globalThis.localStorage.getItem(EVAL_OS_CANARY_OPTIN_KEY)).toBe("1");
  });
  it("localStorage 不在 → unchanged（throw しない・fail-soft）", () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(syncAneuraCanaryOptInFromUrl("?evalOsCanary=1")).toBe("unchanged");
  });
  it("opt-in → opt-out で per-user rollback 可能", () => {
    syncAneuraCanaryOptInFromUrl("?evalOsCanary=1");
    expect(isAneuraCanaryOptedIn()).toBe(true);
    syncAneuraCanaryOptInFromUrl("?evalOsCanary=0");
    expect(isAneuraCanaryOptedIn()).toBe(false);
  });
});
