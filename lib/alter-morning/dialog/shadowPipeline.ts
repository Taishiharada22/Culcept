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
import type { DialogFocus, DialogState, NormalizedCapture } from "./types";

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
 * PR-12 最小根治: pre-comprehended where からの seed capture を作る pure helper。
 *
 * 位置づけ:
 *   2 件目 event に focus が遷移した直後、reducer の `eventChanged` branch は
 *   draft を capture-only で reset する。しかし 2 件目 event は既に
 *   `event.where.place_ref` / `placeType` / `coordinates` を持つため、
 *   ユーザー発話が area-only / category-only の場合 draft に anchor+chain の
 *   両方が揃わず `readyForHandoff=false` → handoff gate skip となる。
 *
 *   本 helper は「focus 切替直前の新 event が持つ場所情報」を
 *   classify して seedCapture として dispatch に載せる。
 *   reducer 側で seed → user capture の順に merge することで、
 *   ユーザー発話が薄くても pre-comprehended 情報が draft に載る。
 *
 * 採用方針（CEO 補正 2 確認）:
 *   - `event.where.place_ref` のみ classify（`classifyUtterance` に渡す）
 *   - `placeType` raw は categoryToken と語彙空間が異なる可能性が高いため seed には使わない
 *     （`CATEGORY_DICT` は日本語、`placeType` raw は英語推定）
 *     別 PR で placeType → categoryToken マッピングを検討
 *
 * 非責務:
 *   - `eventChanged` / `isWhereSlot` guard（reducer で二重に enforce）
 *   - placeTable 解決 / canonicalId 発番
 *
 * 返り値:
 *   - targetSlot !== "where" → null
 *   - focus 不変（prevState.focus?.event_id === targetEventId）→ null
 *   - target event が events に存在しない → null
 *   - place_ref 空 / 空白のみ → null
 *   - 上記以外 → `classifyUtterance(place_ref)`
 */
function buildSeedCaptureFromEvent(params: {
  prevState: DialogState;
  events: ReadonlyArray<Event>;
  targetEventId: string;
  targetSlot: DialogFocus["slot"];
}): NormalizedCapture | null {
  if (params.targetSlot !== "where") return null;

  const prevFocus = params.prevState.focus;
  const eventLikelyChanged =
    prevFocus == null || prevFocus.event_id !== params.targetEventId;
  if (!eventLikelyChanged) return null;

  const targetEvent = params.events.find(
    (e) => e.event_id === params.targetEventId,
  );
  if (!targetEvent) return null;

  const placeRef = targetEvent.where.place_ref;
  if (typeof placeRef !== "string" || placeRef.trim().length === 0) return null;

  return classifyUtterance(placeRef);
}

/**
 * DialogState を 1 ターン分進める pure helper。
 *
 * 処理順（detail §7.1）:
 *   1. classifyUtterance(message) → NormalizedCapture
 *   2. buildSeedCaptureFromEvent(events, targetEvent) → NormalizedCapture | null（PR-12 最小根治）
 *   3. dialogReducer(prev, TURN_CAPTURED + seedCapture) → nextState
 *   4. derivePendingClarify(nextState, events, nowIso) → PendingClarify | null
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

  const seedCapture = buildSeedCaptureFromEvent({
    prevState: params.prevState,
    events: params.events,
    targetEventId: params.targetEventId,
    targetSlot: params.targetSlot,
  });

  const nextState = dialogReducer(params.prevState, {
    type: "TURN_CAPTURED",
    turnIndex: params.turnIndex,
    capturedAt: params.nowIso,
    capture,
    targetEventId: params.targetEventId,
    targetSlot: params.targetSlot,
    seedCapture,
  });

  const derived = derivePendingClarify(nextState, params.events, params.nowIso);

  return { nextState, derived };
}
