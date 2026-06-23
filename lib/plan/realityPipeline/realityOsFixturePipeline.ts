/**
 * Reality OS full fixture E2E composer（P3-3・本体化）
 *
 * P3-1b test 内にあった full real E2E recipe を、本体の pure composer として切り出す。
 * deterministic fixture input（anchors + 注入 instant + judgment summary 等）から、
 *   buildDayGraph → compile(ern/mv/cs) → deriveDecisionDebt → deriveMomentState → deriveMomentSnapshot
 *   → assembleRealityGraph → evaluateFeasibility(real) → evaluateCollapseRisk(real)
 *   → buildTaskRealityNode → buildRealityFrame → buildRealityLearningSignal → buildProposalRoutes(real)
 *   → mapProposalRouteToScenarios → composeRealityPipelineSurface
 * までを **1 関数**で通し、redacted surface DTO（凍結契約）を返す。
 *
 * 配置: realityPipeline adapter 層（mainline buildDayGraph/deriveMomentState を import するため
 *   realityCore kernel に置かない＝leaf 純度・循環なしを維持）。
 *
 * 規律: pure・no Date（instant は注入）・no IO・no fetch・no env・no DB・no LLM・no UI/API/PlanClient。
 *   proposal 実行・通知・DB 保存なし。raw graph/evidence/ledger は surface に出さない（redaction）。
 */

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { compileEventRealityNodes } from "@/lib/plan/realityCore/compileEventRealityNodes";
import { compileMovementReality } from "@/lib/plan/realityCore/movementReality";
import { compileCommitmentSignals } from "@/lib/plan/realityCore/commitmentSignal";
import { deriveDecisionDebt } from "@/lib/plan/realityCore/decisionDebt";
import { deriveMomentSnapshot } from "@/lib/plan/realityCore/momentSnapshot";
import { assembleRealityGraph } from "@/lib/plan/realityCore/realityGraphSnapshot";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";
import type { RealityInstant } from "@/lib/plan/realityCore/realityInstant";
import { buildRealityJudgmentInput } from "@/lib/plan/realityCore/realityJudgmentInput";
import { evaluateFeasibility } from "@/lib/plan/realityCore/feasibilityJudgment";
import { evaluateCollapseRisk } from "@/lib/plan/realityCore/collapseRisk";
import { buildTaskRealityNode, type TaskRealityNodeInputV0 } from "@/lib/plan/realityCore/taskRealityNode";
import { buildRealityFrame } from "@/lib/plan/realityCore/realityFrame";
import { buildRealityLearningSignal } from "@/lib/plan/realityCore/realityLearningSignal";
import { buildProposalRoutes } from "@/lib/plan/realityCore/proposalRoute";
import {
  mapProposalRouteToScenarios,
  type StanceJudgmentByStanceV0,
} from "@/lib/plan/realityCore/proposalRouteScenarioMapper";
import {
  composeRealityPipelineSurface,
  type RealityPipelineScenarioInputV0,
} from "@/lib/plan/realityCore/realityPipelineSurface";
import type { RealityOsSurfaceV0 } from "./realityOsSurfaceContract";
import type { WorkOverrunRiskInputV0 } from "@/lib/plan/realityCore/workOverrunRisk";
import type { MinimalProgressCandidateInputV0, TaskDecompositionContextV0 } from "@/lib/plan/realityCore/taskMinimalProgress";
import type { RealityDiffSummaryV0 } from "@/lib/plan/realityCore/futureSimulation";

/** current scenario の非判断フィールド（feasibility/collapse は real judge から埋まる） */
export interface CurrentNonJudgmentInputV0 {
  readonly overrunInput: WorkOverrunRiskInputV0;
  readonly minimalProgressCandidates: ReadonlyArray<MinimalProgressCandidateInputV0>;
  readonly minimalProgressContext: TaskDecompositionContextV0;
  readonly permissionBoundary: RealityPipelineScenarioInputV0["permissionBoundary"];
  readonly realityDiffSummary: RealityDiffSummaryV0 | null;
  readonly dayRehearsalSummary: string | null;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly evidence: ReadonlyArray<string>;
  readonly confidence: number;
}

export interface RealityOsFixturePipelineInputV0 {
  readonly date: string;
  readonly anchors: ReadonlyArray<ExternalAnchor>;
  readonly instant: RealityInstant; // 注入（composer は no Date）
  readonly viewerKey: string;
  readonly proposalTask: TaskRealityNodeInputV0; // proposalRoute frame 用
  readonly routeSetIdSeed: string;
  readonly current: CurrentNonJudgmentInputV0;
  readonly judgmentByStance: StanceJudgmentByStanceV0; // protect/easy/push の judgment summary（未注入は honest-unknown）
}

export interface RealityOsFixturePipelineResultV0 {
  readonly surface: RealityOsSurfaceV0;
  readonly meta: {
    readonly feasibilityStatus: string; // real
    readonly collapseRiskLevel: string; // real
    readonly routeCount: number; // proposalRoute が出した route 数
  };
}

/**
 * fixture input → redacted surface DTO（full real E2E・pure）。
 */
export function composeRealityOsFixturePipeline(
  input: RealityOsFixturePipelineInputV0,
): RealityOsFixturePipelineResultV0 {
  const anchors = [...input.anchors];
  const { graph } = buildDayGraph({ anchors, date: input.date });
  const ern = compileEventRealityNodes({ date: input.date, graph, anchors });
  const mv = compileMovementReality({ date: input.date, graph });
  const cs = compileCommitmentSignals({ date: input.date, graph, anchors });
  const decisionDebt = deriveDecisionDebt({ subjectiveDate: input.date, graph, ern, mv, cs });
  const momentState = deriveMomentState({ nowHHMM: input.instant.wallClockHHMM, segments: [] });
  const momentSnapshot = deriveMomentSnapshot({ instant: input.instant, momentState, ern, mv, cs, decisionDebt });
  const snapshot = assembleRealityGraph({ ern, mv, cs, momentSnapshot, viewerKey: input.viewerKey });

  // 上流判断（real）
  const feasibility = evaluateFeasibility(buildRealityJudgmentInput(snapshot, { kind: "day" }));
  const collapse = evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment: feasibility });

  // proposalRoute（real・候補生成）
  const task = buildTaskRealityNode(input.proposalTask);
  const frame = buildRealityFrame({ snapshot, workLane: { tasks: [task], blocks: [], carryOverSignals: [] } });
  const signal = buildRealityLearningSignal({ prior: null, current: frame });
  const routeSets = buildProposalRoutes({ signal, frame, routeSetIdSeed: input.routeSetIdSeed });
  const routeSet = routeSets[0] ?? null;

  // current（real feasibility/collapse を写像）
  const current: RealityPipelineScenarioInputV0 = {
    scenarioId: "current",
    scenarioKind: "current",
    feasibilityStatus: feasibility.feasibilityStatus,
    collapseRiskLevel: collapse.riskLevel,
    overrunInput: input.current.overrunInput,
    minimalProgressCandidates: input.current.minimalProgressCandidates,
    minimalProgressContext: input.current.minimalProgressContext,
    permissionBoundary: input.current.permissionBoundary,
    realityDiffSummary: input.current.realityDiffSummary,
    dayRehearsalSummary: input.current.dayRehearsalSummary,
    reasonCodes: input.current.reasonCodes,
    evidence: input.current.evidence,
    confidence: input.current.confidence,
  };

  // proposalRoute → mapper → futureSimulation → redacted surface
  const scenarios = routeSet ? mapProposalRouteToScenarios(routeSet, input.judgmentByStance) : [];
  const surface = composeRealityPipelineSurface({ current, scenarios });

  return {
    surface,
    meta: {
      feasibilityStatus: feasibility.feasibilityStatus,
      collapseRiskLevel: collapse.riskLevel,
      routeCount: routeSet ? routeSet.routes.length : 0,
    },
  };
}
