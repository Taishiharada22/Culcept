/**
 * D-2-e3-a0 safeProviderCall 単体テスト (pure foundation)。
 *
 * 検証軸 (PR #109 §4):
 *   1. call success → resolve
 *   2. call throw (5xx-like) → maxRetries=0 で即 throw
 *   3. call throw + maxRetries=1 → 2 回試行
 *   4. retry 全失敗 → 最終 error throw
 *   5. retry backoff (exponential、進度 verify)
 *   6. timeout 到達 → ProviderCallTimeoutError throw、retry なし
 *   7. budget pre-check 上限超過 → ProviderBudgetExceededError throw、call は呼ばれない
 *   8. budget pre-check 上限未満 → call 実行 + resolve
 *   9. budget pre-check は budgetUsage inject 時のみ実行
 *  10. timeout より早く resolve → result 返却 (timer leak なし、verify は call count)
 *
 * D-2-e3-a0 scope: 実 HTTP / 実 API 接続なし、mock call function のみ。
 */

import { describe, it, expect, vi } from "vitest";
import {
  safeProviderCall,
  ProviderCallTimeoutError,
  ProviderBudgetExceededError,
  type BudgetUsageProvider,
  type SafeProviderCallOptions,
} from "@/lib/coalter/movie/providers/safeProviderCall";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders
// ═══════════════════════════════════════════════════════════════════════════

function makeOptions(
  overrides: Partial<SafeProviderCallOptions> = {},
): SafeProviderCallOptions {
  return {
    timeoutMs: 200,
    maxRetries: 0,
    retryBackoffMs: 5,
    ...overrides,
  };
}

function makeBudgetUsage(usageUsd: number): BudgetUsageProvider {
  return {
    getCurrentUsageUsd: vi.fn().mockResolvedValue(usageUsd),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. call success
// ═══════════════════════════════════════════════════════════════════════════

describe("safeProviderCall — success path", () => {
  it("call success → resolve、call は 1 回だけ呼ばれる", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    const result = await safeProviderCall(call, makeOptions());
    expect(result).toBe("ok");
    expect(call).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2-4. retry behavior
// ═══════════════════════════════════════════════════════════════════════════

describe("safeProviderCall — retry behavior", () => {
  it("maxRetries=0 + call throw → 即 throw、call 1 回のみ", async () => {
    const err = new Error("5xx-like");
    const call = vi.fn().mockRejectedValue(err);
    await expect(
      safeProviderCall(call, makeOptions({ maxRetries: 0 })),
    ).rejects.toThrow("5xx-like");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("maxRetries=1 + call 1 回 throw + 2 回目 success → resolve、call 2 回", async () => {
    const call = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("ok");
    const result = await safeProviderCall(
      call,
      makeOptions({ maxRetries: 1, retryBackoffMs: 1 }),
    );
    expect(result).toBe("ok");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("maxRetries=2 + 全 throw → 最終 error throw、call 3 回 (initial + 2 retries)", async () => {
    const err = new Error("persistent");
    const call = vi.fn().mockRejectedValue(err);
    await expect(
      safeProviderCall(call, makeOptions({ maxRetries: 2, retryBackoffMs: 1 })),
    ).rejects.toThrow("persistent");
    expect(call).toHaveBeenCalledTimes(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. retry backoff (exponential、進度 verify)
// ═══════════════════════════════════════════════════════════════════════════

describe("safeProviderCall — exponential backoff", () => {
  it("retry backoff は exponential (attempt 0: backoffMs, attempt 1: backoffMs*2)", async () => {
    const call = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("1"))
      .mockRejectedValueOnce(new Error("2"))
      .mockResolvedValueOnce("ok");
    const start = Date.now();
    await safeProviderCall(
      call,
      makeOptions({ maxRetries: 2, retryBackoffMs: 30, timeoutMs: 1000 }),
    );
    const elapsed = Date.now() - start;
    // attempt 0 backoff: 30 ms (after first failure)
    // attempt 1 backoff: 60 ms (after second failure)
    // 合計 wait: ~90 ms (実 timing は環境依存、最低限を verify)
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(call).toHaveBeenCalledTimes(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. timeout
// ═══════════════════════════════════════════════════════════════════════════

describe("safeProviderCall — timeout", () => {
  it("timeout 到達 → ProviderCallTimeoutError throw、retry されない", async () => {
    let internalCallCount = 0;
    const call = vi.fn(async () => {
      internalCallCount++;
      // never resolves
      return await new Promise<string>(() => {
        // 永遠に pending
      });
    });
    await expect(
      safeProviderCall(call, makeOptions({ timeoutMs: 50, maxRetries: 3 })),
    ).rejects.toThrow(ProviderCallTimeoutError);
    // timeout は retry しない → call 1 回のみ
    expect(internalCallCount).toBe(1);
  });

  it("ProviderCallTimeoutError は timeoutMs を保持", async () => {
    const call = vi.fn(
      async () =>
        await new Promise<string>(() => {
          /* pending */
        }),
    );
    try {
      await safeProviderCall(call, makeOptions({ timeoutMs: 75 }));
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderCallTimeoutError);
      if (err instanceof ProviderCallTimeoutError) {
        expect(err.timeoutMs).toBe(75);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7-9. budget pre-check
// ═══════════════════════════════════════════════════════════════════════════

describe("safeProviderCall — budget pre-check", () => {
  it("budget 上限超過 → ProviderBudgetExceededError throw、call は呼ばれない", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    const budgetUsage = makeBudgetUsage(500);
    await expect(
      safeProviderCall(
        call,
        makeOptions({ budgetCheckUsd: 500 }),
        budgetUsage,
      ),
    ).rejects.toThrow(ProviderBudgetExceededError);
    expect(call).not.toHaveBeenCalled();
  });

  it("budget 上限未満 → call 実行 + resolve", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    const budgetUsage = makeBudgetUsage(100);
    const result = await safeProviderCall(
      call,
      makeOptions({ budgetCheckUsd: 500 }),
      budgetUsage,
    );
    expect(result).toBe("ok");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("budget 上限ぴったり → block (>= 判定)", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    const budgetUsage = makeBudgetUsage(500);
    await expect(
      safeProviderCall(
        call,
        makeOptions({ budgetCheckUsd: 500 }),
        budgetUsage,
      ),
    ).rejects.toThrow(ProviderBudgetExceededError);
  });

  it("budgetCheckUsd undefined → budget check skip (budgetUsage 渡しても skip)", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    const budgetUsage = makeBudgetUsage(999);
    const result = await safeProviderCall(call, makeOptions(), budgetUsage);
    expect(result).toBe("ok");
    expect(budgetUsage.getCurrentUsageUsd).not.toHaveBeenCalled();
  });

  it("budgetUsage undefined → budget check skip (上限超過でも実行)", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    const result = await safeProviderCall(
      call,
      makeOptions({ budgetCheckUsd: 500 }),
      // no budgetUsage
    );
    expect(result).toBe("ok");
  });

  it("ProviderBudgetExceededError は retry されない (idempotent)", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    const budgetUsage = makeBudgetUsage(500);
    await expect(
      safeProviderCall(
        call,
        makeOptions({ budgetCheckUsd: 500, maxRetries: 3 }),
        budgetUsage,
      ),
    ).rejects.toThrow(ProviderBudgetExceededError);
    // budget error は最初の check のみ、call は 0 回、再 check も 0 回
    expect(call).not.toHaveBeenCalled();
    expect(budgetUsage.getCurrentUsageUsd).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. timeout race (early resolve)
// ═══════════════════════════════════════════════════════════════════════════

describe("safeProviderCall — early resolve before timeout", () => {
  it("call が timeout より早く resolve → result 返却", async () => {
    const call = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "fast";
    });
    const result = await safeProviderCall(
      call,
      makeOptions({ timeoutMs: 200 }),
    );
    expect(result).toBe("fast");
  });
});
