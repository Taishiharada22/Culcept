/**
 * reconcileGapStateFromEffectiveEvents — PR #41b-0 (CEO 2026-04-28)
 *
 * Goal:
 *   merge 後の effectiveEvents を canonical truth として、gapResolver / pendingClarify
 *   / dialogState.focus を **再同期** する 3-layer pure helper。
 *
 * 背景 (PR #41a で観測された UX bug):
 *   modify guard が events[0].turn_mode を "create" → "modify" に書き換え、
 *   when.startTime も補正されたが、pendingClarify と dialogState.focus が
 *   **古い where_center** のまま残った。
 *   結果、event は完全 fixed なのに Alter は「09:00のカフェはどのあたり？」 を聞き続ける。
 *
 *   原因 3 経路:
 *     A) gapResolver は currentEvents (LLM 生出力) で実行。effectiveEvents 基準でない
 *     B) dialogState reducer は user utterance 文字列ベース。events 状態無視
 *     C) pendingClarify の prior fallback が「stale 値」 を引き継ぐ
 *
 * 修正 (CEO 必須条件 6 項目):
 *   1. gapResolver を effectiveEvents で再実行する
 *   2. pendingClarify は prior fallback で古い質問を引き継がない
 *   3. where が fixed かつ missingSemanticCritical に where が無いなら where pendingClarify は消える
 *   4. dialogState.focus が where のままでも effectiveEvents 側で where fixed なら focus を clear / advance
 *   5. semanticMissStreak / capturedHistory の flat 連続は resolved event に対して reset
 *   6. 未解決 slot がなければ phase は plan_presented に進む
 *
 * 設計原則:
 *   - **pure**: 副作用なし、env / flag を読まない、入力 events を変更しない
 *   - **idempotent**: 同じ入力で常に同じ出力。再呼び出し安全
 *   - **conservative**: comprehension_failed 等の特殊 phase は preserve
 *   - **observable**: trace で reconcile の発火を pin 可能 (separate field)
 */

import type { Event } from "../comprehension/eventSchema";
import {
  computeWhenSharpness,
  computeWhereSharpness,
  computeWhatSharpness,
} from "../comprehension/eventSchema";
import type { GapResolution } from "./gapResolver";
import { resolveGaps } from "./gapResolver";
import type { GroundedPlace } from "./placeGrounder";
import type { OptOutSlot } from "../comprehension/rulePreParse";
import type { DialogState, DialogFocus } from "../dialog/types";
import type { PendingClarify, MorningPhase } from "../types";
import { buildPendingClarifyFromResolution } from "../legacyAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ReconcileInput {
  /** merge 後 + guard 補正後の events (canonical truth) */
  effectiveEvents: Event[];
  /** 前 turn の pendingClarify (fallback 候補) */
  priorPendingClarify: PendingClarify | null;
  /** 前 turn の dialogState (focus を再評価する基準) */
  priorDialogState: DialogState | null;
  /** gapResolver 用 context */
  gapContext: {
    grounded?: GroundedPlace[];
    slotOptOuts?: OptOutSlot[];
  };
  /**
   * 元の phase (comprehension_failed 等の特殊 phase を preserve するため)。
   * "plan_presented" / "clarifying" 以外なら reconcile は phase を変更しない。
   */
  originalPhase: MorningPhase;
}

export interface ReconcileResult {
  /** effectiveEvents 基準で再計算した GapResolution */
  reconciledGapResolution: GapResolution;
  /** rebuild された pendingClarify (events 完全 fixed なら null) */
  reconciledPendingClarify: PendingClarify | null;
  /** events と同期した dialogState (focus が clear / advance される) */
  reconciledDialogState: DialogState | null;
  /** 再決定 phase (events 完全 fixed なら plan_presented に昇格) */
  reconciledPhase: MorningPhase;
  /**
   * trace 用の発火フラグ (observability):
   *   - phaseChanged: phase が原状から変わったか
   *   - pendingClarifyChanged: pendingClarify が priorPendingClarify と異なるか
   *   - focusCleared: dialogState.focus が priorDialogState.focus から clear / advance されたか
   *   - eventsFullyFixed: 全 events の slot が fixed か (= 「未解決 slot なし」)
   */
  reconciled: {
    phaseChanged: boolean;
    pendingClarifyChanged: boolean;
    focusCleared: boolean;
    eventsFullyFixed: boolean;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全 events の slot が fixed かつ missing がない (= 「未解決 slot なし」)。
 * true なら pendingClarify を立てる必要なし、phase=plan_presented 候補。
 */
export function areEventsFullyFixed(events: Event[]): boolean {
  if (events.length === 0) return false; // events 空は plan 不能 (separate concern)
  return events.every(
    (ev) =>
      computeWhenSharpness(ev.when) === "fixed" &&
      computeWhereSharpness(ev.where) === "fixed" &&
      computeWhatSharpness(ev.what) === "fixed" &&
      ev.missing_semantic_critical.length === 0 &&
      ev.missing_solver_blockers.length === 0,
  );
}

/**
 * effectiveEvents の中で「最初の missing slot を持つ event」 を見つけ、focus 用に返す。
 * priority: where (vague/missing) > when (vague/missing) > what (vague/missing)
 *
 * 全 fixed なら null。
 */
export function findNextFocusFromEvents(events: Event[]): DialogFocus | null {
  for (const ev of events) {
    const whereSh = computeWhereSharpness(ev.where);
    if (whereSh !== "fixed") {
      return { event_id: ev.event_id, slot: "where", narrowStep: 0 };
    }
  }
  for (const ev of events) {
    const whenSh = computeWhenSharpness(ev.when);
    if (whenSh !== "fixed") {
      return { event_id: ev.event_id, slot: "when", narrowStep: 0 };
    }
  }
  for (const ev of events) {
    const whatSh = computeWhatSharpness(ev.what);
    if (whatSh !== "fixed") {
      return { event_id: ev.event_id, slot: "what", narrowStep: 0 };
    }
  }
  return null;
}

/**
 * dialogState.focus を effectiveEvents と再同期する。
 *
 * 規則:
 *   1. focus が null → そのまま (clarifying でないので動かさない)
 *   2. focus が指す event が消滅 → focus=null, status=stable
 *   3. focus.slot が fixed → 次の missing slot に advance、なければ stable
 *   4. focus.slot が依然 vague/missing → そのまま
 *
 * 副次効果 (CEO condition 5):
 *   - focus が advance / clear された場合 semanticMissStreak=0 に reset
 *   - capturedHistory はそのまま保持 (歴史なので append-only、reset しない)
 *     ただし「flat 連続が無効化される」 = focus が変わったので新 slot 用に semanticMissStreak のみ reset
 *
 * 戻り値: 新 DialogState (input 不変、shallow copy)
 */
export function reconcileDialogState(
  state: DialogState | null,
  effectiveEvents: Event[],
): { state: DialogState | null; focusCleared: boolean } {
  if (!state) return { state: null, focusCleared: false };
  if (state.focus === null) return { state, focusCleared: false };

  const focusedEvent = effectiveEvents.find(
    (e) => e.event_id === state.focus!.event_id,
  );

  // Rule 2: focus event 消滅 → focus clear
  if (!focusedEvent) {
    return {
      state: {
        ...state,
        focus: null,
        conversationStatus: "stable",
        semanticMissStreak: 0,
      },
      focusCleared: true,
    };
  }

  // Rule 3 / 4: focused slot の sharpness 評価
  const slot = state.focus.slot;
  let sharpness;
  if (slot === "where") {
    sharpness = computeWhereSharpness(focusedEvent.where);
  } else if (slot === "when") {
    sharpness = computeWhenSharpness(focusedEvent.when);
  } else if (slot === "what") {
    sharpness = computeWhatSharpness(focusedEvent.what);
  } else {
    // who など他 slot は本 reconcile の対象外、そのまま
    return { state, focusCleared: false };
  }

  if (sharpness === "fixed") {
    // Rule 3: slot fixed → 次の missing に advance、なければ stable
    const next = findNextFocusFromEvents(effectiveEvents);
    if (next) {
      return {
        state: {
          ...state,
          focus: next,
          conversationStatus: "clarifying",
          semanticMissStreak: 0, // CEO condition 5: focus 変更で reset
        },
        focusCleared: true,
      };
    }
    // 全 fixed
    return {
      state: {
        ...state,
        focus: null,
        conversationStatus: "stable",
        semanticMissStreak: 0,
      },
      focusCleared: true,
    };
  }

  // Rule 4: 依然 vague/missing → そのまま
  return { state, focusCleared: false };
}

/**
 * pendingClarify を rebuild する。
 *
 * 規則:
 *   1. newGapResolution.primary_clarify がある → buildPendingClarifyFromResolution
 *   2. primary_clarify == null AND eventsFullyFixed === true → null (CEO condition 2,3)
 *   3. primary_clarify == null AND eventsFullyFixed === false AND priorPendingClarify あり
 *      → priorPendingClarify (comprehension_failed 救済 fallback、limited)
 *   4. それ以外 → null
 */
export function reconcilePendingClarify(input: {
  newGapResolution: GapResolution;
  effectiveEvents: Event[];
  priorPendingClarify: PendingClarify | null;
}): PendingClarify | null {
  const { newGapResolution, effectiveEvents, priorPendingClarify } = input;
  const primary = newGapResolution.primary_clarify;
  const eventsFullyFixed = areEventsFullyFixed(effectiveEvents);

  if (primary) {
    return buildPendingClarifyFromResolution(
      primary,
      effectiveEvents,
      priorPendingClarify?.semanticMissCount ?? 0,
    );
  }

  // primary == null
  if (eventsFullyFixed) {
    // CEO condition 2,3: events 完全 fixed なら fallback しない
    return null;
  }

  // events に未解決 slot あり、でも primary_clarify は立たない (comprehension failure 等)
  // → prior fallback で救済
  return priorPendingClarify;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API — reconcileGapStateFromEffectiveEvents
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 3-layer reconcile を 1 関数で実行する pure entry point。
 *
 * Layer 1: gapResolver を effectiveEvents で再実行
 * Layer 2: pendingClarify rebuild (prior fallback 制限付き)
 * Layer 3: dialogState.focus を effectiveEvents と同期
 * Layer 4: phase 再決定 (events fully fixed → plan_presented)
 *
 * 例外: comprehension_failed / 特殊 phase は preserve する。
 */
export function reconcileGapStateFromEffectiveEvents(
  input: ReconcileInput,
): ReconcileResult {
  const {
    effectiveEvents,
    priorPendingClarify,
    priorDialogState,
    gapContext,
    originalPhase,
  } = input;

  const eventsFullyFixed = areEventsFullyFixed(effectiveEvents);

  // ── Layer 1: gapResolver 再実行 ──
  const reconciledGapResolution = resolveGaps(effectiveEvents, gapContext);

  // ── Layer 2: pendingClarify rebuild ──
  const reconciledPendingClarify = reconcilePendingClarify({
    newGapResolution: reconciledGapResolution,
    effectiveEvents,
    priorPendingClarify,
  });

  // ── Layer 3: dialogState.focus 同期 ──
  const dsResult = reconcileDialogState(priorDialogState, effectiveEvents);

  // ── Layer 4: phase 再決定 ──
  // 特殊 phase は preserve
  const isSpecialPhase =
    originalPhase !== "clarifying" && originalPhase !== "plan_presented";
  let reconciledPhase: MorningPhase;
  if (isSpecialPhase) {
    reconciledPhase = originalPhase;
  } else if (reconciledPendingClarify != null) {
    reconciledPhase = "clarifying";
  } else if (eventsFullyFixed) {
    reconciledPhase = "plan_presented";
  } else {
    // events に未解決あるが primary_clarify が立たない (rare)
    reconciledPhase = "clarifying";
  }

  // ── 観測フラグ ──
  const phaseChanged = reconciledPhase !== originalPhase;
  const pendingClarifyChanged =
    (reconciledPendingClarify?.event_id ?? null) !==
      (priorPendingClarify?.event_id ?? null) ||
    (reconciledPendingClarify?.kind ?? null) !==
      (priorPendingClarify?.kind ?? null) ||
    (reconciledPendingClarify?.slot ?? null) !==
      (priorPendingClarify?.slot ?? null);

  return {
    reconciledGapResolution,
    reconciledPendingClarify,
    reconciledDialogState: dsResult.state,
    reconciledPhase,
    reconciled: {
      phaseChanged,
      pendingClarifyChanged,
      focusCleared: dsResult.focusCleared,
      eventsFullyFixed,
    },
  };
}
