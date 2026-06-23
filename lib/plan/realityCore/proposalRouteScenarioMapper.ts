/**
 * proposalRoute → pipeline scenario mapper（P3-2・pure）
 *
 * proposalRoute（protect/easy/push 候補生成の正本）の出力を、futureSimulation pipeline の
 * scenario input（RealityPipelineScenarioInputV0）へ写す pure mapper。P3-1b の test 内手動ブリッジを本体化。
 *
 * 重要な honesty 規律:
 *  - proposalRoute は **候補（stance/reasons/confidence）だけ**を持ち、各 scenario の
 *    feasibility / collapse / overrun の判断は持たない。これらは **injected judgment summary**。
 *  - judgment summary が無い stance は **honest-unknown**（feasibility/collapse=unknown・overrun=null入力→unknown・
 *    permissionBoundary=0=最厳）にし、勝手に補完しない。
 *  - proposalRoute / futureSimulation を改造しない（mapper は型変換のみ・additive）。
 *
 * 規律: pure・no Date・no IO・no fetch・no env・no DB・no LLM・no UI。
 */

import type { ProposalRouteSetV0, RealityProposalStance } from "./proposalRoute";
import type { RealityPipelineScenarioInputV0 } from "./realityPipelineSurface";
import type { WorkOverrunRiskInputV0 } from "./workOverrunRisk";
import type { MinimalProgressCandidateInputV0, TaskDecompositionContextV0 } from "./taskMinimalProgress";
import type { FeasibilityStatus, CollapseRiskLevel, RealityDiffSummaryV0 } from "./futureSimulation";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

/** stance ごとに注入する判断 summary（proposalRoute 単体では出せない・捏造しない） */
export interface StanceJudgmentSummaryV0 {
  readonly feasibilityStatus: FeasibilityStatus;
  readonly collapseRiskLevel: CollapseRiskLevel;
  readonly overrunInput: WorkOverrunRiskInputV0;
  readonly minimalProgressCandidates: ReadonlyArray<MinimalProgressCandidateInputV0>;
  readonly minimalProgressContext: TaskDecompositionContextV0;
  readonly permissionBoundary: PermissionLevel;
  readonly realityDiffSummary: RealityDiffSummaryV0 | null;
  readonly dayRehearsalSummary: string | null;
}

export type StanceJudgmentByStanceV0 = Partial<Record<RealityProposalStance, StanceJudgmentSummaryV0>>;

const CONFIDENCE_MAP: Record<"low" | "tentative", number> = { low: 0.3, tentative: 0.2 };

/** judgment 未注入 stance 用の honest-unknown overrun 入力（estimatedMinutes=null → evaluateWorkOverrunRisk は unknown） */
function unknownOverrunInput(): WorkOverrunRiskInputV0 {
  return {
    estimatedMinutes: null,
    plannedMinutes: null,
    flexibility: "unknown",
    cognitiveLoad: null,
    energyFit: "unknown",
    hasMinimalProgress: false,
    priorOverruns: null,
    sourceKind: "fixture",
    evidenceRefs: [],
  };
}

/**
 * proposalRoute set → pipeline scenario 群（pure）。judgment 未注入 stance は honest-unknown。
 */
export function mapProposalRouteToScenarios(
  routeSet: ProposalRouteSetV0,
  judgmentByStance: StanceJudgmentByStanceV0,
): RealityPipelineScenarioInputV0[] {
  return routeSet.routes.map((route) => {
    const stance: RealityProposalStance = route.stance;
    const j = judgmentByStance[stance];

    const reasonCodes: string[] = [`proposal:${stance}`, ...route.reasons.map((r) => `proposal_basis:${r.basisBucket}`)];
    if (routeSet.unresolvedCount > 0) reasonCodes.push("proposal_unresolved");

    const evidence: string[] = [
      ...route.reasons.flatMap((r) => [...r.evidenceRefs]),
      ...routeSet.ledgerRefsObserved,
    ];

    return {
      scenarioId: `${routeSet.routeSetId}:${stance}`,
      scenarioKind: stance, // "protect"|"easy"|"push" ⊂ ScenarioKind
      feasibilityStatus: j?.feasibilityStatus ?? ("unknown" as FeasibilityStatus),
      collapseRiskLevel: j?.collapseRiskLevel ?? ("unknown" as CollapseRiskLevel),
      overrunInput: j?.overrunInput ?? unknownOverrunInput(),
      minimalProgressCandidates: j?.minimalProgressCandidates ?? [],
      minimalProgressContext: j?.minimalProgressContext ?? { taskText: routeSet.forTarget.id, canSplit: false },
      // judgment 不明は最も厳しい側（0=記録のみ）に倒す＝permission を緩めない
      permissionBoundary: j?.permissionBoundary ?? (0 as PermissionLevel),
      realityDiffSummary: j?.realityDiffSummary ?? null,
      dayRehearsalSummary: j?.dayRehearsalSummary ?? null,
      reasonCodes,
      evidence,
      confidence: CONFIDENCE_MAP[route.confidence],
    };
  });
}
