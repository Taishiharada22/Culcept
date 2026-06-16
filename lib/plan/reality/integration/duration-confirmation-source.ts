import "server-only";
/**
 * duration-confirmation-source — RD3c-P3a-wire-AB（2026-06-16）: `duration_confirmations` の **Supabase repository**
 *   （server-only・injected user-RLS client・**実 DB query を本 file に隔離**・barrel 非 export・未配線）
 *
 * 設計: docs/reality-operator-seed-wiring-rd3-c-p3a-wire-0.md / docs/reality-duration-confirmation-storage-rd3-c-p2-p3-0.md
 *
 * 役割: `OperatorDurationSeedRepositoryV0`（RD3c-P3a port）の Supabase 実装。`createOperatorDurationSeed`（pure orchestration）
 *   に注入される。**実 DB query（.from(DURATION_CONFIRMATIONS_TABLE)）を持つのは reality tree でこの file のみ**（static-safety）。
 *
 * 厳守（PRM repository 同形）:
 *   - **injected user-RLS client・createClient しない・service_role 禁止**（RLS WITH CHECK auth.uid()=user_id が owner-only 強制）。
 *   - user_id は injected ownerUserId（operator の auth.uid()・server-resolved）。RLS が二重強制。
 *   - **raw DB error / SQL / UUID を return / throw message に出さない**: error は `OperatorSeedRepositoryError(safe code)` に sanitize。
 *   - unique violation(23505) → `active_duplicate_conflict`（partial unique index・同一 scope active 1 行）。
 *   - findActiveByScope の read 失敗は `[]`（fail-safe・supersede しないが insert は unique index が守る）。
 *   - Date.now / new Date / network 直呼びなし（timestamp は orchestration 注入 row 由来）。barrel 非 export・未配線。
 */
import type {
  OperatorDurationSeedRepositoryV0,
} from "@/lib/plan/realityCore/operatorDurationSeedWrite";
import type {
  DurationConfirmationInsertV0,
  DurationConfirmationScopeV0,
} from "@/lib/plan/realityCore/durationConfirmation";

/** 実 DB table（reality tree で `.from` を持つのは本 file のみ・static-safety で固定）。 */
export const DURATION_CONFIRMATIONS_TABLE = "duration_confirmations";

/** safe error（raw DB error/SQL/UUID を持たない・code のみ）。 */
export class OperatorSeedRepositoryError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code); // message = safe code（raw を入れない）
    this.code = code;
    this.name = "OperatorSeedRepositoryError";
  }
}

// ── injected user-RLS client の structural 契約（実 Supabase client が満たす・service_role を渡さないこと）──
interface DcResult<D> {
  readonly data: D | null;
  readonly error: { readonly code?: string; readonly message: string } | null;
}
interface DcFilter<D> extends PromiseLike<DcResult<D>> {
  eq(column: string, value: unknown): DcFilter<D>;
  is(column: string, value: null): DcFilter<D>;
}
interface DcInsertBuilder {
  select(columns: string): { single(): PromiseLike<DcResult<{ id: string }>> };
}
interface DcFrom {
  insert(row: Record<string, unknown>): DcInsertBuilder;
  select(columns: string): DcFilter<Array<{ id: string }>>;
  update(patch: Record<string, unknown>): DcFilter<unknown>;
}
export interface DurationConfirmationWriteClient {
  from(table: string): DcFrom;
}

/** scope（nested）→ flat 列。 */
function flatScope(s: DurationConfirmationScopeV0): Record<string, unknown> {
  return {
    target_node_id: s.targetNodeId,
    origin_ref: s.originRef,
    destination_ref: s.destinationRef,
    transport_mode: s.transportMode,
    time_band: s.timeBand,
    subjective_date: s.subjectiveDate,
    temporal_scope_ref: s.temporalScopeRef,
    route_eta_supply_id: s.routeEtaSupplyId,
    provider_version: s.providerVersion,
  };
}

/** InsertV0（nested）→ DB flat row（id/superseded_by/created_at/updated_at は DB default）。 */
function toFlatRow(row: DurationConfirmationInsertV0, ownerUserId: string): Record<string, unknown> {
  const g = row.governance;
  return {
    user_id: ownerUserId, // server-resolved（RLS WITH CHECK auth.uid()=user_id と一致）
    source_anchor_ref: row.sourceAnchorRef,
    ...flatScope(row.scope),
    duration_upper_bound_minutes: row.durationUpperBoundMinutes,
    duration_lower_bound_minutes: row.durationLowerBoundMinutes,
    duration_basis: row.durationBasis,
    provenance_kind: g.provenanceKind,
    actor_type: g.actorType,
    environment: g.environment,
    learning_eligible: g.learningEligible,
    production_eligible: g.productionEligible,
    source_refs: g.sourceRefs,
    evidence_refs: g.evidenceRefs,
    confirmed_by: g.confirmedBy,
    confirmed_at: g.confirmedAt,
    created_by_slice: g.createdBySlice,
    freshness_status: row.freshnessStatus,
    valid_until: row.validUntil,
    revoked_at: row.revokedAt,
  };
}

/**
 * createSupabaseOperatorDurationSeedRepository — `OperatorDurationSeedRepositoryV0` の Supabase 実装（注入 client）。
 *   raw DB error は OperatorSeedRepositoryError(safe code) に sanitize（client に raw を出さない）。
 */
export function createSupabaseOperatorDurationSeedRepository(
  client: DurationConfirmationWriteClient,
  ownerUserId: string,
): OperatorDurationSeedRepositoryV0 {
  return {
    async insert(row: DurationConfirmationInsertV0): Promise<{ id: string }> {
      try {
        const res = await client.from(DURATION_CONFIRMATIONS_TABLE).insert(toFlatRow(row, ownerUserId)).select("id").single();
        if (res.error) {
          if (res.error.code === "23505") throw new OperatorSeedRepositoryError("active_duplicate_conflict"); // partial unique index
          throw new OperatorSeedRepositoryError("db_insert_failed"); // raw を出さない
        }
        if (res.data === null) throw new OperatorSeedRepositoryError("db_insert_failed");
        return { id: res.data.id };
      } catch (e) {
        throw e instanceof OperatorSeedRepositoryError ? e : new OperatorSeedRepositoryError("db_insert_failed");
      }
    },

    async findActiveByScope(userId: string, scope: DurationConfirmationScopeV0): Promise<ReadonlyArray<{ id: string }>> {
      try {
        const res = await client
          .from(DURATION_CONFIRMATIONS_TABLE)
          .select("id")
          .eq("user_id", userId)
          .eq("target_node_id", scope.targetNodeId)
          .eq("subjective_date", scope.subjectiveDate)
          .eq("transport_mode", scope.transportMode)
          .eq("temporal_scope_ref", scope.temporalScopeRef)
          .is("superseded_by", null)
          .is("revoked_at", null);
        if (res.error || res.data === null) return []; // read 失敗は fail-safe（unique index が duplicate を守る）
        return res.data.map((r) => ({ id: r.id }));
      } catch {
        return [];
      }
    },

    async markSuperseded(id: string, supersededById: string | null): Promise<void> {
      try {
        const res = await client
          .from(DURATION_CONFIRMATIONS_TABLE)
          .update({ superseded_by: supersededById })
          .eq("id", id)
          .eq("user_id", ownerUserId); // 自分の行のみ（owner-RLS と二重）
        if (res.error) throw new OperatorSeedRepositoryError("supersede_failed");
      } catch (e) {
        throw e instanceof OperatorSeedRepositoryError ? e : new OperatorSeedRepositoryError("supersede_failed");
      }
    },
  };
}
