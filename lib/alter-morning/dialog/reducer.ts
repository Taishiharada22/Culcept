/**
 * DialogState Reducer — 本実装 (commit 14)
 *
 * 位置づけ:
 *   DialogState を単一所有する pure 関数。外部参照・副作用・LLM 呼び出し禁止。
 *   actions と prev state のみから next state を決定する。
 *
 * 設計書:
 *   - docs/alter-morning-strict-confirmation-design.md §3.7-3.9
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §1 (TURN_CAPTURED 9 step)
 *   - §3 (providerRecovery) / §6 (RESET migration)
 *
 * CEO 不変条件（2026-04-22 commit 14 承認条件）:
 *   1. narrowStep は逆行しない（focus 同一継続中）
 *   2. provider_recovering 中の stable 遷移は PROVIDER_RECOVERED 経由のみ
 *      （= この reducer が触る conversationStatus の範囲で plan_presented を暗黙許可しない）
 *   3. search_handoff_blocking は blocking のまま（slot_switching / provider_recovering 以外に降格しない）
 *   4. readyForHandoff は searchQueryDraft の 3 フィールドから derive のみ、直接代入経路なし
 *
 * 責務分離（CEO 条件）:
 *   - taxonomy source of truth は `./taxonomy.ts`。本ファイルは import して使うのみ。
 *   - PendingClarify は derived view（`./derivePendingClarify.ts`）。本 reducer は触らない。
 *   - route.ts / legacyAdapter の wiring は commit 17 以降。本 commit では触らない。
 *   - phase（session.phase）は触らない。conversationStatus の遷移のみを管理。
 *
 * 純粋性:
 *   - 本関数は pure（input → output）。Date.now / LLM / DB / I/O 一切触らない。
 *   - action に capturedAt/turnIndex が外部から注入される前提。
 *   - prev を mutate しない（spread copy）。
 *
 * 不正遷移の扱い:
 *   - FSA で許可されない遷移 → throw
 *   - narrowStep 逆行 → throw
 *   - readyForHandoff に直接書く経路 → type で禁止済み（action に readyForHandoff 無し）
 */

import type { Event as ComprehensionEvent } from "../comprehension/eventSchema";
import { NARROW_STEP_BY_SUBKIND } from "./taxonomy";
import type {
  CapturedHistoryEntry,
  ConversationStatus,
  DialogAction,
  DialogFocus,
  DialogState,
  LastGoodPlanSnapshot,
  NormalizedCapture,
  ProgressDelta,
  SearchQueryDraft,
} from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FSA 遷移許可行列（detail §1.1）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALLOWED_TRANSITIONS: Readonly<
  Record<ConversationStatus, ReadonlySet<ConversationStatus>>
> = {
  stable: new Set([
    "stable",
    "clarifying",
    "narrowing",
    "slot_switching",
    "search_handoff_blocking", // 初期 stable から 1 ターン目で「甲府のスタバ」直行ケース
    "provider_recovering",
  ]),
  clarifying: new Set([
    "clarifying",
    "stable",
    "narrowing",
    "slot_switching",
    "search_handoff_blocking",
    "provider_recovering",
  ]),
  narrowing: new Set([
    "narrowing",
    "search_handoff_blocking",
    "clarifying",
    "slot_switching",
    "stable",
    "provider_recovering",
  ]),
  // CEO invariant #3: search_handoff_blocking から降格できるのは
  //   slot_switching（ユーザーが別 slot へ話題変更）/ provider_recovering のみ。
  //   narrowing / clarifying / stable への降格は禁止（blocking のまま）。
  //   ただし search_handoff_blocking 同士での自己遷移は許可（同じ状態の再確認）。
  search_handoff_blocking: new Set([
    "search_handoff_blocking",
    "slot_switching",
    "provider_recovering",
    // stable への降格は PR-9 merge 後に追加（PR-9 が candidate 選択後 stable に戻す）
    // PR-8 rev 3 では search_handoff_blocking に入ったら戻れない（staircase 契約）
  ]),
  slot_switching: new Set([
    "slot_switching",
    "clarifying",
    "narrowing",
    "stable",
    "provider_recovering",
  ]),
  // CEO invariant #2: provider_recovering → stable は PROVIDER_RECOVERED 経由のみ。
  //   reducer はこの FSA チェックでは stable を許可するが、
  //   TURN_CAPTURED handler は provider_recovering 中に stable に遷移させない
  //   （下の deriveConversationStatus で明示チェック）。
  provider_recovering: new Set([
    "provider_recovering",
    "stable",
    "clarifying",
    "narrowing",
  ]),
};

function assertAllowedTransition(
  from: ConversationStatus,
  to: ConversationStatus,
): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.has(to)) {
    throw new Error(
      `[DialogReducer] Invalid transition: ${from} → ${to}. ` +
        `Allowed from ${from}: ${Array.from(allowed).join(", ")}`,
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// readyForHandoff derive（他経路からの直接書き込み禁止）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function deriveReadyForHandoff(
  anchorRegion: string | null,
  categoryToken: string | null,
  chainToken: string | null,
): boolean {
  return (
    anchorRegion !== null &&
    anchorRegion.trim() !== "" &&
    (categoryToken !== null || chainToken !== null)
  );
}

/** searchQueryDraft を一度でも書くときは必ずこれを通す（CEO invariant #4） */
function buildSearchQueryDraft(params: {
  anchorRegion: string | null;
  categoryToken: string | null;
  chainToken: string | null;
}): SearchQueryDraft {
  const anchorRegion = params.anchorRegion;
  // CEO invariant #4 + detail §1.4: chain ↔ category 相互排他。
  //   chain 確定時 category は null に上書き（chain がより specific なため）。
  //   category 確定時 chain は上書きしない（元の chain が残っていればそれが優先される）。
  //   buildSearchQueryDraft の呼び出し側で一貫した意味の組を渡す責務。
  //   ここでは exclusivity 違反（chain も category も同時に non-null）を許可するが、
  //   TURN_CAPTURED handler 側で chain set 時に category を null 化する。
  const categoryToken = params.categoryToken;
  const chainToken = params.chainToken;
  return {
    anchorRegion,
    categoryToken,
    chainToken,
    readyForHandoff: deriveReadyForHandoff(anchorRegion, categoryToken, chainToken),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// narrowStep 遷移（CEO invariant #1: 逆行禁止）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 新 narrowStep を決定する。focus 継続中は単調増加のみ許可。
 * focus が切り替わった時（event_id or slot 変更）は 0 リセット許可。
 *
 * @throws focus 継続中に逆行しようとした場合
 */
function nextNarrowStep(params: {
  prevFocus: DialogFocus | null;
  newFocus: DialogFocus;
  /** NARROW_STEP_BY_SUBKIND から引いた subKind 固有の step */
  subKindStep: 0 | 1 | 2 | 3;
  /** where 以外の slot は常に 0 */
  isWhereSlot: boolean;
  /** progressDelta が "regressed" の場合、narrowStep を一段下げる許容があるか */
  progressDelta: ProgressDelta;
}): 0 | 1 | 2 | 3 {
  const { prevFocus, newFocus, subKindStep, isWhereSlot, progressDelta } = params;

  // where 以外の slot は 0 固定
  if (!isWhereSlot) {
    return 0;
  }

  // focus 切替検出（event_id or slot 変更）→ 0 から再開
  const focusChanged =
    !prevFocus ||
    prevFocus.event_id !== newFocus.event_id ||
    prevFocus.slot !== newFocus.slot;

  if (focusChanged) {
    // 切替直後でも subKind が terminal (3) or blocking (2) なら直接飛ぶ許容
    return subKindStep;
  }

  const prevStep = prevFocus.narrowStep;

  // CEO invariant #1: 逆行禁止（progressDelta="regressed" のみ例外的に -1 許容）
  if (progressDelta === "regressed") {
    // 前の情報を否定する発話（例: 「あ、甲府じゃなくてわかんない」）
    // narrowStep を一段戻す（下限 0）。
    const regressedStep = Math.max(0, prevStep - 1);
    return regressedStep as 0 | 1 | 2 | 3;
  }

  // 同一 focus 継続中は max(prevStep, subKindStep) = 前進 or 維持のみ
  const nextStep = Math.max(prevStep, subKindStep) as 0 | 1 | 2 | 3;

  if (nextStep < prevStep) {
    // 定義上到達不能だが defensive
    throw new Error(
      `[DialogReducer] narrowStep regression detected: ${prevStep} → ${nextStep} ` +
        `(focus=${newFocus.event_id}/${newFocus.slot}). ` +
        `narrowStep must not decrease within same focus.`,
    );
  }

  return nextStep;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// progressDelta 判定（detail §1.2 step 1）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 今回の capture が draft を前進させたかを判定する。
 *
 * 判定規則（implementation-detail §1.2 step 1）:
 *   1. subKind === "undecided" → "flat"
 *   2. 新規 anchor/category/chain が **旧値と異なる non-null** で入ってきた → "advanced"
 *   3. 新規が null で旧値が non-null だった（情報を消す発話）→ "regressed"
 *   4. どれも旧値と同じ → "flat"
 */
function computeProgressDelta(params: {
  priorDraft: SearchQueryDraft;
  capture: NormalizedCapture;
  isWhereSlot: boolean;
}): ProgressDelta {
  const { priorDraft, capture, isWhereSlot } = params;

  // where 以外の slot では draft を触らない。進行判定は「captured か否か」のみ。
  if (!isWhereSlot) {
    if (capture.subKind === "undecided") return "flat";
    if (capture.subKind === "other") return "flat";
    return "advanced"; // when/what/who は captured したら即 advanced 扱い
  }

  // where: undecided は常に flat
  if (capture.subKind === "undecided") {
    return "flat";
  }

  // proper_noun / baseline は一発で terminal に飛ぶので advanced
  if (
    capture.subKind === "proper_noun_specific" ||
    capture.subKind === "baseline"
  ) {
    return "advanced";
  }

  const priorA = priorDraft.anchorRegion;
  const priorC = priorDraft.categoryToken;
  const priorCh = priorDraft.chainToken;
  const newA = capture.extractedAnchor;
  const newC = capture.extractedCategory;
  const newCh = capture.extractedChain;

  // 新しい情報が旧値と異なる non-null で入ってきた → advanced
  const anchorAdvanced = newA !== null && newA !== priorA;
  const categoryAdvanced = newC !== null && newC !== priorC;
  const chainAdvanced = newCh !== null && newCh !== priorCh;

  if (anchorAdvanced || categoryAdvanced || chainAdvanced) {
    return "advanced";
  }

  // 旧値 non-null で新規が null（情報消去発話）
  const anchorRegressed = priorA !== null && newA === null && capture.rawSpan.length > 0;
  const categoryRegressed = priorC !== null && newC === null && capture.rawSpan.length > 0;
  const chainRegressed = priorCh !== null && newCh === null && capture.rawSpan.length > 0;

  // regressed は「明示的に否定発話」の場合のみ発火する設計。
  // commit 14 時点では classifyUtterance が「否定」を表現する subKind を持たないため、
  // 通常経路では regressed は発生しない（other に分類される）。
  // 将来 classifyUtterance で subKind="negation" を追加した時に有効化する。
  // 現時点では保守的に flat 扱い。
  void anchorRegressed;
  void categoryRegressed;
  void chainRegressed;

  return "flat";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// conversationStatus 決定（focus と state から derive）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * TURN_CAPTURED 後の conversationStatus を決定する。
 *
 * 決定順序（detail §1.2 step 8）:
 *   1. prevStatus="provider_recovering" → TURN 中は維持（復帰は PROVIDER_RECOVERED 専用）
 *      CEO invariant #2: provider_recovering 中の stable 昇格は絶対禁止
 *   2. subKind="proper_noun_specific" or "baseline" → stable（slot 確定）
 *   3. where slot + narrowStep=2 + readyForHandoff=true → search_handoff_blocking
 *   4. where slot + narrowStep ∈ {1, 2} → narrowing
 *   5. where slot + narrowStep=0 → clarifying
 *   6. focus 切替（prevFocus と異なる event or slot） → slot_switching
 *   7. それ以外（captured slot 完結時） → stable
 */
function deriveConversationStatus(params: {
  prevStatus: ConversationStatus;
  prevFocus: DialogFocus | null;
  newFocus: DialogFocus;
  newNarrowStep: 0 | 1 | 2 | 3;
  newDraft: SearchQueryDraft;
  capture: NormalizedCapture;
}): ConversationStatus {
  const { prevStatus, prevFocus, newFocus, newNarrowStep, newDraft, capture } =
    params;

  // CEO invariant #2: provider_recovering 中は TURN_CAPTURED で stable に戻さない。
  //   復帰は必ず PROVIDER_RECOVERED action 経由。
  //   TURN_CAPTURED 中は provider_recovering を維持（ユーザーが話しても復帰しない）。
  if (prevStatus === "provider_recovering") {
    return "provider_recovering";
  }

  // slot 確定系 subKind（proper_noun / baseline）→ stable
  if (
    capture.subKind === "proper_noun_specific" ||
    capture.subKind === "baseline"
  ) {
    return "stable";
  }

  const isWhereSlot = newFocus.slot === "where";

  // where slot の staircase 判定
  if (isWhereSlot) {
    if (newNarrowStep === 2 && newDraft.readyForHandoff) {
      return "search_handoff_blocking";
    }
    if (newNarrowStep >= 1) {
      return "narrowing";
    }
    // narrowStep=0 で focus が where なら clarifying（「どこ？」を聞く状態）
    return "clarifying";
  }

  // where 以外の slot
  // focus 切替検出
  if (
    prevFocus &&
    (prevFocus.event_id !== newFocus.event_id ||
      prevFocus.slot !== newFocus.slot)
  ) {
    return "slot_switching";
  }

  // 同一 focus 継続で captured 済み → stable
  return "stable";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TURN_CAPTURED handler（detail §1.2 の 9 step を愚直に実装）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleTurnCaptured(
  prev: DialogState,
  action: Extract<DialogAction, { type: "TURN_CAPTURED" }>,
): DialogState {
  // Step 1: 今回の focus を組み立て
  const newFocus: DialogFocus = {
    event_id: action.targetEventId,
    slot: action.targetSlot,
    // narrowStep は Step 3 で埋める。ここでは仮値 0。
    narrowStep: 0,
  };

  const isWhereSlot = action.targetSlot === "where";

  // Step 2: progressDelta 計算
  const progressDelta = computeProgressDelta({
    priorDraft: prev.searchQueryDraft,
    capture: action.capture,
    isWhereSlot,
  });

  // Step 3: narrowStep 遷移
  const subKindStep = NARROW_STEP_BY_SUBKIND[action.capture.subKind];
  const newNarrowStep = nextNarrowStep({
    prevFocus: prev.focus,
    newFocus,
    subKindStep,
    isWhereSlot,
    progressDelta,
  });
  newFocus.narrowStep = newNarrowStep;

  // Step 4: searchQueryDraft 更新（chain ↔ category 相互排他処理）
  //   ルール（detail §1.4）:
  //     - chain 確定 → category を null に上書き（chain がより specific）
  //     - category 確定（chain なし）→ chain はそのまま（元の chain が残る）
  //     - anchor 確定 → anchor のみ更新
  //   where 以外の slot では draft を触らない。
  let newDraft: SearchQueryDraft;
  if (isWhereSlot) {
    let nextAnchor = prev.searchQueryDraft.anchorRegion;
    let nextCategory = prev.searchQueryDraft.categoryToken;
    let nextChain = prev.searchQueryDraft.chainToken;

    if (action.capture.extractedAnchor !== null) {
      nextAnchor = action.capture.extractedAnchor;
    }
    if (action.capture.extractedChain !== null) {
      nextChain = action.capture.extractedChain;
      nextCategory = null; // chain 確定時 category を排他
    } else if (
      action.capture.extractedCategory !== null &&
      nextChain === null
    ) {
      // chain ↔ category 相互排他（detail §1.4）:
      //   chain が既に確定している場合、category 発話は無視（chain を specificity で保持）。
      //   chain 未確定の場合のみ category を受け入れる。
      nextCategory = action.capture.extractedCategory;
    }

    // focus 切替（event_id 変更）時は draft を reset
    const eventChanged =
      prev.focus !== null && prev.focus.event_id !== action.targetEventId;
    if (eventChanged) {
      nextAnchor = action.capture.extractedAnchor;
      nextCategory = action.capture.extractedCategory;
      nextChain = action.capture.extractedChain;
    }

    newDraft = buildSearchQueryDraft({
      anchorRegion: nextAnchor,
      categoryToken: nextCategory,
      chainToken: nextChain,
    });
  } else {
    // where 以外では draft を触らない（前状態をそのまま保持）
    newDraft = prev.searchQueryDraft;
  }

  // Step 5: readyForHandoff は buildSearchQueryDraft 内で derive 済み
  //   （直接代入経路なし、CEO invariant #4 遵守）

  // Step 6: semanticMissStreak の更新
  //   subKind="other" (分類不能) が続いたら 2 連続で pending 破棄の合図。
  //   その他の subKind では reset。
  const newSemanticMissStreak =
    action.capture.subKind === "other" ? prev.semanticMissStreak + 1 : 0;

  // Step 7: capturedHistory 追記（append-only）
  const historyEntry: CapturedHistoryEntry = {
    turnIndex: action.turnIndex,
    capturedAt: action.capturedAt,
    focus: { ...newFocus },
    capture: { ...action.capture },
    progressDelta,
  };
  const newHistory = [...prev.capturedHistory, historyEntry];

  // Step 8: conversationStatus 決定
  const nextStatus = deriveConversationStatus({
    prevStatus: prev.conversationStatus,
    prevFocus: prev.focus,
    newFocus,
    newNarrowStep,
    newDraft,
    capture: action.capture,
  });

  // Step 9: FSA 遷移検証（CEO invariant、不正遷移は throw）
  //   focus 切替（event_id / slot 変更）時は、prev の conversationStatus は
  //   「前 focus に紐づいた状態」なので、新 focus にとっては "stable" からの遷移
  //   として検証する（search_handoff_blocking は特定 focus に閉じた状態）。
  const focusChanged =
    prev.focus === null ||
    prev.focus.event_id !== newFocus.event_id ||
    prev.focus.slot !== newFocus.slot;
  const fsaFromStatus: ConversationStatus = focusChanged
    ? "stable"
    : prev.conversationStatus;
  assertAllowedTransition(fsaFromStatus, nextStatus);

  return {
    version: prev.version,
    focus: newFocus,
    conversationStatus: nextStatus,
    capturedHistory: newHistory,
    semanticMissStreak: newSemanticMissStreak,
    providerFailureStreak: prev.providerFailureStreak,
    lastGoodPlan: prev.lastGoodPlan,
    searchQueryDraft: newDraft,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROVIDER_FAILED handler（detail §3）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleProviderFailed(
  prev: DialogState,
  _action: Extract<DialogAction, { type: "PROVIDER_FAILED" }>,
): DialogState {
  // 任意の状態から provider_recovering に遷移可能（FSA 事前条件）
  assertAllowedTransition(prev.conversationStatus, "provider_recovering");

  return {
    version: prev.version,
    focus: prev.focus,
    conversationStatus: "provider_recovering",
    capturedHistory: prev.capturedHistory,
    semanticMissStreak: prev.semanticMissStreak,
    providerFailureStreak: prev.providerFailureStreak + 1,
    lastGoodPlan: prev.lastGoodPlan, // 維持（UI 継続表示用）
    searchQueryDraft: prev.searchQueryDraft,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROVIDER_RECOVERED handler（detail §3）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function deriveStatusOnRecovery(focus: DialogFocus | null): ConversationStatus {
  if (!focus) return "stable";
  if (focus.slot === "where") {
    if (focus.narrowStep >= 1) return "narrowing";
    return "clarifying";
  }
  return "stable";
}

function handleProviderRecovered(
  prev: DialogState,
  action: Extract<DialogAction, { type: "PROVIDER_RECOVERED" }>,
): DialogState {
  const nextStatus = deriveStatusOnRecovery(prev.focus);
  assertAllowedTransition(prev.conversationStatus, nextStatus);

  // lastGoodPlan を新 events で更新
  const nextLastGoodPlan: LastGoodPlanSnapshot = {
    capturedAtTurn: action.turnIndex,
    events: freezeEvents(action.events),
  };

  return {
    version: prev.version,
    focus: prev.focus,
    conversationStatus: nextStatus,
    capturedHistory: prev.capturedHistory,
    semanticMissStreak: prev.semanticMissStreak,
    providerFailureStreak: 0, // reset
    lastGoodPlan: nextLastGoodPlan,
    searchQueryDraft: prev.searchQueryDraft,
  };
}

/** events を readonly にする（reducer が後で mutate しないことを型で明示） */
function freezeEvents(
  events: ReadonlyArray<ComprehensionEvent>,
): ReadonlyArray<ComprehensionEvent> {
  return events.slice();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOCUS_SWITCHED handler（detail §1.5）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleFocusSwitched(
  prev: DialogState,
  action: Extract<DialogAction, { type: "FOCUS_SWITCHED" }>,
): DialogState {
  const nextFocus: DialogFocus = { ...action.nextFocus };

  // focus 切替時は slot_switching モードに遷移（FSA 許可）
  // narrowStep は action.nextFocus で明示渡されたものを尊重するが、
  // where 以外の slot に移るなら 0 強制。
  if (nextFocus.slot !== "where") {
    nextFocus.narrowStep = 0;
  }

  assertAllowedTransition(prev.conversationStatus, "slot_switching");

  return {
    version: prev.version,
    focus: nextFocus,
    conversationStatus: "slot_switching",
    capturedHistory: prev.capturedHistory,
    semanticMissStreak: prev.semanticMissStreak,
    providerFailureStreak: prev.providerFailureStreak,
    lastGoodPlan: prev.lastGoodPlan,
    searchQueryDraft: prev.searchQueryDraft, // where 情報は保持
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESET handler（detail §6 migration）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleReset(
  _prev: DialogState,
  _action: Extract<DialogAction, { type: "RESET" }>,
): DialogState {
  // RESET は FSA 検証をスキップ（migration 用、初期状態に無条件で戻る）。
  return {
    version: 1,
    focus: null,
    conversationStatus: "stable",
    capturedHistory: [],
    semanticMissStreak: 0,
    providerFailureStreak: 0,
    lastGoodPlan: null,
    searchQueryDraft: {
      anchorRegion: null,
      categoryToken: null,
      chainToken: null,
      readyForHandoff: false,
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// エントリポイント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DialogState reducer。pure 関数。
 *
 * @throws FSA 不正遷移 / narrowStep 逆行 / 未知 action type
 */
export function dialogReducer(
  prev: DialogState,
  action: DialogAction,
): DialogState {
  switch (action.type) {
    case "TURN_CAPTURED":
      return handleTurnCaptured(prev, action);
    case "PROVIDER_FAILED":
      return handleProviderFailed(prev, action);
    case "PROVIDER_RECOVERED":
      return handleProviderRecovered(prev, action);
    case "FOCUS_SWITCHED":
      return handleFocusSwitched(prev, action);
    case "RESET":
      return handleReset(prev, action);
    default: {
      // exhaustive 検査（新 action 追加時に compile error にする）
      const _exhaustive: never = action;
      throw new Error(
        `[DialogReducer] Unknown action type: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}
