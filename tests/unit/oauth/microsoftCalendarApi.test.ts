/**
 * Track B TB-2 / TB-4 — microsoftCalendarApi unit test
 *
 * 検証範囲:
 *   - exchangeCodeForMicrosoftTokens: success / missing_refresh_token / missing_access_token /
 *     HTTP error (invalid_grant / unknown) / network / invalid_json
 *   - refreshMicrosoftAccessToken (TB-4): success / scope 必須送信 / empty / access_token 欠落 /
 *     HTTP error (invalid_grant / invalid_client / unknown) / network / invalid_json
 *   (= fetch mock、 Google googleCalendarApi.test + refreshGoogleAccessToken.test の MS 版)
 */

import { describe, expect, it, vi } from "vitest";

import {
  exchangeCodeForMicrosoftTokens,
  refreshMicrosoftAccessToken,
} from "@/lib/oauth/microsoftCalendarApi";

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// refreshMicrosoftAccessToken (= TB-4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const REFRESH_INPUT = {
  refreshToken: "rt-stored-1",
  clientId: "client-abc",
  clientSecret: "secret-xyz",
};

describe("refreshMicrosoftAccessToken", () => {
  it("成功 → accessToken/expires/scopes + token endpoint へ refresh_token grant POST", async () => {
    let calledUrl = "";
    let capturedBody = "";
    const fetchImpl = vi.fn(async (u: Parameters<typeof fetch>[0], init?: RequestInit) => {
      calledUrl = String(u);
      capturedBody = typeof init?.body === "string" ? init.body : "";
      return makeRes({
        status: 200,
        json: {
          access_token: "at-refreshed",
          expires_in: 3599,
          scope: "openid offline_access Calendars.Read",
          token_type: "Bearer",
        },
      });
    });
    const r = await refreshMicrosoftAccessToken(REFRESH_INPUT, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accessToken).toBe("at-refreshed");
      expect(r.expiresInSeconds).toBe(3599);
      expect(r.scopes).toContain("Calendars.Read");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calledUrl).toContain("login.microsoftonline.com");
    // MS は refresh 時 scope 必須 (= Google との差分) + grant_type / refresh_token を body に含む
    expect(capturedBody).toContain("grant_type=refresh_token");
    expect(capturedBody).toContain("refresh_token=rt-stored-1");
    expect(capturedBody).toContain("scope=");
  });

  it("refreshToken 空 → invalid_request (= fetch 呼ばない)", async () => {
    const fetchImpl = vi.fn(async () => makeRes({ status: 200 }));
    const r = await refreshMicrosoftAccessToken({ ...REFRESH_INPUT, refreshToken: "" }, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_request");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("expires_in 欠落 → 3600 default", async () => {
    const r = await refreshMicrosoftAccessToken(
      REFRESH_INPUT,
      vi.fn(async () => makeRes({ json: { access_token: "at" } })),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expiresInSeconds).toBe(3600);
  });

  it("access_token なし → unknown", async () => {
    const r = await refreshMicrosoftAccessToken(
      REFRESH_INPUT,
      vi.fn(async () => makeRes({ json: { expires_in: 3600 } })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });

  it("HTTP 400 invalid_grant → invalid_grant (= refresh_token 失効、 再接続要)", async () => {
    const r = await refreshMicrosoftAccessToken(
      REFRESH_INPUT,
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

  it("HTTP 401 invalid_client → invalid_client (= secret 不一致 = 設定不備)", async () => {
    const r = await refreshMicrosoftAccessToken(
      REFRESH_INPUT,
      vi.fn(async () => makeRes({ status: 401, json: { error: "invalid_client" } })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_client");
  });

  it("HTTP 400 未知 error code → unknown", async () => {
    const r = await refreshMicrosoftAccessToken(
      REFRESH_INPUT,
      vi.fn(async () => makeRes({ status: 400, json: { error: "interaction_required" } })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });

  it("network 例外 → network", async () => {
    const r = await refreshMicrosoftAccessToken(
      REFRESH_INPUT,
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("network");
  });

  it("invalid json (200) → unknown", async () => {
    const r = await refreshMicrosoftAccessToken(
      REFRESH_INPUT,
      vi.fn(async () => makeRes({ status: 200, throwJson: true })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });
});
