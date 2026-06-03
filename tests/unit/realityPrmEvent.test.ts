import { describe, it, expect } from "vitest";
import {
  defaultPolarity,
  effectivePolarity,
  isNegativeSignal,
  isPositiveSignal,
  isDriftSignal,
  requiresSourceTrace,
  computeDedupeKey,
  dedupeEvents,
  validatePrmEvent,
  type PrmEvent,
  type PrmEventKind,
} from "@/lib/plan/reality/prm-event";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";

const trace: SourceTrace = { kind: "seed", ref: "seed_1", reason: "企画が目的", confidence: 0.8 };

function ev(kind: PrmEventKind, p: Partial<PrmEvent> = {}): PrmEvent {
  return { eventId: `e_${kind}`, kind, occurredAt: 540, ...p };
}

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

describe("reality/prm-event — kind taxonomy (16 kinds)", () => {
  it("includes all 16 required kinds", () => {
    expect(new Set(ALL_KINDS).size).toBe(16);
  });
});

describe("reality/prm-event — signal polarity (GPT: edited/undo は単純 negative にしない)", () => {
  it("edited is mixed (微調整=学習成功でもある), undo is unknown (誤タップ/外部要因)", () => {
    expect(defaultPolarity("proposal_edited")).toBe("mixed");
    expect(defaultPolarity("undo_performed")).toBe("unknown");
    expect(isNegativeSignal(ev("proposal_edited", { itemId: "a", editedFields: ["startMin"] }))).toBe(false);
    expect(isNegativeSignal(ev("undo_performed", { changeSetId: "cs" }))).toBe(false);
  });

  it("rejected/ignored are negative; adopted is positive", () => {
    expect(isNegativeSignal(ev("proposal_rejected", { itemId: "a" }))).toBe(true);
    expect(isNegativeSignal(ev("proposal_ignored"))).toBe(true);
    expect(isPositiveSignal(ev("proposal_adopted", { itemId: "a", sourceTraces: [trace] }))).toBe(true);
  });

  it("explicit signalPolarity overrides the kind default", () => {
    const e = ev("proposal_edited", { itemId: "a", editedFields: ["startMin"], signalPolarity: "negative" });
    expect(effectivePolarity(e)).toBe("negative");
    expect(isNegativeSignal(e)).toBe(true);
  });

  it("drift signals are structural", () => {
    expect(isDriftSignal("deviation_detected")).toBe(true);
    expect(isDriftSignal("departure_risk_detected")).toBe(true);
    expect(isDriftSignal("proposal_adopted")).toBe(false);
  });
});

describe("reality/prm-event — dedupe / idempotency (過学習防止)", () => {
  it("computeDedupeKey is stable per proposal / change-set", () => {
    expect(computeDedupeKey(ev("proposal_ignored", { proposalId: "p1" }))).toBe("proposal_ignored:p1");
    expect(computeDedupeKey(ev("undo_performed", { changeSetId: "cs1" }))).toBe("undo_performed:cs1");
  });

  it("explicit dedupeKey wins", () => {
    expect(computeDedupeKey(ev("proposal_ignored", { proposalId: "p1", dedupeKey: "fixed" }))).toBe("fixed");
  });

  it("dedupeEvents keeps one per key (3× same ignore → 1)", () => {
    const events = [
      ev("proposal_ignored", { eventId: "a", proposalId: "p1" }),
      ev("proposal_ignored", { eventId: "b", proposalId: "p1" }),
      ev("proposal_ignored", { eventId: "c", proposalId: "p1" }),
      ev("proposal_ignored", { eventId: "d", proposalId: "p2" }),
    ];
    const out = dedupeEvents(events);
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.eventId)).toEqual(["a", "d"]); // first-wins, order preserved
  });
});

describe("reality/prm-event — ignored reason (見て無視 vs 届かず無視)", () => {
  it("carries an ignoredReason to distinguish meaning", () => {
    const seen = ev("proposal_ignored", { proposalId: "p1", ignoredReason: "seen_no_action" });
    const undelivered = ev("proposal_ignored", { proposalId: "p2", ignoredReason: "push_unavailable" });
    expect(seen.ignoredReason).toBe("seen_no_action");
    expect(undelivered.ignoredReason).toBe("push_unavailable");
    // 型として将来区別可能（push_unavailable は強い負シグナルにしない、の判断材料）
    expect(validatePrmEvent(seen).ok).toBe(true);
    expect(validatePrmEvent(undelivered).ok).toBe(true);
  });
});

describe("reality/prm-event — validatePrmEvent (contract)", () => {
  it("accepts well-formed events", () => {
    const ok: PrmEvent[] = [
      ev("proposal_adopted", { itemId: "p1", sourceTraces: [trace] }),
      ev("proposal_rejected", { itemId: "p1" }),
      ev("proposal_ignored", { ignoredReason: "unknown" }),
      ev("proposal_edited", { itemId: "p1", editedFields: ["startMin"] }),
      ev("undo_performed", { changeSetId: "cs1" }),
      ev("plan_item_moved", { itemId: "a", changeSetId: "cs1" }),
      ev("deviation_detected", { itemId: "a", deviation: "behind_pace" }),
      ev("final_check_missed", { itemId: "a" }),
      ev("departure_risk_detected", { itemId: "a", riskLevel: "high" }),
      ev("recovery_core_protected", { itemId: "a", protectionReason: "recovery_core" }),
      ev("source_trace_assigned", { itemId: "a", sourceTraces: [trace] }),
      ev("permission_boundary_hit", { permissionReason: "others" }),
      ev("degradation_mode_entered", { degradationMode: "no_location" }),
    ];
    for (const e of ok) {
      const res = validatePrmEvent(e);
      expect(res.ok, `${e.kind}: ${res.errors.join(", ")}`).toBe(true);
    }
  });

  it("rejects missing eventId / non-finite occurredAt", () => {
    expect(validatePrmEvent({ kind: "proposal_rejected", eventId: "", occurredAt: 1, itemId: "a" }).ok).toBe(false);
    expect(validatePrmEvent({ kind: "proposal_rejected", eventId: "x", occurredAt: NaN, itemId: "a" }).ok).toBe(false);
  });

  it("rejects missing kind-specific required fields", () => {
    expect(validatePrmEvent(ev("proposal_edited", { itemId: "a" })).ok).toBe(false); // editedFields
    expect(validatePrmEvent(ev("undo_performed")).ok).toBe(false); // changeSetId
    expect(validatePrmEvent(ev("plan_item_moved", { itemId: "a" })).ok).toBe(false); // changeSetId
    expect(validatePrmEvent(ev("deviation_detected")).ok).toBe(false); // deviation
    expect(validatePrmEvent(ev("degradation_mode_entered")).ok).toBe(false); // mode
    expect(validatePrmEvent(ev("source_trace_assigned", { itemId: "a" })).ok).toBe(false); // traces
  });

  it("requires source trace for proposal/adoption/add (INV-4/23)", () => {
    const r = validatePrmEvent(ev("proposal_adopted", { itemId: "p1" }));
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("sourceTraces required");
  });

  it("requiresSourceTrace mapping", () => {
    expect(requiresSourceTrace("proposal_adopted")).toBe(true);
    expect(requiresSourceTrace("proposal_rejected")).toBe(false);
  });
});
