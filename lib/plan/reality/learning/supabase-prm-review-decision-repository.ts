import "server-only";
/**
 * Reality Control OS — A1-7-30 Supabase M2 Review Decision Repository（real insert・**server-only・user-RLS・barrel 非 export・未配線**）
 *
 * 設計: docs/prm-m2-review-decisions-design.md（A1-7-27）/ M1 A1-7-16 同構造
 *
 * 役割: injected user-RLS client で M2 `prm_review_decisions` に insert し、**id を返す**（M3 review_decision_id FK 用）。
 *   **createClient しない・service_role 禁止・未配線**（M2 未 apply ゆえ実行経路なし）。
 *
 * 厳守: user-RLS（user_id=auth.uid()）・raw/seedRef を payload/return/log に出さない・fail-open（error/例外→{ok:false}）・Date.now なし。
 */

import type {
  PrmReviewDecisionInsertResult,
  PrmReviewDecisionInsertRow,
  PrmReviewDecisionRepository,
} from "./prm-review-decision-write";

export const PRM_REVIEW_DECISIONS_TABLE = "prm_review_decisions";

interface InsertSelectResponse {
  readonly data: readonly { readonly id: string }[] | null;
  readonly error: { readonly message: string } | null;
}
interface InsertableFrom {
  insert(rows: readonly Record<string, unknown>[]): { select(columns: string): PromiseLike<InsertSelectResponse> };
}
/** user-RLS write client（**service_role を渡さないこと**）。実 Supabase client が structural に満たす。 */
export interface PrmReviewDecisionWriteClient {
  from(table: string): InsertableFrom;
}

/**
 * A1-7-30: injected user-RLS client で M2 に insert（user_id 付与）し id を返す repository。
 *   空→{ok:true,0,[]}・error/例外→{ok:false,0,[]}（fail-open）・成功→{ok:true,len,ids}。raw/error detail を出さない。
 */
export function createSupabasePrmReviewDecisionRepository(
  client: PrmReviewDecisionWriteClient,
  userId: string
): PrmReviewDecisionRepository {
  return {
    async insert(rows: readonly PrmReviewDecisionInsertRow[]): Promise<PrmReviewDecisionInsertResult> {
      if (rows.length === 0) return { ok: true, inserted: 0, ids: [] };
      try {
        const payload = rows.map((row) => ({ ...row, user_id: userId })); // user-RLS（service_role でない）
        const res = await client.from(PRM_REVIEW_DECISIONS_TABLE).insert(payload).select("id");
        if (res.error || !res.data) return { ok: false, inserted: 0, ids: [] };
        return { ok: true, inserted: rows.length, ids: res.data.map((r) => String(r.id)) };
      } catch {
        return { ok: false, inserted: 0, ids: [] };
      }
    },
  };
}
