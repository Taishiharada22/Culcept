/**
 * Future Simulator — scenario 比較 aggregator（P3-0c・pure・薄い集約層）
 *
 * P3-0b 境界設計の実装。current / protect / easy / push 等の scenario を横並びにし、
 * **current 比の shift（better/same/worse/unknown）**だけを返す薄い集約層。
 *
 * 責務境界（厳守）:
 *  - dayRehearsal / proposalRoute を **import しない**（依存逆転・summary injection）。
 *  - 判断器（feasibilityJudgment / collapseRisk / workOverrunRisk / RealityDiff）を **再実行しない**。
 *    各 scenario の判断結果は **injected summary** として受け取る。
 *  - scenario を **生成しない**（生成は proposalRoute）。提案実行 / 通知 / UI / DB なし。
 *
 * 不変条件:
 *  - current が不足（unknown）の軸 → 全 scenario のその軸 shift は unknown。
 *  - scenario input が不足 → その scenario の該当軸 shift を unknown にする。
 *  - shift は離散値のみ（数字コスプレ禁止）。
 *  - 各 comparison は confidence / reasonCodes / evidence を持つ（evidence/confidence なしの未来判断禁止）。
 *  - permissionBoundary は緩めない（current / scenario の厳しい側 = Math.min を保持。0=記録のみが最厳）。
 *  - 現実の確定予言として扱わない（unknown を unknown のまま返す）。
 *
 * 規律: pure・no Date・no IO・no fetch・no env・no LLM・no UI・additive（既存型不変更）。
 */

import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

export type FeasibilityStatus = "feasible" | "feasible_with_risk" | "infeasible" | "unknown";
export type CollapseRiskLevel = "low" | "elevated" | "high" | "unknown";
export type OverrunRiskLevel = "low" | "medium" | "high" | "unknown";
export type ScenarioKind = "current" | "protect" | "easy" | "push" | "custom";
export type Shift = "better" | "same" | "worse" | "unknown";

/** RealityDiff（diffSnapshots）出力の要約（injected・本 module は diff を計算しない） */
export interface RealityDiffSummaryV0 {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly resolved: number;
  readonly collapsed: number;
}

export interface FutureScenarioInputV0 {
  readonly scenarioId: string;
  readonly scenarioKind: ScenarioKind;
  readonly feasibilityStatus: FeasibilityStatus;
  readonly collapseRiskLevel: CollapseRiskLevel;
  readonly overrunRiskLevel: OverrunRiskLevel;
  readonly permissionBoundary: PermissionLevel;
  readonly realityDiffSummary: RealityDiffSummaryV0 | null;
  readonly dayRehearsalSummary: string | null;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly evidence: ReadonlyArray<string>;
  readonly confidence: number;
}

export interface FutureSimulationInputV0 {
  readonly current: FutureScenarioInputV0;
  readonly scenarios: ReadonlyArray<FutureScenarioInputV0>;
}

export interface FutureScenarioComparisonV0 {
  readonly scenarioId: string;
  readonly scenarioKind: ScenarioKind;
  readonly feasibilityShift: Shift;
  readonly overrunRiskShift: Shift;
  readonly collapseRiskShift: Shift;
  readonly permissionBoundary: PermissionLevel;
  readonly realityDiffSummary: RealityDiffSummaryV0 | null;
  readonly confidence: number;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly evidence: ReadonlyArray<string>;
}

export interface FutureSimulationResultV0 {
  readonly scenarios: ReadonlyArray<FutureScenarioComparisonV0>;
  readonly honestUnknown: boolean;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly evidence: ReadonlyArray<string>;
}

// rank: null = unknown（比較不能）
const FEASIBILITY_RANK: Record<FeasibilityStatus, number | null> = {
  feasible: 3,
  feasible_with_risk: 2,
  infeasible: 1,
  unknown: null,
};
const COLLAPSE_RANK: Record<CollapseRiskLevel, number | null> = { low: 1, elevated: 2, high: 3, unknown: null };
const OVERRUN_RANK: Record<OverrunRiskLevel, number | null> = { low: 1, medium: 2, high: 3, unknown: null };

/** 高い rank ほど良い軸（feasibility）の current 比 shift */
function shiftHigherBetter(cur: number | null, sc: number | null): Shift {
  if (cur === null || sc === null) return "unknown";
  if (sc > cur) return "better";
  if (sc < cur) return "worse";
  return "same";
}

/** 低い rank ほど良い軸（risk）の current 比 shift */
function shiftLowerBetter(cur: number | null, sc: number | null): Shift {
  if (cur === null || sc === null) return "unknown";
  if (sc < cur) return "better";
  if (sc > cur) return "worse";
  return "same";
}

function dedupe(xs: ReadonlyArray<string>): string[] {
  return Array.from(new Set(xs));
}

/**
 * current 比で各 scenario を比較する pure aggregator。判断器は再実行せず injected summary を集約する。
 */
export function compareFutureScenarios(input: FutureSimulationInputV0): FutureSimulationResultV0 {
  const { current } = input;
  const curF = FEASIBILITY_RANK[current.feasibilityStatus];
  const curC = COLLAPSE_RANK[current.collapseRiskLevel];
  const curO = OVERRUN_RANK[current.overrunRiskLevel];
  const currentIncomplete = curF === null || curC === null || curO === null;

  let anyUnknown = currentIncomplete;

  const comparisons: FutureScenarioComparisonV0[] = input.scenarios.map((sc) => {
    const feasibilityShift = shiftHigherBetter(curF, FEASIBILITY_RANK[sc.feasibilityStatus]);
    const overrunRiskShift = shiftLowerBetter(curO, OVERRUN_RANK[sc.overrunRiskLevel]);
    const collapseRiskShift = shiftLowerBetter(curC, COLLAPSE_RANK[sc.collapseRiskLevel]);
    if (feasibilityShift === "unknown" || overrunRiskShift === "unknown" || collapseRiskShift === "unknown") {
      anyUnknown = true;
    }

    const shiftReasons: string[] = [
      `feasibility_shift:${feasibilityShift}`,
      `overrun_shift:${overrunRiskShift}`,
      `collapse_shift:${collapseRiskShift}`,
    ];
    if (currentIncomplete) shiftReasons.push("current_incomplete");

    return {
      scenarioId: sc.scenarioId,
      scenarioKind: sc.scenarioKind,
      feasibilityShift,
      overrunRiskShift,
      collapseRiskShift,
      // 緩めない: current / scenario の厳しい側（0=記録のみが最厳 → min）
      permissionBoundary: Math.min(current.permissionBoundary, sc.permissionBoundary) as PermissionLevel,
      realityDiffSummary: sc.realityDiffSummary,
      // 比較は弱い方の確信度までしか言えない
      confidence: Math.min(current.confidence, sc.confidence),
      reasonCodes: dedupe([...sc.reasonCodes, ...shiftReasons]),
      evidence: dedupe([...current.evidence, ...sc.evidence]),
    };
  });

  const resultReasons: string[] = [];
  if (currentIncomplete) resultReasons.push("current_incomplete");
  if (anyUnknown) resultReasons.push("contains_unknown_shift");

  return {
    scenarios: comparisons,
    honestUnknown: anyUnknown,
    reasonCodes: dedupe(resultReasons),
    evidence: dedupe(current.evidence),
  };
}
