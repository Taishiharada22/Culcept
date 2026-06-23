/**
 * dev-reality-pipeline 専用の Reality OS surface 観測 fixture（P3-6・dev preview 限定）
 *
 * composeRealityOsFixturePipeline → presentRealityOsSurface を deterministic fixture で呼び、
 * **redacted 表示VM** を返す。production / PlanClient / real user assets には繋がない（dev 観測のみ）。
 *
 * 規律: pure・deterministic・no DB・no fetch・no LLM。instant は固定 Date から構築（dev fixture・no Date.now）。
 */

import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { inferredAttribute, heuristicAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";
import type { WorkOverrunRiskInputV0 } from "@/lib/plan/realityCore/workOverrunRisk";
import type { StanceJudgmentSummaryV0 } from "@/lib/plan/realityCore/proposalRouteScenarioMapper";
import {
  composeRealityOsFixturePipeline,
  type RealityOsFixturePipelineInputV0,
} from "@/lib/plan/realityPipeline/realityOsFixturePipeline";
import { presentRealityOsSurface, type RealityOsSurfaceDisplayV0 } from "@/lib/plan/realityPipeline/realityOsSurfacePresenter";

const DATE = "2026-06-12";

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
  f: StanceJudgmentSummaryV0["feasibilityStatus"],
  c: StanceJudgmentSummaryV0["collapseRiskLevel"],
  est: number,
  plan: number,
): StanceJudgmentSummaryV0 => ({
  feasibilityStatus: f,
  collapseRiskLevel: c,
  overrunInput: overrun(est, plan),
  minimalProgressCandidates: [],
  minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
  permissionBoundary: 2,
  realityDiffSummary: null,
  dayRehearsalSummary: null,
});

const FIXTURE_INPUT: RealityOsFixturePipelineInputV0 = {
  date: DATE,
  anchors: [anchor({ id: "a1", startTime: "14:00" })],
  instant: makeRealityInstantJst(new Date(Date.UTC(2026, 5, 12, 3, 0))), // JST 12:00（固定・no Date.now）
  viewerKey: "viewer-self",
  proposalTask: {
    taskId: "ot1",
    title: "資料を作成する",
    deadline: inferredAttribute("2026-06-13T12:00:00+09:00", 0.6, ["d"]),
    estimatedDuration: heuristicAttribute(60, 0.3, ["e"]),
    cognitiveLoad: heuristicAttribute(0.6, 0.3, ["c"]),
    canSplit: inferredAttribute(true, 0.6, ["s"]),
    canMove: inferredAttribute(true, 0.6, ["m"]),
    changeEligibility: inferredAttribute<ChangeEligibilityValue>(
      { canSuggestMove: true, canSuggestShorten: false, canSuggestSkip: false, canSuggestDelegate: false, requiresConfirmation: false, requiresExternalCommunication: false, blockedReason: null },
      0.6,
      ["ce"],
    ),
    permissionLevel: inferredAttribute<PermissionLevel>(2, 0.6, ["pl"]),
  },
  routeSetIdSeed: "dev-preview-seed",
  current: {
    overrunInput: overrun(55, 60),
    minimalProgressCandidates: [],
    minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
    permissionBoundary: 2,
    realityDiffSummary: null,
    dayRehearsalSummary: null,
    reasonCodes: [],
    evidence: ["dev:current"],
    confidence: 0.5,
  },
  judgmentByStance: { protect: judgment("feasible", "low", 30, 60), push: judgment("infeasible", "high", 95, 60) },
};

/** dev preview 用: fixture → composer → presenter → redacted 表示VM。 */
export function buildRealityOsPreviewDisplay(): RealityOsSurfaceDisplayV0 {
  const { surface } = composeRealityOsFixturePipeline(FIXTURE_INPUT);
  return presentRealityOsSurface(surface);
}
