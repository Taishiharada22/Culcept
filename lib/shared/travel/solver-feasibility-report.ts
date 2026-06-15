/**
 * T11-C2..C4 assembler — Solver Feasibility Report builder（**pure・未配線**）
 *
 * 設計: solver-boundary-types.ts + docs/t11-c-solver-scheduler-boundary-design.md §7
 *       （+ CEO 補正: scheduled draft を**生成しない** — eligibility のみ）
 *
 * 役割: classifier(C2) + detector(C3) + eligibility(C4) を束ね `SolverFeasibilityReport` を作る。
 *   `projectSharedFeasibilityReport` は **private を strip** した shared 投影を返す。
 *
 * 厳守:
 *   - 出力に `TravelItinerary` / `TravelCandidate` / scheduled draft を**含めない**。
 *   - report は `authoritative:false` / `draft:true`・executionAuthority なし。
 *   - private blocker は feasibility を server-side で変えてよいが、shared 投影で reason を漏らさない。
 */

import type { CompositionHardBlocker, UnsatisfiedConstraint } from "./composition-types";
import type {
  SolverFeasibilityDiagnostic,
  SolverFeasibilityInput,
  SolverFeasibilityReport,
} from "./solver-boundary-types";
import { classifyFeasibility } from "./solver-feasibility-classifier";
import { detectScheduleGaps } from "./solver-missing-data-detector";
import { checkScheduledDraftEligibility } from "./solver-scheduled-draft-eligibility";

/** server-side full report（private blocker は feasibility に反映済・carry は二層投影前） */
export function buildSolverFeasibilityReport(input: SolverFeasibilityInput): SolverFeasibilityReport {
  const result = input.result;
  const { state, infeasibleConstraints } = classifyFeasibility(input);
  const missingForSchedule = detectScheduleGaps(input);
  const eligibility = checkScheduledDraftEligibility(input);

  const unsatisfiedConstraints: UnsatisfiedConstraint[] = result.outcome === "draft" ? result.unsatisfiedConstraints : [];
  const missingCompositionQuestions = result.outcome === "draft" ? result.missingCompositionQuestions : [];
  const hardBlockers: CompositionHardBlocker[] = result.hardBlockers;
  const diagnostics: SolverFeasibilityDiagnostic[] =
    result.outcome === "failure" ? result.diagnostics.map((d) => ({ code: d.code, ...(d.detail ? { detail: d.detail } : {}) })) : [];

  return {
    outcome: "feasibility_report",
    authoritative: false,
    draft: true,
    candidateId: result.outcome === "draft" ? result.candidateId : "", // CompositionFailure は candidateId を持たない
    state,
    unsatisfiedConstraints,
    missingCompositionQuestions,
    hardBlockers,
    diagnostics,
    missingForSchedule,
    eligibility,
    infeasibleConstraints,
  };
}

/**
 * shared 投影: `visibility==="private"` の blocker/制約を **strip**（server-side で feasibility は反映済・
 *   shared view は理由/owner を見ない）。state は server 計算済みで変えない（feasibility は二層共通）。
 */
export function projectSharedFeasibilityReport(report: SolverFeasibilityReport): SolverFeasibilityReport {
  const sharedOnly = <T extends { visibility: "shared" | "private" }>(xs: T[]): T[] => xs.filter((x) => x.visibility !== "private");
  return {
    ...report,
    hardBlockers: sharedOnly(report.hardBlockers),
    unsatisfiedConstraints: sharedOnly(report.unsatisfiedConstraints),
    infeasibleConstraints: sharedOnly(report.infeasibleConstraints),
  };
}
