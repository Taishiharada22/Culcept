import "server-only";
/**
 * Reality Control OS — A1-5-2-2-2c Seed DB Read Seam（column-restricted・DI client・実 read は注入）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.11
 *
 * 目的: structured-only `plan_seeds`（A1-5-2-2-1 migration・staging apply 済 A1-5-2-2-2b）から
 *   **許可列だけ**を bounded に読み、A1-5-2-1 `projectSeedRowsToPlacements` へ渡す read path を確定する。
 *   実 client 生成（createClient）は呼び出し側に隔離。本ファイルは経路を作らない（**barrel 非 export**）。
 *
 * 厳守:
 *   - **column-restricted**（`SEED_COLUMNS_SQL` 固定・`select("*")` / raw 列なし）。table 固定（plan_seeds のみ）。
 *   - **raw（signal / desired_action / raw_text / title / location）/ source_ref を読まない・型に持たない**。
 *   - **service_role を import しない**（user-RLS client を注入。RLS を bypass しない）。
 *   - **bounded**（user_id + status='active' + limit clamp。population read 禁止）。
 *   - **DB write しない**（select/eq/or/limit のみ。INSERT/UPDATE/DELETE/upsert なし）。
 *   - `server-only` / barrel 非 export / route・UI・PlanClient・generateCandidates から呼ばない。
 *   - seeds に duration 欄なし → durationMin=null → isPlaceable=false → **candidateCount=0**（A1-5-3 PRM まで）。
 */

import {
  SEED_TABLE,
  SEED_COLUMNS_SQL,
  projectSeedRowsToPlacements,
  type ColumnRestrictedSeedRow,
} from "./seed-column-restricted";
import type { SeedPlacement } from "../seed-placement";
import { evaluateSmokeGate, type SmokeGate } from "./dev-runtime";

// ── date/limit を表現できる最小 query interface（実 user-context Supabase client が structural に満たす） ──

export interface SeedQuery {
  /** WHERE 等値（user_id / status）。 */
  eq(column: string, value: string): SeedQuery;
  /** WHERE OR（期限切れ除外の境界注入用。expires_at は **SELECT しない**が WHERE で絞る）。 */
  or(filters: string): SeedQuery;
  /** 件数上限を付けて解決（無制限/population read を構造的に防ぐ終端）。 */
  limit(n: number): Promise<{ data: readonly ColumnRestrictedSeedRow[] | null; error: { message: string } | null }>;
}
export interface SeedFrom {
  select(columns: string): SeedQuery;
}
/**
 * user-context（RLS 適用）client。**service role を渡さないこと**。
 * 実 Supabase の `SupabaseClient` は from/select/eq/or/limit を持ち structural にこれを満たす。
 */
export interface SeedUserContextClient {
  from(table: string): SeedFrom;
}

/** seed read の件数上限。これを超える指定は clamp する（population read 防止）。 */
export const MAX_SEED_LIMIT = 50;

/** limit を [1, MAX_SEED_LIMIT] に clamp（>50 を読まない・0/負を防ぐ）。 */
export function clampSeedLimit(limit: number): number {
  if (!Number.isFinite(limit)) return MAX_SEED_LIMIT;
  return Math.min(Math.max(1, Math.floor(limit)), MAX_SEED_LIMIT);
}

export interface SeedReadBounds {
  /** 件数上限。必須（無制限禁止）。**MAX_SEED_LIMIT に clamp**。 */
  readonly limit: number;
  /** 任意: 期限切れ除外の境界（ISO）。注入時のみ expires_at フィルタを **WHERE に**足す（SELECT はしない）。 */
  readonly activeAsOfIso?: string;
}

/** plan_seeds の active 行を `SeedPlacement[]` として返す source（**seed のみ・RealityInput でない**）。 */
export interface ColumnRestrictedSeedSource {
  loadActivePlacements(userId: string): Promise<readonly SeedPlacement[] | null>;
}

/**
 * column-restricted な plan_seeds read source を生成。
 *   query: from(plan_seeds).select(SEED_COLUMNS_SQL).eq(user_id).eq(status,'active')[.or(expiry)].limit(clamp)
 *   - 実 client は呼び出し側で注入（**user-RLS**）。**service_role 禁止**。
 *   - 戻り値は raw を一切持たない `SeedPlacement[]`（projectSeedRowsToPlacements）。durationMin=null（placeable=false）。
 */
export function createColumnRestrictedSeedSource(
  client: SeedUserContextClient,
  bounds: SeedReadBounds
): ColumnRestrictedSeedSource {
  return {
    async loadActivePlacements(userId: string) {
      let q = client
        .from(SEED_TABLE) // "plan_seeds"（定数・本ファイルのみ）
        .select(SEED_COLUMNS_SQL) // 許可列のみ（"*" でない・raw / source_ref なし）
        .eq("user_id", userId) // RLS + 明示 user 限定（二重防御）
        .eq("status", "active"); // active のみ
      if (bounds.activeAsOfIso) {
        // 期限切れ除外（expires_at は SELECT せず WHERE のみ・境界注入）
        q = q.or(`expires_at.is.null,expires_at.gt.${bounds.activeAsOfIso}`);
      }
      const { data, error } = await q.limit(clampSeedLimit(bounds.limit)); // 件数上限（無制限禁止・>50 は clamp）
      if (error || !data) return null;
      return projectSeedRowsToPlacements(data); // 許可列のみ → raw 非搬送 / active のみ / durationMin=null
    },
  };
}

/**
 * gate（fail-closed）を通した read。production / flag off / capability なし / user mismatch なら **load 0**（空配列）。
 * 実 read は gate pass 後にのみ行う（anchor smoke と同じ多層 fail-closed）。
 */
export async function loadGatedActivePlacements(
  gate: SmokeGate,
  source: ColumnRestrictedSeedSource
): Promise<readonly SeedPlacement[]> {
  const verdict = evaluateSmokeGate(gate);
  if (!verdict.pass) return []; // PRODUCTION / FLAG_OFF / NO_CAPABILITY / OUT_OF_SCOPE_USER → 0
  const placements = await source.loadActivePlacements(gate.requestedUserId);
  return placements ?? [];
}
