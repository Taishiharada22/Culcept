/**
 * operatorRealityReadiness — RD3b-P1（2026-06-15）: operator real-data preview の **supply readiness 集計**（pure・read-only）
 *
 * 正本設計: docs/reality-mobility-supply-activation-rd3-0.md / CEO RD3b-P1 実装 GO
 *
 * 思想（real leaveBy を作らない・gap だけを safe DTO で見る）:
 *   operator real-data で leaveBy 計算に進めない理由を **safe generic コードと数値カウントだけ**で可視化する。
 *   raw anchor（title / locationText / sourceId / externalUid / companions / exact instant / evidenceRefs）を**一切 client に渡さない**。
 *   real-data unavailable 時に fixture へ fallback しない（fail-closed・正直）。
 *
 * 不変条件:
 *   - **read-only**: ExternalAnchor の field を読むのみ。compute / route provider / external API / currentLocation を呼ばない。
 *   - **集計のみ**: 数値（all/eligible/has-place/has-prev-origin など）と safe generic blocker code のみを返す。
 *   - **v0 の正直な値**: production で provider 未注入ゆえ routeEtaCapability/durationValue/supply complete/computedPresent は今日 **常に 0**。
 *   - **placeCertainty 常 unknown**（v0 / compileEventRealityNodes:94-97）ゆえ placeResolutionReadyCount は今日 **常に 0**。
 *   - blocker code は **依存の浅い方から並べる**（root cause を最初に・provider_not_connected が今日の根本）。
 */
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

export const OPERATOR_REALITY_READINESS_VERSION = 0;

/** safe generic blocker code（raw 値 / 予定名 / 場所名を含まない）。 */
export type OperatorRealityReadinessBlockerCodeV0 =
  | "place_unresolved"
  | "origin_unresolved"
  | "route_eta_missing"
  | "duration_value_missing"
  | "arrival_target_missing"
  | "buffer_missing"
  | "capability_value_binding_missing"
  | "provider_not_connected"
  | "not_projection_grade";

/** operator real-data の supply readiness 集計 DTO（safe・client へ渡してよい）。 */
export interface OperatorRealityReadinessSummaryV0 {
  readonly schemaVersion: 0;
  /** listAnchors に到達し readiness 集計を実行したか（false = 直前で fail → 集計を信用しない）。 */
  readonly realReadinessChecked: boolean;
  readonly anchorCount: number;
  readonly candidateEventCount: number;
  readonly placeTextPresentCount: number;
  /** v0 = 0（placeCertainty 常 unknown）。 */
  readonly placeResolutionReadyCount: number;
  /** previous_event_end origin を導出可能な anchor 数（同日内に時間的に前のイベントが存在する anchor）。 */
  readonly originCandidateCount: number;
  /** v0 = 0（resolveRouteEtaCapability の production caller ゼロ）。 */
  readonly routeEtaCapabilityReadyCount: number;
  readonly durationValueReadyCount: number;
  readonly leaveBySupplyCompleteCount: number;
  readonly leaveByComputedPresentCount: number;
  readonly primaryBlockerCodes: ReadonlyArray<OperatorRealityReadinessBlockerCodeV0>;
}

/** unavailable-before-dayAnchors（listAnchors throw 等）で使う初期値。 */
export const OPERATOR_REALITY_READINESS_INITIAL: OperatorRealityReadinessSummaryV0 = {
  schemaVersion: 0,
  realReadinessChecked: false,
  anchorCount: 0,
  candidateEventCount: 0,
  placeTextPresentCount: 0,
  placeResolutionReadyCount: 0,
  originCandidateCount: 0,
  routeEtaCapabilityReadyCount: 0,
  durationValueReadyCount: 0,
  leaveBySupplyCompleteCount: 0,
  leaveByComputedPresentCount: 0,
  // 今日の根本原因。real readiness 未到達でも provider 不在は普遍。
  primaryBlockerCodes: ["provider_not_connected"],
};

/** anchor が同日 dayAnchors 内に「時間的に前のイベント」を持つか（previous_event_end origin 導出可能の最小条件）。 */
function hasEarlierSiblingByStartTime(target: ExternalAnchor, dayAnchors: ReadonlyArray<ExternalAnchor>): boolean {
  for (const a of dayAnchors) {
    if (a === target) continue;
    if (a.startTime && target.startTime && a.startTime < target.startTime) return true;
  }
  return false;
}

/**
 * buildOperatorRealityReadiness — pure 集計。
 * - `allAnchorCount` は listAnchors() の返却数（dayAnchors と別軸：anchor は存在するか）。
 * - `dayAnchors` は当日 graph に入る anchor（oneOff 当日 + recurring 当日展開済）。
 * - 数値と safe generic code のみ返す。raw 値（title / locationText / id 等）は**何も埋め込まない**。
 */
export function buildOperatorRealityReadiness(input: {
  readonly allAnchorCount: number;
  readonly dayAnchors: ReadonlyArray<ExternalAnchor>;
}): OperatorRealityReadinessSummaryV0 {
  const day = input.dayAnchors;
  const candidateEventCount = day.length;
  const placeTextPresentCount = day.filter((a) => typeof a.locationText === "string" && a.locationText.trim().length > 0).length;
  // v0: placeCertainty は compileEventRealityNodes で常 unknown（RD3-0 F4）。
  const placeResolutionReadyCount = 0;
  const originCandidateCount = day.filter((a) => hasEarlierSiblingByStartTime(a, day)).length;
  // v0: 全 0（provider 未注入・F1）。
  const routeEtaCapabilityReadyCount = 0;
  const durationValueReadyCount = 0;
  const leaveBySupplyCompleteCount = 0;
  const leaveByComputedPresentCount = 0;

  // 依存の浅い順に並べる（root cause を最初に）。条件付き要素は spread で literal 構築（mutation 不使用）。
  const codes: ReadonlyArray<OperatorRealityReadinessBlockerCodeV0> = [
    "provider_not_connected",
    "capability_value_binding_missing",
    "route_eta_missing",
    "duration_value_missing",
    ...(candidateEventCount > placeTextPresentCount ? (["place_unresolved"] as const) : ([] as const)),
    ...(candidateEventCount > originCandidateCount ? (["origin_unresolved"] as const) : ([] as const)),
  ];

  return {
    schemaVersion: 0,
    realReadinessChecked: true,
    anchorCount: input.allAnchorCount,
    candidateEventCount,
    placeTextPresentCount,
    placeResolutionReadyCount,
    originCandidateCount,
    routeEtaCapabilityReadyCount,
    durationValueReadyCount,
    leaveBySupplyCompleteCount,
    leaveByComputedPresentCount,
    primaryBlockerCodes: codes,
  };
}
