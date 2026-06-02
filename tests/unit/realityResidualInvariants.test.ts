import { describe, it, expect } from "vitest";
import { stepHysteresis, INITIAL_HYSTERESIS, type HysteresisInput, type HysteresisState } from "@/lib/plan/reality/hysteresis";
import { decideCadence } from "@/lib/plan/reality/monitoring";
import { updateAuthority, updateDomainAuthority, autoAllowedAt } from "@/lib/plan/reality/authority-escalation";
import { classifyGap } from "@/lib/plan/reality/gap-meaning";
import { recomputeAfterDrift, type DayNode } from "@/lib/plan/reality/post-event-recompute";
import { checkDecideDeliverSeparation } from "@/lib/plan/reality/invariant-check";

// ---------- INV-6 Hysteresis ----------
describe("INV-6 hysteresis — no flapping (pure state machine)", () => {
  const base = (p: Partial<HysteresisInput>): HysteresisInput => ({
    risk: 0,
    nowMin: 0,
    fireThreshold: 0.7,
    clearThreshold: 0.4,
    dwellMin: 2,
    minReAlertMin: 5,
    deadlineMin: 100,
    ...p,
  });

  it("does not fire until risk≥X persists for dwell", () => {
    let s: HysteresisState = INITIAL_HYSTERESIS;
    let r = stepHysteresis(s, base({ risk: 0.8, nowMin: 0 }));
    expect(r.fire).toBe(false); // dwell not met
    s = r.state;
    r = stepHysteresis(s, base({ risk: 0.8, nowMin: 3 })); // 3 ≥ dwell 2
    expect(r.fire).toBe(true);
    expect(r.state.firing).toBe(true);
  });

  it("deadband: a small dip (Y<risk<X) keeps it firing (no flap)", () => {
    let s = stepHysteresis(INITIAL_HYSTERESIS, base({ risk: 0.8, nowMin: 0 })).state;
    s = stepHysteresis(s, base({ risk: 0.8, nowMin: 3 })).state; // firing
    const r = stepHysteresis(s, base({ risk: 0.5, nowMin: 5 })); // between Y(0.4) and X(0.7)
    expect(r.state.firing).toBe(true);
    expect(r.fire).toBe(false);
  });

  it("clears only when risk drops to ≤Y (and not latched)", () => {
    let s = stepHysteresis(INITIAL_HYSTERESIS, base({ risk: 0.8, nowMin: 0 })).state;
    s = stepHysteresis(s, base({ risk: 0.8, nowMin: 3 })).state;
    const r = stepHysteresis(s, base({ risk: 0.3, nowMin: 6 })); // ≤ Y
    expect(r.state.firing).toBe(false);
  });

  it("latches near deadline: does not clear even if risk dips", () => {
    let s = stepHysteresis(INITIAL_HYSTERESIS, base({ risk: 0.8, nowMin: 92, deadlineMin: 100, latchWindowMin: 10 })).state;
    s = stepHysteresis(s, base({ risk: 0.8, nowMin: 94, deadlineMin: 100, latchWindowMin: 10 })).state; // fires (dwell met)
    expect(s.firing).toBe(true);
    const r = stepHysteresis(s, base({ risk: 0.1, nowMin: 96, deadlineMin: 100, latchWindowMin: 10 }));
    expect(r.state.latched).toBe(true);
    expect(r.state.firing).toBe(true); // latched → no clear
  });
});

// ---------- INV-9 Monitoring economy ----------
describe("INV-9 monitoring economy — not everything is high_frequency", () => {
  it("low-stakes, confident, far → scheduled_once (cheap)", () => {
    expect(decideCadence({ stakes: "low", confidence: 0.8, actionable: true, timeToEventMin: 300 })).toBe("scheduled_once");
  });
  it("high-stakes OR near OR low-confidence → high_frequency", () => {
    expect(decideCadence({ stakes: "high", confidence: 0.9, actionable: true, timeToEventMin: 300 })).toBe("high_frequency");
    expect(decideCadence({ stakes: "low", confidence: 0.3, actionable: true, timeToEventMin: 300 })).toBe("high_frequency");
    expect(decideCadence({ stakes: "low", confidence: 0.9, actionable: true, timeToEventMin: 20 })).toBe("high_frequency");
  });
  it("low battery (low stakes) downgrades; no geofence budget → foreground_only; no action → none", () => {
    expect(decideCadence({ stakes: "low", confidence: 0.9, actionable: true, timeToEventMin: 60, lowBattery: true })).toBe("scheduled_once");
    expect(decideCadence({ stakes: "high", confidence: 0.9, actionable: true, timeToEventMin: 60, needsLocation: true, geofenceBudgetAvailable: false })).toBe("foreground_only");
    expect(decideCadence({ stakes: "low", confidence: 0.9, actionable: false, timeToEventMin: 60 })).toBe("none");
  });
});

// ---------- INV-13 Authority earned ----------
describe("INV-13 authority is earned (gradual, revocable, per-domain)", () => {
  it("rises gradually (no jump 0→5)", () => {
    expect(updateAuthority(0, "adopted")).toBe(1);
    expect(updateAuthority(1, "accuracy_confirmed")).toBe(2);
  });
  it("revokes on reject/undo", () => {
    expect(updateAuthority(3, "rejected")).toBe(1);
    expect(updateAuthority(2, "undone")).toBe(0);
    expect(updateAuthority(2, "ignored")).toBe(1);
  });
  it("clamps to 0..5", () => {
    expect(updateAuthority(5, "adopted")).toBe(5);
    expect(updateAuthority(0, "rejected")).toBe(0);
  });
  it("is per-domain (updating one does not change another)", () => {
    const map = updateDomainAuthority({ travel: 2, work: 3 }, "travel", "rejected");
    expect(map.travel).toBe(0);
    expect(map.work).toBe(3);
  });
  it("autoAllowedAt gates by required level", () => {
    expect(autoAllowedAt(2, 2)).toBe(true);
    expect(autoAllowedAt(1, 2)).toBe(false);
  });
});

// ---------- INV-17 Gap meaning ----------
describe("INV-17 gap meaning — not always 'fill with work'", () => {
  it("gap < travel → dangerous_tight", () => {
    expect(classifyGap({ gapLengthMin: 20, nextTravelMin: 30, isBeforeImportant: false, inMealWindow: false, recoveryNeed: 0, energy: 0.8 })).toBe("dangerous_tight");
  });
  it("meal window + ample → meal", () => {
    expect(classifyGap({ gapLengthMin: 60, nextTravelMin: 10, isBeforeImportant: false, inMealWindow: true, recoveryNeed: 0.2, energy: 0.6 })).toBe("meal");
  });
  it("high recovery need → recovery (not work)", () => {
    expect(classifyGap({ gapLengthMin: 60, nextTravelMin: 5, isBeforeImportant: false, inMealWindow: false, recoveryNeed: 0.8, energy: 0.5 })).toBe("recovery");
  });
  it("low energy → free_time (intentionally not filled)", () => {
    expect(classifyGap({ gapLengthMin: 90, nextTravelMin: 5, isBeforeImportant: false, inMealWindow: false, recoveryNeed: 0.2, energy: 0.2 })).toBe("free_time");
  });
  it("ample + energy → work; before important + tight → travel_buffer", () => {
    expect(classifyGap({ gapLengthMin: 90, nextTravelMin: 10, isBeforeImportant: false, inMealWindow: false, recoveryNeed: 0.1, energy: 0.8 })).toBe("work");
    expect(classifyGap({ gapLengthMin: 25, nextTravelMin: 15, isBeforeImportant: true, inMealWindow: false, recoveryNeed: 0.1, energy: 0.8 })).toBe("travel_buffer");
  });
});

// ---------- INV-20 Post-event recompute ----------
describe("INV-20 post-event recompute — cascade to downstream", () => {
  const nodes: DayNode[] = [
    { id: "a", startMin: 540, endMin: 600, importance: "normal", hard: false },
    { id: "b", startMin: 600, endMin: 660, importance: "high", hard: false },
    { id: "c", startMin: 720, endMin: 780, importance: "normal", hard: false },
  ];

  it("overrun cascades to overlapping downstream and flags repair", () => {
    const r = recomputeAfterDrift(nodes, "a", 620); // a ends 20 late, overlaps b (starts 600)
    expect(r.shiftMin).toBe(20);
    expect(r.impactedIds).toContain("b");
    expect(r.needsRepair).toBe(true);
    expect(r.breaksHardOrImportant).toBe(true); // b is high importance
  });

  it("early finish frees time (no repair)", () => {
    const r = recomputeAfterDrift(nodes, "a", 580);
    expect(r.shiftMin).toBe(-20);
    expect(r.needsRepair).toBe(false);
  });

  it("overrun absorbed by a gap → no impact", () => {
    const sparse: DayNode[] = [
      { id: "a", startMin: 540, endMin: 600, importance: "normal", hard: false },
      { id: "c", startMin: 720, endMin: 780, importance: "normal", hard: false },
    ];
    const r = recomputeAfterDrift(sparse, "a", 615); // ends 615, c starts 720 → absorbed
    expect(r.impactedIds).toHaveLength(0);
    expect(r.needsRepair).toBe(false);
  });
});

// ---------- INV-2 DECIDE/DELIVER separation ----------
describe("INV-2 DECIDE/DELIVER separation (structural)", () => {
  it("score artifact has no delivery field; delivery has no score field", () => {
    const score = { total: 5, terms: [] };
    const delivery = { mode: "push", chain: ["push", "silent"], reasons: [], allowedActions: ["one_tap_confirm"] };
    expect(checkDecideDeliverSeparation(score, delivery).pass).toBe(true);
  });
  it("fails if score leaks a delivery field", () => {
    expect(checkDecideDeliverSeparation({ total: 5, mode: "push" }, { mode: "push" }).pass).toBe(false);
  });
  it("fails if delivery leaks a score field", () => {
    expect(checkDecideDeliverSeparation({ total: 5, terms: [] }, { mode: "push", total: 5 }).pass).toBe(false);
  });
});
