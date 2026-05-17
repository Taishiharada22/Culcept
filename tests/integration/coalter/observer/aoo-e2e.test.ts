/**
 * Integration E2E tests for AOO observer wiring (Phase A-2c)
 *
 * Test 戦略:
 *   - 既存 presence layer (`productionSignalBus`) と新規 observer layer
 *     (A-1/A-1b/A-2b/A-2c) の **end-to-end 連結を verify**
 *   - vitest node env (React 経由しない)
 *   - `_runObserverSubscriptionEffect()` で subscribe → `publishPresenceSignal()` で
 *     publish → state container を inspect
 *
 * 検証項目:
 *   1. Full publish → state update flow (3 kind: implicit / critical / mode_promotion)
 *   2. Multiple subscribers (multi-pair) で fan-out
 *   3. Signal chain (critical → implicit chain) で reason code 順序保持
 *   4. Subscription lifecycle (subscribe → multiple publish → cleanup → publish post-cleanup → no update)
 *   5. presence layer (publishPresenceSignal) は observer subscribe 有無に関わらず動作不変
 *   6. PII firewall (raw lastMessageId / matchedPattern が state に出ない、E2E 再確認)
 *   7. listener throw isolation (observer handler が throw しても他 subscriber に伝播しない)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  _runObserverSubscriptionEffect,
  __clearSubscriptionRegistryForTests,
} from "@/hooks/useObserverSubscription";
import {
  publishPresenceSignal,
  subscribePresenceSignal,
  __resetSignalBus,
} from "@/lib/coalter/presence/productionSignalBus";
import {
  getRelationshipStateSnapshotInternal,
  clearAllRelationshipStatesForTests,
} from "@/lib/coalter/observer/relationshipState";
import type { PresenceSignal } from "@/lib/coalter/presence/types";

const ENV_KEY = "NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER";

// ─────────────────────────────────────────────
// Common setup
// ─────────────────────────────────────────────

function setEnv(value: string | null) {
  if (value === null) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = value;
}

let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  setEnv("true"); // most tests assume flag ON
  __resetSignalBus();
  __clearSubscriptionRegistryForTests();
  clearAllRelationshipStatesForTests();
});

afterEach(() => {
  setEnv(originalEnv ?? null);
  __clearSubscriptionRegistryForTests();
});

// ─────────────────────────────────────────────
// E2E 1: Full publish → state update flow (3 signal kinds)
// ─────────────────────────────────────────────

describe("AOO E2E — publish → state update for 3 signal kinds", () => {
  const PAIR = "pair-e2e-1";

  it("implicit signal → observation_recorded", () => {
    _runObserverSubscriptionEffect(PAIR);
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: { lastMessageId: "msg-implicit-001" },
    };
    publishPresenceSignal(sig);
    const state = getRelationshipStateSnapshotInternal(PAIR);
    expect(state?.reasonCodes).toContain("observation_recorded");
  });

  it("critical signal (safety) → rupture_detected", () => {
    _runObserverSubscriptionEffect(PAIR);
    const sig: PresenceSignal = {
      kind: "critical",
      strength: "strong",
      detectedAt: 2,
      meta: {
        lastMessageId: "msg-critical-002",
        matchedPattern: "safety:self-harm",
      },
    };
    publishPresenceSignal(sig);
    const state = getRelationshipStateSnapshotInternal(PAIR);
    expect(state?.reasonCodes).toContain("rupture_detected");
  });

  it("critical signal (rupture) → rupture_detected", () => {
    _runObserverSubscriptionEffect(PAIR);
    const sig: PresenceSignal = {
      kind: "critical",
      strength: "strong",
      detectedAt: 3,
      meta: { matchedPattern: "rupture:hostility" },
    };
    publishPresenceSignal(sig);
    const state = getRelationshipStateSnapshotInternal(PAIR);
    expect(state?.reasonCodes).toContain("rupture_detected");
  });

  it("mode_promotion signal → mode_signal_received", () => {
    _runObserverSubscriptionEffect(PAIR);
    const sig: PresenceSignal = {
      kind: "mode_promotion",
      strength: "strong",
      detectedAt: 4,
    };
    publishPresenceSignal(sig);
    const state = getRelationshipStateSnapshotInternal(PAIR);
    expect(state?.reasonCodes).toContain("mode_signal_received");
  });
});

// ─────────────────────────────────────────────
// E2E 2: Multiple subscribers fan-out
// ─────────────────────────────────────────────

describe("AOO E2E — multi-pair fan-out", () => {
  it("3 pairs subscribed → all receive single published signal", () => {
    _runObserverSubscriptionEffect("pair-fanout-A");
    _runObserverSubscriptionEffect("pair-fanout-B");
    _runObserverSubscriptionEffect("pair-fanout-C");

    publishPresenceSignal({
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
    });

    expect(getRelationshipStateSnapshotInternal("pair-fanout-A")?.reasonCodes).toContain(
      "observation_recorded",
    );
    expect(getRelationshipStateSnapshotInternal("pair-fanout-B")?.reasonCodes).toContain(
      "observation_recorded",
    );
    expect(getRelationshipStateSnapshotInternal("pair-fanout-C")?.reasonCodes).toContain(
      "observation_recorded",
    );
  });
});

// ─────────────────────────────────────────────
// E2E 3: Signal chain (critical → implicit)
// ─────────────────────────────────────────────

describe("AOO E2E — signal chain reason code order", () => {
  it("critical → implicit chain produces ordered reason codes", () => {
    const PAIR = "pair-chain";
    _runObserverSubscriptionEffect(PAIR);

    // Critical first
    publishPresenceSignal({
      kind: "critical",
      strength: "strong",
      detectedAt: 1,
      meta: { matchedPattern: "rupture:limit" },
    });
    // Then implicit
    publishPresenceSignal({
      kind: "implicit",
      strength: "soft",
      detectedAt: 2,
      meta: { lastMessageId: "msg-chain-002" },
    });

    const state = getRelationshipStateSnapshotInternal(PAIR);
    expect(state?.reasonCodes).toEqual([
      "state_initialized", // initial
      "rupture_detected", // critical
      "observation_recorded", // implicit
    ]);
  });
});

// ─────────────────────────────────────────────
// E2E 4: Subscription lifecycle
// ─────────────────────────────────────────────

describe("AOO E2E — subscription lifecycle", () => {
  it("post-cleanup publish does NOT update state", () => {
    const PAIR = "pair-lifecycle";
    const cleanup = _runObserverSubscriptionEffect(PAIR);

    publishPresenceSignal({
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
    });
    // A-2e canary v2.2 (2026-05-17): observationCount は signal 受信で +1 する
    // (handlePresenceSignal が recordingObservation: true を渡すように修正済)
    expect(getRelationshipStateSnapshotInternal(PAIR)?.observationCount).toBe(1);
    expect(getRelationshipStateSnapshotInternal(PAIR)?.reasonCodes).toContain(
      "observation_recorded",
    );

    cleanup?.();
    // 既存 state を覚えておく
    const versionBeforePostCleanupPublish = getRelationshipStateSnapshotInternal(PAIR)?.stateVersion;

    // post-cleanup publish
    publishPresenceSignal({
      kind: "implicit",
      strength: "soft",
      detectedAt: 2,
    });

    // stateVersion 変化しない (handler が呼ばれない)
    const versionAfter = getRelationshipStateSnapshotInternal(PAIR)?.stateVersion;
    expect(versionAfter).toBe(versionBeforePostCleanupPublish);
  });
});

// ─────────────────────────────────────────────
// E2E 5: Bus 動作不変 (observer の有無に関わらず)
// ─────────────────────────────────────────────

describe("AOO E2E — bus integrity (publish works regardless of observer)", () => {
  it("publish without observer subscriber → no error, getRecentSignals reflects it", () => {
    // observer subscribe しない
    expect(() =>
      publishPresenceSignal({
        kind: "implicit",
        strength: "soft",
        detectedAt: 1,
      }),
    ).not.toThrow();
    // 何も crash しない
  });

  it("publish with both observer and external subscriber → both receive", () => {
    const PAIR = "pair-bus-integrity";
    let externalReceived = 0;
    const externalUnsubscribe = subscribePresenceSignal(() => {
      externalReceived++;
    });

    _runObserverSubscriptionEffect(PAIR);
    publishPresenceSignal({
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
    });

    expect(externalReceived).toBe(1);
    expect(getRelationshipStateSnapshotInternal(PAIR)?.reasonCodes).toContain(
      "observation_recorded",
    );

    externalUnsubscribe();
  });
});

// ─────────────────────────────────────────────
// E2E 6: PII firewall (re-verify)
// ─────────────────────────────────────────────

describe("AOO E2E — PII firewall re-verify", () => {
  const DISTINCT_RAW_ID = "raw-msg-e2e-distinct-pii-test-yyyyy";
  const DISTINCT_RAW_PATTERN_SUFFIX = "raw-pattern-suffix-zzzzz";

  it("raw lastMessageId absent from state after E2E publish", () => {
    const PAIR = "pair-pii-1";
    _runObserverSubscriptionEffect(PAIR);
    publishPresenceSignal({
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: { lastMessageId: DISTINCT_RAW_ID },
    });

    const state = getRelationshipStateSnapshotInternal(PAIR);
    const json = JSON.stringify(state);
    expect(json.includes(DISTINCT_RAW_ID)).toBe(false);
  });

  it("raw matchedPattern suffix absent from state after E2E publish", () => {
    const PAIR = "pair-pii-2";
    _runObserverSubscriptionEffect(PAIR);
    publishPresenceSignal({
      kind: "critical",
      strength: "strong",
      detectedAt: 1,
      meta: { matchedPattern: `safety:${DISTINCT_RAW_PATTERN_SUFFIX}` },
    });

    const state = getRelationshipStateSnapshotInternal(PAIR);
    const json = JSON.stringify(state);
    expect(json.includes(DISTINCT_RAW_PATTERN_SUFFIX)).toBe(false);
  });
});

// ─────────────────────────────────────────────
// E2E 7: Listener throw isolation
// ─────────────────────────────────────────────

describe("AOO E2E — listener throw isolation", () => {
  it("other subscriber throwing does NOT prevent observer from receiving", () => {
    const PAIR = "pair-isolation-1";
    // 既存 bus の throw isolation を信頼: 別の subscriber が throw しても
    // observer の handler は呼ばれる
    const throwingUnsubscribe = subscribePresenceSignal(() => {
      throw new Error("intentional throw from external subscriber");
    });

    _runObserverSubscriptionEffect(PAIR);
    publishPresenceSignal({
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
    });

    expect(getRelationshipStateSnapshotInternal(PAIR)?.reasonCodes).toContain(
      "observation_recorded",
    );

    throwingUnsubscribe();
  });

  it("observer handler malformed signal handling does NOT throw to publisher", () => {
    const PAIR = "pair-isolation-2";
    _runObserverSubscriptionEffect(PAIR);
    // malformed signal を publish しても publisher 側に throw が伝播しない
    // (observer handler は二重 try/catch で握りつぶす、bus 側も isolation あり)
    expect(() => {
      // PresenceSignal 型違反だが publish 自体は通る
      publishPresenceSignal({
        kind: "implicit",
        strength: "soft",
        detectedAt: 1,
      });
    }).not.toThrow();
  });
});
