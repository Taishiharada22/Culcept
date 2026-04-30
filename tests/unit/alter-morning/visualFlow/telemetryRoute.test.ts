/**
 * Visual Flow telemetry route — unit test (W3-PR-13 M4)
 *
 * 検証観点（CEO decision #4: visual-flow 専用 / session 必須 / user.id 上書き / whitelist 厳格）:
 *   §1 auth: 未認証 / anonymous は 401
 *   §2 body: JSON 不正 / whitelist 外は 400
 *   §3 server-side user.id 上書き: client が送った user_id は無視
 *   §4 各 event の valid shape で 202
 *   §5 event name が server-side 専用（flag_evaluated）でも 400
 *
 * 参照:
 *   - app/api/alter-morning/visual-flow/telemetry/route.ts
 *   - lib/alter-morning/visualFlow/analytics.ts
 *   - lib/alter-morning/visualFlow/analyticsServer.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mocks — supabase + trackStargazerEvent
// vi.mock は hoist されるので、factory 内で参照する値は vi.hoisted で宣言する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

vi.mock("server-only", () => ({}));

// vi.fn() without an explicit call signature types `.mock.calls` として
// `[]` の空 tuple を返してしまい、`calls[0]?.[0]` が `TS2493` を出す。
// 実引数の shape を `(arg: unknown) => Promise<boolean>` として明示しておく。
const { authGetUserMock, trackStargazerEventMock } = vi.hoisted(() => ({
  authGetUserMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  trackStargazerEventMock: vi.fn<(arg: unknown) => Promise<boolean>>(
    async () => true,
  ),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn(async () => ({
    auth: { getUser: authGetUserMock },
  })),
}));

vi.mock("@/lib/stargazer/analytics", () => ({
  trackStargazerEvent: trackStargazerEventMock,
}));

// route は mock の後で import
import { POST } from "@/app/api/alter-morning/visual-flow/telemetry/route";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CLIENT_SPOOFED_USER_ID = "ffffffff-aaaa-bbbb-cccc-111111111111";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/alter-morning/visual-flow/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  authGetUserMock.mockReset();
  trackStargazerEventMock.mockClear();
});

afterEach(() => {
  authGetUserMock.mockReset();
  trackStargazerEventMock.mockClear();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 auth
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1 auth", () => {
  it("session なし → 401", async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(
      makeRequest({
        event: "visual_flow_map_mounted",
        metadata: { pin_count: 3, fit_bounds_mode: "bounds" },
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(401);
    expect(trackStargazerEventMock).not.toHaveBeenCalled();
  });

  it("anonymous user → 401", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: USER_ID, is_anonymous: true } },
      error: null,
    });
    const res = await POST(
      makeRequest({
        event: "visual_flow_map_mounted",
        metadata: { pin_count: 3, fit_bounds_mode: "bounds" },
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(401);
    expect(trackStargazerEventMock).not.toHaveBeenCalled();
  });

  it("auth error (supabase が error 返す) → 401", async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "jwt expired" },
    });
    const res = await POST(
      makeRequest({
        event: "visual_flow_map_mounted",
        metadata: { pin_count: 3, fit_bounds_mode: "bounds" },
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(401);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 body validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2 body", () => {
  beforeEach(() => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: USER_ID, is_anonymous: false } },
      error: null,
    });
  });

  it("JSON 不正 → 400 invalid_json", async () => {
    const res = await POST(
      makeRequest("not-json{{{") as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
    expect(trackStargazerEventMock).not.toHaveBeenCalled();
  });

  it("event 欠落 → 400 invalid_payload", async () => {
    const res = await POST(
      makeRequest({ metadata: { reason: "no_browser_key" } }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_payload");
  });

  it("whitelist 外 event → 400", async () => {
    const res = await POST(
      makeRequest({
        event: "drop_table_users",
        metadata: {},
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
  });

  it("metadata shape が壊れている → 400", async () => {
    const res = await POST(
      makeRequest({
        event: "visual_flow_map_mounted",
        metadata: { pin_count: "three", fit_bounds_mode: "bounds" },
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    expect(trackStargazerEventMock).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 server-side user.id 上書き（最重要）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3 server-side user.id 上書き", () => {
  beforeEach(() => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: USER_ID, is_anonymous: false } },
      error: null,
    });
  });

  it("client が body に user_id を送っても server は session.user.id を使う", async () => {
    const res = await POST(
      makeRequest({
        event: "visual_flow_map_mounted",
        metadata: { pin_count: 3, fit_bounds_mode: "bounds" },
        // 攻撃者が仕込んだ user_id
        user_id: CLIENT_SPOOFED_USER_ID,
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(202);
    expect(trackStargazerEventMock).toHaveBeenCalledTimes(1);
    const call = trackStargazerEventMock.mock.calls[0]?.[0] as unknown as {
      userId: string;
    };
    expect(call.userId).toBe(USER_ID);
    expect(call.userId).not.toBe(CLIENT_SPOOFED_USER_ID);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 各 event 正常系
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4 accept cases (3 client events)", () => {
  beforeEach(() => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: USER_ID, is_anonymous: false } },
      error: null,
    });
  });

  it("gate_rejected (no_browser_key) → 202 + insert", async () => {
    const res = await POST(
      makeRequest({
        event: "visual_flow_gate_rejected",
        metadata: { reason: "no_browser_key" },
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(202);
    const call = trackStargazerEventMock.mock.calls[0]?.[0] as unknown as {
      event: string;
      feature: string;
      metadata: Record<string, unknown>;
    };
    expect(call.event).toBe("visual_flow_gate_rejected");
    expect(call.feature).toBe("alter_morning_visual_flow");
    expect(call.metadata).toEqual({ reason: "no_browser_key" });
  });

  it("script_loaded (succeeded) → 202 + insert", async () => {
    const res = await POST(
      makeRequest({
        event: "visual_flow_script_loaded",
        metadata: { status: "succeeded", duration_ms: 850 },
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(202);
    const call = trackStargazerEventMock.mock.calls[0]?.[0] as unknown as {
      event: string;
      metadata: Record<string, unknown>;
    };
    expect(call.event).toBe("visual_flow_script_loaded");
    expect(call.metadata).toEqual({ status: "succeeded", duration_ms: 850 });
  });

  it("map_mounted (bounds) → 202 + insert", async () => {
    const res = await POST(
      makeRequest({
        event: "visual_flow_map_mounted",
        metadata: { pin_count: 5, fit_bounds_mode: "bounds" },
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(202);
    const call = trackStargazerEventMock.mock.calls[0]?.[0] as unknown as {
      event: string;
      metadata: Record<string, unknown>;
    };
    expect(call.event).toBe("visual_flow_map_mounted");
    expect(call.metadata).toEqual({ pin_count: 5, fit_bounds_mode: "bounds" });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 server-side 専用 event は client から送れない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5 server-only event は client から拒否", () => {
  beforeEach(() => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: USER_ID, is_anonymous: false } },
      error: null,
    });
  });

  it("flag_evaluated (server-only) を client から送ると 400", async () => {
    // flag_evaluated は server で emit されるべき。client から送らせない。
    const res = await POST(
      makeRequest({
        event: "visual_flow_flag_evaluated",
        metadata: { flag_source: "allowlist" },
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    expect(trackStargazerEventMock).not.toHaveBeenCalled();
  });
});
