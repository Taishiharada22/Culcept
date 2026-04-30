/**
 * CoAlter Stage 4 L4-j — Telemetry Emitter
 *
 * 正本: layout plan v0.3 §7.10 / §0.1
 *
 * 8 計測項目 (telemetryEvents.ts) を emit する関数群。
 *
 * 不可侵:
 *   - flag presenceExecutorEnabled OFF で emit ゼロ (production 影響ゼロ)
 *   - 計測失敗で本体 UI が止まらない (fail-open、try/catch で握り潰し)
 *   - payload schema 固定 (後方互換維持、新フィールドは本書 rev で追加)
 *
 * 注入経路:
 *   - default: console + memory queue (preview / dev 用)
 *   - L4-l flip 時に PostHog / 自前 analytics endpoint 経由に置換可能 (setSink で DI)
 */

import { COALTER_FLAGS } from "@/lib/coalter/flags";
import type {
  TelemetryEvent,
  PresenceStateTransitionEvent,
  PatternUsedEvent,
  ConsentEvent,
  LegacyFallbackEvent,
  ModeTransitionEvent,
  RejectionEvent,
  UrgentTriggerEvent,
  RateLimitBlockedEvent,
} from "./telemetryEvents";

// ─────────────────────────────────────────────
// Sink (DI: 実 production では PostHog / 自前 analytics に置換)
// ─────────────────────────────────────────────

export type TelemetrySink = (event: TelemetryEvent) => void;

const memoryQueue: TelemetryEvent[] = [];
const MEMORY_QUEUE_LIMIT = 1000;

/** default sink: in-memory queue (preview / debug 用) */
const defaultSink: TelemetrySink = (event) => {
  memoryQueue.push(event);
  if (memoryQueue.length > MEMORY_QUEUE_LIMIT) {
    memoryQueue.splice(0, memoryQueue.length - MEMORY_QUEUE_LIMIT);
  }
};

let activeSink: TelemetrySink = defaultSink;

/** sink を差し替え (L4-l flip 時に PostHog / 自前 analytics に切替) */
export function setTelemetrySink(sink: TelemetrySink | null): void {
  activeSink = sink ?? defaultSink;
}

/** test reset 用 (production logic では使わない) */
export function __resetTelemetryQueue(): void {
  memoryQueue.length = 0;
}

/** 直近 emit された event 取得 (test / debug) */
export function getRecentTelemetry(): ReadonlyArray<TelemetryEvent> {
  return [...memoryQueue];
}

// ─────────────────────────────────────────────
// Emit (8 helper、fail-open)
// ─────────────────────────────────────────────

/**
 * 共通 emit (flag check + try/catch fail-open)。
 */
function safeEmit(event: TelemetryEvent): void {
  if (!COALTER_FLAGS.presenceExecutorEnabled) {
    // flag OFF: emit ゼロ (production 影響ゼロ)
    return;
  }
  try {
    activeSink(event);
  } catch {
    // 計測失敗で本体を止めない (fail-open)
  }
}

export function emitPresenceStateTransition(
  payload: Omit<PresenceStateTransitionEvent, "type">,
): void {
  safeEmit({ type: "coalter.presence.state_transition", ...payload });
}

export function emitPatternUsed(payload: Omit<PatternUsedEvent, "type">): void {
  safeEmit({ type: "coalter.pattern.used", ...payload });
}

export function emitConsent(payload: Omit<ConsentEvent, "type">): void {
  safeEmit({ type: "coalter.consent.event", ...payload });
}

export function emitLegacyFallback(
  payload: Omit<LegacyFallbackEvent, "type">,
): void {
  safeEmit({ type: "coalter.legacy.fallback", ...payload });
}

export function emitModeTransition(
  payload: Omit<ModeTransitionEvent, "type">,
): void {
  safeEmit({ type: "coalter.mode.transition", ...payload });
}

export function emitRejection(payload: Omit<RejectionEvent, "type">): void {
  safeEmit({ type: "coalter.rejection.recorded", ...payload });
}

export function emitUrgentTriggered(
  payload: Omit<UrgentTriggerEvent, "type">,
): void {
  safeEmit({ type: "coalter.urgent.triggered", ...payload });
}

export function emitRateLimitBlocked(
  payload: Omit<RateLimitBlockedEvent, "type">,
): void {
  safeEmit({ type: "coalter.ratelimit.blocked", ...payload });
}
