/**
 * CoAlter AOO Phase C C-3 — forcedCanaryMode invariant test
 *
 * 正本: lib/coalter/mirror/forcedCanaryMode.ts
 *
 * test 範囲 (CEO 提示 必須 + 追加):
 *   - flag strict parser (default false / "true" のみ true)
 *   - flag OFF: 全 helper が null / no-op を返す (完全 no-op)
 *   - flag ON: mock read input / mock engine input が返る
 *   - mock に rawText / userId / messageId / pairId / sessionId が含まれない (PII firewall)
 *   - mock 値は decisionEngine.test.ts の happyInput と一致 (ERV pass、Counterfactual pass)
 *   - cap override = 10
 *   - deterministic
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isForcedCanaryActive,
  getForcedCanaryVisibleCap,
  getForcedCanaryMockReadInput,
  getForcedCanaryMockEngineInput,
  FORCED_CANARY_VISIBLE_CAP,
  __getSafeMockForTest,
  type ForcedCanaryMockEngineInput,
} from "@/lib/coalter/mirror/forcedCanaryMode";

const FORCED_ENV_KEY = "NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED";

describe("C-3 forcedCanaryMode — flag OFF (default、完全 no-op)", () => {
  let origForced: string | undefined;

  beforeEach(() => {
    origForced = process.env[FORCED_ENV_KEY];
    delete process.env[FORCED_ENV_KEY];
  });
  afterEach(() => {
    if (origForced === undefined) delete process.env[FORCED_ENV_KEY];
    else process.env[FORCED_ENV_KEY] = origForced;
  });

  it("env 未設定 → isForcedCanaryActive false", () => {
    delete process.env[FORCED_ENV_KEY];
    expect(isForcedCanaryActive()).toBe(false);
  });

  it("env='' (空文字) → false (strict parser、normalizeBool 非経由)", () => {
    process.env[FORCED_ENV_KEY] = "";
    expect(isForcedCanaryActive()).toBe(false);
  });

  it("env='false' / '0' / '1' / 'on' / 'yes' すべて false (strict)", () => {
    for (const v of ["false", "0", "1", "on", "yes", "TRUE", "True"]) {
      process.env[FORCED_ENV_KEY] = v;
      expect(isForcedCanaryActive()).toBe(false);
    }
  });

  it("getForcedCanaryMockReadInput() → null (flag OFF)", () => {
    delete process.env[FORCED_ENV_KEY];
    expect(getForcedCanaryMockReadInput()).toBeNull();
  });

  it("getForcedCanaryMockEngineInput() → null (flag OFF)", () => {
    delete process.env[FORCED_ENV_KEY];
    expect(getForcedCanaryMockEngineInput()).toBeNull();
  });
});

describe("C-3 forcedCanaryMode — flag ON (strict)", () => {
  let origForced: string | undefined;

  beforeEach(() => {
    origForced = process.env[FORCED_ENV_KEY];
    process.env[FORCED_ENV_KEY] = "true";
  });
  afterEach(() => {
    if (origForced === undefined) delete process.env[FORCED_ENV_KEY];
    else process.env[FORCED_ENV_KEY] = origForced;
  });

  it("env='true' のみ true", () => {
    expect(isForcedCanaryActive()).toBe(true);
  });

  it("getForcedCanaryMockReadInput() → non-null mock (bridge cache shape)", () => {
    const mock = getForcedCanaryMockReadInput();
    expect(mock).not.toBeNull();
    if (mock !== null) {
      expect(mock.mode).toBe("normal");
      expect(mock.patternCategoryBucket).toBe("null_pattern");
      expect(typeof mock.capturedAt).toBe("number");
    }
  });

  it("getForcedCanaryMockEngineInput() → non-null mock (完全 engine input)", () => {
    const mock = getForcedCanaryMockEngineInput();
    expect(mock).not.toBeNull();
    if (mock !== null) {
      expect(mock.mode).toBe("normal");
      expect(mock.alignmentBucket).toBe("strongly_positive");
      expect(mock.alignmentRaw).toBe(1.0);
      expect(mock.uncertaintyBucket).toBe("low_0_to_30");
      expect(mock.uncertaintyRaw).toBe(0);
      expect(mock.silenceBudgetBucket).toBe("low_0_to_30");
      expect(mock.silenceBudgetRaw).toBe(0);
      expect(mock.patternCategoryBucket).toBe("null_pattern");
      expect(mock.observationNovelty).toBe(1.0);
      expect(mock.conversationPhase).toBe("in_progress");
      expect(mock.timeSinceLastSpeakTurns).toBe(20);
      expect(mock.ruptureFlag).toBe(false);
      expect(mock.userOverrideSleep).toBe(false);
    }
  });

  it("FORCED_CANARY_VISIBLE_CAP は 10", () => {
    expect(FORCED_CANARY_VISIBLE_CAP).toBe(10);
    expect(getForcedCanaryVisibleCap()).toBe(10);
  });
});

describe("C-3 forcedCanaryMode — PII firewall (型 + runtime)", () => {
  let origForced: string | undefined;
  beforeEach(() => {
    origForced = process.env[FORCED_ENV_KEY];
    process.env[FORCED_ENV_KEY] = "true";
  });
  afterEach(() => {
    if (origForced === undefined) delete process.env[FORCED_ENV_KEY];
    else process.env[FORCED_ENV_KEY] = origForced;
  });

  it("mock read input に PII field (rawText/userId/messageId/pairId/sessionId/email) が存在しない", () => {
    const mock = getForcedCanaryMockReadInput();
    expect(mock).not.toBeNull();
    if (mock !== null) {
      const serialized = JSON.stringify(mock);
      expect(serialized).not.toMatch(/rawText|userId|messageId|pairId|sessionId|email|embedding/i);
      // 型レベル keys は (mode, patternCategoryBucket, capturedAt) の 3 field のみ
      const keys = Object.keys(mock).sort();
      expect(keys).toEqual(["capturedAt", "mode", "patternCategoryBucket"].sort());
    }
  });

  it("mock engine input に PII field が存在しない", () => {
    const mock = getForcedCanaryMockEngineInput();
    expect(mock).not.toBeNull();
    if (mock !== null) {
      const serialized = JSON.stringify(mock);
      expect(serialized).not.toMatch(/rawText|userId|messageId|pairId|sessionId|email|embedding/i);
      // 全 field は enum / number / boolean のみ
      const expectedKeys = [
        "mode",
        "alignmentBucket",
        "alignmentRaw",
        "uncertaintyBucket",
        "uncertaintyRaw",
        "silenceBudgetBucket",
        "silenceBudgetRaw",
        "patternCategoryBucket",
        "observationNovelty",
        "conversationPhase",
        "timeSinceLastSpeakTurns",
        "ruptureFlag",
        "userOverrideSleep",
      ].sort();
      expect(Object.keys(mock).sort()).toEqual(expectedKeys);
    }
  });

  it("mock は safety_concern / rupture_signal_high を作らない (安全側 default)", () => {
    const mock = __getSafeMockForTest();
    expect(mock.patternCategoryBucket).not.toBe("safety_concern");
    expect(mock.patternCategoryBucket).not.toBe("rupture_signal_high");
    // null_pattern または rupture_signal_mild のみ許容
    expect(["null_pattern", "rupture_signal_mild"]).toContain(
      mock.patternCategoryBucket,
    );
  });
});

describe("C-3 forcedCanaryMode — deterministic + invariants", () => {
  let origForced: string | undefined;
  beforeEach(() => {
    origForced = process.env[FORCED_ENV_KEY];
    process.env[FORCED_ENV_KEY] = "true";
  });
  afterEach(() => {
    if (origForced === undefined) delete process.env[FORCED_ENV_KEY];
    else process.env[FORCED_ENV_KEY] = origForced;
  });

  it("deterministic: 同 flag 状態で複数回呼出しても同 engine mock", () => {
    const m1 = getForcedCanaryMockEngineInput();
    const m2 = getForcedCanaryMockEngineInput();
    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2));
  });

  it("__getSafeMockForTest は public mock と一致", () => {
    const test = __getSafeMockForTest();
    const pub = getForcedCanaryMockEngineInput();
    expect(JSON.stringify(test)).toBe(JSON.stringify(pub));
  });

  it("mock 戻り値は型 ForcedCanaryMockEngineInput (compile-time)", () => {
    const m = getForcedCanaryMockEngineInput();
    if (m !== null) {
      const typed: ForcedCanaryMockEngineInput = m;
      expect(typed.mode).toBe("normal");
    }
  });
});
