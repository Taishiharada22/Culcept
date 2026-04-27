"use client";

/**
 * Stage 3 L3-a — Presence Executor Hook
 *
 * 正本: layout plan v0.3 §6.1
 *
 * Stage 2 で実装した reducer / signal adapter / pattern selector / mode reducer /
 * memory store / rejection reducer / urgent trigger / rate limit guard を preview
 * 内で駆動する hook。
 *
 * 本 hook は preview 専用 (presenceExecutorEnabled flag OFF 経路、本番未接続)。
 * Stage 4 で本番マウント時は別経路 (UpperLayerMount) で同じ Stage 2 module を使う。
 */

import { useCallback, useMemo, useReducer, useState } from "react";

import {
  presenceReducer,
  initialPresenceState,
  type PresenceEvent,
  type PresenceReducerState,
} from "@/lib/coalter/presence/reducer";
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
  const fireExplicit = useCallback(
    (source: "free_text" | "mention" | "chip_tap" | "button_tap", at = Date.now()) => {
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
    (target: "daily" | "travel", source: "free_text" | "mode_tap" | "auto_escalation", at = Date.now()) => {
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
    () => selectSecondaryPattern(presence.state, mode, primaryPattern, patternContext),
    [presence.state, mode, primaryPattern, patternContext],
  );

  // Cooldown resolver helper
  const resolveCurrent = useCallback(
    (input: Omit<ResolveInput, "availability" | "activeCooldowns">): ResolveResult => {
      return resolveCooldown({
        ...input,
        availability,
        activeCooldowns: flattenCooldowns(rejectionState),
      });
    },
    [availability, rejectionState],
  );

  // Urgent decision (presence 状態 + cooldown 状態 baseline)
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
    (variant: PatternVariant, body: string): { accepted: boolean; reason: string } => {
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
