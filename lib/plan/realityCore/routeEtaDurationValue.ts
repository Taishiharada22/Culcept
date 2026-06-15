/**
 * routeEtaDurationValue — RD2d-b-VALUE: leaveBy 計算用の internal-only duration value channel（pure）
 *
 * 設計正本: docs/reality-route-eta-duration-value-rd2d-b-value-0.md
 *
 * 核心 — 「二鍵」設計:
 *   - capability（routeEtaCapability.ts）= flag-only・consumer-safe（minutes を持たない）
 *   - value（本ファイル）= server/internal-only の **計算燃料**（minutes・consumer 非露出）
 *   どちらも単独では leaveBy を authorize しない。両者が **full binding basis** で結ばれ、かつ
 *   bind 先 capability の timeEstimateUsableForPlanning が true のときだけ leaveBy 計算に使える。
 *
 * 不変条件:
 *   - value は capability に nest しない（adapter は sibling return `{capability, durationValue}`）。
 *   - value は consumer payload 前提ではない（displayPolicy = internalServerOnly 固定）。
 *   - stored duration は **rounded safe upper bound**（integer・>=0・%5===0）。
 *     pre-ceil raw / exact provider seconds / provider raw payload は **保持しない**。
 *   - average 禁止（point は upper bound として ceil・round しない）。
 *   - allowed basis のみ（external_route/cached_route/scheduled/user_confirmed）。heuristic/none/stale 等は value なし or unusable。
 *   - capabilityIdentityRef は **短縮 key**（内容証明ではない）。binding は **full basis** を持ち、RD2e-b で full 照合する。
 *   - leak guard は shared routeEtaSafety を使う（raw coordinate/polyline/placeId/provider payload を value に載せない）。
 *
 * 本ファイルは leaveBy 計算を **しない**（instant 生成 / arrival 減算 / buffer 合成 / departure line / notification / RC2a 接続なし）。
 */

import type {
  RouteEtaCapabilityV0,
  RouteEtaIdentityBasisV0,
  TransportModeV0,
  RouteEtaFreshnessStatusV0,
} from "./routeEtaCapability";
import { ROUTE_ETA_CAPABILITY_VERSION } from "./routeEtaCapability";
import type { RouteEtaProviderResultV0 } from "./routeEtaProviderAdapter";
import { containsRawLocation, redactRouteEtaUnsafeValue } from "./routeEtaSafety";

export const ROUTE_ETA_DURATION_VALUE_VERSION = 0;

// ── 列挙（fail-closed allowlist） ─────────────────────────────────────────────────────────────

/** provider が示す duration の形 */
export type DurationValueKind = "point" | "range" | "upper_bound" | "scheduled" | "user_confirmed";

/** projection-grade basis のみ（heuristic/none/unknown/stale/static は構築不可・型で排除） */
export type DurationValueBasis = "external_route" | "cached_route" | "scheduled" | "user_confirmed";

export const DURATION_VALUE_ALLOWED_BASES: ReadonlyArray<DurationValueBasis> = [
  "external_route",
  "cached_route",
  "scheduled",
  "user_confirmed",
];

export function isAllowedDurationValueBasis(b: string): b is DurationValueBasis {
  return DURATION_VALUE_ALLOWED_BASES.indexOf(b as DurationValueBasis) >= 0;
}

/** value は常に server/internal-only。consumer payload に出さない */
export type DurationValueDisplayPolicy = "internalServerOnly";

export type DurationValueConversionRule = "provider_minutes" | "schedule_span_minutes" | "user_stated_minutes";
export type DurationValueCeilRule = "ceil_to_5min" | "already_5min_multiple";
export type DurationValuePointTreatment =
  | "point_as_upper_bound"
  | "range_upper_bound"
  | "scheduled_gap_as_upper_bound"
  | "user_stated_as_upper_bound";
/** value を作るのは常に adapter（provider ではない・provider raw は捨てる） */
export type DurationValueCreatedBy = "adapter";

// ── 構造 ─────────────────────────────────────────────────────────────────────────────────────

export interface DurationValueScopeV0 {
  readonly scopeBounded: boolean;
  readonly originRef: string | null; // opaque（raw 座標不可）
  readonly destinationRef: string | null; // opaque
  readonly temporalScopeRef: string | null;
  readonly transportMode: TransportModeV0;
}

export interface DurationValueFreshnessV0 {
  readonly freshnessStatus: RouteEtaFreshnessStatusV0 | "unknown";
  readonly freshnessRef: string | null; // fetchedAt 相当の opaque ref
  readonly validUntilRef: string | null;
}

export interface DurationValueEvidenceRef {
  readonly code: string;
  readonly capability: "duration";
  readonly source: DurationValueBasis;
}

/**
 * full binding basis — capabilityIdentityRef（短縮 key）だけでは内容同一性を証明できないため、
 * binding は capability identity / supply / provider / freshness / scope / evidence の **全要素**を持つ。
 * RD2e-b は hash（短縮 key）照合 + この full basis 整合の **両方**を確認する。
 */
export interface DurationValueBindingToCapabilityV0 {
  readonly capabilitySchemaVersion: number;
  readonly capabilityDerivationVersion: number;
  readonly capabilityIdentityRef: string; // 短縮 key（collidable・内容証明でない）
  readonly routeEtaSupplyId: string;
  readonly originRef: string | null;
  readonly destinationRef: string | null;
  readonly targetNodeId: string | null;
  readonly subjectiveDate: string | null;
  readonly transportMode: TransportModeV0;
  readonly temporalScopeRef: string | null;
  readonly providerKind: string;
  readonly providerVersion: string;
  readonly freshnessRef: string | null;
  readonly scopeRef: string | null;
  readonly sourceRefs: ReadonlyArray<string>;
  readonly evidenceRefs: ReadonlyArray<string>;
}

export interface PlanningGradeDurationValueV0 {
  readonly schemaVersion: 0;
  readonly kind: DurationValueKind;
  readonly basis: DurationValueBasis;
  /** rounded safe upper bound（integer・>=0・%5===0）。pre-ceil raw は保持しない */
  readonly durationUpperBoundMinutes: number;
  readonly durationLowerBoundMinutes: number | null; // integer・<= upper（任意）
  readonly unit: "minutes";
  readonly scope: DurationValueScopeV0;
  readonly freshness: DurationValueFreshnessV0;
  readonly binding: DurationValueBindingToCapabilityV0;
  readonly evidenceRefs: ReadonlyArray<DurationValueEvidenceRef>;
  readonly displayPolicy: DurationValueDisplayPolicy;
  readonly provenance: {
    readonly conversionRule: DurationValueConversionRule;
    readonly ceilRule: DurationValueCeilRule;
    readonly pointTreatment: DurationValuePointTreatment;
    readonly valueCreatedBy: DurationValueCreatedBy;
  };
  /**
   * value 自己 + bind 先 capability flag を写した「使用可」標。**RD2e-b はこれを鵜呑みにせず**
   * full basis 再照合 + capability.timeEstimateUsableForPlanning 再確認をしてから leaveBy に使う（二鍵）。
   */
  readonly usableForLeaveByComputation: boolean;
}

// ── pure helpers（Date/random/IO なし・Math.ceil/floor のみ） ─────────────────────────────────

const NULL = "∅";
const D = "::"; // coord-pair 区切り集合 [ ,;/|] に含まれない区切り（supplyId が座標 pair に誤検出されない）

function ceilTo5(x: number): number {
  return Math.ceil(x / 5) * 5;
}
function floorTo5(x: number): number {
  return Math.floor(x / 5) * 5;
}

/** 短縮 key（内容証明ではない・collidable）。full basis 照合の代替にしてはならない */
function shortIdentityKey(id: RouteEtaIdentityBasisV0): string {
  return [id.providerKind, id.providerVersion, id.targetNodeId ?? NULL, id.subjectiveDate ?? NULL, id.transportMode].join(D);
}

/** supply identity（full・opaque ref のみ） */
function supplyIdOf(id: RouteEtaIdentityBasisV0): string {
  return [
    id.originRef?.opaqueRef ?? NULL,
    id.destinationRef?.opaqueRef ?? NULL,
    id.targetNodeId ?? NULL,
    id.subjectiveDate ?? NULL,
    id.transportMode,
    id.temporalScopeRef ?? NULL,
    id.providerKind,
    id.providerVersion,
    id.routeOptionsRef ?? NULL,
    id.routeInputRevision ?? NULL,
  ].join(D);
}

function scopeRefOf(id: RouteEtaIdentityBasisV0): string {
  return [id.originRef?.opaqueRef ?? NULL, id.destinationRef?.opaqueRef ?? NULL, id.temporalScopeRef ?? NULL].join(D);
}

/** capability から full binding basis を導出（result を要しない・bind 再照合と同一ロジック） */
export function buildDurationValueBinding(capability: RouteEtaCapabilityV0): DurationValueBindingToCapabilityV0 {
  const id = capability.identity;
  const dur = capability.evidenceRefs.filter((e) => e.capability === "duration");
  return {
    capabilitySchemaVersion: capability.schemaVersion,
    capabilityDerivationVersion: ROUTE_ETA_CAPABILITY_VERSION,
    capabilityIdentityRef: shortIdentityKey(id),
    routeEtaSupplyId: supplyIdOf(id),
    originRef: id.originRef?.opaqueRef ?? null,
    destinationRef: id.destinationRef?.opaqueRef ?? null,
    targetNodeId: id.targetNodeId,
    subjectiveDate: id.subjectiveDate,
    transportMode: id.transportMode,
    temporalScopeRef: id.temporalScopeRef,
    providerKind: id.providerKind,
    providerVersion: id.providerVersion,
    freshnessRef: capability.freshness.fetchedAtRef,
    scopeRef: scopeRefOf(id),
    sourceRefs: dur.map((e) => String(e.source)),
    evidenceRefs: dur.map((e) => e.code),
  };
}

// ── value 構築 ───────────────────────────────────────────────────────────────────────────────

export interface DurationValueDraftV0 {
  readonly basis: DurationValueBasis;
  readonly kind: DurationValueKind;
  /** provider が示した生の上限分（fractional 可）。**value object には保持しない**（ceil 後のみ保持） */
  readonly rawUpperMinutes: number;
  readonly rawLowerMinutes: number | null;
  readonly scope: DurationValueScopeV0;
  readonly freshness: DurationValueFreshnessV0;
  readonly binding: DurationValueBindingToCapabilityV0;
  readonly evidenceRefs: ReadonlyArray<DurationValueEvidenceRef>;
  /** 二鍵の片方: bind 先 capability の timeEstimateUsableForPlanning */
  readonly capabilityPlanningUsable: boolean;
}

function pointTreatmentOf(kind: DurationValueKind): DurationValuePointTreatment {
  if (kind === "range") return "range_upper_bound";
  if (kind === "scheduled") return "scheduled_gap_as_upper_bound";
  if (kind === "user_confirmed") return "user_stated_as_upper_bound";
  return "point_as_upper_bound"; // point / upper_bound
}

function conversionRuleOf(basis: DurationValueBasis): DurationValueConversionRule {
  if (basis === "scheduled") return "schedule_span_minutes";
  if (basis === "user_confirmed") return "user_stated_minutes";
  return "provider_minutes";
}

function freshnessSubstantiated(f: DurationValueFreshnessV0): boolean {
  return f.freshnessStatus === "fresh" && f.freshnessRef !== null && f.freshnessRef.length > 0;
}

function buildDurationValue(d: DurationValueDraftV0, forceUnusable: boolean): PlanningGradeDurationValueV0 {
  // ceil → rounded safe upper bound（raw は捨てる）。point は round せず ceil（average を作らない）
  const upper = ceilTo5(d.rawUpperMinutes);
  const ceilRule: DurationValueCeilRule = upper === d.rawUpperMinutes ? "already_5min_multiple" : "ceil_to_5min";
  const lower = d.rawLowerMinutes === null ? null : floorTo5(d.rawLowerMinutes);

  const upperValid = Number.isInteger(upper) && upper >= 0 && upper % 5 === 0;
  const lowerValid = lower === null || (Number.isInteger(lower) && lower >= 0 && lower <= upper);

  const usable =
    !forceUnusable &&
    d.capabilityPlanningUsable && // 二鍵: bind 先 capability flag
    isAllowedDurationValueBasis(d.basis) &&
    freshnessSubstantiated(d.freshness) &&
    d.scope.scopeBounded &&
    upperValid &&
    lowerValid;

  return {
    schemaVersion: 0,
    kind: d.kind,
    basis: d.basis,
    durationUpperBoundMinutes: upper,
    durationLowerBoundMinutes: lower,
    unit: "minutes",
    scope: d.scope,
    freshness: d.freshness,
    binding: d.binding,
    evidenceRefs: d.evidenceRefs,
    displayPolicy: "internalServerOnly",
    provenance: {
      conversionRule: conversionRuleOf(d.basis),
      ceilRule,
      pointTreatment: pointTreatmentOf(d.kind),
      valueCreatedBy: "adapter",
    },
    usableForLeaveByComputation: usable,
  };
}

/** usable は内部条件（二鍵 + freshness/scope/basis/bounds）で決まる */
export function createPlanningGradeDurationValue(d: DurationValueDraftV0): PlanningGradeDurationValueV0 {
  return buildDurationValue(d, false);
}

/** 数値はあるが leaveBy に使えない value を明示生成（usable を強制 false） */
export function createUnusableDurationValue(d: DurationValueDraftV0): PlanningGradeDurationValueV0 {
  return buildDurationValue(d, true);
}

// ── provider result → value（adapter が呼ぶ・null = value channel なし） ─────────────────────

function toValueBasis(b: string): DurationValueBasis | null {
  if (b === "external_route") return "external_route";
  if (b === "cached_route") return "cached_route";
  if (b === "scheduled") return "scheduled";
  if (b === "user_confirmed") return "user_confirmed";
  return null; // heuristic / none / unknown → value なし
}

/**
 * deriveDurationValueFromProviderResult — provider result + 構築済 capability から value を導く。
 * raw payload は捨て numeric だけを validated value に昇格する（valueCreatedBy=adapter）。
 * null を返す条件: disallowed basis（heuristic/none）/ numeric 欠如・malformed / user_confirmed の evidence 欠如。
 * 非 null だが usable=false: capability planning false / stale / scope unbounded 等（数値はあるが leaveBy 不可）。
 */
export function deriveDurationValueFromProviderResult(
  result: RouteEtaProviderResultV0,
  capability: RouteEtaCapabilityV0,
): PlanningGradeDurationValueV0 | null {
  const basis = toValueBasis(result.durationBasis);
  if (basis === null) return null;

  const rawUpper = result.durationMinutesRaw ?? null;
  if (rawUpper === null || !Number.isFinite(rawUpper) || rawUpper < 0) return null; // numeric 欠如/malformed → value なし
  const rawLower = result.durationLowerMinutesRaw ?? null;
  if (rawLower !== null && (!Number.isFinite(rawLower) || rawLower < 0 || rawLower > rawUpper)) return null;

  const id = capability.identity;
  const evidenceRefs: DurationValueEvidenceRef[] = capability.evidenceRefs
    .filter((e) => e.capability === "duration")
    .map((e) => ({ code: e.code, capability: "duration" as const, source: basis }));
  if (basis === "user_confirmed" && evidenceRefs.length === 0) return null; // user_confirmed は evidence 必須

  const kind: DurationValueKind =
    basis === "scheduled" ? "scheduled" : basis === "user_confirmed" ? "user_confirmed" : rawLower !== null ? "range" : "point";

  const scope: DurationValueScopeV0 = {
    scopeBounded: capability.duration.durationScopeBounded,
    originRef: id.originRef?.opaqueRef ?? null,
    destinationRef: id.destinationRef?.opaqueRef ?? null,
    temporalScopeRef: id.temporalScopeRef,
    transportMode: id.transportMode,
  };
  const freshness: DurationValueFreshnessV0 = {
    freshnessStatus: capability.freshness.freshnessStatus,
    freshnessRef: capability.freshness.fetchedAtRef,
    validUntilRef: capability.freshness.validUntilRef,
  };

  return createPlanningGradeDurationValue({
    basis,
    kind,
    rawUpperMinutes: rawUpper,
    rawLowerMinutes: rawLower,
    scope,
    freshness,
    binding: buildDurationValueBinding(capability),
    evidenceRefs,
    capabilityPlanningUsable: capability.planning.timeEstimateUsableForPlanning,
  });
}

// ── 検証 ─────────────────────────────────────────────────────────────────────────────────────

/** durationValueViolations — value 自己整合（空 = 健全・message は raw を echo しない） */
export function durationValueViolations(v: PlanningGradeDurationValueV0): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };

  add(v.schemaVersion !== 0, "schemaVersion must be 0");
  add(v.unit !== "minutes", "unit must be minutes");
  add(v.displayPolicy !== "internalServerOnly", "displayPolicy must be internalServerOnly (server-only fuel)");
  add(v.provenance.valueCreatedBy !== "adapter", "valueCreatedBy must be adapter");
  add(!isAllowedDurationValueBasis(v.basis), `basis not in allowlist: ${redactRouteEtaUnsafeValue(String(v.basis))}`);

  // rounded safe upper bound（integer・>=0・%5===0）
  add(!Number.isInteger(v.durationUpperBoundMinutes), "durationUpperBoundMinutes must be integer");
  add(v.durationUpperBoundMinutes < 0, "durationUpperBoundMinutes must be >= 0");
  add(v.durationUpperBoundMinutes % 5 !== 0, "durationUpperBoundMinutes must be a 5-minute multiple");
  if (v.durationLowerBoundMinutes !== null) {
    add(!Number.isInteger(v.durationLowerBoundMinutes), "durationLowerBoundMinutes must be integer");
    add(v.durationLowerBoundMinutes < 0, "durationLowerBoundMinutes must be >= 0");
    add(v.durationLowerBoundMinutes > v.durationUpperBoundMinutes, "durationLowerBoundMinutes must be <= upper");
  }

  // user_confirmed は evidence 必須
  add(v.basis === "user_confirmed" && v.evidenceRefs.length === 0, "user_confirmed value requires evidenceRefs");

  // usable=true の自己整合（二鍵の value 側条件・bind 先 capability flag は output/bind で別途照合）
  if (v.usableForLeaveByComputation) {
    add(!freshnessSubstantiated(v.freshness), "usable value requires substantiated fresh freshness");
    add(!v.scope.scopeBounded, "usable value requires bounded scope");
    add(!isAllowedDurationValueBasis(v.basis), "usable value requires allowed basis");
  }

  // leak guard（value 全体に raw coordinate/polyline/placeId/provider payload を載せない・shared 最強検出）
  if (containsRawLocation(JSON.stringify(v).toLowerCase())) {
    out = out.concat(["duration value contains raw location (coordinate/encoding) — opaque refs only"]);
  }
  return out;
}

export interface DurationValueBindingResultV0 {
  readonly matched: boolean;
  readonly violations: ReadonlyArray<string>;
  /** 二鍵が揃ったか: value usable && full basis match && capability planning usable */
  readonly usableAfterBinding: boolean;
}

/**
 * bindDurationValueToCapability — value の binding を capability から再導出した full basis と照合（二鍵照合）。
 * **短縮 key（capabilityIdentityRef）一致だけでは bind 成立にしない**。full basis mismatch → unusable。
 * value 単体の usableForLeaveByComputation=true を信用せず、capability.timeEstimateUsableForPlanning を再確認する。
 */
export function bindDurationValueToCapability(
  value: PlanningGradeDurationValueV0,
  capability: RouteEtaCapabilityV0,
): DurationValueBindingResultV0 {
  const expected = buildDurationValueBinding(capability);
  const b = value.binding;
  let out: string[] = [];
  const mismatch = (cond: boolean, field: string): void => {
    out = cond ? out.concat([`binding mismatch: ${field}`]) : out; // field 名のみ・値を echo しない
  };

  const arrEq = (a: ReadonlyArray<string>, c: ReadonlyArray<string>): boolean =>
    a.length === c.length && a.every((x, i) => x === c[i]);

  mismatch(b.capabilitySchemaVersion !== expected.capabilitySchemaVersion, "capabilitySchemaVersion");
  mismatch(b.capabilityDerivationVersion !== expected.capabilityDerivationVersion, "capabilityDerivationVersion");
  mismatch(b.capabilityIdentityRef !== expected.capabilityIdentityRef, "capabilityIdentityRef");
  mismatch(b.routeEtaSupplyId !== expected.routeEtaSupplyId, "routeEtaSupplyId");
  mismatch(b.originRef !== expected.originRef, "originRef");
  mismatch(b.destinationRef !== expected.destinationRef, "destinationRef");
  mismatch(b.targetNodeId !== expected.targetNodeId, "targetNodeId");
  mismatch(b.subjectiveDate !== expected.subjectiveDate, "subjectiveDate");
  mismatch(b.transportMode !== expected.transportMode, "transportMode");
  mismatch(b.temporalScopeRef !== expected.temporalScopeRef, "temporalScopeRef");
  mismatch(b.providerKind !== expected.providerKind, "providerKind");
  mismatch(b.providerVersion !== expected.providerVersion, "providerVersion");
  mismatch(b.freshnessRef !== expected.freshnessRef, "freshnessRef");
  mismatch(b.scopeRef !== expected.scopeRef, "scopeRef");
  mismatch(!arrEq(b.sourceRefs, expected.sourceRefs), "sourceRefs");
  mismatch(!arrEq(b.evidenceRefs, expected.evidenceRefs), "evidenceRefs");

  const matched = out.length === 0;
  const usableAfterBinding =
    matched && value.usableForLeaveByComputation && capability.planning.timeEstimateUsableForPlanning;
  return { matched, violations: out, usableAfterBinding };
}
