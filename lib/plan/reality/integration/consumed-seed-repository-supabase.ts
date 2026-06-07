import "server-only";
/**
 * Reality Control OS — A1-6-5d Part 2 Consumed Seed Repository（real DB reader・**server-only・column-restricted・barrel 非 export・未配線**）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.10
 *
 * 役割: ConsumedSeedRepository（A1-6-5c skeleton）の **real 実装**。injected user-RLS client で
 *   **status='consumed'** の plan_seeds を column-restricted に読み、duration_evidences で durationMin を enrich し、
 *   **seedRef → opaque handle** に変換して ReflectableConsumedSeed[] を返す。merge（A1-6-5c）の入力になる。
 *
 * 厳守:
 *   - **column-restricted**: SEED_COLUMNS_SQL / DURATION_EVIDENCE_COLUMNS_SQL（raw / source_ref を select も型も持たない）。
 *   - **consumed のみ**: `.eq("status", "consumed")`（active/expired/rejected は読まない）。
 *   - **seedRef を出さない**: 出力は handle（deriveCandidateHandle・一方向）。row.id は handle 変換 + duration の seed 突合にのみ使う。
 *   - **user-RLS client 注入・service_role なし**（plan_seeds / duration_evidences owner select policy）。本 module は createClient しない。
 *   - **read-only**（select/eq/in/limit のみ・INSERT/UPDATE/DELETE なし）。barrel 非 export・route/UI 非接続。
 */

import { deriveCandidateHandle } from "./candidate-action-handle";
import { SEED_TABLE, SEED_COLUMNS_SQL, type ColumnRestrictedSeedRow } from "./seed-column-restricted";
import {
  EVIDENCE_TABLE,
  DURATION_EVIDENCE_COLUMNS_SQL,
  projectDurationEvidenceRowsToMap,
  type ColumnRestrictedDurationEvidenceRow,
} from "./duration-evidence-source";
import type { ConsumedSeedRepository, ReflectableConsumedSeed } from "../consumed-seed-merge";
import type { TimeBand } from "../seed-placement";
import type { ActionShape } from "../../../stargazer/alterHomeAdapter";

/** consumed seed read 上限（population read 防止）。 */
const CONSUMED_READ_LIMIT = 50;
/** duration evidence read 上限（seed あたり複数 source ゆえ広め）。 */
const EVIDENCE_READ_LIMIT = 200;

/** read 結果（loose row・型は呼び出し側で解釈）。 */
interface ReadResult {
  readonly data: readonly Record<string, unknown>[] | null;
  readonly error: { readonly message: string } | null;
}
/** chainable read query（実 Supabase client が structural に満たす）。 */
interface ConsumedReadChain {
  eq(column: string, value: string): ConsumedReadChain;
  in(column: string, values: readonly string[]): ConsumedReadChain;
  limit(n: number): Promise<ReadResult>;
}
interface ConsumedReadFrom {
  select(columns: string): ConsumedReadChain;
}
/** user-RLS read client（**service_role を渡さないこと**）。実 Supabase client は from/select/eq/in/limit を持つ。 */
export interface ConsumedSeedReadClient {
  from(table: string): ConsumedReadFrom;
}

/** desired_time_hint → TimeBand | null（anytime / 不正 / null は null）。 */
function toBand(hint: unknown): TimeBand | null {
  return hint === "morning" || hint === "afternoon" || hint === "evening" ? hint : null;
}
/** action_shape（DB CHECK 済 8 値 or null）→ ActionShape | null。 */
function toActionShape(s: unknown): ActionShape | null {
  return typeof s === "string" ? (s as ActionShape) : null;
}

/**
 * A1-6-5d: injected user-RLS client で consumed plan_seeds + duration_evidences を読み ReflectableConsumedSeed[] を返す **real reader**。
 *   1. plan_seeds（SEED_COLUMNS_SQL）.eq(user_id).eq(status, 'consumed') → consumed rows。
 *   2. duration_evidences（DURATION_EVIDENCE_COLUMNS_SQL）.eq(user_id).in(seed_id, ids) → projectDurationEvidenceRowsToMap（adoptable high のみ）。
 *   3. map: durationMin=evidence[0]、date/band/actionShape=row、handle=deriveCandidateHandle(row.id)（seedRef を出さない）。
 *   error / 空 → []（fail-open に空を返す・merge は additive ゆえ DraftPlan 不変）。
 */
export function createConsumedSeedRepository(client: ConsumedSeedReadClient, userId: string): ConsumedSeedRepository {
  return {
    async readReflectableConsumedSeeds() {
      const seedRes = await client
        .from(SEED_TABLE)
        .select(SEED_COLUMNS_SQL) // 許可列のみ（raw / source_ref なし）
        .eq("user_id", userId) // RLS + 明示 user
        .eq("status", "consumed") // consumed のみ
        .limit(CONSUMED_READ_LIMIT);
      if (seedRes.error || !seedRes.data || seedRes.data.length === 0) return [];
      const rows = seedRes.data as unknown as readonly ColumnRestrictedSeedRow[];

      const seedIds = rows.map((r) => r.id);
      const evRes = await client
        .from(EVIDENCE_TABLE)
        .select(DURATION_EVIDENCE_COLUMNS_SQL)
        .eq("user_id", userId)
        .in("seed_id", seedIds)
        .limit(EVIDENCE_READ_LIMIT);
      const evRows = (evRes.error || !evRes.data ? [] : evRes.data) as unknown as readonly ColumnRestrictedDurationEvidenceRow[];
      const evidenceMap = projectDurationEvidenceRowsToMap(evRows); // seedRef → DurationEvidence[]（high のみ採用）

      return rows.map((r): ReflectableConsumedSeed => {
        const ev = evidenceMap[r.id];
        return {
          status: "consumed",
          durationMin: ev && ev.length > 0 ? ev[0]!.durationMin : null,
          date: r.desired_date ?? null,
          band: toBand(r.desired_time_hint),
          actionShape: toActionShape(r.action_shape),
          handle: deriveCandidateHandle(r.id), // opaque（seedRef を出さない）
        };
      });
    },
  };
}
