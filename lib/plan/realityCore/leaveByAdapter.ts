/**
 * leaveByAdapter — RD2e-b: internal-only leaveByInstantComputed を作る pure 計算 adapter
 *
 * 正本: docs/reality-leaveby-computation-adapter-rd2e-b0b.md + …-rd2e-b0b-a.md / CEO RD2e-b 実装 GO（2026-06-15）
 *
 * 思想: leaveBy は「行動に最も近い派生量」だが、RD2e-b は **行動でも departure line でも notification でもない**。
 *   入力 (capability + durationValue + arrivalTarget + bufferPolicy + originTemporalValidity + evaluatedAt/computedAt) から
 *   **二鍵照合 → 全 precondition 合流 → 1 回の絶対時刻減算 → fail-closed 着地**で `LeaveByComputationV0`（internal-only）を返す。
 *
 * 核（RD2e-b0B/0B-A 確定）:
 *   - **二鍵を最初に照合**: `bindDurationValueToCapability` を**再実行**（value 自己フラグを信用しない）。full basis 不一致 → uncomputed。
 *   - **whole-minute epoch**（ss=00）で `instantMinusMinutes`（Date 不使用・civil 算術・range guard・composition 等価）。
 *   - **buffer catalog 固定**（small5/medium15/large30・動的計算/weather/任意分数禁止）+ 単一 leaveByScopeKey で全燃料束縛。
 *   - **arrival provenance**（fixed/confidence/source/evidence）+ **origin temporal validity**（currentLocation 不使用）。
 *   - **uncomputed reason priority**（first-failing-gate-wins）で多重欠落でも reason 安定。
 *
 * 規律（CEO）: RC2a/MovementReality 変更・departure line・user-facing copy・notification・currentLocation 取得・geolocation・
 *   route provider・weather API・external・UI・DB write なし。pure（IO/時刻 API[Date.now/new Date/getTimezoneOffset/local getter]/乱数なし）。
 */

import {
  createComputedLeaveBy,
  createUncomputedLeaveBy,
  leaveByComputationViolations,
  leaveByAtOrBeforeArrival,
  type LeaveByComputationV0,
  type LeaveByEvidenceRef,
  type LeaveByBufferPolicyV0,
  type LeaveByBufferKind,
  type LeaveByBufferBucket,
  type LeaveByConfidence,
  type ComputedOriginKind,
  type LeaveByOriginKind,
} from "./leaveByComputation";
import type { RouteEtaCapabilityV0, TransportModeV0 } from "./routeEtaCapability";
import { bindDurationValueToCapability, durationValueViolations, type PlanningGradeDurationValueV0 } from "./routeEtaDurationValue";

export const LEAVEBY_ADAPTER_VERSION = 0;

// ── bounds（RD2e-b0B-A §3・v0 conservative・value を信用せず再検証） ───────────────────────────
export const MAX_DURATION_MINUTES = 1440;
export const MAX_BUFFER_MINUTES = 60;
export const MAX_TOTAL_SUBTRACTION_MINUTES = 1440;
export const EPOCH_YEAR_MIN = 2000;
export const EPOCH_YEAR_MAX = 2100;

// ── 入力型（durationValue/bufferPolicy/arrivalTarget/originValidity は internal-only） ────────────

export interface ArrivalTargetForLeaveByV0 {
  readonly arrivalTargetInstant: string; // isCalendarValidMinuteJstIso green
  readonly arrivalTargetRef: string;
  readonly targetNodeId: string;
  readonly targetEventDate: string; // = capability.subjectiveDate 必須
  readonly transportMode: TransportModeV0;
  readonly sourceRefs: ReadonlyArray<string>;
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly fixedness: "fixed" | "tentative" | "movable";
  readonly startTimeProvenance: "confirmed" | "inferred" | "default";
  readonly confidence: "high" | "medium" | "low";
  readonly displayPolicy: "hidden";
}

export interface BufferPolicyForLeaveByV0 {
  readonly bufferPolicyId: string;
  /** catalog 連動（→ 5/15/30 minutes・RD2e-b0A §3） */
  readonly bufferCoarseBucket: LeaveByBufferBucket;
  /** 意味的 kind（output LeaveByBufferPolicyV0.bufferKind 用） */
  readonly bufferKind: LeaveByBufferKind;
  readonly bufferScopeRef: string;
  readonly targetNodeId: string;
  readonly subjectiveDate: string;
  readonly transportMode: TransportModeV0;
  readonly sourceRefs: ReadonlyArray<string>;
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly freshness: "valid" | "stale" | "unknown";
  readonly confidence: LeaveByConfidence;
  readonly displayPolicy: "hidden";
}

export interface OriginTemporalValidityForLeaveByV0 {
  readonly originKind: LeaveByOriginKind;
  readonly validity: "valid" | "stale" | "unknown";
  readonly originConflict: "none" | "minor_discrepancy" | "conflict";
  /** 不変条件: 常に false（現在観測が user 確認 origin を上書きしない・RD2c） */
  readonly currentObservationOverrodeConfirmed: boolean;
  readonly originEvidenceRef: string;
  readonly targetNodeId: string;
  readonly subjectiveDate: string;
}

export interface LeaveByAdapterInputV0 {
  readonly subjectNodeId: string | null;
  readonly capability: RouteEtaCapabilityV0;
  readonly durationValue: PlanningGradeDurationValueV0 | null;
  readonly arrivalTarget: ArrivalTargetForLeaveByV0;
  readonly bufferPolicy: BufferPolicyForLeaveByV0;
  readonly originTemporalValidity: OriginTemporalValidityForLeaveByV0;
  /** caller 供給の canonical JST（pure ゆえ now を取らない） */
  readonly evaluatedAt: string;
  /** identity 対象外 metadata・canonical JST */
  readonly computedAt: string;
}

export type LeaveByAdapterUncomputedReason =
  | "input_shape_invalid"
  | "binding_mismatch"
  | "duration_value_missing_or_unusable"
  | "arrival_target_invalid"
  | "buffer_invalid"
  | "origin_temporal_invalid"
  | "subtraction_failed"
  | "subtraction_out_of_range";

// ── calendar-valid canonical JST ISO + civil 算術（RD2e-b0B-A §1/§7・Date 不使用） ────────────────

const CANON_MINUTE_JST = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+09:00$/;

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
function daysInMonth(y: number, mo: number): number {
  if (mo === 2) return isLeap(y) ? 29 : 28;
  if (mo === 4 || mo === 6 || mo === 9 || mo === 11) return 30;
  return 31;
}

/** regex（形式）+ 暦妥当性 + ss=00（RD2e-b0B-A 確定・`isCanonicalJstIso` の穴を塞ぐ） */
export function isCalendarValidMinuteJstIso(s: string): boolean {
  const m = CANON_MINUTE_JST.exec(s);
  if (m === null) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  if (m[6] !== "00") return false; // seconds policy A
  if (y < EPOCH_YEAR_MIN || y > EPOCH_YEAR_MAX) return false;
  if (mo < 1 || mo > 12) return false;
  if (h > 23 || mi > 59) return false;
  if (d < 1 || d > daysInMonth(y, mo)) return false;
  return true;
}

// Howard Hinnant days_from_civil / civil_from_days（pure 整数・浮動小数なし）
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = y - (m <= 2 ? 1 : 0);
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor((zz >= 0 ? zz : zz - 146096) / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function pad4(n: number): string {
  return n < 10 ? `000${n}` : n < 100 ? `00${n}` : n < 1000 ? `0${n}` : `${n}`;
}

/**
 * instantMinusMinutes — canonical minute JST から minutes を引く（pure・Date 不使用・whole-minute epoch）。
 * domain 外（非 calendar-valid / 非 integer / 負 / >MAX / 減算後 year 範囲外）は null。出力 canonical（ss=00）。
 */
export function instantMinusMinutes(instant: string, minutes: number): string | null {
  if (!isCalendarValidMinuteJstIso(instant)) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_TOTAL_SUBTRACTION_MINUTES) return null;
  const m = CANON_MINUTE_JST.exec(instant);
  if (m === null) return null;
  const Y = Number(m[1]);
  const Mo = Number(m[2]);
  const D = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  let epochMin = daysFromCivil(Y, Mo, D) * 1440 + h * 60 + mi;
  epochMin -= minutes;
  const dayCount = Math.floor(epochMin / 1440);
  const rem = epochMin - dayCount * 1440;
  const hh = Math.floor(rem / 60);
  const mm = rem - hh * 60;
  const c = civilFromDays(dayCount);
  if (c.y < EPOCH_YEAR_MIN || c.y > EPOCH_YEAR_MAX) return null; // post-subtraction range guard
  return `${pad4(c.y)}-${pad2(c.m)}-${pad2(c.d)}T${pad2(hh)}:${pad2(mm)}:00+09:00`;
}

// ── buffer catalog（固定・動的計算禁止・RD2e-b0A §3） ──────────────────────────────────────────

export function resolveBufferMinutesFromCatalog(bucket: LeaveByBufferBucket): number | null {
  if (bucket === "small") return 5;
  if (bucket === "medium") return 15;
  if (bucket === "large") return 30;
  return null;
}

// ── scope key（単一 key で全燃料束縛・RD2e-b0B-A §4） ─────────────────────────────────────────

function scopeKey(targetNodeId: string | null, subjectiveDate: string | null, mode: TransportModeV0): string {
  return `${targetNodeId ?? "∅"}::${subjectiveDate ?? "∅"}::${mode}`;
}

const COMPUTED_ORIGIN_KINDS: ReadonlyArray<LeaveByOriginKind> = [
  "user_confirmed",
  "previous_event_end",
  "home_assumed",
  "work_assumed",
];
function isComputedOriginKind(k: LeaveByOriginKind): k is ComputedOriginKind {
  return COMPUTED_ORIGIN_KINDS.indexOf(k) >= 0;
}

// ── gate violations（各々 testable・safe message・raw echo なし） ────────────────────────────────

/** gate 1: 入力 shape（metadata 時刻 canonical + capability identity 必須） */
export function leaveByAdapterInputViolations(input: LeaveByAdapterInputV0): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };
  add(!isCalendarValidMinuteJstIso(input.evaluatedAt), "evaluatedAt must be calendar-valid minute JST ISO");
  add(!isCalendarValidMinuteJstIso(input.computedAt), "computedAt must be calendar-valid minute JST ISO");
  const id = input.capability.identity;
  add(id.targetNodeId === null || id.targetNodeId.length === 0, "capability identity targetNodeId required");
  add(id.subjectiveDate === null || id.subjectiveDate.length === 0, "capability identity subjectiveDate required");
  return out;
}

function arrivalTargetViolations(a: ArrivalTargetForLeaveByV0, capability: RouteEtaCapabilityV0): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };
  add(!isCalendarValidMinuteJstIso(a.arrivalTargetInstant), "arrivalTargetInstant must be calendar-valid minute JST ISO");
  add(a.arrivalTargetRef.length === 0, "arrivalTargetRef required");
  add(a.targetNodeId.length === 0, "arrival targetNodeId required");
  add(a.sourceRefs.length === 0, "arrival sourceRefs required");
  add(a.evidenceRefs.length === 0, "arrival evidenceRefs required");
  add(a.fixedness !== "fixed", "arrival fixedness must be fixed");
  add(a.startTimeProvenance === "default", "arrival default start-time provenance not allowed");
  add(a.confidence === "low", "arrival confidence too low");
  add(a.targetEventDate !== (capability.identity.subjectiveDate ?? ""), "arrival targetEventDate must match capability subjectiveDate");
  add(a.displayPolicy !== "hidden", "arrival displayPolicy must be hidden (internal-only)");
  return out;
}

function bufferViolations(b: BufferPolicyForLeaveByV0, bufferMinutes: number | null): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };
  add(bufferMinutes === null, "buffer bucket not in catalog (unknown)");
  add(bufferMinutes !== null && bufferMinutes > MAX_BUFFER_MINUTES, "buffer exceeds max");
  add(b.bufferPolicyId.length === 0, "bufferPolicyId required");
  add(b.bufferScopeRef.length === 0, "bufferScopeRef required");
  add(b.sourceRefs.length === 0, "buffer sourceRefs required");
  add(b.evidenceRefs.length === 0, "buffer evidenceRefs required");
  add(b.freshness !== "valid", "buffer must be fresh/valid (stale/unknown not allowed)");
  add(b.confidence === "none", "buffer confidence must not be none");
  add(b.displayPolicy !== "hidden", "buffer displayPolicy must be hidden (internal-only)");
  return out;
}

function originValidityViolations(o: OriginTemporalValidityForLeaveByV0): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };
  add(o.currentObservationOverrodeConfirmed, "current observation must not override confirmed origin");
  add(o.originKind === "current_location_candidate", "current_location_candidate origin must not yield computed leaveBy");
  add(!isComputedOriginKind(o.originKind), "origin kind not computed-grade");
  add(o.validity !== "valid", "origin temporal validity must be valid");
  add(o.originConflict === "conflict", "origin conflict not allowed");
  add(o.originEvidenceRef.length === 0, "origin evidence required");
  return out;
}

// ── adapter 本体（first-failing-gate-wins・RD2e-b0B-A §6） ────────────────────────────────────

/**
 * computeLeaveBy — 二鍵照合 → precondition 合流 → 1 回減算 → fail-closed。実減算は instantMinusMinutes 1 回のみ。
 * uncomputed reason は固定優先順位（多重欠落でも安定）。computed は walker green を最終確認してから emit。
 */
export function computeLeaveBy(input: LeaveByAdapterInputV0): LeaveByComputationV0 {
  const node = input.subjectNodeId ?? null;
  const uncomputed = (reason: LeaveByAdapterUncomputedReason, why: string): LeaveByComputationV0 =>
    createUncomputedLeaveBy(node, [{ code: reason, whyUncomputed: why }]);

  // Gate 1: input shape
  const shapeViol = leaveByAdapterInputViolations(input);
  if (shapeViol.length > 0) return uncomputed("input_shape_invalid", shapeViol[0]);

  const { capability, durationValue, arrivalTarget, bufferPolicy, originTemporalValidity } = input;
  const capScope = scopeKey(capability.identity.targetNodeId, capability.identity.subjectiveDate, capability.identity.transportMode);

  // Gate 2: binding mismatch（duration present だが full basis or scopeKey 不一致）
  if (durationValue !== null) {
    const bind = bindDurationValueToCapability(durationValue, capability);
    if (!bind.matched) return uncomputed("binding_mismatch", "duration value full basis does not match capability");
    const durScope = scopeKey(durationValue.binding.targetNodeId, durationValue.binding.subjectiveDate, durationValue.binding.transportMode);
    const arrScope = scopeKey(arrivalTarget.targetNodeId, arrivalTarget.targetEventDate, arrivalTarget.transportMode);
    const bufScope = scopeKey(bufferPolicy.targetNodeId, bufferPolicy.subjectiveDate, bufferPolicy.transportMode);
    if (capScope !== durScope || capScope !== arrScope || capScope !== bufScope) {
      return uncomputed("binding_mismatch", "leaveBy scope key mismatch across fuels");
    }
  }

  // Gate 3: duration value missing / unusable（value 単体の usable を信用せず再照合 + 構造再検証）
  if (durationValue === null) return uncomputed("duration_value_missing_or_unusable", "no duration value");
  if (durationValueViolations(durationValue).length > 0) {
    return uncomputed("duration_value_missing_or_unusable", "duration value self-consistency failed"); // forged usable=true+不整合を弾く
  }
  const bind2 = bindDurationValueToCapability(durationValue, capability);
  if (!bind2.usableAfterBinding) return uncomputed("duration_value_missing_or_unusable", "duration value not usable after binding (two-key)");
  const durMin = durationValue.durationUpperBoundMinutes;
  if (!Number.isInteger(durMin) || durMin < 0 || durMin > MAX_DURATION_MINUTES) {
    return uncomputed("duration_value_missing_or_unusable", "duration minutes out of bounds");
  }

  // Gate 4: arrival target
  const aViol = arrivalTargetViolations(arrivalTarget, capability);
  if (aViol.length > 0) return uncomputed("arrival_target_invalid", aViol[0]);

  // Gate 5: buffer
  const bufMin = resolveBufferMinutesFromCatalog(bufferPolicy.bufferCoarseBucket);
  const bViol = bufferViolations(bufferPolicy, bufMin);
  if (bViol.length > 0) return uncomputed("buffer_invalid", bViol[0]);

  // Gate 6: origin temporal validity
  const oViol = originValidityViolations(originTemporalValidity);
  if (oViol.length > 0) return uncomputed("origin_temporal_invalid", oViol[0]);
  const originKind = originTemporalValidity.originKind;
  if (!isComputedOriginKind(originKind)) {
    return uncomputed("origin_temporal_invalid", "origin kind not computed-grade");
  }

  // Gate 7: subtraction（1 回・duration+buffer 和・range guard）
  const totalMin = durMin + (bufMin as number);
  if (totalMin > MAX_TOTAL_SUBTRACTION_MINUTES) return uncomputed("subtraction_out_of_range", "total subtraction exceeds max");
  const leaveByStr = instantMinusMinutes(arrivalTarget.arrivalTargetInstant, totalMin);
  if (leaveByStr === null) return uncomputed("subtraction_out_of_range", "subtraction produced invalid/out-of-range instant");
  if (!leaveByAtOrBeforeArrival(leaveByStr, arrivalTarget.arrivalTargetInstant)) {
    return uncomputed("subtraction_failed", "leaveBy after arrival");
  }

  // computed 構築（source は durationValue.basis = PlanningGradeTimeSource）
  const timeEvidence: LeaveByEvidenceRef[] = durationValue.evidenceRefs.map((e) => ({
    code: e.code,
    capability: "time_estimate" as const,
    source: durationValue.basis,
  }));
  const arrivalEvidence: LeaveByEvidenceRef[] = arrivalTarget.evidenceRefs.map((c) => ({
    code: c,
    capability: "arrival_target" as const,
    source: "event_anchor" as const,
  }));
  const bufferEvidence: LeaveByEvidenceRef[] = bufferPolicy.evidenceRefs.map((c) => ({
    code: c,
    capability: "buffer" as const,
    source: "event_anchor" as const,
  }));
  const originEvidence: LeaveByEvidenceRef = {
    code: originTemporalValidity.originEvidenceRef,
    capability: "origin",
    source: "origin_inference",
  };

  const bufferOut: LeaveByBufferPolicyV0 = {
    bufferPolicyId: bufferPolicy.bufferPolicyId,
    bufferKind: bufferPolicy.bufferKind,
    bufferCoarseBucket: bufferPolicy.bufferCoarseBucket,
    source: bufferPolicy.bufferScopeRef,
    evidenceRefs: bufferEvidence,
    confidence: bufferPolicy.confidence,
    staleness: "fresh", // freshness=valid を gate 5 で確認済
    displayPolicy: "internalReference",
  };

  const computed = createComputedLeaveBy({
    subjectNodeId: node,
    leaveByInstant: { instant: leaveByStr, timezone: "JST" },
    source: durationValue.basis,
    timeContract: {
      timezone: "JST",
      subjectiveDate: capability.identity.subjectiveDate ?? "",
      targetEventDate: arrivalTarget.targetEventDate,
      arrivalTargetInstant: arrivalTarget.arrivalTargetInstant,
      evaluatedAt: input.evaluatedAt,
    },
    sourceTimeEstimateRef: durationValue.binding.routeEtaSupplyId,
    buffer: bufferOut,
    bufferRef: bufferPolicy.bufferPolicyId,
    originUsabilityKind: originKind,
    computedAt: input.computedAt,
    evidenceRefs: timeEvidence.concat(arrivalEvidence, bufferEvidence, [originEvidence]),
  });

  // walker fail-loud: forged/不整合の computed は emit せず uncomputed に倒す
  if (leaveByComputationViolations(computed).length > 0) {
    return uncomputed("subtraction_failed", "computed object failed leaveBy walker");
  }
  return computed;
}
