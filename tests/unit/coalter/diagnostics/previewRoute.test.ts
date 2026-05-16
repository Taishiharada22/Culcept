/**
 * CoAlter Movie Understanding — Diagnostics Retrieval Route Tests (A4 phase)
 *
 * 正本:
 *   - app/api/coalter/diagnostics/preview/route.ts (本 PR A4)
 *
 * CEO 必須 tests (2026-05-16):
 *   - production env → 404
 *   - non-preview env → 404
 *   - preview + missing token env → fail-closed (404)
 *   - preview + missing Authorization → 401
 *   - preview + invalid token → 403
 *   - preview + valid token → 200
 *   - response has no-store header
 *   - response contains only redacted snapshot
 *   - raw text / PII forbidden fields are absent
 *   - GET only / no runtime UI behavior
 *
 * 12 test category × 30+ individual tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../../../app/api/coalter/diagnostics/preview/route";
import {
  DIAGNOSTICS_TOKEN_CURRENT_ENV_VAR,
  DIAGNOSTICS_TOKEN_PREVIOUS_ENV_VAR,
} from "../../../../lib/coalter/understanding/diagnosticsRetrievalAuth";
import {
  clearRedactedUnderstandingDiagnosticsBuffer,
  resetSequenceNumberForTest,
  resetMaxBufferSizeForTest,
  createRedactedUnderstandingDiagnosticsEvent,
  appendRedactedUnderstandingDiagnosticsEvent,
  REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_NAME,
  PII_FORBIDDEN_FIELD_NAMES,
} from "../../../../lib/coalter/understanding/redactedDiagnosticsBuffer";

// ─────────────────────────────────────────────
// Helpers: env + buffer manipulation
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

function makeRequest(authHeader?: string | null): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined && authHeader !== null) {
    headers.authorization = authHeader;
  }
  return new Request("https://example.test/api/coalter/diagnostics/preview", {
    method: "GET",
    headers,
  });
}

function seedBuffer(count: number): void {
  for (let i = 0; i < count; i++) {
    const event = createRedactedUnderstandingDiagnosticsEvent({
      outcome: "success",
      understandingConfidence: 0.7 + i * 0.01,
      latencyMs: { total: 1000 + i * 10 },
      sourceCoverageCounts: { personAStargazerCount: 3 },
      missingDomainCount: 0,
    });
    if (event !== undefined) {
      appendRedactedUnderstandingDiagnosticsEvent(event);
    }
  }
}

beforeEach(() => {
  setVercelEnv(undefined);
  setCurrentToken(undefined);
  setPreviousToken(undefined);
  clearRedactedUnderstandingDiagnosticsBuffer();
  resetSequenceNumberForTest();
  resetMaxBufferSizeForTest();
});

afterEach(() => {
  setVercelEnv(undefined);
  setCurrentToken(undefined);
  setPreviousToken(undefined);
  clearRedactedUnderstandingDiagnosticsBuffer();
  resetSequenceNumberForTest();
  resetMaxBufferSizeForTest();
});

// ─────────────────────────────────────────────
// Test 1: production env → 404 (CEO 必須)
// ─────────────────────────────────────────────

describe("GET /api/coalter/diagnostics/preview — production env → 404 (CEO 必須)", () => {
  it("VERCEL_ENV='production' + valid auth → 404 (route 隠蔽)", async () => {
    setVercelEnv("production");
    setCurrentToken("any_token");
    const res = await GET(makeRequest("Bearer any_token"));
    expect(res.status).toBe(404);
  });

  it("VERCEL_ENV='production' + no auth → 404", async () => {
    setVercelEnv("production");
    setCurrentToken("any_token");
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it("VERCEL_ENV unset → 404", async () => {
    setVercelEnv(undefined);
    setCurrentToken("any_token");
    const res = await GET(makeRequest("Bearer any_token"));
    expect(res.status).toBe(404);
  });

  it("404 response → Cache-Control: no-store, private", async () => {
    setVercelEnv("production");
    const res = await GET(makeRequest());
    expect(res.headers.get("cache-control")).toBe("no-store, private");
  });
});

// ─────────────────────────────────────────────
// Test 2: non-preview env → 404 (CEO 必須)
// ─────────────────────────────────────────────

describe("GET — non-preview env → 404 (CEO 必須)", () => {
  it("development env → 404", async () => {
    setVercelEnv("development");
    setCurrentToken("any_token");
    const res = await GET(makeRequest("Bearer any_token"));
    expect(res.status).toBe(404);
  });

  it("staging (unknown) env → 404", async () => {
    setVercelEnv("staging");
    setCurrentToken("any_token");
    const res = await GET(makeRequest("Bearer any_token"));
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────
// Test 3: preview + missing token env → 404 (CEO 必須、fail-closed)
// ─────────────────────────────────────────────

describe("GET — preview + missing token env → 404 (CEO 必須、fail-closed)", () => {
  it("preview + CURRENT token env unset → 404", async () => {
    setVercelEnv("preview");
    setCurrentToken(undefined);
    const res = await GET(makeRequest("Bearer any_token"));
    expect(res.status).toBe(404);
  });

  it("preview + CURRENT token empty string → 404", async () => {
    setVercelEnv("preview");
    setCurrentToken("");
    const res = await GET(makeRequest("Bearer any_token"));
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────
// Test 4: preview + missing Authorization → 401 (CEO 必須)
// ─────────────────────────────────────────────

describe("GET — preview + missing Authorization → 401 (CEO 必須)", () => {
  it("no Authorization header → 401 + missing_authorization", async () => {
    setVercelEnv("preview");
    setCurrentToken("expected_token");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("missing_authorization");
  });

  it("malformed auth (Basic scheme) → 401 + invalid_authorization_format", async () => {
    setVercelEnv("preview");
    setCurrentToken("expected_token");
    const res = await GET(makeRequest("Basic dXNlcjpwYXNz"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid_authorization_format");
  });

  it("Bearer prefix なし → 401", async () => {
    setVercelEnv("preview");
    setCurrentToken("expected_token");
    const res = await GET(makeRequest("expected_token"));
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// Test 5: preview + invalid token → 403 (CEO 必須)
// ─────────────────────────────────────────────

describe("GET — preview + invalid token → 403 (CEO 必須)", () => {
  it("wrong token → 403 + invalid_token", async () => {
    setVercelEnv("preview");
    setCurrentToken("correct_token");
    const res = await GET(makeRequest("Bearer wrong_token"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("invalid_token");
  });

  it("length 違う wrong token → 403 (length fast-fail)", async () => {
    setVercelEnv("preview");
    setCurrentToken("correct_token_long_value");
    const res = await GET(makeRequest("Bearer short"));
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────
// Test 6: preview + valid token → 200 (CEO 必須)
// ─────────────────────────────────────────────

describe("GET — preview + valid token → 200 (CEO 必須)", () => {
  it("CURRENT token 一致 → 200 + snapshot", async () => {
    setVercelEnv("preview");
    setCurrentToken("valid_token_value");
    seedBuffer(3);
    const res = await GET(makeRequest("Bearer valid_token_value"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bufferName).toBe(REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_NAME);
    expect(body.bufferSize).toBe(3);
    expect(body.eventCount).toBe(3);
    expect(body.events).toHaveLength(3);
  });

  it("PREVIOUS token (rotation) → 200 + token_previous_used reason", async () => {
    setVercelEnv("preview");
    setCurrentToken("new_current_token");
    setPreviousToken("old_previous_token");
    seedBuffer(1);
    const res = await GET(makeRequest("Bearer old_previous_token"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reasonCodes).toContain("token_previous_used");
  });

  it("CURRENT token → 200 + token_current_used reason", async () => {
    setVercelEnv("preview");
    setCurrentToken("token_value");
    seedBuffer(1);
    const res = await GET(makeRequest("Bearer token_value"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reasonCodes).toContain("token_current_used");
  });

  it("empty buffer + valid token → 200 + eventCount=0", async () => {
    setVercelEnv("preview");
    setCurrentToken("token_value");
    const res = await GET(makeRequest("Bearer token_value"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bufferSize).toBe(0);
    expect(body.eventCount).toBe(0);
    expect(body.events).toEqual([]);
    expect(body.processMetadata.minSequenceNumber).toBeNull();
    expect(body.processMetadata.maxSequenceNumber).toBeNull();
  });
});

// ─────────────────────────────────────────────
// Test 7: Cache-Control no-store header (CEO 必須)
// ─────────────────────────────────────────────

describe("GET — response Cache-Control no-store (CEO 必須)", () => {
  it("200 response → Cache-Control: no-store, private", async () => {
    setVercelEnv("preview");
    setCurrentToken("valid_token");
    const res = await GET(makeRequest("Bearer valid_token"));
    expect(res.headers.get("cache-control")).toBe("no-store, private");
  });

  it("401 response → Cache-Control: no-store, private", async () => {
    setVercelEnv("preview");
    setCurrentToken("token");
    const res = await GET(makeRequest());
    expect(res.headers.get("cache-control")).toBe("no-store, private");
  });

  it("403 response → Cache-Control: no-store, private", async () => {
    setVercelEnv("preview");
    setCurrentToken("token");
    const res = await GET(makeRequest("Bearer wrong"));
    expect(res.headers.get("cache-control")).toBe("no-store, private");
  });

  it("404 response → Cache-Control: no-store, private", async () => {
    setVercelEnv("production");
    const res = await GET(makeRequest());
    expect(res.headers.get("cache-control")).toBe("no-store, private");
  });
});

// ─────────────────────────────────────────────
// Test 8: response contains only redacted snapshot (CEO 必須)
// ─────────────────────────────────────────────

describe("GET — response redacted snapshot only (CEO 必須)", () => {
  it("200 response shape: schemaVersion / retrievalApiVersion / bufferName / events", async () => {
    setVercelEnv("preview");
    setCurrentToken("token");
    seedBuffer(2);
    const res = await GET(makeRequest("Bearer token"));
    const body = await res.json();
    expect(body.schemaVersion).toBe("0.1.0");
    expect(body.retrievalApiVersion).toBe("0.1.0");
    expect(body.bufferName).toBe("coalter.movie.understanding_shadow_diagnostics");
    expect(body.bufferSchemaVersion).toBe("0.1.0");
    expect(body.events).toBeDefined();
    expect(body.processMetadata).toBeDefined();
    expect(body.reasonCodes).toBeDefined();
  });

  it("events 内 activation / shouldEmit 全て false", async () => {
    setVercelEnv("preview");
    setCurrentToken("token");
    seedBuffer(5);
    const res = await GET(makeRequest("Bearer token"));
    const body = await res.json();
    for (const event of body.events) {
      expect(event.activation).toBe(false);
      expect(event.shouldEmit).toBe(false);
    }
  });

  it("events 内 confidence / source coverage は bucket 化済", async () => {
    setVercelEnv("preview");
    setCurrentToken("token");
    seedBuffer(1);
    const res = await GET(makeRequest("Bearer token"));
    const body = await res.json();
    const event = body.events[0];
    expect(event.understandingConfidenceBucket).toMatch(/^(none_0|low_0_to_30|mid_30_to_70|high_70_plus)$/);
  });
});

// ─────────────────────────────────────────────
// Test 9: raw text / PII forbidden fields absent (CEO 必須)
// ─────────────────────────────────────────────

describe("GET — raw text / PII forbidden fields absent (CEO 必須)", () => {
  it("top-level keys に PII forbidden field 不含", async () => {
    setVercelEnv("preview");
    setCurrentToken("token");
    seedBuffer(3);
    const res = await GET(makeRequest("Bearer token"));
    const body = await res.json();
    const topKeys = Object.keys(body);
    for (const forbidden of PII_FORBIDDEN_FIELD_NAMES) {
      expect(topKeys).not.toContain(forbidden);
    }
  });

  it("events 内 keys に PII forbidden field 不含", async () => {
    setVercelEnv("preview");
    setCurrentToken("token");
    seedBuffer(3);
    const res = await GET(makeRequest("Bearer token"));
    const body = await res.json();
    for (const event of body.events) {
      const eventKeys = Object.keys(event);
      for (const forbidden of PII_FORBIDDEN_FIELD_NAMES) {
        expect(eventKeys).not.toContain(forbidden);
      }
    }
  });

  it("JSON stringify に userId / pairId / threadId / email / pairHash / timestamp 不在", async () => {
    setVercelEnv("preview");
    setCurrentToken("token");
    seedBuffer(3);
    const res = await GET(makeRequest("Bearer token"));
    const text = await res.text();
    expect(text).not.toContain("userId");
    expect(text).not.toContain("pairId");
    expect(text).not.toContain("threadId");
    expect(text).not.toContain("email");
    expect(text).not.toContain("pairHash");
    expect(text).not.toContain("timestamp");
    expect(text).not.toContain("rawMessage");
  });
});

// ─────────────────────────────────────────────
// Test 10: no console / Sentry / fetch / storage / DB (CEO 必須)
// ─────────────────────────────────────────────

describe("GET — no side effect (CEO 必須)", () => {
  it("console.log / console.warn / console.error 一切呼ばない (CEO 補正、audit log なし)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    setVercelEnv("preview");
    setCurrentToken("token");
    seedBuffer(2);
    await GET(makeRequest("Bearer token"));
    await GET(makeRequest("Bearer wrong"));
    await GET(makeRequest());

    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("fetch 呼ばない", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response()) as unknown as Promise<Response>;
    });
    setVercelEnv("preview");
    setCurrentToken("token");
    await GET(makeRequest("Bearer token"));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// Test 11: GET only / read-only (CEO 必須、構造的)
// ─────────────────────────────────────────────

describe("GET — GET only / read-only (CEO 必須、構造的確認)", () => {
  it("route file が GET handler のみ export (POST/PUT/DELETE 未定義)", async () => {
    const mod = await import("../../../../app/api/coalter/diagnostics/preview/route");
    expect(typeof mod.GET).toBe("function");
    expect((mod as Record<string, unknown>).POST).toBeUndefined();
    expect((mod as Record<string, unknown>).PUT).toBeUndefined();
    expect((mod as Record<string, unknown>).DELETE).toBeUndefined();
    expect((mod as Record<string, unknown>).PATCH).toBeUndefined();
    expect((mod as Record<string, unknown>).OPTIONS).toBeUndefined();
  });

  it("read-only: GET 後 buffer state 変化なし", async () => {
    setVercelEnv("preview");
    setCurrentToken("token");
    seedBuffer(3);
    const beforeSize = 3;
    await GET(makeRequest("Bearer token"));
    await GET(makeRequest("Bearer token"));
    await GET(makeRequest("Bearer token"));
    // buffer state 不変 (defensive copy で読むだけ)
    const res = await GET(makeRequest("Bearer token"));
    const body = await res.json();
    expect(body.bufferSize).toBe(beforeSize);
    expect(body.eventCount).toBe(beforeSize);
  });
});

// ─────────────────────────────────────────────
// Test 12: deterministic + no UI behavior (CEO 必須)
// ─────────────────────────────────────────────

describe("GET — deterministic + no UI behavior (CEO 必須)", () => {
  it("同 input → 同 output (deterministic)", async () => {
    setVercelEnv("preview");
    setCurrentToken("token");
    seedBuffer(2);
    const res1 = await GET(makeRequest("Bearer token"));
    const body1 = await res1.json();
    const res2 = await GET(makeRequest("Bearer token"));
    const body2 = await res2.json();
    expect(JSON.stringify(body1)).toBe(JSON.stringify(body2));
  });

  it("dynamic import 可能", async () => {
    const mod = await import("../../../../app/api/coalter/diagnostics/preview/route");
    expect(typeof mod.GET).toBe("function");
  });
});
