/**
 * Track B TB-2b — Microsoft connect / status / disconnect route unit test (= Google parity)
 *
 * 検証範囲:
 *   - connect: env 未設定 → not_configured / authn 不在 → /login /
 *     intent=initial → MS authorize URL + scope + state cookie
 *   - status: connected / disconnected / DB error fail-safe
 *   - disconnect: delete-only (= provider='microsoft'、 revoke なし) / authn 401 / DB error 500
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

const mockFindConnection = vi.fn();
const mockDeleteConnection = vi.fn();
vi.mock("@/lib/oauth/calendarConnectionRepository", () => ({
  findConnection: (...args: unknown[]) => mockFindConnection(...args),
  deleteConnection: (...args: unknown[]) => mockDeleteConnection(...args),
}));

import { GET as connectGET } from "@/app/api/calendar/microsoft/connect/route";
import { GET as statusGET } from "@/app/api/calendar/microsoft/status/route";
import { POST as disconnectPOST } from "@/app/api/calendar/microsoft/disconnect/route";

const ENV_BACKUP: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "MICROSOFT_CALENDAR_CLIENT_ID",
  "MICROSOFT_CALENDAR_REDIRECT_URI",
  "OAUTH_STATE_SECRET",
  "NODE_ENV",
] as const;

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  for (const k of ENV_KEYS) ENV_BACKUP[k] = process.env[k];
  setEnv("MICROSOFT_CALENDAR_CLIENT_ID", "test-client-id");
  setEnv("MICROSOFT_CALENDAR_REDIRECT_URI", "http://localhost:3000/api/calendar/microsoft/callback");
  setEnv("OAUTH_STATE_SECRET", "test-state-secret-anything");
  setEnv("NODE_ENV", "test");
  mockAuthState = { data: { user: { id: "user-test-uuid" } }, error: null };
  mockFindConnection.mockReset();
  mockDeleteConnection.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) setEnv(k, ENV_BACKUP[k]);
});

function connectReq(intent?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/calendar/microsoft/connect");
  if (intent !== undefined) url.searchParams.set("intent", intent);
  return new NextRequest(url);
}

function locationOf(res: Response): URL {
  return new URL(res.headers.get("location") ?? "");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// connect
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("microsoft connect", () => {
  it("env 未設定 → not_configured", async () => {
    setEnv("MICROSOFT_CALENDAR_CLIENT_ID", undefined);
    const res = await connectGET(connectReq("initial"));
    expect(locationOf(res).searchParams.get("calendar_connect_error")).toBe("not_configured");
  });

  it("authn 不在 → /login", async () => {
    mockAuthState = { data: { user: null }, error: null };
    const res = await connectGET(connectReq("initial"));
    expect(locationOf(res).pathname).toBe("/login");
  });

  it("intent=initial → MS authorize URL + scope + prompt=consent + state cookie", async () => {
    const res = await connectGET(connectReq("initial"));
    const loc = locationOf(res);
    expect(loc.hostname).toBe("login.microsoftonline.com");
    const scope = loc.searchParams.get("scope") ?? "";
    expect(scope).toContain("Calendars.Read");
    expect(scope).toContain("offline_access");
    expect(loc.searchParams.get("prompt")).toBe("consent");
    expect(loc.searchParams.get("state")).toBeTruthy();
    expect(loc.searchParams.get("response_mode")).toBe("query");
    // state cookie が Set-Cookie に設定される
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("mscal_oauth_state=");
  });

  it("intent=reconnect → prompt 未指定", async () => {
    const res = await connectGET(connectReq("reconnect"));
    expect(locationOf(res).searchParams.get("prompt")).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// status
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("microsoft status", () => {
  it("user 不在 → connected:false", async () => {
    mockAuthState = { data: { user: null }, error: null };
    const res = await statusGET();
    expect(await res.json()).toEqual({ connected: false });
    expect(mockFindConnection).not.toHaveBeenCalled();
  });

  it("active connection → connected:true (provider=microsoft で検索)", async () => {
    mockFindConnection.mockResolvedValue({
      ok: true,
      connection: { status: "active", lastSyncedAt: null },
    });
    const res = await statusGET();
    const json = await res.json();
    expect(json.connected).toBe(true);
    expect(json.status).toBe("active");
    expect(mockFindConnection.mock.calls[0]![2]).toBe("microsoft");
  });

  it("connection なし → connected:false", async () => {
    mockFindConnection.mockResolvedValue({ ok: true, connection: null });
    expect((await (await statusGET()).json()).connected).toBe(false);
  });

  it("DB error → fail-safe connected:false", async () => {
    mockFindConnection.mockResolvedValue({ ok: false, reason: "db_error", detail: "x" });
    expect((await (await statusGET()).json()).connected).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// disconnect
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("microsoft disconnect (= delete-only)", () => {
  it("authn 不在 → 401", async () => {
    mockAuthState = { data: { user: null }, error: null };
    const res = await disconnectPOST();
    expect(res.status).toBe(401);
    expect(mockDeleteConnection).not.toHaveBeenCalled();
  });

  it("成功 → deleted:true (provider=microsoft、 revoke なし)", async () => {
    mockDeleteConnection.mockResolvedValue({ ok: true, deleted: true });
    const res = await disconnectPOST();
    const json = await res.json();
    expect(json).toEqual({ ok: true, deleted: true });
    expect(mockDeleteConnection.mock.calls[0]![2]).toBe("microsoft");
  });

  it("DB error → 500", async () => {
    mockDeleteConnection.mockResolvedValue({ ok: false, reason: "db_error", detail: "x" });
    const res = await disconnectPOST();
    expect(res.status).toBe(500);
  });
});
