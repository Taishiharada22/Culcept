import "server-only";
/**
 * Reality Control OS — A1-7-26 Supabase PRM Learning Event Reader（read-only・**server-only・user-RLS・barrel 非 export・未配線**）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §10.26 / prm-learning-event-read.ts
 *
 * 役割: injected **user-RLS client** で owner の `prm_learning_events` を **column-restricted に read**し、
 *   `prmLearningEventRowsToDryRunEvents` で `DryRunLearningEvent[]` に再構築する read adapter。
 *   出力を既存 `aggregateDryRunEvents({dedupeSameDay:true})` / `projectPrmDryRun` に流して観測する（dev-report・PRM model でない）。
 *
 * 厳守:
 *   - **read-only**: select/eq/order/limit のみ（INSERT/UPDATE/DELETE/RPC なし）。createClient しない（注入）。**service_role 禁止**。
 *   - **column-restricted**: `PRM_LEARNING_EVENT_READ_COLUMNS`（raw/source_ref/user_id/id/signal を select しない）。
 *   - **fail-open**: error / null → `[]`（観測は空でも壊さない）。barrel 非 export・route/UI 未接続。
 */

import {
  PRM_LEARNING_EVENT_READ_COLUMNS,
  prmLearningEventRowsToDryRunEvents,
  type PrmLearningEventReadRow,
} from "./prm-learning-event-read";
import type { DryRunLearningEvent } from "./dry-run-learning-event";

/** owner events の read 上限（population read 防止）。 */
const READ_LIMIT = 500;

interface ReadResponse {
  readonly data: readonly Record<string, unknown>[] | null;
  readonly error: { readonly message: string } | null;
}
interface ReadChain {
  eq(column: string, value: string): ReadChain;
  order(column: string, opts?: { readonly ascending?: boolean }): ReadChain;
  limit(n: number): PromiseLike<ReadResponse>;
}
interface ReadFrom {
  select(columns: string): ReadChain;
}
/** user-RLS read client（**service_role を渡さないこと**）。実 Supabase client が structural に満たす。 */
export interface PrmLearningEventReadClient {
  from(table: string): ReadFrom;
}

export interface PrmLearningEventReader {
  /** owner の learning events を DryRunLearningEvent[] として読む（recency 昇順・上限 READ_LIMIT・fail-open []）。 */
  readLearningEvents(): Promise<readonly DryRunLearningEvent[]>;
  /**
   * episodic memory 用に owner の learning events を **column-restricted な生 row** として読む（acted_at 昇順・fail-open []）。
   * 同一 query（許可列のみ）・raw/source_ref/user_id/id/signal は select しない。
   */
  readEventRows(): Promise<readonly PrmLearningEventReadRow[]>;
}

/**
 * A1-7-26: injected user-RLS client で `prm_learning_events`（owner）を read し DryRunLearningEvent[] を返す reader。
 *   `.eq(user_id)`（RLS + 明示）+ column-restricted select + acted_at 昇順 + limit。error/null → []（fail-open）。
 */
export function createSupabasePrmLearningEventReader(client: PrmLearningEventReadClient, userId: string): PrmLearningEventReader {
  return {
    async readLearningEvents() {
      const res = await client
        .from("prm_learning_events")
        .select(PRM_LEARNING_EVENT_READ_COLUMNS) // 許可列のみ（raw/source_ref/user_id/id/signal なし）
        .eq("user_id", userId) // RLS + 明示 user
        .order("acted_at", { ascending: true })
        .limit(READ_LIMIT);
      if (res.error || !res.data) return []; // fail-open
      return prmLearningEventRowsToDryRunEvents(res.data as unknown as readonly PrmLearningEventReadRow[]);
    },
    async readEventRows() {
      const res = await client
        .from("prm_learning_events")
        .select(PRM_LEARNING_EVENT_READ_COLUMNS) // 許可列のみ（raw/source_ref/user_id/id/signal なし）
        .eq("user_id", userId) // RLS + 明示 user
        .order("acted_at", { ascending: true })
        .limit(READ_LIMIT);
      if (res.error || !res.data) return []; // fail-open
      return res.data as unknown as readonly PrmLearningEventReadRow[];
    },
  };
}
