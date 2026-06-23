/**
 * P3-1b — upstream real judgment connection（full real E2E）。
 *
 * P3-1 で summary injection に留めた上流3判断を **real 呼び**で通す:
 *   buildDayGraph → compileEventRealityNodes/MovementReality/CommitmentSignals → deriveDecisionDebt
 *   → deriveMomentState → deriveMomentSnapshot → assembleRealityGraph
 *   → evaluateFeasibility（real）→ evaluateCollapseRisk（real）
 *   → buildTaskRealityNode → buildRealityFrame → buildRealityLearningSignal → buildProposalRoutes（real）
 *   → real summary を composeRealityPipelineSurface に流し surface DTO 化。
 *
 * 配置: upstream は mainline(buildDayGraph/deriveMomentState)を import するため **kernel に置かず本 test 内**で
 *   実行（realityCore の leaf 純度・循環なしを維持）。recipe は既存 42ab collapseRisk.test と同型。
 */
import { describe, it, expect } from "vitest";
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { compileEventRealityNodes } from "@/lib/plan/realityCore/compileEventRealityNodes";
import { compileMovementReality } from "@/lib/plan/realityCore/movementReality";
import { compileCommitmentSignals } from "@/lib/plan/realityCore/commitmentSignal";
import { deriveDecisionDebt } from "@/lib/plan/realityCore/decisionDebt";
import { deriveMomentSnapshot } from "@/lib/plan/realityCore/momentSnapshot";
import { assembleRealityGraph } from "@/lib/plan/realityCore/realityGraphSnapshot";
import { graphViewerKey } from "@/lib/plan/realityCore/graphIdentity";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";
import { buildRealityJudgmentInput } from "@/lib/plan/realityCore/realityJudgmentInput";
import { evaluateFeasibility } from "@/lib/plan/realityCore/feasibilityJudgment";
import { evaluateCollapseRisk } from "@/lib/plan/realityCore/collapseRisk";
import { buildTaskRealityNode } from "@/lib/plan/realityCore/taskRealityNode";
import { buildRealityFrame } from "@/lib/plan/realityCore/realityFrame";
import { buildRealityLearningSignal } from "@/lib/plan/realityCore/realityLearningSignal";
import { buildProposalRoutes } from "@/lib/plan/realityCore/proposalRoute";
import { inferredAttribute, heuristicAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";
import {
  composeRealityPipelineSurface,
  type RealityPipelineScenarioInputV0,
} from "@/lib/plan/realityCore/realityPipelineSurface";
import type { WorkOverrunRiskInputV0 } from "@/lib/plan/realityCore/workOverrunRisk";

const DATE = "2026-06-12";
const VIEWER = graphViewerKey("viewer-self");
const NOON_UTC = new Date(Date.UTC(2026, 5, 12, 3, 0)); // JST 12:00

function anchor(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return {
    anchorKind: "one_off",
    sourceId: "src-manual",
    title: "予定",
    date: DATE,
    rigidity: "soft",
    confirmedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  } as unknown as ExternalAnchor;
}

/** 既存 recipe どおり最小の real graph を組む（pure・no DB） */
function buildRealSnapshot() {
  const anchors = [anchor({ id: "a1", startTime: "14:00" })];
  const { graph } = buildDayGraph({ anchors, date: DATE });
  const ern = compileEventRealityNodes({ date: DATE, graph, anchors });
  const mv = compileMovementReality({ date: DATE, graph });
  const cs = compileCommitmentSignals({ date: DATE, graph, anchors });
  const decisionDebt = deriveDecisionDebt({ subjectiveDate: DATE, graph, ern, mv, cs });
  const instant = makeRealityInstantJst(NOON_UTC);
  const momentState = deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] });
  const momentSnapshot = deriveMomentSnapshot({ instant, momentState, ern, mv, cs, decisionDebt });
  return assembleRealityGraph({ ern, mv, cs, momentSnapshot, viewerKey: VIEWER });
}

const overrunInput = (est: number, plan: number): WorkOverrunRiskInputV0 => ({
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

describe("P3-1b upstream real judgment connection", () => {
  it("#1 evaluateFeasibility / evaluateCollapseRisk が real call で通る", () => {
    const snapshot = buildRealSnapshot();
    const feasibility = evaluateFeasibility(buildRealityJudgmentInput(snapshot, { kind: "day" }));
    const collapse = evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment: feasibility });
    expect(["feasible", "feasible_with_risk", "infeasible", "unknown"]).toContain(feasibility.feasibilityStatus);
    expect(["low", "elevated", "high", "unknown"]).toContain(collapse.riskLevel);
  });

  it("#2 buildProposalRoutes が real call で通る（task→frame→signal→routes）", () => {
    const snapshot = buildRealSnapshot();
    const task = buildTaskRealityNode({
      taskId: "ot1",
      title: "資料を作成する",
      deadline: inferredAttribute("2026-06-13T12:00:00+09:00", 0.6, ["d"]),
      estimatedDuration: heuristicAttribute(60, 0.3, ["e"]),
      cognitiveLoad: heuristicAttribute(0.6, 0.3, ["c"]),
      canSplit: inferredAttribute(true, 0.6, ["s"]),
      canMove: inferredAttribute(true, 0.6, ["m"]),
      changeEligibility: inferredAttribute<ChangeEligibilityValue>(
        {
          canSuggestMove: true,
          canSuggestShorten: false,
          canSuggestSkip: false,
          canSuggestDelegate: false,
          requiresConfirmation: false,
          requiresExternalCommunication: false,
          blockedReason: null,
        },
        0.6,
        ["ce"],
      ),
      permissionLevel: inferredAttribute<PermissionLevel>(2, 0.6, ["pl"]),
    });
    const frame = buildRealityFrame({ snapshot, workLane: { tasks: [task], blocks: [], carryOverSignals: [] } });
    const signal = buildRealityLearningSignal({ prior: null, current: frame });
    const routes = buildProposalRoutes({ signal, frame, routeSetIdSeed: "seed" });
    expect(Array.isArray(routes)).toBe(true); // task_proposal edge があれば 3 route/ set
  });

  it("#3 real upstream summary を composeRealityPipelineSurface に流し surface DTO 化（full E2E）", () => {
    const snapshot = buildRealSnapshot();
    const feasibility = evaluateFeasibility(buildRealityJudgmentInput(snapshot, { kind: "day" }));
    const collapse = evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment: feasibility });

    // real 判断結果を pipeline summary に写像（current）
    const current: RealityPipelineScenarioInputV0 = {
      scenarioId: "current",
      scenarioKind: "current",
      feasibilityStatus: feasibility.feasibilityStatus, // real
      collapseRiskLevel: collapse.riskLevel, // real
      overrunInput: overrunInput(55, 60),
      minimalProgressCandidates: [],
      minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
      permissionBoundary: 2,
      realityDiffSummary: null,
      dayRehearsalSummary: null,
      reasonCodes: [],
      evidence: ["real:current"],
      confidence: 0.5,
    };
    // protect: 守る案（成立↑・崩れ↓・超過↓ を fixture で表現＝current 比 better）
    const protect: RealityPipelineScenarioInputV0 = {
      ...current,
      scenarioId: "protect",
      scenarioKind: "protect",
      feasibilityStatus: "feasible",
      collapseRiskLevel: "low",
      overrunInput: overrunInput(30, 60),
      minimalProgressCandidates: [
        { text: "構成を3行で書く", sourceKind: "user_confirmed", evidenceRefs: ["user:tap"] },
      ],
      reasonCodes: ["proposal:protect"],
      evidence: ["real:protect"],
    };

    const surface = composeRealityPipelineSurface({ current, scenarios: [protect] });
    expect(surface.scenarios).toHaveLength(1);
    const p = surface.scenarios[0];
    // current が unknown でなければ shift は確定値（real が unknown なら honest-unknown）
    if (feasibility.feasibilityStatus !== "unknown") {
      expect(["better", "same", "worse"]).toContain(p.feasibilityShift);
    } else {
      expect(p.feasibilityShift).toBe("unknown");
      expect(surface.honestUnknown).toBe(true);
    }
    expect(p.minimalProgressText).toBe("構成を3行で書く"); // user_confirmed 採用
    // redaction: real evidence ref は surface に出ない
    const json = JSON.stringify(surface);
    expect(json).not.toContain("real:current");
    expect(json).not.toContain("fixture:overrun");
    expect(p.evidenceCount).toBeGreaterThan(0);
  });

  it("#4 permissionBoundary は緩めない（real current=1 を保持）", () => {
    const snapshot = buildRealSnapshot();
    const feasibility = evaluateFeasibility(buildRealityJudgmentInput(snapshot, { kind: "day" }));
    const collapse = evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment: feasibility });
    const base: RealityPipelineScenarioInputV0 = {
      scenarioId: "current",
      scenarioKind: "current",
      feasibilityStatus: feasibility.feasibilityStatus,
      collapseRiskLevel: collapse.riskLevel,
      overrunInput: overrunInput(55, 60),
      minimalProgressCandidates: [],
      minimalProgressContext: { taskText: "t", canSplit: true },
      permissionBoundary: 1,
      realityDiffSummary: null,
      dayRehearsalSummary: null,
      reasonCodes: [],
      evidence: ["real:current"],
      confidence: 0.5,
    };
    const surface = composeRealityPipelineSurface({
      current: base,
      scenarios: [{ ...base, scenarioId: "push", scenarioKind: "push", permissionBoundary: 5 }],
    });
    expect(surface.scenarios[0].permissionBoundary).toBe(1);
  });
});
