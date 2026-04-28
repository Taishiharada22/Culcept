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
 *   1. gapResolver の結果を effectiveEvents 基準で **filter** (target slot が fixed なら drop)
 *   2. pendingClarify は prior fallback で古い質問を引き継がない (target slot fixed → drop)
 *   3. where が fixed かつ missingSemanticCritical に where が無いなら where pendingClarify は消える
 *   4. dialogState.focus が where のままでも effectiveEvents 側で where fixed なら focus を clear / advance
 *   5. semanticMissStreak / capturedHistory の flat 連続は resolved event に対して reset
 *   6. 未解決 slot がなければ phase は plan_presented に進む
 *
 * 設計判断 (gapResolver 再実行をしない理由):
 *   resolveGaps を再実行すると、test fixture の人為的な
 *   `missing_semantic_critical=["when"]` (when sharpness=fixed なのに) や
 *   what="仕事" (VAGUE_ACTIVITY) を再評価して、test 期待を破る。
 *   既存契約「primary_clarify が null なら plan_presented」を尊重するため、
 *   reconcile は **filter** に徹する (drop stale primary_clarify、prior fallback 制限)。
 *
 *   "fully fixed enough" の判定は `hasBlockingUnresolvedSlots` で揃え、
 *   whatSh=vague は non-blocking として上の階層と一致させる。
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
import type { GapResolution, ClarifyRequest } from "./gapResolver";
import { hasBlockingUnresolvedSlots } from "./blockingSlots";
import type { DialogState, DialogFocus } from "../dialog/types";
import type { PendingClarify, MorningPhase } from "../types";
import { buildPendingClarifyFromResolution } from "../legacyAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ReconcileInput {
  /** merge 後 + guard 補正後の events (canonical truth) */
  effectiveEvents: Event[];
  /**
   * Pipeline が生成した GapResolution (currentEvents 基準のまま)。
   * reconcile はこれを **filter** する (再計算しない)。
   * null は comprehension_failed 等で gapResolution が無いケース。
   */
  priorGapResolution: GapResolution | null;
  /** 前 turn の pendingClarify (fallback 候補) */
  priorPendingClarify: PendingClarify | null;
  /** 前 turn の dialogState (focus を再評価する基準) */
  priorDialogState: DialogState | null;
  /**
   * 元の phase (comprehension_failed 等の特殊 phase を preserve するため)。
   * "plan_presented" / "clarifying" 以外なら reconcile は phase を変更しない。
   */
  originalPhase: MorningPhase;
  /**
   * 当 turn の comprehension が成功したか。
   *
   * false の場合 (comprehension_failed):
   *   - effectiveEvents は priorPersistedEvents から再構築されたもの
   *   - これらが fully fixed でも、当 turn では何が起きたか不明 (provider throw 等)
   *   - phase=plan_presented に楽観的に上げると「prior plan を提示」になる
   *   - 既存契約: provider 失敗時は plan を維持するが phase=clarifying のまま
   *
   * true の場合: 通常の reconcile (events fully resolved で plan_presented に昇格可)
   */
  comprehensionOk: boolean;
}

export interface ReconcileResult {
  /** filter 後の GapResolution (target slot fixed なら primary_clarify=null) */
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
   *   - primaryClarifyDropped: 元の primary_clarify が stale 判定で drop されたか
   */
  reconciled: {
    phaseChanged: boolean;
    pendingClarifyChanged: boolean;
    focusCleared: boolean;
    eventsFullyFixed: boolean;
    primaryClarifyDropped: boolean;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全 events の blocking slot が解消されているか
 * (= 「plan_presented に昇格可能な状態」)。
 *
 * 設計判断:
 *   `hasBlockingUnresolvedSlots` の inverse を使う。これは既存 `decidePhase` と
 *   同じ judgment criterion なので、上位レイヤと不整合を起こさない。
 *
 *   - whenSh != fixed → blocking
 *   - whereSh ∈ {missing, vague} → blocking
 *   - whatSh == missing → blocking (whatSh=vague は non-blocking、UI 表示で「内容暫定」)
 *
 *   pure な sharpness のみで判断。missing_semantic_critical は consult しない
 *   (provenance checker artifact で sharpness と意味的に重複)。
 */
export function areEventsFullyFixed(events: Event[]): boolean {
  if (events.length === 0) return false; // events 空は plan 不能 (separate concern)
  return !hasBlockingUnresolvedSlots(events);
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
 * primary_clarify (or pendingClarify) が指す target slot が effectiveEvents 上で
 * 既に fixed になっているか判定する。fixed なら「stale」 として drop 対象。
 *
 * 例: PR #41a 観測 bug
 *   - currentEvents で when=null だったので primary_clarify=specific_time が立った
 *   - guard 補正で effectiveEvents の when=10:00 (fixed)
 *   - primary_clarify は effectiveEvents 基準で stale → drop すべき
 *
 * event_id 解決 (CEO 2026-04-28):
 *   1. clarify.event_id と一致する event を探す
 *   2. 見つからない (mergeEventFields で event_id が remap された等) かつ
 *      effectiveEvents.length === 1 なら、その単一 event を target とする
 *      (CEO bug case の本流: guard 補正後 1 event の merge で id が変わるケース)
 *   3. それ以外は判定不能 → false (drop しない、保守側)
 *
 * 戻り値:
 *   true  → stale (target slot fixed で drop すべき)
 *   false → 依然 valid (target slot 未 fixed) or 判定不能 (event 不在等)
 */
export function isClarifyStaleForEvents(
  clarify: { event_id: string; target_slot?: string | null; slot?: string | null },
  events: Event[],
): boolean {
  // event_id 一致経路
  let ev = events.find((e) => e.event_id === clarify.event_id);
  // 一致しない場合の fallback: 単一 event なら remap と推定
  if (!ev && events.length === 1) {
    ev = events[0];
  }
  if (!ev) return false; // 対象 event 不在 / 複数 event で id 不一致 → 判定保留
  // target_slot (ClarifyRequest) と slot (PendingClarify) どちらかが入る
  const slot = clarify.target_slot ?? clarify.slot ?? null;
  if (!slot) return false;

  if (slot === "when") return computeWhenSharpness(ev.when) === "fixed";
  if (slot === "where") return computeWhereSharpness(ev.where) === "fixed";
  if (slot === "what") return computeWhatSharpness(ev.what) === "fixed";
  // transport / endpoint / target_ref / who / how 等は本 reconcile の対象外。
  // sharpness 概念が直接対応しないので「stale ではない」 として preserve。
  return false;
}

/**
 * GapResolution の primary_clarify を effectiveEvents 基準で filter する。
 *
 * 規則:
 *   - 元 primary_clarify が null → そのまま null
 *   - 元 primary_clarify の target slot が effectiveEvents で fixed → null に drop
 *   - それ以外 → そのまま preserve
 *
 * actions[] は filter しない (trace 用なので原状保持)。
 */
export function filterStalePrimaryClarify(
  resolution: GapResolution,
  events: Event[],
): { resolution: GapResolution; primaryDropped: boolean } {
  const primary: ClarifyRequest | null = resolution.primary_clarify ?? null;
  if (!primary) return { resolution, primaryDropped: false };

  if (isClarifyStaleForEvents(primary, events)) {
    return {
      resolution: { ...resolution, primary_clarify: null },
      primaryDropped: true,
    };
  }
  return { resolution, primaryDropped: false };
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
 *   1. filteredPrimary がある → buildPendingClarifyFromResolution で構築
 *   2. filteredPrimary == null AND eventsFullyFixed === true → null (CEO condition 2,3)
 *   3. filteredPrimary == null AND eventsFullyFixed === false AND priorPendingClarify あり
 *      → priorPendingClarify (comprehension_failed 救済 fallback、limited)
 *      ただし prior の target slot が fixed なら drop (CEO condition 3 stale 防止)
 *   4. それ以外 → null
 */
export function reconcilePendingClarify(input: {
  filteredPrimary: ClarifyRequest | null;
  effectiveEvents: Event[];
  priorPendingClarify: PendingClarify | null;
}): PendingClarify | null {
  const { filteredPrimary, effectiveEvents, priorPendingClarify } = input;
  const eventsFullyFixed = areEventsFullyFixed(effectiveEvents);

  if (filteredPrimary) {
    return buildPendingClarifyFromResolution(
      filteredPrimary,
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
  // → prior fallback で救済、ただし stale (target slot fixed) なら drop
  if (priorPendingClarify) {
    if (isClarifyStaleForEvents(priorPendingClarify, effectiveEvents)) {
      return null; // CEO condition 3: stale prior は drop
    }
    return priorPendingClarify;
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API — reconcileGapStateFromEffectiveEvents
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 3-layer reconcile を 1 関数で実行する pure entry point。
 *
 * Layer 1: priorGapResolution の primary_clarify を effectiveEvents で filter
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
    priorGapResolution,
    priorPendingClarify,
    priorDialogState,
    originalPhase,
    comprehensionOk,
  } = input;

  const eventsFullyFixed = areEventsFullyFixed(effectiveEvents);

  // ── Layer 1: GapResolution filter (primary_clarify が stale なら drop) ──
  const baseResolution: GapResolution =
    priorGapResolution ?? { actions: [], primary_clarify: null };
  const { resolution: reconciledGapResolution, primaryDropped } =
    filterStalePrimaryClarify(baseResolution, effectiveEvents);

  // ── Layer 2: pendingClarify rebuild ──
  const reconciledPendingClarify = reconcilePendingClarify({
    filteredPrimary: reconciledGapResolution.primary_clarify,
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
  } else if (!comprehensionOk) {
    // comprehension 失敗時は楽観的に plan_presented に上げない (既存契約)
    reconciledPhase = originalPhase;
  } else if (reconciledPendingClarify != null) {
    reconciledPhase = "clarifying";
  } else if (eventsFullyFixed) {
    // CEO condition 6: 未解決 slot が無ければ plan_presented に進む
    reconciledPhase = "plan_presented";
  } else {
    // events に未解決 (blocking) slot あり、しかし pendingClarify は build できなかった
    // 既存契約 (W3-PR-8 hasBlockingUnresolvedSlots): blocking が残れば clarifying 維持。
    // ここで plan_presented にすると blocking 状態で plan を出すことになり契約違反。
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
      primaryClarifyDropped: primaryDropped,
    },
  };
}
