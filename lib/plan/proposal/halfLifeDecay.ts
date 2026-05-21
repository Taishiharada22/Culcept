/**
 * Half-Life Decay — Phase 3 Invariant 13。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.2 表現 invariant 13 / §3.1 J-3 / §10.1 Smoke 9
 *
 * 役割:
 *   同 proposal の表示反復で internal confidence を逓減 (= × 0.85)。
 *   既存 Calendar AI が 「同じ提案を反復押す」 のと逆方向 (= notification fatigue 防止)。
 *   採用で confidence reset。 連続 dismiss で 30 日 silent。
 *
 * 不変原則:
 *   - Invariant 13 Half-life decay: 表示で × 0.85、 採用で reset
 *   - Invariant 14 Cross-day memory: dismiss は 7 日 retention (= dismissLog.ts で実装)
 *   - 3 連続 dismiss → 30 日 silent (= notification fatigue 完全防止)
 *
 * 数字は全て internal、 UI に見せない (= Invariant 15)。
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const DECAY_FACTOR = 0.85;
export const SILENT_PERIOD_DAYS = 30;
export const SILENT_CONSECUTIVE_DISMISS_THRESHOLD = 3;
const MS_PER_DAY = 86400000;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Decay
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * confidence × 0.85 ^ displayCount を計算。
 *
 * @param initialConfidence - 初期 confidence (= 0-1 想定、 範囲外でも処理)
 * @param displayCount - 表示反復回数 (= 0 で no decay)
 * @returns 減衰後 confidence
 */
export function applyDecay(
  initialConfidence: number,
  displayCount: number,
): number {
  if (displayCount <= 0) return initialConfidence;
  return initialConfidence * Math.pow(DECAY_FACTOR, displayCount);
}

/**
 * 採用時 confidence reset (= 1 を返す)。
 * 採用は 「信頼を取り戻す」 signal。
 */
export function resetConfidenceOnAccept(): number {
  return 1;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Long silence detection (= 3 連続 dismiss で 30 日 silent)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 同 source の連続 dismiss が閾値に達し、 直近 dismiss から SILENT_PERIOD_DAYS 内なら silent。
 *
 * @param consecutiveDismissCount - 同 source の連続 dismiss 数
 * @param lastDismissAt - 直近 dismiss 時刻 (= ISO 8601)
 * @param now - 現在時刻 (= ISO 8601)
 * @returns silent 状態か (= true なら proposal を出さない)
 */
export function isInLongSilence(
  consecutiveDismissCount: number,
  lastDismissAt: string,
  now: string,
): boolean {
  if (consecutiveDismissCount < SILENT_CONSECUTIVE_DISMISS_THRESHOLD) return false;

  const lastMs = Date.parse(lastDismissAt);
  const nowMs = Date.parse(now);
  if (isNaN(lastMs) || isNaN(nowMs)) return false;

  const elapsedDays = (nowMs - lastMs) / MS_PER_DAY;
  return elapsedDays >= 0 && elapsedDays < SILENT_PERIOD_DAYS;
}
