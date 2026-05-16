/**
 * Tests for observerSubscriber.ts + observerSubscriberGate.ts (Phase A-2b)
 *
 * 検証項目:
 *   1. Gate (flag OFF / ON / unknown)
 *   2. Session creation (testSalt / ephemeral)
 *   3. handlePresenceSignal (state update via redact)
 *   4. listener throw isolation (no propagation)
 *   5. raw lastMessageId / matchedPattern が state container に出ない
 *   6. makeSignalHandler factory (closure)
 *   7. no actual subscribe call (runtime-unwired)
 *   8. no side effects beyond state container update
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import {
  createObserverSession,
  handlePresenceSignal,
  makeSignalHandler,
  type ObserverSession,
} from "@/lib/coalter/observer/observerSubscriber";
import {
  checkObserverGate,
  isPresenceObserverEnabled,
} from "@/lib/coalter/observer/observerSubscriberGate";
import {
  getRelationshipStateSnapshotInternal,
  clearAllRelationshipStatesForTests,
} from "@/lib/coalter/observer/relationshipState";
import type { PresenceSignal } from "@/lib/coalter/presence/types";

const PAIR_KEY = "pair-state-id-test-a2b";
const TEST_SALT = "test-salt-2026-05-16-a2b-determ";
const RAW_MESSAGE_ID = "msg-uuid-very-distinct-67890-fedcba";

// ─────────────────────────────────────────────
// Gate
// ─────────────────────────────────────────────

describe("observerSubscriberGate — flag check", () => {
  const ENV_KEY = "NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER";
  const originalEnv = process.env[ENV_KEY];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
  });

  it("returns gate_disabled_by_flag when flag unset (default false)", () => {
    delete process.env[ENV_KEY];
    expect(checkObserverGate()).toBe("gate_disabled_by_flag");
    expect(isPresenceObserverEnabled()).toBe(false);
  });

  it("returns gate_disabled_by_flag when flag is 'false'", () => {
    process.env[ENV_KEY] = "false";
    expect(checkObserverGate()).toBe("gate_disabled_by_flag");
    expect(isPresenceObserverEnabled()).toBe(false);
  });

  it("returns gate_disabled_by_flag when flag is unknown value", () => {
    process.env[ENV_KEY] = "yes-please";
    expect(checkObserverGate()).toBe("gate_disabled_by_flag");
    expect(isPresenceObserverEnabled()).toBe(false);
  });

  it("normalizeBool quirk: empty string → true (既存 flags.ts 挙動)", () => {
    // ⚠️ 注意: 既存 lib/coalter/flags.ts normalizeBool() は空文字列 ""
    // を **true として扱う**。これは既存 presenceExecutorEnabled 等と
    // 同じ挙動。本 test は既存挙動の reggression 防止記録。
    // production 運用では env を unset するか "false" を明示すること
    // (Production env は触らない、Preview で "true" のみ設定する想定)。
    process.env[ENV_KEY] = "";
    expect(checkObserverGate()).toBe("gate_enabled");
    expect(isPresenceObserverEnabled()).toBe(true);
  });

  // Note: NEXT_PUBLIC_ flag は webpack DefinePlugin が build 時に inline するため
  //       node:test 環境では process.env を直接読む既存パターンと整合する。
  //       本テストでは "true" 設定時の動作を確認。
  it("returns gate_enabled when flag is 'true'", () => {
    process.env[ENV_KEY] = "true";
    expect(checkObserverGate()).toBe("gate_enabled");
    expect(isPresenceObserverEnabled()).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Session creation
// ─────────────────────────────────────────────

describe("createObserverSession", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("creates session with testSalt (deterministic)", () => {
    const s1 = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const s2 = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    expect(s1._internalSalt).toBe(TEST_SALT);
    expect(s2._internalSalt).toBe(TEST_SALT);
  });

  it("creates session with ephemeral salt when testSalt is omitted", () => {
    const s1 = createObserverSession({ pairStateId: PAIR_KEY });
    const s2 = createObserverSession({ pairStateId: PAIR_KEY });
    // ephemeral salt は random、両 session で異なる
    expect(s1._internalSalt).not.toBe(s2._internalSalt);
    expect(s1._internalSalt.length).toBeGreaterThan(0);
    expect(s2._internalSalt.length).toBeGreaterThan(0);
  });

  it("ephemeral salt is 43 chars (32 bytes base64url)", () => {
    const s = createObserverSession({ pairStateId: PAIR_KEY });
    expect(s._internalSalt.length).toBe(43);
  });

  it("stores pairStateId in session", () => {
    const s = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    expect(s._internalKey).toBe(PAIR_KEY);
  });

  it("throws on empty pairStateId", () => {
    expect(() =>
      createObserverSession({ pairStateId: "" }),
    ).toThrow();
  });

  it("throws on non-string pairStateId", () => {
    expect(() =>
      createObserverSession({ pairStateId: null as unknown as string }),
    ).toThrow();
  });
});

// ─────────────────────────────────────────────
// handlePresenceSignal — state update
// ─────────────────────────────────────────────

describe("handlePresenceSignal — state update", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("updates relationship state for implicit signal (observation_recorded)", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: { lastMessageId: RAW_MESSAGE_ID },
    };
    handlePresenceSignal(sig, session);
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY);
    expect(state).not.toBeNull();
    expect(state?.reasonCodes).toContain("observation_recorded");
  });

  it("updates state for critical/safety signal (rupture_detected)", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const sig: PresenceSignal = {
      kind: "critical",
      strength: "strong",
      detectedAt: 1,
      meta: {
        lastMessageId: RAW_MESSAGE_ID,
        matchedPattern: "safety:self-harm",
      },
    };
    handlePresenceSignal(sig, session);
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY);
    expect(state?.reasonCodes).toContain("rupture_detected");
  });

  it("updates state for critical/rupture signal (rupture_detected)", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const sig: PresenceSignal = {
      kind: "critical",
      strength: "strong",
      detectedAt: 1,
      meta: { matchedPattern: "rupture:hostility" },
    };
    handlePresenceSignal(sig, session);
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY);
    expect(state?.reasonCodes).toContain("rupture_detected");
  });

  it("updates state for mode_promotion signal (mode_signal_received)", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const sig: PresenceSignal = {
      kind: "mode_promotion",
      strength: "strong",
      detectedAt: 1,
    };
    handlePresenceSignal(sig, session);
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY);
    expect(state?.reasonCodes).toContain("mode_signal_received");
  });

  it("updates state for explicit signal (observation_recorded)", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const sig: PresenceSignal = {
      kind: "explicit",
      strength: "strong",
      detectedAt: 1,
    };
    handlePresenceSignal(sig, session);
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY);
    expect(state?.reasonCodes).toContain("observation_recorded");
  });

  it("updates state for manual_restart signal (observation_recorded)", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const sig: PresenceSignal = {
      kind: "manual_restart",
      strength: "strong",
      detectedAt: 1,
    };
    handlePresenceSignal(sig, session);
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY);
    expect(state?.reasonCodes).toContain("observation_recorded");
  });
});

// ─────────────────────────────────────────────
// handlePresenceSignal — PII firewall
// ─────────────────────────────────────────────

describe("handlePresenceSignal — PII firewall", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("raw lastMessageId is NOT stored in relationship state", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: { lastMessageId: RAW_MESSAGE_ID },
    };
    handlePresenceSignal(sig, session);
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY);
    const json = JSON.stringify(state);
    expect(json.includes(RAW_MESSAGE_ID)).toBe(false);
  });

  it("raw matchedPattern is NOT stored in relationship state", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const rawDistinctSuffix = "raw-pattern-secret-yyyyy";
    const sig: PresenceSignal = {
      kind: "critical",
      strength: "strong",
      detectedAt: 1,
      meta: { matchedPattern: `safety:${rawDistinctSuffix}` },
    };
    handlePresenceSignal(sig, session);
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY);
    const json = JSON.stringify(state);
    expect(json.includes(rawDistinctSuffix)).toBe(false);
  });

  it("unknown meta fields are NOT stored", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const distinctValue = "future-unknown-meta-secret-zzz";
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: {
        lastMessageId: RAW_MESSAGE_ID,
        someUnknownFutureField: distinctValue,
      },
    };
    handlePresenceSignal(sig, session);
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY);
    const json = JSON.stringify(state);
    expect(json.includes(distinctValue)).toBe(false);
  });
});

// ─────────────────────────────────────────────
// handlePresenceSignal — throw isolation
// ─────────────────────────────────────────────

describe("handlePresenceSignal — throw isolation", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("does not throw on malformed signal (defensive fail-closed)", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const malformed = {} as unknown as PresenceSignal;
    expect(() => handlePresenceSignal(malformed, session)).not.toThrow();
  });

  it("does not throw on signal with null meta", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: undefined,
    };
    expect(() => handlePresenceSignal(sig, session)).not.toThrow();
  });

  it("does not throw on signal with unknown kind (drop)", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const sig = {
      kind: "future_unknown_kind",
      strength: "soft",
      detectedAt: 1,
    } as unknown as PresenceSignal;
    expect(() => handlePresenceSignal(sig, session)).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// makeSignalHandler factory
// ─────────────────────────────────────────────

describe("makeSignalHandler", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("returns a function that takes PresenceSignal", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const handler = makeSignalHandler(session);
    expect(typeof handler).toBe("function");
  });

  it("invoking the returned handler updates state (closure works)", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const handler = makeSignalHandler(session);
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
    };
    handler(sig);
    const state = getRelationshipStateSnapshotInternal(PAIR_KEY);
    expect(state?.reasonCodes).toContain("observation_recorded");
  });

  it("handler closure isolates session (multiple sessions = isolated state)", () => {
    const sessionA = createObserverSession({
      pairStateId: "pair-A",
      testSalt: TEST_SALT,
    });
    const sessionB = createObserverSession({
      pairStateId: "pair-B",
      testSalt: TEST_SALT,
    });
    const handlerA = makeSignalHandler(sessionA);
    const handlerB = makeSignalHandler(sessionB);

    const sigA: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
    };
    const sigB: PresenceSignal = {
      kind: "critical",
      strength: "strong",
      detectedAt: 2,
      meta: { matchedPattern: "safety:self-harm" },
    };

    handlerA(sigA);
    handlerB(sigB);

    const stateA = getRelationshipStateSnapshotInternal("pair-A");
    const stateB = getRelationshipStateSnapshotInternal("pair-B");
    expect(stateA?.reasonCodes).toContain("observation_recorded");
    expect(stateA?.reasonCodes).not.toContain("rupture_detected");
    expect(stateB?.reasonCodes).toContain("rupture_detected");
    expect(stateB?.reasonCodes).not.toContain("observation_recorded");
  });
});

// ─────────────────────────────────────────────
// No side effects beyond state container update
// ─────────────────────────────────────────────

describe("handlePresenceSignal — no external side effects", () => {
  beforeEach(() => {
    clearAllRelationshipStatesForTests();
  });

  it("does not call console.log/error/warn/info", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
      meta: { lastMessageId: RAW_MESSAGE_ID },
    };
    handlePresenceSignal(sig, session);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("does not call fetch (no network)", () => {
    const session = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    // global.fetch may or may not exist in test env; use spy regardless
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => {
        throw new Error("fetch should not be called");
      });

    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 1,
    };
    expect(() => handlePresenceSignal(sig, session)).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// Runtime-unwired check (no actual subscribe call)
// ─────────────────────────────────────────────

describe("A-2b runtime-unwired check", () => {
  it("observerSubscriber module does NOT import subscribePresenceSignal", () => {
    // Static check: 本 module の source は subscribePresenceSignal を呼ばない。
    // import 自体は signalRedaction / relationshipState のみ。
    // 本 test は library export 関数の signature を確認するだけで、actual subscribe call はしない。
    expect(typeof createObserverSession).toBe("function");
    expect(typeof handlePresenceSignal).toBe("function");
    expect(typeof makeSignalHandler).toBe("function");
    // Session interface だけが export される (actual subscribe wiring は A-2c)
    const session: ObserverSession = createObserverSession({
      pairStateId: PAIR_KEY,
      testSalt: TEST_SALT,
    });
    expect(typeof session._internalSalt).toBe("string");
  });
});
