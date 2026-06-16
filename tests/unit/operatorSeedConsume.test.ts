/**
 * RD3x-P1 — operator seed consume loop（confirmation row → durationValue → supply → computed leaveBy → attach）pure（2026-06-16）
 * 正本設計: docs/reality-operator-seed-activation-plan-rd3x-0.md
 *
 * 核: 書いた operator seed が **computed leaveBy を生む**ことを証明（loop closure）。durationValue は confirmation 由来・
 *   arrival/buffer/origin は event-derived（fake しない）。scope mismatch/stale/malformed は uncomputed。provenance は value に流れない。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  consumeDurationConfirmationForLeaveBy,
  type OperatorSeedSupplyContextV0,
} from "@/lib/plan/realityCore/operatorSeedConsume";
import { buildDurationValueFromConfirmation } from "@/lib/plan/realityCore/durationConfirmationAdapter";
import { assembleLeaveByBindings } from "@/lib/plan/realityCore/leaveByAssembly";
import type { DurationConfirmationRowV0, DurationConfirmationScopeV0, DurationConfirmationGovernanceV0 } from "@/lib/plan/realityCore/durationConfirmation";
import type { EventRealityNodeV0 } from "@/lib/plan/realityCore/eventRealityNode";

const ERN_ID = "ern:2026-06-12:a1";
const scope = (over: Partial<DurationConfirmationScopeV0> = {}): DurationConfirmationScopeV0 => ({
  targetNodeId: ERN_ID, originRef: "opaque-o1", destinationRef: "opaque-d1", transportMode: "transit",
  timeBand: null, subjectiveDate: "2026-06-12", temporalScopeRef: "tsr-1", routeEtaSupplyId: null, providerVersion: "v1", ...over,
});
const gov = (over: Partial<DurationConfirmationGovernanceV0> = {}): DurationConfirmationGovernanceV0 => ({
  provenanceKind: "operator_seed", actorType: "operator", environment: "staging", learningEligible: false, productionEligible: false,
  confirmedBy: "operator-1", confirmedAt: "2026-06-12T08:00:00+09:00", createdBySlice: "RD3c-P3a", sourceRefs: ["opaque-src"], evidenceRefs: ["opaque-ev"], ...over,
});
const row = (over: Partial<DurationConfirmationRowV0> = {}, scopeOver: Partial<DurationConfirmationScopeV0> = {}, govOver: Partial<DurationConfirmationGovernanceV0> = {}): DurationConfirmationRowV0 => ({
  id: "dc-1", userId: "user-1", sourceAnchorRef: null, scope: scope(scopeOver),
  durationUpperBoundMinutes: 20, durationLowerBoundMinutes: null, durationBasis: "user_confirmed",
  governance: gov(govOver), freshnessStatus: "fresh", validUntil: null, supersededBy: null, revokedAt: null, ...over,
});
// honest event-derived supply（arrival = event start / buffer = rigidity / origin = previous_event_end）。fake route data でない。
const supplyCtx: OperatorSeedSupplyContextV0 = {
  evaluatedAtIso: "2026-06-12T09:00:00+09:00",
  arrival: { arrivalTargetInstant: "2026-06-12T14:00:00+09:00", arrivalTargetRef: "arr-1", targetEventDate: "2026-06-12", startTimeSource: "user_explicit", sourceRefs: ["src-a"], evidenceRefs: ["ev-a"] },
  buffer: { bufferPolicyId: "buf-1", bufferScopeRef: "bscope-1", rigidity: "hard", highCommitment: false, freshness: "valid", sourceRefs: ["src-b"], evidenceRefs: ["ev-b"] },
  origin: { originInferenceStage: "previous_event_end", dayGraphDate: "2026-06-12", dayGraphSnapshotId: "snap-1", previousEvent: { nodeId: "prev", endTimeHHMM: "09:00", durationSource: "explicit", boundaryClipped: false, locationText: "office", sensitive: false, startTimeSource: "user_explicit", anchorRef: "anchor-prev" } },
};
const reqScope = { targetNodeId: ERN_ID, subjectiveDate: "2026-06-12", transportMode: "transit" as const, temporalScopeRef: "tsr-1" };
const NOW = "2026-06-12T09:00:00+09:00";

describe("RD3x-P1 #1/#2 confirmation → durationValue", () => {
  it("#1 valid row → durationValue non-null", async () => {
    const dv = await buildDurationValueFromConfirmation(row());
    expect(dv).not.toBeNull();
    expect(dv!.durationValue.basis).toBe("user_confirmed");
    expect(dv!.durationValue.usableForLeaveByComputation).toBe(true);
  });
  it("#2 operator_seed row → durationValue non-null・learningEligible は row に残り value に流れない", async () => {
    const r = row({}, {}, { provenanceKind: "operator_seed", learningEligible: false });
    const dv = await buildDurationValueFromConfirmation(r);
    expect(dv).not.toBeNull();
    expect(JSON.stringify(dv!.durationValue).toLowerCase()).not.toContain("operator");
    expect(JSON.stringify(dv!.durationValue).toLowerCase()).not.toContain("learning");
    expect(r.governance.learningEligible).toBe(false); // governance は row（storage 層）に留まる
  });
});

describe("RD3x-P1 #3/#4 scope mismatch / stale → uncomputed", () => {
  it("#3 scope mismatch → null", async () => {
    expect(await consumeDurationConfirmationForLeaveBy([row()], { ...reqScope, targetNodeId: "ern:other" }, supplyCtx, NOW)).toBeNull();
    expect(await consumeDurationConfirmationForLeaveBy([row()], { ...reqScope, transportMode: "car" }, supplyCtx, NOW)).toBeNull();
  });
  it("#4 stale / revoked / superseded row → null", async () => {
    expect(await consumeDurationConfirmationForLeaveBy([row({ freshnessStatus: "stale" })], reqScope, supplyCtx, NOW)).toBeNull();
    expect(await consumeDurationConfirmationForLeaveBy([row({ validUntil: "2026-06-12T07:00:00+09:00" })], reqScope, supplyCtx, NOW)).toBeNull();
    expect(await consumeDurationConfirmationForLeaveBy([row({ revokedAt: "2026-06-12T08:30:00+09:00" })], reqScope, supplyCtx, NOW)).toBeNull();
  });
  it("malformed row（upper %5≠0）→ null", async () => {
    expect(await consumeDurationConfirmationForLeaveBy([row({ durationUpperBoundMinutes: 23 })], reqScope, supplyCtx, NOW)).toBeNull();
  });
});

describe("RD3x-P1 #5/#6/#7/#8 supply complete → computed → attach", () => {
  it("#5/#6 valid → supply complete → LeaveByComputation computed", async () => {
    const cand = await consumeDurationConfirmationForLeaveBy([row()], reqScope, supplyCtx, NOW);
    expect(cand).not.toBeNull();
    expect(cand!.leaveBy.status).toBe("computed");
    expect(cand!.eventRealityNodeId).toBe(ERN_ID);
  });
  it("origin null（chain 起点）→ supply incomplete → uncomputed（fake origin を作らない）", async () => {
    const cand = await consumeDurationConfirmationForLeaveBy([row()], reqScope, { ...supplyCtx, origin: null }, NOW);
    expect(cand).toBeNull();
  });
  it("#7/#8 computed leaveBy → assembleLeaveByBindings が ERN へ attach・既存 ern.leaveBy 不変", async () => {
    const cand = await consumeDurationConfirmationForLeaveBy([row()], reqScope, supplyCtx, NOW);
    const ern = { eventRealityNodeId: ERN_ID, subjectiveDate: "2026-06-12", leaveBy: { value: null, whyUnresolved: ["eta_source_missing"] } } as unknown as EventRealityNodeV0;
    const consuming = { nowInstant: "2026-06-12T09:00:00+09:00", timezone: "Asia/Tokyo", wallClockHHMM: "09:00", calendarDate: "2026-06-12", subjectiveDate: "2026-06-12", minuteOfSubjectiveDay: 540 };
    const out = assembleLeaveByBindings({ eventRealityNodes: [ern], supplyCandidates: [cand!], consumingInstant: consuming, ernScopeByNodeId: { [ERN_ID]: cand!.computedScope } });
    const attached = out.eventRealityNodes[0]!;
    expect(attached.leaveByComputed).toBeDefined(); // #7 attach（direct assign でなく seam 経由）
    expect(attached.leaveByComputed!.status).toBe("computed");
    expect(attached.leaveBy).toEqual(ern.leaveBy); // #8 既存 display leaveBy 不変
  });
});

describe("RD3x-P1 #9-#18 non-load-bearing 境界（source-scan）", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const consumeCode = strip(fs.readFileSync(path.join(process.cwd(), "lib/plan/realityCore/operatorSeedConsume.ts"), "utf8"));
  it("#9-#14 consume は MovementReality/Feasibility/Risk/Permission/Surface/Delivery を import しない", () => {
    for (const t of ["movementReality", "feasibilityJudgment", "collapseRisk", "interventionEligibility", "interventionDecision", "surfaceProjection", "copySurface", "deliveryGate", "movementLeaveByReconcile"]) {
      expect(consumeCode.includes(t)).toBe(false);
    }
  });
  it("#15/#16/#17/#18 exact timestamp surface / departure / notification / product / API / DB を持たない", () => {
    const low = consumeCode.toLowerCase();
    for (const t of ["departure", "notification", "/plan/page", "alttab", "next/server", "react", ".from(", "supabase", "createclient", "fetch(", "new date(", "date.now"]) {
      expect(low.includes(t)).toBe(false);
    }
  });
});
