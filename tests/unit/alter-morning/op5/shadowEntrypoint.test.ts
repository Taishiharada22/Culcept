/**
 * OP-5.3.2 shadowEntrypoint.test.ts — runShadowAndCompare の test
 *
 * 検証カテゴリ:
 *   1. flag off / allowlist 外 → behavior no-op
 *   2. canary 内 → shadow 起動 (= return void、 throw なし)
 *   3. 【invariant】 silent ignore (= caller に throw しない)
 *   4. 【invariant】 console.log / console.error / console.warn を呼ばない
 *   5. 【invariant】 return void / undefined
 *   6. 【invariant】 input mutate しない
 *   7. 【invariant】 redaction passthrough の構造（= OP-5.2 layer が呼ばれる）
 *
 * 規律 (CEO 2026-05-06 補正):
 *   - 「flag off = 0ms」 表現を使わない、 behavior no-op で表現
 *   - silent ignore を test で固定
 *   - console.log / console.error / telemetry / DB / persistence なし
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runShadowAndCompare } from "@/lib/alter-morning/op5/shadowEntrypoint";
import type { ShadowEntrypointInput } from "@/lib/alter-morning/op5/shadowEntrypoint";
import type { MorningPlan } from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ORIGINAL_ENABLED = process.env.ALTER_MORNING_OP5_SHADOW_ENABLED;
const ORIGINAL_ALLOWLIST = process.env.ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST;
const ORIGINAL_LOG_LEVEL = process.env.ALTER_MORNING_OP5_SHADOW_LOG_LEVEL;

function setEnv(opts: {
  enabled?: string;
  allowlist?: string;
  logLevel?: string;
}): void {
  if (opts.enabled !== undefined) {
    process.env.ALTER_MORNING_OP5_SHADOW_ENABLED = opts.enabled;
  } else {
    delete process.env.ALTER_MORNING_OP5_SHADOW_ENABLED;
  }
  if (opts.allowlist !== undefined) {
    process.env.ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST = opts.allowlist;
  } else {
    delete process.env.ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST;
  }
  if (opts.logLevel !== undefined) {
    process.env.ALTER_MORNING_OP5_SHADOW_LOG_LEVEL = opts.logLevel;
  } else {
    delete process.env.ALTER_MORNING_OP5_SHADOW_LOG_LEVEL;
  }
}

function restoreEnv(): void {
  if (ORIGINAL_ENABLED !== undefined) {
    process.env.ALTER_MORNING_OP5_SHADOW_ENABLED = ORIGINAL_ENABLED;
  } else {
    delete process.env.ALTER_MORNING_OP5_SHADOW_ENABLED;
  }
  if (ORIGINAL_ALLOWLIST !== undefined) {
    process.env.ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST = ORIGINAL_ALLOWLIST;
  } else {
    delete process.env.ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST;
  }
  if (ORIGINAL_LOG_LEVEL !== undefined) {
    process.env.ALTER_MORNING_OP5_SHADOW_LOG_LEVEL = ORIGINAL_LOG_LEVEL;
  } else {
    delete process.env.ALTER_MORNING_OP5_SHADOW_LOG_LEVEL;
  }
}

function makeBaseInput(
  override: Partial<ShadowEntrypointInput> = {},
): ShadowEntrypointInput {
  return {
    utterance: "",
    userId: "user-canary",
    legacyPlan: null,
    actualToday: "2026-05-06",
    ...override,
  };
}

function makePlan(): MorningPlan {
  return {
    date: "2026-05-06",
    items: [],
    dayConditions: {} as MorningPlan["dayConditions"],
    createdAt: "2026-05-06T00:00:00.000Z",
    confirmed: false,
    status: "provisional",
  };
}

beforeEach(() => {
  // default 全 OFF
  setEnv({});
});

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. flag off / allowlist 外 → behavior no-op
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runShadowAndCompare — flag off / allowlist 外 (= behavior no-op)", () => {
  it("flag off (= env 全空) → return void、 throw なし", () => {
    setEnv({});
    expect(() => runShadowAndCompare(makeBaseInput())).not.toThrow();
    const ret = runShadowAndCompare(makeBaseInput());
    expect(ret).toBeUndefined();
  });

  it("flag off で console を呼ばない (= behavior no-op)", () => {
    setEnv({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    runShadowAndCompare(makeBaseInput());
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("shadowEnabled=true でも allowlist 空 → behavior no-op", () => {
    setEnv({ enabled: "true", allowlist: "" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    runShadowAndCompare(makeBaseInput({ userId: "user-1" }));
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("shadowEnabled=true / allowlist あり / userId 不一致 → behavior no-op", () => {
    setEnv({ enabled: "true", allowlist: "user-canary" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    runShadowAndCompare(makeBaseInput({ userId: "user-other" }));
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("userId null / undefined → behavior no-op", () => {
    setEnv({ enabled: "true", allowlist: "user-canary" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    runShadowAndCompare(makeBaseInput({ userId: null }));
    runShadowAndCompare(makeBaseInput({ userId: undefined }));
    expect(logSpy).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. canary 内 → shadow 起動、 return void、 throw なし
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runShadowAndCompare — canary 内", () => {
  it("flag on / allowlist 内 / log_level 'none' → return void、 throw なし", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "none" });
    expect(() => runShadowAndCompare(makeBaseInput())).not.toThrow();
    const ret = runShadowAndCompare(makeBaseInput());
    expect(ret).toBeUndefined();
  });

  it("flag on / allowlist 内 / log_level 'summary' → return void、 throw なし", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "summary" });
    expect(() => runShadowAndCompare(makeBaseInput())).not.toThrow();
  });

  it("flag on / allowlist 内 / log_level 'verbose' → return void、 throw なし", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    expect(() => runShadowAndCompare(makeBaseInput())).not.toThrow();
  });

  it("複合 input (= utterance + legacyPlan + homeAnchor) → throw なし", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    expect(() =>
      runShadowAndCompare(
        makeBaseInput({
          utterance: "自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる",
          legacyPlan: makePlan(),
          homeAnchor: {
            lat: 35,
            lng: 139,
            label: "自宅",
            source: "registered_home",
          },
        }),
      ),
    ).not.toThrow();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 【CEO invariant】 silent ignore - caller に throw しない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runShadowAndCompare — 【CEO invariant】 silent ignore", () => {
  it("【invariant】 内部で何が起きても caller に throw しない (= flag off)", () => {
    setEnv({});
    expect(() => runShadowAndCompare(makeBaseInput())).not.toThrow();
  });

  it("【invariant】 内部で何が起きても caller に throw しない (= canary)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    expect(() => runShadowAndCompare(makeBaseInput())).not.toThrow();
  });

  it("【invariant】 異常 utterance でも throw しない", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    const inputs = [
      "",
      "a".repeat(10000), // 長文
      "東京駅から渋谷へ",
      "🤖🚀",
      "\n\n\n",
    ];
    for (const utterance of inputs) {
      expect(() =>
        runShadowAndCompare(makeBaseInput({ utterance })),
      ).not.toThrow();
    }
  });

  it("【invariant】 legacyPlan = null / undefined でも throw しない", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    expect(() =>
      runShadowAndCompare(makeBaseInput({ legacyPlan: null })),
    ).not.toThrow();
    expect(() =>
      runShadowAndCompare(makeBaseInput({ legacyPlan: undefined })),
    ).not.toThrow();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 【CEO invariant】 console.log / error / warn を呼ばない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runShadowAndCompare — 【CEO invariant】 console.* 呼ばない", () => {
  it("【invariant】 flag off で console.log / error / warn を呼ばない", () => {
    setEnv({});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    runShadowAndCompare(makeBaseInput());
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("【invariant】 canary 内 + log_level 'verbose' でも console を呼ばない (= OP-5.3 では観測手段なし)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる",
        legacyPlan: makePlan(),
      }),
    );
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("【invariant】 多様な input で console.* が一切呼ばれない (= 系統検証)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const utterances = [
      "",
      "東京駅から渋谷へ",
      "自宅から始める",
      "最後はホテルで泊まる",
      "明日は朝から仕事して、最後は自宅に帰る",
    ];
    for (const utterance of utterances) {
      runShadowAndCompare(
        makeBaseInput({ utterance, legacyPlan: makePlan() }),
      );
    }
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 【CEO invariant】 return void / undefined
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runShadowAndCompare — 【CEO invariant】 return void", () => {
  it("【invariant】 flag off で return undefined", () => {
    setEnv({});
    const ret = runShadowAndCompare(makeBaseInput());
    expect(ret).toBeUndefined();
  });

  it("【invariant】 canary 内で return undefined", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    const ret = runShadowAndCompare(
      makeBaseInput({ utterance: "自宅から始める", legacyPlan: makePlan() }),
    );
    expect(ret).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 【CEO invariant】 input mutate しない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runShadowAndCompare — 【CEO invariant】 input mutate なし", () => {
  it("【invariant】 input を mutate しない (= flag off)", () => {
    setEnv({});
    const input = makeBaseInput({
      utterance: "自宅から始める",
      legacyPlan: makePlan(),
    });
    const snapshot = JSON.stringify(input);
    runShadowAndCompare(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("【invariant】 input を mutate しない (= canary)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    const input = makeBaseInput({
      utterance: "自宅から始める",
      legacyPlan: makePlan(),
      homeAnchor: {
        lat: 35,
        lng: 139,
        label: "自宅",
        source: "registered_home",
      },
    });
    const snapshot = JSON.stringify(input);
    runShadowAndCompare(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 【CEO invariant】 telemetry / DB / persistence path がない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runShadowAndCompare — 【CEO invariant】 telemetry / DB / persistence なし", () => {
  it("【invariant】 fetch を呼ばない (= 外部 I/O なし)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
        }),
    );
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
