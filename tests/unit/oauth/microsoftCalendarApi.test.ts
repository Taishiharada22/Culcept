/**
 * Track B TB-2 — microsoftCalendarApi unit test
 *
 * 検証範囲: exchangeCodeForMicrosoftTokens
 *   - success / missing_refresh_token / missing_access_token
 *   - HTTP error (invalid_grant / unknown) / network / invalid_json
 *   (= fetch mock、 Google googleCalendarApi.test の MS 版)
 */

import { describe, expect, it, vi } from "vitest";

import { exchangeCodeForMicrosoftTokens } from "@/lib/oauth/microsoftCalendarApi";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeRes(opts: { status?: number; json?: unknown; throwJson?: boolean }): Response {
  const status = opts.status ?? 200;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (opts.throwJson) throw new Error("invalid json");
      return opts.json ?? {};
    },
  } as unknown as Response;
}

const INPUT = {
  code: "auth-code-123",
  clientId: "client-abc",
  clientSecret: "secret-xyz",
  redirectUri: "http://localhost:3000/api/calendar/microsoft/callback",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// exchangeCodeForMicrosoftTokens
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("exchangeCodeForMicrosoftTokens", () => {
  it("成功 → access/refresh/expires/scopes 返却 + token endpoint へ POST", async () => {
    let calledUrl = "";
    const fetchImpl = vi.fn(async (u: Parameters<typeof fetch>[0]) => {
      calledUrl = String(u);
      return makeRes({
        status: 200,
        json: {
          access_token: "at-1",
          refresh_token: "rt-1",
          expires_in: 3600,
          scope: "openid offline_access Calendars.Read",
          token_type: "Bearer",
        },
      });
    });
    const r = await exchangeCodeForMicrosoftTokens(INPUT, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accessToken).toBe("at-1");
      expect(r.refreshToken).toBe("rt-1");
      expect(r.expiresInSeconds).toBe(3600);
      expect(r.scopes).toContain("Calendars.Read");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // token endpoint は Microsoft identity platform
    expect(calledUrl).toContain("login.microsoftonline.com");
  });

  it("expires_in 欠落 → 3600 default", async () => {
    const r = await exchangeCodeForMicrosoftTokens(
      INPUT,
      vi.fn(async () => makeRes({ json: { access_token: "at", refresh_token: "rt" } })),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expiresInSeconds).toBe(3600);
  });

  it("refresh_token なし → missing_refresh_token", async () => {
    const r = await exchangeCodeForMicrosoftTokens(
      INPUT,
      vi.fn(async () => makeRes({ json: { access_token: "at", expires_in: 3600 } })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_refresh_token");
  });

  it("access_token なし → unknown", async () => {
    const r = await exchangeCodeForMicrosoftTokens(
      INPUT,
      vi.fn(async () => makeRes({ json: { refresh_token: "rt" } })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });

  it("HTTP 400 invalid_grant → invalid_grant", async () => {
    const r = await exchangeCodeForMicrosoftTokens(
      INPUT,
      vi.fn(async () =>
        makeRes({ status: 400, json: { error: "invalid_grant", error_description: "expired" } }),
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("invalid_grant");
      expect(r.detail).toBe("expired");
    }
  });

  it("HTTP 400 未知 error code → unknown", async () => {
    const r = await exchangeCodeForMicrosoftTokens(
      INPUT,
      vi.fn(async () => makeRes({ status: 400, json: { error: "interaction_required" } })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });

  it("network 例外 → network", async () => {
    const r = await exchangeCodeForMicrosoftTokens(
      INPUT,
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("network");
  });

  it("invalid json (200) → unknown", async () => {
    const r = await exchangeCodeForMicrosoftTokens(
      INPUT,
      vi.fn(async () => makeRes({ status: 200, throwJson: true })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });
});
