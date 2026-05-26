/**
 * P3-A-1-1-d: Google Calendar API helpers (= token exchange + calendar list、 fetch mockable)
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.4 / §1.5
 * decision-log: 2026-05-26 D3 採用、 unit test mock で品質担保
 *
 * 役割:
 *   - exchangeCodeForTokens: OAuth code → access_token + refresh_token (= Google token endpoint)
 *   - fetchCalendarList: access_token → 取り込み対象 calendar list (= primary + subscribed)
 *
 * 不変原則 (= CEO 実装条件 1):
 *   1. fetch は引数で inject 可能 (= default: global fetch、 test では mock)
 *   2. throw しない (= 戻り値で valid / invalid、 reason 付き)
 *   3. response shape validation 厳密 (= 想定外なら ok:false + reason='unknown')
 *   4. error 種別を判別可能 (= reason field で UI が degrade 方針を決める)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_LIST_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Token Exchange
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TokenExchangeInput = {
  readonly code: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
};

export type TokenExchangeSuccess = {
  readonly ok: true;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
  readonly scopes: ReadonlyArray<string>;
};

export type TokenExchangeFailure = {
  readonly ok: false;
  readonly reason:
    | "network"
    | "invalid_grant"
    | "invalid_client"
    | "invalid_request"
    | "missing_refresh_token"
    | "unknown";
  readonly detail?: string;
};

export type TokenExchangeResult = TokenExchangeSuccess | TokenExchangeFailure;

/**
 * code → tokens 交換 (= POST https://oauth2.googleapis.com/token)
 *
 * 成功時: { access_token, refresh_token, expires_in, scope }
 * 失敗時: HTTP 4xx + JSON { error: 'invalid_grant' | ... }
 *
 * 不変原則:
 *   - refresh_token が来ない (= prompt=consent なしの reconnect 等) は missing_refresh_token として扱う
 *     (= callback 側で既存 refresh_token 維持 or user に再連携要求の判断材料)
 */
export async function exchangeCodeForTokens(
  input: TokenExchangeInput,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });

  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (e) {
    return {
      ok: false,
      reason: "network",
      detail: e instanceof Error ? e.message : "unknown",
    };
  }

  // HTTP error → 標準 OAuth error code を抽出
  if (!response.ok) {
    let errorCode = "unknown";
    let detail = "";
    try {
      const json = (await response.json()) as { error?: unknown; error_description?: unknown };
      if (typeof json.error === "string") errorCode = json.error;
      if (typeof json.error_description === "string") detail = json.error_description;
    } catch {
      detail = `http_${response.status}`;
    }
    const reason =
      errorCode === "invalid_grant" ||
      errorCode === "invalid_client" ||
      errorCode === "invalid_request"
        ? errorCode
        : "unknown";
    return { ok: false, reason, detail };
  }

  // 成功 → response body parse + shape 検証
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, reason: "unknown", detail: "invalid_json" };
  }

  if (json === null || typeof json !== "object") {
    return { ok: false, reason: "unknown", detail: "not_object" };
  }
  const obj = json as Record<string, unknown>;
  if (typeof obj.access_token !== "string" || obj.access_token.length === 0) {
    return { ok: false, reason: "unknown", detail: "missing_access_token" };
  }
  if (typeof obj.refresh_token !== "string" || obj.refresh_token.length === 0) {
    // refresh_token なし → 既存 connection の reconnect 等の可能性
    return { ok: false, reason: "missing_refresh_token", detail: "refresh_token absent" };
  }

  const expiresInSeconds =
    typeof obj.expires_in === "number" && obj.expires_in > 0 ? obj.expires_in : 3600;
  const scopes =
    typeof obj.scope === "string" && obj.scope.length > 0 ? obj.scope.split(" ") : [];

  return {
    ok: true,
    accessToken: obj.access_token,
    refreshToken: obj.refresh_token,
    expiresInSeconds,
    scopes,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Calendar List
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type CalendarListItem = {
  readonly id: string;
  readonly summary: string;
  readonly primary: boolean;
  readonly accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
};

export type CalendarListResult =
  | { readonly ok: true; readonly items: ReadonlyArray<CalendarListItem> }
  | { readonly ok: false; readonly reason: "network" | "unauthorized" | "unknown"; readonly detail?: string };

/**
 * access_token で user の calendar list を取得 (= GET calendar/v3/users/me/calendarList)
 *
 * fields を限定 (= id, summary, primary, accessRole) して payload を最小化。
 * 不正 shape の item は skip (= 戻り値の items から落とす)。
 */
export async function fetchCalendarList(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CalendarListResult> {
  const url = new URL(GOOGLE_CALENDAR_LIST_ENDPOINT);
  url.searchParams.set("fields", "items(id,summary,primary,accessRole)");
  url.searchParams.set("minAccessRole", "reader");

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    return {
      ok: false,
      reason: "network",
      detail: e instanceof Error ? e.message : "unknown",
    };
  }

  if (response.status === 401) {
    return { ok: false, reason: "unauthorized" };
  }
  if (!response.ok) {
    return { ok: false, reason: "unknown", detail: `http_${response.status}` };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, reason: "unknown", detail: "invalid_json" };
  }

  if (json === null || typeof json !== "object") {
    return { ok: false, reason: "unknown", detail: "not_object" };
  }
  const rawItems = (json as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) {
    return { ok: false, reason: "unknown", detail: "items_not_array" };
  }

  const items: CalendarListItem[] = [];
  for (const raw of rawItems) {
    if (raw === null || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id.length === 0) continue;
    if (typeof r.summary !== "string") continue;
    const role = r.accessRole;
    if (
      role !== "owner" &&
      role !== "writer" &&
      role !== "reader" &&
      role !== "freeBusyReader"
    ) {
      continue;
    }
    items.push({
      id: r.id,
      summary: r.summary,
      primary: r.primary === true,
      accessRole: role,
    });
  }

  return { ok: true, items };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Token Revocation (= P3-A-1-1-f disconnect 用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type RevokeResult =
  | { readonly ok: true; readonly alreadyRevoked: boolean }
  | { readonly ok: false; readonly reason: "network" | "unknown"; readonly detail?: string };

/**
 * Google token (= refresh_token or access_token) を revoke。
 *
 * - 200 OK → ok: true (= 新規 revoke 成功)
 * - 400 invalid_token → ok: true, alreadyRevoked: true (= 既 revoke 済 / 期限切れ、 idempotent 扱い)
 * - 401 / 403 / 500 等 → ok: false, reason="unknown"
 * - network throw → ok: false, reason="network"
 *
 * Google 仕様: https://oauth2.googleapis.com/revoke?token=<token>
 *   - POST + Content-Type: application/x-www-form-urlencoded
 *   - body 形式: `token=<token>`
 */
export async function revokeGoogleToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RevokeResult> {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "unknown", detail: "empty_token" };
  }

  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `token=${encodeURIComponent(token)}`,
    });
  } catch (e) {
    return {
      ok: false,
      reason: "network",
      detail: e instanceof Error ? e.message : "unknown",
    };
  }

  if (response.ok) {
    return { ok: true, alreadyRevoked: false };
  }

  // 400 = invalid_token (= 既 revoke 済 or 期限切れ): idempotent として扱う
  if (response.status === 400) {
    return { ok: true, alreadyRevoked: true };
  }

  return { ok: false, reason: "unknown", detail: `http_${response.status}` };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 用 const export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const __test__ = {
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_CALENDAR_LIST_ENDPOINT,
  GOOGLE_REVOKE_ENDPOINT,
};
