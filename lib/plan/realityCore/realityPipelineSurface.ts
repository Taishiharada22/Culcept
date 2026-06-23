/**
 * Reality OS fixture E2E spine — pure composer + surface DTO（P3-1・UI/DB 非接続）
 *
 * deterministic fixture から Reality OS の判断 chain を end-to-end で通し、UI に渡せる
 * **redacted surface DTO** までを組む薄い composer。production 接続前に「実資産を入れれば動く形」を固定する。
 *
 * 本 P3-1 で実呼びする real 判断器（入力がトラクタブル）:
 *   - evaluateWorkOverrunRisk（overrun shift の源）
 *   - produceMinimalProgress（最小前進）
 *   - compareFutureScenarios（current 比 shift 集約）
 * feasibility / collapse は **injected summary**（実呼びは deep RealityGraphSnapshot fixture を要するため
 *   P3-1b に分離・本 file は依存逆転で summary を受ける）。proposalRoute scenario も injected（生成は proposalRoute 正本）。
 *
 * 規律: pure・no Date・no IO・no fetch・no env・no DB・no LLM・no UI。
 *   dayRehearsal / proposalRoute / 判断 graph を import しない。proposal 実行・通知・DB 保存なし。
 *   surface DTO は **redaction**: raw evidence 文字列（内部 id 等）を露出せず、controlled reasonCodes + 件数のみ。
 */

import {
  evaluateWorkOverrunRisk,
  type WorkOverrunRiskInputV0,
} from "./workOverrunRisk";
import {
  produceMinimalProgress,
  type MinimalProgressCandidateInputV0,
  type TaskDecompositionContextV0,
} from "./taskMinimalProgress";
import {
  compareFutureScenarios,
  type FutureScenarioInputV0,
  type FutureSimulationInputV0,
  type FeasibilityStatus,
  type CollapseRiskLevel,
  type RealityDiffSummaryV0,
  type ScenarioKind,
  type Shift,
} from "./futureSimulation";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

/** 1 scenario の pipeline 入力（feasibility/collapse は injected summary・overrun/minimalProgress は real 呼び） */
export interface RealityPipelineScenarioInputV0 {
  readonly scenarioId: string;
  readonly scenarioKind: ScenarioKind;
  readonly feasibilityStatus: FeasibilityStatus; // injected（deep-graph 実呼びは P3-1b）
  readonly collapseRiskLevel: CollapseRiskLevel; // injected
  readonly overrunInput: WorkOverrunRiskInputV0; // → evaluateWorkOverrunRisk（real）
  readonly minimalProgressCandidates: ReadonlyArray<MinimalProgressCandidateInputV0>; // → produceMinimalProgress（real）
  readonly minimalProgressContext: TaskDecompositionContextV0;
  readonly permissionBoundary: PermissionLevel;
  readonly realityDiffSummary: RealityDiffSummaryV0 | null;
  readonly dayRehearsalSummary: string | null;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly evidence: ReadonlyArray<string>;
  readonly confidence: number;
}

export interface RealityPipelineInputV0 {
  readonly current: RealityPipelineScenarioInputV0;
  readonly scenarios: ReadonlyArray<RealityPipelineScenarioInputV0>;
}

/** UI に渡せる redacted DTO（raw evidence 非露出・controlled reasonCodes + 件数のみ） */
export interface RealityPipelineScenarioSurfaceV0 {
  readonly scenarioId: string;
  readonly scenarioKind: ScenarioKind;
  readonly feasibilityShift: Shift;
  readonly overrunRiskShift: Shift;
  readonly collapseRiskShift: Shift;
  /** 採用済の最小前進のみ（未採用 LLM 候補は出さない＝直接採用禁止の表面化） */
  readonly minimalProgressText: string | null;
  readonly permissionBoundary: PermissionLevel;
  readonly realityDiffSummary: RealityDiffSummaryV0 | null;
  readonly confidence: number;
  readonly reasonCodes: ReadonlyArray<string>; // controlled vocab のみ
  readonly evidenceCount: number; // raw evidence は出さず件数のみ（redaction）
}

export interface RealityPipelineSurfaceV0 {
  readonly scenarios: ReadonlyArray<RealityPipelineScenarioSurfaceV0>;
  readonly honestUnknown: boolean;
  readonly reasonCodes: ReadonlyArray<string>;
}

/** 内部 raw 参照を漏らさない reasonCode フィルタ（controlled prefix のみ通す） */
const CONTROLLED_REASON_PREFIXES = [
  "feasibility_shift:",
  "overrun_shift:",
  "collapse_shift:",
  "current_incomplete",
  "contains_unknown_shift",
  "proposal:",
];
function redactReasonCodes(codes: ReadonlyArray<string>): string[] {
  return Array.from(new Set(codes.filter((c) => CONTROLLED_REASON_PREFIXES.some((p) => c === p || c.startsWith(p)))));
}

/** scenario 入力 → FutureScenarioInputV0（overrun/minimalProgress を real 呼び・feasibility/collapse は injected） */
function toFutureScenario(s: RealityPipelineScenarioInputV0): {
  future: FutureScenarioInputV0;
  minimalProgressText: string | null;
} {
  const overrun = evaluateWorkOverrunRisk(s.overrunInput); // real
  const mp = produceMinimalProgress(s.minimalProgressCandidates, s.minimalProgressContext); // real
  const minimalProgressText = mp.acceptedMinimalProgress?.value ?? null;
  return {
    future: {
      scenarioId: s.scenarioId,
      scenarioKind: s.scenarioKind,
      feasibilityStatus: s.feasibilityStatus,
      collapseRiskLevel: s.collapseRiskLevel,
      overrunRiskLevel: overrun.riskLevel,
      permissionBoundary: s.permissionBoundary,
      realityDiffSummary: s.realityDiffSummary,
      dayRehearsalSummary: s.dayRehearsalSummary,
      reasonCodes: [...s.reasonCodes, ...overrun.reasonCodes.map((r) => `overrun:${r}`)],
      evidence: [...s.evidence, ...overrun.evidence],
      confidence: Math.min(s.confidence, overrun.confidence),
    },
    minimalProgressText,
  };
}

/**
 * fixture → real downstream chain → redacted surface DTO（pure・fail-closed・honest-unknown）。
 */
export function composeRealityPipelineSurface(input: RealityPipelineInputV0): RealityPipelineSurfaceV0 {
  const curMapped = toFutureScenario(input.current);
  const scMapped = input.scenarios.map(toFutureScenario);

  const simInput: FutureSimulationInputV0 = {
    current: curMapped.future,
    scenarios: scMapped.map((m) => m.future),
  };
  const sim = compareFutureScenarios(simInput);

  // sim.scenarios は input.scenarios と同順（compareFutureScenarios は map 保存）
  const scenarios: RealityPipelineScenarioSurfaceV0[] = sim.scenarios.map((cmp, i) => ({
    scenarioId: cmp.scenarioId,
    scenarioKind: cmp.scenarioKind,
    feasibilityShift: cmp.feasibilityShift,
    overrunRiskShift: cmp.overrunRiskShift,
    collapseRiskShift: cmp.collapseRiskShift,
    minimalProgressText: scMapped[i]?.minimalProgressText ?? null,
    permissionBoundary: cmp.permissionBoundary,
    realityDiffSummary: cmp.realityDiffSummary,
    confidence: cmp.confidence,
    reasonCodes: redactReasonCodes(cmp.reasonCodes),
    evidenceCount: cmp.evidence.length, // raw evidence は露出しない
  }));

  return {
    scenarios,
    honestUnknown: sim.honestUnknown,
    reasonCodes: redactReasonCodes(sim.reasonCodes),
  };
}
