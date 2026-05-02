/**
 * Origin gap detection (PR B-2e)
 *
 * CEO/GPT 2026-05-02 PR B-2e 規律:
 *   origin clarify は **「最後の砦」** = 推論失敗時の最終 fallback。
 *   機能追加ではなく、**質問アプリ化させない**ための厳格な gating logic。
 *
 * 発火条件 (8 つ全て満たすときのみ):
 *   ① journeyOrigin.kind === "unknown" (= 推論全部失敗)
 *   ② events に少なくとも 1 つの真の event がある (= travel item only plan は skip)
 *   ③ event の destination が resolved (= where が exact_proper_noun/landmark_named かつ coordinates あり)
 *   ④ activePresentation 中ではない (= 候補提示中ではない)
 *   ⑤ conversationStatus が search 系でない (= search_handoff_blocking / search_candidates_presented でない)
 *   ⑥ より高優先の pendingClarify がない (= where/when/what/transport を割り込まない)
 *   ⑦ origin clarify は CLARIFY_PRIORITY=50 で最低優先 (= 構造的に他に勝てない)
 *   ⑧ 「予定本体の解決を邪魔しない」が大原則
 *
 * 設計上の不変条件:
 *   - permission denied でも origin clarify は止めない
 *     (テキスト clarify は browser permission と独立、ユーザーは「ホテルから」と答えられる)
 *   - origin が未確定 でも、まず予定本体 (where/when/what) を確定させてから origin を聞く
 *   - 連続 clarify の防止は既存 semanticMissCount 機構に任せる (本 file では追加しない)
 */

import type { Event } from "../comprehension/eventSchema";
import type { JourneyAnchorState } from "./anchorState";
import type { DialogState } from "../dialog/types";
import type { PendingClarify } from "../types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// hasResolvedDestination — destination が「ある程度確定」か判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * events のうち少なくとも 1 つの destination が resolved しているか判定。
 *
 * 「resolved」 の条件 (CEO/GPT 確定、厳しめ):
 *   - placeType が "exact_proper_noun" or "landmark_named" (= 固有名詞 or ランドマーク名)
 *   - coordinates が解決済み (= where_center / where_pick が完了している)
 *   - missing_semantic_critical に "where" を含まない
 *
 * 厳しめにする理由:
 *   origin clarify は最後の fallback。destination が曖昧なまま origin を聞くより、
 *   まず destination を解決すべき (= where_center / where_pick clarify が先行)。
 *
 * @returns events に 1 つでも条件を満たす event があれば true
 */
export function hasResolvedDestination(events: Event[]): boolean {
  return events.some((ev) => {
    if (
      ev.where?.placeType !== "exact_proper_noun" &&
      ev.where?.placeType !== "landmark_named"
    ) {
      return false;
    }
    if (!ev.where?.coordinates) return false;
    if (ev.missing_semantic_critical?.includes("where")) return false;
    return true;
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// detectOriginGap — origin clarify 発火判定 (純関数)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DetectOriginGapInput {
  /**
   * 現在の journeyOrigin (legacyAdapter で resolveHomeAnchor + Layer 2 等を経て決定)。
   * kind === "unknown" の時のみ origin clarify 候補。
   */
  journeyOrigin: JourneyAnchorState;
  /**
   * 真の events (= L1 出力の effectiveEvents)。
   * travel item は含まれない (= plan.items とは異なる)。
   */
  events: Event[];
  /**
   * 現在の dialog state (W3-PR-8 v2)。null の場合は dialog v2 OFF と解釈。
   * activePresentation や conversationStatus を判定材料に使う。
   */
  dialogState: DialogState | null;
  /**
   * 直前ターンから引き継いだ pendingClarify。
   * 高優先 clarify (where/when/what/transport/endpoint) があれば origin は割り込まない。
   */
  priorPendingClarify: PendingClarify | null;
}

/**
 * origin clarify を発火すべきか判定する純関数。
 *
 * @returns true = 発火条件を全て満たす / false = 発火しない (= skip)
 */
export function shouldAskOriginClarify(input: DetectOriginGapInput): boolean {
  const { journeyOrigin, events, dialogState, priorPendingClarify } = input;

  // ① journeyOrigin が unknown (= 推論全部失敗) でない限り聞かない
  if (journeyOrigin.kind !== "unknown") return false;

  // ② 真の event が 1 つ以上 (= travel item only plan は skip)
  if (events.length === 0) return false;

  // ③ event destination が ある程度確定している
  //    曖昧な destination のまま origin を聞かない (= 質問アプリ化防止)
  if (!hasResolvedDestination(events)) return false;

  // ④ activePresentation 中 (= 候補提示中) は割り込まない
  if (dialogState?.activePresentation != null) return false;

  // ⑤ conversationStatus が search 系の時は割り込まない
  const status = dialogState?.conversationStatus;
  if (
    status === "search_handoff_blocking" ||
    status === "search_candidates_presented"
  ) {
    return false;
  }

  // ⑥ より高優先の pendingClarify がある時は割り込まない
  //    where/when/what/transport/endpoint 等の event-level clarify を優先する
  if (priorPendingClarify != null) return false;

  // ⑦ ⑧ は CLARIFY_PRIORITY と既存 resolveGaps 統合で構造的に保証
  //    (= origin が他 clarify と衝突したら必ず負ける、本関数は単体判定のみ)

  return true;
}
