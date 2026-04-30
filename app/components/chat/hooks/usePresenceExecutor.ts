"use client";

/**
 * Stage 4 L4-b/B-1 — Presence Executor Hook (本番版)
 *
 * 正本: layout plan v0.3 §6.1 / §7.1
 *
 * preview `app/(dev)/coalter-preview/full/hooks/usePresenceExecutor.ts` を本番
 * location に移植。Stage 2 で実装した reducer / signal adapter / pattern selector
 * / mode reducer / memory store / rejection reducer / urgent trigger / rate limit
 * guard を本番 ChatClient (UpperLayerMount) で駆動する。
 *
 * 不変原則:
 *   - 全 reducer は `lib/coalter/presence/` 配下の Stage 2 module を import
 *     (preview と本番で同じ core logic を共有、コピーしない)
 *   - "use client" directive で client-only (useReducer / useState 利用)
 *   - signal subscribe (productionSignalBus) は B-2 (signal detection) で接続。
 *     B-1 では signal が来ない前提 → state は S0 / mode は normal のまま、
 *     ModeSwitcher 経由の MANUAL_SWITCH のみで mode が変化する
 *   - SSR 安全: 関数として import 可、render 時のみ hook を呼ぶ
 *
 * B-1 で effective なもの:
 *   - presenceReducer (initial: S0、signal なしで S0 固定)
 *   - modeReducer (initial: normal、ModeSwitcher click で MANUAL_SWITCH dispatch)
 *
 * B-1 で initialize するが activate しないもの (B-2/B-3 で接続):
 *   - rejectionReducer / utteranceQueue / memoryStore / urgentTrigger
 *   - signal subscribe 経路 (productionSignalBus)
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import {
  presenceReducer,
  initialPresenceState,
  type PresenceEvent,
  type PresenceReducerState,
} from "@/lib/coalter/presence/reducer";
import { subscribePresenceSignal } from "@/lib/coalter/presence/productionSignalBus";
import {
  modeReducer,
  initialMode,
  type ModeEvent,
} from "@/lib/coalter/presence/modeReducer";
import {
  selectPattern,
  selectSecondaryPattern,
  type PatternContext,
} from "@/lib/coalter/presence/patternSelector";
import {
  rejectionReducer,
  initialRejectionState,
  flattenCooldowns,
  type RejectionEvent,
  type RejectionState,
} from "@/lib/coalter/presence/rejectionReducer";
import {
  resolveCooldown,
  type ResolveResult,
  type ResolveInput,
} from "@/lib/coalter/presence/cooldownResolver";
import {
  detectUrgent,
  type UrgentDecision,
  type UrgentTriggerInput,
} from "@/lib/coalter/presence/urgentTrigger";
import {
  emptyMemoryStore,
  type MemoryStore,
} from "@/lib/coalter/presence/memoryStore";
import {
  emptyUtteranceQueue,
  enqueueUtterance,
  dequeueUtterance,
  type Utterance,
  type UtteranceQueueState,
} from "@/lib/coalter/presence/utteranceQueue";
import {
  guardUtterance,
  type GuardResult,
} from "@/lib/coalter/presence/rateLimitGuard";
import {
  adaptCritical,
  adaptExplicit,
  adaptImplicit,
  adaptManualRestart,
  adaptModePromotion,
} from "@/lib/coalter/presence/signalAdapter";
import {
  emitPresenceStateTransition,
  emitPatternUsed,
  emitModeTransition,
  emitUrgentTriggered,
} from "@/lib/coalter/presence/telemetry";
import type {
  ExecutorAvailability,
  PatternVariant,
  PresenceMode,
  PresenceSignal,
  PresenceState,
} from "@/lib/coalter/presence/types";
import type { ModeTransitionEvent } from "@/lib/coalter/presence/telemetryEvents";

export interface PresenceExecutorState {
  presence: PresenceReducerState;
  mode: PresenceMode;
  availability: ExecutorAvailability;
  memoryStore: MemoryStore;
  rejectionState: RejectionState;
  utteranceQueue: UtteranceQueueState;
  /** 直近 signal log (debug 用、最新 N 件) */
  recentSignals: ReadonlyArray<PresenceSignal>;
}

export interface PresenceExecutorComputed {
  primaryPattern: PatternVariant | null;
  secondaryPattern: PatternVariant | null;
  cooldownDecision: ResolveResult | null;
  urgentDecision: UrgentDecision | null;
}

const SIGNAL_LOG_LIMIT = 20;

/**
 * L4-j Phase 1 (Plan D、CEO 確定 2026-04-30):
 *
 * ModeEvent → telemetry trigger 名 mapping (mode_transition emit 用)。
 * 純関数、test 容易性のため export。
 *
 * "manual_switch" | "auto_escalate" | "plan_complete" | "manual_return" の 4 値。
 */
export function modeEventToTransitionTrigger(
  eventType: ModeEvent["type"],
): ModeTransitionEvent["trigger"] {
  switch (eventType) {
    case "MANUAL_SWITCH":
      return "manual_switch";
    case "AUTO_ESCALATE":
      return "auto_escalate";
    case "PLAN_COMPLETE":
      return "plan_complete";
    case "MANUAL_RETURN":
      return "manual_return";
  }
}

/**
 * L4-j Phase 1 (Plan D): UrgentDecision の dedupe key 生成。
 *
 * category + form + memoryFallback の 3 軸で key 化。同 decision の重複 emit を
 * 防ぐ (毎 render emit を抑止)。
 *
 * 純関数、test 容易性のため export。
 */
export function buildUrgentDedupeKey(decision: {
  category: string;
  form: string;
  memoryFallback: string;
}): string {
  return `${decision.category}:${decision.form}:${decision.memoryFallback}`;
}

/**
 * 本番 Presence Executor hook。
 *
 * thread scope: 本 hook を呼ぶ component (UpperLayerMount) は ChatClient の
 * 子として thread page lifetime で mount される。useReducer の state は thread
 * page 単位で独立、page 遷移で reset (persistence なし、これが「thread scope」
 * の意味、CEO 確定 2026-04-29)。
 *
 * @param initial 任意 initial 値:
 *   - availability: 既定 "active" (B-1 では availability state を扱わない)
 *   - patternContext: 既定 {} (B-2 以降で signal 連携時に拡張)
 */
export function usePresenceExecutor(initial?: {
  availability?: ExecutorAvailability;
  patternContext?: PatternContext;
  /**
   * L4-j Phase 1 (CEO 確定 2026-04-30): telemetry payload pairId。
   * 既に安全に存在する識別子のみ使用 (telemetry のための fetch 追加禁止)。
   * 渡されない場合は空文字 "" で emit (CEO 「pairId なければ省略または null」)。
   */
  pairId?: string | null;
}) {
  const [presence, dispatchPresence] = useReducer(
    presenceReducer,
    initialPresenceState(),
  );
  const [mode, dispatchModeRaw] = useReducer(modeReducer, initialMode());
  const [availability, setAvailability] = useState<ExecutorAvailability>(
    initial?.availability ?? "active",
  );
  const [memoryStore, setMemoryStore] = useState<MemoryStore>(emptyMemoryStore());
  const [rejectionState, dispatchRejectionRaw] = useReducer(
    rejectionReducer,
    initialRejectionState(),
  );
  const [utteranceQueue, setUtteranceQueue] = useState<UtteranceQueueState>(
    emptyUtteranceQueue(),
  );
  const [recentSignals, setRecentSignals] = useState<PresenceSignal[]>([]);
  const [patternContext, setPatternContext] = useState<PatternContext>(
    initial?.patternContext ?? {},
  );

  // ─────────────────────────────────────────────
  // L4-j Phase 1 (Plan D、CEO 確定 2026-04-30):
  // Production reachable 4 event の telemetry emit 用 refs + pairId。
  //
  // payload 制約 (CEO 厳守):
  //   - 会話本文 / ユーザー入力文 / 個人情報を含めない
  //   - pairId は initial.pairId のみ使用、未提供で "" (telemetry のための fetch
  //     追加禁止)
  //   - state / mode / pattern variant 等の構造化 enum のみ送信
  //
  // 範囲: ① state_transition / ② pattern_used / ⑤ mode_transition / ⑦ urgent_triggered
  // 不採用 4 event (別 phase): consent / legacy_fallback / rejection / ratelimit_blocked
  // ─────────────────────────────────────────────

  const telemetryPairId = initial?.pairId ?? "";

  /** 重複 emit 防止: 直近 emit した state/pattern/mode/urgent key を保持 */
  const lastEmittedStateRef = useRef<PresenceState | null>(null);
  const lastEmittedPatternRef = useRef<PatternVariant | null>(null);
  const lastEmittedModeRef = useRef<PresenceMode | null>(null);
  const lastEmittedUrgentKeyRef = useRef<string | null>(null);
  /** state_transition の trigger は最新 signal kind を使う (closure stale 回避) */
  const recentSignalsRef = useRef<ReadonlyArray<PresenceSignal>>(recentSignals);
  useEffect(() => {
    recentSignalsRef.current = recentSignals;
  }, [recentSignals]);

  const logSignal = useCallback((signal: PresenceSignal) => {
    setRecentSignals((prev) => {
      const next = [...prev, signal];
      return next.length > SIGNAL_LOG_LIMIT
        ? next.slice(-SIGNAL_LOG_LIMIT)
        : next;
    });
  }, []);

  const dispatchSignal = useCallback(
    (signal: PresenceSignal) => {
      logSignal(signal);
      dispatchPresence({ type: "SIGNAL", signal });
    },
    [logSignal],
  );

  /**
   * B-2.1 (2026-04-29): productionSignalBus への subscribe。
   *
   * `PresenceSignalWiring` (ChatClient で既に mount 済) が publish する signal を
   * 本 hook の reducer に流す経路。これにより以下の chain が確立する:
   *
   *   ChatClient messages → PresenceSignalWiring useEffect → publishPresenceSignal
   *     → bus → 本 useEffect → dispatchSignal → presenceReducer (SIGNAL event)
   *
   * unmount で unsubscribe (return された関数を React が呼ぶ)。
   * dispatchSignal は useCallback で memoize されているため effect 再実行は最小限。
   */
  useEffect(() => {
    return subscribePresenceSignal(dispatchSignal);
  }, [dispatchSignal]);

  const dispatchPresenceEvent = useCallback((event: PresenceEvent) => {
    dispatchPresence(event);
  }, []);

  /**
   * L4-j Phase 1 (CEO 確定 2026-04-30): mode_transition emit のため、
   * 直近 dispatch された ModeEvent type を ref に記録。trigger 値の解決に使う
   * (mode 変化を観察する useEffect は ModeEvent type 直接アクセス不可のため)。
   */
  const lastModeEventTypeRef = useRef<ModeEvent["type"] | null>(null);

  const dispatchModeEvent = useCallback((event: ModeEvent) => {
    lastModeEventTypeRef.current = event.type;
    dispatchModeRaw(event);
  }, []);

  const dispatchRejection = useCallback((event: RejectionEvent) => {
    dispatchRejectionRaw(event);
  }, []);

  // Adapter 経由 signal 投入 (signalAdapter L2-b)
  // B-1 では呼び出し側 (ChatClient) からの signal emit 経路がないため、
  // 本 fire.* helpers は B-2 で接続される
  const fireExplicit = useCallback(
    (
      source: "free_text" | "mention" | "chip_tap" | "button_tap",
      at = Date.now(),
    ) => {
      dispatchSignal(adaptExplicit({ source, detectedAt: at }));
    },
    [dispatchSignal],
  );

  const fireImplicit = useCallback(
    (softScore: number, at = Date.now()) => {
      dispatchSignal(adaptImplicit({ softScore, detectedAt: at }));
    },
    [dispatchSignal],
  );

  const fireCritical = useCallback(
    (trigger: string, at = Date.now()) => {
      dispatchSignal(adaptCritical({ trigger, detectedAt: at }));
    },
    [dispatchSignal],
  );

  const fireModePromotion = useCallback(
    (
      target: "daily" | "travel",
      source: "free_text" | "mode_tap" | "auto_escalation",
      at = Date.now(),
    ) => {
      dispatchSignal(adaptModePromotion({ target, source, detectedAt: at }));
    },
    [dispatchSignal],
  );

  const fireManualRestart = useCallback(
    (source: "mention" | "button_tap", at = Date.now()) => {
      dispatchSignal(adaptManualRestart({ source, detectedAt: at }));
    },
    [dispatchSignal],
  );

  // Computed values
  const primaryPattern = useMemo<PatternVariant | null>(
    () => selectPattern(presence.state, mode, patternContext),
    [presence.state, mode, patternContext],
  );

  const secondaryPattern = useMemo<PatternVariant | null>(
    () =>
      selectSecondaryPattern(
        presence.state,
        mode,
        primaryPattern,
        patternContext,
      ),
    [presence.state, mode, primaryPattern, patternContext],
  );

  // ② pattern_used: primaryPattern 変化時 (前値比較で重複防止、毎 render emit を抑止)
  useEffect(() => {
    const current = primaryPattern;
    const last = lastEmittedPatternRef.current;
    // null → null や 同 variant → 同 variant では emit しない
    if (current !== null && current !== last) {
      emitPatternUsed({
        pairId: telemetryPairId,
        variant: current,
        state: presence.state,
        mode,
        hasSecondary: secondaryPattern !== null,
        ts: Date.now(),
      });
    }
    lastEmittedPatternRef.current = current;
  }, [
    primaryPattern,
    presence.state,
    mode,
    secondaryPattern,
    telemetryPairId,
  ]);

  // Cooldown resolver helper
  const resolveCurrent = useCallback(
    (
      input: Omit<ResolveInput, "availability" | "activeCooldowns">,
    ): ResolveResult => {
      return resolveCooldown({
        ...input,
        availability,
        activeCooldowns: flattenCooldowns(rejectionState),
      });
    },
    [availability, rejectionState],
  );

  // Urgent decision (presence 状態 + cooldown 状態 baseline)
  // B-1 では recentSignals が常に空のため null を返す。B-2 で signal 経路接続後 effective
  const urgentDecision = useMemo<UrgentDecision | null>(() => {
    const lastSignal = recentSignals[recentSignals.length - 1];
    if (!lastSignal) return null;
    const input: UrgentTriggerInput = {
      signal: lastSignal,
      presenceState: presence.state,
      dignityActive: rejectionState.coalterRetreat.length > 0, // 暫定 mapping
      ruptureActive: false,
    };
    return detectUrgent(input);
  }, [recentSignals, presence.state, rejectionState]);

  // ⑦ urgent_triggered: urgentDecision 変化時 (dedupe key で重複防止)
  useEffect(() => {
    if (urgentDecision === null) {
      // null 復帰時に dedupe key を reset (次の non-null で再 emit するため)
      lastEmittedUrgentKeyRef.current = null;
      return;
    }
    const key = buildUrgentDedupeKey(urgentDecision);
    const last = lastEmittedUrgentKeyRef.current;
    if (last !== key) {
      emitUrgentTriggered({
        pairId: telemetryPairId,
        category: urgentDecision.category,
        form: urgentDecision.form,
        memoryFallback: urgentDecision.memoryFallback,
        ts: Date.now(),
      });
      lastEmittedUrgentKeyRef.current = key;
    }
  }, [urgentDecision, telemetryPairId]);

  // ① state_transition: presence.state 変化時 (前値比較で重複防止)
  useEffect(() => {
    const current = presence.state;
    const last = lastEmittedStateRef.current;
    if (last !== null && last !== current) {
      const lastSignal =
        recentSignalsRef.current[recentSignalsRef.current.length - 1];
      emitPresenceStateTransition({
        pairId: telemetryPairId,
        from: last,
        to: current,
        // signal 経由なら kind、無ければ explicit_event (UI tap / event dispatch 想定)
        trigger: lastSignal?.kind ?? "explicit_event",
        ts: Date.now(),
      });
    }
    lastEmittedStateRef.current = current;
  }, [presence.state, telemetryPairId]);

  // ⑤ mode_transition: mode 変化時 (lastModeEventTypeRef で trigger 解決)
  useEffect(() => {
    const current = mode;
    const last = lastEmittedModeRef.current;
    if (last !== null && last !== current) {
      const eventType = lastModeEventTypeRef.current;
      const trigger: ModeTransitionEvent["trigger"] =
        eventType !== null
          ? modeEventToTransitionTrigger(eventType)
          : "manual_switch";
      emitModeTransition({
        pairId: telemetryPairId,
        from: last,
        to: current,
        trigger,
        ts: Date.now(),
      });
    }
    lastEmittedModeRef.current = current;
  }, [mode, telemetryPairId]);

  // Utterance queue helper
  const tryEnqueueUtterance = useCallback(
    (
      variant: PatternVariant,
      body: string,
    ): { accepted: boolean; reason: string } => {
      const guard = guardUtterance({
        candidate: { variant, state: presence.state, body },
        queueState: utteranceQueue,
      });
      if (!guard.allowed) {
        return { accepted: false, reason: guard.reason };
      }
      const utterance: Utterance = {
        id: `u-${Date.now()}`,
        variant,
        state: presence.state,
        startedAt: Date.now(),
      };
      const result = enqueueUtterance(utteranceQueue, utterance);
      setUtteranceQueue(result.next);
      return { accepted: result.accepted, reason: result.reason };
    },
    [presence.state, utteranceQueue],
  );

  const finishUtterance = useCallback(() => {
    setUtteranceQueue(dequeueUtterance);
  }, []);

  return {
    state: {
      presence,
      mode,
      availability,
      memoryStore,
      rejectionState,
      utteranceQueue,
      recentSignals,
      patternContext,
    } as PresenceExecutorState & { patternContext: PatternContext },
    computed: {
      primaryPattern,
      secondaryPattern,
      urgentDecision,
    } as PresenceExecutorComputed,
    dispatch: {
      signal: dispatchSignal,
      presenceEvent: dispatchPresenceEvent,
      modeEvent: dispatchModeEvent,
      rejection: dispatchRejection,
      setAvailability,
      setMemoryStore,
      setPatternContext,
    },
    fire: {
      explicit: fireExplicit,
      implicit: fireImplicit,
      critical: fireCritical,
      modePromotion: fireModePromotion,
      manualRestart: fireManualRestart,
    },
    utterance: {
      tryEnqueue: tryEnqueueUtterance,
      finish: finishUtterance,
    },
    helpers: {
      resolveCurrent,
    },
  };
}
