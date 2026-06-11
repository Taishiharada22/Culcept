import "server-only";
/**
 * 横 R2 — A-4-c31 Life Ops Structured Source Writer（**server-only skeleton・gate-first・insert のみ・呼び出し元なし**・barrel 非 export）
 *
 * 設計: docs/life-ops-structured-input-contract-a4-c31-mini-design.md（§1-9/10）
 *
 * 役割: gate（master ∧ LIFEOPS_STRUCTURED_SOURCE_WRITE ∧ staging ∧ !production）+ validation/builder + duplicate guard を
 *   通った時だけ、`lifeops_structured_sources` へ **1 件 insert** する薄い writer。c9 feedback writer と同 pattern。
 *
 * 厳守:
 *   - **user_id は auth context（caller 注入の userId）**。client から user_id/DB id/raw row を受けない（input 型に口がない）。
 *   - gate false → insert を呼ばない（{written:false, reason:"gate_off"}・query 0）。
 *   - invalid input → {written:false, reason:<validation>}（query 0）。duplicate → {written:false, reason:"already_exists"}（query 0）。
 *   - insert error/例外 → **throw しない**（{written:false, reason:"insert_failed"}・fail-open）。
 *   - payload は builder の row + user_id のみ（**id/created_at/updated_at 不含**=DB DEFAULT・c12 教訓）。
 *   - **本 slice では呼び出し元なし（dormant）**。実 write smoke は別 GO（mini-design §1-10 の計画に従う）。
 */

import { LIFEOPS_STRUCTURED_SOURCES_TABLE, type LifeOpsStructuredSourceRow } from "./lifeops-structured-storage";
import {
  buildLifeOpsStructuredInsertRow,
  hasActiveStructuredDuplicate,
  isLifeOpsStructuredSourceWriteAllowed,
  type LifeOpsStructuredSourceInput,
  type LifeOpsStructuredWriteInvalidReason,
} from "./lifeops-structured-write";

interface InsertResponse {
  readonly error: { readonly message: string } | null;
}
interface InsertFrom {
  insert(rows: readonly Record<string, unknown>[]): PromiseLike<InsertResponse>;
}
/** user-RLS write client（**service_role を渡さないこと**）。実 Supabase client が structural に満たす。 */
export interface LifeOpsStructuredWriteClient {
  from(table: string): InsertFrom;
}

export interface LifeOpsStructuredWriteEnv {
  /** PLAN_FLAGS.lifeopsRealdataReadonly（master・default OFF）。 */
  readonly master: boolean;
  /** PLAN_FLAGS.lifeopsStructuredSourceWrite（default OFF）。 */
  readonly write: boolean;
  readonly supabaseUrl: string | undefined;
}

export interface LifeOpsStructuredWriteResult {
  readonly written: boolean;
  readonly reason: "ok" | "gate_off" | "already_exists" | "insert_failed" | LifeOpsStructuredWriteInvalidReason;
}

export interface LifeOpsStructuredSourceWriter {
  /**
   * 1 入力 = 最大 1 insert。existing は呼び元が c27 reader（owner・active）で読んで注入（duplicate guard 用・隠れ read なし）。
   */
  writeSource(
    input: LifeOpsStructuredSourceInput,
    opts?: { readonly existing?: readonly LifeOpsStructuredSourceRow[] },
  ): Promise<LifeOpsStructuredWriteResult>;
}

/**
 * A-4-c31: injected user-RLS client + env → structured source writer（**default OFF・未配線**）。
 */
export function createLifeOpsStructuredSourceWriter(
  client: LifeOpsStructuredWriteClient,
  userId: string,
  env: LifeOpsStructuredWriteEnv,
): LifeOpsStructuredSourceWriter {
  return {
    async writeSource(input, opts) {
      if (!isLifeOpsStructuredSourceWriteAllowed(env)) return { written: false, reason: "gate_off" }; // query 0
      const built = buildLifeOpsStructuredInsertRow(input);
      if (!built.ok) return { written: false, reason: built.reason }; // query 0
      if (hasActiveStructuredDuplicate(opts?.existing ?? [], built.row)) {
        return { written: false, reason: "already_exists" }; // query 0・2 件作らない
      }
      try {
        const res = await client.from(LIFEOPS_STRUCTURED_SOURCES_TABLE).insert([{ ...built.row, user_id: userId }]);
        if (res.error) return { written: false, reason: "insert_failed" }; // fail-open（throw しない）
        return { written: true, reason: "ok" };
      } catch {
        return { written: false, reason: "insert_failed" };
      }
    },
  };
}
