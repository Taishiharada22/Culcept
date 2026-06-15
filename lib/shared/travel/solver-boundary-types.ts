/**
 * T11-C1 — Solver / Scheduler Boundary 契約型（**pure types only**・未配線）
 *
 * 設計正本: docs/t11-c-solver-scheduler-boundary-design.md（+ CEO 補正: 本スライスは ScheduledTravelItineraryDraft を生成しない）
 *
 * 役割: `CompositionResult` を **feasibility 状態 + 不足 schedule 要件**へ分類する報告層の契約。
 *   **solver/scheduler ではない**: 順序付け/時刻割当/日割/route 解決/最適化/ScheduledTravelItineraryDraft 生成を行わない。
 *
 * 厳格な性質:
 *   - 出力に `TravelItinerary` / `TravelCandidate` / scheduled draft を**含めない**（本スライス）。
 *   - report は `authoritative:false` / `draft:true`・executionAuthority を持たない。
 *   - `ScheduledDraftEligibility` は **boolean + 不足要件のみ**（旅程オブジェクトを構築しない）。
 *
 * 純粋性: 型 + as-const のみ。
 */

import type { TravelPlanScope } from "./core-types";
import type {
  CompositionHardBlocker,
  CompositionMissingQuestion,
  CompositionResult,
  UnsatisfiedConstraint,
} from "./composition-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 boundary state / gap kind（as-const）
// ─────────────────────────────────────────────────────────────────────────────

export const SOLVER_BOUNDARY_STATES = [
  "not_enough_information",
  "feasible_unscheduled",
  "feasible_scheduled_draft", // ★ 分類/適格状態のみ — draft を構築しない
  "infeasible_constraints",
  "blocked_by_hard_constraint",
  "needs_route_duration",
  "needs_node_duration",
  "needs_time_window",
  "needs_alternative_entity",
] as const;
export type SolverBoundaryState = (typeof SOLVER_BOUNDARY_STATES)[number];

export const SOLVER_INPUT_GAP_KINDS = [
  "node_duration_missing",
  "route_duration_missing",
  "time_window_missing",
  "day_assignment_missing",
  "explicit_window_missing",
  "entity_unbound",
  "lock_unplaceable",
  "low_confidence",
  "area_unresolved",
  "price_unknown",
] as const;
export type SolverInputGapKind = (typeof SOLVER_INPUT_GAP_KINDS)[number];

/** どの explicit schedule input が欠落か。ref は shared-safe な id（nodeId/edgeKey/constraintId/field）・private を含まない */
export interface SolverInputGap {
  kind: SolverInputGapKind;
  ref?: string;
}

export interface SolverFeasibilityDiagnostic {
  code: string;
  /** shared-safe（private を含まない） */
  detail?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 入力（CompositionResult + caller 供給の explicit schedule input）
// ─────────────────────────────────────────────────────────────────────────────

export interface SolverFeasibilityInput {
  result: CompositionResult;
  /** explicit trip window（single_day / range）。欠落 → time_window_missing */
  scope?: TravelPlanScope;
  /** per-nodeId の explicit dwell 分（caller 供給・捏造しない）。欠落 → node_duration_missing */
  nodeDurations?: Record<string, number>;
  /** per-edge(`${fromNodeId}>>${toNodeId}`) の explicit 所要分。欠落 → route_duration_missing */
  edgeDurations?: Record<string, number>;
  /** per-constraintId の explicit lock window 有無（true=供給済）。欠落 → explicit_window_missing */
  lockWindows?: Record<string, boolean>;
  /** ★ per-nodeId の explicit day 割当（caller 供給）。多日で欠落 → day_assignment_missing。scope から導出しない */
  nodeDayBindings?: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 出力（report-only・scheduled draft を構築しない）
// ─────────────────────────────────────────────────────────────────────────────

/** ★ boolean + 不足要件のみ。ScheduledTravelItineraryDraft / TravelItinerary を構築しない */
export interface ScheduledDraftEligibility {
  eligibleForScheduledDraft: boolean;
  unmetRequirements: SolverInputGap[];
}

export interface SolverFeasibilityReport {
  outcome: "feasibility_report";
  /** ★ 構造的 false（実行権限でない） */
  authoritative: false;
  /** planning draft のみ・readiness が別途 action を gate */
  draft: true;
  candidateId: string;
  state: SolverBoundaryState;
  /** CompositionResult から carry（shared-safe 投影で private は strip） */
  unsatisfiedConstraints: UnsatisfiedConstraint[];
  missingCompositionQuestions: CompositionMissingQuestion[];
  hardBlockers: CompositionHardBlocker[];
  diagnostics: SolverFeasibilityDiagnostic[];
  /** どの explicit schedule input が欠落か（C3 detector 由来） */
  missingForSchedule: SolverInputGap[];
  /** ★ 適格判定のみ（C4-narrow）— scheduled draft を**構築しない** */
  eligibility: ScheduledDraftEligibility;
  /** infeasible を招いた hard 制約（shared-safe） */
  infeasibleConstraints: UnsatisfiedConstraint[];
}
