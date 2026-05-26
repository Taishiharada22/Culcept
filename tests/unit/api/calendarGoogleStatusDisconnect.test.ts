/**
 * P3-A-1-1-f — status / disconnect route unit test
 *
 * 検証範囲:
 *   - status: 未認証 → connected: false (= 200 OK、 情報漏洩防止)
 *   - status: 認証あり + connection なし → connected: false
 *   - status: 認証 + connection active → connected: true + status + lastSyncedAt
 *   - status: DB error → fail-safe connected: false
 *   - disconnect: env なし → 500
 *   - disconnect: 未認証 → 401
 *   - disconnect: 既存 connection なし → idempotent success (deleted: false)
 *   - disconnect: revoke 失敗 + DB 削除成功 → ok: true, revoked: false, deleted: true
 *   - disconnect: revoke + DB 削除 両方成功 → ok: true, revoked: true
 *   - disconnect: DB 削除失敗 → 500
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mocks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let mockAuthState: {
  data: { user: { id: string } | null };
  error: Error | null;
  threw?: boolean;
} = {
  data: { user: { id: "user-uuid" } },
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
    };
  }),
}));

const mockFindConnection = vi.fn();
const mockDeleteConnection = vi.fn();
vi.mock("@/lib/oauth/calendarConnectionRepository", () => ({
  findConnection: (...args: unknown[]) => mockFindConnection(...args),
  deleteConnection: (...args: unknown[]) => mockDeleteConnection(...args),
}));

const mockRevokeGoogleToken = vi.fn();
vi.mock("@/lib/oauth/googleCalendarApi", () => ({
  revokeGoogleToken: (...args: unknown[]) => mockRevokeGoogleToken(...args),
}));

const mockDecryptToken = vi.fn();
vi.mock("@/lib/oauth/tokenCrypto", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { GET as statusGET } from "@/app/api/calendar/google/status/route";
import { POST as disconnectPOST } from "@/app/api/calendar/google/disconnect/route";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Env setup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ENV_BACKUP: Record<string, string | undefined> = {};
function setEnv(k: string, v: string | undefined): void {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

beforeEach(() => {
  ENV_BACKUP.OAUTH_TOKEN_ENCRYPTION_KEY = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  ENV_BACKUP.NODE_ENV = process.env.NODE_ENV;
  setEnv("OAUTH_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
  setEnv("NODE_ENV", "test");

  mockAuthState = { data: { user: { id: "user-uuid" } }, error: null };
  mockFindConnection.mockReset();
  mockDeleteConnection.mockReset();
  mockRevokeGoogleToken.mockReset();
  mockDecryptToken.mockReset();
});

afterEach(() => {
  for (const [k, v] of Object.entries(ENV_BACKUP)) setEnv(k, v);
});

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// status route
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("status route", () => {
  it("未認証 → 200 connected: false (= 情報漏洩防止)", async () => {
    mockAuthState = { data: { user: null }, error: null };
    const res = await statusGET();
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.connected).toBe(false);
  });

  it("supabase throw → 200 connected: false (= fail-safe)", async () => {
    mockAuthState = { ...mockAuthState, threw: true };
    const res = await statusGET();
    expect(res.status).toBe(200);
    expect((await readJson(res)).connected).toBe(false);
  });

  it("認証 + connection なし → connected: false", async () => {
    mockFindConnection.mockResolvedValueOnce({ ok: true, connection: null });
    const res = await statusGET();
    const json = await readJson(res);
    expect(json.connected).toBe(false);
  });

  it("認証 + connection active → connected: true + status + lastSyncedAt", async () => {
    mockFindConnection.mockResolvedValueOnce({
      ok: true,
      connection: {
        id: "c1",
        status: "active",
        lastSyncedAt: "2026-05-26T12:00:00Z",
        scopes: [],
        refreshTokenEncrypted: Buffer.alloc(0),
      },
    });
    const res = await statusGET();
    const json = await readJson(res);
    expect(json.connected).toBe(true);
    expect(json.status).toBe("active");
    expect(json.lastSyncedAt).toBe("2026-05-26T12:00:00Z");
  });

  it("認証 + status='revoked' → connected: false (= active 以外は disconnected 表示)", async () => {
    mockFindConnection.mockResolvedValueOnce({
      ok: true,
      connection: {
        id: "c1",
        status: "revoked",
        lastSyncedAt: null,
        scopes: [],
        refreshTokenEncrypted: Buffer.alloc(0),
      },
    });
    const res = await statusGET();
    const json = await readJson(res);
    expect(json.connected).toBe(false);
    expect(json.status).toBe("revoked");
  });

  it("DB error → fail-safe connected: false", async () => {
    mockFindConnection.mockResolvedValueOnce({
      ok: false,
      reason: "db_error",
      detail: "permission denied",
    });
    const res = await statusGET();
    const json = await readJson(res);
    expect(json.connected).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// disconnect route
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("disconnect route", () => {
  it("env なし → 500", async () => {
    setEnv("OAUTH_TOKEN_ENCRYPTION_KEY", undefined);
    const res = await disconnectPOST();
    expect(res.status).toBe(500);
    expect((await readJson(res)).ok).toBe(false);
  });

  it("未認証 → 401", async () => {
    mockAuthState = { data: { user: null }, error: null };
    const res = await disconnectPOST();
    expect(res.status).toBe(401);
    expect((await readJson(res)).ok).toBe(false);
  });

  it("既存 connection なし → idempotent ok: true, deleted: false, alreadyRevoked: true", async () => {
    mockFindConnection.mockResolvedValueOnce({ ok: true, connection: null });
    const res = await disconnectPOST();
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(false);
    expect(json.alreadyRevoked).toBe(true);
    expect(mockRevokeGoogleToken).not.toHaveBeenCalled();
    expect(mockDeleteConnection).not.toHaveBeenCalled();
  });

  it("revoke 失敗 + DB 削除成功 → ok: true, revoked: false, deleted: true (= best-effort)", async () => {
    mockFindConnection.mockResolvedValueOnce({
      ok: true,
      connection: {
        id: "c1",
        status: "active",
        lastSyncedAt: null,
        scopes: [],
        refreshTokenEncrypted: Buffer.from([1, 2, 3]),
      },
    });
    mockDecryptToken.mockReturnValueOnce({ ok: true, plaintext: "rtok" });
    mockRevokeGoogleToken.mockResolvedValueOnce({
      ok: false,
      reason: "network",
    });
    mockDeleteConnection.mockResolvedValueOnce({ ok: true, deleted: true });

    const res = await disconnectPOST();
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.ok).toBe(true);
    expect(json.revoked).toBe(false);
    expect(json.deleted).toBe(true);
  });

  it("revoke + DB 削除 両方成功 → ok: true, revoked: true, deleted: true", async () => {
    mockFindConnection.mockResolvedValueOnce({
      ok: true,
      connection: {
        id: "c1",
        status: "active",
        lastSyncedAt: null,
        scopes: [],
        refreshTokenEncrypted: Buffer.from([1, 2, 3]),
      },
    });
    mockDecryptToken.mockReturnValueOnce({ ok: true, plaintext: "rtok" });
    mockRevokeGoogleToken.mockResolvedValueOnce({
      ok: true,
      alreadyRevoked: false,
    });
    mockDeleteConnection.mockResolvedValueOnce({ ok: true, deleted: true });

    const res = await disconnectPOST();
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.ok).toBe(true);
    expect(json.revoked).toBe(true);
    expect(json.alreadyRevoked).toBe(false);
    expect(json.deleted).toBe(true);
  });

  it("decrypt 失敗 → revoke skip、 DB 削除続行", async () => {
    mockFindConnection.mockResolvedValueOnce({
      ok: true,
      connection: {
        id: "c1",
        status: "active",
        lastSyncedAt: null,
        scopes: [],
        refreshTokenEncrypted: Buffer.from([1, 2, 3]),
      },
    });
    mockDecryptToken.mockReturnValueOnce({ ok: false, reason: "authentication" });
    mockDeleteConnection.mockResolvedValueOnce({ ok: true, deleted: true });

    const res = await disconnectPOST();
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.ok).toBe(true);
    expect(json.revoked).toBe(false);
    expect(json.deleted).toBe(true);
    expect(mockRevokeGoogleToken).not.toHaveBeenCalled();
  });

  it("DB 削除失敗 → 500 + ok: false", async () => {
    mockFindConnection.mockResolvedValueOnce({
      ok: true,
      connection: {
        id: "c1",
        status: "active",
        lastSyncedAt: null,
        scopes: [],
        refreshTokenEncrypted: Buffer.from([1, 2, 3]),
      },
    });
    mockDecryptToken.mockReturnValueOnce({ ok: true, plaintext: "rtok" });
    mockRevokeGoogleToken.mockResolvedValueOnce({
      ok: true,
      alreadyRevoked: false,
    });
    mockDeleteConnection.mockResolvedValueOnce({
      ok: false,
      reason: "db_error",
      detail: "permission denied",
    });

    const res = await disconnectPOST();
    expect(res.status).toBe(500);
    expect((await readJson(res)).ok).toBe(false);
  });

  it("findConnection 失敗 → 500", async () => {
    mockFindConnection.mockResolvedValueOnce({
      ok: false,
      reason: "db_error",
      detail: "rls",
    });
    const res = await disconnectPOST();
    expect(res.status).toBe(500);
  });
});
