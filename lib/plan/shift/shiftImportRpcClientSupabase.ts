/**
 * 実 Supabase 経由の ShiftImportRpcClient 実装 — SR Step 6B-APPLY-A
 *
 * `supabase.rpc('import_shift_roster', …)` を呼び、必ず mapShiftImportRpcResponse を通して
 * raw DB error / SQL message を user-facing result に漏らさず、log 用 detail と safe result を分離する。
 *
 * 重要な設計（DB なしで unit test 可能にする）:
 *   - 実 supabase client を直 import せず、注入された **RpcCaller**（最小契約）越しに呼ぶ。
 *   - 実 client の配線（lib/supabase/server.ts 等）+ 実 DB 呼び出しは 6B-apply（CEO 承認後）。
 *   - 本 module は pure-ish（IO は注入 RpcCaller 経由のみ）→ fake caller で契約検証。
 *
 * 6B-apply での使い方:
 *   const supabase = await createServerClient();
 *   const client = createSupabaseShiftImportRpcClient(
 *     (fn, args) => supabase.rpc(fn, args),
 *     { logDetail: (d) => logger.error("shift_import_rpc", d) }
 *   );
 *   const repo = createRpcShiftImportRepository(client, deps);
 */

import {
  mapShiftImportRpcResponse,
  SHIFT_IMPORT_SAVE_FAILED_MESSAGE,
} from "./shiftImportRpcResponse";
import type {
  ShiftImportRpcClient,
  ShiftImportRpcParams,
  ShiftImportRpcResult,
} from "./shiftImportRpc";

/**
 * supabase.rpc(fn, args) の最小契約。
 * 実 client は `(fn, args) => supabase.rpc(fn, args)` を渡す（thenable → { data, error }）。
 */
export type RpcCaller = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: unknown }>;

export interface SupabaseShiftImportRpcClientOptions {
  /** logDetail（raw error / 想定外 data）の server-side log hook。既定 no-op（result には絶対載せない）。 */
  logDetail?: (detail: unknown) => void;
}

/** RPC 関数名（migration 20260531100000 と一致）。 */
export const SHIFT_IMPORT_RPC_FUNCTION = "import_shift_roster";

/**
 * ShiftImportRpcParams → SQL function 引数（p_*）に写像。
 * anchors / indicators は camelCase キーのまま渡す（SQL は e->>'startTime' 等で読む）。
 */
export function mapToRpcArgs(
  params: ShiftImportRpcParams
): Record<string, unknown> {
  return {
    p_user_id: params.userId,
    p_range_start: params.importRange.start,
    p_range_end: params.importRange.endExclusive,
    p_source: params.source,
    p_anchors: params.anchors,
    p_indicators: params.indicators,
  };
}

export function createSupabaseShiftImportRpcClient(
  rpcCaller: RpcCaller,
  options: SupabaseShiftImportRpcClientOptions = {}
): ShiftImportRpcClient {
  const logDetail = options.logDetail ?? (() => {});

  return {
    async importShiftRoster(
      params: ShiftImportRpcParams
    ): Promise<ShiftImportRpcResult> {
      let raw: { data: unknown; error: unknown };
      try {
        raw = await rpcCaller(SHIFT_IMPORT_RPC_FUNCTION, mapToRpcArgs(params));
      } catch (e) {
        // rpc 呼び出し自体が throw（network 例外等）→ safe error に丸める（raw は log のみ）
        logDetail({ reason: "rpc_call_threw", error: e });
        return { status: "error", message: SHIFT_IMPORT_SAVE_FAILED_MESSAGE };
      }

      const { result, logDetail: detail } = mapShiftImportRpcResponse(raw);
      if (detail !== undefined) logDetail(detail);
      return result;
    },
  };
}
