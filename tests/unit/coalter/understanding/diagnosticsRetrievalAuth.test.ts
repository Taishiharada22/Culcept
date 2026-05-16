/**
 * CoAlter Movie Understanding — Diagnostics Retrieval Auth Tests (A4 phase)
 *
 * 正本:
 *   - lib/coalter/understanding/diagnosticsRetrievalAuth.ts (本 PR A4)
 *
 * CEO 必須 tests (2026-05-16):
 *   - production env → 404
 *   - non-preview env → 404
 *   - preview + missing token env → fail-closed (404)
 *   - preview + missing Authorization → 401
 *   - preview + invalid token → 403
 *   - preview + valid token → 200
 *   - timing-safe compare path tested
 *   - no console / Sentry / telemetry / DB / storage
 *
 * 16 test category × 50+ individual tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPreviewEnv,
  getExpectedTokens,
  extractBearerToken,
  timingSafeTokenEqual,
  checkDiagnosticsRetrievalAuth,
  authCheckResultToStatusCode,
  buildAuthErrorBody,
  DIAGNOSTICS_TOKEN_CURRENT_ENV_VAR,
  DIAGNOSTICS_TOKEN_PREVIOUS_ENV_VAR,
  VERCEL_ENV_PREVIEW,
  DIAGNOSTICS_RETRIEVAL_AUTH_VERSION,
  type AuthCheckResult,
} from "../../../../lib/coalter/understanding/diagnosticsRetrievalAuth";

// ─────────────────────────────────────────────
// Helpers: env manipulation (test-only)
// ─────────────────────────────────────────────

function setVercelEnv(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = value;
  }
}

function setCurrentToken(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[DIAGNOSTICS_TOKEN_CURRENT_ENV_VAR];
  } else {
    process.env[DIAGNOSTICS_TOKEN_CURRENT_ENV_VAR] = value;
  }
}

function setPreviousToken(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[DIAGNOSTICS_TOKEN_PREVIOUS_ENV_VAR];
  } else {
    process.env[DIAGNOSTICS_TOKEN_PREVIOUS_ENV_VAR] = value;
  }
}

beforeEach(() => {
  setVercelEnv(undefined);
  setCurrentToken(undefined);
  setPreviousToken(undefined);
});

afterEach(() => {
  setVercelEnv(undefined);
  setCurrentToken(undefined);
  setPreviousToken(undefined);
});

// ─────────────────────────────────────────────
// Test 1: isPreviewEnv (CEO 必須)
// ─────────────────────────────────────────────

describe("isPreviewEnv — env guard (CEO 必須)", () => {
  it("VERCEL_ENV 未設定 → false", () => {
    setVercelEnv(undefined);
    expect(isPreviewEnv()).toBe(false);
  });
  it("VERCEL_ENV='production' → false", () => {
    setVercelEnv("production");
    expect(isPreviewEnv()).toBe(false);
  });
  it("VERCEL_ENV='development' → false", () => {
    setVercelEnv("development");
    expect(isPreviewEnv()).toBe(false);
  });
  it("VERCEL_ENV='preview' → true", () => {
    setVercelEnv("preview");
    expect(isPreviewEnv()).toBe(true);
  });
  it("VERCEL_ENV='Preview' (case-sensitive) → false (Vercel が lower-case で設定)", () => {
    setVercelEnv("Preview");
    expect(isPreviewEnv()).toBe(false);
  });
  it("VERCEL_ENV='unknown' → false", () => {
    setVercelEnv("unknown");
    expect(isPreviewEnv()).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Test 2: getExpectedTokens
// ─────────────────────────────────────────────

describe("getExpectedTokens — token env retrieval", () => {
  it("CURRENT 未設定 → undefined", () => {
    setCurrentToken(undefined);
    const tokens = getExpectedTokens();
    expect(tokens.current).toBeUndefined();
    expect(tokens.previous).toBeUndefined();
  });
  it("CURRENT='' (empty) → undefined (fail-closed)", () => {
    setCurrentToken("");
    const tokens = getExpectedTokens();
    expect(tokens.current).toBeUndefined();
  });
  it("CURRENT='token_abc' → 'token_abc'", () => {
    setCurrentToken("token_abc");
    const tokens = getExpectedTokens();
    expect(tokens.current).toBe("token_abc");
  });
  it("CURRENT + PREVIOUS 両方設定 → 両方返却", () => {
    setCurrentToken("current_token_value");
    setPreviousToken("previous_token_value");
    const tokens = getExpectedTokens();
    expect(tokens.current).toBe("current_token_value");
    expect(tokens.previous).toBe("previous_token_value");
  });
  it("PREVIOUS のみ設定 → CURRENT undefined", () => {
    setCurrentToken(undefined);
    setPreviousToken("only_previous");
    const tokens = getExpectedTokens();
    expect(tokens.current).toBeUndefined();
    expect(tokens.previous).toBe("only_previous");
  });
});

// ─────────────────────────────────────────────
// Test 3: extractBearerToken
// ─────────────────────────────────────────────

describe("extractBearerToken — Authorization header parser", () => {
  it("null → undefined", () => {
    expect(extractBearerToken(null)).toBeUndefined();
  });
  it("undefined → undefined", () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
  });
  it("'' (empty) → undefined", () => {
    expect(extractBearerToken("")).toBeUndefined();
  });
  it("'Bearer abc123' → 'abc123'", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });
  it("'bearer abc123' (lower-case) → 'abc123' (case-insensitive)", () => {
    expect(extractBearerToken("bearer abc123")).toBe("abc123");
  });
  it("'BEARER abc123' (upper-case) → 'abc123'", () => {
    expect(extractBearerToken("BEARER abc123")).toBe("abc123");
  });
  it("'Bearer  abc123' (multi-space) → 'abc123'", () => {
    expect(extractBearerToken("Bearer  abc123")).toBe("abc123");
  });
  it("'Bearer abc 123' (space in token) → 'abc 123' (trim only outer)", () => {
    // 仕様: regex で `Bearer\s+(.+)$`、token 内 space は保持、trim で外側削除
    const result = extractBearerToken("Bearer abc 123");
    expect(result).toBe("abc 123");
  });
  it("' Bearer abc ' (outer whitespace) → 'abc'", () => {
    expect(extractBearerToken(" Bearer abc ")).toBe("abc");
  });
  it("'Basic abc' (Wrong scheme) → undefined", () => {
    expect(extractBearerToken("Basic abc")).toBeUndefined();
  });
  it("'Bearer ' (no token) → undefined", () => {
    expect(extractBearerToken("Bearer ")).toBeUndefined();
  });
  it("'abc' (no Bearer prefix) → undefined", () => {
    expect(extractBearerToken("abc")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Test 4: timing-safe compare (CEO 必須)
// ─────────────────────────────────────────────

describe("timingSafeTokenEqual — timing-safe compare (CEO 必須)", () => {
  it("同一 string → true", () => {
    const token = "abc123_random_secret_value_for_test_only";
    expect(timingSafeTokenEqual(token, token)).toBe(true);
  });
  it("異なる string (同 length) → false", () => {
    const a = "abc123_random_secret_value_for_test_only";
    const b = "xyz456_random_secret_value_for_test_only";
    expect(timingSafeTokenEqual(a, b)).toBe(false);
  });
  it("length 不一致 → false (fast-fail、throw しない)", () => {
    expect(timingSafeTokenEqual("short", "longer_token_value_here")).toBe(false);
    expect(timingSafeTokenEqual("longer_token_value_here", "short")).toBe(false);
  });
  it("empty string 同士 → true", () => {
    expect(timingSafeTokenEqual("", "")).toBe(true);
  });
  it("Unicode 文字対応", () => {
    const a = "トークン_test_secret";
    const b = "トークン_test_secret";
    expect(timingSafeTokenEqual(a, b)).toBe(true);
    const c = "トークン_test_secret";
    const d = "トークン_test_other_";
    expect(timingSafeTokenEqual(c, d)).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Test 5: checkDiagnosticsRetrievalAuth — production → 404 (CEO 必須)
// ─────────────────────────────────────────────

describe("checkDiagnosticsRetrievalAuth — production env → 404 (CEO 必須)", () => {
  it("VERCEL_ENV='production' + valid auth header → not_preview_env (status 404)", () => {
    setVercelEnv("production");
    setCurrentToken("any_token_value");
    const result = checkDiagnosticsRetrievalAuth("Bearer any_token_value");
    expect(result).toBe("not_preview_env" satisfies AuthCheckResult);
    expect(authCheckResultToStatusCode(result)).toBe(404);
  });
  it("VERCEL_ENV='production' + no auth → not_preview_env (status 404)", () => {
    setVercelEnv("production");
    setCurrentToken("any_token");
    expect(checkDiagnosticsRetrievalAuth(null)).toBe("not_preview_env");
  });
  it("VERCEL_ENV unset → not_preview_env (status 404)", () => {
    setVercelEnv(undefined);
    setCurrentToken("any_token");
    expect(checkDiagnosticsRetrievalAuth("Bearer any_token")).toBe("not_preview_env");
  });
});

// ─────────────────────────────────────────────
// Test 6: checkDiagnosticsRetrievalAuth — non-preview env → 404 (CEO 必須)
// ─────────────────────────────────────────────

describe("checkDiagnosticsRetrievalAuth — non-preview env → 404 (CEO 必須)", () => {
  it("VERCEL_ENV='development' → not_preview_env (404)", () => {
    setVercelEnv("development");
    setCurrentToken("any_token");
    expect(checkDiagnosticsRetrievalAuth("Bearer any_token")).toBe("not_preview_env");
  });
  it("VERCEL_ENV='staging' (unknown) → not_preview_env (404)", () => {
    setVercelEnv("staging");
    expect(checkDiagnosticsRetrievalAuth("Bearer any_token")).toBe("not_preview_env");
  });
});

// ─────────────────────────────────────────────
// Test 7: preview + missing token env → fail-closed 404 (CEO 必須)
// ─────────────────────────────────────────────

describe("checkDiagnosticsRetrievalAuth — preview + missing token env → 404 (CEO 必須)", () => {
  it("preview + CURRENT token env unset → token_env_unset (status 404)", () => {
    setVercelEnv("preview");
    setCurrentToken(undefined);
    const result = checkDiagnosticsRetrievalAuth("Bearer any_token_value");
    expect(result).toBe("token_env_unset" satisfies AuthCheckResult);
    expect(authCheckResultToStatusCode(result)).toBe(404);
  });
  it("preview + CURRENT token env empty string → token_env_unset (404、fail-closed)", () => {
    setVercelEnv("preview");
    setCurrentToken("");
    expect(checkDiagnosticsRetrievalAuth("Bearer any_token")).toBe("token_env_unset");
  });
});

// ─────────────────────────────────────────────
// Test 8: preview + missing Authorization → 401 (CEO 必須)
// ─────────────────────────────────────────────

describe("checkDiagnosticsRetrievalAuth — preview + missing Authorization → 401 (CEO 必須)", () => {
  it("preview + token env set + null Authorization → missing_authorization (401)", () => {
    setVercelEnv("preview");
    setCurrentToken("expected_token_value");
    const result = checkDiagnosticsRetrievalAuth(null);
    expect(result).toBe("missing_authorization" satisfies AuthCheckResult);
    expect(authCheckResultToStatusCode(result)).toBe(401);
  });
  it("preview + token env set + undefined Authorization → missing_authorization (401)", () => {
    setVercelEnv("preview");
    setCurrentToken("expected_token");
    expect(checkDiagnosticsRetrievalAuth(undefined)).toBe("missing_authorization");
  });
  it("preview + token env set + empty Authorization → missing_authorization (401)", () => {
    setVercelEnv("preview");
    setCurrentToken("expected_token");
    expect(checkDiagnosticsRetrievalAuth("")).toBe("missing_authorization");
  });
  it("preview + token env set + Basic auth scheme → invalid_authorization_format (401)", () => {
    setVercelEnv("preview");
    setCurrentToken("expected_token");
    const result = checkDiagnosticsRetrievalAuth("Basic dXNlcjpwYXNz");
    expect(result).toBe("invalid_authorization_format" satisfies AuthCheckResult);
    expect(authCheckResultToStatusCode(result)).toBe(401);
  });
});

// ─────────────────────────────────────────────
// Test 9: preview + invalid token → 403 (CEO 必須)
// ─────────────────────────────────────────────

describe("checkDiagnosticsRetrievalAuth — preview + invalid token → 403 (CEO 必須)", () => {
  it("preview + token env set + wrong token → invalid_token (403)", () => {
    setVercelEnv("preview");
    setCurrentToken("correct_token_value_xyz");
    const result = checkDiagnosticsRetrievalAuth("Bearer wrong_token_value_abc");
    expect(result).toBe("invalid_token" satisfies AuthCheckResult);
    expect(authCheckResultToStatusCode(result)).toBe(403);
  });
  it("preview + token env set + token length 違い → invalid_token (403)", () => {
    setVercelEnv("preview");
    setCurrentToken("correct_token_long_value");
    expect(checkDiagnosticsRetrievalAuth("Bearer short")).toBe("invalid_token");
  });
});

// ─────────────────────────────────────────────
// Test 10: preview + valid token → 200 (CEO 必須)
// ─────────────────────────────────────────────

describe("checkDiagnosticsRetrievalAuth — preview + valid token → 200 (CEO 必須)", () => {
  it("preview + CURRENT token 一致 → valid_token_current (200)", () => {
    setVercelEnv("preview");
    setCurrentToken("valid_secret_token_value");
    const result = checkDiagnosticsRetrievalAuth("Bearer valid_secret_token_value");
    expect(result).toBe("valid_token_current" satisfies AuthCheckResult);
    expect(authCheckResultToStatusCode(result)).toBe(200);
  });
  it("preview + PREVIOUS token 一致 (rotation window) → valid_token_previous (200)", () => {
    setVercelEnv("preview");
    setCurrentToken("new_current_token");
    setPreviousToken("old_previous_token");
    const result = checkDiagnosticsRetrievalAuth("Bearer old_previous_token");
    expect(result).toBe("valid_token_previous" satisfies AuthCheckResult);
    expect(authCheckResultToStatusCode(result)).toBe(200);
  });
  it("CURRENT 一致時は CURRENT 優先 (PREVIOUS も同値でも CURRENT 返却)", () => {
    setVercelEnv("preview");
    setCurrentToken("same_token");
    setPreviousToken("same_token");
    expect(checkDiagnosticsRetrievalAuth("Bearer same_token")).toBe("valid_token_current");
  });
  it("PREVIOUS 未設定 + CURRENT 一致 → valid_token_current", () => {
    setVercelEnv("preview");
    setCurrentToken("valid_token_value");
    setPreviousToken(undefined);
    expect(checkDiagnosticsRetrievalAuth("Bearer valid_token_value")).toBe(
      "valid_token_current",
    );
  });
});

// ─────────────────────────────────────────────
// Test 11: timing-safe compare path tested (CEO 必須)
// ─────────────────────────────────────────────

describe("checkDiagnosticsRetrievalAuth — timing-safe path (CEO 必須)", () => {
  it("length 同一の wrong token → invalid_token (timing-safe path 通過)", () => {
    setVercelEnv("preview");
    const correct = "aaaaaaaaaaaaaaaaaaaaaaaaa";
    const wrong = "bbbbbbbbbbbbbbbbbbbbbbbbb";
    setCurrentToken(correct);
    expect(checkDiagnosticsRetrievalAuth(`Bearer ${wrong}`)).toBe("invalid_token");
  });
  it("length 不一致の wrong token → invalid_token (length pre-check で fast-fail)", () => {
    setVercelEnv("preview");
    setCurrentToken("aaaaaaaaaa");
    expect(checkDiagnosticsRetrievalAuth("Bearer bbb")).toBe("invalid_token");
  });
});

// ─────────────────────────────────────────────
// Test 12: no console / Sentry / fetch / storage / DB (CEO 必須)
// ─────────────────────────────────────────────

describe("auth helper — no side effect (CEO 必須)", () => {
  it("console.log / console.warn / console.error 一切呼ばない", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    setVercelEnv("preview");
    setCurrentToken("expected_value");
    checkDiagnosticsRetrievalAuth("Bearer expected_value");
    checkDiagnosticsRetrievalAuth("Bearer wrong");
    checkDiagnosticsRetrievalAuth(null);
    checkDiagnosticsRetrievalAuth("Basic abc");

    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("fetch 呼ばない", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response()) as unknown as Promise<Response>;
    });
    setVercelEnv("preview");
    setCurrentToken("valid_token");
    checkDiagnosticsRetrievalAuth("Bearer valid_token");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// Test 13: status code mapping
// ─────────────────────────────────────────────

describe("authCheckResultToStatusCode", () => {
  it("not_preview_env → 404", () => {
    expect(authCheckResultToStatusCode("not_preview_env")).toBe(404);
  });
  it("token_env_unset → 404", () => {
    expect(authCheckResultToStatusCode("token_env_unset")).toBe(404);
  });
  it("missing_authorization → 401", () => {
    expect(authCheckResultToStatusCode("missing_authorization")).toBe(401);
  });
  it("invalid_authorization_format → 401", () => {
    expect(authCheckResultToStatusCode("invalid_authorization_format")).toBe(401);
  });
  it("invalid_token → 403", () => {
    expect(authCheckResultToStatusCode("invalid_token")).toBe(403);
  });
  it("valid_token_current → 200", () => {
    expect(authCheckResultToStatusCode("valid_token_current")).toBe(200);
  });
  it("valid_token_previous → 200", () => {
    expect(authCheckResultToStatusCode("valid_token_previous")).toBe(200);
  });
});

// ─────────────────────────────────────────────
// Test 14: buildAuthErrorBody (production stability、generic error)
// ─────────────────────────────────────────────

describe("buildAuthErrorBody — generic error (production stability)", () => {
  it("not_preview_env → null (404 body 不要)", () => {
    expect(buildAuthErrorBody("not_preview_env")).toBeNull();
  });
  it("token_env_unset → null (404)", () => {
    expect(buildAuthErrorBody("token_env_unset")).toBeNull();
  });
  it("missing_authorization → enum error code (no stack trace)", () => {
    const body = buildAuthErrorBody("missing_authorization");
    expect(body).toEqual({ error: "missing_authorization" });
  });
  it("invalid_token → enum error code", () => {
    expect(buildAuthErrorBody("invalid_token")).toEqual({ error: "invalid_token" });
  });
  it("valid_token_current → null (200 success path)", () => {
    expect(buildAuthErrorBody("valid_token_current")).toBeNull();
  });
});

// ─────────────────────────────────────────────
// Test 15: const exports
// ─────────────────────────────────────────────

describe("A4 auth helper — const exports", () => {
  it("DIAGNOSTICS_TOKEN_CURRENT_ENV_VAR", () => {
    expect(DIAGNOSTICS_TOKEN_CURRENT_ENV_VAR).toBe("COALTER_DIAGNOSTICS_TOKEN_CURRENT");
  });
  it("DIAGNOSTICS_TOKEN_PREVIOUS_ENV_VAR", () => {
    expect(DIAGNOSTICS_TOKEN_PREVIOUS_ENV_VAR).toBe("COALTER_DIAGNOSTICS_TOKEN_PREVIOUS");
  });
  it("VERCEL_ENV_PREVIEW = 'preview'", () => {
    expect(VERCEL_ENV_PREVIEW).toBe("preview");
  });
  it("DIAGNOSTICS_RETRIEVAL_AUTH_VERSION = '0.1.0'", () => {
    expect(DIAGNOSTICS_RETRIEVAL_AUTH_VERSION).toBe("0.1.0");
  });
});

// ─────────────────────────────────────────────
// Test 16: deterministic + no throw (CEO 必須)
// ─────────────────────────────────────────────

describe("checkDiagnosticsRetrievalAuth — deterministic + no throw", () => {
  it("同 input 100 回呼出で同一 output", () => {
    setVercelEnv("preview");
    setCurrentToken("test_token_value");
    const baseline = checkDiagnosticsRetrievalAuth("Bearer test_token_value");
    for (let i = 0; i < 100; i++) {
      expect(checkDiagnosticsRetrievalAuth("Bearer test_token_value")).toBe(baseline);
    }
  });

  it("malformed input でも throw しない", () => {
    setVercelEnv("preview");
    setCurrentToken("expected_token");
    expect(() => checkDiagnosticsRetrievalAuth(null)).not.toThrow();
    expect(() => checkDiagnosticsRetrievalAuth(undefined)).not.toThrow();
    expect(() => checkDiagnosticsRetrievalAuth("")).not.toThrow();
    expect(() => checkDiagnosticsRetrievalAuth("malformed")).not.toThrow();
    expect(() => checkDiagnosticsRetrievalAuth("Bearer")).not.toThrow();
    expect(() => checkDiagnosticsRetrievalAuth("Bearer  ")).not.toThrow();
  });
});
