/**
 * T11-C3 — Solver Missing-Data Detector（**pure・未配線**）
 *
 * 設計: solver-boundary-types.ts + docs/t11-c-solver-scheduler-boundary-design.md §5/§6
 *
 * 役割: `SolverFeasibilityInput` から **どの explicit schedule input が欠落しているか**を検出する。
 *   **何も捏造しない**: default node duration / 60分 dwell / route duration 推論 / scope からの dayIndex 推論 /
 *   opening-hours / live timetable / weather を一切しない。欠落は gap として報告する。
 */

import type { SolverFeasibilityInput, SolverInputGap, SolverInputGapKind } from "./solver-boundary-types";

const edgeKey = (fromNodeId: string, toNodeId: string): string => `${fromNodeId}>>${toNodeId}`;

/**
 * 不足 explicit schedule input を検出（draft のみ・failure は draft 不在ゆえ空）。
 *   - node duration 欠落 → node_duration_missing
 *   - route_transition edge duration 欠落 → route_duration_missing
 *   - trip window 欠落 → time_window_missing
 *   - ★ 多日(range) で node→day binding 欠落 → day_assignment_missing（scope から推論しない）
 *   - time-axis lock の explicit window 欠落 → explicit_window_missing
 *   - draft 由来の missing question（entity_unbound/area_unresolved/low_confidence/price_unknown/lock_unplaceable）を carry
 */
export function detectScheduleGaps(input: SolverFeasibilityInput): SolverInputGap[] {
  const gaps: SolverInputGap[] = [];
  if (input.result.outcome !== "draft") return gaps; // failure は draft 不在
  const draft = input.result;

  // ── node duration（捏造しない・default dwell なし）──
  for (const n of draft.candidateNodes) {
    if (!input.nodeDurations || typeof input.nodeDurations[n.nodeId] !== "number") {
      gaps.push({ kind: "node_duration_missing", ref: n.nodeId });
    }
  }

  // ── route/edge duration（route_transition のみ・route API なし）──
  for (const e of draft.edges) {
    if (e.kind !== "route_transition") continue;
    const key = edgeKey(e.fromNodeId, e.toNodeId);
    if (!input.edgeDurations || typeof input.edgeDurations[key] !== "number") {
      gaps.push({ kind: "route_duration_missing", ref: key });
    }
  }

  // ── trip window（scope から date を捏造しない）──
  const window = input.scope?.window;
  if (!window) gaps.push({ kind: "time_window_missing" });

  // ── ★ 多日 day-assignment（scope は「在る日の集合」のみ・per-node day は供給しない）──
  if (window && window.kind === "range") {
    const allBound = draft.candidateNodes.every(
      (n) => input.nodeDayBindings && typeof input.nodeDayBindings[n.nodeId] === "number",
    );
    if (!allBound) gaps.push({ kind: "day_assignment_missing" });
  }
  // single_day は node→day binding を要しない（dayIndex 自明に 0）

  // ── time-axis lock の explicit window（descriptor を分にパースしない・presence のみ）──
  for (const c of draft.constraints) {
    if (c.axis !== "time") continue;
    if (!input.lockWindows || input.lockWindows[c.constraintId] !== true) {
      gaps.push({ kind: "explicit_window_missing", ref: c.constraintId });
    }
  }

  // ── draft の missing question を carry（shared-safe・route_duration は edge 側で計上済）──
  for (const q of draft.missingCompositionQuestions) {
    if (q.reason === "route_duration_missing") continue; // edge 側と重複回避
    gaps.push({ kind: q.reason as SolverInputGapKind, ref: q.field });
  }

  return gaps;
}
