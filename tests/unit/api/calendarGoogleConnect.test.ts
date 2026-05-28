/**
 * P3-A-1-1-c — connect route handler unit test
 *
 * 検証範囲:
 *   - env 未設定 → /plan?calendar_connect_error=not_configured (= 302 degrade)
 *   - authn 不在 → /login?next=/plan (= 302 redirect)
 *   - authn 失敗 (= throw) → /plan?calendar_connect_error=auth_failed
 *   - intent=initial → prompt=consent + Google URL に redirect
 *   - intent=reconsent → prompt=consent
 *   - intent=reconnect → prompt 未指定 (= GPT 補正、 UX 軽量)
 *   - intent 不正 → 'initial' に fallback (= 安全側)
 *   - state cookie が Set-Cookie header に設定される
 *   - scope に calendar.events.readonly + calendar.calendarlist.readonly 両方含む
 *   - access_type=offline + include_granted_scopes=true
 *   - redirect_uri は env 値と一致
 *
 * 不変原則:
 *   - 実 Supabase 呼ばず mock、 env も per-test 設定
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Supabase mock
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
    if (mockAuthState.threw) {
      throw new Error("[mock] supabaseServer threw");
    }
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Route handler import (= mock 後)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { GET, __test__ } from "@/app/api/calendar/google/connect/route";

const ENV_BACKUP: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_CALENDAR_REDIRECT_URI",
  "OAUTH_STATE_SECRET",
  "NODE_ENV",
] as const;

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

beforeEach(() => {
  // backup
  for (const k of ENV_KEYS) {
    ENV_BACKUP[k] = process.env[k];
  }
  // sane defaults (= success path 想定)
  setEnv("GOOGLE_CALENDAR_CLIENT_ID", "test-client-id");
  setEnv("GOOGLE_CALENDAR_REDIRECT_URI", "http://localhost:3000/api/calendar/google/callback");
  setEnv("OAUTH_STATE_SECRET", "test-state-secret-32bytes-base64-or-anything");
  setEnv("NODE_ENV", "test");
  mockAuthState = {
    data: { user: { id: "user-test-uuid" } },
    error: null,
  };
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    setEnv(k, ENV_BACKUP[k]);
  }
});

function callConnect(query: string = ""): Promise<Response> {
  const url = `http://localhost:3000/api/calendar/google/connect${query}`;
  const req = new NextRequest(url);
  return GET(req);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// pure helper test (= __test__ export 経由)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseIntent / promptForIntent (pure helpers)", () => {
  it("intent 不正 → 'initial' に fallback (= 安全側)", () => {
    expect(__test__.parseIntent(null)).toBe("initial");
    expect(__test__.parseIntent("")).toBe("initial");
    expect(__test__.parseIntent("nonsense")).toBe("initial");
  });

  it("intent valid → そのまま返る", () => {
    expect(__test__.parseIntent("initial")).toBe("initial");
    expect(__test__.parseIntent("reconsent")).toBe("reconsent");
    expect(__test__.parseIntent("reconnect")).toBe("reconnect");
  });

  it("promptForIntent: initial / reconsent → 'consent', reconnect → null", () => {
    expect(__test__.promptForIntent("initial")).toBe("consent");
    expect(__test__.promptForIntent("reconsent")).toBe("consent");
    expect(__test__.promptForIntent("reconnect")).toBe(null);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// env / authn degrade
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("connect route — env degrade", () => {
  it("CLIENT_ID 未設定 → /plan?calendar_connect_error=not_configured", async () => {
    setEnv("GOOGLE_CALENDAR_CLIENT_ID", undefined);
    const res = await callConnect();
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/plan");
    expect(loc).toContain("calendar_connect_error=not_configured");
  });

  it("REDIRECT_URI 未設定 → not_configured", async () => {
    setEnv("GOOGLE_CALENDAR_REDIRECT_URI", undefined);
    const res = await callConnect();
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("calendar_connect_error=not_configured");
  });

  it("OAUTH_STATE_SECRET 未設定 → not_configured", async () => {
    setEnv("OAUTH_STATE_SECRET", undefined);
    const res = await callConnect();
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("calendar_connect_error=not_configured");
  });
});

describe("connect route — authn degrade", () => {
  it("user 不在 → /login?next=/plan", async () => {
    mockAuthState = { data: { user: null }, error: null };
    const res = await callConnect();
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/login");
    expect(loc).toContain("next=%2Fplan");
  });

  it("supabaseServer throw → /plan?calendar_connect_error=auth_failed", async () => {
    mockAuthState = { ...mockAuthState, threw: true };
    const res = await callConnect();
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("calendar_connect_error=auth_failed");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Success path: Google OAuth URL 構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("connect route — Google OAuth URL", () => {
  it("intent=initial → Google authorize URL + scope + prompt=consent + state cookie", async () => {
    const res = await callConnect("?intent=initial");
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc.startsWith(__test__.GOOGLE_OAUTH_AUTHORIZE_URL)).toBe(true);

    const url = new URL(loc);
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/calendar/google/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBeTruthy();

    const scope = url.searchParams.get("scope") ?? "";
    expect(scope).toContain("https://www.googleapis.com/auth/calendar.events.readonly");
    expect(scope).toContain("https://www.googleapis.com/auth/calendar.calendarlist.readonly");

    // state cookie が Set-Cookie に含まれる
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(__test__.STATE_COOKIE_NAME);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax"); // sameSite=lax
  });

  it("intent=reconsent → prompt=consent (= refresh_token 再取得)", async () => {
    const res = await callConnect("?intent=reconsent");
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    const url = new URL(loc);
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("intent=reconnect → prompt 未指定 (= GPT 補正、 UX 軽量)", async () => {
    const res = await callConnect("?intent=reconnect");
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    const url = new URL(loc);
    expect(url.searchParams.has("prompt")).toBe(false);
  });

  it("intent 未指定 → default 'initial' → prompt=consent", async () => {
    const res = await callConnect();
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    const url = new URL(loc);
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("intent=nonsense → 'initial' fallback → prompt=consent", async () => {
    const res = await callConnect("?intent=nonsense");
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    const url = new URL(loc);
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("呼び出すたびに state が異なる (= 別 cookie value)", async () => {
    const res1 = await callConnect();
    const res2 = await callConnect();
    const state1 = new URL(res1.headers.get("location") ?? "").searchParams.get("state");
    const state2 = new URL(res2.headers.get("location") ?? "").searchParams.get("state");
    expect(state1).toBeTruthy();
    expect(state2).toBeTruthy();
    expect(state1).not.toBe(state2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Const sanity (= regression 検出用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("constants sanity", () => {
  it("scopes は 2 つ (= 親 Q2 採用案 c)", () => {
    expect(__test__.OAUTH_SCOPES).toHaveLength(2);
    expect(__test__.OAUTH_SCOPES).toContain(
      "https://www.googleapis.com/auth/calendar.events.readonly",
    );
    expect(__test__.OAUTH_SCOPES).toContain(
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    );
  });

  it("state cookie maxAge は 600 秒 (= 10 分)", () => {
    expect(__test__.STATE_COOKIE_MAX_AGE_SECONDS).toBe(600);
  });
});
