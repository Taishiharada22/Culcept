/**
 * operatorDurationSeedWrite — RD3c-P3a（2026-06-16）: operator duration seed の **write 経路**（pure・repository 注入・no-DB/Supabase/route/UI）
 *
 * 正本設計: docs/reality-duration-confirmation-storage-rd3-c-p2-p3-0.md（§6/§9）
 *
 * 思想（PRM learning-event-insert と同パターン・server が provenance を固定）:
 *   operator が dogfood/staging 用に duration seed を書く最小 write path。**client 入力を信用せず server が governance を固定**:
 *   provenanceKind='operator_seed' / actorType='operator' / learningEligible=false / productionEligible=false / environment は
 *   server-resolved（production は reject）。実 DB write は **注入 repository** が行う（本 module は Supabase を import しない）。
 *   route / server action / UI / DB apply は **後続 gate**（本 module はその foundation）。
 *
 * 不変条件:
 *   - operator_seed のみ・dogfood/staging のみ・learningEligible/productionEligible=false 固定・actorType=operator 固定。
 *   - general_user_confirmed / user actor / production を operator path で作れない（request に provenance field が存在しない）。
 *   - validation（durationConfirmationViolations）を通らない row は insert しない（validation bypass 不可）。
 *   - 物理 delete しない（同一 scope の既存 active は supersede・audit chain 保持）。
 *   - service_role 不使用・raw（座標/polyline/title/locationText/companions）を受け取らない（leak validation で弾く）。
 *   - pure: Date.now / new Date / network / Supabase なし（nowIso は server が注入）。
 */
import type { DurationValueBasis } from "./routeEtaDurationValue";
import {
  durationConfirmationViolations,
  type DurationConfirmationRowV0,
  type DurationConfirmationInsertV0,
  type DurationConfirmationScopeV0,
  type DurationConfirmationGovernanceV0,
  type DurationEnvironment,
} from "./durationConfirmation";

export const OPERATOR_DURATION_SEED_WRITE_VERSION = 0;
const OPERATOR_SEED_SLICE = "RD3c-P3a";

/** operator が提供する seed 要求（**provenance governance を含まない**・server が固定する）。 */
export interface OperatorDurationSeedRequestV0 {
  readonly userId: string; // seed が紐づく owner（operator が dogfood/staging で代理 seed）
  readonly sourceAnchorRef: string | null;
  readonly scope: DurationConfirmationScopeV0;
  readonly durationUpperBoundMinutes: number;
  readonly durationLowerBoundMinutes: number | null;
  readonly durationBasis: DurationValueBasis;
  readonly confirmedBy: string; // operator id（opaque）
  readonly sourceRefs: ReadonlyArray<string>; // opaque
  readonly evidenceRefs: ReadonlyArray<string>; // opaque
  readonly freshnessStatus: "fresh" | "stale" | "expired" | null;
  readonly validUntil: string | null;
}

/** 注入 repository（Supabase 固有型を漏らさない契約・物理 delete を持たない）。 */
export interface OperatorDurationSeedRepositoryV0 {
  readonly findActiveByScope: (userId: string, scope: DurationConfirmationScopeV0) => Promise<ReadonlyArray<{ id: string }>>;
  readonly markSuperseded: (id: string, supersededById: string | null) => Promise<void>;
  readonly insert: (row: DurationConfirmationInsertV0) => Promise<{ id: string }>;
}

/** 注入依存（operator gate / 環境 / 時刻 / repository は server が解決して渡す）。 */
export interface OperatorDurationSeedDepsV0 {
  readonly isOperator: boolean; // server-resolved operator gate（非 operator は write しない）
  readonly resolvedEnvironment: DurationEnvironment; // server-resolved（**client から受けない**・production は reject）
  readonly nowIso: string; // server clock（pure・Date.now 不使用）
  readonly repository: OperatorDurationSeedRepositoryV0;
}

export type OperatorDurationSeedResultV0 =
  | { readonly ok: true; readonly insertedId: string; readonly supersededIds: ReadonlyArray<string> }
  | { readonly ok: false; readonly rejectedReason: string; readonly violations: ReadonlyArray<string> };

/**
 * createOperatorDurationSeed — operator seed の唯一の write 入口（pure orchestration・repository 注入）。
 * server が governance を固定 → validation → supersede（物理 delete しない）→ insert。
 * 非 operator / production / validation 違反は insert せず reject。
 */
export async function createOperatorDurationSeed(
  request: OperatorDurationSeedRequestV0,
  deps: OperatorDurationSeedDepsV0,
): Promise<OperatorDurationSeedResultV0> {
  // ① operator gate（非 operator は一切 write しない）
  if (!deps.isOperator) return { ok: false, rejectedReason: "not_operator", violations: [] };
  // ② environment gate（production を operator path で作らない）
  if (deps.resolvedEnvironment === "production") return { ok: false, rejectedReason: "environment_production_not_allowed", violations: [] };

  // ③ **server が governance を固定**（client 入力を信用しない・request に provenance field は存在しない）
  const governance: DurationConfirmationGovernanceV0 = {
    provenanceKind: "operator_seed", // 固定
    actorType: "operator", // 固定
    environment: deps.resolvedEnvironment, // dogfood | staging（production は ② で reject 済）
    learningEligible: false, // 固定（一般 user 学習に流さない）
    productionEligible: false, // 固定
    confirmedBy: request.confirmedBy,
    confirmedAt: deps.nowIso,
    createdBySlice: OPERATOR_SEED_SLICE,
    sourceRefs: request.sourceRefs,
    evidenceRefs: request.evidenceRefs,
  };

  const insertRow: DurationConfirmationInsertV0 = {
    userId: request.userId,
    sourceAnchorRef: request.sourceAnchorRef,
    scope: request.scope,
    durationUpperBoundMinutes: request.durationUpperBoundMinutes,
    durationLowerBoundMinutes: request.durationLowerBoundMinutes,
    durationBasis: request.durationBasis,
    governance,
    freshnessStatus: request.freshnessStatus,
    validUntil: request.validUntil,
    revokedAt: null,
  };

  // ④ validation（bypass 不可・bounds/scope/basis/leak/governance を統合検査）
  const asRow: DurationConfirmationRowV0 = { ...insertRow, id: "pending", supersededBy: null };
  const violations = durationConfirmationViolations(asRow);
  if (violations.length > 0) return { ok: false, rejectedReason: "validation_failed", violations };

  // ⑤ supersede 同一 scope の既存 active（物理 delete しない・audit chain）。
  //   RD3c-P3-local-activation で実 DB smoke が捕捉した bug 修正: partial unique index（active=superseded_by IS NULL）下では
  //   **insert 前に active slot を空けねばならない**。superseded_by=null は slot を空けない（still active）→ insert が unique 違反。
  //   → 新 id 確定前に **superseded_by を非 null（自己参照）で立てて slot を空け**、insert 後に正しい新 id へ patch する（2 段）。
  //   （staging 多操作者の原子化は RPC upgrade=wire-0 §1。v0 sequential の partial failure は次回 findActive が self-heal）。
  const existing = await deps.repository.findActiveByScope(request.userId, request.scope);
  const supersededIds: string[] = [];
  for (const e of existing) {
    await deps.repository.markSuperseded(e.id, e.id); // 非 null 自己参照で active slot を空ける（transient）
    supersededIds.push(e.id);
  }

  // ⑥ insert（実 DB write は注入 repository・本 module は Supabase を import しない）
  const inserted = await deps.repository.insert(insertRow);
  // supersede chain を新 id に結ぶ（audit・自己参照を正しい新 id へ patch）
  for (const id of supersededIds) await deps.repository.markSuperseded(id, inserted.id);

  return { ok: true, insertedId: inserted.id, supersededIds };
}
