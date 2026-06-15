/**
 * A1 — ScheduledTravelItineraryDraft Assembly 契約型（**pure types only**・未配線）
 *
 * 設計正本: docs/t11-c-closeout-and-scheduled-draft-design.md（+ CEO 補正: explicit startMin 並びは
 *   **stable な display/copy 順**であって solver 順序でない）
 *
 * 役割: 全 non-optional `TravelNode`/`TravelEdge`/`TravelDay` フィールドに **explicit source** がある時のみ
 *   `ScheduledTravelItineraryDraft` を **pure copy** で組むための契約。**solver ではない**:
 *   interval/順序/日割/duration/route/availability を計算しない。
 *
 * 純粋性: 型 + as-const のみ。
 */

import type { BudgetBand, TransportMode, TravelItinerary, TravelPlanScope } from "./core-types";
import type { CompositionDraft } from "./composition-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 出力（ScheduledTravelItineraryDraft・TravelCandidate でない）
// ─────────────────────────────────────────────────────────────────────────────

/** 各 dual-source フィールドの explicit 由来 trace（捏造でないことの監査・shared-safe） */
export interface ScheduledDraftProvenance {
  /** nodeId → budgetBand の由来（presolver=PreSolverNode.budgetBand / explicit=AssemblyInput.nodeBudgetBands） */
  nodeBudget: Record<string, "presolver" | "explicit">;
  /** edgeKey → transport の由来 */
  edgeTransport: Record<string, "presolver" | "explicit">;
  /** edgeKey → cost の由来 */
  edgeCost: Record<string, "presolver" | "explicit">;
  /** dayIndex の由来（explicit=nodeDayBindings / single_day_zero=単日 0 自明） */
  dayIndexSource: "explicit" | "single_day_zero";
}

export interface ScheduledTravelItineraryDraft {
  outcome: "scheduled_draft";
  /** ★ 実行権限でない */
  authoritative: false;
  /** ★ planning draft・readiness が別途 action を gate */
  draft: true;
  candidateId: string;
  /** 既存型・全フィールドが explicit source から copy された時のみ */
  itinerary: TravelItinerary;
  provenance?: ScheduledDraftProvenance;
  // ★ TravelCandidate でない・executionAuthority/booking/calendar 権限フィールドを持たない
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 入力（AssemblyInput・各 non-optional field の explicit source）
// ─────────────────────────────────────────────────────────────────────────────

/** per-node 絶対配置（★duration でなく startMin/endMin・境界は計算しない） */
export interface NodeInterval {
  startMin: number;
  endMin: number;
}

/** explicit lock window（placeRefId 単位・explicit interval が窓内か検査するためだけに供給） */
export interface ExplicitLockWindow {
  startMin: number;
  endMin: number;
}

export interface AssemblyInput {
  draft: CompositionDraft;
  /** 欠落 → date_missing（scope から date を guess しない） */
  scope?: TravelPlanScope;
  /** ★net-new: per-nodeId の explicit 配置（startMin/endMin） */
  nodeIntervals: Record<string, NodeInterval>;
  /** per-nodeId の explicit dayIndex（range で必須・single_day は 0 自明） */
  nodeDayBindings?: Record<string, number>;
  /** PreSolverNode.budgetBand が無い node の explicit budget */
  nodeBudgetBands?: Record<string, BudgetBand>;
  /** per-edge(`${fromNodeId}>>${toNodeId}`) の explicit durationMin */
  edgeDurations: Record<string, number>;
  /** PreSolverEdge.transport が無い edge の explicit transport */
  edgeTransports?: Record<string, TransportMode>;
  /** PreSolverEdge.cost が無い edge の explicit cost */
  edgeCosts?: Record<string, BudgetBand>;
  /** placeRefId → explicit lock window（供給時のみ・explicit interval の窓内検査用） */
  lockWindows?: Record<string, ExplicitLockWindow>;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 readiness / 診断（assemblyReady ⊂ feasible）
// ─────────────────────────────────────────────────────────────────────────────

export const ASSEMBLY_GAP_KINDS = [
  "node_interval_missing", // ★net-new: explicit startMin/endMin 欠落（duration では不可）
  "edge_transport_missing", // ★net-new
  "edge_cost_missing", // ★net-new
  "date_missing", // ★net-new: scope 欠落
  "route_duration_missing", // 既存(C3) 再利用
  "day_assignment_missing", // 既存(C3)
  "price_unknown", // 既存(C3) — assembly では budgetBand を blocking
  "invalid_interval", // 不正 interval（endMin<=startMin / 0..1439 外）
  "overlapping_interval", // 同日 explicit interval 重複（検出のみ・修復しない）
  "lock_window_violation", // explicit interval が explicit lock 窓外
] as const;
export type AssemblyGapKind = (typeof ASSEMBLY_GAP_KINDS)[number];

export interface AssemblyGap {
  kind: AssemblyGapKind;
  /** shared-safe id（nodeId/edgeKey/placeRefId）・private を含まない */
  ref?: string;
}

export interface AssemblyDiagnostic {
  code: string;
  /** shared-safe（private を含まない） */
  detail?: string;
}

export interface AssemblyReadiness {
  /** ★ true は全 non-optional source が explicit な時のみ（feasible_scheduled_draft だけでは不十分） */
  assemblyReady: boolean;
  gaps: AssemblyGap[];
  diagnostics: AssemblyDiagnostic[];
}

/** assembler の結果: draft（assemblyReady 時のみ）or not_ready（gap/診断） */
export type AssemblyResult =
  | ScheduledTravelItineraryDraft
  | { outcome: "not_ready"; gaps: AssemblyGap[]; diagnostics: AssemblyDiagnostic[] };
