import "server-only";
/**
 * 横 R2 — A-4-c27 Life Ops Structured Source Read-only Reader（**server-only・column-restricted・consumer 0**・barrel 非 export）
 *
 * 設計: docs/life-ops-structured-storage-a4-c27-mini-design.md（§3-4）
 *
 * 役割: `lifeops_structured_sources`（draft・**未 apply**）の column-restricted read。gate（master ∧ structured flag ∧
 *   staging ∧ !production）を通った時だけ select し、c26 structured DTO へ変換して返す。**gate false → query せず空**。
 *
 * 厳守: createClient しない（注入）・service_role 禁止・write/INSERT/UPDATE/DELETE/RPC 0・UI/通知 0・
 *   select 列は `LIFEOPS_STRUCTURED_SOURCE_COLUMNS_SQL` 固定（**user_id/id を DTO に出さない**）・
 *   **本 slice では呼び出し元なし（dormant）**＝実 DB read 経路は存在しない（table 自体も未 apply）。
 */

import {
  LIFEOPS_STRUCTURED_SOURCES_TABLE,
  LIFEOPS_STRUCTURED_SOURCE_COLUMNS_SQL,
  rowsToStructuredSources,
  isLifeOpsStructuredSourceReadAllowed,
  type LifeOpsStructuredSourceRow,
  type LifeOpsStructuredSourcesSplit,
} from "./lifeops-structured-storage";

/** 読み取り上限（防御線・raw input cap と併用）。 */
export const LIFEOPS_STRUCTURED_SOURCE_READ_LIMIT = 100;

interface SelectResponse {
  readonly data: readonly Record<string, unknown>[] | null;
  readonly error: { readonly message: string } | null;
}
interface SelectChain {
  eq(column: string, value: string): SelectChain;
  order(column: string, opts: { ascending: boolean }): SelectChain;
  limit(n: number): PromiseLike<SelectResponse>;
}
/** user-RLS read client（**service_role を渡さないこと**）。実 Supabase client が structural に満たす。 */
export interface LifeOpsStructuredSourceReadClient {
  from(table: string): { select(columns: string): SelectChain };
}

export interface LifeOpsStructuredSourceReadEnv {
  /** PLAN_FLAGS.lifeopsRealdataReadonly（master・default OFF）。 */
  readonly master: boolean;
  /** PLAN_FLAGS.lifeopsStructuredSourceReadonly（default OFF）。 */
  readonly structured: boolean;
  readonly supabaseUrl: string | undefined;
}

export interface LifeOpsStructuredSourceReadonlySource {
  /** gate 通過時のみ read（active のみ・c26 DTO で返す・raw 非搬出）。gate false → query せず空。 */
  readSources(): Promise<LifeOpsStructuredSourcesSplit>;
}

/**
 * A-4-c27: injected user-RLS client + env → structured source reader（**default OFF・consumer 0・未配線**）。
 */
export function createLifeOpsStructuredSourceReadonlySource(
  client: LifeOpsStructuredSourceReadClient,
  userId: string,
  env: LifeOpsStructuredSourceReadEnv,
): LifeOpsStructuredSourceReadonlySource {
  return {
    async readSources() {
      if (!isLifeOpsStructuredSourceReadAllowed(env)) return { deadlines: [], cadences: [] }; // fail-closed-to-empty（query しない）
      const res = await client
        .from(LIFEOPS_STRUCTURED_SOURCES_TABLE)
        .select(LIFEOPS_STRUCTURED_SOURCE_COLUMNS_SQL)
        .eq("user_id", userId) // RLS が正だが defense（M1 reader と同 pattern）
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(LIFEOPS_STRUCTURED_SOURCE_READ_LIMIT);
      if (res.error || !res.data) return { deadlines: [], cadences: [] }; // fail-open（読めない時は静かに空）
      return rowsToStructuredSources(res.data as unknown as readonly LifeOpsStructuredSourceRow[]);
    },
  };
}
