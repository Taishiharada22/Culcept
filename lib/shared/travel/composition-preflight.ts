/**
 * T11-B4 — Composition Preflight Helper（**pure・未配線・narrow**）
 *
 * 設計: composition-types.ts + docs/t11-b-itinerary-composition-solver-boundary-preflight.md §5/§11
 *
 * 役割: B2(node mapper) + B3(constraint collector) を合成し `CompositionResult` を返す。
 *   **schedule を解かない・順序を選ばない・時刻/日割を割らない・最終 TravelItinerary を作らない・ranking を変えない**。
 *
 * 厳守（solver 境界）:
 *   - solver/optimizer/scheduler を呼ばない・runTravelPlanEngine/evaluateFit を呼ばない。
 *   - route API/外部 fetch/DB なし。`PreSolverEdge` に durationMin を捏造しない。
 *   - all-blocked / 非relaxable cycle → `CompositionFailure`（needs alternative）。
 *   - private fallback branch は除去（shared-safe のみ carry）。raw FitResult を出力に載せない。
 *
 * ★ 合成では `fitInputs[].candidateId` = **placeRefId**（entity 単位の advisory + hard-block gate）。
 */

import type { TransportMode } from "./core-types";
import type { AccessMode, FitResult, OrderingConstraint } from "./fit-types";
import type { EntityRetrievalCandidate } from "./entity-retrieval-types";
import { mapEntityToNodes } from "./composition-node-mapper";
import { collectConstraints } from "./composition-constraint-collector";
import type {
  CompositionDiagnostic,
  CompositionDraft,
  CompositionHardBlocker,
  CompositionInput,
  CompositionMissingQuestion,
  CompositionResult,
  PreSolverEdge,
  PreSolverNode,
  ReorderableHint,
} from "./composition-types";

function mapAccessModeToTransport(mode: AccessMode): TransportMode {
  switch (mode) {
    case "rail":
    case "subway":
    case "tram":
      return "train";
    case "bus":
      return "bus";
    case "walk":
      return "walk";
    case "car":
      return "car";
    case "air":
      return "domestic_flight";
    default:
      return "other"; // ferry/gondola/funicular
  }
}

/** placeRefId → 代表 nodeId（lodging は checkin を優先・他は先頭） */
function buildPrimaryNodeMap(nodes: PreSolverNode[]): Map<string, string> {
  const byPlace = new Map<string, PreSolverNode[]>();
  for (const n of nodes) {
    if (!byPlace.has(n.placeRefId)) byPlace.set(n.placeRefId, []);
    byPlace.get(n.placeRefId)!.push(n);
  }
  const primary = new Map<string, string>();
  for (const [placeRefId, group] of byPlace) {
    const checkin = group.find((g) => g.activityKind === "lodging_checkin");
    primary.set(placeRefId, (checkin ?? group[0]).nodeId);
  }
  return primary;
}

export function buildCompositionDraft(input: CompositionInput): CompositionResult {
  // ── 入力ガード（fail-closed）──
  if (!input.bindings.length || !input.entities.length) {
    return {
      outcome: "failure",
      failed: true,
      reason: "no_bound_entities",
      needsAlternative: true,
      diagnostics: [{ code: "no_bound_entities" }],
      hardBlockers: [],
    };
  }

  const fitMap = new Map<string, FitResult>();
  for (const fi of input.fitInputs ?? []) fitMap.set(fi.candidateId, fi.fit);

  const entityMap = new Map<string, EntityRetrievalCandidate>();
  for (const c of input.entities) entityMap.set(c.placeRefId, c);

  const nodes: PreSolverNode[] = [];
  const hardBlockers: CompositionHardBlocker[] = [];
  const missingQuestions: CompositionMissingQuestion[] = [];

  for (const binding of input.bindings) {
    const candidate = entityMap.get(binding.placeRefId);
    if (!candidate) {
      missingQuestions.push({ field: `entity:${binding.placeRefId}`, reason: "entity_unbound" });
      continue;
    }
    const mapping = mapEntityToNodes(candidate, { binding, fit: fitMap.get(binding.placeRefId) });
    nodes.push(...mapping.nodes);
    if (mapping.hardBlocker) hardBlockers.push(mapping.hardBlocker);
    missingQuestions.push(...mapping.missingQuestions);
  }

  // ── route chain の ordering は制約として合流（connection payload は scoring に使わない）──
  const routeOrdering: OrderingConstraint[] = [];
  for (const rc of input.routeChains ?? []) for (const oc of rc.ordering ?? []) routeOrdering.push(oc);

  const collected = collectConstraints({
    orderingConstraints: [...(input.orderingConstraints ?? []), ...routeOrdering],
    timeLocks: input.timeLocks,
  });

  // ── 失敗判定（fail-closed）──
  if (nodes.length === 0) {
    const allBlocked = hardBlockers.length > 0;
    return {
      outcome: "failure",
      failed: true,
      reason: allBlocked ? "all_nodes_hard_blocked" : "no_bound_entities",
      needsAlternative: true,
      diagnostics: [{ code: allBlocked ? "all_nodes_hard_blocked" : "no_mapped_nodes" }],
      hardBlockers,
    };
  }
  if (collected.hasNonRelaxableCycle) {
    return {
      outcome: "failure",
      failed: true,
      reason: "impossible_time_lock",
      needsAlternative: true,
      diagnostics: [{ code: "ordering_cycle_nonrelaxable", detail: "non-relaxable precedence cycle detected" }],
      hardBlockers,
    };
  }

  // ── precedence / reorderable / route を nodeId へ解決（順序は選ばない）──
  const primary = buildPrimaryNodeMap(nodes);
  const edges: PreSolverEdge[] = [];
  for (const p of collected.precedence) {
    const from = primary.get(p.subjectRef);
    const to = primary.get(p.objectRef);
    if (!from || !to || from === to) continue;
    edges.push({ fromNodeId: from, toNodeId: to, kind: p.kind === "luggage_drop_enables" ? "luggage_drop_enables" : "must_precede" });
  }

  const reorderableHints: ReorderableHint[] = [];
  for (const r of collected.reorderable) {
    const a = primary.get(r.subjectRef);
    const b = primary.get(r.objectRef);
    if (!a || !b || a === b) continue;
    reorderableHints.push({ nodeIdA: a, nodeIdB: b });
  }

  // ── route transition placeholder（durationMin を持たない・捏造しない）──
  for (const rc of input.routeChains ?? []) {
    const from = primary.get(rc.connection.fromRef);
    const to = primary.get(rc.connection.toRef);
    if (!from || !to || from === to) continue;
    const mainLeg = rc.connection.legs.find((l) => l.legKind === "mainLeg") ?? rc.connection.legs[0];
    if (!mainLeg) {
      missingQuestions.push({ field: `route:${rc.connection.fromRef}->${rc.connection.toRef}`, reason: "route_duration_missing" });
    }
    edges.push({
      fromNodeId: from,
      toNodeId: to,
      kind: "route_transition",
      transport: mainLeg ? mapAccessModeToTransport(mainLeg.mode) : "other",
    });
  }

  // ── fallback branch は shared-safe のみ carry（private 除去）──
  const fallbackBranches = (input.contingencyBranches ?? []).filter((b) => b.visibility !== "private");

  const diagnostics: CompositionDiagnostic[] = [];
  void diagnostics; // draft 経路では診断を unsatisfied/missing に集約

  const draft: CompositionDraft = {
    outcome: "draft",
    authoritative: false,
    draft: true,
    candidateId: input.candidateId,
    candidateNodes: nodes,
    edges,
    reorderableHints,
    solverHints: collected.solverHints,
    constraints: collected.constraints,
    unsatisfiedConstraints: collected.unsatisfied,
    missingCompositionQuestions: missingQuestions,
    hardBlockers,
    fallbackBranches,
  };
  return draft;
}
