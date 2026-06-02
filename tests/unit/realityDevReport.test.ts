import { describe, it, expect } from "vitest";
import { aggregateShadowReport, devReportLine } from "@/lib/plan/reality/integration/dev-report";
import type { ShadowSummary } from "@/lib/plan/reality/integration/shadow-runner";

function summary(p: Partial<ShadowSummary> = {}): ShadowSummary {
  return {
    mode: "repair",
    candidateCount: 2,
    bestRef: "c0",
    rejected: [],
    deliveryMode: "push",
    invariantViolations: [],
    risk: "none",
    line: "mode=repair candidates=2 best=c0 rejected=0 delivery=push violations=0 risk=none",
    ...p,
  };
}

describe("dev-report — aggregateShadowReport (redacted counts only)", () => {
  it("empty → zeros", () => {
    const r = aggregateShadowReport([]);
    expect(r.runs).toBe(0);
    expect(r.totalCandidates).toBe(0);
    expect(r.modeDistribution.repair).toBe(0);
    expect(r.deliveryDistribution.push).toBe(0);
  });

  it("aggregates mode / delivery / risk distributions + totals", () => {
    const r = aggregateShadowReport([
      summary({ mode: "build", deliveryMode: "push", risk: "none", candidateCount: 1 }),
      summary({ mode: "repair", deliveryMode: "on_open", risk: "low", candidateCount: 3 }),
      summary({ mode: "repair", deliveryMode: null, risk: "high", candidateCount: 2, bestRef: null }),
    ]);
    expect(r.runs).toBe(3);
    expect(r.modeDistribution.build).toBe(1);
    expect(r.modeDistribution.repair).toBe(2);
    expect(r.deliveryDistribution.push).toBe(1);
    expect(r.deliveryDistribution.on_open).toBe(1);
    expect(r.deliveryDistribution.none).toBe(1);
    expect(r.riskDistribution.high).toBe(1);
    expect(r.totalCandidates).toBe(6);
    expect(r.noBestRuns).toBe(1);
  });

  it("sums gate failures and invariant violations across runs", () => {
    const r = aggregateShadowReport([
      summary({ rejected: [{ ref: "c0", gates: ["safety", "traceability"] }, { ref: "c1", gates: ["whole_part"] }] }),
      summary({ rejected: [{ ref: "c0", gates: ["safety"] }], invariantViolations: ["INV-16", "INV-19"] }),
    ]);
    expect(r.gateFailureCounts.safety).toBe(2);
    expect(r.gateFailureCounts.traceability).toBe(1);
    expect(r.gateFailureCounts.whole_part).toBe(1);
    expect(r.totalRejected).toBe(3);
    expect(r.invariantViolationCounts["INV-16"]).toBe(1);
    expect(r.invariantViolationCounts["INV-19"]).toBe(1);
  });
});

describe("dev-report — redaction (no refs / no raw)", () => {
  it("DevReportRedacted carries NO refs / ids / raw — distributions only", () => {
    const r = aggregateShadowReport([summary({ bestRef: "secret_anchor_id" })]);
    const json = JSON.stringify(r);
    expect(json).not.toContain("secret_anchor_id"); // ref は集約で捨てられる
    expect(json).not.toContain("c0");
    expect(Object.keys(r).sort()).toEqual([
      "deliveryDistribution",
      "gateFailureCounts",
      "invariantViolationCounts",
      "modeDistribution",
      "noBestRuns",
      "riskDistribution",
      "runs",
      "totalCandidates",
      "totalRejected",
    ]);
  });

  it("devReportLine is counts only", () => {
    const line = devReportLine(aggregateShadowReport([summary()]));
    expect(line).toMatch(/^runs=\d+ candidates=\d+ rejected=\d+ noBest=\d+ violations=\d+ risk\[high=\d+,med=\d+\]$/);
  });
});
