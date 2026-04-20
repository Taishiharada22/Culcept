/**
 * CoAlter M1 Candidate 3 — Pair onboarding helpers
 *
 * ─────────────────────────────────────────────────────────────────────────
 * [CEO lock 2026-04-20 M1 C3]
 *   - `isPairInColdStart`: invoke の Stage 1 computeStage1Snapshot が
 *     「Stage 1 を呼ばず undefined で返す」判定に使う pure predicate。
 *   - 会話 0 件 + onboarded_at null のペアに対して runUnderstanding() を
 *     回すと、collector の入力が空なので outcome="failed" が構造的に確定する。
 *     failed snapshot を response に載せないために「そもそも呼ばない」選択を取る。
 *   - flag 判定は呼び元 (invoke route) に残す。この helper は flag を知らない。
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * ペアが cold-start か (= Stage 1 を呼んでも構造 failed になる状態か) を判定。
 *
 * @param onboardedAt coalter_pair_states.onboarded_at の値。null/undefined = 未 onboarding。
 * @param talkMessageCount talk_messages の該当 thread における件数。
 * @returns true = Stage 1 を skip すべき。false = Stage 1 を通常計算すべき。
 */
export function isPairInColdStart(
  onboardedAt: string | null | undefined,
  talkMessageCount: number,
): boolean {
  if (onboardedAt) return false;
  if (talkMessageCount > 0) return false;
  return true;
}
