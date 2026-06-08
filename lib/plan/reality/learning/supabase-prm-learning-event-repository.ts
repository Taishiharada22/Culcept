import "server-only";
/**
 * Reality Control OS — A1-7-16 Supabase PRM Learning Event Repository（real insert・**server-only・user-RLS・barrel 非 export・未配線**）
 *
 * 設計: docs/prm-learning-event-insert-path-design.md（A1-7-13・slice ③）/ §10.11 M1 / §10.15 local smoke / §10.16
 *
 * 役割: `PrmLearningEventRepository`（A1-7-14 port）の **Supabase 実装**。injected **user-RLS client** で、mapper 済み
 *   `PrmLearningEventInsertRow[]` に `user_id` を付与し `prm_learning_events` に insert する。fire-and-forget の
 *   呼び出しは後続 route（slice ④）。**本 module は createClient せず・route/Home 非接続・未配線**。M1 table が
 *   apply されるまで実行経路は存在しない（A1-7-15 で local smoke PASS・実 staging apply は別 gate=slice ⑤）。
 *
 * 厳守:
 *   - **user-RLS client 注入・service_role 禁止**（INSERT は RLS WITH CHECK auth.uid()=user_id で owner-only）。
 *   - **user_id は injected userId**（route が auth.getUser() で確定して渡す・RLS が二重に強制）。createClient しない。
 *   - **fail-open**: insert error / 例外（network/auth）は throw せず `{ ok:false, inserted:0 }` を返す（user action を壊さない）。
 *   - **return / log は count/status のみ**: raw / seedRef / 元発話 / UUID / personality を **返さない・log しない**（本 module は log しない）。
 *     payload に載るのは InsertRow（M1 列・raw/seedRef を型として持たない）+ user_id のみ。handle は opaque（seedRef でない）。
 *   - **Date.now を呼ばない**（timestamp は mapper 注入済 row 由来）。barrel 非 export。
 */

import type {
  PrmLearningEventInsertResult,
  PrmLearningEventInsertRow,
  PrmLearningEventRepository,
} from "./prm-learning-event-insert";

/** insert table（M1）。 */
export const PRM_LEARNING_EVENTS_TABLE = "prm_learning_events";

/** insert 応答（loose・error のみ参照・data/count は使わない=count は input 件数で確定）。 */
interface PrmInsertResponse {
  readonly error: { readonly message: string } | null;
}
/** insert 可能 from（実 Supabase builder は PromiseLike ゆえ PromiseLike で受ける）。 */
interface PrmInsertableFrom {
  insert(rows: readonly Record<string, unknown>[]): PromiseLike<PrmInsertResponse>;
}
/**
 * user-RLS write client（**service_role を渡さないこと**）。実 Supabase client が structural に満たす。
 *   本 module は createClient しない（注入のみ）。
 */
export interface PrmLearningEventWriteClient {
  from(table: string): PrmInsertableFrom;
}

/**
 * A1-7-16: injected user-RLS client で `prm_learning_events` に insert する **Supabase repository**。
 *   - payload = mapper 済 row に `user_id`（injected）を付与（RLS WITH CHECK auth.uid()=user_id が owner-only を保証）。
 *   - 空 rows → insert 呼ばず `{ ok:true, inserted:0 }`。
 *   - error → `{ ok:false, inserted:0 }`（throw しない）。例外（network/auth）も catch して同上（**fail-open**）。
 *   - 成功 → `{ ok:true, inserted: rows.length }`（return は count/status のみ・raw/seedRef/UUID を出さない）。
 */
export function createSupabasePrmLearningEventRepository(
  client: PrmLearningEventWriteClient,
  userId: string
): PrmLearningEventRepository {
  return {
    async insert(rows: readonly PrmLearningEventInsertRow[]): Promise<PrmLearningEventInsertResult> {
      if (rows.length === 0) return { ok: true, inserted: 0 };
      try {
        // mapper 済 row（M1 列・raw/seedRef を型として持たない）に user_id を付与。service_role でなく user-RLS。
        const payload = rows.map((row) => ({ ...row, user_id: userId }));
        const res = await client.from(PRM_LEARNING_EVENTS_TABLE).insert(payload);
        if (res.error) return { ok: false, inserted: 0 }; // fail-open（detail を return/throw しない）
        return { ok: true, inserted: rows.length };
      } catch {
        // network / auth / 予期せぬ例外も fail-open（user action を壊さない・raw を出さない）
        return { ok: false, inserted: 0 };
      }
    },
  };
}
