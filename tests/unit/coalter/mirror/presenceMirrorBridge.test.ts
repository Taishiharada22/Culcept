/**
 * CoAlter AOO Phase C C-2 — presenceMirrorBridge invariant test
 *
 * 正本: lib/coalter/mirror/presenceMirrorBridge.ts
 *
 * test 範囲 (CEO 提示 13 必須項目 + 追加):
 *   1.  subscribe される
 *   2.  dispose で unsubscribe される
 *   3.  double initialize しても subscribe が重複しない
 *   4.  raw signal を cache しない
 *   5.  cache object に rawText / userId / messageId / pairId / sessionId が存在しない
 *   6.  signal received → cache が更新される
 *   7.  bridge null なら getMirrorReadInput() は null
 *   8.  default STAY_SILENT regression (mirror engine 別 test で検証)
 *   9.  input mutation 0
 *  10.  deterministic (signal handler は pure)
 *  11.  forbidden grep 0 (別 verification)
 *  12.  C-1 regression (diagnosticDebugGlobal 別 test)
 *  13.  B-1〜B-5b regression (mirror 全 test)
 *  + handler 内 exception は握りつぶす (fail-open)
 *  + SignalKind "critical" + matchedPattern なし → rupture_signal_high
 *  + meta.matchedPattern "safety:*" → safety_concern
 *  + meta.matchedPattern "rupture:*" → rupture_signal_high (severity 安全側)
 *  + meta.matchedPattern なし + non-critical kind → null_pattern
 *  + cache capturedAt が更新される (latest signal)
 *  + cache 構造の field 集合確認 (PII firewall)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initializeBridgeOnce,
  disposeBridge,
  getMirrorReadInput,
  __resetForTest,
  __getInitializedForTest,
  __hasUnsubscribeForTest,
  __getCacheForTest,
  type MirrorReadInput,
} from "@/lib/coalter/mirror/presenceMirrorBridge";
import {
  publishPresenceSignal,
  __resetSignalBus,
} from "@/lib/coalter/presence/productionSignalBus";
import type { PresenceSignal } from "@/lib/coalter/presence/types";

// Test helper: minimum valid PresenceSignal
function makeSignal(overrides: Partial<PresenceSignal> = {}): PresenceSignal {
  return {
    kind: "implicit",
    strength: "soft",
    detectedAt: Date.now(),
    ...overrides,
  };
}

describe("C-2 presenceMirrorBridge — subscribe lifecycle", () => {
  beforeEach(() => {
    __resetForTest();
    __resetSignalBus();
  });
  afterEach(() => {
    __resetForTest();
    __resetSignalBus();
  });

  it("初期状態: 未 initialize / cache null / unsubscribe なし", () => {
    expect(__getInitializedForTest()).toBe(false);
    expect(__hasUnsubscribeForTest()).toBe(false);
    expect(getMirrorReadInput()).toBeNull();
  });

  it("[必須 1] initialize で subscribe される", () => {
    initializeBridgeOnce();
    expect(__getInitializedForTest()).toBe(true);
    expect(__hasUnsubscribeForTest()).toBe(true);
  });

  it("[必須 2] dispose で unsubscribe される", () => {
    initializeBridgeOnce();
    disposeBridge();
    expect(__getInitializedForTest()).toBe(false);
    expect(__hasUnsubscribeForTest()).toBe(false);
    expect(getMirrorReadInput()).toBeNull();
  });

  it("[必須 3] double initialize しても subscribe が重複しない (idempotent)", () => {
    initializeBridgeOnce();
    initializeBridgeOnce();
    initializeBridgeOnce();
    // initialize は 1 回しか効かない (内部 flag check)
    expect(__getInitializedForTest()).toBe(true);
    // signal を 1 件 publish したとき cache update は 1 度のみ (subscribe 重複なし)
    publishPresenceSignal(makeSignal({ kind: "implicit" }));
    const cache = __getCacheForTest();
    expect(cache).not.toBeNull();
  });

  it("dispose を 2 回呼んでも safe (idempotent)", () => {
    initializeBridgeOnce();
    disposeBridge();
    disposeBridge();
    expect(__getInitializedForTest()).toBe(false);
    expect(__hasUnsubscribeForTest()).toBe(false);
  });

  it("dispose 後の re-initialize 可能 (lifecycle)", () => {
    initializeBridgeOnce();
    disposeBridge();
    initializeBridgeOnce();
    expect(__getInitializedForTest()).toBe(true);
    expect(__hasUnsubscribeForTest()).toBe(true);
  });

  it("dispose 後の signal publish は cache を更新しない (unsubscribed)", () => {
    initializeBridgeOnce();
    publishPresenceSignal(makeSignal({ kind: "implicit" }));
    expect(getMirrorReadInput()).not.toBeNull();
    disposeBridge();
    // dispose 後 publish しても cache は null のまま
    publishPresenceSignal(makeSignal({ kind: "critical" }));
    expect(getMirrorReadInput()).toBeNull();
  });
});

describe("C-2 presenceMirrorBridge — signal → MirrorPatternCategoryBucket mapping", () => {
  beforeEach(() => {
    __resetForTest();
    __resetSignalBus();
    initializeBridgeOnce();
  });
  afterEach(() => {
    __resetForTest();
    __resetSignalBus();
  });

  it("meta.matchedPattern なし + 通常 kind → null_pattern (通常評価)", () => {
    publishPresenceSignal(makeSignal({ kind: "implicit" }));
    const cache = getMirrorReadInput();
    expect(cache?.patternCategoryBucket).toBe("null_pattern");
  });

  it("[追加] meta.matchedPattern 'safety:*' → safety_concern", () => {
    publishPresenceSignal(
      makeSignal({ meta: { matchedPattern: "safety:risk_keyword" } }),
    );
    expect(getMirrorReadInput()?.patternCategoryBucket).toBe("safety_concern");
  });

  it("[追加] meta.matchedPattern 'rupture:*' → rupture_signal_high (severity 安全側)", () => {
    publishPresenceSignal(
      makeSignal({ meta: { matchedPattern: "rupture:hostility" } }),
    );
    expect(getMirrorReadInput()?.patternCategoryBucket).toBe("rupture_signal_high");
  });

  it("[追加] SignalKind 'critical' + matchedPattern なし → rupture_signal_high (fallback)", () => {
    publishPresenceSignal(makeSignal({ kind: "critical" }));
    expect(getMirrorReadInput()?.patternCategoryBucket).toBe("rupture_signal_high");
  });

  it("[追加] meta.matchedPattern が unknown prefix → unknown_category", () => {
    publishPresenceSignal(
      makeSignal({ meta: { matchedPattern: "unrecognized:foo" } }),
    );
    // bucketizeMatchedPattern は unknown prefix を unknown_category にする
    expect(getMirrorReadInput()?.patternCategoryBucket).toBe("unknown_category");
  });

  it("[追加] cache の capturedAt は publish 時刻に近い", () => {
    const before = Date.now();
    publishPresenceSignal(makeSignal({ kind: "implicit" }));
    const after = Date.now();
    const cache = getMirrorReadInput();
    expect(cache?.capturedAt).toBeGreaterThanOrEqual(before);
    expect(cache?.capturedAt).toBeLessThanOrEqual(after);
  });

  it("[追加] 後続 signal で cache が上書き (latest only)", () => {
    publishPresenceSignal(makeSignal({ kind: "implicit" })); // → null_pattern
    expect(getMirrorReadInput()?.patternCategoryBucket).toBe("null_pattern");
    publishPresenceSignal(
      makeSignal({ meta: { matchedPattern: "safety:test" } }),
    ); // → safety_concern
    expect(getMirrorReadInput()?.patternCategoryBucket).toBe("safety_concern");
  });
});

describe("C-2 presenceMirrorBridge — PII firewall (型 + runtime)", () => {
  beforeEach(() => {
    __resetForTest();
    __resetSignalBus();
    initializeBridgeOnce();
  });
  afterEach(() => {
    __resetForTest();
    __resetSignalBus();
  });

  it("[必須 4] raw signal を cache しない (meta は読まれず drop)", () => {
    const signal = makeSignal({
      meta: {
        matchedPattern: "safety:test", // これのみ抽出
        lastMessageId: "raw_msg_id_xxx", // 完全 drop (cache に存在しない)
        rawText: "ユーザーの本音テキスト", // 完全 drop
        userId: "user_pii_abc", // 完全 drop
        pairId: "pair_pii_xyz", // 完全 drop
        sessionId: "sess_pii_001", // 完全 drop
        email: "test@example.com", // 完全 drop
        anyOther: { nested: "data" }, // 完全 drop
      },
    });
    publishPresenceSignal(signal);
    const cache = __getCacheForTest();
    expect(cache).not.toBeNull();
    // serialized cache に raw 値が含まれない
    const serialized = JSON.stringify(cache);
    expect(serialized).not.toContain("raw_msg_id_xxx");
    expect(serialized).not.toContain("ユーザーの本音テキスト");
    expect(serialized).not.toContain("user_pii_abc");
    expect(serialized).not.toContain("pair_pii_xyz");
    expect(serialized).not.toContain("sess_pii_001");
    expect(serialized).not.toContain("test@example.com");
    expect(serialized).not.toContain("anyOther");
    expect(serialized).not.toContain("nested");
    // safety:test の raw prefix も cache に出ない (bucket category のみ保持)
    expect(serialized).not.toContain("safety:test");
  });

  it("[必須 5] cache object に rawText / userId / messageId / pairId / sessionId field が存在しない", () => {
    publishPresenceSignal(
      makeSignal({
        meta: {
          rawText: "x",
          userId: "u",
          messageId: "m",
          pairId: "p",
          sessionId: "s",
        },
      }),
    );
    const cache = __getCacheForTest() as Record<string, unknown> | null;
    expect(cache).not.toBeNull();
    if (cache !== null) {
      const keys = Object.keys(cache).sort();
      // cache の keys は MirrorReadInput shape のみ (3 field)
      expect(keys).toEqual(["capturedAt", "mode", "patternCategoryBucket"].sort());
      // 禁止 field 名 が一切存在しない
      expect(cache.rawText).toBeUndefined();
      expect(cache.userId).toBeUndefined();
      expect(cache.messageId).toBeUndefined();
      expect(cache.pairId).toBeUndefined();
      expect(cache.sessionId).toBeUndefined();
      expect(cache.email).toBeUndefined();
      expect(cache.embedding).toBeUndefined();
      expect(cache.meta).toBeUndefined();
    }
  });

  it("[追加] cache.mode は現状 null 固定 (signal から導出不能)", () => {
    publishPresenceSignal(makeSignal({ kind: "mode_promotion" }));
    expect(getMirrorReadInput()?.mode).toBeNull();
  });
});

describe("C-2 presenceMirrorBridge — fail-open + input mutation invariant", () => {
  beforeEach(() => {
    __resetForTest();
    __resetSignalBus();
    initializeBridgeOnce();
  });
  afterEach(() => {
    __resetForTest();
    __resetSignalBus();
  });

  it("[追加] handler exception は presence layer に伝播しない (fail-open)", () => {
    // 不正な signal (handler 内 throw 誘発) を渡しても publishPresenceSignal は throw しない
    const malformed = { meta: null } as unknown as PresenceSignal;
    expect(() => publishPresenceSignal(malformed)).not.toThrow();
  });

  it("[必須 9] signal mutation 0 (input は immutable に扱う)", () => {
    const signal = makeSignal({
      meta: { matchedPattern: "safety:test", extra: "value" },
    });
    const snapshot = JSON.stringify(signal);
    publishPresenceSignal(signal);
    publishPresenceSignal(signal);
    expect(JSON.stringify(signal)).toBe(snapshot);
  });

  it("[必須 10] deterministic — 同 signal を 2 回 publish で同 cache (timestamp 除く)", () => {
    publishPresenceSignal(
      makeSignal({ meta: { matchedPattern: "safety:test" } }),
    );
    const bucket1 = getMirrorReadInput()?.patternCategoryBucket;
    publishPresenceSignal(
      makeSignal({ meta: { matchedPattern: "safety:test" } }),
    );
    const bucket2 = getMirrorReadInput()?.patternCategoryBucket;
    expect(bucket1).toBe(bucket2);
  });

  it("[必須 7] bridge null (未 initialize) なら getMirrorReadInput() は null", () => {
    disposeBridge(); // safety: clear state
    __resetForTest();
    expect(getMirrorReadInput()).toBeNull();
  });

  it("[追加] getMirrorReadInput() の戻り値型は MirrorReadInput | null", () => {
    publishPresenceSignal(makeSignal({ kind: "implicit" }));
    const result: MirrorReadInput | null = getMirrorReadInput();
    if (result !== null) {
      // 型レベル check (compile-time + runtime)
      expect(typeof result.capturedAt).toBe("number");
      expect(typeof result.patternCategoryBucket).toBe("string");
      // mode は null 固定 (現状)
      expect(result.mode).toBeNull();
    }
  });
});

// =============================================================================
// C-3 (2026-05-18): forced canary mode injection (getMirrorReadInput が mock を優先)
// =============================================================================

describe("C-3 presenceMirrorBridge — forced canary mode injection", () => {
  const FORCED_ENV_KEY = "NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED";
  let origForced: string | undefined;

  beforeEach(() => {
    __resetForTest();
    __resetSignalBus();
    origForced = process.env[FORCED_ENV_KEY];
    delete process.env[FORCED_ENV_KEY];
  });
  afterEach(() => {
    __resetForTest();
    __resetSignalBus();
    if (origForced === undefined) delete process.env[FORCED_ENV_KEY];
    else process.env[FORCED_ENV_KEY] = origForced;
  });

  it("forced OFF (default) + 未 initialize → null (regression: C-2 互換)", () => {
    delete process.env[FORCED_ENV_KEY];
    expect(getMirrorReadInput()).toBeNull();
  });

  it("forced ON + 未 initialize → mock 返る (real cache バイパス)", () => {
    process.env[FORCED_ENV_KEY] = "true";
    const result = getMirrorReadInput();
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(result.mode).toBe("normal");
      expect(result.patternCategoryBucket).toBe("null_pattern");
    }
  });

  it("forced ON + signal received (real cache あり) でも mock が優先", () => {
    process.env[FORCED_ENV_KEY] = "true";
    initializeBridgeOnce();
    // real signal を inject (rupture)
    publishPresenceSignal(makeSignal({ meta: { matchedPattern: "rupture:test" } }));
    // real cache は rupture_signal_high になるが、forced ON のため mock の null_pattern が返る
    const result = getMirrorReadInput();
    expect(result?.patternCategoryBucket).toBe("null_pattern");
  });

  it("forced ON → OFF 切り替え: mock 即解除、real cache に戻る", () => {
    process.env[FORCED_ENV_KEY] = "true";
    initializeBridgeOnce();
    publishPresenceSignal(makeSignal({ meta: { matchedPattern: "safety:test" } }));
    expect(getMirrorReadInput()?.patternCategoryBucket).toBe("null_pattern"); // mock 優先

    delete process.env[FORCED_ENV_KEY];
    expect(getMirrorReadInput()?.patternCategoryBucket).toBe("safety_concern"); // real cache に戻る
  });

  it("forced ON でも mock に PII field が含まれない (regression)", () => {
    process.env[FORCED_ENV_KEY] = "true";
    const result = getMirrorReadInput();
    expect(result).not.toBeNull();
    if (result !== null) {
      const keys = Object.keys(result).sort();
      expect(keys).toEqual(["capturedAt", "mode", "patternCategoryBucket"].sort());
      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(
        /rawText|userId|messageId|pairId|sessionId|email|embedding/i,
      );
    }
  });
});
