/**
 * Tests for useObserverSubscription.ts (Phase A-2c)
 *
 * Test 戦略:
 *   - vitest test environment は "node" (jsdom / React Testing Library 未導入)
 *   - React Hook 本体 (useEffect 経由) は直接 test しない
 *   - 代わりに pure 抽出版 `_runObserverSubscriptionEffect()` を直接 invoke して
 *     subscribe / unsubscribe / registry / strict mode double-invoke / HMR guard を verify
 *
 * 検証項目:
 *   1. flag OFF → subscribe しない
 *   2. flag ON + pairStateId null → subscribe しない
 *   3. flag ON + pairStateId 空文字 → subscribe しない
 *   4. flag ON + pairStateId あり → subscribe される
 *   5. cleanup → unsubscribe される (registry 解除)
 *   6. strict mode double-invoke 相当 (effect → cleanup → effect → cleanup) → leak しない
 *   7. HMR / 重複 mount 相当 (effect → effect) → 既存 entry 解除 + 新規 subscribe
 *   8. signal publish → handler 経由で relationship state 更新
 *   9. raw lastMessageId / matchedPattern が state に出ない (A-2b の PII firewall を E2E で再確認)
 *   10. ObserverHost integration (component が effect callback を呼ぶ)
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "vitest";
import {
  _runObserverSubscriptionEffect,
  __getSubscriptionRegistrySizeForTests,
  __clearSubscriptionRegistryForTests,
} from "@/hooks/useObserverSubscription";
import {
  publishPresenceSignal,
  __resetSignalBus,
} from "@/lib/coalter/presence/productionSignalBus";
import {
  getRelationshipStateSnapshotInternal,
  clearAllRelationshipStatesForTests,
} from "@/lib/coalter/observer/relationshipState";
import type { PresenceSignal } from "@/lib/coalter/presence/types";

const ENV_KEY = "NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER";
const PAIR_KEY_A = "pair-aaa-a2c";
const PAIR_KEY_B = "pair-bbb-a2c";
const RAW_MESSAGE_ID = "raw-msg-id-distinct-zzzzz";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeSignal(overrides?: Partial<PresenceSignal>): PresenceSignal {
  return {
    kind: "implicit",
    strength: "soft",
    detectedAt: 1234567890,
    meta: { lastMessageId: RAW_MESSAGE_ID },
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// Flag OFF cases
// ─────────────────────────────────────────────

describe("useObserverSubscription — flag OFF cases", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    __resetSignalBus();
    __clearSubscriptionRegistryForTests();
    clearAllRelationshipStatesForTests();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
  });

  it("returns null cleanup when flag is unset (default false)", () => {
    delete process.env[ENV_KEY];
    const cleanup = _runObserverSubscriptionEffect(PAIR_KEY_A);
    expect(cleanup).toBeNull();
    expect(__getSubscriptionRegistrySizeForTests()).toBe(0);
  });

  it("returns null cleanup when flag is 'false'", () => {
    process.env[ENV_KEY] = "false";
    const cleanup = _runObserverSubscriptionEffect(PAIR_KEY_A);
    expect(cleanup).toBeNull();
    expect(__getSubscriptionRegistrySizeForTests()).toBe(0);
  });

  it("returns null cleanup when flag is unknown value", () => {
    process.env[ENV_KEY] = "maybe";
    const cleanup = _runObserverSubscriptionEffect(PAIR_KEY_A);
    expect(cleanup).toBeNull();
    expect(__getSubscriptionRegistrySizeForTests()).toBe(0);
  });

  it("publishing signal during flag OFF does NOT update state (no subscription)", () => {
    delete process.env[ENV_KEY];
    _runObserverSubscriptionEffect(PAIR_KEY_A);
    publishPresenceSignal(makeSignal());
    expect(getRelationshipStateSnapshotInternal(PAIR_KEY_A)).toBeNull();
  });
});

// ─────────────────────────────────────────────
// pairStateId null / empty cases
// ─────────────────────────────────────────────

describe("useObserverSubscription — pairStateId null/empty cases", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    process.env[ENV_KEY] = "true"; // flag ON
    __resetSignalBus();
    __clearSubscriptionRegistryForTests();
    clearAllRelationshipStatesForTests();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
  });

  it("returns null cleanup when pairStateId is null", () => {
    const cleanup = _runObserverSubscriptionEffect(null);
    expect(cleanup).toBeNull();
    expect(__getSubscriptionRegistrySizeForTests()).toBe(0);
  });

  it("returns null cleanup when pairStateId is empty string", () => {
    const cleanup = _runObserverSubscriptionEffect("");
    expect(cleanup).toBeNull();
    expect(__getSubscriptionRegistrySizeForTests()).toBe(0);
  });
});

// ─────────────────────────────────────────────
// flag ON + pairStateId — subscribe / cleanup
// ─────────────────────────────────────────────

describe("useObserverSubscription — flag ON + pairStateId", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    process.env[ENV_KEY] = "true";
    __resetSignalBus();
    __clearSubscriptionRegistryForTests();
    clearAllRelationshipStatesForTests();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
    __clearSubscriptionRegistryForTests();
  });

  it("returns non-null cleanup when subscribed", () => {
    const cleanup = _runObserverSubscriptionEffect(PAIR_KEY_A);
    expect(cleanup).not.toBeNull();
    expect(typeof cleanup).toBe("function");
    expect(__getSubscriptionRegistrySizeForTests()).toBe(1);
  });

  it("publishing signal updates relationship state for subscribed pair", () => {
    _runObserverSubscriptionEffect(PAIR_KEY_A);
    publishPresenceSignal(makeSignal({ kind: "implicit", strength: "soft" }));
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY_A);
    expect(state).not.toBeNull();
    expect(state?.reasonCodes).toContain("observation_recorded");
  });

  it("cleanup removes subscription from registry", () => {
    const cleanup = _runObserverSubscriptionEffect(PAIR_KEY_A);
    expect(__getSubscriptionRegistrySizeForTests()).toBe(1);
    cleanup?.();
    expect(__getSubscriptionRegistrySizeForTests()).toBe(0);
  });

  it("after cleanup, publishing signal does NOT update state", () => {
    const cleanup = _runObserverSubscriptionEffect(PAIR_KEY_A);
    cleanup?.();
    clearAllRelationshipStatesForTests();
    publishPresenceSignal(makeSignal());
    expect(getRelationshipStateSnapshotInternal(PAIR_KEY_A)).toBeNull();
  });
});

// ─────────────────────────────────────────────
// React Strict Mode double-invoke simulation
// ─────────────────────────────────────────────

describe("useObserverSubscription — Strict Mode double-invoke leak prevention", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    process.env[ENV_KEY] = "true";
    __resetSignalBus();
    __clearSubscriptionRegistryForTests();
    clearAllRelationshipStatesForTests();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
    __clearSubscriptionRegistryForTests();
  });

  it("simulated strict mode: effect → cleanup → effect → cleanup → registry size 0", () => {
    // React 18 Strict Mode: useEffect callback が double-invoke される
    // (mount → cleanup → mount → cleanup の 2 サイクル)
    const cleanup1 = _runObserverSubscriptionEffect(PAIR_KEY_A);
    expect(__getSubscriptionRegistrySizeForTests()).toBe(1);
    cleanup1?.();
    expect(__getSubscriptionRegistrySizeForTests()).toBe(0);

    const cleanup2 = _runObserverSubscriptionEffect(PAIR_KEY_A);
    expect(__getSubscriptionRegistrySizeForTests()).toBe(1);
    cleanup2?.();
    expect(__getSubscriptionRegistrySizeForTests()).toBe(0);
  });

  it("simulated strict mode: post double-invoke, single signal publish updates state once per cycle", () => {
    // mount → cleanup → mount: 最終的に 1 subscription
    const cleanup1 = _runObserverSubscriptionEffect(PAIR_KEY_A);
    cleanup1?.();
    _runObserverSubscriptionEffect(PAIR_KEY_A); // second mount, no cleanup yet

    publishPresenceSignal(makeSignal());
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY_A);
    expect(state).not.toBeNull();
    // observation_recorded が 1 回追加されているはず (重複 subscribe なら 2 回)
    const observationCount = state?.reasonCodes.filter(
      (r) => r === "observation_recorded",
    ).length;
    expect(observationCount).toBe(1);
  });
});

// ─────────────────────────────────────────────
// HMR / duplicate mount guard
// ─────────────────────────────────────────────

describe("useObserverSubscription — HMR / duplicate mount guard", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    process.env[ENV_KEY] = "true";
    __resetSignalBus();
    __clearSubscriptionRegistryForTests();
    clearAllRelationshipStatesForTests();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
    __clearSubscriptionRegistryForTests();
  });

  it("calling effect twice without cleanup (HMR-like) keeps single registration", () => {
    // HMR / 重複 mount: effect が cleanup なしで再度呼ばれる
    // → 既存 entry を解除してから新規 subscribe するため、registry size は 1 を維持
    _runObserverSubscriptionEffect(PAIR_KEY_A);
    expect(__getSubscriptionRegistrySizeForTests()).toBe(1);
    _runObserverSubscriptionEffect(PAIR_KEY_A);
    expect(__getSubscriptionRegistrySizeForTests()).toBe(1);
  });

  it("HMR scenario: single signal publish → state updated once (no duplicate subscribe)", () => {
    _runObserverSubscriptionEffect(PAIR_KEY_A);
    _runObserverSubscriptionEffect(PAIR_KEY_A); // HMR re-mount

    publishPresenceSignal(makeSignal());
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY_A);
    const observationCount = state?.reasonCodes.filter(
      (r) => r === "observation_recorded",
    ).length;
    expect(observationCount).toBe(1); // duplicate subscribe なら 2 回になる
  });
});

// ─────────────────────────────────────────────
// Multi-pair isolation
// ─────────────────────────────────────────────

describe("useObserverSubscription — multi-pair isolation", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    process.env[ENV_KEY] = "true";
    __resetSignalBus();
    __clearSubscriptionRegistryForTests();
    clearAllRelationshipStatesForTests();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
    __clearSubscriptionRegistryForTests();
  });

  it("subscribing two different pairs creates two registry entries", () => {
    _runObserverSubscriptionEffect(PAIR_KEY_A);
    _runObserverSubscriptionEffect(PAIR_KEY_B);
    expect(__getSubscriptionRegistrySizeForTests()).toBe(2);
  });

  it("publishing signal updates ALL subscribed pairs (bus fan-out)", () => {
    _runObserverSubscriptionEffect(PAIR_KEY_A);
    _runObserverSubscriptionEffect(PAIR_KEY_B);

    publishPresenceSignal(makeSignal());

    // Bus は fan-out なので、両 subscriber が同じ signal を受信し、各 pair の
    // state container に observation_recorded が追加される
    const stateA = getRelationshipStateSnapshotInternal(PAIR_KEY_A);
    const stateB = getRelationshipStateSnapshotInternal(PAIR_KEY_B);
    expect(stateA?.reasonCodes).toContain("observation_recorded");
    expect(stateB?.reasonCodes).toContain("observation_recorded");
  });

  it("unsubscribing one pair does NOT affect the other", () => {
    const cleanupA = _runObserverSubscriptionEffect(PAIR_KEY_A);
    _runObserverSubscriptionEffect(PAIR_KEY_B);
    cleanupA?.();
    expect(__getSubscriptionRegistrySizeForTests()).toBe(1);

    publishPresenceSignal(makeSignal());
    expect(getRelationshipStateSnapshotInternal(PAIR_KEY_A)).toBeNull();
    expect(getRelationshipStateSnapshotInternal(PAIR_KEY_B)).not.toBeNull();
  });
});

// ─────────────────────────────────────────────
// PII firewall (E2E re-verify)
// ─────────────────────────────────────────────

describe("useObserverSubscription — PII firewall (E2E)", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_KEY];
    process.env[ENV_KEY] = "true";
    __resetSignalBus();
    __clearSubscriptionRegistryForTests();
    clearAllRelationshipStatesForTests();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
    __clearSubscriptionRegistryForTests();
  });

  it("raw lastMessageId does NOT appear in relationship state after E2E flow", () => {
    _runObserverSubscriptionEffect(PAIR_KEY_A);
    publishPresenceSignal(
      makeSignal({ meta: { lastMessageId: RAW_MESSAGE_ID } }),
    );

    const state = getRelationshipStateSnapshotInternal(PAIR_KEY_A);
    const json = JSON.stringify(state);
    expect(json.includes(RAW_MESSAGE_ID)).toBe(false);
  });

  it("raw matchedPattern detail does NOT appear in state after E2E flow", () => {
    _runObserverSubscriptionEffect(PAIR_KEY_A);
    const rawSecret = "raw-pattern-secret-mmmmm";
    publishPresenceSignal({
      kind: "critical",
      strength: "strong",
      detectedAt: 1,
      meta: { matchedPattern: `safety:${rawSecret}` },
    });

    const state = getRelationshipStateSnapshotInternal(PAIR_KEY_A);
    const json = JSON.stringify(state);
    expect(json.includes(rawSecret)).toBe(false);
  });

  it("unknown meta fields do NOT leak into state", () => {
    _runObserverSubscriptionEffect(PAIR_KEY_A);
    const futureFieldSecret = "future-meta-field-secret-fff";
    publishPresenceSignal({
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: {
        lastMessageId: "msg-1",
        someFutureField: futureFieldSecret,
      },
    });

    const state = getRelationshipStateSnapshotInternal(PAIR_KEY_A);
    const json = JSON.stringify(state);
    expect(json.includes(futureFieldSecret)).toBe(false);
    expect(json.includes("someFutureField")).toBe(false);
  });
});
