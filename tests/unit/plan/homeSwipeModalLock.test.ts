/**
 * Home Swipe Modal Lock — pure module-level state tests (Phase 1 C3)
 *
 * `lib/home-swipe-modal-lock.ts` の register/release counter + listener
 * notification を deterministic に検証。
 *
 * Test 後の counter は __resetHomeSwipeModalLockForTest で reset、test 間
 * 独立性を確保。
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  registerHomeSwipeModalOpen,
  __resetHomeSwipeModalLockForTest,
  __getHomeSwipeModalOpenCountForTest,
} from "@/lib/home-swipe-modal-lock";

describe("home-swipe-modal-lock", () => {
  beforeEach(() => {
    __resetHomeSwipeModalLockForTest();
  });

  describe("register / release counter", () => {
    it("初期 counter = 0", () => {
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(0);
    });

    it("register → counter +1", () => {
      registerHomeSwipeModalOpen();
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(1);
    });

    it("register → release → counter 0 に戻る", () => {
      const release = registerHomeSwipeModalOpen();
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(1);
      release();
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(0);
    });

    it("複数 register が累積、対応する release で減る", () => {
      const r1 = registerHomeSwipeModalOpen();
      const r2 = registerHomeSwipeModalOpen();
      const r3 = registerHomeSwipeModalOpen();
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(3);
      r2();
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(2);
      r1();
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(1);
      r3();
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(0);
    });

    it("release を 2 回呼んでも counter は減らない (idempotent)", () => {
      const release = registerHomeSwipeModalOpen();
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(1);
      release();
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(0);
      release(); // 2 回目
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(0); // 不変
    });

    it("release の順序は任意でも整合 (out-of-order release)", () => {
      const r1 = registerHomeSwipeModalOpen();
      const r2 = registerHomeSwipeModalOpen();
      r1(); // 先に r1 release
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(1);
      r2();
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(0);
    });
  });

  describe("__resetHomeSwipeModalLockForTest", () => {
    it("counter を強制 reset", () => {
      registerHomeSwipeModalOpen();
      registerHomeSwipeModalOpen();
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(2);
      __resetHomeSwipeModalLockForTest();
      expect(__getHomeSwipeModalOpenCountForTest()).toBe(0);
    });
  });
});
