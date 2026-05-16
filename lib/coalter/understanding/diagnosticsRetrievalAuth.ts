/**
 * CoAlter Movie Understanding — Diagnostics Retrieval Auth (A4 phase)
 *
 * 正本:
 *   - docs/coalter-diagnostics-retrieval-preflight-a4.md §9 (Option A 推奨案)
 *   - lib/coalter/understanding/redactedDiagnosticsBuffer.ts (A2、PR #146)
 *   - lib/coalter/understanding/diagnosticsFanout.ts (A3、PR #147)
 *
 * 役割:
 *   read-only diagnostics retrieval API (`/api/coalter/diagnostics/preview`)
 *   の **auth helper (pure function)** を提供する。
 *
 *   - env guard (`VERCEL_ENV === "preview"`)
 *   - token guard (`Authorization: Bearer <token>`、timing-safe compare)
 *   - twin-layer guard で twin defense (production exposure + token leak 両方の risk 最小化)
 *
 * **本 A4 phase の auth 設計**:
 *   - Option A 採用 (CEO 2026-05-16): Preview env + secret token header
 *   - Token rotation friendly: CURRENT + PREVIOUS 2 token 受領 (PREVIOUS 未設定なら skip)
 *   - 404 vs 401 vs 403 distinction:
 *       production / non-preview / token env 未設定 → 404 (route 存在隠蔽)
 *       preview + missing Authorization → 401
 *       preview + invalid token → 403
 *       preview + valid token → 200
 *
 * 構造的安全設計 (A2 + A3 継承 + A4 強化):
 *   1. **Timing-safe compare** (CEO 必須):
 *      - `crypto.timingSafeEqual` で token 比較
 *      - timing attack 防止
 *      - length 不一致は早期 fast-fail (length は固定 fail、情報漏洩なし)
 *   2. **No console emit** (CEO 補正、2026-05-16):
 *      - preflight 内 "Audit log via console" は **採用しない**
 *      - console.log / console.warn / console.error 一切追加なし
 *   3. **No external side effect**:
 *      - DB / Supabase / fetch / localStorage 一切なし
 *      - pure function、process.env / crypto のみ参照
 *   4. **Fail-closed**:
 *      - env / token 不在 → 404 相当 (route file で status code 返却)
 *      - 例外 → 500 相当 (詳細不含、stack trace 漏洩防止)
 *
 * **本 PR の不可触 (CEO 2026-05-16 制約)**:
 *   - Vercel env / Production env 変更
 *   - token 値 を code / docs / PR body に書く
 *   - console emit / Sentry / telemetry send
 *   - Supabase / DB / migration
 *   - localStorage / sessionStorage / cookie
 *   - ChatClient / UpperLayerMount / UI 変更
 *   - Pattern activation / live variant 発火
 *   - COALTER_UNDERSTANDING_DIAGNOSTICS / COALTER_UNDERSTANDING_BUFFER_FANOUT /
 *     COALTER_UNDERSTANDING_SHADOW_MOVIE 変更
 */

import { timingSafeEqual } from "node:crypto";

// ─────────────────────────────────────────────
// const exports (env var names、固定)
// ─────────────────────────────────────────────

/**
 * Env var name for current diagnostics token (primary).
 *
 * **本 PR では env file / Vercel env 変更なし**。
 * CEO 側で `vercel env add COALTER_DIAGNOSTICS_TOKEN_CURRENT preview` を実行する想定。
 */
export const DIAGNOSTICS_TOKEN_CURRENT_ENV_VAR = "COALTER_DIAGNOSTICS_TOKEN_CURRENT" as const;

/**
 * Env var name for previous diagnostics token (rotation window 用、optional).
 *
 * Token rotation 時に旧 token を accept する rotation window 確保用。
 * 本 PR では env 未設定なら skip (PREVIOUS なしでも動作可能、CURRENT のみで開始可)。
 */
export const DIAGNOSTICS_TOKEN_PREVIOUS_ENV_VAR = "COALTER_DIAGNOSTICS_TOKEN_PREVIOUS" as const;

/**
 * Expected `VERCEL_ENV` value for preview environment.
 *
 * Vercel が自動設定する env (production / preview / development)。
 */
export const VERCEL_ENV_PREVIEW = "preview" as const;

/**
 * Auth helper version (independent of route / API version).
 */
export const DIAGNOSTICS_RETRIEVAL_AUTH_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// Auth check result enum (HTTP status code mapping)
// ─────────────────────────────────────────────

/**
 * Auth check outcome (HTTP status code mapping).
 *
 *   - "not_preview_env" → 404 (production / non-preview = route 存在隠蔽)
 *   - "token_env_unset" → 404 (Preview だが token 未設定、route 隠蔽継続)
 *   - "missing_authorization" → 401 (preview + token env あり、auth header 不在)
 *   - "invalid_authorization_format" → 401 (Bearer prefix 不在等)
 *   - "invalid_token" → 403 (preview + token env あり、token 不一致)
 *   - "valid_token_current" → 200 (CURRENT token 一致)
 *   - "valid_token_previous" → 200 (PREVIOUS token 一致、rotation window)
 */
export type AuthCheckResult =
  | "not_preview_env"
  | "token_env_unset"
  | "missing_authorization"
  | "invalid_authorization_format"
  | "invalid_token"
  | "valid_token_current"
  | "valid_token_previous";

// ─────────────────────────────────────────────
// Helper: env check (pure)
// ─────────────────────────────────────────────

/**
 * Check if current environment is Vercel Preview.
 *
 * `VERCEL_ENV === "preview"` のみ true、production / development / 未設定は false。
 */
export function isPreviewEnv(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  return process.env.VERCEL_ENV === VERCEL_ENV_PREVIEW;
}

/**
 * Get expected tokens from env (CURRENT + optional PREVIOUS).
 *
 * **本関数は token 値を返すが、ログ出力 / 保存しない**。
 * 呼出側 (auth check) で即時 compare、メモリ外には漏れない。
 */
export function getExpectedTokens(): {
  current: string | undefined;
  previous: string | undefined;
} {
  if (typeof process === "undefined" || !process.env) {
    return { current: undefined, previous: undefined };
  }
  const current = process.env[DIAGNOSTICS_TOKEN_CURRENT_ENV_VAR];
  const previous = process.env[DIAGNOSTICS_TOKEN_PREVIOUS_ENV_VAR];
  // 空文字は undefined 扱い (fail-closed)
  return {
    current: current !== undefined && current.length > 0 ? current : undefined,
    previous: previous !== undefined && previous.length > 0 ? previous : undefined,
  };
}

// ─────────────────────────────────────────────
// Helper: extract bearer token from Authorization header (pure)
// ─────────────────────────────────────────────

/**
 * Parse `Authorization: Bearer <token>` header (case-insensitive Bearer prefix).
 *
 * @returns token string、または undefined (header 不在 / format 不正)
 */
export function extractBearerToken(authHeader: string | null | undefined): string | undefined {
  if (authHeader === null || authHeader === undefined) return undefined;
  if (typeof authHeader !== "string") return undefined;
  const trimmed = authHeader.trim();
  if (trimmed.length === 0) return undefined;
  // Bearer prefix (case-insensitive、token 部分は preserve)
  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (match === null) return undefined;
  const token = match[1].trim();
  if (token.length === 0) return undefined;
  return token;
}

// ─────────────────────────────────────────────
// Helper: timing-safe token compare (人間超越 Idea C + J)
// ─────────────────────────────────────────────

/**
 * Compare provided token against expected token in timing-safe manner.
 *
 * **人間超越 Idea J (length check before compare)**:
 *   - length 不一致は早期 fast-fail (length は client が知っているので情報漏洩なし、
 *     timing-safe 用途では length 同一前提)
 *   - timingSafeEqual は同 length buffer のみ accept、length 不一致は throw
 *
 * **No console emit** (CEO 補正、2026-05-16):
 *   - 比較失敗時も console 呼ばない、return false のみ
 */
export function timingSafeTokenEqual(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  // Both same length、convert to Buffer for timingSafeEqual
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

// ─────────────────────────────────────────────
// Main: auth check (pure function、stateless)
// ─────────────────────────────────────────────

/**
 * Perform diagnostics retrieval auth check.
 *
 * **本関数は純関数**: input (authHeader) + 環境 (VERCEL_ENV, env tokens) → output。
 * 副作用なし、console / fetch / DB 一切呼ばない。
 *
 * **Behavior matrix** (CEO 2026-05-16 採用案):
 *
 * | env / token / header | result | status code |
 * |---|---|---|
 * | not preview | not_preview_env | 404 |
 * | preview, CURRENT token unset | token_env_unset | 404 |
 * | preview, token env set, no Authorization | missing_authorization | 401 |
 * | preview, token env set, malformed Authorization | invalid_authorization_format | 401 |
 * | preview, token env set, wrong token | invalid_token | 403 |
 * | preview, token env set, match CURRENT | valid_token_current | 200 |
 * | preview, token env set, match PREVIOUS (rotation) | valid_token_previous | 200 |
 *
 * **Twin-layer guard** (人間超越 Idea A):
 *   - Layer 1: env guard (production = 404、production env に token 不在で二重防御)
 *   - Layer 2: token guard (timing-safe compare)
 *
 * @param authHeader Authorization header value (request 由来)
 * @returns AuthCheckResult enum (HTTP status code mapping は route handler 側)
 */
export function checkDiagnosticsRetrievalAuth(
  authHeader: string | null | undefined,
): AuthCheckResult {
  // Layer 1: env guard
  if (!isPreviewEnv()) return "not_preview_env";

  // Token env check (404 で隠蔽、route 自体の存在を明かさない)
  const { current: expectedCurrent, previous: expectedPrevious } = getExpectedTokens();
  if (expectedCurrent === undefined) return "token_env_unset";

  // Authorization header check
  if (authHeader === null || authHeader === undefined) return "missing_authorization";
  if (typeof authHeader !== "string" || authHeader.trim().length === 0) {
    return "missing_authorization";
  }

  const providedToken = extractBearerToken(authHeader);
  if (providedToken === undefined) return "invalid_authorization_format";

  // Token compare (timing-safe、CURRENT 優先 → PREVIOUS fallback)
  if (timingSafeTokenEqual(providedToken, expectedCurrent)) {
    return "valid_token_current";
  }
  if (expectedPrevious !== undefined && timingSafeTokenEqual(providedToken, expectedPrevious)) {
    return "valid_token_previous";
  }

  return "invalid_token";
}

// ─────────────────────────────────────────────
// Helper: HTTP status code mapping (pure)
// ─────────────────────────────────────────────

/**
 * Map AuthCheckResult to HTTP status code.
 *
 * **404 vs 401 vs 403 distinction** (人間超越 Idea E):
 *   - production 隠蔽 (404)
 *   - auth エラー明示 (401 / 403)
 */
export function authCheckResultToStatusCode(result: AuthCheckResult): number {
  switch (result) {
    case "not_preview_env":
    case "token_env_unset":
      return 404;
    case "missing_authorization":
    case "invalid_authorization_format":
      return 401;
    case "invalid_token":
      return 403;
    case "valid_token_current":
    case "valid_token_previous":
      return 200;
  }
}

// ─────────────────────────────────────────────
// Helper: minimal error body (人間超越 Idea L、production stability)
// ─────────────────────────────────────────────

/**
 * Build minimal error body for non-200 responses.
 *
 * **Generic error message** (production stability):
 *   - stack trace / 詳細 / token 値を含めない
 *   - enum-only reason code
 */
export function buildAuthErrorBody(result: AuthCheckResult): {
  error: string;
} | null {
  switch (result) {
    case "not_preview_env":
    case "token_env_unset":
      return null; // 404 では body 不要 (Vercel default 404 page or empty)
    case "missing_authorization":
      return { error: "missing_authorization" };
    case "invalid_authorization_format":
      return { error: "invalid_authorization_format" };
    case "invalid_token":
      return { error: "invalid_token" };
    case "valid_token_current":
    case "valid_token_previous":
      return null; // 200 では body 不要 (success 側で snapshot 返却)
  }
}
