/**
 * Aneurasync API Response Standard
 *
 * 全APIルートで統一的なレスポンス形式を使用する。
 *
 * 成功: { ok: true, data: T }
 * 失敗: { ok: false, error: string, detail?: string, code?: string }
 */

import { NextResponse } from "next/server";

export interface ApiSuccess<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  detail?: string;
  code?: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

/** Success response helper */
export function apiOk<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

/** Error response helper */
export function apiError(
  error: string,
  status = 500,
  opts?: { detail?: string; code?: string },
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      ok: false,
      error,
      ...(opts?.detail && { detail: opts.detail }),
      ...(opts?.code && { code: opts.code }),
    },
    { status },
  );
}

/** 401 Unauthorized shorthand */
export function apiUnauthorized(): NextResponse<ApiError> {
  return apiError("Unauthorized", 401);
}

/** 400 Bad Request shorthand */
export function apiBadRequest(detail?: string): NextResponse<ApiError> {
  return apiError("Bad Request", 400, { detail });
}

/** 404 Not Found shorthand */
export function apiNotFound(detail?: string): NextResponse<ApiError> {
  return apiError("Not Found", 404, { detail });
}

/** 429 Rate Limited shorthand */
export function apiRateLimited(): NextResponse<ApiError> {
  return apiError("Too Many Requests", 429);
}

/** Safe error wrapper — logs and returns 500 */
export function apiCatch(err: unknown, context?: string): NextResponse<ApiError> {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[API Error]${context ? ` ${context}` : ""}:`, err);
  return apiError("Internal Server Error", 500, { detail: message });
}
