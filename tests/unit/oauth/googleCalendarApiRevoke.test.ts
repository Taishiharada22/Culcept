/**
 * P3-A-1-1-f — revokeGoogleToken unit test (= fetch mock 網羅)
 *
 * 検証範囲:
 *   - 200 OK → ok: true, alreadyRevoked: false
 *   - 400 invalid_token → ok: true, alreadyRevoked: true (= idempotent)
 *   - 401 / 500 → ok: false, reason='unknown'
 *   - network throw → ok: false, reason='network'
 *   - empty token → ok: false, reason='unknown' (= 防御的)
 *   - POST body format (= token=<encoded>)
 */

import { describe, expect, it, vi } from "vitest";

import { __test__, revokeGoogleToken } from "@/lib/oauth/googleCalendarApi";

function makeRes(status: number): Response {
  return new Response(null, { status });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("revokeGoogleToken — success", () => {
  it("200 OK → ok: true, alreadyRevoked: false + POST body 形式", async () => {
    const mockFetch = vi.fn(async () => makeRes(200));
    const r = await revokeGoogleToken("ya29.test-token-abc", mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.alreadyRevoked).toBe(false);

    expect(mockFetch).toHaveBeenCalledWith(
      __test__.GOOGLE_REVOKE_ENDPOINT,
      expect.objectContaining({ method: "POST" }),
    );
    const call = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((call[1].headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(call[1].body as string).toBe("token=ya29.test-token-abc");
  });

  it("token に URL-unsafe char → encoded", async () => {
    const mockFetch = vi.fn(async () => makeRes(200));
    await revokeGoogleToken("a/b+c=d", mockFetch);
    const call = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[1].body as string).toBe(`token=${encodeURIComponent("a/b+c=d")}`);
  });
});

describe("revokeGoogleToken — idempotent 400", () => {
  it("400 invalid_token → ok: true, alreadyRevoked: true", async () => {
    const mockFetch = vi.fn(async () => makeRes(400));
    const r = await revokeGoogleToken("token", mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.alreadyRevoked).toBe(true);
  });
});

describe("revokeGoogleToken — error mapping", () => {
  it("401 → reason='unknown'", async () => {
    const mockFetch = vi.fn(async () => makeRes(401));
    const r = await revokeGoogleToken("token", mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unknown");
      expect(r.detail).toBe("http_401");
    }
  });

  it("500 → reason='unknown'", async () => {
    const mockFetch = vi.fn(async () => makeRes(500));
    const r = await revokeGoogleToken("token", mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toBe("http_500");
  });

  it("fetch throw → reason='network'", async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const r = await revokeGoogleToken("token", mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("network");
      expect(r.detail).toContain("ECONNRESET");
    }
  });

  it("empty token → reason='unknown', detail='empty_token'", async () => {
    const mockFetch = vi.fn(async () => makeRes(200));
    const r = await revokeGoogleToken("", mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unknown");
      expect(r.detail).toBe("empty_token");
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
