/**
 * OP-5.1 flags.test.ts — ALTER_MORNING_OP5_* flag 読み取りの test
 *
 * 検証カテゴリ:
 *   1. default 値 (= 全 OFF)
 *   2. ALTER_MORNING_OP5_SHADOW_ENABLED 真偽値
 *   3. ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST parse
 *   4. ALTER_MORNING_OP5_SHADOW_LOG_LEVEL enum
 *   5. shouldRunShadow helper
 *   6. pure (= input mutate なし、 deterministic)
 */

import { describe, it, expect } from "vitest";
import {
  readOp5Flags,
  shouldRunShadow,
  type Op5Flags,
} from "@/lib/alter-morning/op5/flags";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. default 値 (= 全 OFF)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("readOp5Flags — default 値 (全 OFF)", () => {
  it("空 env → shadowEnabled=false / allowlist=[] / logLevel='none'", () => {
    const flags = readOp5Flags({});
    expect(flags.shadowEnabled).toBe(false);
    expect(flags.shadowAllowlist).toEqual([]);
    expect(flags.shadowLogLevel).toBe("none");
  });

  it("関連変数なし → 全 default", () => {
    const flags = readOp5Flags({ NODE_ENV: "test" });
    expect(flags.shadowEnabled).toBe(false);
    expect(flags.shadowAllowlist).toEqual([]);
    expect(flags.shadowLogLevel).toBe("none");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. shadowEnabled
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("readOp5Flags — shadowEnabled", () => {
  it("'true' → true", () => {
    const flags = readOp5Flags({ ALTER_MORNING_OP5_SHADOW_ENABLED: "true" });
    expect(flags.shadowEnabled).toBe(true);
  });

  it("'false' → false (= default)", () => {
    const flags = readOp5Flags({ ALTER_MORNING_OP5_SHADOW_ENABLED: "false" });
    expect(flags.shadowEnabled).toBe(false);
  });

  it("'1' → false (= 'true' のみ true)", () => {
    const flags = readOp5Flags({ ALTER_MORNING_OP5_SHADOW_ENABLED: "1" });
    expect(flags.shadowEnabled).toBe(false);
  });

  it("'TRUE' (大文字) → false (= strict 'true' のみ)", () => {
    const flags = readOp5Flags({ ALTER_MORNING_OP5_SHADOW_ENABLED: "TRUE" });
    expect(flags.shadowEnabled).toBe(false);
  });

  it("空文字 → false", () => {
    const flags = readOp5Flags({ ALTER_MORNING_OP5_SHADOW_ENABLED: "" });
    expect(flags.shadowEnabled).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. shadowAllowlist
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("readOp5Flags — shadowAllowlist", () => {
  it("単一 user", () => {
    const flags = readOp5Flags({
      ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST: "user-1",
    });
    expect(flags.shadowAllowlist).toEqual(["user-1"]);
  });

  it("複数 user comma 区切り", () => {
    const flags = readOp5Flags({
      ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST: "user-1,user-2,user-3",
    });
    expect(flags.shadowAllowlist).toEqual(["user-1", "user-2", "user-3"]);
  });

  it("前後空白を trim", () => {
    const flags = readOp5Flags({
      ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST: " user-1 , user-2 ",
    });
    expect(flags.shadowAllowlist).toEqual(["user-1", "user-2"]);
  });

  it("空 entry を除外", () => {
    const flags = readOp5Flags({
      ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST: "user-1,,user-2,",
    });
    expect(flags.shadowAllowlist).toEqual(["user-1", "user-2"]);
  });

  it("空文字 → []", () => {
    const flags = readOp5Flags({
      ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST: "",
    });
    expect(flags.shadowAllowlist).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. shadowLogLevel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("readOp5Flags — shadowLogLevel", () => {
  it("'none' → 'none'", () => {
    const flags = readOp5Flags({ ALTER_MORNING_OP5_SHADOW_LOG_LEVEL: "none" });
    expect(flags.shadowLogLevel).toBe("none");
  });

  it("'summary' → 'summary'", () => {
    const flags = readOp5Flags({
      ALTER_MORNING_OP5_SHADOW_LOG_LEVEL: "summary",
    });
    expect(flags.shadowLogLevel).toBe("summary");
  });

  it("'verbose' → 'verbose'", () => {
    const flags = readOp5Flags({
      ALTER_MORNING_OP5_SHADOW_LOG_LEVEL: "verbose",
    });
    expect(flags.shadowLogLevel).toBe("verbose");
  });

  it("不正値 → 'none' (= safe fallback)", () => {
    const flags = readOp5Flags({
      ALTER_MORNING_OP5_SHADOW_LOG_LEVEL: "debug",
    });
    expect(flags.shadowLogLevel).toBe("none");
  });

  it("空文字 → 'none'", () => {
    const flags = readOp5Flags({ ALTER_MORNING_OP5_SHADOW_LOG_LEVEL: "" });
    expect(flags.shadowLogLevel).toBe("none");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. shouldRunShadow
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shouldRunShadow", () => {
  const baseFlags: Op5Flags = {
    shadowEnabled: true,
    shadowAllowlist: ["user-1", "user-2"],
    shadowLogLevel: "summary",
  };

  it("shadowEnabled=false → 常に false", () => {
    const flags: Op5Flags = { ...baseFlags, shadowEnabled: false };
    expect(shouldRunShadow(flags, "user-1")).toBe(false);
  });

  it("userId が allowlist 内 → true", () => {
    expect(shouldRunShadow(baseFlags, "user-1")).toBe(true);
    expect(shouldRunShadow(baseFlags, "user-2")).toBe(true);
  });

  it("userId が allowlist 外 → false", () => {
    expect(shouldRunShadow(baseFlags, "user-99")).toBe(false);
  });

  it("userId null / undefined → false", () => {
    expect(shouldRunShadow(baseFlags, null)).toBe(false);
    expect(shouldRunShadow(baseFlags, undefined)).toBe(false);
  });

  it("allowlist が空 → 常に false", () => {
    const flags: Op5Flags = { ...baseFlags, shadowAllowlist: [] };
    expect(shouldRunShadow(flags, "user-1")).toBe(false);
  });

  it("空文字 userId → false", () => {
    expect(shouldRunShadow(baseFlags, "")).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. pure (= input mutate なし、 deterministic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("readOp5Flags — pure", () => {
  it("input env を mutate しない", () => {
    const env = {
      ALTER_MORNING_OP5_SHADOW_ENABLED: "true",
      ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST: "u1,u2",
      ALTER_MORNING_OP5_SHADOW_LOG_LEVEL: "summary",
    };
    const snapshot = JSON.stringify(env);
    readOp5Flags(env);
    expect(JSON.stringify(env)).toBe(snapshot);
  });

  it("同じ env で同じ結果 (= deterministic)", () => {
    const env = {
      ALTER_MORNING_OP5_SHADOW_ENABLED: "true",
      ALTER_MORNING_OP5_SHADOW_USER_ALLOWLIST: "u1",
      ALTER_MORNING_OP5_SHADOW_LOG_LEVEL: "verbose",
    };
    const r1 = readOp5Flags(env);
    const r2 = readOp5Flags(env);
    expect(r1).toEqual(r2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. 【規律】 production no-op (= flag off behavior)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("【規律】 default 全 OFF (= production no-op)", () => {
  it("env 完全空 → shouldRunShadow は常に false", () => {
    const flags = readOp5Flags({});
    expect(shouldRunShadow(flags, "any-user")).toBe(false);
    expect(shouldRunShadow(flags, "user-1")).toBe(false);
    expect(shouldRunShadow(flags, null)).toBe(false);
  });

  it("env 完全空 → logLevel = 'none' (= emit しない signal)", () => {
    const flags = readOp5Flags({});
    expect(flags.shadowLogLevel).toBe("none");
  });
});
