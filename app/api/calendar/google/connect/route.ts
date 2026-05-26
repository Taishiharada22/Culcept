/**
 * P3-A-1-1-c: Google Calendar OAuth connect route
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.4
 *
 * 役割:
 *   - user が 「Google を接続」 (= Plan header button、 P3-A-1-1-f で実装) tap → 本 route
 *   - state token 生成 + signed cookie 保管 + Google OAuth URL 構築 + 302 redirect
 *
 * フロー (= readiness §1.4 採用案):
 *   1. env (= CLIENT_ID / REDIRECT_URI / OAUTH_STATE_SECRET) 不在 → /plan?calendar_connect_error=not_configured
 *   2. supabase.auth.getUser() → user 不在 → /login?next=/plan
 *   3. query intent (= initial / reconsent / reconnect) → prompt 制御
 *      - initial / reconsent → prompt=consent (= refresh_token 確実発行)
 *      - reconnect → prompt 指定なし (= UX 軽量、 同意 screen 出さない、 GPT 補正)
 *   4. state token 生成 (= 32 bytes random)、 HMAC 署名 (= OAUTH_STATE_SECRET)
 *   5. Google OAuth URL 構築 (= scope: calendar.events.readonly + calendar.calendarlist.readonly)
 *   6. 302 redirect + Set-Cookie (= httpOnly / secure / sameSite=lax / maxAge=600s)
 *
 * 不変原則 (= CEO + GPT 確定 2026-05-26):
 *   - server-side only (= Client Secret / OAUTH_STATE_SECRET を browser に漏らさず)
 *   - env 未設定 / authn 失敗 は throw せず redirect で degrade (= readiness §1.7)
 *   - 既存 Supabase Auth (= email/password) には触らない、 認証 session は read-only 参照
 *
 * 範囲外 (= 別 commit):
 *   - callback handler (= P3-A-1-1-d)
 *   - token exchange / DB persist (= P3-A-1-1-d 内)
 *   - token refresh helper (= P3-A-1-1-e)
 *   - Plan header button UI (= P3-A-1-1-f)
 *   - 設定画面 (= P3-A-1-1-g)
 *   - failure banner UI (= P3-A-1-1-h)
 */

import { NextRequest, NextResponse } from "next/server";

import { generateState } from "@/lib/oauth/googleCalendarState";
import { supabaseServer } from "@/lib/supabase/server";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/**
 * 採用 scope (= 親 readiness Q2 採用案 c、 CEO 確定 2026-05-26):
 *   - calendar.events.readonly: 各 calendar の events 取得
 *   - calendar.calendarlist.readonly: user の calendar list 取得 (= primary + subscribed)
 * これ以上は要求しない (= 最小権限維持)
 */
const OAUTH_SCOPES: readonly string[] = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

const STATE_COOKIE_NAME = "gcal_oauth_state";
/** 10 分 (= OAuth consent screen の操作時間、 callback で expired なら mismatch 同視) */
const STATE_COOKIE_MAX_AGE_SECONDS = 600;

/** failure / auth 失敗時の戻り先 path (= UI banner 表示は P3-A-1-1-h で実装) */
const PLAN_REDIRECT_PATH = "/plan";
const LOGIN_REDIRECT_PATH = "/login";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Intent → prompt 制御 (= readiness §1.4 GPT 補正、 prompt=consent 限定化)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type ConnectIntent = "initial" | "reconsent" | "reconnect";

function parseIntent(value: string | null): ConnectIntent {
  if (value === "initial" || value === "reconsent" || value === "reconnect") {
    return value;
  }
  return "initial"; // default: 安全側 (= prompt=consent で refresh_token 確実発行)
}

/**
 * intent → prompt parameter
 *   - initial / reconsent: 'consent' (= refresh_token 確実発行)
 *   - reconnect: null (= prompt 指定なし、 UX 軽量、 既存 consent を再利用)
 */
function promptForIntent(intent: ConnectIntent): string | null {
  return intent === "reconnect" ? null : "consent";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Degrade helpers (= throw せず redirect)
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

  // ── 1. env check (= 不在なら degrade redirect) ──
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  const stateSecret = process.env.OAUTH_STATE_SECRET;

  if (!clientId || !redirectUri || !stateSecret) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[calendar/google/connect] not configured", {
        hasClientId: !!clientId,
        hasRedirectUri: !!redirectUri,
        hasStateSecret: !!stateSecret,
      });
    }
    return redirectWithError(origin, "not_configured");
  }

  // ── 2. authn check (= server-side getUser、 session 不在は /login へ) ──
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) {
      return redirectToLogin(origin);
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      const msg = e instanceof Error ? e.message : "unknown";
      console.warn("[calendar/google/connect] auth check threw", { msg });
    }
    return redirectWithError(origin, "auth_failed");
  }

  // ── 3. intent → prompt 制御 (= GPT 補正、 reconnect 時は prompt 指定なし) ──
  const intent = parseIntent(searchParams.get("intent"));
  const prompt = promptForIntent(intent);

  // ── 4. state 生成 + 署名 ──
  const { state, signedCookieValue } = generateState(stateSecret);

  // ── 5. Google OAuth URL 構築 ──
  const oauthUrl = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
  oauthUrl.searchParams.set("client_id", clientId);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  oauthUrl.searchParams.set("access_type", "offline"); // refresh_token 取得必須
  oauthUrl.searchParams.set("state", state);
  oauthUrl.searchParams.set("include_granted_scopes", "true"); // 過去 scope を保持
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
    path: "/", // callback で読めるよう / に設定 (= P3-A-1-1-d で消費)
  });

  // dev-only observation log (= production では emit しない)
  if (process.env.NODE_ENV !== "production") {
    console.info("[calendar/google/connect] redirecting to Google OAuth", {
      intent,
      prompt: prompt ?? "(not_set)",
      scopesCount: OAUTH_SCOPES.length,
    });
  }

  return response;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 用 export (= production code は GET のみ呼ぶ、 const は test で参照)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const __test__ = {
  GOOGLE_OAUTH_AUTHORIZE_URL,
  OAUTH_SCOPES,
  STATE_COOKIE_NAME,
  STATE_COOKIE_MAX_AGE_SECONDS,
  parseIntent,
  promptForIntent,
};
