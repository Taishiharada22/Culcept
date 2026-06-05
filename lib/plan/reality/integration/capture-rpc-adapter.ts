import "server-only";
/**
 * Reality Control OS — A1-5-4b-4 Capture RPC Client Adapter Skeleton（DI・**fake/no-run のみ・実 RPC 実行なし**）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.17 + §8.18 + §8.19 + §8.20
 *
 * 役割: A1-5-4b-1 `CaptureWriteClient` 契約を、staging 適用済 atomic RPC
 *   `create_plan_seed_capture_bundle(p_user_id, p_seed, p_evidence)`（§8.18/§8.19）への
 *   **単一 `.rpc()` call** で実装する adapter。`writeStructuredCapture(drafts, client)` の **下**に合成され、
 *   owner/linkage reject は seam（A1-5-4b-1）が adapter 呼出**前**に済ませる。
 *   **今回は実 RPC 実行をしない**（fake/no-run client のみ）。real Supabase client 注入は A1-5-4b real（別 GO）。
 *
 * 厳守:
 *   - **createClient しない**（Supabase-like client は DI 注入）。**実 RPC / 実 DB INSERT / staging write しない**。
 *   - seed + evidence を **1 回の RPC call** に集約（atomic・関数側 1 transaction）。**複数 call に分けない**。
 *   - RPC args は **structured-only draft**（raw を payload に持ち込まない）。source_ref は opaque。
 *   - **service_role 非前提**（RPC は SECURITY INVOKER・user-RLS）。`server-only` / barrel 非 export / runtime 非接続。
 */

import type {
  CaptureWriteClient,
  CaptureWritePayload,
  CaptureWriteOutcome,
} from "./capture-write-repository";
import type { PlanSeedInsertDraft, DurationEvidenceInsertDraft } from "../seed-capture-mapper";

/** staging 適用済 RPC 名（§8.18/§8.19）。 */
export const CAPTURE_RPC_NAME = "create_plan_seed_capture_bundle";

/** RPC 引数 shape（関数署名 p_user_id / p_seed / p_evidence と一致・structured-only）。 */
export interface CaptureRpcArgs {
  readonly p_user_id: string;
  readonly p_seed: PlanSeedInsertDraft;
  readonly p_evidence: DurationEvidenceInsertDraft | null;
}

/** RPC エラー（最小）。 */
export interface CaptureRpcError {
  readonly message: string;
  readonly code?: string;
}

/**
 * Supabase-like client の **DI interface**（使う `.rpc()` のみ）。
 * 実 Supabase client（PostgREST）が structural に満たす。**createClient はここに無い**（注入）。
 */
export interface RpcCapableClient {
  rpc(fn: string, args: CaptureRpcArgs): Promise<{ data: unknown; error: CaptureRpcError | null }>;
}

/** payload → RPC args（純・draft をそのまま束ねる・raw を持ち込まない）。p_user_id は seed.user_id。 */
export function buildCaptureRpcArgs(payload: CaptureWritePayload): CaptureRpcArgs {
  return {
    p_user_id: payload.seed.user_id,
    p_seed: payload.seed,
    p_evidence: payload.evidence,
  };
}

/**
 * A1-5-4b-4: RPC-backed `CaptureWriteClient`。`writeCapture(payload)` で **1 回の `.rpc()`** を呼び、
 * RPC の結果を `CaptureWriteOutcome` に分類する。実 client は注入（本 skeleton では fake/no-run）。
 *   - error なし → ok / error.code='no_run' → no_run / それ以外 error → write_failed。
 */
export function createRpcCaptureWriteClient(client: RpcCapableClient): CaptureWriteClient {
  return {
    async writeCapture(payload: CaptureWritePayload): Promise<CaptureWriteOutcome> {
      const args = buildCaptureRpcArgs(payload);
      const { error } = await client.rpc(CAPTURE_RPC_NAME, args); // seed + evidence を 1 call（atomic）
      if (error) {
        return { ok: false, code: error.code === "no_run" ? "no_run" : "write_failed" };
      }
      return { ok: true, code: "ok" };
    },
  };
}

// ── fake / no-run RPC client（テスト用・**実 DB に触れない**） ──

/** fake RPC client: `.rpc` call を記録するだけ（**DB write 0**）。opts.error で失敗分類も検証可。 */
export interface FakeRpcClient extends RpcCapableClient {
  readonly calls: Array<{ fn: string; args: CaptureRpcArgs }>;
}
export function createFakeRpcClient(opts: { error?: CaptureRpcError } = {}): FakeRpcClient {
  const calls: Array<{ fn: string; args: CaptureRpcArgs }> = [];
  return {
    calls,
    async rpc(fn, args) {
      calls.push({ fn, args });
      return opts.error ? { data: null, error: opts.error } : { data: {}, error: null };
    },
  };
}

/** no-run RPC client: 一切呼ばず no_run を返す（**実 DB 接続 0・RPC 実行 0**）。 */
export function createNoRunRpcClient(): RpcCapableClient {
  return {
    async rpc() {
      return { data: null, error: { message: "no_run", code: "no_run" } };
    },
  };
}
