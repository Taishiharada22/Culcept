/**
 * Track B TB-2: Microsoft (Outlook) OAuth API helpers (= token exchange、 fetch mockable)
 *
 * 設計書: docs/alter-plan-track-b-provider-native-readiness.md §3 TB-2
 *
 * 役割:
 *   - exchangeCodeForMicrosoftTokens: OAuth code → access_token + refresh_token
 *     (= Microsoft identity platform v2.0 token endpoint)
 *
 * 不変原則 (= Google googleCalendarApi と同方針):
 *   1. fetch は引数で inject 可能 (= default: global fetch、 test では mock)
 *   2. throw しない (= 戻り値で valid / invalid、 reason 付き)
 *   3. response shape validation 厳密 (= 想定外なら ok:false + reason='unknown')
 *   4. refresh_token なし (= offline_access scope 漏れ / reconnect 等) は missing_refresh_token
 *
 * MS 固有メモ:
 *   - tenant は `common` (= work/school + personal account 両対応)
 *   - token request に scope は不要 (= authorization code が consented scope を内包)
 *   - MS は Google の revoke endpoint 相当の簡易 API を持たない → disconnect は DB delete のみ
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Microsoft identity platform v2.0 (= common tenant: work/school + personal) */
export const MICROSOFT_OAUTH_AUTHORIZE_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
export const MICROSOFT_TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Token Exchange
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type MsTokenExchangeInput = {
  readonly code: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
};

export type MsTokenExchangeSuccess = {
  readonly ok: true;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
  readonly scopes: ReadonlyArray<string>;
};

export type MsTokenExchangeFailure = {
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

export type MsTokenExchangeResult = MsTokenExchangeSuccess | MsTokenExchangeFailure;

/**
 * code → tokens 交換 (= POST login.microsoftonline.com/common/oauth2/v2.0/token)
 *
 * 成功時: { access_token, refresh_token, expires_in, scope, token_type, ext_expires_in }
 * 失敗時: HTTP 4xx + JSON { error: 'invalid_grant' | ..., error_description }
 */
export async function exchangeCodeForMicrosoftTokens(
  input: MsTokenExchangeInput,
  fetchImpl: typeof fetch = fetch,
): Promise<MsTokenExchangeResult> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });

  let response: Response;
  try {
    response = await fetchImpl(MICROSOFT_TOKEN_ENDPOINT, {
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
      const json = (await response.json()) as {
        error?: unknown;
        error_description?: unknown;
      };
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
    // refresh_token なし → offline_access 漏れ or reconnect の可能性
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
// Token Refresh (= TB-4、 refresh_token → access_token)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** MS refresh で要求する scope (= connect と同、 MS は refresh 時 scope 必須) */
const MS_REFRESH_SCOPE = "openid offline_access Calendars.Read";

export type MsRefreshInput = {
  /** 復号済 refresh_token (= caller が復号して渡す) */
  readonly refreshToken: string;
  readonly clientId: string;
  readonly clientSecret: string;
};

export type MsRefreshSuccess = {
  readonly ok: true;
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly scopes: ReadonlyArray<string>;
};

export type MsRefreshFailure = {
  readonly ok: false;
  readonly reason:
    | "invalid_grant"
    | "invalid_client"
    | "invalid_request"
    | "network"
    | "unknown";
  readonly detail?: string;
};

export type MsRefreshResult = MsRefreshSuccess | MsRefreshFailure;

/**
 * refresh_token → 新 access_token (= POST /token grant_type=refresh_token)。
 *
 * MS 仕様メモ:
 *   - scope 必須 (= Google と差分)。
 *   - MS は refresh_token を rotation する (= 新 refresh_token を返しうる) が、 v1 では
 *     access_token のみ使用 (= 旧 refresh_token は 90 日有効。 失効時は再接続。 Google と同方針)。
 *   - 400 invalid_grant: refresh_token 失効 → 再接続要。
 */
export async function refreshMicrosoftAccessToken(
  input: MsRefreshInput,
  fetchImpl: typeof fetch = fetch,
): Promise<MsRefreshResult> {
  if (typeof input.refreshToken !== "string" || input.refreshToken.length === 0) {
    return { ok: false, reason: "invalid_request", detail: "empty_refresh_token" };
  }

  const body = new URLSearchParams({
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
    scope: MS_REFRESH_SCOPE,
  });

  let response: Response;
  try {
    response = await fetchImpl(MICROSOFT_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (e) {
    return { ok: false, reason: "network", detail: e instanceof Error ? e.message : "unknown" };
  }

  if (!response.ok) {
    let errorCode = "unknown";
    let detail = "";
    try {
      const json = (await response.json()) as {
        error?: unknown;
        error_description?: unknown;
      };
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

  const expiresInSeconds =
    typeof obj.expires_in === "number" && obj.expires_in > 0 ? obj.expires_in : 3600;
  const scopes =
    typeof obj.scope === "string" && obj.scope.length > 0 ? obj.scope.split(" ") : [];

  return { ok: true, accessToken: obj.access_token, expiresInSeconds, scopes };
}
