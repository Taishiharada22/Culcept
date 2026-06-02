import { describe, it, expect } from "vitest";
import {
  isNegativeSignal,
  isPositiveSignal,
  isDriftSignal,
  requiresSourceTrace,
  validatePrmEvent,
  type PrmEvent,
  type PrmEventKind,
} from "@/lib/plan/reality/prm-event";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";

const trace: SourceTrace = { kind: "seed", ref: "seed_1", reason: "企画が目的", confidence: 0.8 };

const ALL_KINDS: PrmEventKind[] = [
  "proposal_shown",
  "proposal_adopted",
  "proposal_edited",
  "proposal_rejected",
  "proposal_ignored",
  "undo_performed",
  "plan_item_added",
  "plan_item_moved",
  "plan_item_deleted",
  "deviation_detected",
  "final_check_missed",
  "departure_risk_detected",
  "recovery_core_protected",
  "source_trace_assigned",
  "permission_boundary_hit",
  "degradation_mode_entered",
];

describe("reality/prm-event — kind taxonomy (INV-12: 採用だけでなく拒否/無視/編集/undo を学ぶ)", () => {
  it("includes all 16 required kinds", () => {
    expect(new Set(ALL_KINDS).size).toBe(16);
  });

  it("negative signals = rejected / ignored / edited / undo (GPT 強調)", () => {
    expect(isNegativeSignal("proposal_rejected")).toBe(true);
    expect(isNegativeSignal("proposal_ignored")).toBe(true);
    expect(isNegativeSignal("proposal_edited")).toBe(true);
    expect(isNegativeSignal("undo_performed")).toBe(true);
    expect(isNegativeSignal("proposal_adopted")).toBe(false);
  });

  it("positive = adopted, drift = deviation/final_check_missed/departure_risk", () => {
    expect(isPositiveSignal("proposal_adopted")).toBe(true);
    expect(isPositiveSignal("proposal_rejected")).toBe(false);
    expect(isDriftSignal("deviation_detected")).toBe(true);
    expect(isDriftSignal("final_check_missed")).toBe(true);
    expect(isDriftSignal("departure_risk_detected")).toBe(true);
    expect(isDriftSignal("proposal_adopted")).toBe(false);
  });

  it("proposal/adoption/add/assign require source trace (INV-4/23)", () => {
    expect(requiresSourceTrace("proposal_shown")).toBe(true);
    expect(requiresSourceTrace("proposal_adopted")).toBe(true);
    expect(requiresSourceTrace("plan_item_added")).toBe(true);
    expect(requiresSourceTrace("source_trace_assigned")).toBe(true);
    expect(requiresSourceTrace("proposal_rejected")).toBe(false);
  });
});

describe("reality/prm-event — validatePrmEvent (contract)", () => {
  it("accepts well-formed events", () => {
    const ok: PrmEvent[] = [
      { kind: "proposal_adopted", at: 540, itemId: "p1", sourceTraces: [trace] },
      { kind: "proposal_rejected", at: 540, itemId: "p1" },
      { kind: "proposal_ignored", at: 540 },
      { kind: "proposal_edited", at: 540, itemId: "p1", editedFields: ["startMin"] },
      { kind: "undo_performed", at: 540, changeSetId: "cs1" },
      { kind: "plan_item_moved", at: 540, itemId: "a", changeSetId: "cs1" },
      { kind: "deviation_detected", at: 540, itemId: "a", deviation: "behind_pace" },
      { kind: "final_check_missed", at: 540, itemId: "a" },
      { kind: "departure_risk_detected", at: 540, itemId: "a", riskLevel: "high" },
      { kind: "recovery_core_protected", at: 540, itemId: "a", protectionReason: "recovery_core" },
      { kind: "source_trace_assigned", at: 540, itemId: "a", sourceTraces: [trace] },
      { kind: "permission_boundary_hit", at: 540, permissionReason: "others" },
      { kind: "degradation_mode_entered", at: 540, degradationMode: "no_location" },
    ];
    for (const e of ok) {
      const res = validatePrmEvent(e);
      expect(res.ok, `${e.kind}: ${res.errors.join(", ")}`).toBe(true);
    }
  });

  it("rejects missing kind-specific required fields", () => {
    expect(validatePrmEvent({ kind: "proposal_edited", at: 1, itemId: "a" }).ok).toBe(false); // editedFields
    expect(validatePrmEvent({ kind: "undo_performed", at: 1 }).ok).toBe(false); // changeSetId
    expect(validatePrmEvent({ kind: "plan_item_moved", at: 1, itemId: "a" }).ok).toBe(false); // changeSetId
    expect(validatePrmEvent({ kind: "deviation_detected", at: 1 }).ok).toBe(false); // deviation
    expect(validatePrmEvent({ kind: "departure_risk_detected", at: 1, itemId: "a" }).ok).toBe(false); // riskLevel
    expect(validatePrmEvent({ kind: "degradation_mode_entered", at: 1 }).ok).toBe(false); // mode
    expect(validatePrmEvent({ kind: "permission_boundary_hit", at: 1 }).ok).toBe(false); // reason
    expect(validatePrmEvent({ kind: "recovery_core_protected", at: 1, itemId: "a" }).ok).toBe(false); // protectionReason
    expect(validatePrmEvent({ kind: "source_trace_assigned", at: 1, itemId: "a" }).ok).toBe(false); // traces
  });

  it("requires source trace for proposal/adoption/add (INV-4/23)", () => {
    const r = validatePrmEvent({ kind: "proposal_adopted", at: 1, itemId: "p1" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("sourceTraces required");
  });

  it("rejects non-finite timestamp", () => {
    expect(validatePrmEvent({ kind: "proposal_rejected", at: NaN, itemId: "a" }).ok).toBe(false);
    expect(validatePrmEvent({ kind: "proposal_rejected", at: Infinity, itemId: "a" }).ok).toBe(false);
  });
});
