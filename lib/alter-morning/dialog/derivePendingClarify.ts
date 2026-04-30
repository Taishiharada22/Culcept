/**
 * derivePendingClarify — DialogState → PendingClarify 派生ビュー（実装）
 *
 * 位置づけ:
 *   PendingClarify はこれまで session に persist する「書き込む型」だったが、
 *   PR-8 rev 3 では DialogState を単一書き込み口に集約し、PendingClarify は
 *   「DialogState から毎ターン derive する読み取り専用ビュー」に格下げする。
 *   これによりダイアログ所有権の二重化を解消する（detail §5）。
 *
 *   本ファイルは PR-8 rev 3 commit 17 の実装。commit 13 の stub を置き換える。
 *
 * CEO 方針（2026-04-22 commit 17 条件）:
 *   - pure 関数（LLM / DB / I/O / Date.now 禁止、nowIso は注入）
 *   - DialogState が唯一の主状態（session.pendingClarify への書き戻しは禁止。
 *     本関数は read-only ビューを返すのみ）
 *   - search_handoff_blocking は internal only（user-facing kind には出さない）
 *   - readyForHandoff=true でも clarifying を維持する phase authority との整合:
 *       本関数は focus に基づく kind を返すのみで、phase を直接決めない。
 *       route が本戻り値を session.pendingClarify に書き戻さない限り、
 *       hasBlockingUnresolvedSlots（phase authority）は影響を受けない。
 *   - flag OFF 経路からは呼ばれない（呼び出し側の責務）。
 *
 * 設計書:
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §5
 *     (pickClarifyKind table / question templates / PendingClarify 変換)
 *
 * 派生規則（detail §5.1 table を 1:1 で実装）:
 *   1. conversationStatus === "provider_recovering" → kind="provider_retry"
 *   2. conversationStatus === "stable" → null（clarify なし）
 *   3. focus === null → null（focus 不在は clarify 不能）
 *   4. focus.slot === "where":
 *        narrowStep=0 + clarifying → where_center
 *        narrowStep=1 + narrowing  → where_narrow
 *        narrowStep=2 + narrowing  → where_pinpoint
 *        narrowStep=2 + search_handoff_blocking → null
 *          ★ CEO 条件: search_handoff_blocking は internal only（user-facing に出さない）
 *        narrowStep 任意 + slot_switching → null（focus 外に移った想定）
 *   5. focus.slot === "when":
 *        clarifying / slot_switching → when_start
 *        search_handoff_blocking → when_start_after_handoff（where 確定後の時刻聴取）
 *   6. focus.slot === "what":
 *        clarifying → what_activity
 *   7. focus.slot === "who" / その他 → null（PR-8 rev 3 scope 外）
 *
 * 非 derive 規則（design §5.2 の「出さない」規律）:
 *   - state に入っていない値を template に埋めない（anchor null で「{anchor}駅前」は出さない）
 *   - 新しい時刻 / 活動 / 場所候補を生成しない
 *   - LLM を呼ばない
 */

import type { Event } from "../comprehension/eventSchema";
import type { PendingClarify, PendingClarifyScope } from "../types";
import type { ConversationStatus, DialogState, DialogFocus } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// timeHint → 表示ラベル（gapResolver.TIME_HINT_LABEL と一致させる）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TIME_HINT_LABEL: Record<string, string> = {
  dawn: "早朝",
  morning: "朝",
  noon: "昼",
  afternoon: "午後",
  evening: "夕方",
  night: "夜",
  late_night: "深夜",
};

function timeHintLabel(ev: Event): string | null {
  if (ev.when.startTime) return ev.when.startTime;
  if (ev.when.timeHint) return TIME_HINT_LABEL[ev.when.timeHint] ?? null;
  return null;
}

function whatLabel(ev: Event): string | null {
  const canonical = ev.what.activityCanonical?.trim();
  if (canonical) return canonical;
  const raw = ev.what.activity?.trim();
  if (raw) return raw;
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// pickClarifyKind — detail §5.1 table
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type DerivedKind =
  | "where_center"
  | "where_narrow"
  | "where_pinpoint"
  | "when_start"
  | "when_start_after_handoff"
  | "what_activity"
  | "provider_retry";

function pickClarifyKind(
  status: ConversationStatus,
  focus: DialogFocus,
): DerivedKind | null {
  // Rule 1: provider 失敗中は provider_retry 固定
  if (status === "provider_recovering") {
    return "provider_retry";
  }

  // Rule 4: where slot
  if (focus.slot === "where") {
    if (status === "slot_switching") return null;
    // ★ CEO 条件: search_handoff_blocking は internal only（user-facing kind を出さない）
    if (status === "search_handoff_blocking") return null;
    if (focus.narrowStep === 0) return "where_center";
    if (focus.narrowStep === 1) return "where_narrow";
    if (focus.narrowStep === 2) return "where_pinpoint";
    // narrowStep=3 は PR-8 rev 3 内では到達しない（PR-9 以降）
    return null;
  }

  // Rule 5: when slot
  if (focus.slot === "when") {
    if (status === "search_handoff_blocking") return "when_start_after_handoff";
    if (status === "clarifying" || status === "slot_switching") return "when_start";
    return null;
  }

  // Rule 6: what slot
  if (focus.slot === "what") {
    if (status === "clarifying") return "what_activity";
    return null;
  }

  // Rule 7: who / その他 slot は PR-8 rev 3 scope 外
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// question templates — detail §5.2 表（state に入っていない値は埋めない）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * capturedHistory の末尾 trailing "flat" 連続数。
 * where_narrow の variation に使う（flat 多発時は「スタバとかカフェとか候補ある？」）。
 */
function countTrailingFlat(state: DialogState): number {
  let count = 0;
  for (let i = state.capturedHistory.length - 1; i >= 0; i--) {
    const entry = state.capturedHistory[i];
    if (entry.progressDelta === "flat") count++;
    else break;
  }
  return count;
}

function buildQuestionWhereCenter(event: Event): string {
  const time = timeHintLabel(event);
  const what = whatLabel(event);
  if (time && what) return `${time}の${what}はどのあたり？`;
  if (what) return `${what}はどのあたり？`;
  if (time) return `${time}はどのあたり？`;
  return `どのあたり？`;
}

function buildQuestionWhereNarrow(state: DialogState): string {
  const anchor = state.searchQueryDraft.anchorRegion;
  const flat = countTrailingFlat(state);
  if (anchor) {
    if (flat >= 1) {
      return `${anchor}のどのあたり？スタバとかカフェとか、具体的な候補ある？`;
    }
    return `${anchor}のどのあたり？カフェとか候補ある？`;
  }
  // anchor 未確定で narrowing に居る想定外ケース: 無難なフォールバック
  return `どのあたり？具体的な候補ある？`;
}

function buildQuestionWherePinpoint(state: DialogState): string {
  const anchor = state.searchQueryDraft.anchorRegion;
  const chain = state.searchQueryDraft.chainToken;
  const cat = state.searchQueryDraft.categoryToken;
  if (chain && anchor) return `どの${chain}？${anchor}駅前とか？`;
  if (cat && anchor) return `${anchor}でどの${cat}？駅前とか？`;
  return `具体的にはどこにする？`;
}

function buildQuestionWhenStart(event: Event): string {
  const what = whatLabel(event);
  if (what) return `${what}は何時ごろから？`;
  return `何時ごろから？`;
}

function buildQuestionWhenStartAfterHandoff(state: DialogState): string {
  const anchor = state.searchQueryDraft.anchorRegion;
  const token =
    state.searchQueryDraft.chainToken ?? state.searchQueryDraft.categoryToken;
  if (anchor && token) {
    return `${anchor}の${token}で一旦置いといて、時間は何時ごろから？`;
  }
  return `時間は何時ごろから？`;
}

function buildQuestionWhatActivity(): string {
  return `その時間に何する？`;
}

function buildQuestionProviderRetry(): string {
  return `ちょっと時間かかってる、もう一度送って？`;
}

function buildQuestion(
  kind: DerivedKind,
  state: DialogState,
  event: Event | null,
): string {
  switch (kind) {
    case "where_center":
      // event 無しでも生成可能（generic fallback）
      return event ? buildQuestionWhereCenter(event) : `どのあたり？`;
    case "where_narrow":
      return buildQuestionWhereNarrow(state);
    case "where_pinpoint":
      return buildQuestionWherePinpoint(state);
    case "when_start":
      return event ? buildQuestionWhenStart(event) : `何時ごろから？`;
    case "when_start_after_handoff":
      return buildQuestionWhenStartAfterHandoff(state);
    case "what_activity":
      return buildQuestionWhatActivity();
    case "provider_retry":
      return buildQuestionProviderRetry();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PendingClarifyScope 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildPendingScope(
  events: ReadonlyArray<Event>,
  event_id: string,
): PendingClarifyScope {
  const idx = events.findIndex((e) => e.event_id === event_id);
  if (idx < 0) {
    // event 不在 → defensive fallback
    return { timeLabel: null, activityLabel: null, eventOrdinal: 0 };
  }
  const ev = events[idx];
  return {
    timeLabel: timeHintLabel(ev),
    activityLabel: whatLabel(ev),
    eventOrdinal: idx + 1,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// エントリポイント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DialogState から PendingClarify 相当のビューを derive する pure 関数。
 *
 * 呼び出し規約（CEO 条件 commit 17）:
 *   - flag OFF では呼ばれない（route が flag 分岐で制御）。
 *   - 戻り値を session.pendingClarify に書き戻してはいけない。
 *     本関数は「DialogState を唯一の主状態」とする read-only ビューを返すだけ。
 *   - phase authority は hasBlockingUnresolvedSlots のまま。本関数は phase を変えない。
 *   - search_handoff_blocking は internal only: kind には出ないため user-facing
 *     message にも漏れない。
 *
 * @param state  読み取り専用の現在 DialogState
 * @param events 同ターンの comprehension events（scope 生成と question 埋めに使う）
 * @param nowIso askedAt に使う ISO 時刻（pure 性保持のため注入）
 * @returns PendingClarify | null   null は「質問しない」状態
 */
export function derivePendingClarify(
  state: DialogState,
  events: ReadonlyArray<Event>,
  nowIso: string,
): PendingClarify | null {
  // Guard 1: stable → clarify 不要
  if (state.conversationStatus === "stable") {
    return null;
  }

  // Guard 2: focus 不在 → clarify 不能（provider_recovering でも focus 無しは null 返し）
  //   provider_recovering 中に focus があれば provider_retry を返せるが、
  //   focus が未設定なら event_id が埋められないため null（design 防御条項と一致）。
  if (state.focus === null) {
    return null;
  }

  const kind = pickClarifyKind(state.conversationStatus, state.focus);
  if (kind === null) {
    // ★ CEO 条件充足点:
    //   - search_handoff_blocking + where slot の組 → ここで null 返却
    //     → user-facing に search_handoff_blocking が漏れない
    //   - slot_switching + where slot の組 → 同様に null
    return null;
  }

  // DialogFocus.slot は "who" を含むが PendingSlot は "who" 非対応。
  // pickClarifyKind 側で who → null を返しているため、ここに到達するのは
  // where/when/what のみ。型ガードで再確認する。
  const focusSlot = state.focus.slot;
  if (focusSlot === "who") {
    return null;
  }

  // event look-up（存在しない場合も kind=provider_retry 等は生成可能）
  const event = events.find((e) => e.event_id === state.focus!.event_id) ?? null;

  const question = buildQuestion(kind, state, event);
  const scope = buildPendingScope(events, state.focus.event_id);

  return {
    event_id: state.focus.event_id,
    slot: focusSlot,
    kind,
    scope,
    question,
    askedAt: nowIso,
    semanticMissCount: state.semanticMissStreak,
  };
}
