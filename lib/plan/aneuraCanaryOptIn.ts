/**
 * lib/plan/aneuraCanaryOptIn.ts
 *   — 評価OS S1/S2 canary の **runtime opt-in scope guard**（client-only・localStorage・no DB/API/外部）
 *
 * 目的（safety baseline）: `NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD` / `…_OBSERVE_PROD` が production で true でも、
 *   **opt-in した browser だけ**に表示・観測を限定する。env true = 全 production ユーザー rollout を防ぐ。
 *
 * 機構（最小）:
 *   - opt-in: URL `?evalOsCanary=1` → mount effect が localStorage に永続。
 *   - opt-out: URL `?evalOsCanary=0` → mount effect が localStorage を削除。
 *   - gate（isAneuraCanaryOptedIn）は **localStorage のみ**を読む。非 opt-in は readout も observe も出ない/記録しない。
 *
 * 安全原則:
 *   - **SSR/非ブラウザは false**（`globalThis.localStorage` 不在＝安全側）。既存 store と同じ access convention。
 *   - **fail-closed**: localStorage 不在/破損/quota 例外時は false（OFF＝安全側）。
 *   - DB/API/network/外部なし。
 *
 * rollback（per-user / 全体）:
 *   - per-user: `?evalOsCanary=0` or localStorage の当該 key 削除。
 *   - 全体: env を false/unset → redeploy。
 */
export const EVAL_OS_CANARY_OPTIN_KEY = "aneurasync.evalOsCanary.optIn";
export const EVAL_OS_CANARY_QUERY = "evalOsCanary";

function readStorage(): Storage | null {
  // 既存 store と同じ convention（window でなく globalThis.localStorage）。SSR は undefined。
  return (globalThis as { localStorage?: Storage }).localStorage ?? null;
}

/** この browser が canary opt-in 済みか（client-only・SSR=false・fail-closed）。localStorage のみ読む。 */
export function isAneuraCanaryOptedIn(): boolean {
  try {
    return readStorage()?.getItem(EVAL_OS_CANARY_OPTIN_KEY) === "1";
  } catch {
    return false; // localStorage 不在/破損/quota → OFF（fail-closed）
  }
}

export type CanaryOptInSyncResult = "opted-in" | "opted-out" | "unchanged";

/**
 * URL search（例 `window.location.search`）の `?evalOsCanary=1/0` を localStorage に永続/削除。
 *   client mount で1回呼ぶ。1 → 永続 opt-in / 0 → 永続削除（opt-out）/ それ以外 → 変更なし。no-op safe・fail-soft。
 */
export function syncAneuraCanaryOptInFromUrl(search: string): CanaryOptInSyncResult {
  try {
    const ls = readStorage();
    if (!ls) return "unchanged";
    const q = new URLSearchParams(search).get(EVAL_OS_CANARY_QUERY);
    if (q === "1") {
      ls.setItem(EVAL_OS_CANARY_OPTIN_KEY, "1");
      return "opted-in";
    }
    if (q === "0") {
      ls.removeItem(EVAL_OS_CANARY_OPTIN_KEY);
      return "opted-out";
    }
    return "unchanged";
  } catch {
    return "unchanged";
  }
}
