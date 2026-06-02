import { describe, it, expect } from "vitest";
import {
  checkAllInvariants,
  invariantViolations,
  allInvariantsHold,
  checkWholePart,
  checkRecoveryCore,
  checkDailyPlanQuality,
  checkSourceTraceability,
  checkReversibility,
  checkActionability,
  checkPermissionBoundary,
  checkModeCorrectness,
  type DecisionContext,
  type InvariantId,
} from "@/lib/plan/reality/invariant-check";
import type { BestActionCandidate, CandidateMetrics } from "@/lib/plan/reality/best-action";
import type { ChangeSet } from "@/lib/plan/reality/change-set";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";
import type { DeliveryDecision } from "@/lib/plan/reality/receptivity-gate";

const trace: SourceTrace = { kind: "seed", ref: "s1", reason: "目的", confidence: 0.8 };

function goodChangeSet(): ChangeSet {
  return {
    id: "cs",
    ops: [{ kind: "add", itemId: "a", after: { itemId: "a", startMin: 540, endMin: 600 } }],
    reason: "test",
    sourceTraces: [trace],
  };
}

function metrics(p: Partial<CandidateMetrics> = {}): CandidateMetrics {
  return {
    feasible: true,
    wholePartCoherent: true,
    recoveryProtected: true,
    deadlineSatisfied: true,
    goalAttainment: 0.8,
    rhythmFit: 0.7,
    slackHealth: 0.7,
    overpack: 0.1,
    contextSwitches: 1,
    instability: 0,
    correctionMisalignment: 0.1,
    ...p,
  };
}

function candidate(p: Partial<BestActionCandidate> = {}): BestActionCandidate {
  return { id: "c", changeSet: goodChangeSet(), sourceTraces: [trace], metrics: metrics(), proposedDisposition: "confirm", ...p };
}

function delivery(mode: DeliveryDecision["mode"] = "push", actions: DeliveryDecision["allowedActions"] = ["one_tap_confirm"]): DeliveryDecision {
  return { mode, chain: [mode, "silent"], reasons: [], allowedActions: actions };
}

function ctx(p: Partial<DecisionContext> = {}): DecisionContext {
  return { mode: "repair", candidate: candidate(), delivery: delivery(), intervened: true, conditionPresent: true, ...p };
}

const violationIds = (c: DecisionContext): InvariantId[] => invariantViolations(c).map((r) => r.id);

describe("reality/invariant-check — a clean decision holds all invariants", () => {
  it("good context: no violations", () => {
    expect(allInvariantsHold(ctx())).toBe(true);
    expect(checkAllInvariants(ctx()).every((r) => r.pass)).toBe(true);
  });
});

describe("reality/invariant-check — fail-able invariants (GPT 必須)", () => {
  it("INV-16 Whole-Part: fails when not coherent", () => {
    expect(checkWholePart(ctx({ candidate: candidate({ metrics: metrics({ wholePartCoherent: false }) }) })).pass).toBe(false);
    expect(violationIds(ctx({ candidate: candidate({ metrics: metrics({ wholePartCoherent: false }) }) }))).toContain("INV-16");
  });

  it("INV-19 Recovery Core: fails when not protected", () => {
    expect(checkRecoveryCore(ctx({ candidate: candidate({ metrics: metrics({ recoveryProtected: false }) }) })).pass).toBe(false);
  });

  it("INV-22 Daily Plan Quality: fails for a packed / goalless Build plan", () => {
    const bad = ctx({ mode: "build", candidate: candidate({ metrics: metrics({ overpack: 0.9, goalAttainment: 0.1 }) }) });
    const r = checkDailyPlanQuality(bad);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("過密");
    // repair mode では INV-22 は n/a
    expect(checkDailyPlanQuality(ctx({ mode: "repair" })).applicable).toBe(false);
  });

  it("INV-23 Source Traceability: fails untraceable, and fails pushing weak grounding", () => {
    expect(checkSourceTraceability(ctx({ candidate: candidate({ sourceTraces: [] }) })).pass).toBe(false);
    const weak: SourceTrace = { kind: "prm", ref: "p", reason: "弱", confidence: 0.2 };
    const pushingWeak = ctx({ candidate: candidate({ sourceTraces: [weak] }), delivery: delivery("push") });
    expect(checkSourceTraceability(pushingWeak).pass).toBe(false);
  });

  it("INV-24 Reversibility: fails when a snapshot is incomplete", () => {
    const cs: ChangeSet = { id: "x", ops: [{ kind: "remove", itemId: "b", before: { itemId: "b" } }], reason: "r", sourceTraces: [trace] };
    expect(checkReversibility(ctx({ candidate: candidate({ changeSet: cs }) })).pass).toBe(false);
  });
});

describe("reality/invariant-check — structural invariants", () => {
  it("INV-1 actionability: push without action fails", () => {
    expect(checkActionability(ctx({ delivery: delivery("push", []) })).pass).toBe(false);
    // non-push mode → n/a
    expect(checkActionability(ctx({ delivery: delivery("on_open", []) })).applicable).toBe(false);
  });

  it("INV-5 permission: auto-applying a confirmation-required change fails", () => {
    const csHard: ChangeSet = {
      id: "h",
      ops: [
        {
          kind: "update",
          itemId: "m",
          before: { itemId: "m", startMin: 540, endMin: 600, governance: { origin: "imported", authority: "import_locked", flexibility: "movable", protectionReasons: ["hard_external"] } },
          after: { itemId: "m", startMin: 560, endMin: 620, governance: { origin: "imported", authority: "import_locked", flexibility: "movable", protectionReasons: ["hard_external"] } },
        },
      ],
      reason: "move others",
      sourceTraces: [trace],
    };
    expect(checkPermissionBoundary(ctx({ candidate: candidate({ changeSet: csHard, proposedDisposition: "auto" }) })).pass).toBe(false);
    expect(checkPermissionBoundary(ctx({ candidate: candidate({ changeSet: csHard, proposedDisposition: "confirm" }) })).pass).toBe(true);
  });

  it("INV-15 mode correctness: intervening without a condition fails", () => {
    expect(checkModeCorrectness(ctx({ intervened: true, conditionPresent: false })).pass).toBe(false);
    expect(checkModeCorrectness(ctx({ intervened: false, conditionPresent: true })).pass).toBe(true); // silent ok
  });
});

describe("reality/invariant-check — aggregation", () => {
  it("invariantViolations lists only applicable failures", () => {
    const bad = ctx({
      mode: "build",
      candidate: candidate({ sourceTraces: [], metrics: metrics({ wholePartCoherent: false, recoveryProtected: false, overpack: 0.9, goalAttainment: 0 }) }),
      delivery: delivery("push", []),
    });
    const ids = violationIds(bad);
    expect(ids).toEqual(expect.arrayContaining(["INV-1", "INV-4", "INV-16", "INV-19", "INV-22", "INV-23"]));
    expect(allInvariantsHold(bad)).toBe(false);
  });
});
