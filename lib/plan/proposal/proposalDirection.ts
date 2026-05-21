/**
 * Self-Direction Triad — Phase 3 invariant 19。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.3 Self-Direction invariant 19
 *
 * 3 軸:
 *   - continue_pattern: いつもの流れを続ける
 *   - recover_pattern: 崩れたリズムを戻す
 *   - intentional_break_observed: あえて入れない / 変える (= 観測としてのみ扱う、 提案ではない)
 *
 * 不変原則:
 *   - intentional_break_observed は 「観測文」 (= 「最近 月曜のジムが空いていますね」)
 *     として user に提示される、 「提案」 として action 誘導しない。
 *   - direction は user の自己決定の枠組みとして提示される (= AI が決めるのではない)。
 */

export type ProposalDirection =
  | "continue_pattern"
  | "recover_pattern"
  | "intentional_break_observed";

/**
 * type guard: 値が ProposalDirection か検証する。
 */
export function isProposalDirection(value: unknown): value is ProposalDirection {
  return (
    value === "continue_pattern" ||
    value === "recover_pattern" ||
    value === "intentional_break_observed"
  );
}
