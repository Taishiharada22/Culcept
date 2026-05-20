/**
 * Per-user rate limit for Plan geocode endpoint (Phase 2-C v3 §0.5.2 強化 1)
 *
 * 設計書: docs/alter-plan-phase2-c-map-tab-mini-design.md §5.2 + §5.7
 *
 * 設計原則:
 *   - process-local in-memory Map (Vercel serverless では instance ごとに独立、best-effort)
 *   - fixed window: 1 hour (GEOCODE_RATE_WINDOW_MS)
 *   - limit: 100 calls / user / hour (GEOCODE_RATE_LIMIT_PER_HOUR)
 *   - 超過時は false を返す → endpoint で 429 + Retry-After
 *
 * 制約 (cost / DoS 防御の許容上限):
 *   - multi-instance serverless では各 instance が独立 counter を持つので、
 *     theoretical max = instance_count * GEOCODE_RATE_LIMIT_PER_HOUR / hour
 *   - Supabase 永続 counter にすると migration が必要 → Phase 2-C 範囲外 (§19 中断 trigger)、
 *     in-memory で acceptable と判断 (実測値が想定を超えたら別 wave で再設計)
 *   - cache-first 設計 (§5.7) と組み合わせれば、limit 到達は通常運用では発生しないはず
 *
 * 検証:
 *   - test 用 _resetGeocodeRateLimitForTest() を export、production code から呼ばない
 *   - smoke check: 同一 user 101 回目 request が 429 を返す確認 (§11.13)
 */

export const GEOCODE_RATE_LIMIT_PER_HOUR = 100;
export const GEOCODE_RATE_WINDOW_MS = 60 * 60 * 1000;

interface RateRecord {
  count: number;
  windowStartMs: number;
}

/** process-local 状態。Vercel serverless では instance ごとに独立。 */
const userRates = new Map<string, RateRecord>();

/**
 * userId の geocode rate を check & increment。
 *
 * @param userId 認証済み user の id
 * @param nowMs 現在時刻 (test 用に inject 可、production は Date.now())
 * @returns true = 通常処理 OK (count++)、false = limit 超え (block)
 */
export function checkAndIncrementGeocodeRate(
  userId: string,
  nowMs: number,
): boolean {
  const record = userRates.get(userId);
  if (!record || nowMs - record.windowStartMs >= GEOCODE_RATE_WINDOW_MS) {
    // 新規 user or window expired → reset
    userRates.set(userId, { count: 1, windowStartMs: nowMs });
    return true;
  }
  if (record.count >= GEOCODE_RATE_LIMIT_PER_HOUR) {
    return false;
  }
  record.count++;
  return true;
}

/**
 * test 用: process-local rate map をクリア。
 * production code から呼ばない (beforeEach hook 用)。
 */
export function _resetGeocodeRateLimitForTest(): void {
  userRates.clear();
}
