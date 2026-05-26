/**
 * P3-A-1-1-d — googleCalendarApi unit test (= fetch mock 網羅)
 *
 * 検証範囲:
 *   - exchangeCodeForTokens:
 *     - 200 success → ok: true + access/refresh token / scopes / expires
 *     - 400 invalid_grant → reason='invalid_grant'
 *     - 400 invalid_client → reason='invalid_client'
 *     - 400 invalid_request → reason='invalid_request'
 *     - 500 other error → reason='unknown'
 *     - network fetch throw → reason='network'
 *     - 200 but no refresh_token → reason='missing_refresh_token'
 *     - 200 but malformed JSON → reason='unknown'
 *   - fetchCalendarList:
 *     - 200 with items → ok + filter 不正 item
 *     - 401 → reason='unauthorized'
 *     - 500 → reason='unknown'
 *     - network → reason='network'
 *     - 200 but items missing → reason='unknown'
 */

import { describe, expect, it, vi } from "vitest";

import {
  __test__,
  exchangeCodeForTokens,
  fetchCalendarList,
} from "@/lib/oauth/googleCalendarApi";

function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeTextResponse(status: number, text: string): Response {
  return new Response(text, { status, headers: { "Content-Type": "text/plain" } });
}

const TOKEN_INPUT = {
  code: "test_code_abc",
  clientId: "test_client_id",
  clientSecret: "test_client_secret",
  redirectUri: "http://localhost:3000/api/calendar/google/callback",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("exchangeCodeForTokens — success", () => {
  it("200 + refresh_token あり → ok with tokens / scopes / expires", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonResponse(200, {
        access_token: "ya29.access",
        refresh_token: "1//refresh",
        expires_in: 3599,
        scope:
          "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        token_type: "Bearer",
      }),
    );
    const r = await exchangeCodeForTokens(TOKEN_INPUT, mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.accessToken).toBe("ya29.access");
      expect(r.refreshToken).toBe("1//refresh");
      expect(r.expiresInSeconds).toBe(3599);
      expect(r.scopes).toHaveLength(2);
      expect(r.scopes).toContain(
        "https://www.googleapis.com/auth/calendar.events.readonly",
      );
    }
    // POST to token endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      __test__.GOOGLE_TOKEN_ENDPOINT,
      expect.objectContaining({ method: "POST" }),
    );
    // body は urlencoded
    const call = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    const callArgs = call[1];
    expect((callArgs.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(callArgs.body as string).toContain(`code=${TOKEN_INPUT.code}`);
    expect(callArgs.body as string).toContain(`client_id=${TOKEN_INPUT.clientId}`);
    expect(callArgs.body as string).toContain(`grant_type=authorization_code`);
  });

  it("expires_in 不在 → default 3600 秒", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonResponse(200, { access_token: "a", refresh_token: "r", scope: "" }),
    );
    const r = await exchangeCodeForTokens(TOKEN_INPUT, mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.expiresInSeconds).toBe(3600);
  });
});

describe("exchangeCodeForTokens — error mapping", () => {
  it("400 invalid_grant → reason='invalid_grant'", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonResponse(400, { error: "invalid_grant", error_description: "code expired" }),
    );
    const r = await exchangeCodeForTokens(TOKEN_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("invalid_grant");
      expect(r.detail).toBe("code expired");
    }
  });

  it("400 invalid_client → reason='invalid_client'", async () => {
    const mockFetch = vi.fn(async () => makeJsonResponse(400, { error: "invalid_client" }));
    const r = await exchangeCodeForTokens(TOKEN_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_client");
  });

  it("400 invalid_request → reason='invalid_request'", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonResponse(400, { error: "invalid_request" }),
    );
    const r = await exchangeCodeForTokens(TOKEN_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_request");
  });

  it("500 server_error → reason='unknown'", async () => {
    const mockFetch = vi.fn(async () => makeJsonResponse(500, { error: "server_error" }));
    const r = await exchangeCodeForTokens(TOKEN_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });

  it("fetch throw (= network error) → reason='network'", async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const r = await exchangeCodeForTokens(TOKEN_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("network");
      expect(r.detail).toContain("ECONNREFUSED");
    }
  });

  it("200 but missing refresh_token → reason='missing_refresh_token'", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonResponse(200, { access_token: "a", expires_in: 3600 }),
    );
    const r = await exchangeCodeForTokens(TOKEN_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_refresh_token");
  });

  it("200 but malformed JSON → reason='unknown'", async () => {
    const mockFetch = vi.fn(async () => makeTextResponse(200, "not json"));
    const r = await exchangeCodeForTokens(TOKEN_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });

  it("200 but access_token 空 → reason='unknown'", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonResponse(200, { access_token: "", refresh_token: "r" }),
    );
    const r = await exchangeCodeForTokens(TOKEN_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("fetchCalendarList — success", () => {
  it("200 + items 正常 → ok with items", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonResponse(200, {
        items: [
          { id: "primary", summary: "Me", primary: true, accessRole: "owner" },
          { id: "work@example.com", summary: "Work", accessRole: "writer" },
          { id: "share@grp.google.com", summary: "Shared", accessRole: "reader" },
        ],
      }),
    );
    const r = await fetchCalendarList("access_token_xyz", mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items).toHaveLength(3);
      expect(r.items[0]?.id).toBe("primary");
      expect(r.items[0]?.primary).toBe(true);
      expect(r.items[1]?.accessRole).toBe("writer");
    }
    // Bearer header
    const call = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    const args = call[1];
    expect((args.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer access_token_xyz",
    );
  });

  it("不正 shape item (= id 欠落) は skip", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonResponse(200, {
        items: [
          { id: "good", summary: "OK", accessRole: "owner" },
          { summary: "bad — no id", accessRole: "owner" }, // skip
          { id: "bad2", accessRole: "invalid_role" }, // skip (= role 不正)
          { id: "good2", summary: "OK2", accessRole: "freeBusyReader" },
        ],
      }),
    );
    const r = await fetchCalendarList("access_token", mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items).toHaveLength(2);
      expect(r.items.map((i) => i.id)).toEqual(["good", "good2"]);
    }
  });
});

describe("fetchCalendarList — error mapping", () => {
  it("401 → reason='unauthorized'", async () => {
    const mockFetch = vi.fn(async () => makeJsonResponse(401, { error: { code: 401 } }));
    const r = await fetchCalendarList("access", mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unauthorized");
  });

  it("500 → reason='unknown'", async () => {
    const mockFetch = vi.fn(async () => makeJsonResponse(500, {}));
    const r = await fetchCalendarList("access", mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });

  it("fetch throw → reason='network'", async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error("timeout");
    });
    const r = await fetchCalendarList("access", mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("network");
  });

  it("items 配列でない → reason='unknown'", async () => {
    const mockFetch = vi.fn(async () => makeJsonResponse(200, { items: "not array" }));
    const r = await fetchCalendarList("access", mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });
});
