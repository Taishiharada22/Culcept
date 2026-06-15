/**
 * A2 — Assembly-Readiness Detector（**pure・未配線**）
 *
 * 設計: assembly-types.ts + docs/t11-c-closeout-and-scheduled-draft-design.md §5/§6
 *
 * 役割: 全 non-optional `TravelNode`/`TravelEdge`/`TravelDay` source が explicit か検査する。
 *   `assemblyReady=true` は **C4 feasible_scheduled_draft だけでは不十分**で、explicit interval +
 *   budget/transport/cost/dayIndex/date が揃った時のみ。
 *
 * 厳守（境界）:
 *   - startMin/endMin/duration を計算しない・dayIndex を多日で推論しない・date を guess しない。
 *   - transport/cost を推論しない・budgetBand を default しない。
 *   - **overlap は検出するが修復しない**（fail-closed）。lock 窓は検査のみ（緩和しない）。
 */

import type {
  AssemblyDiagnostic,
  AssemblyGap,
  AssemblyInput,
  AssemblyReadiness,
} from "./assembly-types";

const edgeKey = (fromNodeId: string, toNodeId: string): string => `${fromNodeId}>>${toNodeId}`;

export function detectAssemblyReadiness(input: AssemblyInput): AssemblyReadiness {
  const gaps: AssemblyGap[] = [];
  const diagnostics: AssemblyDiagnostic[] = [];
  const draft = input.draft;
  const window = input.scope?.window;
  if (!window) gaps.push({ kind: "date_missing" });

  // ── nodes ──
  const dayIndexOf = new Map<string, number>();
  for (const n of draft.candidateNodes) {
    const iv = input.nodeIntervals[n.nodeId];
    if (!iv || typeof iv.startMin !== "number" || typeof iv.endMin !== "number") {
      gaps.push({ kind: "node_interval_missing", ref: n.nodeId });
    } else if (!Number.isFinite(iv.startMin) || !Number.isFinite(iv.endMin) || iv.startMin < 0 || iv.endMin > 1439 || iv.endMin <= iv.startMin) {
      gaps.push({ kind: "invalid_interval", ref: n.nodeId });
      diagnostics.push({ code: "invalid_interval", detail: `node ${n.nodeId}: interval out of [0,1439] or endMin<=startMin` });
    }

    const budget = n.budgetBand ?? input.nodeBudgetBands?.[n.nodeId];
    if (!budget) gaps.push({ kind: "price_unknown", ref: n.nodeId });

    // dayIndex（single_day=0 自明 / range=explicit binding 必須・scope から推論しない）
    if (window?.kind === "single_day") {
      dayIndexOf.set(n.nodeId, 0);
    } else if (window?.kind === "range") {
      const di = input.nodeDayBindings?.[n.nodeId];
      if (typeof di !== "number") {
        gaps.push({ kind: "day_assignment_missing", ref: n.nodeId });
      } else if (di < 0 || di > window.nights) {
        gaps.push({ kind: "day_assignment_missing", ref: n.nodeId });
        diagnostics.push({ code: "day_index_out_of_range", detail: `node ${n.nodeId}: dayIndex ${di} not in [0,${window.nights}]` });
      } else {
        dayIndexOf.set(n.nodeId, di);
      }
    }

    // explicit lock window 検査（供給時のみ・緩和しない）
    const lw = input.lockWindows?.[n.placeRefId];
    if (lw && iv && typeof iv.startMin === "number" && typeof iv.endMin === "number") {
      if (iv.startMin < lw.startMin || iv.endMin > lw.endMin) {
        gaps.push({ kind: "lock_window_violation", ref: n.nodeId });
        diagnostics.push({ code: "lock_window_violation", detail: `node ${n.nodeId}: interval outside explicit lock window` });
      }
    }
  }

  // ── edges（route_transition のみ TravelEdge 化対象）──
  for (const e of draft.edges) {
    if (e.kind !== "route_transition") continue;
    const key = edgeKey(e.fromNodeId, e.toNodeId);
    if (typeof input.edgeDurations[key] !== "number") gaps.push({ kind: "route_duration_missing", ref: key });
    if (!(e.transport ?? input.edgeTransports?.[key])) gaps.push({ kind: "edge_transport_missing", ref: key });
    if (!(e.cost ?? input.edgeCosts?.[key])) gaps.push({ kind: "edge_cost_missing", ref: key });
  }

  // ── overlap 検出（同日・★検出のみ・修復しない）──
  const byDay = new Map<number, { nodeId: string; startMin: number; endMin: number }[]>();
  for (const n of draft.candidateNodes) {
    const iv = input.nodeIntervals[n.nodeId];
    const di = dayIndexOf.get(n.nodeId);
    if (!iv || di === undefined || typeof iv.startMin !== "number" || typeof iv.endMin !== "number") continue;
    if (!byDay.has(di)) byDay.set(di, []);
    byDay.get(di)!.push({ nodeId: n.nodeId, startMin: iv.startMin, endMin: iv.endMin });
  }
  for (const [di, list] of byDay) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.startMin < b.endMin && b.startMin < a.endMin) {
          gaps.push({ kind: "overlapping_interval", ref: `${a.nodeId}|${b.nodeId}` });
          diagnostics.push({ code: "overlapping_interval", detail: `day ${di}: ${a.nodeId} overlaps ${b.nodeId}` });
        }
      }
    }
  }

  return { assemblyReady: gaps.length === 0, gaps, diagnostics };
}
