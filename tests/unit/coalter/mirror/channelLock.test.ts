/**
 * CoAlter AOO Phase B B-5a — channelLock invariant test
 *
 * 正本: lib/coalter/mirror/channelLock.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  tryAcquireMirrorLock,
  releaseMirrorLock,
  getMirrorLockHolder,
  isMirrorLockHeld,
  __resetForTest,
  __setAcquiredAtForTest,
  __getLockTimeoutForTest,
} from "@/lib/coalter/mirror/channelLock";

describe("B-5a channelLock — 基本動作", () => {
  beforeEach(() => __resetForTest());

  it("初期状態: lock は解放されている", () => {
    expect(getMirrorLockHolder()).toBeNull();
    expect(isMirrorLockHeld()).toBe(false);
  });

  it("tryAcquire 成功 → holder セット、lock 保持中", () => {
    const acquired = tryAcquireMirrorLock("test-holder");
    expect(acquired).toBe(true);
    expect(getMirrorLockHolder()).toBe("test-holder");
    expect(isMirrorLockHeld()).toBe(true);
  });

  it("release で lock 解放", () => {
    tryAcquireMirrorLock("test-holder");
    releaseMirrorLock("test-holder");
    expect(getMirrorLockHolder()).toBeNull();
    expect(isMirrorLockHeld()).toBe(false);
  });

  it("acquire → release → acquire 連続成功", () => {
    expect(tryAcquireMirrorLock("h1")).toBe(true);
    releaseMirrorLock("h1");
    expect(tryAcquireMirrorLock("h2")).toBe(true);
  });
});

describe("B-5a channelLock — 重複 acquire 防止 (mutex)", () => {
  beforeEach(() => __resetForTest());

  it("保持中に別 holder の tryAcquire → false", () => {
    expect(tryAcquireMirrorLock("h1")).toBe(true);
    expect(tryAcquireMirrorLock("h2")).toBe(false);
    expect(getMirrorLockHolder()).toBe("h1");
  });

  it("同 holder の tryAcquire でも false (mutex は holder 不問)", () => {
    expect(tryAcquireMirrorLock("h1")).toBe(true);
    expect(tryAcquireMirrorLock("h1")).toBe(false);
  });

  it("不一致 holder の release は no-op (defensive)", () => {
    tryAcquireMirrorLock("h1");
    releaseMirrorLock("h2"); // 不一致 → no-op
    expect(getMirrorLockHolder()).toBe("h1");
    expect(isMirrorLockHeld()).toBe(true);
  });
});

describe("B-5a channelLock — timeout (強制 release)", () => {
  beforeEach(() => __resetForTest());

  it("timeout 超過後の tryAcquire → 強制 release + 新規取得成功", () => {
    tryAcquireMirrorLock("h1");
    const timeout = __getLockTimeoutForTest();
    // acquire 時刻を timeout 超過前に override
    __setAcquiredAtForTest(Date.now() - timeout - 100);

    const acquired = tryAcquireMirrorLock("h2");
    expect(acquired).toBe(true);
    expect(getMirrorLockHolder()).toBe("h2");
  });

  it("timeout 未経過なら tryAcquire 失敗", () => {
    tryAcquireMirrorLock("h1");
    const timeout = __getLockTimeoutForTest();
    // acquire 時刻を timeout 半分前に override (未経過)
    __setAcquiredAtForTest(Date.now() - timeout / 2);

    expect(tryAcquireMirrorLock("h2")).toBe(false);
    expect(getMirrorLockHolder()).toBe("h1");
  });

  it("isMirrorLockHeld は timeout 経過後 false", () => {
    tryAcquireMirrorLock("h1");
    const timeout = __getLockTimeoutForTest();
    __setAcquiredAtForTest(Date.now() - timeout - 100);
    expect(isMirrorLockHeld()).toBe(false);
  });
});
