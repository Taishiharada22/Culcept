/**
 * Shadow Pipeline Target Event ID Selector — W3-PR-8 rev 3 commit 22
 *
 * 位置づけ:
 *   shadow pipeline の `advanceDialogState` に渡す targetEventId を決定する pure helper。
 *
 *   commit 21 までは route.ts で `nextPending?.event_id ?? events[0]?.event_id` を
 *   そのまま渡していた。しかし Branch B (LLM 再 comprehension) は毎 turn
 *   `generateEventId()` でモジュールグローバル counter を回して新 event_id を
 *   採番する。結果として、reducer L475-481 の `eventChanged = prev.focus.event_id
 *   !== action.targetEventId` 判定が **同一 clarifying ループの途中でも毎 turn
 *   true になり**、searchQueryDraft が「今 capture だけ」で reset される。
 *
 *   2026-04-22 preview で観測された narrowStep 2→1→2 逆行:
 *     Turn 1 "カフェ" → event_N → eventChanged=false → draft={C:カフェ} step=2
 *     Turn 2 "甲府"   → event_N+1 → eventChanged=true → draft={A:甲府} step=1  ← 逆行
 *     Turn 3 "スタバ" → event_N+2 → eventChanged=true → draft={A:甲府, Ch:スタバ} step=2
 *
 * 本 helper の修正方針:
 *   同一 clarifying ループ + same slot + explicit focus switch なし の時だけ
 *   prev.focus.event_id を継承する。新 event 開始（plan_presented 後など）では
 *   stale focus を握らず fallback する。
 *
 * CEO 追加条件（2026-04-22 commit 22 承認時）:
 *   1. focus.event_id は無条件最優先にしない。条件付き継承のみ。
 *   2. prev 応答 phase が clarifying でない時（plan_presented / skipped 等）は継承しない。
 *   3. current 応答 phase が clarifying でない時は継承しない
 *      （reducer の draft 作用が必要な phase は clarifying ループ時のみ）。
 *   4. prev.conversationStatus が active (clarifying / narrowing / search_handoff_blocking)
 *      でない時は継承しない。
 *   5. targetSlot が prev.focus.slot と異なる時は継承しない（slot_switching）。
 *
 * 責務分離:
 *   - 本 helper は **event_id 選択のみ** を行う。reducer / taxonomy / promote は触らない。
 *   - 呼び出し側（route.ts shadow block）は本 helper の結果を advanceDialogState に
 *     渡し、返り値の `reason` と `canContinueFocus` を structured log に書く責務。
 *
 * pure性:
 *   - 入力のみから出力を決める。Date.now / LLM / DB / I/O 禁止。
 *   - 戻り値オブジェクトは新規生成。入力を mutate しない。
 *
 * 設計書:
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §7.1 (shadowPipeline)
 */

import type { ConversationStatus, DialogFocus } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SelectTargetEventIdParams {
  /** 前 turn 終了時の DialogState.focus (ensureSessionV1 で init した session から取得) */
  prevFocus: DialogFocus | null;
  /** 前 turn 終了時の DialogState.conversationStatus */
  prevConversationStatus: ConversationStatus;
  /**
   * 前 turn 終了時の MorningProtocolResponse.phase。
   * `rawMorningSession?.phase` と等価。null は「初回 turn or session 未生成」。
   *
   * 「前 turn が plan_presented / skipped / completed 等で closed していた場合、
   * prev.focus は stale なので継承しない」を実現するために使う。
   */
  previousResponsePhase: string | null;
  /**
   * 今 turn の adapted.session.pendingClarify.event_id。
   * Branch B 再 comprehension 由来で毎 turn 新 id になる想定。
   */
  pendingEventId: string | null;
  /**
   * 今 turn の adapted.session.persistedEvents[0].event_id。
   * pending が null の時の fallback 用。
   */
  firstEventId: string | null;
  /** 今 turn の adapted.response.phase */
  currentResponsePhase: string;
  /**
   * 今 turn の shadow が dispatch する DialogFocus.slot。
   * route.ts で pendingClarify.slot から where/when/what に絞った後の値。
   * null は「dispatch 不能 slot」（transport/endpoint 等）で shadow が走らない想定。
   */
  targetSlot: DialogFocus["slot"] | null;
}

export interface SelectTargetEventIdResult {
  /**
   * advanceDialogState に渡す targetEventId。
   * null のとき呼び出し側は shadow を dispatch しない想定。
   */
  chosenTargetEventId: string | null;
  /**
   * focus 継承したか。true のとき prev.focus.event_id がそのまま採用され、
   * reducer の `eventChanged` が false となり draft 累積が維持される。
   */
  canContinueFocus: boolean;
  /** debug / structured log 用の判定理由。英数字のみで log ローテに優しくする。 */
  reason: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 判定ロジック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 「active clarify loop」と判定する prev.conversationStatus 集合。
 * これ以外（stable / slot_switching / provider_recovering）は focus を継承しない。
 *
 * - clarifying:              narrowStep=0 で質問継続中
 * - narrowing:               narrowStep>=1 で詰めている
 * - search_handoff_blocking: narrowStep=2 ready=1、PR-9 待ち（rev3 では internal 継続）
 */
const ACTIVE_CLARIFY_STATUSES: ReadonlySet<ConversationStatus> =
  new Set<ConversationStatus>([
    "clarifying",
    "narrowing",
    "search_handoff_blocking",
  ]);

/**
 * shadow pipeline に渡す targetEventId を条件付きで選ぶ pure 関数。
 *
 * 判定順序:
 *   A. prevFocus === null        → fallback (初回 turn / reset 直後)
 *   B. previousResponsePhase !== "clarifying"
 *                                → fallback (前 turn が plan_presented 等で closed)
 *   C. currentResponsePhase !== "clarifying"
 *                                → fallback (今 turn が plan_presented 等に抜ける)
 *   D. prevConversationStatus ∉ ACTIVE_CLARIFY_STATUSES
 *                                → fallback (stable/slot_switching/provider_recovering)
 *   E. targetSlot !== prevFocus.slot → fallback (slot_switching 想定)
 *   F. 全条件 OK → prevFocus.event_id を継承 (canContinueFocus=true)
 *
 * fallback は `pendingEventId ?? firstEventId ?? null`。
 *
 * @returns 選ばれた id + 判定理由
 */
export function selectShadowTargetEventId(
  params: SelectTargetEventIdParams,
): SelectTargetEventIdResult {
  const {
    prevFocus,
    prevConversationStatus,
    previousResponsePhase,
    pendingEventId,
    firstEventId,
    currentResponsePhase,
    targetSlot,
  } = params;

  const fallback = pendingEventId ?? firstEventId ?? null;

  // Condition A: prev focus must exist
  if (prevFocus === null) {
    return {
      chosenTargetEventId: fallback,
      canContinueFocus: false,
      reason: "no_prev_focus",
    };
  }

  // Condition B: previous response phase was clarifying
  //   (前 turn が plan_presented / skipped 等で closed していたら prev.focus は stale)
  if (previousResponsePhase !== "clarifying") {
    return {
      chosenTargetEventId: fallback,
      canContinueFocus: false,
      reason: `prev_phase_not_clarifying_${previousResponsePhase ?? "null"}`,
    };
  }

  // Condition C: current response phase still clarifying
  //   (今 turn が plan_presented に抜けるなら focus 継承不要)
  if (currentResponsePhase !== "clarifying") {
    return {
      chosenTargetEventId: fallback,
      canContinueFocus: false,
      reason: `current_phase_not_clarifying_${currentResponsePhase}`,
    };
  }

  // Condition D: prev conversationStatus is active clarify loop
  if (!ACTIVE_CLARIFY_STATUSES.has(prevConversationStatus)) {
    return {
      chosenTargetEventId: fallback,
      canContinueFocus: false,
      reason: `prev_status_not_active_${prevConversationStatus}`,
    };
  }

  // Condition E: slot continues (same where/when/what)
  if (targetSlot === null || prevFocus.slot !== targetSlot) {
    return {
      chosenTargetEventId: fallback,
      canContinueFocus: false,
      reason: `slot_change_${prevFocus.slot}_to_${targetSlot ?? "null"}`,
    };
  }

  // All conditions met: continue focus
  return {
    chosenTargetEventId: prevFocus.event_id,
    canContinueFocus: true,
    reason: "continue_focus",
  };
}
