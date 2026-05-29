/**
 * Track B TB-2: Microsoft (Outlook) OAuth callback route
 *
 * 設計書: docs/alter-plan-track-b-provider-native-readiness.md §3 TB-2
 * (= Google callback route [P3-A-1-1-d] を mirror)
 *
 * フロー:
 *   1. env check → 不在で degrade
 *   2. URL params (= code / state / error)
 *   3. MS error parameter (= user 拒否等) → degrade
 *   4. state cookie verify
 *   5. token exchange (= exchangeCodeForMicrosoftTokens)
 *   6. supabase.auth.getUser() で userId 取得
 *   7. refresh_token 暗号化 (= tokenCrypto)
 *   8. user_calendar_connections UPSERT (provider='microsoft')
 *   9. 完了 → /plan?calendar_connected=1
 *
 * Google との差分:
 *   - calendar list 取得 / subscriptions bulk upsert は **行わない** (= MS は import 時に
 *     /me/calendarView を直接叩く [TB-3/4]、 subscriptions table は使わない)。
 *   - よって partial 成功 path なし (= connection upsert 成否のみ)。
 *
 * 不変原則: state verify は既存 helper 再利用 / repository は throw せず ok:false / secret 非露出。
 */

import { NextRequest, NextResponse } from "next/server";

import { verifyState } from "@/lib/oauth/googleCalendarState";
import { upsertConnection } from "@/lib/oauth/calendarConnectionRepository";
import { exchangeCodeForMicrosoftTokens } from "@/lib/oauth/microsoftCalendarApi";
import { encryptToken } from "@/lib/oauth/tokenCrypto";
import { supabaseServer } from "@/lib/supabase/server";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STATE_COOKIE_NAME = "mscal_oauth_state";
const PLAN_REDIRECT_PATH = "/plan";
const LOGIN_REDIRECT_PATH = "/login";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Redirect helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function redirectWithError(
  origin: string,
  code: string,
  extra?: Record<string, string>,
): NextResponse {
  const url = new URL(PLAN_REDIRECT_PATH, origin);
  url.searchParams.set("calendar_connect_error", code);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      url.searchParams.set(k, v);
    }
  }
  const response = NextResponse.redirect(url);
  clearStateCookie(response);
  return response;
}

function redirectToLogin(origin: string): NextResponse {
  const url = new URL(LOGIN_REDIRECT_PATH, origin);
  url.searchParams.set("next", PLAN_REDIRECT_PATH);
  const response = NextResponse.redirect(url);
  clearStateCookie(response);
  return response;
}

function redirectSuccess(origin: string): NextResponse {
  const url = new URL(PLAN_REDIRECT_PATH, origin);
  url.searchParams.set("calendar_connected", "1");
  const response = NextResponse.redirect(url);
  clearStateCookie(response);
  return response;
}

function clearStateCookie(response: NextResponse): void {
  response.cookies.set({
    name: STATE_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const { origin, searchParams } = requestUrl;

  // ── 1. env check ──
  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_CALENDAR_REDIRECT_URI;
  const stateSecret = process.env.OAUTH_STATE_SECRET;
  const tokenEncKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;

  if (!clientId || !clientSecret || !redirectUri || !stateSecret || !tokenEncKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/microsoft/callback] not configured", {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        hasRedirectUri: !!redirectUri,
        hasStateSecret: !!stateSecret,
        hasTokenEncKey: !!tokenEncKey,
      });
    }
    return redirectWithError(origin, "not_configured");
  }

  // ── 2. URL params ──
  const oauthError = searchParams.get("error");
  const code = searchParams.get("code");
  const stateFromUrl = searchParams.get("state");

  // ── 3. MS から user 拒否等 ──
  if (oauthError) {
    return redirectWithError(origin, "canceled", { provider_error: oauthError });
  }
  if (!code || !stateFromUrl) {
    return redirectWithError(origin, "invalid_request");
  }

  // ── 4. state cookie verify ──
  const stateCookie = request.cookies.get(STATE_COOKIE_NAME)?.value;
  if (!stateCookie) {
    return redirectWithError(origin, "state_missing");
  }
  const stateCheck = verifyState(stateCookie, stateSecret);
  if (!stateCheck.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/microsoft/callback] state verify failed", { reason: stateCheck.reason });
    }
    return redirectWithError(origin, "state_mismatch");
  }
  if (stateCheck.state !== stateFromUrl) {
    return redirectWithError(origin, "state_mismatch");
  }

  // ── 5. token exchange ──
  const tokenResult = await exchangeCodeForMicrosoftTokens({
    code,
    clientId,
    clientSecret,
    redirectUri,
  });

  if (!tokenResult.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/microsoft/callback] token exchange failed", {
        reason: tokenResult.reason,
        detail: tokenResult.detail,
      });
    }
    return redirectWithError(origin, `token_${tokenResult.reason}`);
  }

  // ── 6. supabase userId ──
  let userId: string;
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) {
      return redirectToLogin(origin);
    }
    userId = data.user.id;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      const msg = e instanceof Error ? e.message : "unknown";
      console.warn("[calendar/microsoft/callback] auth check threw", { msg });
    }
    return redirectWithError(origin, "auth_failed");
  }

  // ── 7. refresh_token 暗号化 ──
  let encryptedRefreshToken: Buffer;
  try {
    encryptedRefreshToken = encryptToken(tokenResult.refreshToken, tokenEncKey);
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      const msg = e instanceof Error ? e.message : "unknown";
      console.warn("[calendar/microsoft/callback] encryption failed", { msg });
    }
    return redirectWithError(origin, "not_configured");
  }

  // ── 8. user_calendar_connections UPSERT (provider='microsoft') ──
  const supabase = await supabaseServer();
  const expiresAt = new Date(Date.now() + tokenResult.expiresInSeconds * 1000);
  const connectionResult = await upsertConnection(supabase, {
    userId,
    provider: "microsoft",
    refreshTokenEncrypted: encryptedRefreshToken,
    accessTokenExpiresAt: expiresAt,
    scopes: tokenResult.scopes,
  });

  if (!connectionResult.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/microsoft/callback] connection upsert failed", {
        detail: connectionResult.detail,
      });
    }
    return redirectWithError(origin, "db_connection_failed");
  }

  // ── 9. 完了 (= subscriptions step なし、 import は /me/calendarView 直 [TB-3/4]) ──
  if (process.env.NODE_ENV !== "production") {
    console.info("[calendar/microsoft/callback] success", {
      userId,
      scopesCount: tokenResult.scopes.length,
    });
  }

  return redirectSuccess(origin);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 用 export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const __test__ = {
  STATE_COOKIE_NAME,
};
