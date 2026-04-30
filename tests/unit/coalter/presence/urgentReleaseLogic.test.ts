/**
 * Stage 4 B-2.3 — urgentReleaseLogic test (autoRefire block 含む)
 *
 * CEO 要件 (2026-04-29):
 *   #4 release / dismiss 後の autoRefire block が効く
 *
 * test strategy:
 *   - 純関数なので関数 invoke 方式で完全 cover
 *   - 4 release path (intervention_complete / user_dismiss / timeout /
 *     upper_priority_swap) と autoRefire block の time-based gate を確認
 *   - §8.5.4 不可侵: dismiss / timeout 後 60s 内は自動再発火 block、
 *     intervention_complete / upper_priority_swap は block しない
 */

import { describe, it, expect } from "vitest";

import {
  decideRelease,
  isUrgentAutoRefireBlocked,
  type UrgentReleasePath,
} from "@/lib/coalter/presence/urgentReleaseLogic";

describe("B-2.3 decideRelease — 4 release path", () => {
  it("upperPrioritySwap=true で released=true (path=upper_priority_swap、最優先)", () => {
    const r = decideRelease({
      upperPrioritySwap: true,
      interventionComplete: true, // 同時に true でも upper_priority_swap が優先
      userDismiss: true,
      timeoutElapsed: true,
    });
    expect(r.released).toBe(true);
    expect(r.path).toBe("upper_priority_swap");
  });

  it("interventionComplete=true で released=true (path=intervention_complete)", () => {
    const r = decideRelease({ interventionComplete: true });
    expect(r.released).toBe(true);
    expect(r.path).toBe("intervention_complete");
  });

  it("userDismiss=true で released=true (path=user_dismiss)", () => {
    const r = decideRelease({ userDismiss: true });
    expect(r.released).toBe(true);
    expect(r.path).toBe("user_dismiss");
  });

  it("timeoutElapsed=true で released=true (path=timeout)", () => {
    const r = decideRelease({ timeoutElapsed: true });
    expect(r.released).toBe(true);
    expect(r.path).toBe("timeout");
  });

  it("いずれも false で released=false (path=null)", () => {
    const r = decideRelease({});
    expect(r.released).toBe(false);
    expect(r.path).toBeNull();
  });

  it("優先順位: intervention_complete > user_dismiss > timeout", () => {
    const r1 = decideRelease({
      interventionComplete: true,
      userDismiss: true,
    });
    expect(r1.path).toBe("intervention_complete");

    const r2 = decideRelease({
      userDismiss: true,
      timeoutElapsed: true,
    });
    expect(r2.path).toBe("user_dismiss");
  });
});

describe("B-2.3 isUrgentAutoRefireBlocked — autoRefire block (§8.5.4)", () => {
  it("user_dismiss 直後 (msSinceRelease=0) は block (true)", () => {
    expect(isUrgentAutoRefireBlocked("user_dismiss", 0)).toBe(true);
  });

  it("user_dismiss 30s 経過は block (true)、まだ 60s 以内", () => {
    expect(isUrgentAutoRefireBlocked("user_dismiss", 30_000)).toBe(true);
  });

  it("user_dismiss 60s ジャスト → false (block 解除、境界)", () => {
    expect(isUrgentAutoRefireBlocked("user_dismiss", 60_000)).toBe(false);
  });

  it("user_dismiss 61s 経過は block 解除 (false)", () => {
    expect(isUrgentAutoRefireBlocked("user_dismiss", 61_000)).toBe(false);
  });

  it("timeout 30s 経過は block (true)", () => {
    expect(isUrgentAutoRefireBlocked("timeout", 30_000)).toBe(true);
  });

  it("timeout 60s 以上は block 解除 (false)", () => {
    expect(isUrgentAutoRefireBlocked("timeout", 70_000)).toBe(false);
  });

  it("intervention_complete は block しない (即時再発火可)", () => {
    expect(isUrgentAutoRefireBlocked("intervention_complete", 0)).toBe(false);
    expect(isUrgentAutoRefireBlocked("intervention_complete", 30_000)).toBe(false);
  });

  it("upper_priority_swap は block しない (より強い urgent への遷移そのもの)", () => {
    expect(isUrgentAutoRefireBlocked("upper_priority_swap", 0)).toBe(false);
    expect(isUrgentAutoRefireBlocked("upper_priority_swap", 1000)).toBe(false);
  });

  it("releasedPath=null で block しない", () => {
    expect(isUrgentAutoRefireBlocked(null, 0)).toBe(false);
  });

  it("blockMs カスタマイズで境界変更可", () => {
    expect(isUrgentAutoRefireBlocked("user_dismiss", 5_000, 10_000)).toBe(true);
    expect(isUrgentAutoRefireBlocked("user_dismiss", 10_000, 10_000)).toBe(false);
  });
});

describe("B-2.3 構造 invariant — 4 release path 網羅", () => {
  it("4 path すべて UrgentReleasePath として valid", () => {
    const paths: UrgentReleasePath[] = [
      "intervention_complete",
      "user_dismiss",
      "timeout",
      "upper_priority_swap",
    ];
    for (const p of paths) {
      // type check: compile error にならず、isUrgentAutoRefireBlocked が boolean を返す
      const result = isUrgentAutoRefireBlocked(p, 0);
      expect(typeof result).toBe("boolean");
    }
  });
});
