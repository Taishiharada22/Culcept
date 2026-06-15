/**
 * T11-B1 — Itinerary Composition / Solver Boundary 契約型（**pure types only**・未配線）
 *
 * 設計正本: docs/t11-b-itinerary-composition-solver-boundary-preflight.md（+ CEO 補正: budgetBand は optional/null-safe・捏造しない）
 *
 * 役割: fitted/retrieved entity + 制約を **pre-solver の合成 draft**（PreSolverNode/PreSolverEdge/制約/
 *   fail-closed 診断）へ写す契約。**solver/scheduler/optimizer/route API/外部 retrieval/action authority の手前で止まる**。
 *
 * 厳格な性質（型で境界を担保）:
 *   - `PreSolverNode` は **startMin/endMin/dayIndex を持たない**（solver 所有）。
 *   - `PreSolverEdge` は **durationMin を持たない**（route API なし・捏造しない）。
 *   - 既存 `TravelNode/TravelEdge/TravelDay/TravelItinerary` は **emit しない**（solver 出力に予約）。
 *   - `authoritative:false`・`draft:true`・executionAuthority/booking/action authority なし・raw FitResult なし。
 *
 * 純粋性: 型 + as-const のみ。
 */

import type {
  ActivityKind,
  BudgetBand,
  FatigueLoad,
  NodeConfidence,
  Pace,
  PlaceRef,
  TransportMode,
  TravelConstraint,
  TravelPlanScope,
  Visibility,
} from "./core-types";
import type { FitContext, OrderingConstraint, RouteChainState } from "./fit-types";
import type { EntityRetrievalCandidate, EntityTimeLock } from "./entity-retrieval-types";
import type { ProposalFitInput } from "./fit-decision-adapter-types";
import type { ContingencyBranch } from "./contingency-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 pre-solver node / edge（solver 所有 field を型で omit）
// ─────────────────────────────────────────────────────────────────────────────

/** = TravelNode から solver 所有(startMin/endMin/dayIndex)を除いた前段。時刻/日割を持たない。 */
export interface PreSolverNode {
  /** 決定論 id（`node:${placeRefId}:${activityKind}`） */
  nodeId: string;
  /** 由来 entity（hardBlocker/constraint と相関する binding キー） */
  placeRefId: string;
  place: PlaceRef;
  activityKind: ActivityKind;
  /** ★ 数値 1|2|3|4|5（文字列でない・burden/recovery 由来・捏造しない） */
  fatigueLoad: FatigueLoad;
  nodeConfidence: NodeConfidence;
  /** ★ optional/null-safe。price 不明は **省略**（既定 BudgetBand を捏造しない・source から推論しない） */
  budgetBand?: BudgetBand;
  // ★ startMin/endMin/dayIndex は持たない＝solver が割る（未placed を型で表現）
}

export const PRE_SOLVER_EDGE_KINDS = [
  "route_transition",
  "must_precede",
  "luggage_drop_enables",
  "lock_implied",
] as const;
export type PreSolverEdgeKind = (typeof PRE_SOLVER_EDGE_KINDS)[number];

/** door-to-door burden（★派生値・observed/live でない） */
export interface RouteBurdenMeta {
  derived: true;
  doorToDoorNorm?: number;
}

/** = TravelEdge から solver 所有(durationMin)を除いた前段。route API なし。reorderable は edge にしない。 */
export interface PreSolverEdge {
  fromNodeId: string;
  toNodeId: string;
  /** route_transition=移動 placeholder / 他=方向内在 ordering。reorderable は含めない */
  kind: PreSolverEdgeKind;
  /** route_transition で意味を持つ（legs 由来 or "other"）。捏造 mode なし */
  transport?: TransportMode;
  /** 明示供給 fare 証拠がある時のみ。無ければ省略 */
  cost?: BudgetBand;
  burden?: RouteBurdenMeta;
  // ★ durationMin は持たない（route API なし・捏造しない）
}

/** reorderable pair（★無向・合成は順序を選ばない＝solver HOLD） */
export interface ReorderableHint {
  nodeIdA: string;
  nodeIdB: string;
}

/** derive_shortest_from_terminal 等の solver 専用 hint（preflight は解かず carry のみ） */
export interface SolverOrderingHint {
  kind: OrderingConstraint["kind"];
  subjectRef: string;
  objectRef: string;
  relaxable: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 fail-closed 診断（id/code のみ・private reason を載せない）
// ─────────────────────────────────────────────────────────────────────────────

export const UNSATISFIED_CONSTRAINT_REASONS = [
  "impossible_time_lock",
  "ordering_cycle",
  "budget_red_line_exceeded",
  "no_feasible_placement",
] as const;
export type UnsatisfiedConstraintReason = (typeof UNSATISFIED_CONSTRAINT_REASONS)[number];

export interface UnsatisfiedConstraint {
  /** 参照 constraint id（or ordering ref ペア由来の合成 id） */
  constraintId: string;
  reason: UnsatisfiedConstraintReason;
  visibility: Visibility;
  ownerParticipantId: string | null;
}

export const COMPOSITION_MISSING_QUESTION_REASONS = [
  "entity_unbound",
  "lock_unplaceable",
  "low_confidence",
  "area_unresolved",
  "route_duration_missing",
  "price_unknown",
] as const;
export type CompositionMissingQuestionReason = (typeof COMPOSITION_MISSING_QUESTION_REASONS)[number];

/** ★ shared-safe field + 理由 code のみ。private reason 文/descriptor を載せない */
export interface CompositionMissingQuestion {
  field: string;
  reason: CompositionMissingQuestionReason;
}

/** ★ FitHardBlock.reason 由来の bounded code のみ。raw FitResult を含まない */
export interface CompositionHardBlocker {
  placeRefId: string;
  reasonCode: string;
  visibility: Visibility;
  ownerParticipantId: string | null;
}

export interface CompositionDiagnostic {
  code: string;
  /** shared-safe（private を含まない） */
  detail?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 入力（CompositionInput）
// ─────────────────────────────────────────────────────────────────────────────

/** caller 供給 binding（placeRefId → 意図 activity・fit 紐付け）。join は caller 責務 */
export interface CompositionEntityBinding {
  placeRefId: string;
  /** 省略時は category から導出 */
  intendedActivityKind?: ActivityKind;
  nodeConfidenceHint?: NodeConfidence;
}

export interface CompositionInput {
  /** draft id（proposal.candidateId を echo・caller 供給） */
  candidateId: string;
  /** 場所未確定の提案骨格（任意） */
  proposal?: { candidateId: string; areaPlaceholder: string };
  scope?: TravelPlanScope;
  pace?: Pace;
  /** G2 retrieval 出力（順序なし集合） */
  entities: EntityRetrievalCandidate[];
  bindings: CompositionEntityBinding[];
  /**
   * ★ 合成では `candidateId` = **placeRefId** で keying（entity 単位の advisory + hard-block gate）。
   *   server-side のみ・raw FitResult は出力に載せない。
   */
  fitInputs?: ProposalFitInput[];
  orderingConstraints?: OrderingConstraint[];
  timeLocks?: EntityTimeLock[];
  /** ★ route は ordering のみ消費・connection の legs/duration/reliability は scoring に使わない */
  routeChains?: RouteChainState[];
  fitContext?: FitContext;
  /** advisory fallback carry（shared-safe のみ・private branch は渡さない） */
  contingencyBranches?: ContingencyBranch[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 出力（CompositionDraft | CompositionFailure・union）
// ─────────────────────────────────────────────────────────────────────────────

export interface CompositionDraft {
  outcome: "draft";
  /** ★ 構造的 false 固定（実行権限でない） */
  authoritative: false;
  /** ★ pre-solver DRAFT 標識（解決済 TravelItinerary でない） */
  draft: true;
  candidateId: string;
  /** ★ フラット集合・day 分割しない（dayIndex 未割当=solver HOLD） */
  candidateNodes: PreSolverNode[];
  edges: PreSolverEdge[];
  reorderableHints: ReorderableHint[];
  solverHints: SolverOrderingHint[];
  constraints: TravelConstraint[];
  unsatisfiedConstraints: UnsatisfiedConstraint[];
  missingCompositionQuestions: CompositionMissingQuestion[];
  hardBlockers: CompositionHardBlocker[];
  /** shared-safe な fallback branch のみ（private branch は除去済み） */
  fallbackBranches: ContingencyBranch[];
}

export const COMPOSITION_FAILURE_REASONS = [
  "no_bound_entities",
  "all_nodes_hard_blocked",
  "impossible_time_lock",
  "missing_required_subject",
] as const;
export type CompositionFailureReason = (typeof COMPOSITION_FAILURE_REASONS)[number];

export interface CompositionFailure {
  outcome: "failure";
  failed: true;
  reason: CompositionFailureReason;
  needsAlternative: boolean;
  diagnostics: CompositionDiagnostic[];
  /** 失敗でも観測された hard block を carry（shared 投影で private は strip） */
  hardBlockers: CompositionHardBlocker[];
}

export type CompositionResult = CompositionDraft | CompositionFailure;
