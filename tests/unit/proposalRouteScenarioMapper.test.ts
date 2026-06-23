/**
 * P3-2 — proposalRoute → pipeline scenario mapper。
 * proposalRoute 出力(protect/easy/push)を pure mapper で pipeline scenario へ写し、
 * composeRealityPipelineSurface に流して surface DTO 化（P3-1b の手動ブリッジを本体化）。
 * 検証: 3 scenario 生成 / judgment 未注入→honest-unknown / redaction / permission緩めない / confidence・reasonCodes 保持。
 */
import { describe, it, expect } from "vitest";
import type {
  ProposalRouteSetV0,
  ProposalRouteV0,
  RealityProposalStance,
} from "@/lib/plan/realityCore/proposalRoute";
import {
  mapProposalRouteToScenarios,
  type StanceJudgmentByStanceV0,
  type StanceJudgmentSummaryV0,
} from "@/lib/plan/realityCore/proposalRouteScenarioMapper";
import {
  composeRealityPipelineSurface,
  type RealityPipelineScenarioInputV0,
} from "@/lib/plan/realityCore/realityPipelineSurface";
import type { WorkOverrunRiskInputV0 } from "@/lib/plan/realityCore/workOverrunRisk";

const route = (stance: RealityProposalStance): ProposalRouteV0 => ({
  stance,
  reasons: [{ stance, basisBucket: "change_task", evidenceRefs: [`route-ev:${stance}`] }],
  confidence: "low",
});

// proposalRoute 出力の代表 fixture（3 route・unresolved なし）
const ROUTE_SET: ProposalRouteSetV0 = {
  schemaVersion: 0,
  routeSetId: "rs:test",
  forTarget: { universe: "workLane", kind: "task", id: "trn:ot1" },
  routes: [route("protect"), route("easy"), route("push")],
  recommended: "protect",
  unresolvedCount: 0,
  unresolvedNotes: [],
  ledgerRefsObserved: ["ledger:secret-ref"],
};

const overrun = (est: number, plan: number): WorkOverrunRiskInputV0 => ({
  estimatedMinutes: est,
  plannedMinutes: plan,
  flexibility: "flexible",
  cognitiveLoad: 0.5,
  energyFit: "medium",
  hasMinimalProgress: true,
  priorOverruns: 0,
  sourceKind: "fixture",
  evidenceRefs: ["fixture:overrun"],
});
const judgment = (
  feasibilityStatus: StanceJudgmentSummaryV0["feasibilityStatus"],
  collapseRiskLevel: StanceJudgmentSummaryV0["collapseRiskLevel"],
  est: number,
  plan: number,
): StanceJudgmentSummaryV0 => ({
  feasibilityStatus,
  collapseRiskLevel,
  overrunInput: overrun(est, plan),
  minimalProgressCandidates: [],
  minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
  permissionBoundary: 2,
  realityDiffSummary: null,
  dayRehearsalSummary: null,
});

const CURRENT: RealityPipelineScenarioInputV0 = {
  scenarioId: "current",
  scenarioKind: "current",
  feasibilityStatus: "feasible_with_risk",
  collapseRiskLevel: "elevated",
  overrunInput: overrun(55, 60),
  minimalProgressCandidates: [],
  minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
  permissionBoundary: 2,
  realityDiffSummary: null,
  dayRehearsalSummary: null,
  reasonCodes: [],
  evidence: ["cur"],
  confidence: 0.5,
};

describe("P3-2 proposalRoute → scenario mapper", () => {
  it("#1 3 route → protect/easy/push scenario が生成される", () => {
    const scenarios = mapProposalRouteToScenarios(ROUTE_SET, {});
    expect(scenarios.map((s) => s.scenarioKind)).toEqual(["protect", "easy", "push"]);
    expect(scenarios[0].scenarioId).toBe("rs:test:protect");
    expect(scenarios[0].reasonCodes).toContain("proposal:protect");
    expect(scenarios[0].reasonCodes).toContain("proposal_basis:change_task");
  });

  it("#2 judgment 注入で full pipeline（protect better / push worse）", () => {
    const j: StanceJudgmentByStanceV0 = {
      protect: judgment("feasible", "low", 30, 60),
      push: judgment("infeasible", "high", 95, 60),
      // easy は未注入 → honest-unknown
    };
    const scenarios = mapProposalRouteToScenarios(ROUTE_SET, j);
    const surface = composeRealityPipelineSurface({ current: CURRENT, scenarios });
    const byKind = Object.fromEntries(surface.scenarios.map((s) => [s.scenarioKind, s]));
    expect(byKind.protect.feasibilityShift).toBe("better");
    expect(byKind.protect.overrunRiskShift).toBe("better");
    expect(byKind.push.feasibilityShift).toBe("worse");
    expect(byKind.push.overrunRiskShift).toBe("worse");
    // easy は judgment 未注入 → honest-unknown
    expect(byKind.easy.feasibilityShift).toBe("unknown");
    expect(surface.honestUnknown).toBe(true);
  });

  it("#3 judgment 全未注入 → 全 scenario honest-unknown（断定しない）", () => {
    const scenarios = mapProposalRouteToScenarios(ROUTE_SET, {});
    const surface = composeRealityPipelineSurface({ current: CURRENT, scenarios });
    for (const s of surface.scenarios) {
      expect(s.feasibilityShift).toBe("unknown");
      expect(s.collapseRiskShift).toBe("unknown");
    }
    expect(surface.honestUnknown).toBe(true);
  });

  it("#4 redaction: route evidenceRefs / ledgerRefs を surface に漏らさない", () => {
    const scenarios = mapProposalRouteToScenarios(ROUTE_SET, { protect: judgment("feasible", "low", 30, 60) });
    const json = JSON.stringify(composeRealityPipelineSurface({ current: CURRENT, scenarios }));
    expect(json).not.toContain("route-ev:");
    expect(json).not.toContain("ledger:secret-ref");
    expect(json).not.toContain("fixture:overrun");
    expect(json).toContain("proposal:protect"); // controlled reasonCode は出てよい
  });

  it("#5 judgment 未注入 stance は permissionBoundary を緩めない（最厳=0）", () => {
    const scenarios = mapProposalRouteToScenarios(ROUTE_SET, {});
    // current=2, scenario=0(最厳) → min=0
    const surface = composeRealityPipelineSurface({ current: CURRENT, scenarios });
    expect(surface.scenarios[0].permissionBoundary).toBe(0);
  });

  it("#6 confidence は RouteConfidence から写る（low→0.3 / tentative→0.2）", () => {
    const tentativeSet: ProposalRouteSetV0 = {
      ...ROUTE_SET,
      routes: [{ ...route("protect"), confidence: "tentative" }],
      unresolvedCount: 1,
      unresolvedNotes: ["incomplete"],
    };
    const s = mapProposalRouteToScenarios(tentativeSet, {});
    expect(s[0].confidence).toBe(0.2);
    expect(s[0].reasonCodes).toContain("proposal_unresolved");
    expect(mapProposalRouteToScenarios(ROUTE_SET, {})[0].confidence).toBe(0.3);
  });
});
