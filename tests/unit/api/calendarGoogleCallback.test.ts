/**
 * P3-A-1-1-d — callback route handler unit test
 *
 * 検証範囲:
 *   - env 未設定 → /plan?calendar_connect_error=not_configured
 *   - Google error parameter (= access_denied) → /plan?calendar_connect_error=canceled
 *   - code or state 不在 → /plan?calendar_connect_error=invalid_request
 *   - state cookie 不在 → /plan?calendar_connect_error=state_missing
 *   - state mismatch → /plan?calendar_connect_error=state_mismatch
 *   - token exchange invalid_grant → /plan?calendar_connect_error=token_invalid_grant
 *   - authn 失敗 → /login?next=/plan
 *   - connection DB 失敗 → /plan?calendar_connect_error=db_connection_failed
 *   - 成功 → /plan?calendar_connected=1
 *   - calendar list 失敗 → /plan?calendar_connected=1&calendar_connect_partial=1
 *   - subscriptions DB 失敗 → /plan?calendar_connected=1&calendar_connect_partial=1
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mocks (= module 単位、 import 前)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let mockAuthState: {
  data: { user: { id: string } | null };
  error: Error | null;
  threw?: boolean;
} = {
  data: { user: { id: "user-test-uuid" } },
  error: null,
};

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn(async () => {
    if (mockAuthState.threw) throw new Error("[mock] supabaseServer threw");
    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: mockAuthState.data,
          error: mockAuthState.error,
        })),
      },
      // for repository: from() を mock しない (= repository 側を mock する)
    };
  }),
}));

const mockExchangeCodeForTokens = vi.fn();
const mockFetchCalendarList = vi.fn();
vi.mock("@/lib/oauth/googleCalendarApi", () => ({
  exchangeCodeForTokens: (...args: unknown[]) => mockExchangeCodeForTokens(...args),
  fetchCalendarList: (...args: unknown[]) => mockFetchCalendarList(...args),
}));

const mockUpsertConnection = vi.fn();
const mockBulkUpsertSubscriptions = vi.fn();
vi.mock("@/lib/oauth/calendarConnectionRepository", () => ({
  upsertConnection: (...args: unknown[]) => mockUpsertConnection(...args),
  bulkUpsertSubscriptions: (...args: unknown[]) =>
    mockBulkUpsertSubscriptions(...args),
}));

// state verify は real 利用 (= 既存 helper、 round-trip で test 確証あり)
import { generateState } from "@/lib/oauth/googleCalendarState";
import { GET } from "@/app/api/calendar/google/callback/route";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Env setup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ENV_BACKUP: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_CALENDAR_REDIRECT_URI",
  "OAUTH_STATE_SECRET",
  "OAUTH_TOKEN_ENCRYPTION_KEY",
  "NODE_ENV",
] as const;

const TEST_STATE_SECRET = "test-state-secret-for-callback";
const TEST_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64"); // 32 bytes固定 key

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  for (const k of ENV_KEYS) ENV_BACKUP[k] = process.env[k];
  setEnv("GOOGLE_CALENDAR_CLIENT_ID", "test-client-id");
  setEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "test-client-secret");
  setEnv("GOOGLE_CALENDAR_REDIRECT_URI", "http://localhost:3000/api/calendar/google/callback");
  setEnv("OAUTH_STATE_SECRET", TEST_STATE_SECRET);
  setEnv("OAUTH_TOKEN_ENCRYPTION_KEY", TEST_TOKEN_KEY);
  setEnv("NODE_ENV", "test");

  mockAuthState = { data: { user: { id: "user-test-uuid" } }, error: null };

  mockExchangeCodeForTokens.mockReset();
  mockFetchCalendarList.mockReset();
  mockUpsertConnection.mockReset();
  mockBulkUpsertSubscriptions.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) setEnv(k, ENV_BACKUP[k]);
});

function makeCallbackRequest(opts: {
  code?: string;
  state?: string;
  error?: string;
  cookieValue?: string;
}): NextRequest {
  const url = new URL("http://localhost:3000/api/calendar/google/callback");
  if (opts.code !== undefined) url.searchParams.set("code", opts.code);
  if (opts.state !== undefined) url.searchParams.set("state", opts.state);
  if (opts.error !== undefined) url.searchParams.set("error", opts.error);

  const req = new NextRequest(url);
  if (opts.cookieValue !== undefined) {
    req.cookies.set("gcal_oauth_state", opts.cookieValue);
  }
  return req;
}

/** state を生成 + cookie value + url state value のペア取得 */
function makeValidStatePair(): { state: string; cookieValue: string } {
  const r = generateState(TEST_STATE_SECRET);
  return { state: r.state, cookieValue: r.signedCookieValue };
}

function locationOf(res: Response): URL {
  return new URL(res.headers.get("location") ?? "");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("callback route — env degrade", () => {
  it("OAUTH_TOKEN_ENCRYPTION_KEY 未設定 → not_configured", async () => {
    setEnv("OAUTH_TOKEN_ENCRYPTION_KEY", undefined);
    const req = makeCallbackRequest({ code: "c", state: "s", cookieValue: "any" });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe(
      "not_configured",
    );
  });

  it("CLIENT_SECRET 未設定 → not_configured", async () => {
    setEnv("GOOGLE_CALENDAR_CLIENT_SECRET", undefined);
    const req = makeCallbackRequest({ code: "c", state: "s", cookieValue: "any" });
    const res = await GET(req);
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe(
      "not_configured",
    );
  });
});

describe("callback route — Google error / invalid request", () => {
  it("Google error=access_denied (= user キャンセル) → canceled", async () => {
    const req = makeCallbackRequest({ error: "access_denied" });
    const res = await GET(req);
    const loc = locationOf(res);
    expect(loc.searchParams.get("calendar_connect_error")).toBe("canceled");
    expect(loc.searchParams.get("google_error")).toBe("access_denied");
  });

  it("code 不在 → invalid_request", async () => {
    const req = makeCallbackRequest({ state: "s", cookieValue: "any" });
    const res = await GET(req);
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe(
      "invalid_request",
    );
  });

  it("state 不在 → invalid_request", async () => {
    const req = makeCallbackRequest({ code: "c", cookieValue: "any" });
    const res = await GET(req);
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe(
      "invalid_request",
    );
  });
});

describe("callback route — state verification", () => {
  it("state cookie 不在 → state_missing", async () => {
    const req = makeCallbackRequest({ code: "c", state: "s" });
    const res = await GET(req);
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe(
      "state_missing",
    );
  });

  it("state cookie の signature 不正 → state_mismatch", async () => {
    const req = makeCallbackRequest({
      code: "c",
      state: "s",
      cookieValue: "malformed-no-separator",
    });
    const res = await GET(req);
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe(
      "state_mismatch",
    );
  });

  it("cookie の state と URL の state 不一致 → state_mismatch", async () => {
    const valid = makeValidStatePair();
    const req = makeCallbackRequest({
      code: "c",
      state: "wrong-state",
      cookieValue: valid.cookieValue,
    });
    const res = await GET(req);
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe(
      "state_mismatch",
    );
  });
});

describe("callback route — token exchange degrade", () => {
  it("invalid_grant → token_invalid_grant", async () => {
    const valid = makeValidStatePair();
    mockExchangeCodeForTokens.mockResolvedValueOnce({
      ok: false,
      reason: "invalid_grant",
      detail: "code expired",
    });
    const req = makeCallbackRequest({
      code: "c",
      state: valid.state,
      cookieValue: valid.cookieValue,
    });
    const res = await GET(req);
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe(
      "token_invalid_grant",
    );
  });

  it("network error → token_network", async () => {
    const valid = makeValidStatePair();
    mockExchangeCodeForTokens.mockResolvedValueOnce({ ok: false, reason: "network" });
    const req = makeCallbackRequest({
      code: "c",
      state: valid.state,
      cookieValue: valid.cookieValue,
    });
    const res = await GET(req);
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe(
      "token_network",
    );
  });
});

describe("callback route — auth degrade", () => {
  it("authn 失敗 → /login?next=/plan", async () => {
    const valid = makeValidStatePair();
    mockExchangeCodeForTokens.mockResolvedValueOnce({
      ok: true,
      accessToken: "a",
      refreshToken: "r",
      expiresInSeconds: 3600,
      scopes: ["s1"],
    });
    mockAuthState = { data: { user: null }, error: null };

    const req = makeCallbackRequest({
      code: "c",
      state: valid.state,
      cookieValue: valid.cookieValue,
    });
    const res = await GET(req);
    expect(res.status).toBe(307);
    const loc = locationOf(res);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/plan");
  });
});

describe("callback route — DB degrade", () => {
  it("connection upsert 失敗 → db_connection_failed", async () => {
    const valid = makeValidStatePair();
    mockExchangeCodeForTokens.mockResolvedValueOnce({
      ok: true,
      accessToken: "a",
      refreshToken: "r",
      expiresInSeconds: 3600,
      scopes: ["s1"],
    });
    mockUpsertConnection.mockResolvedValueOnce({
      ok: false,
      reason: "db_error",
      detail: "permission denied",
    });

    const req = makeCallbackRequest({
      code: "c",
      state: valid.state,
      cookieValue: valid.cookieValue,
    });
    const res = await GET(req);
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe(
      "db_connection_failed",
    );
  });
});

describe("callback route — partial success (= calendar list 失敗)", () => {
  it("connection upsert 成功 + list 失敗 → calendar_connected=1 + partial=1", async () => {
    const valid = makeValidStatePair();
    mockExchangeCodeForTokens.mockResolvedValueOnce({
      ok: true,
      accessToken: "a",
      refreshToken: "r",
      expiresInSeconds: 3600,
      scopes: ["s1"],
    });
    mockUpsertConnection.mockResolvedValueOnce({
      ok: true,
      connectionId: "conn-1",
    });
    mockFetchCalendarList.mockResolvedValueOnce({
      ok: false,
      reason: "unauthorized",
    });

    const req = makeCallbackRequest({
      code: "c",
      state: valid.state,
      cookieValue: valid.cookieValue,
    });
    const res = await GET(req);
    const loc = locationOf(res);
    expect(loc.searchParams.get("calendar_connected")).toBe("1");
    expect(loc.searchParams.get("calendar_connect_partial")).toBe("1");
    // subscriptions は呼ばれない
    expect(mockBulkUpsertSubscriptions).not.toHaveBeenCalled();
  });

  it("subscriptions upsert 失敗 → calendar_connected=1 + partial=1", async () => {
    const valid = makeValidStatePair();
    mockExchangeCodeForTokens.mockResolvedValueOnce({
      ok: true,
      accessToken: "a",
      refreshToken: "r",
      expiresInSeconds: 3600,
      scopes: ["s1"],
    });
    mockUpsertConnection.mockResolvedValueOnce({
      ok: true,
      connectionId: "conn-1",
    });
    mockFetchCalendarList.mockResolvedValueOnce({
      ok: true,
      items: [{ id: "p", summary: "P", primary: true, accessRole: "owner" }],
    });
    mockBulkUpsertSubscriptions.mockResolvedValueOnce({
      ok: false,
      reason: "db_error",
      detail: "constraint",
    });

    const req = makeCallbackRequest({
      code: "c",
      state: valid.state,
      cookieValue: valid.cookieValue,
    });
    const res = await GET(req);
    const loc = locationOf(res);
    expect(loc.searchParams.get("calendar_connected")).toBe("1");
    expect(loc.searchParams.get("calendar_connect_partial")).toBe("1");
  });
});

describe("callback route — full success", () => {
  it("全 step 成功 → /plan?calendar_connected=1 (partial なし)", async () => {
    const valid = makeValidStatePair();
    mockExchangeCodeForTokens.mockResolvedValueOnce({
      ok: true,
      accessToken: "a_test",
      refreshToken: "r_test",
      expiresInSeconds: 3600,
      scopes: ["s1", "s2"],
    });
    mockUpsertConnection.mockResolvedValueOnce({
      ok: true,
      connectionId: "conn-uuid",
    });
    mockFetchCalendarList.mockResolvedValueOnce({
      ok: true,
      items: [
        { id: "primary", summary: "Me", primary: true, accessRole: "owner" },
        { id: "work", summary: "Work", primary: false, accessRole: "writer" },
      ],
    });
    mockBulkUpsertSubscriptions.mockResolvedValueOnce({
      ok: true,
      insertedCount: 2,
    });

    const req = makeCallbackRequest({
      code: "c",
      state: valid.state,
      cookieValue: valid.cookieValue,
    });
    const res = await GET(req);
    const loc = locationOf(res);
    expect(loc.pathname).toBe("/plan");
    expect(loc.searchParams.get("calendar_connected")).toBe("1");
    expect(loc.searchParams.has("calendar_connect_partial")).toBe(false);
    expect(loc.searchParams.has("calendar_connect_error")).toBe(false);

    // 呼出 verify
    expect(mockExchangeCodeForTokens).toHaveBeenCalledTimes(1);
    expect(mockUpsertConnection).toHaveBeenCalledTimes(1);
    const [, upsertInput] = mockUpsertConnection.mock.calls[0]!;
    expect(upsertInput.userId).toBe("user-test-uuid");
    expect(upsertInput.provider).toBe("google");
    expect(Buffer.isBuffer(upsertInput.refreshTokenEncrypted)).toBe(true);
    expect(upsertInput.scopes).toEqual(["s1", "s2"]);
    expect(upsertInput.accessTokenExpiresAt).toBeInstanceOf(Date);

    expect(mockBulkUpsertSubscriptions).toHaveBeenCalledTimes(1);
    const [, subsInput] = mockBulkUpsertSubscriptions.mock.calls[0]!;
    expect(subsInput.connectionId).toBe("conn-uuid");
    expect(subsInput.calendars).toHaveLength(2);
  });

  it("state cookie が成功 redirect の Set-Cookie で clear される (= maxAge 0)", async () => {
    const valid = makeValidStatePair();
    mockExchangeCodeForTokens.mockResolvedValueOnce({
      ok: true,
      accessToken: "a",
      refreshToken: "r",
      expiresInSeconds: 3600,
      scopes: [],
    });
    mockUpsertConnection.mockResolvedValueOnce({ ok: true, connectionId: "c1" });
    mockFetchCalendarList.mockResolvedValueOnce({ ok: true, items: [] });
    mockBulkUpsertSubscriptions.mockResolvedValueOnce({
      ok: true,
      insertedCount: 0,
    });

    const req = makeCallbackRequest({
      code: "c",
      state: valid.state,
      cookieValue: valid.cookieValue,
    });
    const res = await GET(req);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("gcal_oauth_state=");
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});
