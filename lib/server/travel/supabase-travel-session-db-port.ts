import "server-only";
/**
 * Concrete-shaped Supabase `TravelSessionDbPort`（**注入 structural client・mock-only 検証・real DB call なし**）
 *
 * 設計正本: docs/t11-real-supabase-repository-adapter-design.md（§4-9 案 B）
 *
 * ★ 既存 user-RLS repository の house style に倣う:
 *   - **client は注入**（`createClient` を内部でしない・`supabaseServer()` を構築しない）。
 *   - **generated `Database` types を import しない**（最小 structural client interface で型付け）。
 *   - **service_role / admin / bypass なし**・owner-scoped filter・**RLS が最終 gate**。
 *   - domain 検証はしない（mapping adapter `createTravelSessionRepositoryFromDbPort` が担当）。
 *   - display を recompute しない・engine/projection/cue を呼ばない・href/generatedUrl を作らない。
 *
 * ★ atomicity（§8-B）: Supabase JS は跨 table transaction を持たない。save の cleanup（session delete で
 *   cascade rollback 相当）は **mapping adapter の save flow** が担う（本 port は単一 table 操作のみ）。
 */

import type {
  TravelSessionDbPort,
  PlanTravelSessionRow,
  PlanTravelSessionInputRow,
  PlanTravelSessionLinkRow,
  PlanTravelSessionInsertRow,
  PlanTravelSessionInputInsertRow,
  PlanTravelSessionLinkInsertRow,
} from "./travel-session-db-port";

const TABLE_SESSIONS = "plan_travel_sessions";
const TABLE_INPUTS = "plan_travel_session_inputs";
const TABLE_LINKS = "plan_travel_session_links";

// ── 最小 structural client interface（実 Supabase client が structural に満たす・generated types 不要） ──

type DbRow = Record<string, unknown>;
interface DbResult<T> {
  readonly data: T | null;
  readonly error: { readonly message: string } | null;
}
interface InsertSelectBuilder extends PromiseLike<DbResult<DbRow[]>> {
  single(): PromiseLike<DbResult<DbRow>>;
}
interface InsertBuilder {
  select(columns?: string): InsertSelectBuilder;
}
interface SelectBuilder extends PromiseLike<DbResult<DbRow[]>> {
  eq(column: string, value: string): SelectBuilder;
  order(column: string, opts?: { ascending?: boolean }): SelectBuilder;
  maybeSingle(): PromiseLike<DbResult<DbRow | null>>;
}
interface DeleteBuilder extends PromiseLike<DbResult<DbRow[]>> {
  eq(column: string, value: string): DeleteBuilder;
  select(columns?: string): PromiseLike<DbResult<DbRow[]>>;
}
interface TravelFromBuilder {
  insert(values: DbRow | DbRow[]): InsertBuilder;
  select(columns?: string): SelectBuilder;
  delete(): DeleteBuilder;
}
/** ★ user-RLS Supabase client の **最小 structural 型**（service_role を渡さないこと）。 */
export interface SupabaseTravelSessionStructuralClient {
  from(table: string): TravelFromBuilder;
}

/** port 内部 error（**raw DB diagnostics を client に出さない**・code のみ）。 */
export class TravelSessionDbPortError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "TravelSessionDbPortError";
  }
}

/**
 * 注入 structural client 上に `TravelSessionDbPort` を実装（owner-scoped table 操作のみ・RLS が最終 gate）。
 */
export function createSupabaseTravelSessionDbPort(
  client: SupabaseTravelSessionStructuralClient,
): TravelSessionDbPort {
  return {
    async insertSession(row: PlanTravelSessionInsertRow): Promise<PlanTravelSessionRow> {
      const res = await client.from(TABLE_SESSIONS).insert(row as unknown as DbRow).select().single();
      if (res.error || !res.data) throw new TravelSessionDbPortError("insert_session_failed");
      return res.data as unknown as PlanTravelSessionRow;
    },

    async insertInputs(rows: PlanTravelSessionInputInsertRow[]): Promise<PlanTravelSessionInputRow[]> {
      if (rows.length === 0) return [];
      const res = await client.from(TABLE_INPUTS).insert(rows as unknown as DbRow[]).select();
      if (res.error || !res.data) throw new TravelSessionDbPortError("insert_inputs_failed");
      return res.data as unknown as PlanTravelSessionInputRow[];
    },

    async insertLinks(rows: PlanTravelSessionLinkInsertRow[]): Promise<PlanTravelSessionLinkRow[]> {
      if (rows.length === 0) return [];
      const res = await client.from(TABLE_LINKS).insert(rows as unknown as DbRow[]).select();
      if (res.error || !res.data) throw new TravelSessionDbPortError("insert_links_failed");
      return res.data as unknown as PlanTravelSessionLinkRow[];
    },

    async selectBundleByOwner(sessionId: string, ownerUserId: string) {
      // ★ owner-scoped: session を id + owner_user_id で取得（非 owner → null・RLS も最終 gate）。
      const sres = await client
        .from(TABLE_SESSIONS)
        .select("*")
        .eq("id", sessionId)
        .eq("owner_user_id", ownerUserId)
        .maybeSingle();
      if (sres.error || !sres.data) return null;
      const session = sres.data as unknown as PlanTravelSessionRow;
      // children は session_id で scope（RLS が owning session 経由で owner 強制）。
      const ires = await client.from(TABLE_INPUTS).select("*").eq("session_id", sessionId);
      const lres = await client.from(TABLE_LINKS).select("*").eq("session_id", sessionId);
      if (ires.error || lres.error) return null;
      return {
        session,
        inputs: (ires.data ?? []) as unknown as PlanTravelSessionInputRow[],
        links: (lres.data ?? []) as unknown as PlanTravelSessionLinkRow[],
      };
    },

    async listByOwner(ownerUserId: string): Promise<PlanTravelSessionRow[]> {
      const res = await client
        .from(TABLE_SESSIONS)
        .select("*")
        .eq("owner_user_id", ownerUserId)
        .order("created_at", { ascending: false });
      if (res.error || !res.data) return [];
      return res.data as unknown as PlanTravelSessionRow[];
    },

    async deleteByOwner(sessionId: string, ownerUserId: string): Promise<boolean> {
      // ★ owner-scoped delete（FK ON DELETE CASCADE で children も削除・RLS も最終 gate）。
      const res = await client
        .from(TABLE_SESSIONS)
        .delete()
        .eq("id", sessionId)
        .eq("owner_user_id", ownerUserId)
        .select();
      if (res.error) return false;
      return (res.data?.length ?? 0) > 0;
    },
  };
}
