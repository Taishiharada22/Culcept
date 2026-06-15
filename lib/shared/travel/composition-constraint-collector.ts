/**
 * T11-B3 — Composition Constraint Collector（**pure・未配線**）
 *
 * 設計: composition-types.ts + docs/t11-b-itinerary-composition-solver-boundary-preflight.md §8
 *
 * 役割: `OrderingConstraint[]` + `EntityTimeLock[]` を **carry-only** で分類する。**schedule を解かない・並べ替えない**。
 *
 * 厳守:
 *   - 窓/lock 群（timed_entry/last_departure/open_hours/checkin/checkout/meal/reservation_window）→ `TravelConstraint`(axis="time")。
 *   - must_precede / luggage_drop_enables → 方向内在 precedence carrier。
 *   - reorderable → **無向 hint**（directed edge にしない）。
 *   - derive_shortest_from_terminal → solver hint（preflight は解かない）。
 *   - ordering_cycle は **検出のみ**（resolve/relax/reorder しない）。private は shared question に漏らさない。
 */

import type { ConstraintSeverity, TravelConstraint } from "./core-types";
import type { OrderingConstraint } from "./fit-types";
import type { EntityTimeLock } from "./entity-retrieval-types";
import type { SolverOrderingHint, UnsatisfiedConstraint } from "./composition-types";

const TIME_LOCK_KINDS = new Set<OrderingConstraint["kind"]>([
  "timed_entry_lock",
  "last_departure_lock",
  "open_hours_window_lock",
  "checkin_window_lock",
  "checkout_window_lock",
  "meal_time_lock",
  "reservation_window_lock",
]);

export interface CollectedConstraints {
  /** 窓/時間 lock の carrier（axis="time"・順番は解かない） */
  constraints: TravelConstraint[];
  /** must_precede / luggage_drop_enables（方向内在） */
  precedence: OrderingConstraint[];
  /** reorderable（無向・順序を選ばない） */
  reorderable: OrderingConstraint[];
  /** derive_shortest_from_terminal 等（solver 専用 hint） */
  solverHints: SolverOrderingHint[];
  /** ordering_cycle 検出（report-and-stop・resolve しない） */
  unsatisfied: UnsatisfiedConstraint[];
  /** 非relaxable のみで cycle が成立（B4 が impossible_time_lock failure へ昇格） */
  hasNonRelaxableCycle: boolean;
}

function severityFromRelaxable(relaxable: boolean): ConstraintSeverity {
  return relaxable ? "soft" : "hard";
}

/** 有向グラフに閉路があるか（DFS・white/gray/black） */
function hasCycle(edges: { from: string; to: string }[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const state = new Map<string, 0 | 1 | 2>(); // 0=white,1=gray,2=black
  const visit = (node: string): boolean => {
    state.set(node, 1);
    for (const next of adj.get(node) ?? []) {
      const s = state.get(next) ?? 0;
      if (s === 1) return true; // back edge → cycle
      if (s === 0 && visit(next)) return true;
    }
    state.set(node, 2);
    return false;
  };
  for (const node of adj.keys()) {
    if ((state.get(node) ?? 0) === 0 && visit(node)) return true;
  }
  return false;
}

/**
 * ordering + time lock を分類（carry-only）。`OrderingConstraint.subjectRef`/`objectRef` は placeRefId。
 */
export function collectConstraints(input: {
  orderingConstraints?: OrderingConstraint[];
  timeLocks?: EntityTimeLock[];
}): CollectedConstraints {
  const constraints: TravelConstraint[] = [];
  const precedence: OrderingConstraint[] = [];
  const reorderable: OrderingConstraint[] = [];
  const solverHints: SolverOrderingHint[] = [];

  const pushOrdering = (oc: OrderingConstraint, rawTime?: string) => {
    if (TIME_LOCK_KINDS.has(oc.kind)) {
      constraints.push({
        constraintId: `lock:${oc.kind}:${oc.subjectRef}`,
        axis: "time",
        severity: severityFromRelaxable(oc.relaxable),
        owner: { kind: "shared" },
        visibility: "shared",
        descriptor: `${oc.kind}:${rawTime ?? "window"}`,
      });
      return;
    }
    switch (oc.kind) {
      case "must_precede":
      case "luggage_drop_enables":
        precedence.push(oc);
        return;
      case "reorderable":
        reorderable.push(oc);
        return;
      case "derive_shortest_from_terminal":
        solverHints.push({ kind: oc.kind, subjectRef: oc.subjectRef, objectRef: oc.objectRef, relaxable: oc.relaxable });
        return;
    }
  };

  for (const tl of input.timeLocks ?? []) pushOrdering(tl.ordering, tl.rawTime);
  for (const oc of input.orderingConstraints ?? []) pushOrdering(oc);

  // ── cycle 検出（precedence のみ・report-and-stop）──
  const allEdges = precedence.map((p) => ({ from: p.subjectRef, to: p.objectRef }));
  const hardEdges = precedence.filter((p) => p.relaxable === false).map((p) => ({ from: p.subjectRef, to: p.objectRef }));
  const unsatisfied: UnsatisfiedConstraint[] = [];
  const cyclePresent = hasCycle(allEdges);
  const hasNonRelaxableCycle = hasCycle(hardEdges);
  if (cyclePresent) {
    unsatisfied.push({
      constraintId: "ordering_cycle",
      reason: "ordering_cycle",
      visibility: "shared",
      ownerParticipantId: null,
    });
  }

  return { constraints, precedence, reorderable, solverHints, unsatisfied, hasNonRelaxableCycle };
}
