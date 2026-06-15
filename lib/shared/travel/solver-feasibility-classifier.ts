/**
 * T11-C2 — Solver Feasibility Classifier（**pure・未配線**）
 *
 * 設計: solver-boundary-types.ts + docs/t11-c-solver-scheduler-boundary-design.md §8
 *
 * 役割: `CompositionResult`(+ explicit schedule input) を **SolverBoundaryState** に分類する。
 *   **解かない**: 時刻/日割/順序を割らない・cycle を resolve しない・制約を relax しない・
 *   runTravelPlanEngine / evaluateFit を呼ばない・ScheduledTravelItineraryDraft を構築しない。
 */

import type { UnsatisfiedConstraint } from "./composition-types";
import type { SolverBoundaryState, SolverFeasibilityInput } from "./solver-boundary-types";
import { detectScheduleGaps } from "./solver-missing-data-detector";

/** hard（relaxable でない）不能を示す unsatisfied reason。ordering_cycle は relaxable-only ゆえ hard でない */
const HARD_UNSATISFIED = new Set<UnsatisfiedConstraint["reason"]>([
  "impossible_time_lock",
  "budget_red_line_exceeded",
  "no_feasible_placement",
]);

export interface FeasibilityClassification {
  state: SolverBoundaryState;
  /** infeasible を招いた hard 制約（shared-safe・空可） */
  infeasibleConstraints: UnsatisfiedConstraint[];
}

export function classifyFeasibility(input: SolverFeasibilityInput): FeasibilityClassification {
  const result = input.result;

  // ── CompositionFailure（draft 不在）──
  if (result.outcome === "failure") {
    let state: SolverBoundaryState;
    switch (result.reason) {
      case "impossible_time_lock":
        state = "infeasible_constraints";
        break;
      case "all_nodes_hard_blocked":
        state = "blocked_by_hard_constraint";
        break;
      case "missing_required_subject":
        state = result.needsAlternative ? "needs_alternative_entity" : "not_enough_information";
        break;
      case "no_bound_entities":
      default:
        state = "not_enough_information";
        break;
    }
    const infeasibleConstraints: UnsatisfiedConstraint[] =
      result.reason === "impossible_time_lock"
        ? [{ constraintId: "composition", reason: "impossible_time_lock", visibility: "shared", ownerParticipantId: null }]
        : [];
    return { state, infeasibleConstraints };
  }

  // ── CompositionDraft ──
  const draft = result;
  // hard unsatisfied（cycle は非relaxable のみ composition で failure 化済 → draft の ordering_cycle は relaxable-only）
  const infeasibleConstraints = draft.unsatisfiedConstraints.filter((u) => HARD_UNSATISFIED.has(u.reason));
  if (infeasibleConstraints.length > 0) {
    return { state: "infeasible_constraints", infeasibleConstraints };
  }

  const gaps = detectScheduleGaps(input);
  if (gaps.length === 0) {
    // ★ 適格状態のみ（draft を構築しない）
    return { state: "feasible_scheduled_draft", infeasibleConstraints: [] };
  }

  // 代表 needs_* を決定的優先で選ぶ（granular causes は gaps[] が保持）
  const has = (k: string) => gaps.some((g) => g.kind === k);
  let state: SolverBoundaryState = "feasible_unscheduled";
  if (has("node_duration_missing")) state = "needs_node_duration";
  else if (has("route_duration_missing")) state = "needs_route_duration";
  else if (has("time_window_missing") || has("explicit_window_missing")) state = "needs_time_window";
  else if (has("entity_unbound") || has("area_unresolved")) state = "needs_alternative_entity";
  // day_assignment_missing / price_unknown / low_confidence / lock_unplaceable → feasible_unscheduled（集約）

  return { state, infeasibleConstraints: [] };
}
