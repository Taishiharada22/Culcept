/**
 * DialogState Reducer — stub（commit 14 で本実装）
 *
 * 位置づけ:
 *   commit 13 では型と signature のみ landing。実装は throw。
 *   flag `DIALOG_STATE_V2` が false の間は route.ts が呼ばないため安全。
 *
 * 設計書:
 *   - docs/alter-morning-strict-confirmation-design.md §3.8
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §1 (TURN_CAPTURED 9 ステップ)
 *
 * commit 14 での実装範囲（予約）:
 *   1. TURN_CAPTURED handler（detail §1.2 の 9 step）
 *   2. PROVIDER_FAILED handler（detail §3）
 *   3. PROVIDER_RECOVERED handler（detail §3）
 *   4. FOCUS_SWITCHED handler（detail §1.5）
 *   5. RESET handler（detail §6 migration）
 *   6. 遷移検証（allowed transitions matrix、不正遷移は assert）
 *
 * 本 stub を呼ぶのは:
 *   - 想定: 誰も呼ばない（flag false）
 *   - 異常: flag が誤って true になった場合、throw で即検出
 */

import type { DialogAction, DialogState } from "./types";

/**
 * 次の DialogState を計算する pure 関数。
 * reducer の出力は純粋に `action` と `prev` から決定（外部参照禁止）。
 *
 * @throws 常に throw（commit 13 stub）。
 */
export function dialogReducer(
  _prev: DialogState,
  _action: DialogAction,
): DialogState {
  throw new Error(
    "[DialogState v2] dialogReducer is reserved. " +
      "Implementation lands in commit 14 (PR-8 rev 3). " +
      "Do not call while DIALOG_STATE_V2=false.",
  );
}
