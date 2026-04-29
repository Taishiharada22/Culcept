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

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

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
import type {
  ExecutorAvailability,
  PatternVariant,
  PresenceMode,
  PresenceSignal,
  PresenceState,
} from "@/lib/coalter/presence/types";

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

  const dispatchModeEvent = useCallback((event: ModeEvent) => {
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
