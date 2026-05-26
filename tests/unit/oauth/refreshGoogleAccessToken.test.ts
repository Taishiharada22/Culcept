/**
 * P3-A-1-2 E-α — refreshGoogleAccessToken unit test (= fetch mock 網羅)
 *
 * 検証範囲:
 *   - 200 success → ok with accessToken / expiresInSeconds / scopes
 *   - 200 + scope 文字列 → 配列に分解
 *   - 200 + expires_in なし → default 3600
 *   - 200 + access_token 空 → reason='unknown'
 *   - 200 + malformed JSON → reason='unknown'
 *   - 400 invalid_grant → reason='invalid_grant' (= 再連携要)
 *   - 400 invalid_client → reason='invalid_client' (= 設定不備)
 *   - 400 invalid_request → reason='invalid_request'
 *   - 400 unknown error → reason='unknown'
 *   - 500 → reason='unknown'
 *   - network throw → reason='network'
 *   - 空 refreshToken → reason='invalid_request', detail='empty_refresh_token'
 *   - POST body form encode + content-type
 */

import { describe, expect, it, vi } from "vitest";

import {
  __test__,
  refreshGoogleAccessToken,
} from "@/lib/oauth/googleCalendarApi";

function makeJsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeTextRes(status: number, text: string): Response {
  return new Response(text, { status, headers: { "Content-Type": "text/plain" } });
}

const BASE_INPUT = {
  refreshToken: "1//refresh_token_value",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("refreshGoogleAccessToken — success", () => {
  it("200 → ok with accessToken / expiresInSeconds / scopes 配列", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(200, {
        access_token: "ya29.newaccess",
        expires_in: 3599,
        scope:
          "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        token_type: "Bearer",
      }),
    );
    const r = await refreshGoogleAccessToken(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accessToken).toBe("ya29.newaccess");
      expect(r.expiresInSeconds).toBe(3599);
      expect(r.scopes).toHaveLength(2);
      expect(r.scopes).toContain(
        "https://www.googleapis.com/auth/calendar.events.readonly",
      );
    }
  });

  it("POST body は form-urlencoded で grant_type=refresh_token + refresh_token + client_id + client_secret", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(200, { access_token: "a", expires_in: 3600 }),
    );
    await refreshGoogleAccessToken(BASE_INPUT, mockFetch);

    expect(mockFetch).toHaveBeenCalledWith(
      __test__.GOOGLE_TOKEN_ENDPOINT,
      expect.objectContaining({ method: "POST" }),
    );

    const call = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((call[1].headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    const body = call[1].body as string;
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain(`refresh_token=${encodeURIComponent(BASE_INPUT.refreshToken)}`);
    expect(body).toContain(`client_id=${BASE_INPUT.clientId}`);
    expect(body).toContain(`client_secret=${BASE_INPUT.clientSecret}`);
  });

  it("expires_in 不在 → default 3600 秒", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(200, { access_token: "a", scope: "" }),
    );
    const r = await refreshGoogleAccessToken(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expiresInSeconds).toBe(3600);
  });

  it("scope 不在 → scopes 空配列", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(200, { access_token: "a", expires_in: 100 }),
    );
    const r = await refreshGoogleAccessToken(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scopes).toEqual([]);
  });
});

describe("refreshGoogleAccessToken — error mapping", () => {
  it("400 invalid_grant → reason='invalid_grant' (= refresh_token 失効、 再連携要)", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(400, {
        error: "invalid_grant",
        error_description: "Token has been expired or revoked.",
      }),
    );
    const r = await refreshGoogleAccessToken(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("invalid_grant");
      expect(r.detail).toContain("expired or revoked");
    }
  });

  it("400 invalid_client → reason='invalid_client' (= 設定不備)", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(400, { error: "invalid_client" }),
    );
    const r = await refreshGoogleAccessToken(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_client");
  });

  it("400 invalid_request → reason='invalid_request'", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(400, { error: "invalid_request" }),
    );
    const r = await refreshGoogleAccessToken(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_request");
  });

  it("400 unknown error → reason='unknown'", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(400, { error: "some_new_error" }),
    );
    const r = await refreshGoogleAccessToken(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });

  it("500 → reason='unknown'", async () => {
    const mockFetch = vi.fn(async () => makeJsonRes(500, {}));
    const r = await refreshGoogleAccessToken(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });

  it("fetch throw (= network error) → reason='network'", async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const r = await refreshGoogleAccessToken(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("network");
      expect(r.detail).toContain("ECONNRESET");
    }
  });

  it("空 refreshToken → reason='invalid_request', detail='empty_refresh_token'", async () => {
    const mockFetch = vi.fn(async () => makeJsonRes(200, {}));
    const r = await refreshGoogleAccessToken(
      { ...BASE_INPUT, refreshToken: "" },
      mockFetch,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("invalid_request");
      expect(r.detail).toBe("empty_refresh_token");
    }
    // body validation 前に reject、 fetch 呼ばれない
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("200 but access_token 空 → reason='unknown', detail='missing_access_token'", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(200, { access_token: "", expires_in: 3600 }),
    );
    const r = await refreshGoogleAccessToken(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unknown");
      expect(r.detail).toBe("missing_access_token");
    }
  });

  it("200 but malformed JSON → reason='unknown', detail='invalid_json'", async () => {
    const mockFetch = vi.fn(async () => makeTextRes(200, "not json"));
    const r = await refreshGoogleAccessToken(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toBe("invalid_json");
  });
});
