/**
 * シフト取り込み RPC 応答の sanitization — SR Step 6B-APPLY-PREP
 *
 * 実 Supabase `rpc()` の `{ data, error }` を、**caller(repository) に返す safe result** と
 * **server-side log 用の詳細(logDetail)** に分離する純関数。raw SQL message / DB 例外 detail を
 * caller(=最終的に user) に漏らさない（CEO 補正 2026-05-31）。
 *
 * 既存機構の再利用:
 *   - lib/plan/supabase-error-mapping.ts の isPostgrestErrorShape / mapPostgrestError を流用
 *     （sibling create_external_anchor_bundle と同経路。42501→forbidden 等を log 側で分類）。
 *
 * 6B-apply の wrapper:
 *   const { data, error } = await client.rpc('import_shift_roster', params);
 *   const { result, logDetail } = mapShiftImportRpcResponse({ data, error });
 *   if (logDetail) logger.error('shift_import_rpc', logDetail);  // raw は log のみ
 *   return result;                                               // safe result のみ返す
 */

import {
  isPostgrestErrorShape,
  mapPostgrestError,
} from "@/lib/plan/supabase-error-mapping";
import type { ShiftImportSummary } from "./shiftImportRepository";
import type { ShiftImportRpcResult } from "./shiftImportRpc";

/** user-facing safe メッセージ（raw SQL / DB error を含まない汎用） */
export const SHIFT_IMPORT_SAVE_FAILED_MESSAGE = "シフトの保存に失敗しました";

export interface MappedShiftImportRpcResponse {
  /** caller(repository) に返す safe result（raw を含まない） */
  result: ShiftImportRpcResult;
  /** server-side log 用の詳細（raw error / 想定外 data）。result には載らない */
  logDetail?: unknown;
}

interface RawRpcResponse {
  data: unknown;
  error: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

function isConflictData(
  d: unknown
): d is { status: "conflict"; dates: string[] } {
  return (
    isObject(d) &&
    d.status === "conflict" &&
    Array.isArray(d.dates) &&
    d.dates.every((x) => typeof x === "string")
  );
}

function isSummary(s: unknown): s is ShiftImportSummary {
  return (
    isObject(s) &&
    typeof s.sourceId === "string" &&
    typeof s.insertedAnchors === "number" &&
    typeof s.deletedAnchors === "number" &&
    typeof s.insertedIndicators === "number" &&
    typeof s.deletedIndicators === "number" &&
    Array.isArray(s.conflicts)
  );
}

function isOkData(d: unknown): d is { status: "ok"; summary: ShiftImportSummary } {
  return isObject(d) && d.status === "ok" && isSummary(d.summary);
}

/**
 * Supabase rpc の `{ data, error }` を safe な ShiftImportRpcResult に写像する。
 *   - error あり（owner guard 42501 / CHECK / network 等）→ safe error + raw は logDetail
 *   - data = {status:'conflict'} → conflict（手動印衝突。safe reason）
 *   - data = {status:'ok', summary} → ok
 *   - 想定外 shape → safe error + logDetail（fallback しない。bug の可能性を log で観測）
 */
export function mapShiftImportRpcResponse(
  raw: RawRpcResponse
): MappedShiftImportRpcResponse {
  if (raw.error != null) {
    const logDetail = isPostgrestErrorShape(raw.error)
      ? mapPostgrestError(raw.error)
      : raw.error;
    return {
      result: { status: "error", message: SHIFT_IMPORT_SAVE_FAILED_MESSAGE },
      logDetail,
    };
  }

  if (isConflictData(raw.data)) {
    return { result: { status: "conflict", dates: raw.data.dates } };
  }
  if (isOkData(raw.data)) {
    return { result: { status: "ok", summary: raw.data.summary } };
  }

  return {
    result: { status: "error", message: SHIFT_IMPORT_SAVE_FAILED_MESSAGE },
    logDetail: { reason: "unexpected_rpc_shape", data: raw.data },
  };
}
