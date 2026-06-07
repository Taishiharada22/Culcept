import "server-only";
/**
 * Reality Control OS — A1-6-5d Plan Seed Status-only Executor（real DB adapter・**server-only・status-only・barrel 非 export・未配線**）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.9
 *
 * 役割: CandidateActionExecutor（A1-6-4 skeleton）の **real 実装**。injected user-RLS client で
 *   plan_seeds の **status 列のみ**を条件付き UPDATE（from=active guard）。accept→consumed / dismiss→rejected。
 *
 * 厳守:
 *   - **status-only**: UPDATE は { status } のみ。generateComplete / anchor / external_anchor は使わない（A1-6-5a 確定）。
 *   - **from=active guard**: UPDATE ... WHERE id=seedRef AND status=from。0 rows（並行 consume / duplicate / non-active）→ ok=false（fail-closed）。
 *   - **user-RLS client 注入・service_role なし**（plan_seeds owner update policy・auth.uid()=user_id）。本 module は createClient しない。
 *   - **INSERT / DELETE しない**（UPDATE status のみ）。barrel 非 export・route/UI 非接続。seedRef は WHERE のみ（戻り値に出さない）。
 */

import type { CandidateActionExecutor } from "./candidate-action-executor";

/** UPDATE 結果（更新行の id のみ・raw を持たない）。 */
interface StatusUpdateResult {
  readonly data: readonly { readonly id: string }[] | null;
  readonly error: { readonly message: string } | null;
}
/** chainable update query（実 Supabase client が structural に満たす）。 */
interface StatusUpdateChain {
  eq(column: string, value: string): StatusUpdateChain;
  select(columns: string): Promise<StatusUpdateResult>;
}
interface StatusUpdateFrom {
  update(values: { readonly status: string }): StatusUpdateChain;
}
/** user-RLS client（**service_role を渡さないこと**）。実 Supabase client は from/update/eq/select を持ち structural にこれを満たす。 */
export interface PlanSeedStatusUpdateClient {
  from(table: string): StatusUpdateFrom;
}

/**
 * A1-6-5d: injected user-RLS client で plan_seeds status を条件付き UPDATE する **real status-only executor**。
 *   applyStatusTransition(seedRef, from, to): UPDATE plan_seeds SET status=to WHERE id=seedRef AND status=from → select("id")。
 *   ok = 更新行 1 以上（from=active guard で 0 rows なら ok=false・並行 consume / non-active を fail-closed）。
 *   **status 列のみ**更新（generateComplete / anchor write は呼ばない）。
 */
export function createStatusOnlyExecutor(client: PlanSeedStatusUpdateClient): CandidateActionExecutor {
  return {
    async applyStatusTransition(seedRef, from, to) {
      const { data, error } = await client
        .from("plan_seeds")
        .update({ status: to }) // status 列のみ
        .eq("id", seedRef)
        .eq("status", from) // from=active guard（条件付き・0 rows→ok=false）
        .select("id"); // 更新行を返す
      if (error || !data) return { ok: false }; // error / null → fail-closed
      return { ok: data.length > 0 }; // 1 row→ok / 0 rows（並行 / non-active）→ fail-closed
    },
  };
}
