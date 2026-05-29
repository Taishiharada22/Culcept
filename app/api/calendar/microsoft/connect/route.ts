/**
 * Track B TB-2: Microsoft (Outlook) OAuth connect route
 *
 * 設計書: docs/alter-plan-track-b-provider-native-readiness.md §3 TB-2
 * (= Google connect route [P3-A-1-1-c] を mirror、 MS endpoint / scope / cookie 名のみ差替)
 *
 * 役割:
 *   - user が「Outlook を接続」tap → 本 route → state 生成 + signed cookie + MS OAuth URL + 302
 *
 * MS 固有:
 *   - authorize: login.microsoftonline.com/common/oauth2/v2.0/authorize
 *   - scope: openid offline_access Calendars.Read (= refresh token は offline_access)
 *   - response_mode=query。 access_type は使わない (= Google 固有)
 *
 * 不変原則 (= Google connect と同): server-side only / env 未設定・authn 失敗で degrade redirect。
 */

import { NextRequest, NextResponse } from "next/server";

import { generateState } from "@/lib/oauth/googleCalendarState";
import { MICROSOFT_OAUTH_AUTHORIZE_URL } from "@/lib/oauth/microsoftCalendarApi";
import { supabaseServer } from "@/lib/supabase/server";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 採用 scope (= 最小権限: 読み取り + refresh + sign-in) */
const OAUTH_SCOPES: readonly string[] = ["openid", "offline_access", "Calendars.Read"];

const STATE_COOKIE_NAME = "mscal_oauth_state";
const STATE_COOKIE_MAX_AGE_SECONDS = 600;
const PLAN_REDIRECT_PATH = "/plan";
const LOGIN_REDIRECT_PATH = "/login";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Intent → prompt 制御 (= Google connect と同方針)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type ConnectIntent = "initial" | "reconsent" | "reconnect";

function parseIntent(value: string | null): ConnectIntent {
  if (value === "initial" || value === "reconsent" || value === "reconnect") {
    return value;
  }
  return "initial";
}

function promptForIntent(intent: ConnectIntent): string | null {
  return intent === "reconnect" ? null : "consent";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Degrade helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function redirectWithError(origin: string, code: string): NextResponse {
  const url = new URL(PLAN_REDIRECT_PATH, origin);
  url.searchParams.set("calendar_connect_error", code);
  return NextResponse.redirect(url);
}

function redirectToLogin(origin: string): NextResponse {
  const url = new URL(LOGIN_REDIRECT_PATH, origin);
  url.searchParams.set("next", PLAN_REDIRECT_PATH);
  return NextResponse.redirect(url);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const { origin, searchParams } = requestUrl;

  // ── 1. env check ──
  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  const redirectUri = process.env.MICROSOFT_CALENDAR_REDIRECT_URI;
  const stateSecret = process.env.OAUTH_STATE_SECRET;

  if (!clientId || !redirectUri || !stateSecret) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/microsoft/connect] not configured", {
        hasClientId: !!clientId,
        hasRedirectUri: !!redirectUri,
        hasStateSecret: !!stateSecret,
      });
    }
    return redirectWithError(origin, "not_configured");
  }

  // ── 2. authn check ──
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) {
      return redirectToLogin(origin);
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      const msg = e instanceof Error ? e.message : "unknown";
      console.warn("[calendar/microsoft/connect] auth check threw", { msg });
    }
    return redirectWithError(origin, "auth_failed");
  }

  // ── 3. intent → prompt ──
  const intent = parseIntent(searchParams.get("intent"));
  const prompt = promptForIntent(intent);

  // ── 4. state 生成 + 署名 ──
  const { state, signedCookieValue } = generateState(stateSecret);

  // ── 5. MS OAuth URL 構築 ──
  const oauthUrl = new URL(MICROSOFT_OAUTH_AUTHORIZE_URL);
  oauthUrl.searchParams.set("client_id", clientId);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("response_mode", "query");
  oauthUrl.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  oauthUrl.searchParams.set("state", state);
  if (prompt) {
    oauthUrl.searchParams.set("prompt", prompt);
  }

  // ── 6. 302 redirect + Set-Cookie ──
  const response = NextResponse.redirect(oauthUrl);
  response.cookies.set({
    name: STATE_COOKIE_NAME,
    value: signedCookieValue,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });

  if (process.env.NODE_ENV !== "production") {
    console.info("[calendar/microsoft/connect] redirecting to Microsoft OAuth", {
      intent,
      prompt: prompt ?? "(not_set)",
      scopesCount: OAUTH_SCOPES.length,
    });
  }

  return response;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 用 export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const __test__ = {
  MICROSOFT_OAUTH_AUTHORIZE_URL,
  OAUTH_SCOPES,
  STATE_COOKIE_NAME,
  STATE_COOKIE_MAX_AGE_SECONDS,
  parseIntent,
  promptForIntent,
};
