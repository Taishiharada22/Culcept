import "server-only";
/**
 * Reality Control OS — 4-D1 Supabase Anchor Schedule Reader（**server-only・read-only・owner-RLS**・barrel 非 export）
 *
 * 設計: docs/full-worldstate-reader-preflight.md / docs decision-log（4-D1）
 *
 * 役割: WorldState 用に `external_anchors` を **column-restricted な生 `ColumnRestrictedAnchorRow[]`** で read する薄い reader。
 *   既存 `createDatedColumnRestrictedAnchorSource` は `projectToRealityInput`（start/end を失う旧エンジン投影）を返すため、
 *   **column-restriction の定数（`ANCHOR_TABLE`/`ANCHOR_COLUMNS_SQL`）を再利用**しつつ、4-A mapper が消費できる生 row を返す。
 *
 * 厳守: read-only（select/eq/limit のみ）・**column-restricted（title/raw を select しない＝ANCHOR_COLUMNS_SQL）**・
 *   owner-RLS（.eq user_id）・単一日（.eq date）・件数上限（無制限禁止）・**fail-open []**・service_role 禁止・実 read は呼んだ時のみ。
 */

import { ANCHOR_TABLE, ANCHOR_COLUMNS_SQL, type ColumnRestrictedAnchorRow } from "../integration/dev-runtime-adapter";

/** owner events の read 上限（population read 防止）。 */
const READ_LIMIT = 50;

interface ReadResponse {
  readonly data: readonly Record<string, unknown>[] | null;
  readonly error: { readonly message: string } | null;
}
interface ReadChain {
  eq(column: string, value: string): ReadChain;
  limit(n: number): PromiseLike<ReadResponse>;
}
interface ReadFrom {
  select(columns: string): ReadChain;
}
/** user-RLS read client（**service_role を渡さないこと**）。実 Supabase client が structural に満たす。 */
export interface AnchorReadClient {
  from(table: string): ReadFrom;
}

export interface AnchorScheduleReader {
  /** 当日 owner の anchors を column-restricted 生 row で読む（fail-open []）。 */
  readRows(): Promise<readonly ColumnRestrictedAnchorRow[]>;
}

/**
 * 4-D1: injected user-RLS client で `external_anchors`（owner・単一日）を column-restricted に read。
 *   `.eq(user_id)`（RLS+明示）+ `.eq(date)`（単一日）+ ANCHOR_COLUMNS_SQL（title/raw なし）+ limit。error/null → []。
 */
export function createSupabaseAnchorScheduleReader(client: AnchorReadClient, userId: string, date: string): AnchorScheduleReader {
  return {
    async readRows() {
      const res = await client
        .from(ANCHOR_TABLE)
        .select(ANCHOR_COLUMNS_SQL) // 許可列のみ（title/location/raw を select しない）
        .eq("user_id", userId) // RLS + 明示 user
        .eq("date", date) // 単一日のみ（全期間禁止）
        .limit(READ_LIMIT);
      if (res.error || !res.data) return []; // fail-open
      return res.data as unknown as readonly ColumnRestrictedAnchorRow[];
    },
  };
}
