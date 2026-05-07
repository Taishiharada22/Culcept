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

// OP-5.4.1: Sentry を mock 化 (= 実 ingestion させない)
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  // 互換のため他 helper も mock (= 既存 imports が他にあっても OK)
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

// OP-5.4.2.2: observationAggregator は pass-through で wrap (= 通常 test では実 logic、
//   特定 test で mockImplementationOnce で throw 注入 = 観測 wiring failure 検証)
vi.mock("@/lib/alter-morning/op5/observationAggregator", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/alter-morning/op5/observationAggregator")
  >("@/lib/alter-morning/op5/observationAggregator");
  return {
    ...actual,
    buildShadowObservationInput: vi.fn(actual.buildShadowObservationInput),
  };
});

// OP-5.4.2.2: shadowOrchestrator も pass-through で wrap (= log_level=none + step
//   throw → error emit invariant のための throw 注入用、 案A 明文化)
vi.mock("@/lib/alter-morning/op5/shadowOrchestrator", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/alter-morning/op5/shadowOrchestrator")
  >("@/lib/alter-morning/op5/shadowOrchestrator");
  return {
    ...actual,
    runShadowOrchestrator: vi.fn(actual.runShadowOrchestrator),
  };
});

import * as Sentry from "@sentry/nextjs";
import { runShadowAndCompare } from "@/lib/alter-morning/op5/shadowEntrypoint";
import type { ShadowEntrypointInput } from "@/lib/alter-morning/op5/shadowEntrypoint";
import type { MorningPlan } from "@/lib/alter-morning/types";
import { buildShadowObservationInput } from "@/lib/alter-morning/op5/observationAggregator";
import { runShadowOrchestrator } from "@/lib/alter-morning/op5/shadowOrchestrator";

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

beforeEach(async () => {
  // default 全 OFF
  setEnv({});
  vi.mocked(Sentry.captureMessage).mockClear();
  // OP-5.4.2.2: aggregator / orchestrator の mock を pristine 状態にリセット
  //   (= mockImplementationOnce が次 test に残らないように)
  const aggregatorActual = await vi.importActual<
    typeof import("@/lib/alter-morning/op5/observationAggregator")
  >("@/lib/alter-morning/op5/observationAggregator");
  vi.mocked(buildShadowObservationInput).mockReset();
  vi.mocked(buildShadowObservationInput).mockImplementation(
    aggregatorActual.buildShadowObservationInput,
  );
  const orchestratorActual = await vi.importActual<
    typeof import("@/lib/alter-morning/op5/shadowOrchestrator")
  >("@/lib/alter-morning/op5/shadowOrchestrator");
  vi.mocked(runShadowOrchestrator).mockReset();
  vi.mocked(runShadowOrchestrator).mockImplementation(
    orchestratorActual.runShadowOrchestrator,
  );
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
  it("【invariant】 fetch を呼ばない (= 外部 I/O なし、 Sentry は mock 経由)", () => {
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. OP-5.4.1 + OP-5.4.2.2: error / success observation telemetry (= Sentry emit)
//
// log_level の意味 (OP-5.4.2.2 案A 明文化):
//   - shadowLogLevel は **success observation の verbosity だけ**を制御する
//   - error telemetry は shadowEnabled + allowlist で gate され、 log_level の
//     影響を受けない (= log_level=none でも step throw 時に error event は出る)
//   - log_level=none → success observation 0 回、 step throw 時 error event 出る
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runShadowAndCompare (OP-5.4.2.2) — success path / observation event", () => {
  it("【invariant】 success path (= canary 内、 log_level=summary) で op5.shadow.observation.summary が 1 回 emit される", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "summary" });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(Sentry.captureMessage).mock.calls[0];
    expect(callArgs[0]).toBe("op5.shadow.observation.summary");
    const options = callArgs[1] as { level?: string };
    expect(options?.level).toBe("info");
  });

  it("【invariant】 success path (= canary 内、 log_level=verbose) で op5.shadow.observation.verbose が 1 回 emit される", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "東京駅から渋谷へ",
        legacyPlan: makePlan(),
      }),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(Sentry.captureMessage).mock.calls[0];
    expect(callArgs[0]).toBe("op5.shadow.observation.verbose");
  });

  it("【invariant】 success path で op5.shadow.error.* が呼ばれない (= success / observation 排他)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "summary" });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    const messages = vi
      .mocked(Sentry.captureMessage)
      .mock.calls.map((c) => c[0]);
    for (const msg of messages) {
      expect(msg.startsWith("op5.shadow.observation.")).toBe(true);
      expect(msg.startsWith("op5.shadow.error.")).toBe(false);
    }
  });

  it("【invariant】 success path 多様 input でも observation event は 1 回 / call (= 排他維持)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    const utterances = [
      "",
      "東京駅から渋谷へ",
      "自宅から始めて、東京駅から渋谷へ、夜はホテルで泊まる",
    ];
    for (const utterance of utterances) {
      vi.mocked(Sentry.captureMessage).mockClear();
      runShadowAndCompare(
        makeBaseInput({ utterance, legacyPlan: makePlan() }),
      );
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      const message = vi.mocked(Sentry.captureMessage).mock.calls[0][0];
      expect(message).toBe("op5.shadow.observation.verbose");
    }
  });
});

describe("runShadowAndCompare (OP-5.4.2.2) — log_level=none gate (= 案A 明文化)", () => {
  it("【invariant】 log_level=none では success observation 0 回 (= redacted null gate)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "none" });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("【invariant】 log_level=none default (= env 未設定) でも success observation 0 回", () => {
    setEnv({ enabled: "true", allowlist: "user-canary" }); // logLevel 未設定 → default "none"
    runShadowAndCompare(
      makeBaseInput({
        utterance: "東京駅から渋谷へ",
        legacyPlan: makePlan(),
      }),
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("【invariant】 log_level=none でも shadow path 自体は走る (= return void、 throw なし)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "none" });
    expect(() =>
      runShadowAndCompare(
        makeBaseInput({
          utterance: "自宅から東京駅へ、夜はホテル",
          legacyPlan: makePlan(),
        }),
      ),
    ).not.toThrow();
  });
});

describe("runShadowAndCompare (OP-5.4.2.2) — flag off / allowlist 外で emit しない", () => {
  it("【invariant】 flag off では observation も error も emit しない (= shouldRunShadow gate より前で stop)", () => {
    setEnv({});
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("【invariant】 allowlist 外では observation も error も emit しない", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "summary" });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
        userId: "user-other",
      }),
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("【invariant】 userId null では observation も error も emit しない", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "summary" });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
        userId: null,
      }),
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe("runShadowAndCompare (OP-5.4.2.2) — caller side silent", () => {
  it("【invariant】 caller への throw 伝播は引き続きしない (= silent on caller side)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "summary" });
    expect(() =>
      runShadowAndCompare(
        makeBaseInput({
          utterance: "自宅から始める",
          legacyPlan: makePlan(),
        }),
      ),
    ).not.toThrow();
  });

  it("【invariant】 emit される message は op5.shadow.observation.<level> または op5.shadow.error.<category> 形式のみ", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    const messages = vi
      .mocked(Sentry.captureMessage)
      .mock.calls.map((c) => c[0]);
    for (const msg of messages) {
      expect(msg).toMatch(
        /^op5\.shadow\.(observation\.(summary|verbose)|error\.(orchestrator_error|extractor_error|comparator_error|redaction_error|observation_error|unknown))$/,
      );
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. OP-5.4.2.2: observation_error fallback (= silent failure 防止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runShadowAndCompare (OP-5.4.2.2) — observation_error fallback", () => {
  it("【invariant】 aggregator throw 時に op5.shadow.error.observation_error が emit される", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "summary" });
    vi.mocked(buildShadowObservationInput).mockImplementationOnce(() => {
      throw new Error("simulated aggregator failure");
    });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    const messages = vi
      .mocked(Sentry.captureMessage)
      .mock.calls.map((c) => c[0]);
    expect(messages).toContain("op5.shadow.error.observation_error");
  });

  it("【invariant】 aggregator throw 時に op5.shadow.observation.* は emit されない (= 観測失敗時は error のみ)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    vi.mocked(buildShadowObservationInput).mockImplementationOnce(() => {
      throw new Error("simulated aggregator failure");
    });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "東京駅から渋谷へ",
        legacyPlan: makePlan(),
      }),
    );
    const messages = vi
      .mocked(Sentry.captureMessage)
      .mock.calls.map((c) => c[0]);
    for (const msg of messages) {
      expect(msg.startsWith("op5.shadow.observation.")).toBe(false);
    }
  });

  it("【invariant】 aggregator throw でも caller に throw 伝播しない (= silent on caller side)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "summary" });
    vi.mocked(buildShadowObservationInput).mockImplementationOnce(() => {
      throw new Error("simulated aggregator failure");
    });
    expect(() =>
      runShadowAndCompare(
        makeBaseInput({
          utterance: "自宅から始める",
          legacyPlan: makePlan(),
        }),
      ),
    ).not.toThrow();
  });

  it("【invariant】 log_level=none では aggregator が呼ばれない (= 早期 return、 throw も emit も発生しない)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "none" });
    vi.mocked(buildShadowObservationInput).mockImplementationOnce(() => {
      throw new Error("should not be called");
    });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    expect(buildShadowObservationInput).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. OP-5.4.2.2: log_level vs error telemetry の独立性 (= 案A 明文化)
//
// **error telemetry は shadowLogLevel の影響を受けない**:
//   step throw → log_level=none でも error event は emit される。
//   = 安全監視 / SRE 観点と success observation observability を **分離**。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runShadowAndCompare (OP-5.4.2.2) — error telemetry vs log_level 独立性", () => {
  it("【invariant】 log_level=none + step throw (= orchestrator) → orchestrator_error event 出る", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "none" });
    vi.mocked(runShadowOrchestrator).mockImplementationOnce(() => {
      throw new Error("simulated orchestrator failure");
    });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    const messages = vi
      .mocked(Sentry.captureMessage)
      .mock.calls.map((c) => c[0]);
    expect(messages).toContain("op5.shadow.error.orchestrator_error");
  });

  it("【invariant】 log_level=summary + step throw → orchestrator_error event 出る (= log_level に依存しない)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "summary" });
    vi.mocked(runShadowOrchestrator).mockImplementationOnce(() => {
      throw new Error("simulated orchestrator failure");
    });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    const messages = vi
      .mocked(Sentry.captureMessage)
      .mock.calls.map((c) => c[0]);
    expect(messages).toContain("op5.shadow.error.orchestrator_error");
  });

  it("【invariant】 log_level=verbose + step throw → orchestrator_error event 出る (= log_level に依存しない)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    vi.mocked(runShadowOrchestrator).mockImplementationOnce(() => {
      throw new Error("simulated orchestrator failure");
    });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    const messages = vi
      .mocked(Sentry.captureMessage)
      .mock.calls.map((c) => c[0]);
    expect(messages).toContain("op5.shadow.error.orchestrator_error");
  });

  it("【invariant】 step throw 時は success observation event が emit されない (= 排他)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "summary" });
    vi.mocked(runShadowOrchestrator).mockImplementationOnce(() => {
      throw new Error("simulated orchestrator failure");
    });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    const messages = vi
      .mocked(Sentry.captureMessage)
      .mock.calls.map((c) => c[0]);
    for (const msg of messages) {
      expect(msg.startsWith("op5.shadow.observation.")).toBe(false);
    }
  });

  it("【invariant】 flag off + step throw 想定 → 何も emit されない (= shouldRunShadow gate より前)", () => {
    setEnv({}); // flag off
    vi.mocked(runShadowOrchestrator).mockImplementationOnce(() => {
      throw new Error("should not be called when flag off");
    });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    expect(runShadowOrchestrator).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 11. OP-5.4.2.2: emit input の集計値正確性 (= bySource / counts / comparison)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runShadowAndCompare (OP-5.4.2.2) — emit payload 正確性", () => {
  it("【invariant】 emit payload tags に集計値 (= count / source / match) が含まれ、 raw が含まれない", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "summary" });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から始める",
        legacyPlan: makePlan(),
      }),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(Sentry.captureMessage).mock.calls[0];
    const options = callArgs[1] as { tags?: Record<string, unknown> };
    expect(options).toBeDefined();
    expect(options.tags).toBeDefined();
    const tags = options.tags!;

    // bySource (= 既存 OperationSource enum 8 値) keys が存在
    expect(tags).toHaveProperty("op5_emit_count_llm_explicit");
    expect(tags).toHaveProperty("op5_emit_count_llm_inferred");
    expect(tags).toHaveProperty("op5_emit_count_regex_deterministic");
    expect(tags).toHaveProperty("op5_emit_count_code_history");
    expect(tags).toHaveProperty("op5_emit_count_code_location");
    expect(tags).toHaveProperty("op5_emit_count_ui_action");
    expect(tags).toHaveProperty("op5_emit_count_caller_request");
    expect(tags).toHaveProperty("op5_emit_count_system_default");

    // 集約 alias (= 「llm」「regex」「deterministic」 等) は **存在しない**
    expect(tags).not.toHaveProperty("op5_emit_count_llm");
    expect(tags).not.toHaveProperty("op5_emit_count_regex");
    expect(tags).not.toHaveProperty("op5_emit_count_deterministic");

    // raw key が tags に **存在しない**
    expect(tags).not.toHaveProperty("utterance");
    expect(tags).not.toHaveProperty("label");
    expect(tags).not.toHaveProperty("userId");
    expect(tags).not.toHaveProperty("payload");
    expect(tags).not.toHaveProperty("coords");
    expect(tags).not.toHaveProperty("matchedSpan");
  });

  it("【invariant】 emit payload に raw 値 (= 「自宅」「東京駅」 等) が含まれない", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "自宅から東京駅へ、夜はホテルで泊まる",
        legacyPlan: makePlan(),
        homeAnchor: {
          lat: 35.123,
          lng: 139.456,
          label: "自宅",
          source: "registered_home",
        },
      }),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(Sentry.captureMessage).mock.calls[0];
    const json = JSON.stringify(callArgs);
    // raw 文字列が一切含まれないことを系統検証
    expect(json).not.toContain("自宅から東京駅へ");
    expect(json).not.toContain("自宅");
    expect(json).not.toContain("東京駅");
    expect(json).not.toContain("ホテル");
    expect(json).not.toContain("35.123");
    expect(json).not.toContain("139.456");
    expect(json).not.toContain("registered_home");
  });

  it("【invariant】 emit payload tags は string 型のみ (= Sentry SDK 仕様 + raw 漏洩防止)", () => {
    setEnv({ enabled: "true", allowlist: "user-canary", logLevel: "verbose" });
    runShadowAndCompare(
      makeBaseInput({
        utterance: "東京駅から渋谷へ",
        legacyPlan: makePlan(),
      }),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(Sentry.captureMessage).mock.calls[0];
    const options = callArgs[1] as { tags?: Record<string, unknown> };
    const tags = options.tags!;
    for (const [, value] of Object.entries(tags)) {
      expect(typeof value).toBe("string");
    }
  });
});
