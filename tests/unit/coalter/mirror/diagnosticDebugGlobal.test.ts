/**
 * CoAlter AOO Phase B B-5a + Phase C C-1 — diagnosticDebugGlobal invariant test
 *
 * 正本: lib/coalter/mirror/diagnosticDebugGlobal.ts
 *
 * test 範囲:
 *   - 二重 flag gating (mirrorChannel AND diagnosticExpose 両方 ON のときのみ install)
 *   - flag いずれか OFF → install されない
 *   - SSR (window undefined) → install されない
 *   - **Phase C C-1**: production NODE_ENV でも install される (NODE_ENV guard 削除済、
 *     Phase A §3.5 学び反映、Phase A 7-layer defense で代替)
 *   - 15-min expire (各 read で elapsed time check)
 *   - selfDestroy で削除
 *   - idempotent install (2 回呼んでも 1 回扱い)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  installDiagnosticDebugGlobalIfEnabled,
  destroyDiagnosticDebugGlobal,
  __resetForTest as __resetDebugForTest,
  __getInstalledForTest,
  __setInstalledAtForTest,
  __getExpireMsForTest,
  __getDebugGlobalKeyForTest,
} from "@/lib/coalter/mirror/diagnosticDebugGlobal";
import {
  pushDiagnosticEntry,
  __resetForTest as __resetSnapshotForTest,
} from "@/lib/coalter/mirror/diagnosticSnapshot";
import { MIRROR_STAY_SILENT_REASON } from "@/lib/coalter/mirror/decisionConstants";
import type { MirrorDiagnosticEntry } from "@/lib/coalter/mirror/types";

const MIRROR_ENV_KEY = "NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED";
const DIAG_ENV_KEY = "NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE";

// vitest environment: node。window は明示的に setup する必要がある
function setupWindow(): void {
  if (typeof (globalThis as Record<string, unknown>).window === "undefined") {
    (globalThis as Record<string, unknown>).window = {};
  }
}

function teardownWindow(): void {
  delete (globalThis as Record<string, unknown>).window;
}

function getDebugGlobal(): unknown {
  const key = __getDebugGlobalKeyForTest();
  if (typeof (globalThis as Record<string, unknown>).window === "undefined") return undefined;
  return ((globalThis as Record<string, unknown>).window as Record<string, unknown>)[key];
}

describe("B-5a diagnosticDebugGlobal — 二重 flag gating", () => {
  let origMirror: string | undefined;
  let origDiag: string | undefined;
  let origNodeEnv: string | undefined;

  beforeEach(() => {
    __resetDebugForTest();
    __resetSnapshotForTest();
    setupWindow();
    origMirror = process.env[MIRROR_ENV_KEY];
    origDiag = process.env[DIAG_ENV_KEY];
    origNodeEnv = process.env.NODE_ENV;
    delete process.env[MIRROR_ENV_KEY];
    delete process.env[DIAG_ENV_KEY];
    // NODE_ENV を development に (production guard を解除)
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  });

  afterEach(() => {
    __resetDebugForTest();
    teardownWindow();
    if (origMirror === undefined) delete process.env[MIRROR_ENV_KEY];
    else process.env[MIRROR_ENV_KEY] = origMirror;
    if (origDiag === undefined) delete process.env[DIAG_ENV_KEY];
    else process.env[DIAG_ENV_KEY] = origDiag;
    if (origNodeEnv === undefined)
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
  });

  it("両 flag OFF (default) → install されない", () => {
    installDiagnosticDebugGlobalIfEnabled();
    expect(__getInstalledForTest()).toBe(false);
    expect(getDebugGlobal()).toBeUndefined();
  });

  it("mirror channel flag のみ ON → install されない", () => {
    process.env[MIRROR_ENV_KEY] = "true";
    installDiagnosticDebugGlobalIfEnabled();
    expect(__getInstalledForTest()).toBe(false);
    expect(getDebugGlobal()).toBeUndefined();
  });

  it("diagnostic expose flag のみ ON → install されない", () => {
    process.env[DIAG_ENV_KEY] = "true";
    installDiagnosticDebugGlobalIfEnabled();
    expect(__getInstalledForTest()).toBe(false);
    expect(getDebugGlobal()).toBeUndefined();
  });

  it("両 flag ON + development → install される", () => {
    process.env[MIRROR_ENV_KEY] = "true";
    process.env[DIAG_ENV_KEY] = "true";
    installDiagnosticDebugGlobalIfEnabled();
    expect(__getInstalledForTest()).toBe(true);
    expect(getDebugGlobal()).toBeDefined();
  });

  // Phase C C-1: NODE_ENV === "production" guard を削除した。
  // 理由: Vercel Preview build は Next.js production build (NODE_ENV=production)
  // のため、本 guard が Preview canary 観測を意図せず block していた (Phase B
  // B-5c smoke で発覚、Phase B 完了 docs §7.1、Phase A §3.5 学び反映)。
  // 削除しても安全な根拠: Phase A §3.7 7-layer defense (env scope branch-scoped
  // only / 15-min expire / canary draft / cleanup / redacted only) が多重防御を構成。
  it("両 flag ON + production NODE_ENV → install される (C-1 で NODE_ENV guard 削除)", () => {
    process.env[MIRROR_ENV_KEY] = "true";
    process.env[DIAG_ENV_KEY] = "true";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    installDiagnosticDebugGlobalIfEnabled();
    expect(__getInstalledForTest()).toBe(true);
    expect(getDebugGlobal()).toBeDefined();
  });

  it("両 flag ON + NODE_ENV 未設定 → install される (production / preview / development 全 build 対応)", () => {
    process.env[MIRROR_ENV_KEY] = "true";
    process.env[DIAG_ENV_KEY] = "true";
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    installDiagnosticDebugGlobalIfEnabled();
    expect(__getInstalledForTest()).toBe(true);
    expect(getDebugGlobal()).toBeDefined();
  });

  it("idempotent install (2 回呼んでも 1 度のみ install)", () => {
    process.env[MIRROR_ENV_KEY] = "true";
    process.env[DIAG_ENV_KEY] = "true";
    installDiagnosticDebugGlobalIfEnabled();
    const firstApi = getDebugGlobal();
    installDiagnosticDebugGlobalIfEnabled();
    const secondApi = getDebugGlobal();
    expect(firstApi).toBe(secondApi);
  });
});

describe("B-5a diagnosticDebugGlobal — SSR guard", () => {
  let origMirror: string | undefined;
  let origDiag: string | undefined;
  let origNodeEnv: string | undefined;

  beforeEach(() => {
    __resetDebugForTest();
    teardownWindow(); // SSR (window 未定義) を模擬
    origMirror = process.env[MIRROR_ENV_KEY];
    origDiag = process.env[DIAG_ENV_KEY];
    origNodeEnv = process.env.NODE_ENV;
    process.env[MIRROR_ENV_KEY] = "true";
    process.env[DIAG_ENV_KEY] = "true";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  });

  afterEach(() => {
    __resetDebugForTest();
    if (origMirror === undefined) delete process.env[MIRROR_ENV_KEY];
    else process.env[MIRROR_ENV_KEY] = origMirror;
    if (origDiag === undefined) delete process.env[DIAG_ENV_KEY];
    else process.env[DIAG_ENV_KEY] = origDiag;
    if (origNodeEnv === undefined)
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
  });

  it("window 未定義 (SSR) → install されない", () => {
    installDiagnosticDebugGlobalIfEnabled();
    expect(__getInstalledForTest()).toBe(false);
  });
});

describe("B-5a diagnosticDebugGlobal — getSnapshot 経由の expire", () => {
  let origMirror: string | undefined;
  let origDiag: string | undefined;
  let origNodeEnv: string | undefined;

  beforeEach(() => {
    __resetDebugForTest();
    __resetSnapshotForTest();
    setupWindow();
    origMirror = process.env[MIRROR_ENV_KEY];
    origDiag = process.env[DIAG_ENV_KEY];
    origNodeEnv = process.env.NODE_ENV;
    process.env[MIRROR_ENV_KEY] = "true";
    process.env[DIAG_ENV_KEY] = "true";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  });

  afterEach(() => {
    __resetDebugForTest();
    teardownWindow();
    if (origMirror === undefined) delete process.env[MIRROR_ENV_KEY];
    else process.env[MIRROR_ENV_KEY] = origMirror;
    if (origDiag === undefined) delete process.env[DIAG_ENV_KEY];
    else process.env[DIAG_ENV_KEY] = origDiag;
    if (origNodeEnv === undefined)
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
  });

  it("install 直後 → getSnapshot は array を返す", () => {
    installDiagnosticDebugGlobalIfEnabled();
    pushDiagnosticEntry({
      decision: "STAY_SILENT",
      reason: MIRROR_STAY_SILENT_REASON.OBSERVE_UNKNOWN_MODE_CONTEXT,
      ervScore: undefined,
      modeContextStatus: "unknown",
      mode: null,
      alignmentBucket: "unknown",
      uncertaintyBucket: "unknown",
      silenceBudgetBucket: "unknown",
      patternCategoryBucket: "unknown_category",
      timestamp: Date.now(),
    });
    const api = getDebugGlobal() as { getSnapshot: () => unknown };
    const result = api.getSnapshot();
    expect(Array.isArray(result)).toBe(true);
    expect((result as MirrorDiagnosticEntry[]).length).toBe(1);
  });

  it("15-min 経過後 (install 時刻 override) → getSnapshot は expired を返す", () => {
    installDiagnosticDebugGlobalIfEnabled();
    const expireMs = __getExpireMsForTest();
    // install 時刻を 16 分前に override (expire 超過)
    __setInstalledAtForTest(Date.now() - expireMs - 1000);

    const api = getDebugGlobal() as { getSnapshot: () => unknown };
    const result = api.getSnapshot();
    expect(typeof result).toBe("object");
    expect((result as { error?: string }).error).toBe("expired");
  });

  it("getInstalledAt は install 時刻を返す", () => {
    installDiagnosticDebugGlobalIfEnabled();
    const api = getDebugGlobal() as { getInstalledAt: () => number | null };
    expect(api.getInstalledAt()).toBeTypeOf("number");
  });

  it("getRemainingMs は install 直後は約 15 分", () => {
    installDiagnosticDebugGlobalIfEnabled();
    const api = getDebugGlobal() as { getRemainingMs: () => number };
    const remaining = api.getRemainingMs();
    expect(remaining).toBeGreaterThan(__getExpireMsForTest() - 1000);
    expect(remaining).toBeLessThanOrEqual(__getExpireMsForTest());
  });

  it("getRemainingMs は expire 後 0 を返す", () => {
    installDiagnosticDebugGlobalIfEnabled();
    const expireMs = __getExpireMsForTest();
    __setInstalledAtForTest(Date.now() - expireMs - 1000);
    const api = getDebugGlobal() as { getRemainingMs: () => number };
    expect(api.getRemainingMs()).toBe(0);
  });

  it("selfDestroy で window から削除される", () => {
    installDiagnosticDebugGlobalIfEnabled();
    expect(getDebugGlobal()).toBeDefined();
    const api = getDebugGlobal() as { selfDestroy: () => void };
    api.selfDestroy();
    expect(getDebugGlobal()).toBeUndefined();
    expect(__getInstalledForTest()).toBe(false);
  });

  it("destroyDiagnosticDebugGlobal 直接呼出でも削除される", () => {
    installDiagnosticDebugGlobalIfEnabled();
    expect(getDebugGlobal()).toBeDefined();
    destroyDiagnosticDebugGlobal();
    expect(getDebugGlobal()).toBeUndefined();
    expect(__getInstalledForTest()).toBe(false);
  });
});

describe("B-5a diagnosticDebugGlobal — read-only API only (push / clear が expose されない)", () => {
  let origMirror: string | undefined;
  let origDiag: string | undefined;
  let origNodeEnv: string | undefined;

  beforeEach(() => {
    __resetDebugForTest();
    __resetSnapshotForTest();
    setupWindow();
    origMirror = process.env[MIRROR_ENV_KEY];
    origDiag = process.env[DIAG_ENV_KEY];
    origNodeEnv = process.env.NODE_ENV;
    process.env[MIRROR_ENV_KEY] = "true";
    process.env[DIAG_ENV_KEY] = "true";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  });

  afterEach(() => {
    __resetDebugForTest();
    teardownWindow();
    if (origMirror === undefined) delete process.env[MIRROR_ENV_KEY];
    else process.env[MIRROR_ENV_KEY] = origMirror;
    if (origDiag === undefined) delete process.env[DIAG_ENV_KEY];
    else process.env[DIAG_ENV_KEY] = origDiag;
    if (origNodeEnv === undefined)
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    else (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
  });

  it("debug global API は 4 method のみ (getSnapshot / getInstalledAt / getRemainingMs / selfDestroy)", () => {
    installDiagnosticDebugGlobalIfEnabled();
    const api = getDebugGlobal() as Record<string, unknown>;
    const keys = Object.keys(api).sort();
    expect(keys).toEqual(["getInstalledAt", "getRemainingMs", "getSnapshot", "selfDestroy"]);
  });

  it("push / clear / mutation 系 method は expose されない", () => {
    installDiagnosticDebugGlobalIfEnabled();
    const api = getDebugGlobal() as Record<string, unknown>;
    expect(api.push).toBeUndefined();
    expect(api.pushDiagnosticEntry).toBeUndefined();
    expect(api.clear).toBeUndefined();
    expect(api.clearDiagnostic).toBeUndefined();
    expect(api.set).toBeUndefined();
  });
});
