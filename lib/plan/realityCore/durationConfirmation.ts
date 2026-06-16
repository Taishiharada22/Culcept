/**
 * durationConfirmation — RD3c-P2a（2026-06-16）: duration_confirmations の型 + validation（pure・read-only・no write）
 *
 * 正本設計: docs/reality-duration-confirmation-storage-rd3-c-p2-p3-0.md
 *
 * 思想（2 次元分離・前提を疑った帰結）:
 *   - `durationBasis`（compute-grade・既存 DurationValueBasis）= leaveBy 計算可否。
 *   - `durationProvenanceKind`（governance・新規）= 学習適格性 / 環境 / actor / user-facing 可否。
 *   - operator_seed も general_user_confirmed も同じ basis='user_confirmed'（compute 同一）・provenance が違う。
 *   - **learning_eligible=true は general_user_confirmed ∧ production ∧ user のみ**（操作/dogfood/staging seed は false 固定）。
 *
 * 不変条件（validation で機械強制）:
 *   - duration upper は integer・>0・%5===0・<=1440。lower は null または 0<=lower<=upper。
 *   - basis は projection allowlist（heuristic/none 不可）。
 *   - raw（座標 / polyline / placeId / route payload / title / locationText / companions / graphViewerKey）を持たない。
 *   - scope（targetNodeId/origin/destination/transportMode/subjectiveDate/temporalScopeRef）完備。
 */
import type { DurationValueBasis } from "./routeEtaDurationValue";
import type { TransportModeV0 } from "./routeEtaCapability";

export const DURATION_CONFIRMATION_VERSION = 0;

export type DurationProvenanceKind =
  | "general_user_confirmed"
  | "operator_seed"
  | "dogfood_seed"
  | "staging_seed"
  | "imported_scheduled"
  | "cached_route"
  | "external_route";

export type DurationActorType = "user" | "operator" | "system";
export type DurationEnvironment = "dogfood" | "staging" | "production";

export const DURATION_CONFIRMATION_MAX_MINUTES = 1440;

/** scope（mismatch なら unusable）。 */
export interface DurationConfirmationScopeV0 {
  readonly targetNodeId: string;
  readonly originRef: string; // opaque
  readonly destinationRef: string; // opaque
  readonly transportMode: TransportModeV0;
  readonly timeBand: string | null;
  readonly subjectiveDate: string; // YYYY-MM-DD
  readonly temporalScopeRef: string;
  readonly routeEtaSupplyId: string | null;
  readonly providerVersion: string;
}

/** governance（provenance・compute と分離）。 */
export interface DurationConfirmationGovernanceV0 {
  readonly provenanceKind: DurationProvenanceKind;
  readonly actorType: DurationActorType;
  readonly environment: DurationEnvironment;
  readonly learningEligible: boolean;
  readonly productionEligible: boolean;
  readonly confirmedBy: string; // opaque
  readonly confirmedAt: string; // ISO
  readonly createdBySlice: string;
  readonly sourceRefs: ReadonlyArray<string>; // opaque
  readonly evidenceRefs: ReadonlyArray<string>; // opaque
}

/** 永続行（read）。 */
export interface DurationConfirmationRowV0 {
  readonly id: string;
  readonly userId: string;
  readonly sourceAnchorRef: string | null;
  readonly scope: DurationConfirmationScopeV0;
  readonly durationUpperBoundMinutes: number;
  readonly durationLowerBoundMinutes: number | null;
  readonly durationBasis: DurationValueBasis;
  readonly governance: DurationConfirmationGovernanceV0;
  readonly freshnessStatus: "fresh" | "stale" | "expired" | null;
  readonly validUntil: string | null; // ISO
  readonly supersededBy: string | null;
  readonly revokedAt: string | null;
}

/** insert 形（id / created_at / updated_at を持たない）。write は別 GO。 */
export type DurationConfirmationInsertV0 = Omit<DurationConfirmationRowV0, "id" | "supersededBy">;

const PROJECTION_BASES: ReadonlyArray<DurationValueBasis> = ["external_route", "cached_route", "scheduled", "user_confirmed"];

/** raw leak を疑う token（opaque 化されているべき・raw が混入したら検出）。 */
const RAW_LEAK_PATTERNS: ReadonlyArray<{ key: string; re: RegExp }> = [
  { key: "coordinate_pair", re: /-?\d{1,3}\.\d{3,},\s*-?\d{1,3}\.\d{3,}/ }, // lat,lng
  { key: "latlng_field", re: /"?(lat|lng|latitude|longitude)"?\s*[:=]/i },
  { key: "polyline", re: /polyline|encodedpath|overview_polyline/i },
  { key: "place_id", re: /place_?id|placeid/i },
  { key: "route_payload", re: /route_?response|raw_?payload|legs"\s*:|steps"\s*:/i },
  { key: "graph_viewer_key", re: /graphviewerkey/i },
];

const concat = <T,>(xs: ReadonlyArray<T>, x: T): T[] => xs.concat([x]);

/** scope 完備性（欠落は unusable）。空 = 適合。 */
export function durationConfirmationScopeViolations(scope: DurationConfirmationScopeV0): string[] {
  let out: string[] = [];
  const req = (v: string | null | undefined, code: string) => {
    out = v === null || v === undefined || String(v).trim().length === 0 ? concat(out, code) : out;
  };
  req(scope.targetNodeId, "scope_target_node_missing");
  req(scope.originRef, "scope_origin_ref_missing");
  req(scope.destinationRef, "scope_destination_ref_missing");
  req(scope.subjectiveDate, "scope_subjective_date_missing");
  req(scope.temporalScopeRef, "scope_temporal_scope_ref_missing");
  req(scope.providerVersion, "scope_provider_version_missing");
  if (scope.transportMode === undefined) out = concat(out, "scope_transport_mode_missing");
  return [...out];
}

/** learning_eligible governance（CHECK の TS 鏡像）。空 = 適合。 */
export function durationConfirmationLearningEligibleViolations(row: DurationConfirmationRowV0): string[] {
  const g = row.governance;
  let out: string[] = [];
  // learning_eligible=true は general_user_confirmed ∧ production ∧ user のみ。
  if (g.learningEligible && !(g.provenanceKind === "general_user_confirmed" && g.environment === "production" && g.actorType === "user")) {
    out = concat(out, "learning_eligible_requires_general_user_confirmed_production_user");
  }
  // general_user_confirmed ⟹ user ∧ production。
  if (g.provenanceKind === "general_user_confirmed" && !(g.actorType === "user" && g.environment === "production")) {
    out = concat(out, "general_user_confirmed_requires_user_production");
  }
  // operator は dogfood/staging のみ。
  if (g.actorType === "operator" && !(g.environment === "dogfood" || g.environment === "staging")) {
    out = concat(out, "operator_requires_dogfood_or_staging");
  }
  // seed 系は production に置かない。
  if ((g.provenanceKind === "operator_seed" || g.provenanceKind === "dogfood_seed" || g.provenanceKind === "staging_seed") && g.environment === "production") {
    out = concat(out, "seed_must_not_be_production");
  }
  return [...out];
}

/** raw leak（opaque 化されているべき値に raw が混入していないか）。空 = 適合。raw を echo しない（key のみ報告）。 */
export function durationConfirmationLeakViolations(row: DurationConfirmationRowV0): string[] {
  // governance / scope の文字列値を走査（数値 bound は除外）。
  const scan: string[] = [
    row.scope.originRef,
    row.scope.destinationRef,
    row.scope.temporalScopeRef,
    row.scope.routeEtaSupplyId ?? "",
    row.scope.providerVersion,
    row.scope.timeBand ?? "",
    row.sourceAnchorRef ?? "",
    row.governance.confirmedBy,
    row.governance.createdBySlice,
    ...row.governance.sourceRefs,
    ...row.governance.evidenceRefs,
  ];
  const hay = scan.join("\n");
  let out: string[] = [];
  for (const p of RAW_LEAK_PATTERNS) if (p.re.test(hay)) out = concat(out, `raw_leak:${p.key}`);
  return [...out];
}

/** 構造 violation（bounds / basis / scope / learning / leak を統合）。空 = 適合（=usable 候補）。 */
export function durationConfirmationViolations(row: DurationConfirmationRowV0): string[] {
  let out: string[] = [];
  const upper = row.durationUpperBoundMinutes;
  const lower = row.durationLowerBoundMinutes;
  // duration bounds
  if (!Number.isInteger(upper)) out = concat(out, "upper_not_integer");
  if (Number.isInteger(upper) && upper <= 0) out = concat(out, "upper_not_positive");
  if (Number.isInteger(upper) && upper % 5 !== 0) out = concat(out, "upper_not_multiple_of_5");
  if (Number.isInteger(upper) && upper > DURATION_CONFIRMATION_MAX_MINUTES) out = concat(out, "upper_exceeds_max");
  if (lower !== null) {
    if (!Number.isInteger(lower)) out = concat(out, "lower_not_integer");
    if (Number.isInteger(lower) && lower < 0) out = concat(out, "lower_negative");
    if (Number.isInteger(lower) && Number.isInteger(upper) && lower > upper) out = concat(out, "lower_exceeds_upper");
  }
  // basis（heuristic/none 不可）
  if (PROJECTION_BASES.indexOf(row.durationBasis) < 0) out = concat(out, "basis_not_projection_grade");
  // scope / learning / leak を合流
  out = out.concat(durationConfirmationScopeViolations(row.scope));
  out = out.concat(durationConfirmationLearningEligibleViolations(row));
  out = out.concat(durationConfirmationLeakViolations(row));
  return [...out];
}
