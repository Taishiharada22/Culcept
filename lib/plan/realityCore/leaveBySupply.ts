/**
 * leaveBySupply — RD2e-SUPPLY（2026-06-15）: internal-only な LeaveBySupplyBundle を組む pure 層
 *
 * 設計書: docs/reality-leaveby-supply-boundary-rd2e-supply-0.md + …-0a.md / U1-minimal / U2-minimal / U1-EventNode propagation
 *
 * 思想: U1（EventNode.startTimeSource）+ U2（previous_event_end origin）+ buffer + 二鍵 duration を束ね、
 *   **complete な時だけ** RD2e-b `computeLeaveBy` を呼ぶ。RD2e-SUPPLY は user-facing でも departure line でも
 *   notification でもなく、RD2e-b へ渡す internal-only bundle を作るだけ。fail-closed（不明→missing→uncomputed）。
 *
 * 規律: UI/RC2a/MovementReality/departure line/currentLocation/外部送信/DB write なし。pure（IO/時刻/乱数なし）。
 *   buffer small は v0 で出さない。raw anchor/location/timezone/timestamp を consumer に出さない。
 */

import {
  computeLeaveBy,
  isCalendarValidMinuteJstIso,
  type ArrivalTargetForLeaveByV0,
  type BufferPolicyForLeaveByV0,
  type OriginTemporalValidityForLeaveByV0,
  type LeaveByAdapterInputV0,
} from "./leaveByAdapter";
import {
  createUncomputedLeaveBy,
  type LeaveByComputationV0,
  type LeaveByMissingInput,
  type LeaveByBufferBucket,
} from "./leaveByComputation";
import type { RouteEtaCapabilityV0, TransportModeV0 } from "./routeEtaCapability";
import type { PlanningGradeDurationValueV0 } from "./routeEtaDurationValue";
import {
  buildPreviousEventEndOriginValidity,
  type PreviousEventForOriginV0,
  type PreviousEventEndOriginSupplyInputV0,
} from "./leaveBySupplyOrigin";
import type { OriginInferenceStage } from "./originInference";
import type { StartTimeSource, AnchorRigidity } from "../external-anchor";
import { containsRawLocation } from "./routeEtaSafety";

export const LEAVEBY_SUPPLY_VERSION = 0;

export type LeaveBySupplyMissingInput =
  | "arrival_target_unavailable"
  | "buffer_unknown"
  | "origin_unavailable"
  | "duration_value_missing"
  | "scope_incomplete";

// ── 入力 ─────────────────────────────────────────────────────────────────────────────────────

/** scope 正本（5 fuel 共通） */
export interface LeaveBySupplyScopeV0 {
  readonly targetNodeId: string; // arrival node id
  readonly subjectiveDate: string;
  readonly transportMode: TransportModeV0;
  readonly temporalScopeRef: string | null;
}

export interface ArrivalEventSupplyV0 {
  readonly arrivalTargetInstant: string; // canonical JST（arrival EventNode date+startTime から materialize 済）
  readonly arrivalTargetRef: string;
  readonly targetEventDate: string;
  readonly startTimeSource: StartTimeSource; // U1 propagation: arrival EventNode.startTimeSource
  readonly sourceRefs: ReadonlyArray<string>;
  readonly evidenceRefs: ReadonlyArray<string>;
}

export interface BufferSignalSupplyV0 {
  readonly bufferPolicyId: string;
  readonly bufferScopeRef: string;
  readonly rigidity: AnchorRigidity; // hard / soft
  readonly highCommitment: boolean; // 予約・支払い・高コミット系
  readonly freshness: "valid" | "stale" | "unknown";
  readonly sourceRefs: ReadonlyArray<string>;
  readonly evidenceRefs: ReadonlyArray<string>;
}

export interface OriginSupplySubInputV0 {
  readonly originInferenceStage: OriginInferenceStage;
  readonly dayGraphDate: string;
  readonly dayGraphSnapshotId: string | null;
  readonly previousEvent: PreviousEventForOriginV0;
}

export interface LeaveBySupplyInputV0 {
  readonly subjectNodeId: string | null;
  readonly capability: RouteEtaCapabilityV0;
  readonly durationValue: PlanningGradeDurationValueV0 | null;
  readonly evaluatedAt: string; // canonical JST（caller 供給）
  readonly computedAt: string;
  readonly scope: LeaveBySupplyScopeV0;
  readonly arrival: ArrivalEventSupplyV0;
  readonly buffer: BufferSignalSupplyV0;
  /** previous event なし（chain 起点）なら null → origin unavailable */
  readonly origin: OriginSupplySubInputV0 | null;
}

// ── 出力 ─────────────────────────────────────────────────────────────────────────────────────

export interface LeaveBySupplyTrace {
  readonly arrivalFixedness: "fixed" | "tentative" | "movable" | "absent";
  /** v0 は "medium"|"large"|"unknown" のみ emit（型は full bucket だが small は出さない） */
  readonly bufferBucket: LeaveByBufferBucket | "unknown";
  readonly originValiditySupplied: boolean;
  readonly missingInputs: ReadonlyArray<LeaveBySupplyMissingInput>;
}

export interface LeaveBySupplyBundleV0 {
  readonly schemaVersion: 0;
  readonly subjectNodeId: string | null;
  readonly capability: RouteEtaCapabilityV0;
  readonly durationValue: PlanningGradeDurationValueV0 | null;
  readonly arrivalTarget: ArrivalTargetForLeaveByV0 | null;
  readonly bufferPolicy: BufferPolicyForLeaveByV0 | null;
  readonly originTemporalValidity: OriginTemporalValidityForLeaveByV0 | null;
  readonly evaluatedAt: string;
  readonly computedAt: string;
  readonly complete: boolean;
  readonly missingInputs: ReadonlyArray<LeaveBySupplyMissingInput>;
  readonly trace: LeaveBySupplyTrace;
}

export interface LeaveBySupplyResultV0 {
  readonly bundle: LeaveBySupplyBundleV0;
  readonly leaveBy: LeaveByComputationV0; // internal-only（computed or uncomputed）
}

// ── arrivalTarget supply（U1 startTimeSource → fixedness） ─────────────────────────────────────

function arrivalProvenanceFromStartSource(s: StartTimeSource): {
  fixedness: "fixed" | "tentative" | "movable";
  startTimeProvenance: "confirmed" | "inferred" | "default";
  confidence: "high" | "medium" | "low";
} {
  // user_explicit / imported_exact のみ fixed 候補（durationSource/sourceType/confirmedAt から再導出しない）
  if (s === "user_explicit" || s === "imported_exact") {
    return { fixedness: "fixed", startTimeProvenance: "confirmed", confidence: "high" };
  }
  if (s === "system_inferred") return { fixedness: "tentative", startTimeProvenance: "inferred", confidence: "medium" };
  return { fixedness: "movable", startTimeProvenance: "default", confidence: "medium" }; // assumed_default | unknown
}

export function buildArrivalTargetForLeaveBy(
  scope: LeaveBySupplyScopeV0,
  arrival: ArrivalEventSupplyV0,
): ArrivalTargetForLeaveByV0 | null {
  if (!isCalendarValidMinuteJstIso(arrival.arrivalTargetInstant)) return null;
  if (arrival.arrivalTargetInstant.slice(0, 10) !== arrival.targetEventDate) return null; // date mismatch → missing
  if (arrival.sourceRefs.length === 0 || arrival.evidenceRefs.length === 0) return null;
  const prov = arrivalProvenanceFromStartSource(arrival.startTimeSource);
  return {
    arrivalTargetInstant: arrival.arrivalTargetInstant,
    arrivalTargetRef: arrival.arrivalTargetRef,
    targetNodeId: scope.targetNodeId,
    targetEventDate: arrival.targetEventDate,
    transportMode: scope.transportMode,
    temporalScopeRef: scope.temporalScopeRef,
    sourceRefs: arrival.sourceRefs,
    evidenceRefs: arrival.evidenceRefs,
    fixedness: prov.fixedness,
    startTimeProvenance: prov.startTimeProvenance,
    confidence: prov.confidence,
    displayPolicy: "hidden",
  };
}

// ── bufferPolicy supply（small は v0 で出さない・medium/large/unknown のみ） ──────────────────

export function buildBufferPolicyForLeaveBy(
  scope: LeaveBySupplyScopeV0,
  buffer: BufferSignalSupplyV0,
): BufferPolicyForLeaveByV0 | null {
  if (buffer.freshness !== "valid") return null; // unknown/stale → buffer unknown → uncomputed
  if (buffer.bufferPolicyId.length === 0 || buffer.bufferScopeRef.length === 0) return null;
  if (buffer.sourceRefs.length === 0 || buffer.evidenceRefs.length === 0) return null;
  // v0: small は出さない。large=hard∧highCommitment / それ以外=medium（conservative floor）
  const bucket: "medium" | "large" = buffer.rigidity === "hard" && buffer.highCommitment ? "large" : "medium";
  return {
    bufferPolicyId: buffer.bufferPolicyId,
    bufferCoarseBucket: bucket,
    bufferKind: bucket === "large" ? "conservative_default" : "preparation",
    bufferScopeRef: buffer.bufferScopeRef,
    targetNodeId: scope.targetNodeId,
    subjectiveDate: scope.subjectiveDate,
    transportMode: scope.transportMode,
    temporalScopeRef: scope.temporalScopeRef,
    sourceRefs: buffer.sourceRefs,
    evidenceRefs: buffer.evidenceRefs,
    freshness: "valid",
    confidence: "high",
    displayPolicy: "hidden",
  };
}

// ── originTemporalValidity supply（U2-minimal builder wrapper） ───────────────────────────────

export function buildOriginTemporalValidityForLeaveBy(
  scope: LeaveBySupplyScopeV0,
  arrivalTargetInstant: string,
  origin: OriginSupplySubInputV0 | null,
): OriginTemporalValidityForLeaveByV0 | null {
  if (origin === null) return null;
  const u2Input: PreviousEventEndOriginSupplyInputV0 = {
    originInferenceStage: origin.originInferenceStage,
    dayGraphDate: origin.dayGraphDate,
    dayGraphSnapshotId: origin.dayGraphSnapshotId,
    arrivalNodeId: scope.targetNodeId,
    arrivalTargetInstant,
    subjectiveDate: scope.subjectiveDate,
    transportMode: scope.transportMode,
    temporalScopeRef: scope.temporalScopeRef,
    previousEvent: origin.previousEvent,
  };
  return buildPreviousEventEndOriginValidity(u2Input).originValidity;
}

// ── bundle 組立 ──────────────────────────────────────────────────────────────────────────────

export function buildLeaveBySupplyBundle(input: LeaveBySupplyInputV0): LeaveBySupplyBundleV0 {
  const arrivalTarget = buildArrivalTargetForLeaveBy(input.scope, input.arrival);
  const bufferPolicy = buildBufferPolicyForLeaveBy(input.scope, input.buffer);
  const originTemporalValidity = buildOriginTemporalValidityForLeaveBy(
    input.scope,
    input.arrival.arrivalTargetInstant,
    input.origin,
  );

  let missing: LeaveBySupplyMissingInput[] = [];
  const flag = (cond: boolean, code: LeaveBySupplyMissingInput): void => {
    missing = cond ? missing.concat([code]) : missing;
  };
  flag(arrivalTarget === null, "arrival_target_unavailable");
  flag(bufferPolicy === null, "buffer_unknown");
  flag(originTemporalValidity === null, "origin_unavailable");
  flag(input.durationValue === null, "duration_value_missing");

  const complete = arrivalTarget !== null && bufferPolicy !== null && originTemporalValidity !== null && input.durationValue !== null;

  return {
    schemaVersion: 0,
    subjectNodeId: input.subjectNodeId,
    capability: input.capability,
    durationValue: input.durationValue,
    arrivalTarget,
    bufferPolicy,
    originTemporalValidity,
    evaluatedAt: input.evaluatedAt,
    computedAt: input.computedAt,
    complete,
    missingInputs: missing,
    trace: {
      arrivalFixedness: arrivalTarget !== null ? arrivalTarget.fixedness : "absent",
      bufferBucket: bufferPolicy !== null ? bufferPolicy.bufferCoarseBucket : "unknown",
      originValiditySupplied: originTemporalValidity !== null,
      missingInputs: missing,
    },
  };
}

// ── RD2e-b 呼び出し（complete な時だけ・internal-only） ──────────────────────────────────────

/**
 * resolveLeaveByFromSupply — bundle が complete なら RD2e-b `computeLeaveBy` を呼ぶ。
 * 不完全なら呼ばず uncomputed（fail-closed）。complete でも adapter が二鍵/fixedness/scope を最終 gate。
 */
export function resolveLeaveByFromSupply(bundle: LeaveBySupplyBundleV0): LeaveByComputationV0 {
  if (
    !bundle.complete ||
    bundle.arrivalTarget === null ||
    bundle.bufferPolicy === null ||
    bundle.originTemporalValidity === null ||
    bundle.durationValue === null
  ) {
    const mi: LeaveByMissingInput[] = bundle.missingInputs.map((c) => ({ code: c, whyUncomputed: "supply incomplete" }));
    return createUncomputedLeaveBy(bundle.subjectNodeId, mi);
  }
  const adapterInput: LeaveByAdapterInputV0 = {
    subjectNodeId: bundle.subjectNodeId,
    capability: bundle.capability,
    durationValue: bundle.durationValue,
    arrivalTarget: bundle.arrivalTarget,
    bufferPolicy: bundle.bufferPolicy,
    originTemporalValidity: bundle.originTemporalValidity,
    evaluatedAt: bundle.evaluatedAt,
    computedAt: bundle.computedAt,
  };
  return computeLeaveBy(adapterInput); // 二鍵 + fixedness + scope + civil 減算は adapter が担当
}

/** 一括: bundle 組立 + leaveBy 解決（internal-only result） */
export function supplyAndResolveLeaveBy(input: LeaveBySupplyInputV0): LeaveBySupplyResultV0 {
  const bundle = buildLeaveBySupplyBundle(input);
  return { bundle, leaveBy: resolveLeaveByFromSupply(bundle) };
}

// ── violations（internal-only / leak guard） ──────────────────────────────────────────────────

export function leaveBySupplyViolations(bundle: LeaveBySupplyBundleV0): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };
  add(bundle.arrivalTarget !== null && bundle.arrivalTarget.displayPolicy !== "hidden", "arrivalTarget must be hidden (internal-only)");
  add(bundle.bufferPolicy !== null && bundle.bufferPolicy.displayPolicy !== "hidden", "bufferPolicy must be hidden (internal-only)");
  // raw location/route data を bundle が echo しない（shared 最強検出）
  if (containsRawLocation(JSON.stringify(bundle).toLowerCase())) {
    out = out.concat(["leaveBy supply bundle contains raw location (coordinate/encoding) — internal opaque refs only"]);
  }
  return out;
}
