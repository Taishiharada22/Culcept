/**
 * CoAlter AOO Phase B B-5a — sleepStore invariant test
 *
 * 正本: lib/coalter/mirror/sleepStore.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getSleep,
  setSleep,
  clearSleep,
  __resetForTest,
} from "@/lib/coalter/mirror/sleepStore";

describe("B-5a sleepStore — 基本動作", () => {
  beforeEach(() => __resetForTest());

  it("default state は false", () => {
    expect(getSleep()).toBe(false);
  });

  it("setSleep(true) → true", () => {
    setSleep(true);
    expect(getSleep()).toBe(true);
  });

  it("setSleep(false) → false", () => {
    setSleep(true);
    setSleep(false);
    expect(getSleep()).toBe(false);
  });

  it("clearSleep で false に戻る", () => {
    setSleep(true);
    clearSleep();
    expect(getSleep()).toBe(false);
  });

  it("__resetForTest で false に戻る (test isolation)", () => {
    setSleep(true);
    __resetForTest();
    expect(getSleep()).toBe(false);
  });
});

describe("B-5a sleepStore — idempotent", () => {
  beforeEach(() => __resetForTest());

  it("setSleep(true) 複数回 → true 維持", () => {
    setSleep(true);
    setSleep(true);
    setSleep(true);
    expect(getSleep()).toBe(true);
  });

  it("setSleep(false) 複数回 → false 維持", () => {
    setSleep(false);
    setSleep(false);
    expect(getSleep()).toBe(false);
  });
});
