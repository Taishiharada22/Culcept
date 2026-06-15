/**
 * dogfoodSyntheticSupply — RD3a-P1（2026-06-15）: dogfood fixture preview 専用の **決定論的 synthetic supply**（dev-only）
 *
 * 正本設計: docs/reality-mobility-supply-activation-rd3-0.md（§1/§2）/ CEO RD3a-P1 実装 GO
 *
 * 思想（gate を一切跨がず full chain を non-empty で通す）:
 *   route ETA provider が production 未配線（resolveRouteEtaCapability の caller ゼロ）ゆえ、dev-only fixture で
 *   **決定論的 synthetic provider** を注入し、RouteEtaCapability → PlanningGradeDurationValue → RD2e-SUPPLY →
 *   computeLeaveBy までを実際に通して **computed leaveBy** を 1 つ作る。これにより P1/P2 の「empty で no-op」の次＝
 *   **「non-empty でも computed が consumer に漏れない」を実負荷で証明**する土台を与える。
 *
 * 安全制約（synthetic provider が守ること）:
 *   - raw coordinates / route shape / polyline を持たない（routeShapePresent=false・opaqueRouteRef=null）。
 *   - external route API を呼ばない・external 風に見せない（providerKind='transit_schedule'・providerVersion で synthetic 明示）。
 *   - currentLocation / geolocation を使わない。durationValue は internal-only（minutes・pre-ceil raw を保持しない）。
 *   - basis='scheduled'（projection-grade allowlist）・mode='transit'・conditionModelStatus='schedule_aware'（DAG 整合）。
 *   - production では使わない（呼び元が default-OFF flag で gate）。real data へ fallback しない（純 fixture）。
 *   - 出力 leaveBy は internal-only（exact instant は呼び元が consumer に出さない）。
 */
import {
  resolveRouteEtaCapability,
  type RouteEtaAdapterInputV0,
  type RouteEtaProvider,
  type RouteEtaProviderResultV0,
} from "./routeEtaProviderAdapter";
import {
  supplyAndResolveLeaveBy,
  type LeaveBySupplyInputV0,
  type LeaveBySupplyScopeV0,
} from "./leaveBySupply";
import type { LeaveBySupplyCandidateV0 } from "./leaveByAssembly";

export const DOGFOOD_SYNTHETIC_SUPPLY_VERSION = 0;

/** synthetic provider version（fixture を明示・real provider と区別） */
const SYNTHETIC_PROVIDER_VERSION = "dogfood-synthetic-v0";
const SYNTHETIC_TRANSPORT_MODE = "transit" as const;
/** projection-grade allowlist（scheduled）・mode=transit と整合する fixture duration（分・例示の内部値） */
const SYNTHETIC_DURATION_MINUTES = 20;

/** 決定論的 synthetic provider result（scheduled/transit・route shape なし・external 風でない） */
function syntheticProviderResult(): RouteEtaProviderResultV0 {
  return {
    status: "ok",
    providerKind: "transit_schedule",
    providerVersion: SYNTHETIC_PROVIDER_VERSION,
    durationBasis: "scheduled",
    durationSignalPresent: true,
    durationScopeBounded: true,
    routeShapePresent: false, // route shape / polyline を持たない
    routeOptionPresent: false,
    conditionModelStatus: "schedule_aware", // transit に対し DAG adequate
    opaqueRouteRef: null, // raw route なし
    freshnessStatus: "fresh",
    freshnessBasisRef: "dogfood-synthetic-schedule-fresh", // self-claim でない freshness 根拠（opaque）
    durationMinutesRaw: SYNTHETIC_DURATION_MINUTES,
  };
}
const syntheticProvider: RouteEtaProvider = async () => syntheticProviderResult();

function routeInput(eventRealityNodeId: string, subjectiveDate: string, temporalScopeRef: string): RouteEtaAdapterInputV0 {
  return {
    originRef: { opaqueRef: `dogfood-o:${eventRealityNodeId}` },
    destinationRef: { opaqueRef: `dogfood-d:${eventRealityNodeId}` },
    targetNodeId: eventRealityNodeId,
    subjectiveDate,
    transportMode: SYNTHETIC_TRANSPORT_MODE,
    temporalScopeRef,
    routeOptionsRef: null,
    routeInputRevision: "dogfood-r1",
    temporal: { departureTimeScoped: true, arrivalTargetScoped: true, timeBandScoped: true, evaluatedAtKnown: true, temporalFreshnessEvaluated: true },
    originUsableForLeaveBy: true,
    bufferKnown: true,
    originConflict: { originConflictStatus: "none", originDiscrepancyRefs: [], userConfirmedOriginPresent: false, currentObservationOverrodeConfirmed: false },
    pairPrivacyParts: { originEndpointSensitive: false, destinationEndpointSensitive: false, currentObservationInvolved: false, homeWorkDerivedInvolved: false },
    subjectNodeId: eventRealityNodeId,
  };
}

function supplyInput(
  eventRealityNodeId: string,
  subjectiveDate: string,
  scope: LeaveBySupplyScopeV0,
  capability: LeaveBySupplyInputV0["capability"],
  durationValue: LeaveBySupplyInputV0["durationValue"],
  arrivalHHMM: string,
  evaluatedAtIso: string,
): LeaveBySupplyInputV0 {
  return {
    subjectNodeId: eventRealityNodeId,
    capability,
    durationValue,
    evaluatedAt: evaluatedAtIso,
    computedAt: evaluatedAtIso,
    scope,
    arrival: {
      arrivalTargetInstant: `${subjectiveDate}T${arrivalHHMM}:00+09:00`,
      arrivalTargetRef: `dogfood-arr:${eventRealityNodeId}`,
      targetEventDate: subjectiveDate,
      startTimeSource: "user_explicit",
      sourceRefs: [`dogfood-src-a:${eventRealityNodeId}`],
      evidenceRefs: [`dogfood-ev-a:${eventRealityNodeId}`],
    },
    buffer: {
      bufferPolicyId: `dogfood-buf:${eventRealityNodeId}`,
      bufferScopeRef: `dogfood-bscope:${eventRealityNodeId}`,
      rigidity: "hard",
      highCommitment: false,
      freshness: "valid",
      sourceRefs: [`dogfood-src-b:${eventRealityNodeId}`],
      evidenceRefs: [`dogfood-ev-b:${eventRealityNodeId}`],
    },
    origin: {
      originInferenceStage: "previous_event_end",
      dayGraphDate: subjectiveDate,
      dayGraphSnapshotId: `dogfood-snap:${eventRealityNodeId}`,
      previousEvent: {
        nodeId: `dogfood-prev:${eventRealityNodeId}`,
        endTimeHHMM: "09:00",
        durationSource: "explicit",
        boundaryClipped: false,
        locationText: "office",
        sensitive: false,
        startTimeSource: "user_explicit",
        anchorRef: `dogfood-anchor-prev:${eventRealityNodeId}`,
      },
    },
  };
}

/**
 * buildDogfoodSyntheticSupplyCandidate — synthetic provider で full chain を通し、computed leaveBy 候補を 1 つ作る（dev-only）。
 * resolveRouteEtaCapability(async) → durationValue → supplyAndResolveLeaveBy → computed。
 * 不適格（durationValue null / computed でない）なら **null**（呼び元は no-op 維持）。
 * 返す scope は呼び元が ernScopeByNodeId 構築に使う（attach 時の scope 整合）。
 */
export async function buildDogfoodSyntheticSupplyCandidate(params: {
  readonly eventRealityNodeId: string;
  readonly subjectiveDate: string;
  readonly arrivalHHMM: string;
  readonly evaluatedAtIso: string;
}): Promise<{ candidate: LeaveBySupplyCandidateV0; scope: LeaveBySupplyScopeV0 } | null> {
  const temporalScopeRef = `dogfood-tsr:${params.eventRealityNodeId}`;
  const scope: LeaveBySupplyScopeV0 = {
    targetNodeId: params.eventRealityNodeId,
    subjectiveDate: params.subjectiveDate,
    transportMode: SYNTHETIC_TRANSPORT_MODE,
    temporalScopeRef,
  };
  const out = await resolveRouteEtaCapability(routeInput(params.eventRealityNodeId, params.subjectiveDate, temporalScopeRef), {
    provider: syntheticProvider,
  });
  if (out.durationValue === null || out.capability === null) return null;
  const { leaveBy } = supplyAndResolveLeaveBy(
    supplyInput(params.eventRealityNodeId, params.subjectiveDate, scope, out.capability, out.durationValue, params.arrivalHHMM, params.evaluatedAtIso),
  );
  if (leaveBy.status !== "computed") return null;
  return { candidate: { eventRealityNodeId: params.eventRealityNodeId, leaveBy, computedScope: scope }, scope };
}
