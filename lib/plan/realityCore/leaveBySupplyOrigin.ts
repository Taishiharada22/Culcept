/**
 * leaveBySupplyOrigin — U2-minimal（2026-06-15）: previous_event_end の OriginTemporalValidity 供給（pure）
 *
 * 設計書: docs/reality-leaveby-u2-minimal-originvalidity-0.md
 *
 * 思想: RD2e-SUPPLY が arrival の出発点 origin を **honest に**供給するための builder。temporal validity と
 *   freshness が「今日のデータ」から honest に導ける唯一の origin kind = **previous_event_end** に限定。
 *   validity は full-AND fail-closed（'valid' を data 無しに到達不可能化）。home/work/user_confirmed/current/unknown は
 *   reject/defer（dishonest 'valid' を作らない）。**pure compute・DB 非永続・migration 不要**（OriginInferenceV0 が pure）。
 *
 * 不変条件:
 *   - originInferenceStage==='previous_event_end' のみ supply。他は null（builder は previous_event_end 専用）。
 *   - validity='valid' は **全 AND**: supportedBoundary(explicit∧¬clipped) ∧ 前 event start∈{user_explicit,imported_exact}(U1) ∧
 *     instant calendar-valid ∧ prevEnd≤arrival ∧ location≠absent ∧ same subjectiveDate。
 *   - freshness='valid' は dayGraphSnapshotId が実在する時のみ（originAsOfRef=snapshotId・捏造でない）。
 *   - location tri-state（present/redacted_sensitive/absent）・raw location を echo しない。
 *   - currentLocation/geolocation/Date/乱数/IO なし。
 */

import { isCalendarValidMinuteJstIso, type OriginTemporalValidityForLeaveByV0 } from "./leaveByAdapter";
import type { OriginInferenceStage } from "./originInference";
import type { TransportModeV0 } from "./routeEtaCapability";
import type { StartTimeSource } from "../external-anchor";

export const LEAVEBY_SUPPLY_ORIGIN_VERSION = 0;

export type OriginLocationState = "present" | "redacted_sensitive" | "absent";

export type LeaveBySupplyOriginMissingInput =
  | "origin_stage_not_previous_event_end"
  | "previous_event_boundary_unsupported"
  | "previous_event_start_defaulted"
  | "previous_event_end_not_calendar_valid"
  | "previous_event_end_after_arrival"
  | "origin_location_absent"
  | "origin_snapshot_asof_missing"
  | "origin_scope_mismatch";

export interface LeaveBySupplyOriginTrace {
  readonly originProvenanceKind: "previous_event_chain" | "none";
  readonly derivedValidity: "valid" | "stale" | "unknown" | "absent";
  readonly derivedFreshness: "valid" | "unknown" | "absent";
  readonly derivedLocationState: OriginLocationState | "absent_stage";
  readonly previousEventEndInstant: string | null;
  readonly missingInputs: ReadonlyArray<LeaveBySupplyOriginMissingInput>;
}

export interface PreviousEventForOriginV0 {
  readonly nodeId: string;
  readonly endTimeHHMM: string; // "HH:MM"
  readonly durationSource: "explicit" | "assumed_default";
  readonly boundaryClipped: boolean;
  /** undefined = sensitive 由来 redaction or 記録なし（sensitive で区別） */
  readonly locationText?: string;
  readonly sensitive: boolean;
  /** U1 startTimeSource（前 event anchor 由来・start provenance） */
  readonly startTimeSource: StartTimeSource;
  /** opaque（raw location/title なし） */
  readonly anchorRef: string;
}

export interface PreviousEventEndOriginSupplyInputV0 {
  readonly originInferenceStage: OriginInferenceStage;
  readonly dayGraphDate: string; // YYYY-MM-DD（graph 全体で 1 つ・same-subjectiveDate 構造保証）
  readonly dayGraphSnapshotId: string | null; // freshness の実 asOf ref
  readonly arrivalNodeId: string; // 到着 node id（origin の targetNodeId に使う）
  readonly arrivalTargetInstant: string; // canonical JST
  readonly subjectiveDate: string; // capability/arrival 側
  readonly transportMode: TransportModeV0;
  readonly temporalScopeRef: string | null;
  readonly previousEvent: PreviousEventForOriginV0;
}

export interface OriginTemporalValiditySupplyResultV0 {
  /** previous_event_end 以外は null（builder は previous_event_end 専用） */
  readonly originValidity: OriginTemporalValidityForLeaveByV0 | null;
  readonly trace: LeaveBySupplyOriginTrace;
}

const VALID_START_SOURCES: ReadonlyArray<StartTimeSource> = ["user_explicit", "imported_exact"];

/** "HH:MM" + date → canonical JST instant（不正 HH:MM / 不正 date は null） */
export function materializePreviousEventEndInstant(dayGraphDate: string, endTimeHHMM: string): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(endTimeHHMM);
  if (m === null) return null;
  const candidate = `${dayGraphDate}T${m[1]}:${m[2]}:00+09:00`;
  return isCalendarValidMinuteJstIso(candidate) ? candidate : null;
}

/** location tri-state（sensitive は redacted_sensitive・raw を echo しない） */
export function deriveOriginLocationState(locationText: string | undefined, sensitive: boolean): OriginLocationState {
  if (sensitive) return "redacted_sensitive"; // opaque ref で valid 可・location を出さない
  if (locationText !== undefined && locationText.length > 0) return "present";
  return "absent";
}

/**
 * buildPreviousEventEndOriginValidity — previous_event_end の OriginTemporalValidityForLeaveByV0 を供給（pure）。
 * stage≠previous_event_end → null（他 kind は本片対象外）。previous_event_end は full-AND fail-closed で validity/freshness 導出。
 */
export function buildPreviousEventEndOriginValidity(
  input: PreviousEventEndOriginSupplyInputV0,
): OriginTemporalValiditySupplyResultV0 {
  // stage gate: previous_event_end 専用（home/work/user_confirmed/current/unknown は supply しない）
  if (input.originInferenceStage !== "previous_event_end") {
    return {
      originValidity: null,
      trace: {
        originProvenanceKind: "none",
        derivedValidity: "absent",
        derivedFreshness: "absent",
        derivedLocationState: "absent_stage",
        previousEventEndInstant: null,
        missingInputs: ["origin_stage_not_previous_event_end"],
      },
    };
  }

  const pe = input.previousEvent;
  let missing: LeaveBySupplyOriginMissingInput[] = [];
  const flag = (cond: boolean, code: LeaveBySupplyOriginMissingInput): void => {
    missing = cond ? missing.concat([code]) : missing;
  };

  // instant materialization（load-bearing）
  const instant = materializePreviousEventEndInstant(input.dayGraphDate, pe.endTimeHHMM);
  flag(instant === null, "previous_event_end_not_calendar_valid");

  // supportedBoundary（explicit ∧ ¬clipped）
  const supportedBoundary = pe.durationSource === "explicit" && pe.boundaryClipped === false;
  flag(!supportedBoundary, "previous_event_boundary_unsupported");

  // U1 startTimeSource（前 event START provenance）
  const startOk = VALID_START_SOURCES.indexOf(pe.startTimeSource) >= 0;
  flag(!startOk, "previous_event_start_defaulted");

  // prevEnd ≤ arrival（calendar-valid 同士の lexicographic = 時系列）
  const afterArrival = instant !== null && instant > input.arrivalTargetInstant;
  flag(afterArrival, "previous_event_end_after_arrival");

  // location tri-state
  const locationState = deriveOriginLocationState(pe.locationText, pe.sensitive);
  flag(locationState === "absent", "origin_location_absent");

  // scope: graph date と capability subjectiveDate の一致（cross-day は scope mismatch）
  const scopeOk = input.subjectiveDate === input.dayGraphDate;
  flag(!scopeOk, "origin_scope_mismatch");

  // freshness: dayGraphSnapshotId が実在する時のみ valid（asOf = snapshotId・捏造でない）
  const snapshotPresent = input.dayGraphSnapshotId !== null && input.dayGraphSnapshotId.length > 0;
  flag(!snapshotPresent, "origin_snapshot_asof_missing");
  const originFreshness: "valid" | "unknown" = snapshotPresent ? "valid" : "unknown";
  const originAsOfRef = snapshotPresent ? (input.dayGraphSnapshotId as string) : "";

  // validity 導出（full-AND・instant 不能/prevEnd>arrival は unknown・他不足は stale）
  let validity: "valid" | "stale" | "unknown";
  if (instant === null) {
    validity = "unknown";
  } else if (afterArrival || !scopeOk) {
    validity = "unknown";
  } else if (supportedBoundary && startOk && locationState !== "absent") {
    validity = "valid";
  } else {
    validity = "stale";
  }

  const originConflict: "none" | "conflict" = afterArrival ? "conflict" : "none";

  const originValidity: OriginTemporalValidityForLeaveByV0 = {
    originKind: "previous_event_end",
    validity,
    originConflict,
    currentObservationOverrodeConfirmed: false, // previous_event_end は現在観測でない（不変）
    originEvidenceRef: pe.anchorRef, // opaque（raw location/title なし）
    targetNodeId: input.arrivalNodeId, // 到着 node id（前 event id でない・RD2e-b-A D1 scope）
    subjectiveDate: input.dayGraphDate,
    transportMode: input.transportMode,
    temporalScopeRef: input.temporalScopeRef,
    originFreshness,
    originAsOfRef,
  };

  return {
    originValidity,
    trace: {
      originProvenanceKind: "previous_event_chain",
      derivedValidity: validity,
      derivedFreshness: originFreshness,
      derivedLocationState: locationState,
      previousEventEndInstant: instant,
      missingInputs: missing,
    },
  };
}
