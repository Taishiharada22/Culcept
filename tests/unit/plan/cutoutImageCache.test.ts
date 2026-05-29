import { describe, it, expect, beforeEach } from "vitest";

import {
  getCachedCutout,
  setCachedCutout,
  clearCutoutCache,
  cutoutCacheSize,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/cutoutImageCache";

describe("cutoutImageCache (session-only, capped)", () => {
  beforeEach(() => {
    clearCutoutCache();
  });

  it("set → get で復元、 未登録は null", () => {
    expect(getCachedCutout("data:a")).toBeNull();
    setCachedCutout("data:a", "cut:a");
    expect(getCachedCutout("data:a")).toBe("cut:a");
  });

  it("同 key は上書き", () => {
    setCachedCutout("data:a", "cut:a1");
    setCachedCutout("data:a", "cut:a2");
    expect(getCachedCutout("data:a")).toBe("cut:a2");
    expect(cutoutCacheSize()).toBe(1);
  });

  it("件数上限 48 を超えると古いものから剪定", () => {
    for (let i = 0; i < 60; i++) setCachedCutout(`data:${i}`, `cut:${i}`);
    expect(cutoutCacheSize()).toBe(48);
    expect(getCachedCutout("data:0")).toBeNull(); // 最古は剪定済み
    expect(getCachedCutout("data:59")).toBe("cut:59"); // 最新は残る
  });

  it("get は LRU touch（直近参照を生かし、 剪定対象から外す）", () => {
    for (let i = 0; i < 48; i++) setCachedCutout(`data:${i}`, `cut:${i}`);
    // data:0 を touch（末尾へ）→ 次の挿入で剪定されるのは data:1
    expect(getCachedCutout("data:0")).toBe("cut:0");
    setCachedCutout("data:new", "cut:new");
    expect(getCachedCutout("data:0")).toBe("cut:0"); // 生存
    expect(getCachedCutout("data:1")).toBeNull(); // 代わりに剪定
  });

  it("clear で空になる", () => {
    setCachedCutout("data:a", "cut:a");
    clearCutoutCache();
    expect(cutoutCacheSize()).toBe(0);
    expect(getCachedCutout("data:a")).toBeNull();
  });
});
