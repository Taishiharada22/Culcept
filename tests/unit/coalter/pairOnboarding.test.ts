/**
 * pairOnboarding unit test.
 *
 * 目的:
 *   - isPairInColdStart が 2×2 の真偽表を正しく返す
 *   - onboarded_at が truthy なら必ず false（= 通常 Stage 1 を呼ぶ）
 *   - talkMessageCount が 1 以上なら必ず false（= 通常 Stage 1 を呼ぶ）
 *   - onboarded_at null/undefined + count=0 のときだけ true
 */

import { describe, it, expect } from "vitest";
import { isPairInColdStart } from "@/lib/coalter/pairOnboarding";

describe("isPairInColdStart", () => {
  it("onboarded_at null + count 0 → true (cold-start)", () => {
    expect(isPairInColdStart(null, 0)).toBe(true);
  });

  it("onboarded_at undefined + count 0 → true (cold-start)", () => {
    expect(isPairInColdStart(undefined, 0)).toBe(true);
  });

  it("onboarded_at set + count 0 → false (onboarded already)", () => {
    expect(isPairInColdStart("2026-04-20T00:00:00.000Z", 0)).toBe(false);
  });

  it("onboarded_at null + count > 0 → false (legacy pair with history)", () => {
    expect(isPairInColdStart(null, 1)).toBe(false);
    expect(isPairInColdStart(null, 100)).toBe(false);
  });

  it("onboarded_at set + count > 0 → false (normal case)", () => {
    expect(isPairInColdStart("2026-04-20T00:00:00.000Z", 5)).toBe(false);
  });

  it("空文字の onboarded_at は未 onboarding 扱い (falsy)", () => {
    // DB 的には null しか来ないはずだが、型的には string を受けるので
    // 空文字は null 相当として扱う（安全側）。
    expect(isPairInColdStart("", 0)).toBe(true);
    expect(isPairInColdStart("", 1)).toBe(false);
  });
});
