/**
 * durationConfirmationAdapter — RD3c-P2b（2026-06-16）: duration_confirmations 行を安全に読む read adapter（pure・no write）
 *
 * 正本設計: docs/reality-duration-confirmation-storage-rd3-c-p2-p3-0.md §7
 *
 * 思想（row を鵜呑みにしない・既存 RD2d-b/RD2e pipeline 再利用）:
 *   confirmation row → RouteEtaProviderResult（providerKind='user_manual'・basis=row.basis）→ resolveRouteEtaCapability
 *   → {capability, durationValue}。**provenance（learning/actor/environment）は value に流さない**（value は basis のみ）。
 *   scope mismatch / stale / revoked / malformed は **unusable（null）**（fail-closed）。**DB を読みに行かない pure adapter**
 *   （rows は caller が owner-RLS / operator policy で取得済を渡す）。
 *
 * 不変条件:
 *   - operator_seed は value 化できても learningEligible は false のまま（value は governance を持たない＝混入不能）。
 *   - production user path は general_user_confirmed × production × eligible のみ usable（caller の query filter + 本 adapter）。
 *   - raw（座標 / polyline / route payload）を作らない・echo しない。
 */
import {
  resolveRouteEtaCapability,
  type RouteEtaAdapterInputV0,
  type RouteEtaProviderResultV0,
} from "./routeEtaProviderAdapter";
import type { RouteEtaCapabilityV0, TransportModeV0, ConditionModelStatusV0 } from "./routeEtaCapability";
import type { PlanningGradeDurationValueV0 } from "./routeEtaDurationValue";
import {
  durationConfirmationViolations,
  type DurationConfirmationRowV0,
  type DurationConfirmationScopeV0,
} from "./durationConfirmation";

export const DURATION_CONFIRMATION_ADAPTER_VERSION = 0;
const PROVIDER_VERSION_PREFIX = "duration-confirmation-v0";

/** user_confirmed duration は mode の condition を本人が織り込み済とみなす（DAG conditionAdequateForMode に整合）。 */
function conditionStatusForMode(mode: TransportModeV0): ConditionModelStatusV0 | null {
  switch (mode) {
    case "car":
      return "traffic_aware";
    case "transit":
      return "schedule_aware";
    case "walk":
    case "bike":
      return "static_assumption";
    default:
      return null; // unknown → unusable（DAG が落とす）
  }
}

/** 要求 scope（caller が leaveBy を計算したい scope）。 */
export interface DurationConfirmationRequestScopeV0 {
  readonly targetNodeId: string;
  readonly subjectiveDate: string;
  readonly transportMode: TransportModeV0;
  readonly temporalScopeRef: string;
}

function scopeMatches(scope: DurationConfirmationScopeV0, req: DurationConfirmationRequestScopeV0): boolean {
  return (
    scope.targetNodeId === req.targetNodeId &&
    scope.subjectiveDate === req.subjectiveDate &&
    scope.transportMode === req.transportMode &&
    scope.temporalScopeRef === req.temporalScopeRef
  );
}

/** stale / revoked / expired / valid_until 経過なら unusable。nowIso は caller が渡す（pure・new Date 不使用）。 */
function isFreshEnough(row: DurationConfirmationRowV0, nowIso: string | null): boolean {
  if (row.revokedAt !== null) return false;
  if (row.supersededBy !== null) return false;
  if (row.freshnessStatus === "stale" || row.freshnessStatus === "expired") return false;
  if (row.validUntil !== null && nowIso !== null && nowIso > row.validUntil) return false;
  return true;
}

/**
 * selectUsableDurationConfirmation — rows から要求 scope に usable な 1 行を選ぶ（pure・no DB read）。
 * violation あり / scope mismatch / stale / revoked / superseded は除外。複数該当なら confirmedAt 最新。
 * 該当なし → null（fail-closed）。
 */
export function selectUsableDurationConfirmation(
  rows: ReadonlyArray<DurationConfirmationRowV0>,
  req: DurationConfirmationRequestScopeV0,
  nowIso: string | null,
): DurationConfirmationRowV0 | null {
  const usable = rows
    .filter((r) => durationConfirmationViolations(r).length === 0)
    .filter((r) => scopeMatches(r.scope, req))
    .filter((r) => isFreshEnough(r, nowIso))
    .filter((r) => conditionStatusForMode(r.scope.transportMode) !== null);
  if (usable.length === 0) return null;
  return usable.reduce((best, r) => (r.governance.confirmedAt > best.governance.confirmedAt ? r : best));
}

/** row → RouteEtaProviderResult（providerKind='user_manual'・raw 不保持・route shape なし）。 */
export function toRouteEtaProviderResultFromConfirmation(row: DurationConfirmationRowV0): RouteEtaProviderResultV0 | null {
  const condition = conditionStatusForMode(row.scope.transportMode);
  if (condition === null) return null;
  return {
    status: "ok",
    providerKind: "user_manual",
    providerVersion: `${PROVIDER_VERSION_PREFIX}:${row.scope.providerVersion}`,
    durationBasis: row.durationBasis,
    durationSignalPresent: true,
    durationScopeBounded: true,
    routeShapePresent: false, // route shape / polyline を持たない
    routeOptionPresent: false,
    conditionModelStatus: condition,
    opaqueRouteRef: null, // raw route なし
    freshnessStatus: "fresh",
    freshnessBasisRef: row.validUntil ?? `confirmed:${row.governance.confirmedAt}`, // opaque freshness 根拠
    durationMinutesRaw: row.durationUpperBoundMinutes, // 既に 5 分 ceil 済（pre-ceil raw なし）
    durationLowerMinutesRaw: row.durationLowerBoundMinutes,
  };
}

/** row → RouteEtaAdapterInput（opaque ref のみ・raw 座標不可）。 */
export function toRouteEtaAdapterInputFromConfirmation(row: DurationConfirmationRowV0): RouteEtaAdapterInputV0 {
  const s = row.scope;
  return {
    originRef: { opaqueRef: s.originRef },
    destinationRef: { opaqueRef: s.destinationRef },
    targetNodeId: s.targetNodeId,
    subjectiveDate: s.subjectiveDate,
    transportMode: s.transportMode,
    temporalScopeRef: s.temporalScopeRef,
    routeOptionsRef: null,
    routeInputRevision: `dc:${row.id}`,
    temporal: { departureTimeScoped: true, arrivalTargetScoped: true, timeBandScoped: s.timeBand !== null, evaluatedAtKnown: true, temporalFreshnessEvaluated: true },
    originUsableForLeaveBy: true,
    bufferKnown: true,
    originConflict: { originConflictStatus: "none", originDiscrepancyRefs: [], userConfirmedOriginPresent: false, currentObservationOverrodeConfirmed: false },
    pairPrivacyParts: { originEndpointSensitive: false, destinationEndpointSensitive: false, currentObservationInvolved: false, homeWorkDerivedInvolved: false },
    subjectNodeId: s.targetNodeId,
  };
}

/**
 * buildDurationValueFromConfirmation — row → {capability, durationValue}（既存 resolveRouteEtaCapability 再利用・二鍵）。
 * violation あり / provider result 不能 / durationValue null は **null**（unusable・fail-closed）。
 * **provenance は value に流さない**（value は basis のみ・operator_seed でも learningEligible は storage 層に留まる）。
 */
export async function buildDurationValueFromConfirmation(
  row: DurationConfirmationRowV0,
): Promise<{ capability: RouteEtaCapabilityV0; durationValue: PlanningGradeDurationValueV0 } | null> {
  if (durationConfirmationViolations(row).length > 0) return null;
  const result = toRouteEtaProviderResultFromConfirmation(row);
  if (result === null) return null;
  const input = toRouteEtaAdapterInputFromConfirmation(row);
  const out = await resolveRouteEtaCapability(input, { provider: async () => result });
  if (out.capability === null || out.durationValue === null) return null;
  return { capability: out.capability, durationValue: out.durationValue };
}
