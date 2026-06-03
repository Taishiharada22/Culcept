import { describe, it, expect } from "vitest";
import {
  evaluateGates,
  gateFailures,
  passesAllGates,
  scoreCandidate,
  explainScore,
  rankCandidates,
  DEFAULT_WEIGHTS,
  type BestActionCandidate,
  type CandidateMetrics,
} from "@/lib/plan/reality/best-action";
import type { ChangeSet } from "@/lib/plan/reality/change-set";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";

const trace: SourceTrace = { kind: "seed", ref: "s1", reason: "目的", confidence: 0.8 };

// 完全な（undo 可能な）change-set
function goodChangeSet(id = "cs"): ChangeSet {
  return {
    id,
    ops: [{ kind: "add", itemId: "a", after: { itemId: "a", startMin: 540, endMin: 600 } }],
    reason: "test",
    sourceTraces: [trace],
  };
}

// hard_external を auto で触る（permission gate を落とすため）
function hardExternalAutoChangeSet(): ChangeSet {
  return {
    id: "cs_he",
    ops: [
      {
        kind: "update",
        itemId: "m",
        before: {
          itemId: "m",
          startMin: 540,
          endMin: 600,
          governance: { origin: "imported", authority: "import_locked", flexibility: "movable", protectionReasons: ["hard_external"] },
        },
        after: {
          itemId: "m",
          startMin: 560,
          endMin: 620,
          governance: { origin: "imported", authority: "import_locked", flexibility: "movable", protectionReasons: ["hard_external"] },
        },
      },
    ],
    reason: "move others' event",
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
  return {
    id: "c",
    changeSet: goodChangeSet(),
    sourceTraces: [trace],
    metrics: metrics(),
    proposedDisposition: "confirm",
    ...p,
  };
}

describe("reality/best-action — gates (Gate first)", () => {
  it("a fully-good candidate passes all gates", () => {
    expect(passesAllGates(candidate())).toBe(true);
  });

  it("safety gate fails on infeasible", () => {
    const fails = gateFailures(candidate({ metrics: metrics({ feasible: false }) }));
    expect(fails.map((g) => g.gate)).toContain("safety");
  });

  it("traceability gate fails without source trace (phantom)", () => {
    expect(gateFailures(candidate({ sourceTraces: [] })).map((g) => g.gate)).toContain("traceability");
  });

  it("reversibility gate fails when a snapshot is incomplete (cannot undo)", () => {
    const cs: ChangeSet = { id: "x", ops: [{ kind: "remove", itemId: "b", before: { itemId: "b" } }], reason: "r", sourceTraces: [trace] };
    expect(gateFailures(candidate({ changeSet: cs })).map((g) => g.gate)).toContain("reversibility");
  });

  it("permission gate fails when auto-applying a confirmation-required change", () => {
    const auto = candidate({ changeSet: hardExternalAutoChangeSet(), proposedDisposition: "auto" });
    expect(gateFailures(auto).map((g) => g.gate)).toContain("permission");
    // same change with confirm disposition passes the permission gate
    const confirm = candidate({ changeSet: hardExternalAutoChangeSet(), proposedDisposition: "confirm" });
    expect(gateFailures(confirm).map((g) => g.gate)).not.toContain("permission");
  });

  it("whole_part and recovery_core gates fail on their conditions", () => {
    expect(gateFailures(candidate({ metrics: metrics({ wholePartCoherent: false }) })).map((g) => g.gate)).toContain("whole_part");
    expect(gateFailures(candidate({ metrics: metrics({ recoveryProtected: false }) })).map((g) => g.gate)).toContain("recovery_core");
  });

  it("evaluateGates always returns all 6 gates", () => {
    expect(evaluateGates(candidate()).map((g) => g.gate).sort()).toEqual([
      "permission",
      "recovery_core",
      "reversibility",
      "safety",
      "traceability",
      "whole_part",
    ]);
  });
});

describe("reality/best-action — scoring", () => {
  it("weighted sum: deadline dominates, penalties reduce", () => {
    const s = scoreCandidate(candidate());
    expect(s.terms.find((t) => t.key === "deadline")?.weighted).toBeCloseTo(DEFAULT_WEIGHTS.deadline, 10);
    const overpackTerm = s.terms.find((t) => t.key === "overpack")!;
    expect(overpackTerm.weighted).toBeLessThan(0);
  });

  it("a packed, unstable plan scores lower than a clean one", () => {
    const clean = scoreCandidate(candidate());
    const packed = scoreCandidate(candidate({ metrics: metrics({ overpack: 0.9, instability: 5, contextSwitches: 6, slackHealth: 0.1 }) }));
    expect(packed.total).toBeLessThan(clean.total);
  });

  it("explainScore produces a human-readable why", () => {
    const why = explainScore(scoreCandidate(candidate()));
    expect(why).toContain("締切");
    expect(why.length).toBeGreaterThan(0);
  });
});

describe("reality/best-action — rank (Gate first, score second)", () => {
  it("CRITICAL: a high-score candidate that fails a gate is REJECTED, never best", () => {
    const dangerousButHighScore = candidate({
      id: "dangerous",
      sourceTraces: [], // traceability gate FAILS
      metrics: metrics({ goalAttainment: 1, rhythmFit: 1, slackHealth: 1, overpack: 0, contextSwitches: 0, correctionMisalignment: 0 }),
    });
    const safeLowerScore = candidate({
      id: "safe",
      metrics: metrics({ goalAttainment: 0.4, rhythmFit: 0.4 }),
    });
    const result = rankCandidates([dangerousButHighScore, safeLowerScore]);
    expect(result.best?.candidate.id).toBe("safe");
    expect(result.rejected.map((r) => r.candidate.id)).toContain("dangerous");
    expect(result.alternatives.map((a) => a.candidate.id)).not.toContain("dangerous");
    // rejected は理由付きで残る（silent に捨てない）
    expect(result.rejected[0].gates.some((g) => !g.pass && g.gate === "traceability")).toBe(true);
  });

  it("orders gated survivors by score; best is highest", () => {
    const high = candidate({ id: "high", metrics: metrics({ goalAttainment: 0.95, rhythmFit: 0.9 }) });
    const mid = candidate({ id: "mid", metrics: metrics({ goalAttainment: 0.6, rhythmFit: 0.6 }) });
    const low = candidate({ id: "low", metrics: metrics({ goalAttainment: 0.2, rhythmFit: 0.2 }) });
    const result = rankCandidates([mid, low, high]);
    expect(result.best?.candidate.id).toBe("high");
    expect(result.alternatives.map((a) => a.candidate.id)).toEqual(["mid", "low"]);
  });

  it("gate-failed candidates are not scored (score === null)", () => {
    const bad = candidate({ id: "bad", metrics: metrics({ feasible: false }) });
    const result = rankCandidates([bad]);
    expect(result.best).toBeNull();
    expect(result.rejected[0].score).toBeNull();
  });

  it("empty input → best null, no throw", () => {
    const result = rankCandidates([]);
    expect(result.best).toBeNull();
    expect(result.alternatives).toHaveLength(0);
  });
});
