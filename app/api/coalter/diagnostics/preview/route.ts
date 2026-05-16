// A4 smoke trigger (PR #150) — single-line marker to bypass vercel.json
// ignoreCommand which skips builds when only .md files change. This branch
// is short-lived; will be discarded after auth smoke (production→404 /
// no-token preview→401 / invalid-token preview→403). Valid-token check is
// CEO-side (Claude never sees the token).
// Phase 2: COALTER_UNDERSTANDING_BUFFER_FANOUT=true added to Preview only —
// movie conversation should fan out redacted observations into A2 in-memory
// buffer, then retrieval shows eventCount>0 (subject to Vercel serverless
// per-process isolation — if eventCount=0, suspect process boundary first).
/**
 * CoAlter Movie Understanding — Diagnostics Retrieval Route (A4 phase)
 *
 * 正本:
 *   - docs/coalter-diagnostics-retrieval-preflight-a4.md §5/§6/§9 (推奨案 Option A)
 *   - lib/coalter/understanding/diagnosticsRetrievalAuth.ts (auth helper、本 PR)
 *   - lib/coalter/understanding/redactedDiagnosticsBuffer.ts (A2、PR #146)
 *
 * 役割:
 *   GET /api/coalter/diagnostics/preview
 *   read-only retrieval API for A2 redacted diagnostics buffer。
 *
 *   **Preview-only + secret token header + GET read-only + production 404**
 *
 *   - production env / non-preview env → 404 (route 存在隠蔽)
 *   - preview + token env 未設定 → 404 (隠蔽継続)
 *   - preview + token env 設定済 + missing Authorization → 401
 *   - preview + invalid token → 403
 *   - preview + valid token → 200 (A2 buffer snapshot 返却)
 *
 * 構造的安全設計 (A2 + A3 継承 + A4 強化):
 *   1. **GET only**: POST / PUT / DELETE handler 未定義 → Next.js が 405 を自動返却
 *   2. **No console emit** (CEO 補正 2026-05-16):
 *      - audit log 含む console 出力 一切なし
 *   3. **No external side effect**:
 *      - DB / Supabase / fetch / localStorage / sessionStorage / cookie 一切なし
 *      - A2 buffer の memory snapshot のみ読む
 *   4. **Cache-Control: no-store, private**:
 *      - CDN / proxy caching 防止 (PII 不在だが念のため)
 *   5. **No CORS** (人間超越 Idea M):
 *      - 同一 origin admin only 想定
 *      - OPTIONS handler 不定義 = 404 / 405
 *   6. **Fail-closed**:
 *      - 例外 → 500 + 詳細不含 body (stack trace 漏洩防止)
 *      - 異常 input → enum-only error code
 *   7. **Defensive copy from A2**:
 *      - A2 `getRedactedUnderstandingDiagnosticsSnapshot()` が defensive copy 済
 *      - response 内 events は caller mutate 不可
 *
 * **本 PR 不可触 (CEO 2026-05-16 制約)**:
 *   - Vercel env / Production env 変更
 *   - token 値を code / docs に書く (placeholder のみ)
 *   - console emit
 *   - Sentry / telemetry send
 *   - Supabase / DB / migration
 *   - localStorage / sessionStorage / cookie
 *   - ChatClient / UpperLayerMount / UI 変更
 *   - Pattern activation / live variant 発火
 *   - COALTER_UNDERSTANDING_DIAGNOSTICS / COALTER_UNDERSTANDING_BUFFER_FANOUT /
 *     COALTER_UNDERSTANDING_SHADOW_MOVIE 変更
 */

import { NextResponse } from "next/server";
import {
  authCheckResultToStatusCode,
  buildAuthErrorBody,
  checkDiagnosticsRetrievalAuth,
  DIAGNOSTICS_RETRIEVAL_AUTH_VERSION,
  type AuthCheckResult,
} from "@/lib/coalter/understanding/diagnosticsRetrievalAuth";
import {
  getRedactedUnderstandingDiagnosticsSnapshot,
  getRedactedUnderstandingDiagnosticsBufferSize,
  REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_NAME,
  REDACTED_UNDERSTANDING_DIAGNOSTICS_SCHEMA_VERSION,
  type RedactedUnderstandingDiagnosticsEvent,
} from "@/lib/coalter/understanding/redactedDiagnosticsBuffer";

// ─────────────────────────────────────────────
// const exports (response schema version、固定)
// ─────────────────────────────────────────────

/**
 * Retrieval API response schema version (semver).
 *
 * 本 A4 初版 = "0.1.0"。A4 future minor update で increment。
 */
const RETRIEVAL_API_RESPONSE_SCHEMA_VERSION = "0.1.0";

/**
 * Retrieval API version (route 自体の version、独立).
 *
 * 本 A4 初版 = "0.1.0"。
 */
const RETRIEVAL_API_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// Common headers (no-store + no-cache + private)
// ─────────────────────────────────────────────

/**
 * Cache-Control headers for all responses (人間超越 Idea I).
 *
 * `no-store` で CDN / browser cache 防止、`private` で intermediate cache 防止。
 */
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, private",
  "Content-Type": "application/json",
} as const;

// ─────────────────────────────────────────────
// Reason codes (success response、enum only)
// ─────────────────────────────────────────────

type RetrievalReasonCode =
  | "read_only_retrieval"
  | "preview_env_only"
  | "auth_required"
  | "no_external_side_effect"
  | "no_storage_no_db"
  | "redacted_events_only"
  | "token_current_used"
  | "token_previous_used";

// ─────────────────────────────────────────────
// Success response builder (pure)
// ─────────────────────────────────────────────

interface DiagnosticsRetrievalResponse {
  schemaVersion: string;
  retrievalApiVersion: string;
  bufferName: typeof REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_NAME;
  bufferSchemaVersion: string;
  bufferSize: number;
  eventCount: number;
  events: RedactedUnderstandingDiagnosticsEvent[];
  processMetadata: {
    minSequenceNumber: number | null;
    maxSequenceNumber: number | null;
  };
  reasonCodes: RetrievalReasonCode[];
}

function buildSuccessResponse(authResult: AuthCheckResult): DiagnosticsRetrievalResponse {
  const events = getRedactedUnderstandingDiagnosticsSnapshot();
  const bufferSize = getRedactedUnderstandingDiagnosticsBufferSize();
  const sequenceNumbers = events.map((e) => e.sequenceNumber);
  const minSeq = sequenceNumbers.length > 0 ? Math.min(...sequenceNumbers) : null;
  const maxSeq = sequenceNumbers.length > 0 ? Math.max(...sequenceNumbers) : null;

  const reasonCodes: RetrievalReasonCode[] = [
    "read_only_retrieval",
    "preview_env_only",
    "auth_required",
    "no_external_side_effect",
    "no_storage_no_db",
    "redacted_events_only",
  ];
  if (authResult === "valid_token_current") reasonCodes.push("token_current_used");
  if (authResult === "valid_token_previous") reasonCodes.push("token_previous_used");
  reasonCodes.sort((a, b) => a.localeCompare(b));

  return {
    schemaVersion: RETRIEVAL_API_RESPONSE_SCHEMA_VERSION,
    retrievalApiVersion: RETRIEVAL_API_VERSION,
    bufferName: REDACTED_UNDERSTANDING_DIAGNOSTICS_BUFFER_NAME,
    bufferSchemaVersion: REDACTED_UNDERSTANDING_DIAGNOSTICS_SCHEMA_VERSION,
    bufferSize,
    eventCount: events.length,
    events,
    processMetadata: {
      minSequenceNumber: minSeq,
      maxSequenceNumber: maxSeq,
    },
    reasonCodes,
  };
}

// ─────────────────────────────────────────────
// GET handler (read-only retrieval)
// ─────────────────────────────────────────────

/**
 * GET /api/coalter/diagnostics/preview
 *
 * **Behavior matrix** (CEO 2026-05-16 採用案):
 *
 * | env / token / header | Status | Body |
 * |---|---|---|
 * | not preview | 404 | empty |
 * | preview, token env unset | 404 | empty |
 * | preview, token env set, no auth | 401 | { error: "missing_authorization" } |
 * | preview, token env set, malformed auth | 401 | { error: "invalid_authorization_format" } |
 * | preview, token env set, wrong token | 403 | { error: "invalid_token" } |
 * | preview, token env set, valid token | 200 | DiagnosticsRetrievalResponse |
 * | internal error | 500 | { error: "internal_error" } (詳細不含、stack 漏洩防止) |
 *
 * **POST / PUT / DELETE / PATCH / OPTIONS は handler 未定義** → Next.js が
 * 自動 405 (Method Not Allowed) または 404 を返却 (GET only、read-only)。
 *
 * **No console emit** (CEO 補正 2026-05-16): audit log 一切なし。
 *
 * **No external side effect**: DB / Supabase / fetch / localStorage 一切なし。
 *
 * @param request Web standard Request (Next.js App Router)
 * @returns NextResponse with status code based on auth check + buffer snapshot
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = checkDiagnosticsRetrievalAuth(authHeader);
    const statusCode = authCheckResultToStatusCode(authResult);

    // 200: success → buffer snapshot 返却
    if (statusCode === 200) {
      const body = buildSuccessResponse(authResult);
      return NextResponse.json(body, {
        status: 200,
        headers: NO_CACHE_HEADERS,
      });
    }

    // 404: production 隠蔽 (body 不要、empty response)
    if (statusCode === 404) {
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "no-store, private" },
      });
    }

    // 401 / 403: auth error (enum-only body)
    const errorBody = buildAuthErrorBody(authResult);
    return NextResponse.json(errorBody ?? { error: "auth_error" }, {
      status: statusCode,
      headers: NO_CACHE_HEADERS,
    });
  } catch {
    // 500: 詳細不含 (stack trace 漏洩防止、人間超越 Idea L)
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: NO_CACHE_HEADERS },
    );
  }
}

// ─────────────────────────────────────────────
// Re-export for test convenience (本番 route は GET のみ)
// ─────────────────────────────────────────────

export const __TEST_ONLY = {
  RETRIEVAL_API_VERSION,
  RETRIEVAL_API_RESPONSE_SCHEMA_VERSION,
  DIAGNOSTICS_RETRIEVAL_AUTH_VERSION,
};
