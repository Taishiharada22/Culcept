/**
 * A3 — Copy-only Scheduled-Draft Assembler（**pure・未配線**）
 *
 * 設計: assembly-types.ts + docs/t11-c-closeout-and-scheduled-draft-design.md §6
 *       （+ CEO 補正: explicit startMin 並びは **stable display/copy 順**であって solver 順序でない）
 *
 * 役割: `assemblyReady===true` の時のみ、explicit 値を `TravelItinerary` に **copy** して
 *   `ScheduledTravelItineraryDraft` を返す。**solver ではない**。
 *
 * 厳守（境界・this is NOT a solver）:
 *   - startMin/endMin を **計算しない**（nodeIntervals から copy のみ）。
 *   - 順序を **選択/最適化しない**。day 内の並びは **explicit startMin による stable な display/copy 順**
 *     （値は既に explicit ゆえ反映であって選択でない・同値は入力順保持）。
 *   - duration/transport/cost/date を **導出しない**（explicit source から copy）。
 *   - **overlap を修復しない / lock を緩和しない**（不整合は detector が fail-closed）。
 *   - `TravelCandidate` を出さない・`TravelCorePlan.candidates` に入れない。
 *   - `runTravelPlanEngine` / `evaluateFit` / route search / fetch / DB を呼ばない。
 */

import type { TravelDay, TravelEdge, TravelNode, TravelPlanWindow } from "./core-types";
import type { AssemblyDiagnostic, AssemblyInput, AssemblyResult } from "./assembly-types";
import { detectAssemblyReadiness } from "./assembly-readiness-detector";

const edgeKey = (fromNodeId: string, toNodeId: string): string => `${fromNodeId}>>${toNodeId}`;

/** scope window + dayIndex → ISO date（caller 注入 date の決定的反映・guess しない） */
function isoDateForDay(window: TravelPlanWindow, dayIndex: number): string {
  if (window.kind === "single_day") return window.date;
  const base = new Date(`${window.startDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dayIndex);
  return base.toISOString().slice(0, 10);
}

/**
 * ★ explicit startMin による **stable な display/copy 順**（solver の順序選択ではない）。
 *   値は既に explicit ゆえ、これは explicit データの反映。Array.sort は stable ゆえ同 startMin は入力順保持。
 */
function stableExplicitIntervalDisplayOrder(nodes: TravelNode[]): TravelNode[] {
  return [...nodes].sort((a, b) => a.startMin - b.startMin);
}

export function assembleScheduledDraft(input: AssemblyInput): AssemblyResult {
  const readiness = detectAssemblyReadiness(input);
  if (!readiness.assemblyReady || !input.scope) {
    return { outcome: "not_ready", gaps: readiness.gaps, diagnostics: readiness.diagnostics };
  }
  const draft = input.draft;
  const window = input.scope.window;

  const provNodeBudget: Record<string, "presolver" | "explicit"> = {};
  const provEdgeTransport: Record<string, "presolver" | "explicit"> = {};
  const provEdgeCost: Record<string, "presolver" | "explicit"> = {};
  const nodeDayMap = new Map<string, number>();
  const dayBuckets = new Map<number, { nodes: TravelNode[]; edges: TravelEdge[] }>();
  const bucket = (di: number) => {
    if (!dayBuckets.has(di)) dayBuckets.set(di, { nodes: [], edges: [] });
    return dayBuckets.get(di)!;
  };
  const defensive = (code: string): AssemblyResult => ({
    outcome: "not_ready",
    gaps: readiness.gaps,
    diagnostics: [...readiness.diagnostics, { code } as AssemblyDiagnostic],
  });

  // ── nodes（explicit 値を copy のみ）──
  for (const n of draft.candidateNodes) {
    const iv = input.nodeIntervals[n.nodeId];
    const budget = n.budgetBand ?? input.nodeBudgetBands?.[n.nodeId];
    const di = window.kind === "single_day" ? 0 : input.nodeDayBindings?.[n.nodeId];
    if (!iv || !budget || typeof di !== "number") return defensive("assembly_internal_inconsistency"); // post-readiness 不到達
    provNodeBudget[n.nodeId] = n.budgetBand ? "presolver" : "explicit";
    nodeDayMap.set(n.nodeId, di);
    const tn: TravelNode = {
      nodeId: n.nodeId,
      startMin: iv.startMin, // ★ explicit copy（計算しない）
      endMin: iv.endMin, // ★ explicit copy
      place: n.place,
      activityKind: n.activityKind,
      budgetBand: budget,
      fatigueLoad: n.fatigueLoad,
      nodeConfidence: n.nodeConfidence,
    };
    bucket(di).nodes.push(tn);
  }

  // ── edges（route_transition のみ・explicit 値を copy）──
  for (const e of draft.edges) {
    if (e.kind !== "route_transition") continue;
    const key = edgeKey(e.fromNodeId, e.toNodeId);
    const transport = e.transport ?? input.edgeTransports?.[key];
    const cost = e.cost ?? input.edgeCosts?.[key];
    const durationMin = input.edgeDurations[key];
    const di = nodeDayMap.get(e.fromNodeId);
    if (!transport || !cost || typeof durationMin !== "number" || di === undefined) return defensive("assembly_internal_inconsistency");
    provEdgeTransport[key] = e.transport ? "presolver" : "explicit";
    provEdgeCost[key] = e.cost ? "presolver" : "explicit";
    const te: TravelEdge = { fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, transport, durationMin, cost };
    bucket(di).edges.push(te);
  }

  // ── days（dayIndex 昇順・day 内 node は explicit startMin の stable display/copy 順）──
  const days: TravelDay[] = [...dayBuckets.keys()]
    .sort((a, b) => a - b)
    .map((di) => {
      const b = dayBuckets.get(di)!;
      return {
        dayIndex: di,
        date: isoDateForDay(window, di),
        nodes: stableExplicitIntervalDisplayOrder(b.nodes),
        edges: b.edges,
      };
    });

  return {
    outcome: "scheduled_draft",
    authoritative: false,
    draft: true,
    candidateId: draft.candidateId,
    itinerary: { days },
    provenance: {
      nodeBudget: provNodeBudget,
      edgeTransport: provEdgeTransport,
      edgeCost: provEdgeCost,
      dayIndexSource: window.kind === "single_day" ? "single_day_zero" : "explicit",
    },
  };
}
