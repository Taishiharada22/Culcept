/**
 * CoAlter D-2-e3-a0 Provider-Agnostic Foundation — Cost / Rate-Limit Guard
 *
 * PR #109 §6 で凍結された budget cap + rate limit state の pure 実装。
 *
 * 役割:
 *   - `evaluateBudgetDecision`: snapshot ベースで budget 状態 (ok / warning / block) を判定
 *   - rate limit state transition: provider 連続失敗時の自動 cool-down logic
 *
 * 設計原則:
 *   - **state-less pure functions**: snapshot を入力に、判定結果を出力 (storage は呼び出し側)
 *   - 実 Sentry alert / circuit breaker への通知は本 phase scope 外 (caller が `BudgetDecision` を受けて行う)
 *   - storage の cross-instance coordination (Supabase / KV) は D-2-e3-a 着手後の別 PR
 *
 * 凍結線:
 *   - 既存 file touch なし、外部 SDK import なし、env / API key 参照なし
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. Cost Budget (PR #109 §6.1)
// ═══════════════════════════════════════════════════════════════════════════

/** cost budget cap 設定。各 cap は呼び出し側 (adapter) が DI で override 可。 */
export interface CostBudget {
  /** per-event input + output token cap (curator 5500 + retrieval 2500 想定、PR #109 §6.1) */
  perEventTokenCap: number;
  /** daily per-user event cap */
  dailyPerUserCap: number;
  /** daily global event cap */
  dailyGlobalCap: number;
  /** monthly USD cap (curator + retrieval 合計、provider 横断) */
  monthlyUsdCap: number;
  /** monthly warning ratio (0-1、例 0.8 = 80% で warning) */
  monthlyUsdWarningRatio: number;
  /** monthly circuit breaker ratio (0-1、例 0.95 = 95% で block) */
  monthlyUsdCircuitBreakerRatio: number;
}

/** PR #109 §6.1 を default 値として採用。 */
export const DEFAULT_COST_BUDGET: CostBudget = {
  perEventTokenCap: 6000 + 2500,
  dailyPerUserCap: 50,
  dailyGlobalCap: 5000,
  monthlyUsdCap: 500,
  monthlyUsdWarningRatio: 0.8,
  monthlyUsdCircuitBreakerRatio: 0.95,
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Budget Decision
// ═══════════════════════════════════════════════════════════════════════════

/** budget 判定結果 (3 状態)。 */
export type BudgetDecision =
  | { kind: "ok" }
  | {
      kind: "warning";
      reason: "monthly_warning";
      currentUsd: number;
      thresholdUsd: number;
    }
  | {
      kind: "block";
      reason:
        | "monthly_circuit_breaker"
        | "daily_per_user_exceeded"
        | "daily_global_exceeded";
      detail: BudgetBlockDetail;
    };

/** block 時の詳細情報 (observability 用)。 */
export interface BudgetBlockDetail {
  /** monthly_circuit_breaker 時の現在 USD */
  monthlyUsdSpent?: number;
  /** monthly_circuit_breaker 時の閾値 USD */
  monthlyUsdThreshold?: number;
  /** daily_*_exceeded 時の events 数 */
  events?: number;
  /** daily_*_exceeded 時の cap */
  cap?: number;
}

/** 判定用の現在使用量 snapshot (cross-instance 集計値、caller が取得して渡す)。 */
export interface BudgetUsageSnapshot {
  /** per-user 当日 events 数 */
  perUserDailyEvents: number;
  /** global 当日 events 数 */
  globalDailyEvents: number;
  /** 当月 USD 累計 */
  monthlyUsdSpent: number;
}

/**
 * snapshot を入力に budget 判定を行う pure function。
 *
 *   優先順 (block を warning より優先、early return):
 *     1. monthly circuit breaker (95% 到達) → block
 *     2. daily per-user 超過 → block
 *     3. daily global 超過 → block
 *     4. monthly warning (80% 到達) → warning
 *     5. その他 → ok
 *
 *   - 同じ snapshot に対して常に同じ判定 (決定論)
 *   - 副作用なし (storage 更新 / alert 発火は呼び出し側)
 */
export function evaluateBudgetDecision(
  snapshot: BudgetUsageSnapshot,
  budget: CostBudget = DEFAULT_COST_BUDGET,
): BudgetDecision {
  const cbThreshold = budget.monthlyUsdCap * budget.monthlyUsdCircuitBreakerRatio;
  if (snapshot.monthlyUsdSpent >= cbThreshold) {
    return {
      kind: "block",
      reason: "monthly_circuit_breaker",
      detail: {
        monthlyUsdSpent: snapshot.monthlyUsdSpent,
        monthlyUsdThreshold: cbThreshold,
      },
    };
  }

  if (snapshot.perUserDailyEvents >= budget.dailyPerUserCap) {
    return {
      kind: "block",
      reason: "daily_per_user_exceeded",
      detail: {
        events: snapshot.perUserDailyEvents,
        cap: budget.dailyPerUserCap,
      },
    };
  }

  if (snapshot.globalDailyEvents >= budget.dailyGlobalCap) {
    return {
      kind: "block",
      reason: "daily_global_exceeded",
      detail: {
        events: snapshot.globalDailyEvents,
        cap: budget.dailyGlobalCap,
      },
    };
  }

  const warningThreshold = budget.monthlyUsdCap * budget.monthlyUsdWarningRatio;
  if (snapshot.monthlyUsdSpent >= warningThreshold) {
    return {
      kind: "warning",
      reason: "monthly_warning",
      currentUsd: snapshot.monthlyUsdSpent,
      thresholdUsd: warningThreshold,
    };
  }

  return { kind: "ok" };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Rate-Limit State (PR #109 §3.5 / §6.3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * provider 別 rate-limit state (per-instance、in-memory)。
 *
 *   cross-instance coordination (Redis 等) は本 phase scope 外。
 *   Vercel serverless では process 単位 state、各 instance で独立。
 */
export interface RateLimitState {
  /** 連続失敗回数 */
  consecutiveFailures: number;
  /** 最後の失敗時刻 (ISO 8601 or Date) */
  lastFailureAt: Date | null;
  /** cool-down 解除予定時刻 (null = cool-down なし) */
  disabledUntil: Date | null;
}

/** rate-limit 制御 config。 */
export interface RateLimitConfig {
  /** consecutive failures cap (default 5、これ以上で cool-down) */
  maxConsecutiveFailures: number;
  /** cool-down 期間 ms (default 24h) */
  coolDownMs: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxConsecutiveFailures: 5,
  coolDownMs: 24 * 60 * 60 * 1000,
};

/** 初期 state (cool-down なし、failure count 0)。 */
export const INITIAL_RATE_LIMIT_STATE: RateLimitState = {
  consecutiveFailures: 0,
  lastFailureAt: null,
  disabledUntil: null,
};

/**
 * 現時点で provider が cool-down 中かを判定 (pure function)。
 *
 *   `disabledUntil` が null → cool-down なし → false
 *   `now < disabledUntil` → cool-down 中 → true
 *   `now >= disabledUntil` → cool-down 解除済 → false
 */
export function isProviderInCoolDown(
  state: RateLimitState,
  now: Date = new Date(),
): boolean {
  if (state.disabledUntil === null) return false;
  return now < state.disabledUntil;
}

/**
 * 失敗を 1 回適用、新しい state を返す (pure function)。
 *
 *   - `consecutiveFailures` を +1
 *   - `lastFailureAt` を now に更新
 *   - `consecutiveFailures >= maxConsecutiveFailures` → `disabledUntil` を now + coolDownMs に
 */
export function applyFailureToRateLimit(
  state: RateLimitState,
  now: Date = new Date(),
  config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG,
): RateLimitState {
  const consecutive = state.consecutiveFailures + 1;
  const next: RateLimitState = {
    consecutiveFailures: consecutive,
    lastFailureAt: now,
    disabledUntil: state.disabledUntil,
  };
  if (consecutive >= config.maxConsecutiveFailures) {
    next.disabledUntil = new Date(now.getTime() + config.coolDownMs);
  }
  return next;
}

/**
 * 成功を適用、state を初期化 (consecutiveFailures = 0、cool-down 解除)。
 */
export function applySuccessToRateLimit(
  _state: RateLimitState,
): RateLimitState {
  return {
    consecutiveFailures: 0,
    lastFailureAt: null,
    disabledUntil: null,
  };
}
