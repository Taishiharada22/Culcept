/**
 * Mock SupabaseClient for Repository contract tests (A-2)
 *
 * 目的:
 *   - SupabaseClient 互換の chainable API を in-memory で再現
 *   - Repository 実装の contract（CRUD + RLS-aware filter + error path）を deterministic に検証
 *   - 将来の A-4（CI integration test）でも再利用可能な fixture
 *
 * 仕様:
 *   - `from(table).insert(payload).select().single()` — 単一 row INSERT + RETURNING
 *   - `from(table).insert([...]).select()`             — batch INSERT + RETURNING
 *   - `from(table).select('*').eq(col, val)`           — フィルタ付き SELECT
 *   - `from(table).select('id', {count:'exact', head:true}).eq(...)` — count モード
 *   - `from(table).delete().eq(...).eq(...).select('id')` — フィルタ付き DELETE + RETURNING
 *
 * 不変:
 *   - RLS は再現しない（Repository が明示 .eq('user_id', userId) で防御するため）
 *   - id は deterministic 連番（test fixture 用、本番の gen_random_uuid とは独立）
 *   - timestamp は inject 可能（default は now()）
 *   - error injection: operation 単位で次の N 回失敗を設定可能
 */

import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type MockOperation = "insert" | "select" | "delete" | "update";

export interface MockSupabaseOptions {
  /** 連番 id の prefix。default: "mock-id" */
  idPrefix?: string;
  /** 全 INSERT に注入される timestamp。default: 固定値 */
  now?: () => string;
  /**
   * 失敗注入: operation × table 単位で、次に発生する PostgrestError を queue する。
   * 例: failNext('insert', 'external_anchors', { code:'23514', message:'check_violation' })
   */
}

interface FailQueueKey {
  op: MockOperation;
  table: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MockSupabaseClient
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MockSupabaseClient extends Pick<SupabaseClient, "from"> {
  /** 失敗注入: 次回 op×table で発火する error を queue */
  failNext(op: MockOperation, table: string, error: Partial<PostgrestError>): void;
  /** 全 store / fail queue / auth state をクリア */
  reset(): void;
  /** デバッグ用 store 参照（read-only） */
  inspect(table: string): ReadonlyArray<Record<string, unknown>>;
  /** auth.getUser() で返す user。null なら認証なし */
  setAuthUser(user: { id: string; email?: string } | null): void;
  /** auth.getUser() に error を発火させる（次の 1 回のみ） */
  failAuthNext(error: { message: string }): void;
  /** auth API（@supabase/supabase-js 互換の最小 shape） */
  auth: {
    getUser(): Promise<{
      data: { user: { id: string; email?: string } | null };
      error: { message: string } | null;
    }>;
  };
  /** 真の SupabaseClient として渡せるよう、unknown キャスト用ヘルパ */
  asSupabaseClient(): SupabaseClient;
}

export function createMockSupabaseClient(
  opts: MockSupabaseOptions = {}
): MockSupabaseClient {
  const idPrefix = opts.idPrefix ?? "mock-id";
  const now = opts.now ?? (() => "2026-05-01T00:00:00.000Z");

  // table_name → Map<id, row>
  const store = new Map<string, Map<string, Record<string, unknown>>>();
  const failQueue: Array<{ key: FailQueueKey; error: Partial<PostgrestError> }> = [];

  let seq = 0;
  const nextId = () => `${idPrefix}-${++seq}`;

  function tableStore(table: string): Map<string, Record<string, unknown>> {
    let s = store.get(table);
    if (!s) {
      s = new Map();
      store.set(table, s);
    }
    return s;
  }

  function takeFail(op: MockOperation, table: string): Partial<PostgrestError> | null {
    const idx = failQueue.findIndex(
      (f) => f.key.op === op && f.key.table === table
    );
    if (idx < 0) return null;
    const [taken] = failQueue.splice(idx, 1);
    return taken!.error;
  }

  function makePostgrestError(p: Partial<PostgrestError>): PostgrestError {
    return {
      message: p.message ?? "mock error",
      details: p.details ?? "",
      hint: p.hint ?? "",
      code: p.code ?? "MOCK",
      name: "PostgrestError",
    } as PostgrestError;
  }

  // ── chainable query builder ──

  function makeBuilder(table: string) {
    let op: MockOperation = "select";
    let insertPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;
    let updatePayload: Record<string, unknown> | null = null;
    const filters: Array<[string, unknown]> = [];
    let returnRows = false;
    let isSingle = false;
    let isHead = false;
    let countMode: "exact" | "planned" | "estimated" | undefined;

    const builder = {
      insert(p: Record<string, unknown> | Record<string, unknown>[]) {
        op = "insert";
        insertPayload = p;
        return builder;
      },
      update(p: Record<string, unknown>) {
        op = "update";
        updatePayload = p;
        return builder;
      },
      delete() {
        op = "delete";
        return builder;
      },
      select(
        _fields = "*",
        selectOpts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }
      ) {
        returnRows = true;
        if (selectOpts?.count) countMode = selectOpts.count;
        if (selectOpts?.head) isHead = true;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return builder;
      },
      single() {
        isSingle = true;
        return builder;
      },
      // Promise-like
      then<T>(
        resolve: (value: {
          data: unknown;
          error: PostgrestError | null;
          count: number | null;
        }) => T,
        reject?: (reason: unknown) => T
      ) {
        return Promise.resolve()
          .then(() => execute())
          .then(resolve, reject);
      },
      catch<T>(reject: (reason: unknown) => T) {
        return Promise.resolve()
          .then(() => execute())
          .catch(reject);
      },
    };

    function applyFilters(rows: Record<string, unknown>[]): Record<string, unknown>[] {
      return rows.filter((row) => filters.every(([col, val]) => row[col] === val));
    }

    function execute(): {
      data: unknown;
      error: PostgrestError | null;
      count: number | null;
    } {
      // ── error injection（最優先） ──
      if (op !== "update") {
        const failure = takeFail(op, table);
        if (failure) {
          return {
            data: null,
            error: makePostgrestError(failure),
            count: null,
          };
        }
      }

      const s = tableStore(table);

      if (op === "insert") {
        const payloads = Array.isArray(insertPayload)
          ? insertPayload
          : [insertPayload!];
        const inserted: Record<string, unknown>[] = [];
        for (const p of payloads) {
          // id / created_at / updated_at / captured_at の DB DEFAULT を mock
          const id = (p.id as string | undefined) ?? nextId();
          const tsKeys = ["captured_at", "created_at", "updated_at"];
          const enriched: Record<string, unknown> = { ...p, id };
          for (const k of tsKeys) {
            if (!(k in enriched) || enriched[k] === null || enriched[k] === undefined) {
              enriched[k] = now();
            }
          }
          s.set(id, enriched);
          inserted.push(enriched);
        }

        if (isSingle) {
          return {
            data: returnRows ? (inserted[0] ?? null) : null,
            error: null,
            count: null,
          };
        }
        return {
          data: returnRows ? inserted : null,
          error: null,
          count: null,
        };
      }

      if (op === "select") {
        const all = Array.from(s.values());
        const filtered = applyFilters(all);
        if (isHead) {
          return {
            data: null,
            error: null,
            count: countMode ? filtered.length : null,
          };
        }
        if (isSingle) {
          if (filtered.length === 0) {
            return {
              data: null,
              error: makePostgrestError({
                code: "PGRST116",
                message: "No rows returned",
              }),
              count: null,
            };
          }
          return { data: filtered[0]!, error: null, count: null };
        }
        return {
          data: filtered,
          error: null,
          count: countMode ? filtered.length : null,
        };
      }

      if (op === "delete") {
        const all = Array.from(s.values());
        const target = applyFilters(all);
        for (const row of target) {
          const id = row.id as string;
          s.delete(id);
        }
        return {
          data: returnRows ? target : null,
          error: null,
          count: null,
        };
      }

      // update (未使用、防御的)
      return { data: null, error: null, count: null };
    }

    return builder;
  }

  // auth state
  let authUser: { id: string; email?: string } | null = null;
  let authFailNext: { message: string } | null = null;

  const client: MockSupabaseClient = {
    from(table: string) {
      return makeBuilder(table) as unknown as ReturnType<SupabaseClient["from"]>;
    },
    failNext(op, table, error) {
      failQueue.push({ key: { op, table }, error });
    },
    reset() {
      store.clear();
      failQueue.length = 0;
      seq = 0;
      authUser = null;
      authFailNext = null;
    },
    inspect(table) {
      return Array.from(tableStore(table).values());
    },
    setAuthUser(user) {
      authUser = user;
    },
    failAuthNext(error) {
      authFailNext = error;
    },
    auth: {
      async getUser() {
        if (authFailNext) {
          const err = authFailNext;
          authFailNext = null;
          return { data: { user: null }, error: err };
        }
        return { data: { user: authUser }, error: null };
      },
    },
    asSupabaseClient() {
      return this as unknown as SupabaseClient;
    },
  };

  return client;
}
