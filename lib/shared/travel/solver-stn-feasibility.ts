/**
 * S2 — STN Feasibility-Region helper（**pure・未配線**）
 *
 * 設計正本: docs/t11-real-solver-design.md §2/§3 L1（+ CEO 補正: descriptor を parse しない・
 *   derive_shortest_from_terminal は explicit route metric 必須・private narrowing を shared に漏らさない）
 *
 * 役割: explicit 制約（dwell/route δ/数値 lock 窓/数値 time bound/precedence）を STN にコンパイルし、
 *   各 event の **feasibility-region**（earliest/latest）を多項式時間で計算する。**順序選択・日割・重なり回避・
 *   最終配置はしない（S3 = 別 GO・HOLD）**。
 *
 * 厳守（S2 forbidden）:
 *   - sequencing（reorderable 探索）/ TSPTW/Held-Karp / day-assignment / no-overlap disjunctive をしない。
 *   - earliest を最終配置に pin しない・AssemblyInput/ScheduledTravelItineraryDraft/TravelItinerary/TravelCandidate を産まない。
 *   - **descriptor を時間 bound に parse しない**（数値 timeBounds/lockBounds のみ）。route metric を推論しない。
 *   - missing explicit 値 → fail-closed gap（default duration を作らない）。
 *   - **private 制約は authoritative feasibility を narrow してよいが shared 出力に private の存在を漏らさない**。
 */

import type { OrderingConstraint } from "./fit-types";
import type { EventRegion, SolverScheduleInput, TemporalFeasibilityResult } from "./solver-schedule-types";
import { ORDERING_LOCK_BINDING } from "./solver-schedule-types";
import type { SolverInputGap } from "./solver-boundary-types";
import type { UnsatisfiedConstraint } from "./composition-types";

const INF = Number.POSITIVE_INFINITY;
const edgeKey = (fromNodeId: string, toNodeId: string): string => `${fromNodeId}>>${toNodeId}`;

/** node の day（single_day=0 / range=binding）。binding 欠落は null（gap 化） */
function dayOf(nodeId: string, input: SolverScheduleInput): number | null {
  const w = input.scope?.window;
  if (!w) return null;
  if (w.kind === "single_day") return 0;
  const di = input.nodeDayBindings?.[nodeId];
  return typeof di === "number" ? di : null;
}

/** precedence kind（route_transition でない directional ordering） */
function isPrecedence(kind: string): boolean {
  return kind === "must_precede" || kind === "luggage_drop_enables";
}

/** 閉じた STN（all-pairs 最短路 = 最緊 bound）+ 変数 index。S2 region 抽出と S3 flip-and-test が共有 */
export interface ClosedStn {
  D: number[][];
  idxS: Map<string, number>;
  idxE: Map<string, number>;
  m: number;
  nodeIds: string[];
}
export type BuildStnResult =
  | { kind: "ok"; stn: ClosedStn }
  | { kind: "needs_input"; gaps: SolverInputGap[] }
  | { kind: "infeasible"; reason: UnsatisfiedConstraint["reason"] };

/** shared-safe な infeasibility（conflictSet は code のみ・private descriptor を含まない） */
export function temporalInfeasibility(reason: UnsatisfiedConstraint["reason"]) {
  return {
    state: "infeasible_constraints" as const,
    conflictSet: [{ constraintId: "temporal", reason, visibility: "shared" as const, ownerParticipantId: null }],
  };
}

/**
 * explicit 制約を STN にコンパイルし Floyd–Warshall で閉じる。**S2/S3 共通基盤**。
 *   `includePrivate=false` は private lock/time bound を除外（shared 投影）。
 *   - ok: 閉じた STN（consistent）
 *   - needs_input: explicit 値欠落（fail-closed gap・descriptor を parse しない）
 *   - infeasible: cross-day precedence 違反 / negative cycle
 */
export function buildClosedStn(input: SolverScheduleInput, opts?: { includePrivate?: boolean }): BuildStnResult {
  const includePrivate = opts?.includePrivate !== false; // 既定 authoritative
  const draft = input.draft;
  const nodes = draft.candidateNodes;
  const gaps: SolverInputGap[] = [];

  // ── explicit 入力ガード（descriptor を parse せず・default を作らない）──
  if (!input.scope?.window) gaps.push({ kind: "time_window_missing" });
  const isRange = input.scope?.window?.kind === "range";
  for (const n of nodes) {
    if (typeof input.nodeDurations[n.nodeId] !== "number") gaps.push({ kind: "node_duration_missing", ref: n.nodeId });
    if (isRange && typeof input.nodeDayBindings?.[n.nodeId] !== "number") gaps.push({ kind: "day_assignment_missing", ref: n.nodeId });
  }
  for (const e of draft.edges) {
    if (e.kind !== "route_transition") continue;
    if (typeof input.edgeDurations[edgeKey(e.fromNodeId, e.toNodeId)] !== "number") gaps.push({ kind: "route_duration_missing", ref: edgeKey(e.fromNodeId, e.toNodeId) });
  }
  // time-axis red_line/hard 制約は explicit 数値 bound が必須（descriptor から導出しない）
  const lockBoundIds = new Set((input.lockBounds ?? []).map((b) => b.constraintId).filter(Boolean) as string[]);
  const timeBoundIds = new Set((input.timeBounds ?? []).map((b) => b.constraintId).filter(Boolean) as string[]);
  for (const c of draft.constraints) {
    if (c.axis !== "time") continue;
    if (c.severity !== "red_line" && c.severity !== "hard") continue;
    if (lockBoundIds.has(c.constraintId) || timeBoundIds.has(c.constraintId)) continue;
    gaps.push({ kind: c.constraintId.startsWith("lock:") ? "explicit_lock_window_missing" : "explicit_time_bound_missing", ref: c.constraintId });
  }
  // derive_shortest_from_terminal は explicit route metric がある時のみ（無ければ unsupported・推論しない）
  const hasShortest = draft.solverHints.some((h) => h.kind === "derive_shortest_from_terminal");
  if (hasShortest) {
    const routeEdges = draft.edges.filter((e) => e.kind === "route_transition");
    const hasMetric = routeEdges.length > 0 && routeEdges.every((e) => typeof input.edgeDurations[edgeKey(e.fromNodeId, e.toNodeId)] === "number");
    if (!hasMetric) gaps.push({ kind: "ordering_directive_unsupported", ref: "derive_shortest_from_terminal" });
  }
  if (gaps.length > 0) return { kind: "needs_input", gaps };

  // ── STN 変数: X0(0) + 各 node の s,e ──
  const idxS = new Map<string, number>();
  const idxE = new Map<string, number>();
  let next = 1;
  for (const n of nodes) {
    idxS.set(n.nodeId, next++);
    idxE.set(n.nodeId, next++);
  }
  const m = next; // X0 + 2*nodes
  const D: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(INF));
  for (let i = 0; i < m; i++) D[i][i] = 0;
  const addLe = (i: number, j: number, w: number) => { if (w < D[i][j]) D[i][j] = w; }; // x_j − x_i ≤ w
  const X0 = 0;

  // domain 0 ≤ v ≤ 1439
  for (const n of nodes) {
    for (const v of [idxS.get(n.nodeId)!, idxE.get(n.nodeId)!]) {
      addLe(X0, v, 1439); // v − X0 ≤ 1439
      addLe(v, X0, 0); // X0 − v ≤ 0  (v ≥ 0)
    }
  }
  // dwell 等式 e − s = d
  for (const n of nodes) {
    const d = input.nodeDurations[n.nodeId];
    const s = idxS.get(n.nodeId)!;
    const e = idxE.get(n.nodeId)!;
    addLe(s, e, d); // e − s ≤ d
    addLe(e, s, -d); // s − e ≤ −d
  }
  // precedence（同日のみ temporal・cross-day は日順で判定）
  const orderingFromEdges: OrderingConstraint[] = draft.edges
    .filter((e) => isPrecedence(e.kind))
    .map((e) => ({ kind: e.kind as OrderingConstraint["kind"], subjectRef: e.fromNodeId, objectRef: e.toNodeId, relaxable: false }));
  let crossDayPrecedenceViolation = false;
  for (const oc of orderingFromEdges) {
    if (!idxE.has(oc.subjectRef) || !idxS.has(oc.objectRef)) continue;
    const dFrom = dayOf(oc.subjectRef, input);
    const dTo = dayOf(oc.objectRef, input);
    if (dFrom === null || dTo === null) continue;
    if (dFrom > dTo) { crossDayPrecedenceViolation = true; continue; } // 日順違反 → 不能
    if (dFrom < dTo) continue; // 日順で満たされる
    // 同日: e_subj ≤ s_obj
    addLe(idxS.get(oc.objectRef)!, idxE.get(oc.subjectRef)!, 0);
  }
  // S4 選択由来 precedence（from before to・precedence と同一規則）
  for (const sp of input.selectionPrecedence ?? []) {
    if (!idxE.has(sp.from) || !idxS.has(sp.to)) continue;
    const dFrom = dayOf(sp.from, input);
    const dTo = dayOf(sp.to, input);
    if (dFrom === null || dTo === null) continue;
    if (dFrom > dTo) { crossDayPrecedenceViolation = true; continue; }
    if (dFrom < dTo) continue;
    addLe(idxS.get(sp.to)!, idxE.get(sp.from)!, 0);
  }
  // route δ（同日のみ・edge 方向は与件・S2 は順序選択しない）
  for (const e of draft.edges) {
    if (e.kind !== "route_transition") continue;
    if (!idxE.has(e.fromNodeId) || !idxS.has(e.toNodeId)) continue;
    const dFrom = dayOf(e.fromNodeId, input);
    const dTo = dayOf(e.toNodeId, input);
    if (dFrom === null || dTo === null || dFrom !== dTo) continue; // cross-day は日境界で分離
    const t = input.edgeDurations[edgeKey(e.fromNodeId, e.toNodeId)];
    addLe(idxS.get(e.toNodeId)!, idxE.get(e.fromNodeId)!, -t); // e_from − s_to ≤ −t  (s_to − e_from ≥ t)
  }
  // 数値 lock 窓（binding table・private は includePrivate=false で除外）
  for (const lb of input.lockBounds ?? []) {
    if (!includePrivate && lb.visibility === "private") continue;
    if (!idxS.has(lb.nodeId)) continue;
    const side = ORDERING_LOCK_BINDING[lb.kind];
    const s = idxS.get(lb.nodeId)!;
    const e = idxE.get(lb.nodeId)!;
    if (side === "start" || side === "both") {
      addLe(X0, s, lb.windowEndMin); // s ≤ windowEnd
      addLe(s, X0, -lb.windowStartMin); // s ≥ windowStart
    }
    if (side === "end" || side === "both") {
      addLe(X0, e, lb.windowEndMin); // e ≤ windowEnd
      addLe(e, X0, -lb.windowStartMin); // e ≥ windowStart
    }
  }
  // 数値 time bound（descriptor からでなく explicit・private 除外可）
  for (const tb of input.timeBounds ?? []) {
    if (!includePrivate && tb.visibility === "private") continue;
    const targets = tb.nodeId === null ? nodes.map((n) => n.nodeId) : idxS.has(tb.nodeId) ? [tb.nodeId] : [];
    for (const nid of targets) {
      const v = tb.event === "start" ? idxS.get(nid)! : idxE.get(nid)!;
      if (tb.kind === "no_later_than") addLe(X0, v, tb.minute); // v ≤ minute
      else addLe(v, X0, -tb.minute); // v ≥ minute
    }
  }

  // ── Floyd–Warshall（all-pairs shortest path = tightest bounds）──
  for (let k = 0; k < m; k++) {
    for (let i = 0; i < m; i++) {
      if (D[i][k] === INF) continue;
      for (let j = 0; j < m; j++) {
        const via = D[i][k] + D[k][j];
        if (via < D[i][j]) D[i][j] = via;
      }
    }
  }
  // negative cycle ⇔ 不整合
  let negativeCycle = false;
  for (let i = 0; i < m; i++) if (D[i][i] < 0) negativeCycle = true;

  if (negativeCycle || crossDayPrecedenceViolation) {
    return { kind: "infeasible", reason: crossDayPrecedenceViolation ? "no_feasible_placement" : "impossible_time_lock" };
  }
  return { kind: "ok", stn: { D, idxS, idxE, m, nodeIds: nodes.map((n) => n.nodeId) } };
}

/**
 * feasibility-region を計算（S2 公開 API）。`includePrivate=false` は private を除外（shared 投影）。
 *   - feasible_region: 各 event の [earliest, latest]
 *   - infeasible: negative cycle / cross-day precedence 違反（shared-safe conflictSet）
 *   - needs_input: explicit 値欠落（fail-closed gap）
 */
export function computeTemporalFeasibility(
  input: SolverScheduleInput,
  opts?: { includePrivate?: boolean },
): TemporalFeasibilityResult {
  const candidateId = input.draft.candidateId;
  const r = buildClosedStn(input, opts);
  if (r.kind === "needs_input") return { outcome: "needs_input", missingForSchedule: r.gaps, authoritative: false, draft: true, candidateId };
  if (r.kind === "infeasible") return { outcome: "infeasible", infeasibility: temporalInfeasibility(r.reason), authoritative: false, draft: true, candidateId };
  const { D, idxS, idxE, nodeIds } = r.stn;
  const X0 = 0;
  const events: Record<string, EventRegion> = {};
  for (const id of nodeIds) {
    const s = idxS.get(id)!;
    const e = idxE.get(id)!;
    const startEarliest = -D[s][X0] + 0; // +0 で -0 を +0 に正規化（決定的・Object.is 安定）
    const startLatest = D[X0][s];
    const endEarliest = -D[e][X0] + 0;
    const endLatest = D[X0][e];
    events[id] = { startEarliest, startLatest, endEarliest, endLatest, forced: startEarliest === startLatest && endEarliest === endLatest };
  }
  return { outcome: "feasible_region", events, authoritative: false, draft: true, candidateId };
}

/** ★ shared 投影: private な lock/time bound を除外して region を計算（private narrowing を漏らさない） */
export function computeSharedTemporalFeasibility(input: SolverScheduleInput): TemporalFeasibilityResult {
  return computeTemporalFeasibility(input, { includePrivate: false });
}
