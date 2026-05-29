/**
 * P3-A-1-1-d — calendarConnectionRepository unit test
 *
 * 検証範囲:
 *   - pure helpers (= shouldEnableByDefault / normalizeAccessRole / buildSubscriptionRows)
 *   - upsertConnection: supabase mock で payload 厳密確認 (= snake_case 変換 / onConflict / status reset)
 *   - upsertConnection: error 時 reason='db_error'
 *   - upsertConnection: throw (= schema 不一致) でも fail-safe
 *   - bulkUpsertSubscriptions: 空配列 → 早期 return / API 呼ばず
 *   - bulkUpsertSubscriptions: rows 変換 + onConflict
 *   - bulkUpsertSubscriptions: error / throw 時 fail-safe
 */

import { describe, expect, it, vi } from "vitest";

import {
  buildSubscriptionRows,
  bulkUpsertSubscriptions,
  findConnection,
  normalizeAccessRole,
  shouldEnableByDefault,
  upsertConnection,
} from "@/lib/oauth/calendarConnectionRepository";
import type { CalendarListItem } from "@/lib/oauth/googleCalendarApi";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock client builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeMockConnectionClient(opts: {
  returnData?: { id: string } | null;
  returnError?: Error | null;
  throwOnUpsert?: boolean;
}) {
  const upsertSpy = vi.fn();
  const selectSpy = vi.fn();
  const singleSpy = vi.fn(async () => {
    if (opts.throwOnUpsert) throw new Error("schema mismatch");
    return {
      data: opts.returnData ?? null,
      error: opts.returnError ?? null,
    };
  });

  selectSpy.mockReturnValue({ single: singleSpy });
  upsertSpy.mockReturnValue({ select: selectSpy });

  const client = {
    from: vi.fn(() => ({ upsert: upsertSpy })),
  };
  return { client, upsertSpy, selectSpy, singleSpy };
}

function makeMockSubsClient(opts: {
  returnError?: Error | null;
  throwOnUpsert?: boolean;
}) {
  const upsertSpy = vi.fn(async () => {
    if (opts.throwOnUpsert) throw new Error("schema mismatch");
    return { error: opts.returnError ?? null };
  });
  const client = {
    from: vi.fn(() => ({ upsert: upsertSpy })),
  };
  return { client, upsertSpy };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shouldEnableByDefault (= 親 Q2 採用案 c 自動判定)", () => {
  it("primary=true → 必ず true", () => {
    const cal: CalendarListItem = {
      id: "p",
      summary: "Primary",
      primary: true,
      accessRole: "reader", // primary なら reader でも ON
    };
    expect(shouldEnableByDefault(cal)).toBe(true);
  });

  it("owner / writer (= non-primary) → true", () => {
    const owner: CalendarListItem = {
      id: "o",
      summary: "Own",
      primary: false,
      accessRole: "owner",
    };
    const writer: CalendarListItem = {
      id: "w",
      summary: "Write",
      primary: false,
      accessRole: "writer",
    };
    expect(shouldEnableByDefault(owner)).toBe(true);
    expect(shouldEnableByDefault(writer)).toBe(true);
  });

  it("reader (= non-primary) → false (= shared 他人 calendar 防止)", () => {
    const cal: CalendarListItem = {
      id: "s",
      summary: "Shared",
      primary: false,
      accessRole: "reader",
    };
    expect(shouldEnableByDefault(cal)).toBe(false);
  });

  it("freeBusyReader (= non-primary) → false", () => {
    const cal: CalendarListItem = {
      id: "f",
      summary: "FreeBusy",
      primary: false,
      accessRole: "freeBusyReader",
    };
    expect(shouldEnableByDefault(cal)).toBe(false);
  });
});

describe("normalizeAccessRole", () => {
  it("freeBusyReader → reader (= DB CHECK 制約適合)", () => {
    expect(normalizeAccessRole("freeBusyReader")).toBe("reader");
  });

  it("owner / writer / reader → pass-through", () => {
    expect(normalizeAccessRole("owner")).toBe("owner");
    expect(normalizeAccessRole("writer")).toBe("writer");
    expect(normalizeAccessRole("reader")).toBe("reader");
  });
});

describe("buildSubscriptionRows", () => {
  it("CalendarListItem[] → SubscriptionRow[] 変換 + 自動 is_enabled", () => {
    const rows = buildSubscriptionRows({
      userId: "u1",
      connectionId: "c1",
      calendars: [
        { id: "p", summary: "Primary", primary: true, accessRole: "owner" },
        { id: "w", summary: "Work", primary: false, accessRole: "writer" },
        { id: "s", summary: "Shared", primary: false, accessRole: "reader" },
        { id: "f", summary: "FB", primary: false, accessRole: "freeBusyReader" },
      ],
    });

    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      user_id: "u1",
      connection_id: "c1",
      external_calendar_id: "p",
      display_name: "Primary",
      access_role: "owner",
      is_primary: true,
      is_enabled: true,
    });
    expect(rows[1]?.is_enabled).toBe(true); // writer
    expect(rows[2]?.is_enabled).toBe(false); // reader non-primary
    expect(rows[3]?.access_role).toBe("reader"); // freeBusyReader → reader
    expect(rows[3]?.is_enabled).toBe(false);
  });

  it("空配列 → 空配列", () => {
    expect(
      buildSubscriptionRows({ userId: "u", connectionId: "c", calendars: [] }),
    ).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// upsertConnection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("upsertConnection", () => {
  const baseInput = {
    userId: "user-abc",
    provider: "google" as const,
    refreshTokenEncrypted: Buffer.from([1, 2, 3, 4]),
    accessTokenExpiresAt: new Date("2026-12-31T23:59:59Z"),
    scopes: [
      "https://www.googleapis.com/auth/calendar.events.readonly",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    ],
  };

  it("成功 → connectionId 返却 + payload snake_case + onConflict 指定", async () => {
    const mock = makeMockConnectionClient({ returnData: { id: "conn-xyz" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await upsertConnection(mock.client as any, baseInput);

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.connectionId).toBe("conn-xyz");

    expect(mock.client.from).toHaveBeenCalledWith("user_calendar_connections");
    expect(mock.upsertSpy).toHaveBeenCalledTimes(1);

    const call = mock.upsertSpy.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { onConflict: string },
    ];
    const payload = call[0];
    const options = call[1];
    expect(payload).toMatchObject({
      user_id: "user-abc",
      provider: "google",
      status: "active",
      last_synced_at: null,
      access_token_expires_at: "2026-12-31T23:59:59.000Z",
      scopes: baseInput.scopes,
    });
    // bytea は \x hex 文字列で書き込む (= 生 Buffer 直渡しは supabase-js JSON 化で破損)
    // baseInput.refreshTokenEncrypted = Buffer.from([1,2,3,4]) → hex "01020304"
    expect(typeof payload.refresh_token_encrypted).toBe("string");
    expect(Buffer.isBuffer(payload.refresh_token_encrypted)).toBe(false);
    expect(payload.refresh_token_encrypted).toBe("\\x01020304");
    expect(options).toEqual({ onConflict: "user_id,provider" });
  });

  it("DB error → reason='db_error' + detail", async () => {
    const mock = makeMockConnectionClient({ returnError: new Error("permission denied") as unknown as Error & { message: string }, returnData: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await upsertConnection(mock.client as any, baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("db_error");
      expect(r.detail).toBe("permission denied");
    }
  });

  it("data null + error null → reason='db_error', detail='no_row_returned'", async () => {
    const mock = makeMockConnectionClient({ returnData: null, returnError: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await upsertConnection(mock.client as any, baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toBe("no_row_returned");
  });

  it("client throw (= schema 不一致) → fail-safe reason='db_error'", async () => {
    const mock = makeMockConnectionClient({ throwOnUpsert: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await upsertConnection(mock.client as any, baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("db_error");
      expect(r.detail).toContain("schema mismatch");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// write ⇄ read round-trip (= bytea \x hex 形式 対称性、 decrypt_failed 再発防止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** findConnection 用の最小 mock (= refresh_token_encrypted の返却値だけ可変) */
function makeFindClientReturning(refreshTokenEncrypted: unknown) {
  const maybeSingleSpy = vi.fn(async () => ({
    data: {
      id: "conn-rt",
      status: "active",
      last_synced_at: null,
      scopes: [],
      refresh_token_encrypted: refreshTokenEncrypted,
    },
    error: null,
  }));
  const eqSpy2 = vi.fn(() => ({ maybeSingle: maybeSingleSpy }));
  const eqSpy1 = vi.fn(() => ({ eq: eqSpy2 }));
  const selectSpy = vi.fn(() => ({ eq: eqSpy1 }));
  return { from: vi.fn(() => ({ select: selectSpy })) };
}

describe("write ⇄ read round-trip (= bytea \\x hex 形式 対称性)", () => {
  it("upsert が出力する \\x hex 文字列を findConnection が同一 Buffer に復元する", async () => {
    // 暗号バイト列を模す (= 0x00 / 0xff 端値を含め hex 変換の取りこぼしを検出)
    const original = Buffer.from([0x00, 0x1a, 0xff, 0x42, 0x7e, 0x00, 0x99]);

    // --- write 側: payload.refresh_token_encrypted を捕捉 ---
    const writeMock = makeMockConnectionClient({ returnData: { id: "conn-rt" } });
    await upsertConnection(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeMock.client as any,
      {
        userId: "user-rt",
        provider: "google",
        refreshTokenEncrypted: original,
        accessTokenExpiresAt: new Date("2026-12-31T23:59:59Z"),
        scopes: ["s"],
      },
    );
    const writePayload = (
      writeMock.upsertSpy.mock.calls[0] as unknown as [Record<string, unknown>, unknown]
    )[0];
    const stored = writePayload.refresh_token_encrypted;
    // 生 Buffer ではなく \x hex 文字列で渡っていること (= 破損経路を塞いだ証跡)
    expect(typeof stored).toBe("string");
    expect(Buffer.isBuffer(stored)).toBe(false);
    expect((stored as string).startsWith("\\x")).toBe(true);

    // --- read 側: Supabase が同じ \x hex を返す状況を模して decode ---
    const readClient = makeFindClientReturning(stored);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await findConnection(readClient as any, "user-rt", "google");
    expect(r.ok).toBe(true);
    if (r.ok && r.connection) {
      // 書き⇄読みが対称 → 元の暗号バイト列が忠実に復元される
      expect(r.connection.refreshTokenEncrypted.equals(original)).toBe(true);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// bulkUpsertSubscriptions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("bulkUpsertSubscriptions", () => {
  const baseInput = {
    userId: "user-abc",
    connectionId: "conn-xyz",
    calendars: [
      { id: "p", summary: "P", primary: true, accessRole: "owner" as const },
      { id: "w", summary: "W", primary: false, accessRole: "writer" as const },
    ],
  };

  it("空 calendar 配列 → API 呼ばず ok with insertedCount=0", async () => {
    const mock = makeMockSubsClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await bulkUpsertSubscriptions(mock.client as any, {
      userId: "u",
      connectionId: "c",
      calendars: [],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.insertedCount).toBe(0);
    expect(mock.client.from).not.toHaveBeenCalled();
  });

  it("成功 → rows 変換 + onConflict + insertedCount", async () => {
    const mock = makeMockSubsClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await bulkUpsertSubscriptions(mock.client as any, baseInput);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.insertedCount).toBe(2);

    expect(mock.client.from).toHaveBeenCalledWith("user_calendar_subscriptions");
    const call = mock.upsertSpy.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
      { onConflict: string },
    ];
    const rows = call[0];
    const options = call[1];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.external_calendar_id).toBe("p");
    expect(rows[0]!.is_primary).toBe(true);
    expect(rows[0]!.is_enabled).toBe(true);
    expect(options).toEqual({ onConflict: "connection_id,external_calendar_id" });
  });

  it("DB error → reason='db_error'", async () => {
    const mock = makeMockSubsClient({
      returnError: new Error("constraint violation") as unknown as Error & { message: string },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await bulkUpsertSubscriptions(mock.client as any, baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("db_error");
      expect(r.detail).toBe("constraint violation");
    }
  });

  it("client throw → fail-safe", async () => {
    const mock = makeMockSubsClient({ throwOnUpsert: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await bulkUpsertSubscriptions(mock.client as any, baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("schema mismatch");
  });
});
