/**
 * derivePendingClarify — DialogState → PendingClarify 派生ビュー（stub）
 *
 * 位置づけ:
 *   PendingClarify はこれまで session に persist する「書き込む型」だったが、
 *   PR-8 rev 3 では DialogState を単一書き込み口に集約し、PendingClarify は
 *   「DialogState から毎ターン derive する読み取り専用ビュー」に格下げする。
 *   これによりダイアログ所有権の二重化を解消する（detail §5）。
 *
 *   commit 13 では stub。実装は commit 16。
 *
 * 設計書:
 *   - docs/alter-morning-strict-confirmation-design.md §3.10 (migration 表)
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §5 (kind × question table)
 *
 * 派生規則（commit 16 実装時）:
 *   1. conversationStatus が provider_recovering → null（失敗中は再質問しない）
 *   2. focus = null or conversationStatus = stable → null
 *   3. focus.slot = "where" + narrowStep に応じた質問文を pick
 *      - narrowStep=0 → where_generic
 *      - narrowStep=1 → where_narrow（anchor 欠損か chain/category 欠損かで分岐）
 *      - narrowStep=2 → search_handoff_blocking の user-facing message
 *   4. flatCount（capturedHistory の末尾 trailing "flat" 数）で文面 variation
 *   5. kind は legacyAdapter の ClarifyKind と互換（answerBinder が解釈できる）
 */

import type { PendingClarify } from "../types";
import type { DialogState } from "./types";

/**
 * 現在の DialogState から PendingClarify 相当のビューを派生する。
 *
 * @returns PendingClarify | null
 *   null の場合は「質問しない」状態（stable / provider_recovering / focus 不在）。
 *
 * @throws commit 13 stub。commit 16 で実装。
 */
export function derivePendingClarify(
  _state: DialogState,
  _nowIso: string,
  _turnIndex: number,
): PendingClarify | null {
  throw new Error(
    "[DialogState v2] derivePendingClarify is reserved. " +
      "Implementation lands in commit 16 (PR-8 rev 3). " +
      "Do not call while DIALOG_STATE_V2=false.",
  );
}
