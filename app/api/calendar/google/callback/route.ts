/**
 * P3-A-1-1-d: Google Calendar OAuth callback route
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.4 / §1.5 / §1.7
 * decision-log: 2026-05-26 D3 採用、 unit test mock で品質担保
 *
 * 役割:
 *   - Google consent screen 完了 → 本 route に redirect (= ?code=...&state=...)
 *   - state cookie verify → token exchange → refresh_token 暗号化 → DB upsert →
 *     calendar list 取得 → subscriptions bulk upsert → /plan?calendar_connected=1
 *
 * フロー (= readiness §1.4 採用案):
 *   1. env (= 3 env + token encryption key) check → 不在で degrade
 *   2. URL search params 取得 (= code / state / error)
 *   3. Google から error parameter (= user 拒否等) → degrade redirect
 *   4. state cookie verify (= verifyState helper、 mismatch → degrade)
 *   5. state cookie cleanup (= 使い終わり)
 *   6. token exchange (= googleCalendarApi.exchangeCodeForTokens、 fetch)
 *   7. supabase.auth.getUser() で userId 取得
 *   8. refresh_token 暗号化 (= tokenCrypto.encryptToken、 AES-256-GCM)
 *   9. user_calendar_connections UPSERT (= calendarConnectionRepository)
 *   10. access_token で calendar list 取得 (= googleCalendarApi.fetchCalendarList)
 *   11. user_calendar_subscriptions bulk UPSERT (= 自動 is_enabled 判定)
 *   12. 完了 → /plan?calendar_connected=1
 *
 * 不変原則 (= CEO 実装条件 6 点):
 *   1. fetch mock で網羅 → ✅ exchangeCodeForTokens / fetchCalendarList が fetch 引数 inject
 *   2. AES-256-GCM helper を pure module 分離 → ✅ tokenCrypto.ts
 *   3. supabase client は mock で payload 厳密確認 → ✅ repository wrapper 経由
 *   4. state verify は既存 helper 再利用 → ✅ verifyState
 *   5. DB write 失敗時の degrade 明示 → ✅ 各 step で reason 別 redirect
 *   6. schema 不一致でも fail-safe → ✅ repository が throw せず ok:false
 */

import { NextRequest, NextResponse } from "next/server";

import { verifyState } from "@/lib/oauth/googleCalendarState";
import {
  bulkUpsertSubscriptions,
  upsertConnection,
} from "@/lib/oauth/calendarConnectionRepository";
import {
  exchangeCodeForTokens,
  fetchCalendarList,
} from "@/lib/oauth/googleCalendarApi";
import { encryptToken } from "@/lib/oauth/tokenCrypto";
import { supabaseServer } from "@/lib/supabase/server";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STATE_COOKIE_NAME = "gcal_oauth_state";
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

function redirectSuccess(origin: string, partial: boolean): NextResponse {
  const url = new URL(PLAN_REDIRECT_PATH, origin);
  url.searchParams.set("calendar_connected", "1");
  if (partial) {
    url.searchParams.set("calendar_connect_partial", "1");
  }
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
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  const stateSecret = process.env.OAUTH_STATE_SECRET;
  const tokenEncKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;

  if (!clientId || !clientSecret || !redirectUri || !stateSecret || !tokenEncKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/google/callback] not configured", {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        hasRedirectUri: !!redirectUri,
        hasStateSecret: !!stateSecret,
        hasTokenEncKey: !!tokenEncKey,
      });
    }
    return redirectWithError(origin, "not_configured");
  }

  // ── 2. URL search params ──
  const googleError = searchParams.get("error");
  const code = searchParams.get("code");
  const stateFromUrl = searchParams.get("state");

  // ── 3. Google から user 拒否等のエラー ──
  if (googleError) {
    // 例: 'access_denied' = user キャンセル
    return redirectWithError(origin, "canceled", { google_error: googleError });
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
      console.warn("[calendar/google/callback] state verify failed", { reason: stateCheck.reason });
    }
    return redirectWithError(origin, "state_mismatch");
  }
  if (stateCheck.state !== stateFromUrl) {
    return redirectWithError(origin, "state_mismatch");
  }

  // ── 5. token exchange ──
  const tokenResult = await exchangeCodeForTokens({
    code,
    clientId,
    clientSecret,
    redirectUri,
  });

  if (!tokenResult.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/google/callback] token exchange failed", {
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
      console.warn("[calendar/google/callback] auth check threw", { msg });
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
      console.warn("[calendar/google/callback] encryption failed", { msg });
    }
    // key 設定ミス等の致命的問題 → not_configured 同視
    return redirectWithError(origin, "not_configured");
  }

  // ── 8. user_calendar_connections UPSERT ──
  const supabase = await supabaseServer();
  const expiresAt = new Date(Date.now() + tokenResult.expiresInSeconds * 1000);
  const connectionResult = await upsertConnection(supabase, {
    userId,
    provider: "google",
    refreshTokenEncrypted: encryptedRefreshToken,
    accessTokenExpiresAt: expiresAt,
    scopes: tokenResult.scopes,
  });

  if (!connectionResult.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/google/callback] connection upsert failed", {
        detail: connectionResult.detail,
      });
    }
    return redirectWithError(origin, "db_connection_failed");
  }

  // ── 9. calendar list 取得 ──
  const listResult = await fetchCalendarList(tokenResult.accessToken);

  if (!listResult.ok) {
    // connection は upsert 済 (= 部分成功)、 subscriptions は次回 sync で再取得
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/google/callback] calendar list failed (partial)", {
        reason: listResult.reason,
        detail: listResult.detail,
      });
    }
    return redirectSuccess(origin, /* partial */ true);
  }

  // ── 10. user_calendar_subscriptions bulk UPSERT ──
  const subsResult = await bulkUpsertSubscriptions(supabase, {
    userId,
    connectionId: connectionResult.connectionId,
    calendars: listResult.items,
  });

  if (!subsResult.ok) {
    // connection は upsert 済、 list 取得済、 ただし subscriptions 失敗
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/google/callback] subscriptions upsert failed (partial)", {
        detail: subsResult.detail,
      });
    }
    return redirectSuccess(origin, /* partial */ true);
  }

  // ── 11. 完了 ──
  if (process.env.NODE_ENV !== "production") {
    console.info("[calendar/google/callback] success", {
      userId,
      subsCount: subsResult.insertedCount,
      scopesCount: tokenResult.scopes.length,
    });
  }

  return redirectSuccess(origin, /* partial */ false);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 用 export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const __test__ = {
  STATE_COOKIE_NAME,
};
