/**
 * T11-C4-narrow — Scheduled-Draft Eligibility（**pure・未配線**）
 *
 * 設計: solver-boundary-types.ts + docs/t11-c-solver-scheduler-boundary-design.md §16 C4
 *       （+ CEO 補正: 本スライスは ScheduledTravelItineraryDraft を**生成しない**・適格判定のみ）
 *
 * 役割: scheduled draft が**将来**作れる適格状態か(boolean) + 不足要件を返す。
 *
 * 厳守（境界）:
 *   - `eligibleForScheduledDraft: boolean` と `unmetRequirements` のみ。
 *   - **ScheduledTravelItineraryDraft / TravelItinerary / TravelCandidate を構築しない**。
 *   - startMin/endMin/dayIndex/durationMin を割らない・順序付け/探索をしない。
 *   - 適格 logic が scheduling 探索を要し始めたら STOP して分割（本実装は探索を含まない）。
 */

import type { ScheduledDraftEligibility, SolverFeasibilityInput } from "./solver-boundary-types";
import { classifyFeasibility } from "./solver-feasibility-classifier";
import { detectScheduleGaps } from "./solver-missing-data-detector";

/**
 * scheduled draft 適格判定（boolean + 不足要件）。**draft を構築しない**。
 *   eligible = feasible_scheduled_draft（hard 不能なし・全 explicit schedule input 充足）。
 */
export function checkScheduledDraftEligibility(input: SolverFeasibilityInput): ScheduledDraftEligibility {
  const { state } = classifyFeasibility(input);
  const unmetRequirements = detectScheduleGaps(input);
  return {
    eligibleForScheduledDraft: state === "feasible_scheduled_draft" && unmetRequirements.length === 0,
    unmetRequirements,
  };
}
