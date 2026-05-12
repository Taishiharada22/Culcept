/**
 * D-2-e3-a0 costGuard 単体テスト (pure foundation)。
 *
 * 検証軸 (PR #109 §6):
 *
 * evaluateBudgetDecision:
 *   1. snapshot 全て 0 → ok
 *   2. monthly usd 80% (warning threshold) ぴったり → warning
 *   3. monthly usd 80% 未満 → ok
 *   4. monthly usd 95% (circuit breaker) ぴったり → block monthly_circuit_breaker
 *   5. daily per-user cap ぴったり → block daily_per_user_exceeded
 *   6. daily global cap ぴったり → block daily_global_exceeded
 *   7. monthly cb + per-user 両方超過 → monthly cb 優先 (early return)
 *   8. block 中の warning は隠れる (cb 優先)
 *   9. default budget cap が PR #109 §6.1 と整合
 *  10. budget override で挙動が変わる
 *  11. 入力 snapshot を mutate しない (pure)
 *
 * rate-limit:
 *  12. INITIAL_RATE_LIMIT_STATE は consecutiveFailures 0、disabledUntil null
 *  13. isProviderInCoolDown: disabledUntil null → false
 *  14. isProviderInCoolDown: now < disabledUntil → true
 *  15. isProviderInCoolDown: now >= disabledUntil → false
 *  16. applyFailureToRateLimit: consecutive 増加
 *  17. applyFailureToRateLimit: consecutive >= max → disabledUntil set
 *  18. applyFailureToRateLimit: consecutive < max → disabledUntil 未設定
 *  19. applySuccessToRateLimit: state 完全初期化
 *  20. applyFailureToRateLimit / applySuccessToRateLimit: 入力 state を mutate しない
 *
 * D-2-e3-a0 scope: state-less pure function のみ。
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_COST_BUDGET,
  DEFAULT_RATE_LIMIT_CONFIG,
  INITIAL_RATE_LIMIT_STATE,
  applyFailureToRateLimit,
  applySuccessToRateLimit,
  evaluateBudgetDecision,
  isProviderInCoolDown,
  type BudgetUsageSnapshot,
  type CostBudget,
  type RateLimitState,
} from "@/lib/coalter/movie/providers/costGuard";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders
// ═══════════════════════════════════════════════════════════════════════════

function makeSnapshot(
  overrides: Partial<BudgetUsageSnapshot> = {},
): BudgetUsageSnapshot {
  return {
    perUserDailyEvents: 0,
    globalDailyEvents: 0,
    monthlyUsdSpent: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1-3. evaluateBudgetDecision — ok / warning
// ═══════════════════════════════════════════════════════════════════════════

describe("evaluateBudgetDecision — ok / warning", () => {
  it("全 0 → ok", () => {
    expect(evaluateBudgetDecision(makeSnapshot()).kind).toBe("ok");
  });

  it("monthly USD warning threshold (80%=$400) 未満 → ok", () => {
    expect(
      evaluateBudgetDecision(makeSnapshot({ monthlyUsdSpent: 399 })).kind,
    ).toBe("ok");
  });

  it("monthly USD warning threshold (80%=$400) ぴったり → warning", () => {
    const result = evaluateBudgetDecision(
      makeSnapshot({ monthlyUsdSpent: 400 }),
    );
    expect(result.kind).toBe("warning");
    if (result.kind === "warning") {
      expect(result.reason).toBe("monthly_warning");
      expect(result.currentUsd).toBe(400);
      expect(result.thresholdUsd).toBe(400);
    }
  });

  it("monthly USD warning < x < circuit breaker → warning", () => {
    const result = evaluateBudgetDecision(
      makeSnapshot({ monthlyUsdSpent: 450 }),
    );
    expect(result.kind).toBe("warning");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4-6. evaluateBudgetDecision — block
// ═══════════════════════════════════════════════════════════════════════════

describe("evaluateBudgetDecision — block", () => {
  it("monthly USD circuit breaker (95%=$475) ぴったり → block monthly_circuit_breaker", () => {
    const result = evaluateBudgetDecision(
      makeSnapshot({ monthlyUsdSpent: 475 }),
    );
    expect(result.kind).toBe("block");
    if (result.kind === "block") {
      expect(result.reason).toBe("monthly_circuit_breaker");
      expect(result.detail.monthlyUsdSpent).toBe(475);
      expect(result.detail.monthlyUsdThreshold).toBe(475);
    }
  });

  it("daily per-user cap (50) ぴったり → block daily_per_user_exceeded", () => {
    const result = evaluateBudgetDecision(
      makeSnapshot({ perUserDailyEvents: 50 }),
    );
    expect(result.kind).toBe("block");
    if (result.kind === "block") {
      expect(result.reason).toBe("daily_per_user_exceeded");
      expect(result.detail.events).toBe(50);
      expect(result.detail.cap).toBe(50);
    }
  });

  it("daily global cap (5000) ぴったり → block daily_global_exceeded", () => {
    const result = evaluateBudgetDecision(
      makeSnapshot({ globalDailyEvents: 5000 }),
    );
    expect(result.kind).toBe("block");
    if (result.kind === "block") {
      expect(result.reason).toBe("daily_global_exceeded");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7-8. 優先順序
// ═══════════════════════════════════════════════════════════════════════════

describe("evaluateBudgetDecision — 優先順序 (early return)", () => {
  it("monthly cb + daily per-user 両方超過 → monthly cb 優先 (block reason)", () => {
    const result = evaluateBudgetDecision(
      makeSnapshot({ monthlyUsdSpent: 500, perUserDailyEvents: 60 }),
    );
    expect(result.kind).toBe("block");
    if (result.kind === "block") {
      expect(result.reason).toBe("monthly_circuit_breaker");
    }
  });

  it("monthly warning + daily per-user 両方ヒット → daily per-user block 優先", () => {
    const result = evaluateBudgetDecision(
      makeSnapshot({ monthlyUsdSpent: 400, perUserDailyEvents: 60 }),
    );
    // monthly_warning は warning、daily_per_user_exceeded は block → block 優先
    expect(result.kind).toBe("block");
    if (result.kind === "block") {
      expect(result.reason).toBe("daily_per_user_exceeded");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9-10. default budget + override
// ═══════════════════════════════════════════════════════════════════════════

describe("evaluateBudgetDecision — DEFAULT_COST_BUDGET / override", () => {
  it("DEFAULT_COST_BUDGET は PR #109 §6.1 と整合", () => {
    expect(DEFAULT_COST_BUDGET).toEqual({
      perEventTokenCap: 8500, // 6000 + 2500
      dailyPerUserCap: 50,
      dailyGlobalCap: 5000,
      monthlyUsdCap: 500,
      monthlyUsdWarningRatio: 0.8,
      monthlyUsdCircuitBreakerRatio: 0.95,
    });
  });

  it("budget override で挙動変化 (cap=1000、80%=800 で warning)", () => {
    const customBudget: CostBudget = {
      ...DEFAULT_COST_BUDGET,
      monthlyUsdCap: 1000,
    };
    const result = evaluateBudgetDecision(
      makeSnapshot({ monthlyUsdSpent: 800 }),
      customBudget,
    );
    expect(result.kind).toBe("warning");
  });

  it("budget override (monthlyUsdCircuitBreakerRatio=0.9) で block threshold 変化", () => {
    const customBudget: CostBudget = {
      ...DEFAULT_COST_BUDGET,
      monthlyUsdCircuitBreakerRatio: 0.9,
    };
    // 0.9 * 500 = 450
    const result = evaluateBudgetDecision(
      makeSnapshot({ monthlyUsdSpent: 450 }),
      customBudget,
    );
    expect(result.kind).toBe("block");
    if (result.kind === "block") {
      expect(result.reason).toBe("monthly_circuit_breaker");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. immutability (pure function)
// ═══════════════════════════════════════════════════════════════════════════

describe("evaluateBudgetDecision — immutability", () => {
  it("入力 snapshot を mutate しない", () => {
    const snapshot = makeSnapshot({ monthlyUsdSpent: 500 });
    const snapshotCopy = { ...snapshot };
    evaluateBudgetDecision(snapshot);
    expect(snapshot).toEqual(snapshotCopy);
  });

  it("DEFAULT_COST_BUDGET を mutate しない", () => {
    const budgetCopy = { ...DEFAULT_COST_BUDGET };
    evaluateBudgetDecision(makeSnapshot({ monthlyUsdSpent: 500 }));
    expect(DEFAULT_COST_BUDGET).toEqual(budgetCopy);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12-15. isProviderInCoolDown
// ═══════════════════════════════════════════════════════════════════════════

describe("isProviderInCoolDown / RateLimitState 初期値", () => {
  it("INITIAL_RATE_LIMIT_STATE は consecutiveFailures 0、両 timer null", () => {
    expect(INITIAL_RATE_LIMIT_STATE).toEqual({
      consecutiveFailures: 0,
      lastFailureAt: null,
      disabledUntil: null,
    });
  });

  it("disabledUntil null → 常に false", () => {
    expect(isProviderInCoolDown(INITIAL_RATE_LIMIT_STATE)).toBe(false);
  });

  it("now < disabledUntil → true", () => {
    const now = new Date("2026-05-12T10:00:00Z");
    const state: RateLimitState = {
      consecutiveFailures: 5,
      lastFailureAt: now,
      disabledUntil: new Date("2026-05-13T10:00:00Z"),
    };
    expect(isProviderInCoolDown(state, now)).toBe(true);
  });

  it("now >= disabledUntil → false (cool-down 期限切れ)", () => {
    const state: RateLimitState = {
      consecutiveFailures: 5,
      lastFailureAt: new Date("2026-05-11T10:00:00Z"),
      disabledUntil: new Date("2026-05-12T10:00:00Z"),
    };
    const now = new Date("2026-05-12T10:00:00Z"); // ぴったり
    expect(isProviderInCoolDown(state, now)).toBe(false);

    const later = new Date("2026-05-13T00:00:00Z");
    expect(isProviderInCoolDown(state, later)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16-18. applyFailureToRateLimit
// ═══════════════════════════════════════════════════════════════════════════

describe("applyFailureToRateLimit", () => {
  it("初期 state → 1 回失敗 → consecutive 1、disabledUntil なし (max=5)", () => {
    const now = new Date("2026-05-12T10:00:00Z");
    const next = applyFailureToRateLimit(INITIAL_RATE_LIMIT_STATE, now);
    expect(next.consecutiveFailures).toBe(1);
    expect(next.lastFailureAt).toEqual(now);
    expect(next.disabledUntil).toBeNull();
  });

  it("consecutive 4 → 5 回目失敗で disabledUntil set (max=5、24h cool-down)", () => {
    const now = new Date("2026-05-12T10:00:00Z");
    const state: RateLimitState = {
      consecutiveFailures: 4,
      lastFailureAt: new Date("2026-05-12T09:59:00Z"),
      disabledUntil: null,
    };
    const next = applyFailureToRateLimit(state, now);
    expect(next.consecutiveFailures).toBe(5);
    expect(next.disabledUntil).not.toBeNull();
    if (next.disabledUntil) {
      const expectedEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      expect(next.disabledUntil.getTime()).toBe(expectedEnd.getTime());
    }
  });

  it("config override で max=2 → 2 回目失敗で cool-down", () => {
    const now = new Date("2026-05-12T10:00:00Z");
    const config = {
      maxConsecutiveFailures: 2,
      coolDownMs: 60 * 60 * 1000,
    };
    const state: RateLimitState = {
      consecutiveFailures: 1,
      lastFailureAt: new Date("2026-05-12T09:59:00Z"),
      disabledUntil: null,
    };
    const next = applyFailureToRateLimit(state, now, config);
    expect(next.consecutiveFailures).toBe(2);
    expect(next.disabledUntil).not.toBeNull();
  });

  it("入力 state を mutate しない", () => {
    const state: RateLimitState = {
      consecutiveFailures: 1,
      lastFailureAt: null,
      disabledUntil: null,
    };
    const stateSnapshot = JSON.stringify(state);
    applyFailureToRateLimit(state);
    expect(JSON.stringify(state)).toBe(stateSnapshot);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19-20. applySuccessToRateLimit
// ═══════════════════════════════════════════════════════════════════════════

describe("applySuccessToRateLimit", () => {
  it("成功で state 完全初期化 (consecutive 0、両 timer null)", () => {
    const state: RateLimitState = {
      consecutiveFailures: 3,
      lastFailureAt: new Date(),
      disabledUntil: new Date(Date.now() + 1000),
    };
    expect(applySuccessToRateLimit(state)).toEqual(INITIAL_RATE_LIMIT_STATE);
  });

  it("入力 state を mutate しない", () => {
    const state: RateLimitState = {
      consecutiveFailures: 3,
      lastFailureAt: new Date(),
      disabledUntil: new Date(Date.now() + 1000),
    };
    const stateSnapshot = JSON.parse(JSON.stringify(state));
    applySuccessToRateLimit(state);
    expect(JSON.parse(JSON.stringify(state))).toEqual(stateSnapshot);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 21. DEFAULT_RATE_LIMIT_CONFIG verify
// ═══════════════════════════════════════════════════════════════════════════

describe("DEFAULT_RATE_LIMIT_CONFIG", () => {
  it("PR #109 §3.5 / §6.3 と整合 (maxConsecutiveFailures=5、coolDownMs=24h)", () => {
    expect(DEFAULT_RATE_LIMIT_CONFIG).toEqual({
      maxConsecutiveFailures: 5,
      coolDownMs: 24 * 60 * 60 * 1000,
    });
  });
});
