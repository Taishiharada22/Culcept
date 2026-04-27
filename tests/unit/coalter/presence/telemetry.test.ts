/**
 * Stage 4 L4-j — Telemetry test
 *
 * plan v0.3 §7.10 Gate:
 *   - 8 項目すべてが presence state 動作中に emit される
 *   - 計測失敗で本体 UI が止まらない (fail-open)
 *   - payload schema が固定 (後方互換維持)
 *   - flag OFF で emit ゼロ
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  emitPresenceStateTransition,
  emitPatternUsed,
  emitConsent,
  emitLegacyFallback,
  emitModeTransition,
  emitRejection,
  emitUrgentTriggered,
  emitRateLimitBlocked,
  setTelemetrySink,
  getRecentTelemetry,
  __resetTelemetryQueue,
  type TelemetrySink,
} from "@/lib/coalter/presence/telemetry";
import { TELEMETRY_EVENT_TYPES } from "@/lib/coalter/presence/telemetryEvents";

const ENV_KEY = "COALTER_PRESENCE_EXECUTOR";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  __resetTelemetryQueue();
  setTelemetrySink(null);
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
  setTelemetrySink(null);
});

describe("L4-j flag OFF (既定): emit ゼロ (production 影響ゼロ)", () => {
  it("flag OFF で 8 emitter すべて emit ゼロ", () => {
    delete process.env[ENV_KEY];
    emitPresenceStateTransition({
      pairId: "p1",
      from: "S0",
      to: "S1",
      trigger: "explicit",
      ts: 0,
    });
    emitPatternUsed({
      pairId: "p1",
      variant: "A",
      state: "S2",
      mode: "normal",
      hasSecondary: false,
      ts: 0,
    });
    emitConsent({
      pairId: "p1",
      fromAvailability: "inactive",
      toAvailability: "pending_consent",
      eventKind: "request_consent",
      ts: 0,
    });
    emitLegacyFallback({
      pairId: "p1",
      legacyAutoInsertFired: true,
      dispatcherUsed: false,
      ts: 0,
    });
    emitModeTransition({
      pairId: "p1",
      from: "normal",
      to: "daily",
      trigger: "manual_switch",
      ts: 0,
    });
    emitRejection({
      pairId: "p1",
      category: "individual_proposal",
      theme: "food",
      ts: 0,
    });
    emitUrgentTriggered({
      pairId: "p1",
      category: "heat_escalation",
      form: "overlay_banner",
      memoryFallback: "demote",
      ts: 0,
    });
    emitRateLimitBlocked({
      pairId: "p1",
      state: "S5",
      variant: "B",
      violation: "concurrent_active_utterance",
      ts: 0,
    });
    expect(getRecentTelemetry()).toHaveLength(0);
  });
});

describe("L4-j flag ON: 8 項目すべて emit", () => {
  it("flag ON で 8 emit すべてが queue に記録 (8 種すべて)", () => {
    process.env[ENV_KEY] = "true";
    emitPresenceStateTransition({
      pairId: "p1",
      from: "S0",
      to: "S1",
      trigger: "implicit",
      ts: 1,
    });
    emitPatternUsed({
      pairId: "p1",
      variant: "A",
      state: "S2",
      mode: "normal",
      hasSecondary: false,
      ts: 2,
    });
    emitConsent({
      pairId: "p1",
      fromAvailability: "inactive",
      toAvailability: "pending_consent",
      eventKind: "request_consent",
      ts: 3,
    });
    emitLegacyFallback({
      pairId: "p1",
      legacyAutoInsertFired: false,
      dispatcherUsed: true,
      ts: 4,
    });
    emitModeTransition({
      pairId: "p1",
      from: "normal",
      to: "daily",
      trigger: "auto_escalate",
      ts: 5,
    });
    emitRejection({
      pairId: "p1",
      category: "coalter_retreat",
      ts: 6,
    });
    emitUrgentTriggered({
      pairId: "p1",
      category: "rupture_detected",
      form: "dominant_card",
      memoryFallback: "compact",
      ts: 7,
    });
    emitRateLimitBlocked({
      pairId: "p1",
      state: "S2",
      variant: "A",
      violation: "line_length_violation",
      ts: 8,
    });
    const events = getRecentTelemetry();
    expect(events).toHaveLength(8);
    expect(events.map((e) => e.type).sort()).toEqual([...TELEMETRY_EVENT_TYPES].sort());
  });
});

describe("L4-j fail-open — sink 例外で本体止まらず", () => {
  it("sink throw でも emit 関数は完了 (fail-open、try/catch で握り潰し)", () => {
    process.env[ENV_KEY] = "true";
    setTelemetrySink(() => {
      throw new Error("sink failure");
    });
    expect(() =>
      emitPresenceStateTransition({
        pairId: "p1",
        from: "S0",
        to: "S1",
        trigger: "implicit",
        ts: 0,
      }),
    ).not.toThrow();
  });
});

describe("L4-j payload schema 固定 (後方互換維持)", () => {
  it("TELEMETRY_EVENT_TYPES は 8 種固定", () => {
    expect(TELEMETRY_EVENT_TYPES).toHaveLength(8);
    expect([...TELEMETRY_EVENT_TYPES].sort()).toEqual(
      [
        "coalter.consent.event",
        "coalter.legacy.fallback",
        "coalter.mode.transition",
        "coalter.pattern.used",
        "coalter.presence.state_transition",
        "coalter.ratelimit.blocked",
        "coalter.rejection.recorded",
        "coalter.urgent.triggered",
      ].sort(),
    );
  });

  it("各 event は type / pairId / ts 必須 (共通 schema)", () => {
    process.env[ENV_KEY] = "true";
    emitPresenceStateTransition({
      pairId: "p1",
      from: "S0",
      to: "S1",
      trigger: "implicit",
      ts: 100,
    });
    const e = getRecentTelemetry()[0];
    expect(e.type).toBe("coalter.presence.state_transition");
    expect("pairId" in e ? e.pairId : null).toBe("p1");
    expect("ts" in e ? e.ts : null).toBe(100);
  });
});

describe("L4-j sink DI — setTelemetrySink で差替え", () => {
  it("カスタム sink に切替で event がそちらへ流れる", () => {
    process.env[ENV_KEY] = "true";
    const captured: unknown[] = [];
    const sink: TelemetrySink = (e) => captured.push(e);
    setTelemetrySink(sink);
    emitPresenceStateTransition({
      pairId: "p1",
      from: "S0",
      to: "S1",
      trigger: "explicit",
      ts: 0,
    });
    expect(captured).toHaveLength(1);
    // default sink (memoryQueue) には流れない
    expect(getRecentTelemetry()).toHaveLength(0);
  });

  it("setTelemetrySink(null) で default sink (memory queue) に戻る", () => {
    process.env[ENV_KEY] = "true";
    setTelemetrySink(() => {});
    setTelemetrySink(null);
    emitPatternUsed({
      pairId: "p1",
      variant: "A",
      state: "S2",
      mode: "normal",
      hasSecondary: false,
      ts: 0,
    });
    expect(getRecentTelemetry()).toHaveLength(1);
  });
});
