/**
 * leaveByComputation — RD2e-a 実 leaveBy 時刻（leaveByInstantComputed）の型・不変条件・walker（pure・計算しない）
 *
 * 正本: docs/reality-leaveby-computation-boundary-rd2e-0.md（+ RD2e-0A 補正）/ CEO RD2e-a 実装 GO（2026-06-14・types + walker only）
 *
 * 思想（leaveBy は capability でなく「行動に最も近い派生量」）: RD2e-a は leaveBy を**計算しない**。実減算
 *   （arrivalTargetInstant − planning-grade time estimate − buffer）は RD2e-b adapter。RD2e-a は **leaveByInstantComputed を
 *   表現する型 + 不変条件 + walker** を作るだけ。`createComputedLeaveBy` は計算済 instant + 契約を受け取り、**型レベルで
 *   planning-grade source / 非 current_location origin のみ受理**（heuristic/none/current_location は TS 上構築不能・RD2a/RD2c と同型）。
 *
 * 不変条件（CEO RD2e-a 必守）:
 *   ① leaveByInstantComputed は **internal only**（consumer/copy/notification/departure line/prompt/action/proposal でない・
 *      display/action eligibility を含まない）
 *   ② 時間契約: leaveByInstant/timezone(JST)/subjectiveDate/targetEventDate/arrivalTargetInstant/evaluatedAt/
 *      sourceTimeEstimateRef/bufferRef/computedAt。browser local TZ / HH だけ / minuteOfDay だけ identity / date 跨ぎ無視 禁止。
 *      **computedAt は identity 対象外**（timeContract に含めない）
 *   ③ **`timeEstimateUsableForPlanning=true` 必須**（durationSignalPresent だけ/arrivalProjectionKnown だけ/heuristic/stale は computed 不可）
 *   ④ buffer policy: bufferPolicyId/Kind/source/evidence/confidence 必須・根拠なき精密分数禁止・weather 数値化禁止・「間に合う保証」でない・buffer なしは computed 不可
 *   ⑤ **currentLocation は RD2e-a で使わない**（current_location_candidate origin は computed 不可・user_confirmed/previous_event_end/assumed のみ・evidence 必須）
 *   ⑥ fake 禁止（fake leaveBy / stale / heuristic / browser local time / raw coordinate / route response / currentLocation field なし）
 *
 * 規律（CEO）: 実計算 adapter・route/timeEstimate provider 接続・RC2a/MovementReality 変更・departure line・user-facing copy・
 *   notification・currentLocation 取得・geolocation・weather API・UI/DB なし。pure（IO・時刻 API[Date.now/new Date/local getter]・乱数なし）。
 */

export const LEAVEBY_COMPUTATION_VERSION = 0;

export type LeaveByComputationStatus = "computed" | "uncomputed";

/** planning-grade な time estimate source のみ（heuristic/none は computed に使えない） */
export type PlanningGradeTimeSource = "external_route" | "scheduled" | "user_confirmed" | "cached_route";
export type LeaveByComputationSource = PlanningGradeTimeSource | "none";

/** computed に使ってよい origin（current_location_candidate / unknown は不可・RD2e-a 裁定 A） */
export type ComputedOriginKind = "user_confirmed" | "previous_event_end" | "home_assumed" | "work_assumed";
export type LeaveByOriginKind = ComputedOriginKind | "current_location_candidate" | "unknown";

export type LeaveByBufferKind = "preparation" | "error_margin" | "transition" | "conservative_default";

/** buffer は粗い bucket（精密分数を持たない＝構造的に捏造不可） */
export type LeaveByBufferBucket = "small" | "medium" | "large";

export type LeaveByConfidence = "high" | "moderate" | "low" | "none";

/** leaveBy instant は internal only（visible 禁止） */
export type LeaveByDisplayPolicy = "internalReference" | "debugOnly" | "hidden" | "notActionable";

/** v0 は JST 固定（browser local TZ 禁止） */
export type LeaveByTimezone = "JST";

export interface LeaveByInstantV0 {
  /** 絶対 instant（ISO・date+time+offset・minuteOfDay/HH だけにしない） */
  readonly instant: string;
  readonly timezone: LeaveByTimezone;
}

export interface LeaveByTimeContractV0 {
  readonly timezone: LeaveByTimezone;
  readonly subjectiveDate: string;
  /** 対象 event 日付（date 跨ぎを無視しない） */
  readonly targetEventDate: string;
  readonly arrivalTargetInstant: string;
  readonly evaluatedAt: string;
}

export interface LeaveByEvidenceRef {
  readonly code: string;
  readonly capability: "time_estimate" | "buffer" | "arrival_target" | "origin";
  readonly source: LeaveByComputationSource | "event_anchor" | "origin_inference";
}

export interface LeaveByBufferPolicyV0 {
  readonly bufferPolicyId: string;
  readonly bufferKind: LeaveByBufferKind;
  readonly bufferCoarseBucket: LeaveByBufferBucket;
  /** policy 由来（rigidity/mode/event_kind） */
  readonly source: string;
  readonly evidenceRefs: ReadonlyArray<LeaveByEvidenceRef>;
  readonly confidence: LeaveByConfidence;
  readonly staleness: "fresh" | "stale" | "unknown";
  readonly displayPolicy: LeaveByDisplayPolicy;
}

export interface LeaveByMissingInput {
  readonly code: string;
  readonly whyUncomputed: string;
}

export interface LeaveByComputationV0 {
  readonly schemaVersion: 0;
  readonly status: LeaveByComputationStatus;
  /** computed のみ非 null */
  readonly leaveByInstant: LeaveByInstantV0 | null;
  readonly source: LeaveByComputationSource;
  /** computed のみ非 null（identity-bearing・computedAt を含まない） */
  readonly timeContract: LeaveByTimeContractV0 | null;
  readonly sourceTimeEstimateRef: string | null;
  readonly buffer: LeaveByBufferPolicyV0 | null;
  readonly bufferRef: string | null;
  readonly originUsabilityKind: LeaveByOriginKind;
  readonly originEvidencePresent: boolean;
  /** computed の gate（durationSignalPresent/arrivalProjectionKnown だけでは不可） */
  readonly timeEstimateUsableForPlanning: boolean;
  /** 計算時刻（**identity 対象外**・timeContract に含めない） */
  readonly computedAt: string | null;
  readonly evidenceRefs: ReadonlyArray<LeaveByEvidenceRef>;
  readonly missingInputs: ReadonlyArray<LeaveByMissingInput>;
  readonly subjectNodeId: string | null;
  readonly displayPolicy: LeaveByDisplayPolicy;
}

// ── constructors（pure・実減算しない） ──────────────────────────────────────────────────────

/** uncomputed — leaveBy 時刻を出さない（fake instant を作らない） */
export function createUncomputedLeaveBy(
  subjectNodeId: string | null,
  missingInputs: ReadonlyArray<LeaveByMissingInput>,
): LeaveByComputationV0 {
  return {
    schemaVersion: 0,
    status: "uncomputed",
    leaveByInstant: null,
    source: "none",
    timeContract: null,
    sourceTimeEstimateRef: null,
    buffer: null,
    bufferRef: null,
    originUsabilityKind: "unknown",
    originEvidencePresent: false,
    timeEstimateUsableForPlanning: false,
    computedAt: null,
    evidenceRefs: [],
    missingInputs: missingInputs.length > 0 ? missingInputs : [{ code: "leaveBy_uncomputed", whyUncomputed: "preconditions_absent" }],
    subjectNodeId,
    displayPolicy: "hidden",
  };
}

/**
 * createComputedLeaveBy — 計算済 instant + 契約を受け取り computed object を構築（RD2e-a は減算しない）。
 * 型制約: source は PlanningGradeTimeSource のみ・origin は ComputedOriginKind のみ（heuristic/none/current_location は構築不能）。
 */
export function createComputedLeaveBy(input: {
  readonly subjectNodeId: string | null;
  readonly leaveByInstant: LeaveByInstantV0;
  readonly source: PlanningGradeTimeSource;
  readonly timeContract: LeaveByTimeContractV0;
  readonly sourceTimeEstimateRef: string;
  readonly buffer: LeaveByBufferPolicyV0;
  readonly bufferRef: string;
  readonly originUsabilityKind: ComputedOriginKind;
  readonly computedAt: string;
  readonly evidenceRefs: ReadonlyArray<LeaveByEvidenceRef>;
}): LeaveByComputationV0 {
  return {
    schemaVersion: 0,
    status: "computed",
    leaveByInstant: input.leaveByInstant,
    source: input.source,
    timeContract: input.timeContract,
    sourceTimeEstimateRef: input.sourceTimeEstimateRef,
    buffer: input.buffer,
    bufferRef: input.bufferRef,
    originUsabilityKind: input.originUsabilityKind,
    originEvidencePresent: true,
    timeEstimateUsableForPlanning: true,
    computedAt: input.computedAt,
    evidenceRefs: input.evidenceRefs,
    missingInputs: [],
    subjectNodeId: input.subjectNodeId,
    displayPolicy: "internalReference",
  };
}

// ── walker ──────────────────────────────────────────────────────────────────────────────

const PLANNING_GRADE_SOURCES: ReadonlyArray<LeaveByComputationSource> = [
  "external_route",
  "scheduled",
  "user_confirmed",
  "cached_route",
];
const COMPUTED_ORIGIN_KINDS: ReadonlyArray<LeaveByOriginKind> = [
  "user_confirmed",
  "previous_event_end",
  "home_assumed",
  "work_assumed",
];

/** consumer/user-facing/action を含意する禁止 field（leaveBy instant は internal only） */
const FORBIDDEN_FIELDS: ReadonlyArray<string> = [
  "departureline",
  "copy",
  "notification",
  "prompt",
  "userfacing",
  "actioneligible",
  "displayeligible",
  "nudge",
  "proposal",
  "lat",
  "lng",
  "latitude",
  "longitude",
  "coordinates",
  "routeresponse",
  "currentlocation",
  "minuteofday",
];

/**
 * leaveByComputationViolations — 不変条件違反を列挙（空配列 = 健全）。computed は全 precondition + 時間契約 + internal-only を要求。
 */
export function leaveByComputationViolations(c: LeaveByComputationV0): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };

  add(c.schemaVersion !== 0, `schemaVersion must be 0 (got ${String(c.schemaVersion)})`);

  if (c.status === "computed") {
    // ③ planning-grade gate
    add(!c.timeEstimateUsableForPlanning, "computed requires timeEstimateUsableForPlanning=true");
    add(PLANNING_GRADE_SOURCES.indexOf(c.source) < 0, `computed requires planning-grade source (got ${c.source})`);
    // 時間契約 + instant
    add(c.leaveByInstant === null, "computed requires leaveByInstant");
    add(c.leaveByInstant !== null && c.leaveByInstant.timezone !== "JST", "leaveByInstant.timezone must be JST (v0)");
    add(
      c.leaveByInstant !== null && (c.leaveByInstant.instant.length === 0 || c.leaveByInstant.instant.indexOf("T") < 0),
      "leaveByInstant.instant must be an absolute date-time (not HH/minuteOfDay only)",
    );
    add(c.timeContract === null, "computed requires timeContract");
    if (c.timeContract !== null) {
      add(c.timeContract.timezone !== "JST", "timeContract.timezone must be JST (v0)");
      add(c.timeContract.subjectiveDate.length === 0, "timeContract requires subjectiveDate");
      add(c.timeContract.targetEventDate.length === 0, "timeContract requires targetEventDate (date-crossing not ignored)");
      add(c.timeContract.arrivalTargetInstant.length === 0, "computed requires arrivalTargetInstant");
      add(c.timeContract.evaluatedAt.length === 0, "computed requires evaluatedAt");
      // computedAt は identity-bearing timeContract に含めない
      const tcKeys = Object.keys(c.timeContract as unknown as Record<string, unknown>).map((k) => k.toLowerCase());
      add(tcKeys.indexOf("computedat") >= 0, "computedAt must not be part of timeContract (identity-excluded)");
    }
    // refs
    add(c.sourceTimeEstimateRef === null || c.sourceTimeEstimateRef.length === 0, "computed requires sourceTimeEstimateRef");
    add(c.bufferRef === null || c.bufferRef.length === 0, "computed requires bufferRef");
    // ④ buffer policy
    add(c.buffer === null, "computed requires buffer policy");
    if (c.buffer !== null) {
      add(c.buffer.bufferPolicyId.length === 0, "buffer requires bufferPolicyId");
      add(c.buffer.evidenceRefs.length === 0, "buffer requires non-empty evidenceRefs");
      add(c.buffer.confidence === "none", "buffer requires confidence (not none)");
      add(c.buffer.staleness !== "fresh", "buffer must be fresh for computed");
    }
    // ⑤ origin
    add(COMPUTED_ORIGIN_KINDS.indexOf(c.originUsabilityKind) < 0, `computed origin must be user_confirmed/previous_event_end/assumed (got ${c.originUsabilityKind})`);
    add(c.originUsabilityKind === "current_location_candidate", "current_location_candidate origin must not yield computed leaveBy (RD2e-a)");
    add(!c.originEvidencePresent, "computed requires origin evidence");
    // ① internal only
    add(c.displayPolicy !== "internalReference" && c.displayPolicy !== "debugOnly", "leaveByInstantComputed displayPolicy must be internalReference|debugOnly (internal only)");
  } else {
    // uncomputed は fake instant/contract を持たない
    add(c.leaveByInstant !== null, "uncomputed must not carry leaveByInstant");
    add(c.timeContract !== null, "uncomputed must not carry timeContract");
    add(c.source !== "none", "uncomputed must have source none");
  }

  // 構造 backstop: user-facing/action/raw field を持たない
  const keys = Object.keys(c as unknown as Record<string, unknown>).map((k) => k.toLowerCase());
  out = out.concat(FORBIDDEN_FIELDS.filter((f) => keys.indexOf(f) >= 0).map((f) => `forbidden field present: ${f} (leaveBy is internal-only / no raw)`));

  return out;
}
