/**
 * CoAlter D-2-e3-a0 Provider-Agnostic Foundation — safeProviderCall
 *
 * PR #109 §4 で凍結された provider call wrapper の pure 実装。
 *
 * 役割:
 *   - per-provider timeout (Promise.race ベース)
 *   - retry policy (5xx-like error で max retries 回、exponential backoff)
 *   - timeout は **retry しない** (PR #109 §4.4、即 fail-open)
 *   - budget pre-check (caller が `BudgetUsageProvider` を inject、optional)
 *
 * 設計原則 (D-2-e3-a0 pure foundation):
 *   - 実 HTTP / 実 API 接続なし。`call` 引数は呼び出し側 (provider client) が用意する任意関数
 *   - SSRF 防御 / allowlist verify は実 HTTP layer (provider client 内) で行う (本 phase scope 外)
 *   - cost monitoring の cross-instance storage は本 phase scope 外、BudgetUsageProvider 経由で抽象化
 *
 * 凍結線:
 *   - 既存 file (movieOrchestrator / 等) touch なし
 *   - Anthropic / OpenAI / EXA SDK import なし
 *   - env / API key 参照なし
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public Types
// ═══════════════════════════════════════════════════════════════════════════

/** safeProviderCall に渡す制御 options。 */
export interface SafeProviderCallOptions {
  /** provider 別 timeout (ms、PR #109 §4.3) */
  timeoutMs: number;
  /** retry 最大回数 (5xx-like error 受信時の追加 attempt 数。0 = retry なし) */
  maxRetries: number;
  /** retry backoff (ms、exponential。attempt N で `retryBackoffMs * 2^N` 待機) */
  retryBackoffMs: number;
  /** pre-call budget verify 上限 (USD、optional)。`budgetUsage` が inject されている時のみ有効 */
  budgetCheckUsd?: number;
}

/**
 * budget usage provider (DI、cross-instance storage 抽象化)。
 *
 *   実装は D-2-e3-a 着手後 (Supabase / KV / Sentry 連携)。
 *   本 phase では interface 定義のみ。
 */
export interface BudgetUsageProvider {
  /** 現在の月次 USD 使用量を返す (cross-instance 集計値) */
  getCurrentUsageUsd(): Promise<number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Errors
// ═══════════════════════════════════════════════════════════════════════════

/** provider call が timeout した時に throw される。retry されない (PR #109 §4.4)。 */
export class ProviderCallTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`provider call timeout (${timeoutMs}ms)`);
    this.name = "ProviderCallTimeoutError";
  }
}

/** pre-call budget check で月次上限超過時に throw される。 */
export class ProviderBudgetExceededError extends Error {
  constructor(
    public readonly currentUsd: number,
    public readonly capUsd: number,
  ) {
    super(`provider budget exceeded: current ${currentUsd} USD >= cap ${capUsd} USD`);
    this.name = "ProviderBudgetExceededError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Public API — safeProviderCall
// ═══════════════════════════════════════════════════════════════════════════

/**
 * provider call wrapper (pure 実装、外部 API 接続なし)。
 *
 *   実行順:
 *     1. budget pre-check (optional、`budgetUsage` + `options.budgetCheckUsd` 両方 inject 時のみ)
 *        - 月次使用量 >= 上限 → `ProviderBudgetExceededError` throw
 *     2. timeout-wrapped call (Promise.race)
 *        - timeout 到達 → `ProviderCallTimeoutError` throw、retry せず即 throw
 *     3. retry (5xx-like error 受信時、`maxRetries` 回まで、exponential backoff)
 *        - 各 retry の backoff: `options.retryBackoffMs * 2^attempt`
 *
 *   実 HTTP / SSRF check は呼び出し側 (provider client) の責務。本関数は call の中身を知らない。
 *
 * @param call 呼び出し側 (provider client) が用意した任意関数。実 API call or mock
 * @param options timeout / retry / budget の制御 options
 * @param budgetUsage 月次使用量取得 provider (DI、optional)
 * @returns call の結果
 * @throws ProviderBudgetExceededError / ProviderCallTimeoutError / call 自身の error
 */
export async function safeProviderCall<T>(
  call: () => Promise<T>,
  options: SafeProviderCallOptions,
  budgetUsage?: BudgetUsageProvider,
): Promise<T> {
  // ── 1. budget pre-check (optional) ──────────────────────────────
  if (options.budgetCheckUsd !== undefined && budgetUsage !== undefined) {
    const currentUsd = await budgetUsage.getCurrentUsageUsd();
    if (currentUsd >= options.budgetCheckUsd) {
      throw new ProviderBudgetExceededError(currentUsd, options.budgetCheckUsd);
    }
  }

  // ── 2-3. timeout race + retry chain ─────────────────────────────
  let lastError: unknown = undefined;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await callWithTimeout(call, options.timeoutMs);
    } catch (err) {
      lastError = err;
      // timeout は retry しない (PR #109 §4.4)
      if (err instanceof ProviderCallTimeoutError) {
        throw err;
      }
      // budget error は retry しない (caller が cap を変えない限り再現する)
      if (err instanceof ProviderBudgetExceededError) {
        throw err;
      }
      // retry attempts 残あり → exponential backoff
      if (attempt < options.maxRetries) {
        const backoffMs = options.retryBackoffMs * Math.pow(2, attempt);
        await sleep(backoffMs);
      }
    }
  }
  throw lastError;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * call を Promise.race で timeout 付き実行。
 *
 *   timeout 到達 → `ProviderCallTimeoutError`。
 *   timer は call が先に resolve / reject した場合は clearTimeout される。
 */
async function callWithTimeout<T>(
  call: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new ProviderCallTimeoutError(timeoutMs)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([call(), timeoutPromise]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
