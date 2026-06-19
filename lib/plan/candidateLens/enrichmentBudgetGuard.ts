/**
 * lib/plan/candidateLens/enrichmentBudgetGuard.ts
 *   — Candidate Lens / Phase 4-b: Place Details enrichment の rate/budget guard（★server-only・in-memory）
 *
 * ★目的: 暴走課金の二次防御。per-process カウンタ（分/日/月）で上限を超えたら skipped（fail-open）。
 * ★限界（正直に明記）: serverless の複数インスタンス間ではカウンタが分散するため**厳密な上限保証にならない**。
 *   本当の安全弁は GCP 側の per-API quota ＋ Billing budget/alert（CEO 設定・G2）。本 guard は best-effort。
 * ★純粋性: `now`（epoch ms）を引数で受ける（テスト可能・Date 直呼びしない）。カウンタは module-level 可変。
 */

/** 上限（保守的・Enterprise 無料枠 1,000/月 を超えない目安）。 */
export const ENRICHMENT_BUDGET_CAP = Object.freeze({
  perMinute: 60,
  perDay: 500,
  perMonth: 1000,
});

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const MONTH_MS = 30 * DAY_MS;

interface Window {
  startedAt: number;
  count: number;
}
interface GuardState {
  minute: Window;
  day: Window;
  month: Window;
}

function freshState(now: number): GuardState {
  return {
    minute: { startedAt: now, count: 0 },
    day: { startedAt: now, count: 0 },
    month: { startedAt: now, count: 0 },
  };
}

// ★module-level 可変（per-process）。テストは resetEnrichmentBudget() で初期化。
let state: GuardState | null = null;

/** window が期限切れなら roll（count リセット）。 */
function rollIfExpired(w: Window, now: number, spanMs: number): void {
  if (now - w.startedAt >= spanMs) {
    w.startedAt = now;
    w.count = 0;
  }
}

export interface BudgetDecision {
  readonly allowed: boolean;
  readonly reason?: "minute" | "day" | "month";
}

/**
 * ★1 件 enrichment を許可するか判定し、許可なら全 window を increment（pure な now 注入）。
 *   超過時は increment せず allowed=false（→ 呼び側は skipped・fail-open）。
 */
export function checkAndIncrementEnrichmentBudget(now: number): BudgetDecision {
  if (state == null) state = freshState(now);
  rollIfExpired(state.minute, now, MINUTE_MS);
  rollIfExpired(state.day, now, DAY_MS);
  rollIfExpired(state.month, now, MONTH_MS);

  if (state.minute.count >= ENRICHMENT_BUDGET_CAP.perMinute) return { allowed: false, reason: "minute" };
  if (state.day.count >= ENRICHMENT_BUDGET_CAP.perDay) return { allowed: false, reason: "day" };
  if (state.month.count >= ENRICHMENT_BUDGET_CAP.perMonth) return { allowed: false, reason: "month" };

  state.minute.count += 1;
  state.day.count += 1;
  state.month.count += 1;
  return { allowed: true };
}

/** テスト/ロールバック用にカウンタを初期化。 */
export function resetEnrichmentBudget(): void {
  state = null;
}
