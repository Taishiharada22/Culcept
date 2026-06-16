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
  DurationConfirmationRowV0,
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

// ── RD3x-ACTIVATE-0: operator preview real read（owner-RLS select・full row → DurationConfirmationRowV0）──
//   operator preview path（operatorDayPreview.listDurationConfirmations）に注入される read-only dep。
//   RLS（seed_owner_select: operator/dogfood/staging seed × dogfood/staging env × auth.uid()=user_id）が scope を強制。
//   一般 user の owner_select（general × production）は seed を構造排除 → operator_seed は user-facing read に漏れない（RLS smoke で検証）。

/** read-only structural client（write client と分離・select + eq/is chain のみ・実 Supabase client が満たす）。 */
interface DcReadResult {
  readonly data: ReadonlyArray<Record<string, unknown>> | null;
  readonly error: { readonly code?: string; readonly message: string } | null;
}
interface DcReadFilter extends PromiseLike<DcReadResult> {
  eq(column: string, value: unknown): DcReadFilter;
  is(column: string, value: null): DcReadFilter;
}
export interface DurationConfirmationReadClient {
  from(table: string): { select(columns: string): DcReadFilter };
}

/** flat（snake・select * の JS object）→ nested DurationConfirmationRowV0（read 専用 mapper・server-only）。 */
export function flatRowToConfirmation(j: Record<string, unknown>): DurationConfirmationRowV0 {
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  const num = (v: unknown): number => Number(v);
  return {
    id: String(j.id),
    userId: String(j.user_id),
    sourceAnchorRef: (j.source_anchor_ref as string | null) ?? null,
    scope: {
      targetNodeId: String(j.target_node_id),
      originRef: String(j.origin_ref),
      destinationRef: String(j.destination_ref),
      transportMode: j.transport_mode as DurationConfirmationRowV0["scope"]["transportMode"],
      timeBand: (j.time_band as string | null) ?? null,
      subjectiveDate: String(j.subjective_date),
      temporalScopeRef: String(j.temporal_scope_ref),
      routeEtaSupplyId: (j.route_eta_supply_id as string | null) ?? null,
      providerVersion: String(j.provider_version),
    },
    durationUpperBoundMinutes: num(j.duration_upper_bound_minutes),
    durationLowerBoundMinutes: j.duration_lower_bound_minutes === null || j.duration_lower_bound_minutes === undefined ? null : num(j.duration_lower_bound_minutes),
    durationBasis: j.duration_basis as DurationConfirmationRowV0["durationBasis"],
    governance: {
      provenanceKind: j.provenance_kind as DurationConfirmationRowV0["governance"]["provenanceKind"],
      actorType: j.actor_type as DurationConfirmationRowV0["governance"]["actorType"],
      environment: j.environment as DurationConfirmationRowV0["governance"]["environment"],
      learningEligible: Boolean(j.learning_eligible),
      productionEligible: Boolean(j.production_eligible),
      confirmedBy: String(j.confirmed_by),
      confirmedAt: String(j.confirmed_at),
      createdBySlice: String(j.created_by_slice),
      sourceRefs: arr(j.source_refs),
      evidenceRefs: arr(j.evidence_refs),
    },
    freshnessStatus: (j.freshness_status as DurationConfirmationRowV0["freshnessStatus"]) ?? null,
    validUntil: (j.valid_until as string | null) ?? null,
    supersededBy: (j.superseded_by as string | null) ?? null,
    revokedAt: (j.revoked_at as string | null) ?? null,
  };
}

export interface OperatorDurationSeedReaderV0 {
  /** 当日 active（superseded/revoked でない）seed を owner-RLS で読む（full row）。read 失敗は `[]`（fail-safe・raw を出さない）。 */
  listActiveByOwnerForDate(userId: string, subjectiveDate: string): Promise<DurationConfirmationRowV0[]>;
}

/**
 * createSupabaseOperatorDurationSeedReader — operator preview real read（injected user-RLS client）。
 *   raw row/durationValue/exact timestamp の **client 露出はしない**（呼び元 operatorDayPreview が safe boolean に潰す）。
 *   read 失敗（error / 例外）は `[]`（fail-safe・raw DB error を出さない）。
 */
export function createSupabaseOperatorDurationSeedReader(
  client: DurationConfirmationReadClient,
): OperatorDurationSeedReaderV0 {
  return {
    async listActiveByOwnerForDate(userId: string, subjectiveDate: string): Promise<DurationConfirmationRowV0[]> {
      try {
        const res = await client
          .from(DURATION_CONFIRMATIONS_TABLE)
          .select("*")
          .eq("user_id", userId) // RLS と二重（owner-only）
          .eq("subjective_date", subjectiveDate)
          .is("superseded_by", null)
          .is("revoked_at", null);
        if (res.error || res.data === null) return []; // fail-safe（raw を出さない）
        return res.data.map((r) => flatRowToConfirmation(r));
      } catch {
        return []; // 例外も raw を出さず []
      }
    },
  };
}
