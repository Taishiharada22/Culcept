/**
 * Track B TB-2b — Microsoft callback route handler unit test (= Google parity)
 *
 * 検証範囲 (= calendarGoogleCallback.test の MS 版):
 *   - env 未設定 → not_configured
 *   - MS error parameter → canceled
 *   - code/state 不在 → invalid_request
 *   - state cookie 不在 → state_missing / mismatch → state_mismatch
 *   - token exchange invalid_grant → token_invalid_grant
 *   - authn 失敗 → /login
 *   - connection DB 失敗 → db_connection_failed
 *   - 成功 → calendar_connected=1 (= subscriptions step なし、 partial なし)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockAuthState: {
  data: { user: { id: string } | null };
  error: Error | null;
  threw?: boolean;
} = { data: { user: { id: "user-test-uuid" } }, error: null };

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
    };
  }),
}));

const mockExchange = vi.fn();
vi.mock("@/lib/oauth/microsoftCalendarApi", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    exchangeCodeForMicrosoftTokens: (...args: unknown[]) => mockExchange(...args),
  };
});

const mockUpsertConnection = vi.fn();
vi.mock("@/lib/oauth/calendarConnectionRepository", () => ({
  upsertConnection: (...args: unknown[]) => mockUpsertConnection(...args),
}));

import { generateState } from "@/lib/oauth/googleCalendarState";
import { GET } from "@/app/api/calendar/microsoft/callback/route";

const ENV_BACKUP: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "MICROSOFT_CALENDAR_CLIENT_ID",
  "MICROSOFT_CALENDAR_CLIENT_SECRET",
  "MICROSOFT_CALENDAR_REDIRECT_URI",
  "OAUTH_STATE_SECRET",
  "OAUTH_TOKEN_ENCRYPTION_KEY",
  "NODE_ENV",
] as const;

const TEST_STATE_SECRET = "test-state-secret-for-ms-callback";
const TEST_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  for (const k of ENV_KEYS) ENV_BACKUP[k] = process.env[k];
  setEnv("MICROSOFT_CALENDAR_CLIENT_ID", "test-client-id");
  setEnv("MICROSOFT_CALENDAR_CLIENT_SECRET", "test-client-secret");
  setEnv("MICROSOFT_CALENDAR_REDIRECT_URI", "http://localhost:3000/api/calendar/microsoft/callback");
  setEnv("OAUTH_STATE_SECRET", TEST_STATE_SECRET);
  setEnv("OAUTH_TOKEN_ENCRYPTION_KEY", TEST_TOKEN_KEY);
  setEnv("NODE_ENV", "test");

  mockAuthState = { data: { user: { id: "user-test-uuid" } }, error: null };
  mockExchange.mockReset();
  mockUpsertConnection.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) setEnv(k, ENV_BACKUP[k]);
});

function makeRequest(opts: {
  code?: string;
  state?: string;
  error?: string;
  cookieValue?: string;
}): NextRequest {
  const url = new URL("http://localhost:3000/api/calendar/microsoft/callback");
  if (opts.code !== undefined) url.searchParams.set("code", opts.code);
  if (opts.state !== undefined) url.searchParams.set("state", opts.state);
  if (opts.error !== undefined) url.searchParams.set("error", opts.error);
  const req = new NextRequest(url);
  if (opts.cookieValue !== undefined) req.cookies.set("mscal_oauth_state", opts.cookieValue);
  return req;
}

function makeValidStatePair(): { state: string; cookieValue: string } {
  const r = generateState(TEST_STATE_SECRET);
  return { state: r.state, cookieValue: r.signedCookieValue };
}

function locationOf(res: Response): URL {
  return new URL(res.headers.get("location") ?? "");
}

const OK_TOKENS = {
  ok: true as const,
  accessToken: "at",
  refreshToken: "rt",
  expiresInSeconds: 3600,
  scopes: ["openid", "offline_access", "Calendars.Read"],
};

describe("microsoft callback — degrade / error paths", () => {
  it("env 未設定 → not_configured", async () => {
    setEnv("OAUTH_TOKEN_ENCRYPTION_KEY", undefined);
    const res = await GET(makeRequest({ code: "c", state: "s", cookieValue: "any" }));
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe("not_configured");
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("MS error parameter → canceled", async () => {
    const res = await GET(makeRequest({ error: "access_denied" }));
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe("canceled");
  });

  it("code/state 不在 → invalid_request", async () => {
    const res = await GET(makeRequest({ code: "c" }));
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe("invalid_request");
  });

  it("state cookie 不在 → state_missing", async () => {
    const res = await GET(makeRequest({ code: "c", state: "s" }));
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe("state_missing");
  });

  it("state mismatch → state_mismatch", async () => {
    const { cookieValue } = makeValidStatePair();
    const res = await GET(makeRequest({ code: "c", state: "different", cookieValue }));
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe("state_mismatch");
  });

  it("token exchange invalid_grant → token_invalid_grant", async () => {
    const { state, cookieValue } = makeValidStatePair();
    mockExchange.mockResolvedValue({ ok: false, reason: "invalid_grant", detail: "expired" });
    const res = await GET(makeRequest({ code: "c", state, cookieValue }));
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe("token_invalid_grant");
  });

  it("authn 失敗 (= user 不在) → /login", async () => {
    const { state, cookieValue } = makeValidStatePair();
    mockExchange.mockResolvedValue(OK_TOKENS);
    mockAuthState = { data: { user: null }, error: null };
    const res = await GET(makeRequest({ code: "c", state, cookieValue }));
    expect(locationOf(res).pathname).toBe("/login");
  });

  it("connection DB 失敗 → db_connection_failed", async () => {
    const { state, cookieValue } = makeValidStatePair();
    mockExchange.mockResolvedValue(OK_TOKENS);
    mockUpsertConnection.mockResolvedValue({ ok: false, reason: "db_error", detail: "boom" });
    const res = await GET(makeRequest({ code: "c", state, cookieValue }));
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe("db_connection_failed");
  });
});

describe("microsoft callback — success", () => {
  it("成功 → calendar_connected=1 (= provider=microsoft で upsert)", async () => {
    const { state, cookieValue } = makeValidStatePair();
    mockExchange.mockResolvedValue(OK_TOKENS);
    mockUpsertConnection.mockResolvedValue({ ok: true, connectionId: "conn-1" });
    const res = await GET(makeRequest({ code: "c", state, cookieValue }));
    const loc = locationOf(res);
    expect(loc.pathname).toBe("/plan");
    expect(loc.searchParams.get("calendar_connected")).toBe("1");
    expect(loc.searchParams.get("calendar_connect_partial")).toBeNull(); // partial path なし
    // upsert は provider="microsoft" で呼ばれる
    const call = mockUpsertConnection.mock.calls[0] as unknown as [unknown, { provider: string }];
    expect(call[1].provider).toBe("microsoft");
  });
});
