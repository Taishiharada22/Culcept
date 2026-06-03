import "server-only";
/**
 * Reality Control OS — Stage 4-B-1C-a Real Read Source Wiring Skeleton
 *   （CEO 条件付き GO・2026-06-03・**実 DB read なし・mock 検証のみ**）
 *
 * 設計: docs/aneurasync-reality-control-os-stage4b1b-real-read-smoke-protocol.md §7
 *
 * 目的: 実 read smoke（4-B-1C-b）で使う **query 形＋境界契約** を確定し mock/spy で検証する。
 *   実 client 生成（createClient）は 4-B-1C-b の 1 行に隔離する。**本ファイルは経路を作らない**。
 *
 * 厳守（GPT 監査・4-B-1C-a）— **実 DB read はまだ禁止**:
 *   - 実 Supabase client / createClient / **service role を import しない**（注入 interface のみ）。
 *     初回は **CEO 本人の認証文脈（RLS）** で読む前提を維持。service role は RLS を bypass し
 *     「CEO 1 account 限定」を弱めるため使わない。
 *   - **date + limit 必須**（全期間読取・population read 禁止。today/指定日 1 日のみ）。
 *   - column-restricted（ANCHOR_COLUMNS_SQL 固定。select("*") / raw 列なし）。table 固定（plan_seeds 不可）。
 *   - server-only。barrel 非 export。route / UI / PlanClient / Server Action から呼ばない。
 *   - console / file / DB save / push / native / Routes / PRM 実更新なし。
 */

import { ANCHOR_TABLE, ANCHOR_COLUMNS_SQL, projectToRealityInput, type ColumnRestrictedAnchorRow } from "./dev-runtime-adapter";
import type { RealityDataSource } from "./dev-runtime";

// ── date + limit を表現できる最小 query interface（実 user-context client が structural に満たす） ──

export interface DatedQuery<Row> {
  /** WHERE 等値（複数可: user_id / date）。 */
  eq(column: string, value: string): DatedQuery<Row>;
  /** 件数上限を付けて解決（全期間/無制限を構造的に防ぐ終端）。 */
  limit(n: number): Promise<{ data: Row[] | null; error: { message: string } | null }>;
}
export interface DatedFrom<Row> {
  select(columns: string): DatedQuery<Row>;
}
/**
 * user-context（RLS 適用）client。**service role を渡さないこと**。
 * 実 Supabase の `SupabaseClient` は from/select/eq/limit を持ち structural にこれを満たす。
 */
export interface UserContextClient {
  from(table: string): DatedFrom<ColumnRestrictedAnchorRow>;
}

/** 初回 smoke の件数上限（CEO 固定条件: 50 以下）。これを超える指定は clamp する。 */
export const MAX_SMOKE_LIMIT = 50;

/** limit を [1, MAX_SMOKE_LIMIT] に clamp（>50 を読まない・0/負を防ぐ）。 */
export function clampSmokeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return MAX_SMOKE_LIMIT;
  return Math.min(Math.max(1, Math.floor(limit)), MAX_SMOKE_LIMIT);
}

export interface RealReadBounds {
  /** 単一日（YYYY-MM-DD）。全期間禁止ゆえ必須。 */
  readonly date: string;
  /** 件数上限。必須（無制限禁止）。**MAX_SMOKE_LIMIT=50 に clamp される**。 */
  readonly limit: number;
}

/**
 * date + limit で束ねた column-restricted anchors source を生成。
 *   query: from(external_anchors).select(ALLOWED).eq(user_id,uid).eq(date,day).limit(n)
 *   - 実 client は 4-B-1C-b で注入（今は mock のみ）。**実 DB read はしない**。
 *   - 戻り値は title/location を一切持たない RealityInput（projectToRealityInput）。
 */
export function createDatedColumnRestrictedAnchorSource(
  client: UserContextClient,
  bounds: RealReadBounds
): RealityDataSource {
  return {
    async loadForSmoke(userId: string) {
      const { data, error } = await client
        .from(ANCHOR_TABLE)
        .select(ANCHOR_COLUMNS_SQL) // "*" でない・raw 列なし（4-B-1A 固定）
        .eq("user_id", userId) // RLS + 明示 user 限定（二重防御）
        .eq("date", bounds.date) // 単一日のみ（全期間禁止）
        .limit(clampSmokeLimit(bounds.limit)); // 件数上限（無制限禁止・>50 は clamp）
      if (error || !data) return null;
      return projectToRealityInput(data); // 許可列のみ → raw を運ばない
    },
  };
}
