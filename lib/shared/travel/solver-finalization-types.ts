/**
 * S4-B — Finalization / Selection-Ledger 契約型（**pure types only**・未配線）
 *
 * 設計正本: docs/t11-s4-finalization-handoff-design.md（+ CEO 補正: accept_default に stale 防止 identity・
 *   AssemblyInputCandidate は server-only handoff material）
 *
 * 役割: forced 値 + 明示 ChoiceSelection から、**完全解決時のみ** 非権限・server-only な `AssemblyInputCandidate` を
 *   作る selection-ledger 層の契約。**provisionalDefault は台帳外 SUGGESTION・自動適用しない**。
 *
 * 厳守:
 *   - `AssemblyInputCandidate` は **server-only**（client/shared 投影に出さない）・`ScheduledTravelItineraryDraft`/
 *     `TravelItinerary`/`TravelCandidate` でない・executionAuthority/booking/calendar を持たない。
 *   - shared 出力に private constraint / private rejection reason を出さない。
 *
 * 純粋性: 型 + as-const のみ。
 */

import type { BudgetBand, TransportMode } from "./core-types";
import type {
  PlacedNode,
  ScheduleChoicePoint,
  SharedScheduleProvenance,
  SolverInfeasibility,
  SolverScheduleInput,
} from "./solver-schedule-types";
import type { SequencingFeasibilityResult } from "./solver-sequencing-feasibility";
import type { AssemblyGap, AssemblyInput, ExplicitLockWindow } from "./assembly-types";
import type { SolverInputGap } from "./solver-boundary-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 ChoiceSelection（明示選択・台帳要素）
// ─────────────────────────────────────────────────────────────────────────────

export const CHOICE_SELECTION_ORIGINS = ["user_explicit", "upstream_explicit", "accept_default"] as const;
export type ChoiceSelectionOrigin = (typeof CHOICE_SELECTION_ORIGINS)[number];

/** 選択値（ordering 二択 / composite cluster の有向 pair / time 確定） */
export type ChoiceSelected =
  | { mode: "ordering"; option: string } // option ∈ feasibleOptions（"a→b"）
  | { mode: "ordering_pair"; from: string; to: string } // composite(size≥3): cluster member の有向 pair
  | { mode: "time"; startMin: number }; // startMin ∈ [feasibleRange.lo, hi]

export interface ChoiceSelection {
  selectionId: string;
  kind: "ordering_choice" | "time_window_choice"; // ★ day_assignment_choice は reserved-for-future
  ref: string; // ScheduleChoicePoint.ref を echo（shared-safe）
  selected: ChoiceSelected;
  origin: ChoiceSelectionOrigin;
  /** ★ accept_default 必須: 受諾した choice point の identity（stale 検出）。現 choice と不一致 → stale_default */
  acceptedDefaultIdentity?: string;
}
export type SelectionLedger = ChoiceSelection[];

// ─────────────────────────────────────────────────────────────────────────────
// §2 validation / rejection（neutral・private 漏洩なし）
// ─────────────────────────────────────────────────────────────────────────────

export const SELECTION_REJECTION_REASONS = [
  "selection_infeasible", // ★ 整合不能 / private 違反（neutral・private を名指さない）
  "stale_default", // accept_default の identity 不一致
  "unknown_choice", // ref が現 choice に無い
  "invalid_option", // 選択値が feasibleOptions/feasibleRange 外
  "duplicate_selection", // 同一 ref に複数
] as const;
export type SelectionRejectionReason = (typeof SELECTION_REJECTION_REASONS)[number];

export interface SelectionRejection {
  selectionId: string;
  reason: SelectionRejectionReason;
}
export interface ChoiceSelectionValidationResult {
  valid: boolean;
  rejection?: SelectionRejection;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 handoff gap / provenance
// ─────────────────────────────────────────────────────────────────────────────

/** ★ AssemblyGapKind ⊄ SolverInputGapKind（重複は route_duration_missing/day_assignment_missing/price_unknown のみ） */
export type S4HandoffGap = AssemblyGap | SolverInputGap;

export type HandoffBasis = "forced_by_constraint" | "explicit_choice" | "accepted_default" | "cascade_of_choice";
export interface HandoffProvenanceEntry {
  ref: string;
  basis: HandoffBasis; // ★ private member 無
  selectionId?: string;
}

/** caller 供給の AssemblyInput dual-source field（S4 は検証のみ・発明しない） */
export interface S4AssemblyExtras {
  nodeBudgetBands?: Record<string, BudgetBand>;
  edgeTransports?: Record<string, TransportMode>;
  edgeCosts?: Record<string, BudgetBand>;
  lockWindows?: Record<string, ExplicitLockWindow>;
}

export interface S4ResolutionInput {
  base: SolverScheduleInput;
  sequencing: SequencingFeasibilityResult; // S3 結果（shared surface）
  ledger: SelectionLedger; // append-only
  assemblyExtras?: S4AssemblyExtras;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 出力（server-only candidate / unresolved report / 失敗）
// ─────────────────────────────────────────────────────────────────────────────

/** ★ server-only handoff material（client/shared 投影に出さない・itinerary でない・S4 は assembler を呼ばない） */
export interface AssemblyInputCandidate {
  outcome: "assembly_input_candidate";
  /** ★ server-only marker（display/client payload でない） */
  serverOnly: true;
  authoritative: false;
  draft: true;
  candidateId: string;
  assemblyInput: AssemblyInput; // 全 field が forced-or-selected
  handoffProvenance: HandoffProvenanceEntry[];
  /** per-node の解決経路（値は exhaustively この 2 値・private-forced は "forced" に写す） */
  resolutionTrace: Record<string, "forced" | "explicit_selection">;
}

export interface UnresolvedChoiceReport {
  outcome: "unresolved_choices";
  authoritative: false;
  draft: true;
  candidateId: string;
  placed: PlacedNode[];
  residualChoicePoints: ScheduleChoicePoint[]; // shared 再計算・provisionalDefault SUGGESTION を持ち得る
  missingForHandoff: S4HandoffGap[]; // ★ AssemblyGap|SolverInputGap・fail-closed・default しない
  sharedProvenance: SharedScheduleProvenance;
}

export interface S4FinalizationDiagnostic {
  code: string;
  detail?: string; // shared-safe
}

export type S4ResolutionResult =
  | AssemblyInputCandidate
  | UnresolvedChoiceReport
  | { outcome: "selection_rejected"; authoritative: false; draft: true; candidateId: string; rejections: SelectionRejection[] }
  | { outcome: "infeasible"; authoritative: false; draft: true; candidateId: string; infeasibility: SolverInfeasibility }
  | { outcome: "needs_input"; authoritative: false; draft: true; candidateId: string; missingForSchedule: SolverInputGap[] };
