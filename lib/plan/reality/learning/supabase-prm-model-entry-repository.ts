import "server-only";
/**
 * Reality Control OS — A1-7-30 Supabase M3 Model Entry Repository（real insert・**server-only・user-RLS・barrel 非 export・未配線**）
 *
 * 設計: docs/prm-m3-model-entries-design.md（A1-7-29）/ M1 A1-7-16 同構造
 *
 * 役割: injected user-RLS client で M3 `prm_model_entries`（PRM 本体）に insert する。**createClient しない・service_role 禁止・未配線**
 *   （M3 未 apply ゆえ実行経路なし）。row は review_decision_id NOT NULL FK 済（reviewRequired は mapper で担保）。
 *
 * 厳守: user-RLS（user_id=auth.uid()）・raw/seedRef/personality を payload/return/log に出さない・fail-open・Date.now なし。
 */

import type {
  PrmModelEntryInsertResult,
  PrmModelEntryInsertRow,
  PrmModelEntryRepository,
} from "./prm-model-entry-write";
import type { ModelEntryPatch, PrmModelEntryUpdater } from "./tendency-feedback-core";

export const PRM_MODEL_ENTRIES_TABLE = "prm_model_entries";

interface WriteResponse {
  readonly error: { readonly message: string } | null;
}
interface InsertableFrom {
  insert(rows: readonly Record<string, unknown>[]): PromiseLike<WriteResponse>;
}
/** user-RLS write client（**service_role を渡さないこと**）。実 Supabase client が structural に満たす。 */
export interface PrmModelEntryWriteClient {
  from(table: string): InsertableFrom;
}

// ── A1-7-35 updater 用 client（insert client と分離・既存 insert mock を壊さない）──
interface UpdateChain {
  eq(column: string, value: string): UpdateChain & PromiseLike<WriteResponse>;
}
interface UpdatableFrom {
  update(patch: Record<string, unknown>): UpdateChain;
}
/** user-RLS update client（**service_role を渡さないこと**・UPDATE のみ・delete を持たない）。 */
export interface PrmModelEntryUpdateClient {
  from(table: string): UpdatableFrom;
}

/**
 * A1-7-30: injected user-RLS client で M3 に insert（user_id 付与）する repository。
 *   空→{ok:true,0}・error/例外→{ok:false,0}（fail-open）・成功→{ok:true,len}。raw/error detail を出さない。
 */
export function createSupabasePrmModelEntryRepository(
  client: PrmModelEntryWriteClient,
  userId: string
): PrmModelEntryRepository {
  return {
    async insert(rows: readonly PrmModelEntryInsertRow[]): Promise<PrmModelEntryInsertResult> {
      if (rows.length === 0) return { ok: true, inserted: 0 };
      try {
        const payload = rows.map((row) => ({ ...row, user_id: userId })); // user-RLS（service_role でない）
        const res = await client.from(PRM_MODEL_ENTRIES_TABLE).insert(payload);
        if (res.error) return { ok: false, inserted: 0 };
        return { ok: true, inserted: rows.length };
      } catch {
        return { ok: false, inserted: 0 };
      }
    },
  };
}

/**
 * A1-7-35: injected user-RLS client で M3 を **UPDATE のみ**（破壊削除なし）する updater。
 *   patch = user_correction / retracted_at の可逆フィールドのみ。owner-RLS（user_id=auth.uid() + 明示 eq）。
 *   空 patch→ no-op {ok:true}・error/例外→{ok:false}（fail-closed: 呼び出し側が partialFailure を surface）。
 *   厳守: delete を呼ばない・raw/personality を payload に出さない・与えられた id 以外を触らない・Date.now なし。
 */
export function createSupabasePrmModelEntryUpdater(
  client: PrmModelEntryUpdateClient,
  userId: string
): PrmModelEntryUpdater {
  return {
    async update(id: string, patch: ModelEntryPatch): Promise<{ readonly ok: boolean }> {
      if (typeof id !== "string" || id.length === 0) return { ok: false };
      const payload: Record<string, unknown> = {};
      if ("userCorrection" in patch) payload.user_correction = patch.userCorrection ?? null;
      if ("retractedAtISO" in patch) payload.retracted_at = patch.retractedAtISO ?? null;
      if (Object.keys(payload).length === 0) return { ok: true }; // no-op（書く列なし）
      try {
        const res = await client
          .from(PRM_MODEL_ENTRIES_TABLE)
          .update(payload)
          .eq("id", id) // 対象 1 行のみ
          .eq("user_id", userId); // owner-RLS（service_role でない）
        if (res.error) return { ok: false };
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
  };
}
