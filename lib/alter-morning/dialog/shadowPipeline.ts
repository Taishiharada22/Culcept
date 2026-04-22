/**
 * DialogState Shadow Pipeline — W3-PR-8 rev 3 commit 17
 *
 * 位置づけ:
 *   flag ON 時に route から 1 ターン分呼び出す「classify → reducer → derive」の
 *   pure helper。persist（session への代入）は呼び出し側の責務。
 *
 * CEO 方針（2026-04-22 commit 17 条件）:
 *   - pure 関数。LLM / DB / I/O / Date.now 禁止（nowIso / turnIndex は注入）。
 *   - flag OFF では呼ばれない（route 側の flag 分岐で制御）。
 *   - 戻り値 `derived` は caller が session.pendingClarify に書き戻してはいけない
 *     （CEO 条件「DialogState が唯一の主状態」「PendingClarify を主状態として
 *     again 書き戻すな」）。
 *   - reducer が throw する可能性のある FSA 違反 / narrowStep 逆行等は caller 側で
 *     try/catch して吸収する（shadow だから user-facing は壊さない）。
 *   - 本関数は conversationStatus / narrowStep / readyForHandoff の derive のみ行う。
 *     phase は一切決めない（phase authority = hasBlockingUnresolvedSlots）。
 *
 * 設計書:
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §1.2 / §5 / §7.1
 */

import type { Event } from "../comprehension/eventSchema";
import type { PendingClarify } from "../types";
import { classifyUtterance } from "./taxonomy";
import { dialogReducer } from "./reducer";
import { derivePendingClarify } from "./derivePendingClarify";
import type { DialogFocus, DialogState } from "./types";

export interface AdvanceDialogStateParams {
  /** 前ターンの DialogState（session.dialogState） */
  prevState: DialogState;
  /** 今ターンの user 発話（classifyUtterance に流す） */
  message: string;
  /** TURN_CAPTURED の targetEventId（primary_clarify.event_id 由来） */
  targetEventId: string;
  /** TURN_CAPTURED の targetSlot（where/when/what に限定） */
  targetSlot: DialogFocus["slot"];
  /** derive の scope 生成に使う events（今ターンの comprehension 結果） */
  events: ReadonlyArray<Event>;
  /** 新 capturedHistory entry の turnIndex（caller が 1-indexed で採番） */
  turnIndex: number;
  /** capturedAt / askedAt に使う ISO 時刻（Date.now 非依存化） */
  nowIso: string;
}

export interface AdvanceDialogStateResult {
  /** 更新後の DialogState（session.dialogState に代入する対象） */
  nextState: DialogState;
  /**
   * derive 結果（内部観測用）。
   * ⚠ caller は本値を session.pendingClarify に書き戻してはいけない。
   *    CEO 条件「DialogState が唯一の主状態」「PendingClarify を主状態として
   *    again 書き戻すな」を満たすため、あくまで read-only な副産物として扱う。
   */
  derived: PendingClarify | null;
}

/**
 * DialogState を 1 ターン分進める pure helper。
 *
 * 処理順（detail §7.1）:
 *   1. classifyUtterance(message) → NormalizedCapture
 *   2. dialogReducer(prev, TURN_CAPTURED) → nextState
 *   3. derivePendingClarify(nextState, events, nowIso) → PendingClarify | null
 *
 * 例外:
 *   - reducer が FSA 違反 / narrowStep 逆行で throw する場合あり。
 *     route 側の try/catch で吸収する（shadow だから user-facing に漏らさない）。
 *
 * @returns nextState（persist 対象） + derived（read-only 内部ビュー）
 */
export function advanceDialogState(
  params: AdvanceDialogStateParams,
): AdvanceDialogStateResult {
  const capture = classifyUtterance(params.message);

  const nextState = dialogReducer(params.prevState, {
    type: "TURN_CAPTURED",
    turnIndex: params.turnIndex,
    capturedAt: params.nowIso,
    capture,
    targetEventId: params.targetEventId,
    targetSlot: params.targetSlot,
  });

  const derived = derivePendingClarify(nextState, params.events, params.nowIso);

  return { nextState, derived };
}
