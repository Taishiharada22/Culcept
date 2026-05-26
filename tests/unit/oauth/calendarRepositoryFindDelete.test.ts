/**
 * P3-A-1-1-f — findConnection / deleteConnection unit test
 *
 * 検証範囲:
 *   - findConnection: 行なし → connection: null
 *   - findConnection: 行あり (= Buffer / hex string / base64) → ConnectionView
 *   - findConnection: status 不正 → reason='db_error'
 *   - findConnection: id 不正 → reason='db_error'
 *   - findConnection: DB error → reason='db_error'
 *   - findConnection: throw → fail-safe
 *   - deleteConnection: 行削除 → deleted=true
 *   - deleteConnection: 0 行 → deleted=false (= もともと無かった)
 *   - deleteConnection: DB error / throw → fail-safe
 */

import { describe, expect, it, vi } from "vitest";

import {
  deleteConnection,
  findConnection,
} from "@/lib/oauth/calendarConnectionRepository";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock builders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeFindClient(opts: {
  data?: Record<string, unknown> | null;
  error?: Error | null;
  throwOnSingle?: boolean;
}) {
  const maybeSingleSpy = vi.fn(async () => {
    if (opts.throwOnSingle) throw new Error("schema mismatch");
    return { data: opts.data ?? null, error: opts.error ?? null };
  });
  const eqSpy2 = vi.fn(() => ({ maybeSingle: maybeSingleSpy }));
  const eqSpy1 = vi.fn(() => ({ eq: eqSpy2 }));
  const selectSpy = vi.fn(() => ({ eq: eqSpy1 }));
  const client = { from: vi.fn(() => ({ select: selectSpy })) };
  return { client, maybeSingleSpy, eqSpy1, eqSpy2, selectSpy };
}

function makeDeleteClient(opts: {
  data?: Array<{ id: string }> | null;
  error?: Error | null;
  throwOnSelect?: boolean;
}) {
  const selectSpy = vi.fn(async () => {
    if (opts.throwOnSelect) throw new Error("schema mismatch");
    return { data: opts.data ?? null, error: opts.error ?? null };
  });
  const eqSpy2 = vi.fn(() => ({ select: selectSpy }));
  const eqSpy1 = vi.fn(() => ({ eq: eqSpy2 }));
  const deleteSpy = vi.fn(() => ({ eq: eqSpy1 }));
  const client = { from: vi.fn(() => ({ delete: deleteSpy })) };
  return { client, selectSpy, deleteSpy };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// findConnection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("findConnection", () => {
  it("行なし → ok with connection: null", async () => {
    const mock = makeFindClient({ data: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await findConnection(mock.client as any, "user-1", "google");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.connection).toBeNull();
    expect(mock.client.from).toHaveBeenCalledWith("user_calendar_connections");
  });

  it("行あり (= refresh_token Buffer 直返し) → ConnectionView", async () => {
    const tokenBuffer = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const mock = makeFindClient({
      data: {
        id: "conn-uuid",
        status: "active",
        last_synced_at: "2026-05-26T10:00:00Z",
        scopes: ["s1", "s2"],
        refresh_token_encrypted: tokenBuffer,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await findConnection(mock.client as any, "user-1", "google");
    expect(r.ok).toBe(true);
    if (r.ok && r.connection) {
      expect(r.connection.id).toBe("conn-uuid");
      expect(r.connection.status).toBe("active");
      expect(r.connection.lastSyncedAt).toBe("2026-05-26T10:00:00Z");
      expect(r.connection.scopes).toEqual(["s1", "s2"]);
      expect(Buffer.isBuffer(r.connection.refreshTokenEncrypted)).toBe(true);
      expect(r.connection.refreshTokenEncrypted.equals(tokenBuffer)).toBe(true);
    }
  });

  it("行あり (= refresh_token Supabase hex \\x prefix 文字列) → Buffer に decode", async () => {
    const mock = makeFindClient({
      data: {
        id: "conn-uuid",
        status: "active",
        last_synced_at: null,
        scopes: [],
        refresh_token_encrypted: "\\xdeadbeef",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await findConnection(mock.client as any, "user-1", "google");
    expect(r.ok).toBe(true);
    if (r.ok && r.connection) {
      expect(r.connection.refreshTokenEncrypted.toString("hex")).toBe("deadbeef");
    }
  });

  it("status 不正 → reason='db_error'", async () => {
    const mock = makeFindClient({
      data: {
        id: "conn",
        status: "invalid_status_value",
        last_synced_at: null,
        scopes: [],
        refresh_token_encrypted: Buffer.alloc(0),
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await findConnection(mock.client as any, "user-1", "google");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toBe("invalid_status");
  });

  it("id 不正 → reason='db_error'", async () => {
    const mock = makeFindClient({
      data: {
        id: 12345, // not string
        status: "active",
        last_synced_at: null,
        scopes: [],
        refresh_token_encrypted: Buffer.alloc(0),
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await findConnection(mock.client as any, "user-1", "google");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toBe("invalid_id");
  });

  it("DB error → reason='db_error'", async () => {
    const mock = makeFindClient({
      error: new Error("permission denied") as unknown as Error & { message: string },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await findConnection(mock.client as any, "user-1", "google");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toBe("permission denied");
  });

  it("throw → fail-safe reason='db_error'", async () => {
    const mock = makeFindClient({ throwOnSingle: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await findConnection(mock.client as any, "user-1", "google");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("schema mismatch");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// deleteConnection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("deleteConnection", () => {
  it("1 行削除 → ok, deleted: true", async () => {
    const mock = makeDeleteClient({ data: [{ id: "conn-1" }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await deleteConnection(mock.client as any, "user-1", "google");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.deleted).toBe(true);
    expect(mock.client.from).toHaveBeenCalledWith("user_calendar_connections");
  });

  it("0 行 (= もとから無い) → ok, deleted: false", async () => {
    const mock = makeDeleteClient({ data: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await deleteConnection(mock.client as any, "user-1", "google");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.deleted).toBe(false);
  });

  it("DB error → reason='db_error'", async () => {
    const mock = makeDeleteClient({
      error: new Error("RLS violation") as unknown as Error & { message: string },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await deleteConnection(mock.client as any, "user-1", "google");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toBe("RLS violation");
  });

  it("throw → fail-safe", async () => {
    const mock = makeDeleteClient({ throwOnSelect: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await deleteConnection(mock.client as any, "user-1", "google");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("schema mismatch");
  });
});
