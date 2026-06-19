/**
 * RD3g-P1 — **L2 dev-only departure line candidate** の safe boolean（`departureLineCandidatePresent`）。
 *   consume loop の internal computed object に Gate B 全 AND を適用し、computed leaveBy が存在するかだけを boolean で返す。
 *   exact instant / leaveByInstant / timeContract / *Ref / durationValue / capability は一切返さない（boolean だけ）。
 * 正本設計: docs/reality-departure-line-boundary-design-rd3g-0.md（RD3g-P1）
 */
import { describe, it, expect } from "vitest";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import {
  deriveOperatorPreviewDepartureLinePresence,
  deriveOperatorPreviewLeaveByComputedPresent,
  gateBSatisfied,
  type OperatorPreviewLeaveByPresenceInputV0,
} from "@/lib/plan/realityCore/operatorPreviewLeaveByPresence";
import {
  consumeDurationConfirmationForLeaveBy,
  type OperatorSeedSupplyContextV0,
} from "@/lib/plan/realityCore/operatorSeedConsume";
import type { LeaveByComputationV0 } from "@/lib/plan/realityCore/leaveByComputation";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import type { DurationConfirmationRowV0 } from "@/lib/plan/realityCore/durationConfirmation";

const REF = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00
const SUBJ = "2026-06-12";
const INSTANT = makeRealityInstantJst(REF);
const EVAL = `${INSTANT.calendarDate}T${INSTANT.wallClockHHMM}:00+09:00`;
const OP = "op-user-1";
const ERN = (id: string) => `ern:${SUBJ}:${id}`;

function oneOff(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return { anchorKind: "one_off", userId: OP, sourceId: "src-real", title: "予定", date: SUBJ, rigidity: "soft", confirmedAt: "2026-06-01T00:00:00.000Z", ...over } as unknown as ExternalAnchor;
}
const TARGET = oneOff({ id: "tgt", startTime: "14:00", endTime: "15:00", startTimeSource: "user_explicit" });
const PREV = oneOff({ id: "prv", startTime: "09:00", endTime: "10:00", startTimeSource: "user_explicit", locationText: "渋谷" });

function row(over: Partial<DurationConfirmationRowV0> = {}, scopeOver: Partial<DurationConfirmationRowV0["scope"]> = {}): DurationConfirmationRowV0 {
  return {
    id: "dc-1", userId: OP, sourceAnchorRef: null,
    scope: { targetNodeId: ERN("tgt"), originRef: "opaque-o", destinationRef: "opaque-d", transportMode: "transit", timeBand: null, subjectiveDate: SUBJ, temporalScopeRef: "tsr-1", routeEtaSupplyId: null, providerVersion: "v1", ...scopeOver },
    durationUpperBoundMinutes: 20, durationLowerBoundMinutes: null, durationBasis: "user_confirmed",
    governance: { provenanceKind: "operator_seed", actorType: "operator", environment: "staging", learningEligible: false, productionEligible: false, confirmedBy: OP, confirmedAt: "2026-06-12T08:00:00+09:00", createdBySlice: "RD3g-P1", sourceRefs: ["opaque-src"], evidenceRefs: ["opaque-ev"] },
    freshnessStatus: "fresh", validUntil: null, supersededBy: null, revokedAt: null, ...over,
  };
}
const baseInput = (rows: DurationConfirmationRowV0[], dayAnchors: ExternalAnchor[]): OperatorPreviewLeaveByPresenceInputV0 => ({
  dayAnchors, durationConfirmationRows: rows, subjectiveDate: SUBJ, evaluatedAtIso: EVAL, consumingInstant: INSTANT, nowIso: EVAL,
});

describe("RD3g-P1 #1 departure candidate presence（integration・pipeline）", () => {
  it("#1 valid（user_explicit target+origin + seed）→ departureLineCandidatePresent=true", async () => {
    expect(await deriveOperatorPreviewDepartureLinePresence(baseInput([row()], [PREV, TARGET]))).toBe(true);
  });
  it("#1b 実 DB format（HH:MM:SS）でも true（壁B fix と整合）", async () => {
    const tgtSec = oneOff({ id: "tgt", startTime: "14:00:00", endTime: "15:00:00", startTimeSource: "user_explicit" });
    const prvSec = oneOff({ id: "prv", startTime: "09:00:00", endTime: "10:00:00", startTimeSource: "user_explicit", locationText: "渋谷" });
    expect(await deriveOperatorPreviewDepartureLinePresence(baseInput([row()], [prvSec, tgtSec]))).toBe(true);
  });
  it("#2 confirmation row なし → false", async () => {
    expect(await deriveOperatorPreviewDepartureLinePresence(baseInput([], [PREV, TARGET]))).toBe(false);
  });
  it("#15 arrival heuristic/default 由来（assumed_default）→ uncomputed → false（壁C・honest 拒否）", async () => {
    const tgtDefault = oneOff({ id: "tgt", startTime: "14:00", endTime: "15:00", startTimeSource: "assumed_default" });
    expect(await deriveOperatorPreviewDepartureLinePresence(baseInput([row()], [PREV, tgtDefault]))).toBe(false);
  });
  it("#16 stale / revoked / superseded row → false", async () => {
    expect(await deriveOperatorPreviewDepartureLinePresence(baseInput([row({ freshnessStatus: "stale" })], [PREV, TARGET]))).toBe(false);
    expect(await deriveOperatorPreviewDepartureLinePresence(baseInput([row({ revokedAt: "2026-06-12T08:30:00+09:00" })], [PREV, TARGET]))).toBe(false);
    expect(await deriveOperatorPreviewDepartureLinePresence(baseInput([row({ supersededBy: "dc-2" })], [PREV, TARGET]))).toBe(false);
  });
  it("#17 origin sibling 不在（origin unknown）→ false", async () => {
    expect(await deriveOperatorPreviewDepartureLinePresence(baseInput([row()], [TARGET]))).toBe(false);
  });
  it("#17b origin sibling が assumed_default（前 event start 非 confirmed）→ origin invalid → false", async () => {
    const prvDefault = oneOff({ id: "prv", startTime: "09:00", endTime: "10:00", startTimeSource: "assumed_default", locationText: "渋谷" });
    expect(await deriveOperatorPreviewDepartureLinePresence(baseInput([row()], [prvDefault, TARGET]))).toBe(false);
  });
  it("#18 scope mismatch（targetNodeId 不一致 / 別 subjectiveDate）→ false", async () => {
    expect(await deriveOperatorPreviewDepartureLinePresence(baseInput([row({}, { targetNodeId: ERN("no-such") })], [PREV, TARGET]))).toBe(false);
    expect(await deriveOperatorPreviewDepartureLinePresence(baseInput([row({}, { subjectiveDate: "2026-06-13" })], [PREV, TARGET]))).toBe(false);
  });
  it("返り値は boolean のみ（internal object/instant を返さない）", async () => {
    const r = await deriveOperatorPreviewDepartureLinePresence(baseInput([row()], [PREV, TARGET]));
    expect(typeof r).toBe("boolean");
  });
});

describe("RD3g-P1 #2 safe boolean(L1) と departure(L2) の関係", () => {
  it("valid → 両方 true（L2 は L1 の computed 存在に Gate B を上乗せ）", async () => {
    const input = baseInput([row()], [PREV, TARGET]);
    expect(await deriveOperatorPreviewLeaveByComputedPresent(input)).toBe(true);
    expect(await deriveOperatorPreviewDepartureLinePresence(input)).toBe(true);
  });
  it("uncomputed（assumed_default）→ 両方 false", async () => {
    const tgtDefault = oneOff({ id: "tgt", startTime: "14:00", endTime: "15:00", startTimeSource: "assumed_default" });
    const input = baseInput([row()], [PREV, tgtDefault]);
    expect(await deriveOperatorPreviewLeaveByComputedPresent(input)).toBe(false);
    expect(await deriveOperatorPreviewDepartureLinePresence(input)).toBe(false);
  });
});

// ── Gate B 単体（genuine computed object を作って各条件の gating を固定）──
const supplyCtx: OperatorSeedSupplyContextV0 = {
  evaluatedAtIso: "2026-06-12T09:00:00+09:00",
  arrival: { arrivalTargetInstant: "2026-06-12T14:00:00+09:00", arrivalTargetRef: "arr-1", targetEventDate: "2026-06-12", startTimeSource: "user_explicit", sourceRefs: ["src-a"], evidenceRefs: ["ev-a"] },
  buffer: { bufferPolicyId: "buf-1", bufferScopeRef: "bscope-1", rigidity: "hard", highCommitment: false, freshness: "valid", sourceRefs: ["src-b"], evidenceRefs: ["ev-b"] },
  origin: { originInferenceStage: "previous_event_end", dayGraphDate: "2026-06-12", dayGraphSnapshotId: "snap-1", previousEvent: { nodeId: "prev", endTimeHHMM: "09:00", durationSource: "explicit", boundaryClipped: false, locationText: "office", sensitive: false, startTimeSource: "user_explicit", anchorRef: "anchor-prev" } },
};
const reqScope = { targetNodeId: ERN("tgt"), subjectiveDate: SUBJ, transportMode: "transit" as const, temporalScopeRef: "tsr-1" };

async function genuineComputed(): Promise<LeaveByComputationV0> {
  const cand = await consumeDurationConfirmationForLeaveBy([row()], reqScope, supplyCtx, "2026-06-12T09:00:00+09:00");
  if (cand === null) throw new Error("fixture: expected computed candidate");
  return cand.leaveBy;
}

describe("RD3g-P1 #3 gateBSatisfied 単体（genuine computed の各条件 gating）", () => {
  it("genuine computed → gateBSatisfied true", async () => {
    const c = await genuineComputed();
    expect(c.status).toBe("computed");
    expect(gateBSatisfied(c)).toBe(true);
  });
  it("degraded → false（status / refs / originEvidence / timeEstimate / source / originKind）", async () => {
    const c = await genuineComputed();
    expect(gateBSatisfied({ ...c, status: "uncomputed" })).toBe(false);
    expect(gateBSatisfied({ ...c, sourceTimeEstimateRef: null })).toBe(false);
    expect(gateBSatisfied({ ...c, bufferRef: null })).toBe(false);
    expect(gateBSatisfied({ ...c, originEvidencePresent: false })).toBe(false);
    expect(gateBSatisfied({ ...c, timeEstimateUsableForPlanning: false })).toBe(false);
    expect(gateBSatisfied({ ...c, source: "none" })).toBe(false); // heuristic/none 排除
    expect(gateBSatisfied({ ...c, originUsabilityKind: "current_location_candidate" })).toBe(false); // currentLocation 排除
    expect(gateBSatisfied({ ...c, originUsabilityKind: "unknown" })).toBe(false);
  });
});
