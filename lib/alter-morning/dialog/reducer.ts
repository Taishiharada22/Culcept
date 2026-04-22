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
import type {
  CapturedHistoryEntry,
  ConversationStatus,
  DialogAction,
  DialogFocus,
  DialogState,
  LastFailedSearch,
  LastGoodPlanSnapshot,
  NormalizedCapture,
  PresentationContext,
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
  // CEO invariant #3（PR-9 commit 2 で拡張）:
  //   PR-8 rev 3: search_handoff_blocking からの降格は slot_switching / provider_recovering のみ。
  //   PR-9 commit 2 追加:
  //     - search_candidates_presented: Places API が候補を返した時の前進
  //     - clarifying: zero_candidates（結果 0 件）の時に narrowStep=1 に rollback する
  //       → 「狭すぎた検索を広げ直す」明示的な downgrade。narrowing ではなく clarifying へ
  //         戻すのは「何でこの地域で探す？」という再 clarify を走らせるため。
  //   narrowing / stable への降格は引き続き禁止（stable は candidate 選択後にのみ到達）。
  search_handoff_blocking: new Set([
    "search_handoff_blocking",
    "search_candidates_presented",
    "clarifying",
    "slot_switching",
    "provider_recovering",
  ]),
  // PR-9 commit 2 追加: search_candidates_presented
  //   - stable: SEARCH_CANDIDATE_SELECTED 成功
  //   - clarifying: user が「どれでもない」で再 clarify（将来拡張用、UI で発火）
  //   - slot_switching: focus 切替（park されて別 slot/event へ）
  //   - provider_recovering: 提示中に次 turn が provider 失敗
  //   - self: 同状態維持（再提示 / 再描画）
  //   narrowing / search_handoff_blocking への巻き戻しは禁止（提示済み状態が後退しない）。
  search_candidates_presented: new Set([
    "search_candidates_presented",
    "stable",
    "clarifying",
    "slot_switching",
    "provider_recovering",
  ]),
  slot_switching: new Set([
    "slot_switching",
    "clarifying",
    "narrowing",
    "stable",
    "search_handoff_blocking", // 切替先 focus 初発で chain_with_anchor の直行ケース
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
// Presentation 退避 (α' 方針: state 保持のみ、PR-9 で自動復帰させない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAX_PARKED_PRESENTATIONS = 3;

/**
 * activePresentation を parkedPresentations に退避する LRU 処理。
 *
 * - activePresentation が null なら no-op（parked を mutate しない）。
 * - 同じ (targetEventId, queryFingerprint) が既に parked にあれば除去して最新化。
 * - 最大 3 件、超過分は最古を捨てる。
 *
 * CEO α' 制約:
 *   parkedPresentations は PR-9 の state machine / NLU 復帰には一切使わない。
 *   保持のみ。UI/復帰は PR-9.5 以降。reducer 本体もここ以外から触らない。
 */
function parkActivePresentation(prev: DialogState): {
  activePresentation: null;
  parkedPresentations: ReadonlyArray<PresentationContext>;
} {
  if (!prev.activePresentation) {
    return {
      activePresentation: null,
      parkedPresentations: prev.parkedPresentations,
    };
  }
  const active = prev.activePresentation;
  const filtered = prev.parkedPresentations.filter(
    (p) =>
      p.targetEventId !== active.targetEventId ||
      p.queryFingerprint !== active.queryFingerprint,
  );
  const merged: PresentationContext[] = [active, ...filtered];
  return {
    activePresentation: null,
    parkedPresentations: merged.slice(0, MAX_PARKED_PRESENTATIONS),
  };
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
// narrowStep 遷移（CEO invariant #1: 逆行禁止、detail §1.2 table）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 累積 draft から narrowStep を derive する（detail §1.2 table 準拠）。
 *
 * 読み方（detail §1.2 Step 2 table、commit 18 で reducer を寄せ直した版）:
 *   - draft に chainToken か categoryToken が載っている → step=2
 *   - draft に anchorRegion のみ載っている → step=1
 *   - どれも載っていない → step=0
 *
 * これにより:
 *   - anchor_alone → chain_alone の 2 ターン合成で 1 → **2** に lift する
 *     （§11.1 T3 シナリオ A を成立させる、rev 3 の本質）
 *   - 「0 → 2」初回短絡（§11.4 D, §2.10.2）も同式で自然に成立
 *     （chain_alone 初回: anchor=null だが chain 載る → step=2）
 *
 * proper_noun_specific / baseline は draft を更新しない terminal なので、
 * 別経路（TURN_CAPTURED handler 側）で narrowStep=3 を直接セットする。
 */
function deriveNarrowStepFromDraft(draft: SearchQueryDraft): 0 | 1 | 2 {
  if (draft.chainToken !== null || draft.categoryToken !== null) {
    return 2;
  }
  if (draft.anchorRegion !== null) {
    return 1;
  }
  return 0;
}

/**
 * 新 narrowStep を決定する（focus 継続中は単調増加のみ許可）。
 *
 * アルゴリズム（detail §1.2 準拠、commit 18 rewrite）:
 *   1. where 以外の slot → 0 固定（narrowStep は where 専用）
 *   2. proper_noun_specific / baseline → 3（terminal、draft 非更新）
 *   3. focus 継続 + progressDelta="regressed" → prev - 1（下限 0）
 *   4. それ以外 → deriveNarrowStepFromDraft(newDraft) を基準に、
 *      focus 継続中は max(prev, derived) で単調増加保証
 *
 * @param newDraft TURN_CAPTURED で更新 **済み** の searchQueryDraft
 *                 （chain/category 排他処理後、buildSearchQueryDraft の出力）
 * @throws focus 継続中に逆行しようとした場合（defensive、draft は accumulate のみなので通常到達不能）
 */
function nextNarrowStep(params: {
  prevFocus: DialogFocus | null;
  newFocus: DialogFocus;
  newDraft: SearchQueryDraft;
  capture: NormalizedCapture;
  isWhereSlot: boolean;
  progressDelta: ProgressDelta;
}): 0 | 1 | 2 | 3 {
  const { prevFocus, newFocus, newDraft, capture, isWhereSlot, progressDelta } =
    params;

  // where 以外の slot は 0 固定
  if (!isWhereSlot) {
    return 0;
  }

  // terminal subKind: draft 非更新で直接 step=3 に飛ぶ
  //   proper_noun_specific: 「サドヤ」等、slot 確定（stable 行き）
  //   baseline: 「自宅」「オフィス」等、Layer 1 resolver 経由で確定
  if (
    capture.subKind === "proper_noun_specific" ||
    capture.subKind === "baseline"
  ) {
    return 3;
  }

  const focusChanged =
    !prevFocus ||
    prevFocus.event_id !== newFocus.event_id ||
    prevFocus.slot !== newFocus.slot;

  // CEO invariant #1: 逆行禁止（progressDelta="regressed" のみ例外的に -1 許容）
  //   focus 継続中のみ適用（focus 切替後の「前の step」は新 focus に無意味）。
  //   現状 classifyUtterance は subKind="regressed" を返さないため、
  //   この枝は将来の否定発話分類用の reserve。
  if (progressDelta === "regressed" && !focusChanged) {
    const prevStep = prevFocus.narrowStep;
    const regressedStep = Math.max(0, prevStep - 1);
    return regressedStep as 0 | 1 | 2 | 3;
  }

  const derivedStep = deriveNarrowStepFromDraft(newDraft);

  // focus 切替時は monotonic 検証なし（新 focus に対しては prev step は無意味）。
  //   draft は event 切替で reset、slot 切替では保持なので、
  //   derivedStep が slot_switching 後の where 復帰時に 2 まで復元される（§11.1 T4）。
  if (focusChanged) {
    return derivedStep;
  }

  const prevStep = prevFocus.narrowStep;
  const nextStep = Math.max(prevStep, derivedStep) as 0 | 1 | 2 | 3;

  if (nextStep < prevStep) {
    // draft が accumulate-only である限り到達不能だが defensive
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
    // narrowStep は Step 4 で埋める。ここでは仮値 0。
    narrowStep: 0,
  };

  const isWhereSlot = action.targetSlot === "where";

  // Step 2: progressDelta 計算（priorDraft vs 今 capture）
  const progressDelta = computeProgressDelta({
    priorDraft: prev.searchQueryDraft,
    capture: action.capture,
    isWhereSlot,
  });

  // Step 3: searchQueryDraft 更新（chain ↔ category 相互排他処理）
  //   ルール（detail §1.4）:
  //     - chain 確定 → category を null に上書き（chain がより specific）
  //     - category 確定（chain なし）→ chain はそのまま（元の chain が残る）
  //     - anchor 確定 → anchor のみ更新
  //
  //   commit 23c (2026-04-22): slot-independent preservation
  //     where 以外の slot 応答中に user が偶発的に where 情報を含めた場合
  //     (例: Turn 1 "明日はカフェで仕事の予定" は targetSlot="when" だが
  //     category="カフェ" を含む)、その情報を失わずに draft に保存する。
  //     ただし保守的戦略を採り、**既に non-null のフィールドは上書きしない**。
  //     narrowing 中の明示的決定を非 where turn が上書きする事故を防ぐ。
  //
  //   ⚠ commit 18 で Step 4 (narrowStep) の前に移動:
  //     narrowStep を「累積 newDraft から derive」する実装に寄せたため、
  //     先に draft を確定させる必要がある。
  let newDraft: SearchQueryDraft;
  {
    const eventChanged =
      prev.focus !== null && prev.focus.event_id !== action.targetEventId;

    let nextAnchor: string | null;
    let nextCategory: string | null;
    let nextChain: string | null;

    if (eventChanged) {
      // event 切替時は draft を reset（where/非 where 対称）。
      // reset 直後に、この turn の capture だけを初期値に乗せる。
      nextAnchor = action.capture.extractedAnchor;
      nextChain = action.capture.extractedChain;
      // chain 確定時は category を排他（detail §1.4）
      nextCategory =
        action.capture.extractedChain !== null
          ? null
          : action.capture.extractedCategory;
    } else if (isWhereSlot) {
      // where turn: 既存仕様通り、capture で上書き更新する。
      nextAnchor = prev.searchQueryDraft.anchorRegion;
      nextCategory = prev.searchQueryDraft.categoryToken;
      nextChain = prev.searchQueryDraft.chainToken;

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
        // chain ↔ category 相互排他:
        //   chain 確定時は category 発話を無視、chain 未確定時のみ受け入れる。
        nextCategory = action.capture.extractedCategory;
      }
    } else {
      // 非 where turn: commit 23c slot-independent preservation。
      //   **空欄のみ埋める**（non-null の既存情報は上書きしない）。
      //   これで Turn 1 の偶発的 where 情報 (「明日はカフェで仕事」の category)
      //   が、後続 where clarify で activeClarifyFallback に届く。
      nextAnchor = prev.searchQueryDraft.anchorRegion;
      nextCategory = prev.searchQueryDraft.categoryToken;
      nextChain = prev.searchQueryDraft.chainToken;

      // chain 空欄 → preserve（chain が specificity で優位）
      if (
        action.capture.extractedChain !== null &&
        nextChain === null
      ) {
        nextChain = action.capture.extractedChain;
        // chain 新規記入時に既存 category があれば detail §1.4 に従い null 化する。
        // ただし non-where turn の preserve なので、既存 category が non-null の
        // ときは「既存を上書きしない」原則で chain 側を棄却する方が自然。
        // → ここは chain 側優先（specificity）で category を落とす。
        if (nextCategory !== null) {
          nextCategory = null;
        }
      }
      // category 空欄 + chain も空欄 → preserve
      if (
        action.capture.extractedCategory !== null &&
        nextCategory === null &&
        nextChain === null
      ) {
        nextCategory = action.capture.extractedCategory;
      }
      // anchor 空欄 → preserve
      if (
        action.capture.extractedAnchor !== null &&
        nextAnchor === null
      ) {
        nextAnchor = action.capture.extractedAnchor;
      }
    }

    newDraft = buildSearchQueryDraft({
      anchorRegion: nextAnchor,
      categoryToken: nextCategory,
      chainToken: nextChain,
    });
  }

  // Step 4: narrowStep 遷移（detail §1.2 table: newDraft から derive）
  //   commit 18 で subKindStep lookup から「累積 draft 依存」に寄せた。
  //   anchor → chain / category の multi-turn 合成が step=2 に lift する。
  const newNarrowStep = nextNarrowStep({
    prevFocus: prev.focus,
    newFocus,
    newDraft,
    capture: action.capture,
    isWhereSlot,
    progressDelta,
  });
  newFocus.narrowStep = newNarrowStep;

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

  // PR-9 commit 2: focus 切替時に activePresentation を park する（α' 保持のみ）。
  // focus 継続中は active を保持（提示中の候補が生き続ける）。
  const presentationSlot = focusChanged
    ? parkActivePresentation(prev)
    : {
        activePresentation: prev.activePresentation,
        parkedPresentations: prev.parkedPresentations,
      };

  // zeroCandidateMissCount は focus 切替で reset。
  // focus 継続時は維持（同一 clarify 内の miss loop を計数する）。
  const nextZeroMissCount = focusChanged ? 0 : prev.zeroCandidateMissCount;

  return {
    version: prev.version,
    focus: newFocus,
    conversationStatus: nextStatus,
    capturedHistory: newHistory,
    semanticMissStreak: newSemanticMissStreak,
    providerFailureStreak: prev.providerFailureStreak,
    lastGoodPlan: prev.lastGoodPlan,
    searchQueryDraft: newDraft,
    activePresentation: presentationSlot.activePresentation,
    parkedPresentations: presentationSlot.parkedPresentations,
    lastFailedSearch: prev.lastFailedSearch,
    zeroCandidateMissCount: nextZeroMissCount,
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
    // PR-9 commit 2: activePresentation は provider 失敗で invalidate（復帰後は
    //   再提示が必要。候補 UI はフリーズ表示中でも stale 扱い）。parkedPresentations
    //   / lastFailedSearch / zeroCandidateMissCount は維持。
    activePresentation: null,
    parkedPresentations: prev.parkedPresentations,
    lastFailedSearch: prev.lastFailedSearch,
    zeroCandidateMissCount: prev.zeroCandidateMissCount,
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
    // PR-9 commit 2: activePresentation は PROVIDER_FAILED 時に既に null 化済み。
    //   parked / lastFailedSearch / missCount は維持。
    activePresentation: prev.activePresentation,
    parkedPresentations: prev.parkedPresentations,
    lastFailedSearch: prev.lastFailedSearch,
    zeroCandidateMissCount: prev.zeroCandidateMissCount,
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

  // PR-9 commit 2: activePresentation を parked に退避（α'）。
  //   同 event の同 slot に戻ってくる可能性があるため、破棄せず state 保持。
  //   miss count は focus が変わるので reset。
  const presentationSlot = parkActivePresentation(prev);

  return {
    version: prev.version,
    focus: nextFocus,
    conversationStatus: "slot_switching",
    capturedHistory: prev.capturedHistory,
    semanticMissStreak: prev.semanticMissStreak,
    providerFailureStreak: prev.providerFailureStreak,
    lastGoodPlan: prev.lastGoodPlan,
    searchQueryDraft: prev.searchQueryDraft, // where 情報は保持
    activePresentation: presentationSlot.activePresentation,
    parkedPresentations: presentationSlot.parkedPresentations,
    lastFailedSearch: prev.lastFailedSearch,
    zeroCandidateMissCount: 0,
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
    activePresentation: null,
    parkedPresentations: [],
    lastFailedSearch: null,
    zeroCandidateMissCount: 0,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEARCH_CANDIDATES_PRESENTED handler (PR-9 commit 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleSearchCandidatesPresented(
  prev: DialogState,
  action: Extract<DialogAction, { type: "SEARCH_CANDIDATES_PRESENTED" }>,
): DialogState {
  // invariant: presentation は search_handoff_blocking から遷移（or 同状態再提示）
  if (
    prev.conversationStatus !== "search_handoff_blocking" &&
    prev.conversationStatus !== "search_candidates_presented"
  ) {
    throw new Error(
      `[DialogReducer] SEARCH_CANDIDATES_PRESENTED requires conversationStatus ` +
        `in {search_handoff_blocking, search_candidates_presented}, got ${prev.conversationStatus}`,
    );
  }
  if (!prev.focus || prev.focus.slot !== "where") {
    throw new Error(
      `[DialogReducer] SEARCH_CANDIDATES_PRESENTED requires focus.slot="where", ` +
        `got ${prev.focus?.slot ?? "null"}`,
    );
  }
  if (prev.focus.event_id !== action.targetEventId) {
    throw new Error(
      `[DialogReducer] SEARCH_CANDIDATES_PRESENTED targetEventId mismatch: ` +
        `focus.event_id=${prev.focus.event_id}, action.targetEventId=${action.targetEventId}`,
    );
  }
  if (action.candidates.length === 0) {
    throw new Error(
      `[DialogReducer] SEARCH_CANDIDATES_PRESENTED with empty candidates — ` +
        `use SEARCH_ZERO_CANDIDATES instead`,
    );
  }

  assertAllowedTransition(prev.conversationStatus, "search_candidates_presented");

  const presentation: PresentationContext = {
    targetEventId: action.targetEventId,
    queryFingerprint: action.queryFingerprint,
    candidates: action.candidates.slice(),
    presentedAtTurn: action.turnIndex,
  };

  return {
    version: prev.version,
    focus: prev.focus,
    conversationStatus: "search_candidates_presented",
    capturedHistory: prev.capturedHistory,
    semanticMissStreak: prev.semanticMissStreak,
    providerFailureStreak: prev.providerFailureStreak,
    lastGoodPlan: prev.lastGoodPlan,
    searchQueryDraft: prev.searchQueryDraft,
    activePresentation: presentation,
    parkedPresentations: prev.parkedPresentations,
    // 提示成功で 0 件 miss 連続は打ち切り（同 focus で「当たった」 = 次 0 件で再起算）
    lastFailedSearch: prev.lastFailedSearch,
    zeroCandidateMissCount: 0,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEARCH_CANDIDATE_SELECTED handler (PR-9 commit 2)
//
// S8 方針（CEO 2026-04-23）: stale / provider_recovering / invalid selection は
//   throw ではなく reject/no-op（prev state をそのまま返す）。
//   route.ts が state 不変を検知して gentle re-guidance を返す。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleSearchCandidateSelected(
  prev: DialogState,
  action: Extract<DialogAction, { type: "SEARCH_CANDIDATE_SELECTED" }>,
): DialogState {
  // S8.a: provider_recovering 中は一切受けない（state を触らない）
  if (prev.conversationStatus === "provider_recovering") {
    return prev;
  }
  // S8.b: activePresentation が無い（presentation 外からの selection）
  if (!prev.activePresentation) {
    return prev;
  }
  // S8.c: targetEventId 不一致（別 event の古い picker から来た）
  if (prev.activePresentation.targetEventId !== action.targetEventId) {
    return prev;
  }
  // S8.d: queryFingerprint 不一致（draft が変わった後の stale selection）
  if (prev.activePresentation.queryFingerprint !== action.queryFingerprint) {
    return prev;
  }
  // S8.e: selectedPlaceId が保存候補にない
  const match = prev.activePresentation.candidates.find(
    (c) => c.placeId === action.selectedPlaceId,
  );
  if (!match) {
    return prev;
  }
  // S8.f: conversationStatus が search_candidates_presented でない
  //   (e.g. focus 切替直後に古い UI から selection が来た等)。no-op で受け流す。
  if (prev.conversationStatus !== "search_candidates_presented") {
    return prev;
  }
  if (!prev.focus || prev.focus.slot !== "where") {
    return prev;
  }

  assertAllowedTransition(prev.conversationStatus, "stable");

  // D1: 成功時の full reset — draft / activePresentation / missCount / lastFailedSearch
  const nextDraft: SearchQueryDraft = {
    anchorRegion: null,
    categoryToken: null,
    chainToken: null,
    readyForHandoff: false,
  };

  const nextFocus: DialogFocus = {
    event_id: prev.focus.event_id,
    slot: "where",
    narrowStep: 3, // terminal（picker 経由で確定）
  };

  return {
    version: prev.version,
    focus: nextFocus,
    conversationStatus: "stable",
    capturedHistory: prev.capturedHistory,
    semanticMissStreak: 0,
    providerFailureStreak: prev.providerFailureStreak,
    lastGoodPlan: prev.lastGoodPlan,
    searchQueryDraft: nextDraft,
    activePresentation: null,
    parkedPresentations: prev.parkedPresentations,
    lastFailedSearch: null,
    zeroCandidateMissCount: 0,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEARCH_ZERO_CANDIDATES handler (PR-9 commit 2)
//
// E 方針（E3 copy + E1 state）:
//   - anchor は保持（地域は失敗原因ではない）
//   - category / chain は drop（これが失敗原因）
//   - narrowStep 2 → 1（explicit rollback。無限ハンドオフ防止）
//   - conversationStatus → clarifying
//   - lastFailedSearch 記録、zeroCandidateMissCount++
//
// S9 方針（CEO 2026-04-23）:
//   missCount が 3 を超えても reducer は status を強制変更しない（clarifying 維持）。
//   copy 強化は route.ts の責務。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleSearchZeroCandidates(
  prev: DialogState,
  action: Extract<DialogAction, { type: "SEARCH_ZERO_CANDIDATES" }>,
): DialogState {
  // invariant: zero_candidates は search_handoff_blocking から発火する想定。
  //   search_candidates_presented からの「再検索 0 件」経路は PR-9.5 以降で検討。
  if (prev.conversationStatus !== "search_handoff_blocking") {
    throw new Error(
      `[DialogReducer] SEARCH_ZERO_CANDIDATES requires conversationStatus=` +
        `search_handoff_blocking, got ${prev.conversationStatus}`,
    );
  }
  if (!prev.focus || prev.focus.slot !== "where") {
    throw new Error(
      `[DialogReducer] SEARCH_ZERO_CANDIDATES requires focus.slot="where"`,
    );
  }
  if (prev.focus.event_id !== action.targetEventId) {
    throw new Error(
      `[DialogReducer] SEARCH_ZERO_CANDIDATES targetEventId mismatch: ` +
        `focus=${prev.focus.event_id}, action=${action.targetEventId}`,
    );
  }

  assertAllowedTransition(prev.conversationStatus, "clarifying");

  const priorDraft = prev.searchQueryDraft;
  const anchorRegion = priorDraft.anchorRegion;

  // lastFailedSearch 記録。anchor が空なら record を作らない（defensive）。
  const failedSearch: LastFailedSearch | null = anchorRegion
    ? {
        turnIndex: action.turnIndex,
        anchorRegion,
        failedCategoryToken: priorDraft.categoryToken,
        failedChainToken: priorDraft.chainToken,
      }
    : prev.lastFailedSearch;

  // anchor 保持 + chain/category drop
  const nextDraft = buildSearchQueryDraft({
    anchorRegion,
    categoryToken: null,
    chainToken: null,
  });

  // narrowStep 2 → 1（explicit rollback, CEO 設計 §2.2 zero_candidates）
  const nextFocus: DialogFocus = {
    event_id: prev.focus.event_id,
    slot: "where",
    narrowStep: 1,
  };

  return {
    version: prev.version,
    focus: nextFocus,
    conversationStatus: "clarifying",
    capturedHistory: prev.capturedHistory,
    semanticMissStreak: prev.semanticMissStreak,
    providerFailureStreak: prev.providerFailureStreak,
    lastGoodPlan: prev.lastGoodPlan,
    searchQueryDraft: nextDraft,
    activePresentation: null,
    parkedPresentations: prev.parkedPresentations,
    lastFailedSearch: failedSearch,
    zeroCandidateMissCount: prev.zeroCandidateMissCount + 1,
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
    case "SEARCH_CANDIDATES_PRESENTED":
      return handleSearchCandidatesPresented(prev, action);
    case "SEARCH_CANDIDATE_SELECTED":
      return handleSearchCandidateSelected(prev, action);
    case "SEARCH_ZERO_CANDIDATES":
      return handleSearchZeroCandidates(prev, action);
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
