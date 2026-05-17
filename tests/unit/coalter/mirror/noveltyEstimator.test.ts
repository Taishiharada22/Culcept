/**
 * CoAlter AOO Phase B B-5a — noveltyEstimator invariant test
 *
 * 正本: lib/coalter/mirror/noveltyEstimator.ts
 *
 * B-5a 段階では const placeholder 0.5 のみ返す。
 *   - WORTH_NOVELTY_MIN (0.5) と一致 → Worth Gate 境界値
 *   - raw text 受け取らない / 保存しない
 *   - pure / deterministic / side-effect-free
 */

import { describe, it, expect } from "vitest";
import {
  estimateNovelty,
  __getPlaceholderForTest,
} from "@/lib/coalter/mirror/noveltyEstimator";
import { WORTH_NOVELTY_MIN } from "@/lib/coalter/mirror/decisionConstants";

describe("B-5a noveltyEstimator — const placeholder", () => {
  it("estimateNovelty() は 0.5 を返す", () => {
    expect(estimateNovelty()).toBe(0.5);
  });

  it("__getPlaceholderForTest() も 0.5 を返す", () => {
    expect(__getPlaceholderForTest()).toBe(0.5);
  });

  it("estimateNovelty() と __getPlaceholderForTest() は一致", () => {
    expect(estimateNovelty()).toBe(__getPlaceholderForTest());
  });
});

describe("B-5a noveltyEstimator — Worth Gate 境界", () => {
  it("placeholder 値 === WORTH_NOVELTY_MIN (Worth Gate 通過する最小値)", () => {
    expect(estimateNovelty()).toBe(WORTH_NOVELTY_MIN);
  });

  it("estimateNovelty() >= WORTH_NOVELTY_MIN (Worth Gate PASS)", () => {
    expect(estimateNovelty()).toBeGreaterThanOrEqual(WORTH_NOVELTY_MIN);
  });
});

describe("B-5a noveltyEstimator — invariants", () => {
  it("deterministic (複数回呼び出しで同値)", () => {
    expect(estimateNovelty()).toBe(estimateNovelty());
    expect(estimateNovelty()).toBe(estimateNovelty());
    expect(estimateNovelty()).toBe(estimateNovelty());
  });

  it("0..1 range", () => {
    const v = estimateNovelty();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it("finite number", () => {
    const v = estimateNovelty();
    expect(Number.isFinite(v)).toBe(true);
    expect(Number.isNaN(v)).toBe(false);
  });

  it("引数なし (raw text 非受理)", () => {
    // 型レベルで引数なし (compile-time 保証)
    // runtime でも引数受け取らない
    expect(estimateNovelty.length).toBe(0);
  });
});
