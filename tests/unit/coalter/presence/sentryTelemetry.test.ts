/**
 * Stage 4 L4-pre-2 — Sentry telemetry sink test
 *
 * test strategy:
 *   - Sentry SDK の addBreadcrumb をモック
 *   - 8 event 種すべてが正しい category / level / data で送信される
 *   - flag OFF で sink に到達しない (telemetry.safeEmit 経由で gate)
 *   - L4-l flip 後の wireSentryTelemetry が正しく setTelemetrySink を呼ぶ
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Sentry SDK の addBreadcrumb をモック
const addBreadcrumbMock = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: (...args: unknown[]) => addBreadcrumbMock(...args),
}));

import {
  createSentryTelemetrySink,
  wireSentryTelemetry,
  unwireSentryTelemetry,
} from "@/lib/coalter/presence/sentryTelemetry";
import {
  emitPresenceStateTransition,
  emitPatternUsed,
  emitConsent,
  emitLegacyFallback,
  emitModeTransition,
  emitRejection,
  emitUrgentTriggered,
  emitRateLimitBlocked,
  __resetTelemetryQueue,
  setTelemetrySink,
} from "@/lib/coalter/presence/telemetry";

const ENV_KEY = "COALTER_PRESENCE_EXECUTOR";
let originalEnv: string | undefined;

beforeEach(() => {
  addBreadcrumbMock.mockClear();
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

describe("L4-pre-2 createSentryTelemetrySink — sink shape", () => {
  it("function を返す", () => {
    const sink = createSentryTelemetrySink();
    expect(typeof sink).toBe("function");
  });

  it("event 1 件 → Sentry.addBreadcrumb が 1 回呼ばれる", () => {
    const sink = createSentryTelemetrySink();
    sink({
      type: "coalter.presence.state_transition",
      pairId: "p1",
      from: "S0",
      to: "S1",
      trigger: "implicit",
      ts: 1000,
    });
    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
  });
});

describe("L4-pre-2 8 event 種別 → Sentry breadcrumb mapping", () => {
  it("presence.state_transition → category=coalter.presence / level=info", () => {
    createSentryTelemetrySink()({
      type: "coalter.presence.state_transition",
      pairId: "p1",
      from: "S0",
      to: "S1",
      trigger: "explicit",
      ts: 1,
    });
    const arg = addBreadcrumbMock.mock.calls[0][0];
    expect(arg.category).toBe("coalter.presence");
    expect(arg.level).toBe("info");
    expect(arg.message).toBe("coalter.presence.state_transition");
  });

  it("pattern.used → category=coalter.pattern / level=info", () => {
    createSentryTelemetrySink()({
      type: "coalter.pattern.used",
      pairId: "p1",
      variant: "A",
      state: "S2",
      mode: "normal",
      hasSecondary: false,
      ts: 1,
    });
    const arg = addBreadcrumbMock.mock.calls[0][0];
    expect(arg.category).toBe("coalter.pattern");
    expect(arg.level).toBe("info");
  });

  it("consent.event → category=coalter.consent", () => {
    createSentryTelemetrySink()({
      type: "coalter.consent.event",
      pairId: "p1",
      fromAvailability: "inactive",
      toAvailability: "pending_consent",
      eventKind: "request_consent",
      ts: 1,
    });
    expect(addBreadcrumbMock.mock.calls[0][0].category).toBe("coalter.consent");
  });

  it("legacy.fallback → category=coalter.legacy / level=debug", () => {
    createSentryTelemetrySink()({
      type: "coalter.legacy.fallback",
      pairId: "p1",
      legacyAutoInsertFired: true,
      dispatcherUsed: false,
      ts: 1,
    });
    const arg = addBreadcrumbMock.mock.calls[0][0];
    expect(arg.category).toBe("coalter.legacy");
    expect(arg.level).toBe("debug");
  });

  it("mode.transition → category=coalter.mode", () => {
    createSentryTelemetrySink()({
      type: "coalter.mode.transition",
      pairId: "p1",
      from: "normal",
      to: "daily",
      trigger: "manual_switch",
      ts: 1,
    });
    expect(addBreadcrumbMock.mock.calls[0][0].category).toBe("coalter.mode");
  });

  it("rejection.recorded → category=coalter.rejection", () => {
    createSentryTelemetrySink()({
      type: "coalter.rejection.recorded",
      pairId: "p1",
      category: "individual_proposal",
      theme: "food",
      ts: 1,
    });
    expect(addBreadcrumbMock.mock.calls[0][0].category).toBe("coalter.rejection");
  });

  it("urgent.triggered → category=coalter.urgent / level=warning", () => {
    createSentryTelemetrySink()({
      type: "coalter.urgent.triggered",
      pairId: "p1",
      category: "rupture_detected",
      form: "dominant_card",
      memoryFallback: "compact",
      ts: 1,
    });
    const arg = addBreadcrumbMock.mock.calls[0][0];
    expect(arg.category).toBe("coalter.urgent");
    expect(arg.level).toBe("warning");
  });

  it("ratelimit.blocked → category=coalter.ratelimit / level=warning", () => {
    createSentryTelemetrySink()({
      type: "coalter.ratelimit.blocked",
      pairId: "p1",
      state: "S5",
      variant: "B",
      violation: "concurrent_active_utterance",
      ts: 1,
    });
    const arg = addBreadcrumbMock.mock.calls[0][0];
    expect(arg.category).toBe("coalter.ratelimit");
    expect(arg.level).toBe("warning");
  });
});

describe("L4-pre-2 data payload — type 以外のフィールドが data として送信", () => {
  it("data に pairId / state info が含まれる (type は message として別途送信)", () => {
    createSentryTelemetrySink()({
      type: "coalter.pattern.used",
      pairId: "p1",
      variant: "A",
      state: "S2",
      mode: "normal",
      hasSecondary: false,
      ts: 5000,
    });
    const arg = addBreadcrumbMock.mock.calls[0][0];
    expect(arg.data.pairId).toBe("p1");
    expect(arg.data.variant).toBe("A");
    expect(arg.data.state).toBe("S2");
    // type 自体は data に含まれない (message に送信)
    expect(arg.data.type).toBeUndefined();
  });

  it("ts が秒単位で Sentry timestamp に変換される", () => {
    createSentryTelemetrySink()({
      type: "coalter.presence.state_transition",
      pairId: "p1",
      from: "S0",
      to: "S1",
      trigger: "implicit",
      ts: 5000,
    });
    const arg = addBreadcrumbMock.mock.calls[0][0];
    expect(arg.timestamp).toBe(5); // 5000 ms / 1000 = 5 sec
  });
});

describe("L4-pre-2 wireSentryTelemetry — telemetry.ts と統合", () => {
  it("wireSentryTelemetry で setTelemetrySink が Sentry sink を採用", async () => {
    process.env[ENV_KEY] = "true"; // flag ON で emit 経路が起動
    await wireSentryTelemetry();

    emitPresenceStateTransition({
      pairId: "p1",
      from: "S0",
      to: "S1",
      trigger: "implicit",
      ts: 100,
    });

    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1);
    expect(addBreadcrumbMock.mock.calls[0][0].category).toBe("coalter.presence");

    await unwireSentryTelemetry();
  });

  it("flag OFF で wireSentryTelemetry 後でも emit ゼロ (telemetry.ts 側で gate)", async () => {
    delete process.env[ENV_KEY]; // flag OFF
    await wireSentryTelemetry();

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
      trigger: "manual_switch",
      ts: 5,
    });
    emitRejection({ pairId: "p1", category: "coalter_retreat", ts: 6 });
    emitUrgentTriggered({
      pairId: "p1",
      category: "heat_escalation",
      form: "overlay_banner",
      memoryFallback: "demote",
      ts: 7,
    });
    emitRateLimitBlocked({
      pairId: "p1",
      state: "S2",
      variant: "A",
      violation: "line_length_violation",
      ts: 8,
    });

    expect(addBreadcrumbMock).toHaveBeenCalledTimes(0);

    await unwireSentryTelemetry();
  });
});

describe("L4-pre-2 構造 invariant — fail-open / vendor 整合", () => {
  it("sentryTelemetry.ts は @sentry/nextjs を import (新 SDK install なし)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/sentryTelemetry.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    expect(content).toMatch(/from\s+["']@sentry\/nextjs["']/);
    // PostHog などの新 vendor を import していない
    expect(content).not.toMatch(/posthog-js/);
    expect(content).not.toMatch(/mixpanel/);
  });

  it("8 event type すべてに breadcrumb mapping が定義済 (網羅性)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/sentryTelemetry.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    const types = [
      "coalter.presence.state_transition",
      "coalter.pattern.used",
      "coalter.consent.event",
      "coalter.legacy.fallback",
      "coalter.mode.transition",
      "coalter.rejection.recorded",
      "coalter.urgent.triggered",
      "coalter.ratelimit.blocked",
    ];
    for (const t of types) {
      expect(content).toContain(t);
    }
  });
});
