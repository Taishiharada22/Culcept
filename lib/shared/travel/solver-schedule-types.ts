/**
 * S1 — Real Solver 型壁（**pure types only**・未配線）
 *
 * 設計正本: docs/t11-real-solver-design.md（+ CEO 補正 1: forced_by_private_constraint は authoritative/server-only・
 *   shared 投影で露出しない / 補正 2: derive_shortest_from_terminal は explicit route metric がある時のみ tie-break）
 *
 * 役割: 真の solver（STN feasibility-region → forced-vs-choice → 配置）の型壁を確立する。
 *   本ファイルは **型 + as-const のみ**。S2 は STN feasibility-region を計算する（S3 sequencing/day/placement は別 GO・HOLD）。
 *
 * 厳守:
 *   - **authoritative provenance vs shared 投影を分離**。`forced_by_private_constraint` は authoritative のみ。
 *   - shared 型に private 由来（private 制約の存在）を露出しない。
 *   - executionAuthority / booking / calendar authority / live route/weather/place field を持たない。
 *   - `ScheduledTravelItineraryDraft` / `TravelCandidate` を本 slice で emit しない。
 */

import type { TravelPlanScope, ViewerScopedRationale, Visibility } from "./core-types";
import type { CompositionDraft, UnsatisfiedConstraint } from "./composition-types";
import type { SolverInputGap } from "./solver-boundary-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 placement basis（authoritative / shared-safe の二層）
// ─────────────────────────────────────────────────────────────────────────────

/** ★ authoritative/server-only。`forced_by_private_constraint` を含み得る */
export const PLACEMENT_BASES = [
  "forced_by_lock",
  "forced_by_precedence",
  "forced_by_duration",
  "forced_by_scope",
  "forced_by_private_constraint", // ★ server-only・shared に露出しない
  "explicit_choice",
  "single_day_zero",
  "tiebreak_earliest_feasible",
  "tiebreak_shortest_route", // ★ 補正2: explicit route metric がある時のみ・override 可
] as const;
export type PlacementBasis = (typeof PLACEMENT_BASES)[number];

/** ★ shared-safe。`forced_by_private_constraint` を含まず、中立 `constrained` に写す */
export const SHARED_PLACEMENT_BASES = [
  "forced_by_lock",
  "forced_by_precedence",
  "forced_by_duration",
  "forced_by_scope",
  "explicit_choice",
  "single_day_zero",
  "tiebreak_earliest_feasible",
  "tiebreak_shortest_route",
  "constrained", // ★ 中立代替（private 制約の存在を明かさない）
] as const;
export type SharedPlacementBasis = (typeof SHARED_PLACEMENT_BASES)[number];

/** ★ authoritative basis → shared-safe basis。private 由来は `constrained` に潰し、存在を明かさない */
export function projectSharedPlacementBasis(basis: PlacementBasis): SharedPlacementBasis {
  return basis === "forced_by_private_constraint" ? "constrained" : basis;
}

export const TIE_BREAK_RULES = [
  "anchor_first",
  "earliest_feasible",
  "fewest_day_crossings",
  "shortest_route",
  "soft_preference_count",
  "lexicographic_nodeId",
] as const;
export type TieBreakRule = (typeof TIE_BREAK_RULES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// §2 配置 / provenance（authoritative + shared 投影）
// ─────────────────────────────────────────────────────────────────────────────

/** 最終配置 carrier（S3/S4 で産出・S2 は産まない）。authoritative */
export interface PlacedNode {
  nodeId: string;
  startMin: number; // 0..1439
  endMin: number; // 0..1439
  dayIndex: number;
  placementBasis: PlacementBasis; // authoritative（private 由来含み得る）
}

export interface SlackBand {
  earliestStart: number;
  latestStart: number;
}

/** authoritative provenance（private narrowing を含み得る・server-only） */
export interface ScheduleProvenance {
  intervalBasis: Record<string, PlacementBasis>;
  daySource: Record<string, "explicit" | "single_day_zero" | "forced_by_lock" | "forced_by_precedence">;
  tieBreaksApplied: Array<{ at: string; rule: TieBreakRule }>;
  /** authoritative slack（private narrowing 反映・shared に出さない） */
  slackBands: Record<string, SlackBand>;
}

/** ★ shared 投影 provenance。private 由来 basis を中立化し、private で狭めた slack を publish しない */
export interface SharedScheduleProvenance {
  intervalBasis: Record<string, SharedPlacementBasis>;
  daySource: Record<string, "explicit" | "single_day_zero" | "forced_by_lock" | "forced_by_precedence">;
  tieBreaksApplied: Array<{ at: string; rule: TieBreakRule }>;
  /** ★ shared-only 制約から計算した slack のみ（private narrowing は反映しない・private 狭めは omit） */
  slackBands: Record<string, SlackBand>;
}

/** ★ surfaced agency（型は shared-safe — feasibleRange は shared-only 制約由来であること） */
export interface ScheduleChoicePoint {
  kind: "day_assignment_choice" | "ordering_choice" | "time_window_choice";
  ref: string; // shared-safe nodeId / edgeKey
  feasibleRange?: { lo: number; hi: number }; // shared-only 制約由来
  feasibleOptions?: string[]; // shared-safe ids
  namedTieBreak: TieBreakRule;
  /** override 可能な暫定既定（自動 pin でない・補正4） */
  provisionalDefault?: number;
  rationale: ViewerScopedRationale; // private 理由は .forParticipant のみ
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 不能（IIS・shared-safe）
// ─────────────────────────────────────────────────────────────────────────────

export interface SolverInfeasibility {
  state: "infeasible_constraints" | "blocked_by_hard_constraint";
  /** shared-safe IIS（reason ∈ UnsatisfiedConstraintReason・private descriptor を含まない） */
  conflictSet: UnsatisfiedConstraint[];
  /** ★ relaxable:true(soft/preference)のみ・red_line を絶対含めない・wouldRestore は純 probe で auto-apply しない */
  suggestedRelaxations?: Array<{ constraintId: string; wouldRestore: boolean }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 explicit 数値入力（descriptor を parse しない・presence boolean を bound に使わない）
// ─────────────────────────────────────────────────────────────────────────────

/** lock の 7 種（precedence/reorderable/derive_shortest を含まない） */
export const LOCK_ORDERING_KINDS = [
  "timed_entry_lock",
  "last_departure_lock",
  "open_hours_window_lock",
  "checkin_window_lock",
  "checkout_window_lock",
  "meal_time_lock",
  "reservation_window_lock",
] as const;
export type LockOrderingKind = (typeof LOCK_ORDERING_KINDS)[number];

/** ★ per-OrderingKind binding table（どの event を bind するか・golden-tested const） */
export const ORDERING_LOCK_BINDING: Record<LockOrderingKind, "start" | "end" | "both"> = {
  timed_entry_lock: "start",
  checkin_window_lock: "start",
  meal_time_lock: "start",
  last_departure_lock: "end",
  checkout_window_lock: "end",
  open_hours_window_lock: "both",
  reservation_window_lock: "both",
};

/** explicit 数値 lock 窓（presence boolean でなく具体値・private narrowing 可） */
export interface SolverLockBoundInput {
  nodeId: string;
  kind: LockOrderingKind;
  windowStartMin: number; // 0..1439
  windowEndMin: number; // 0..1439
  visibility?: Visibility; // 既定 shared。private は authoritative のみ narrow
  constraintId?: string;
}

/** explicit 数値 time-axis bound（descriptor から導出しない） */
export interface SolverTimeBoundInput {
  /** null = 全 node / 最終 event（例 return_by） */
  nodeId: string | null;
  event: "start" | "end";
  kind: "no_earlier_than" | "no_later_than";
  minute: number; // 0..1439
  visibility?: Visibility;
  constraintId?: string;
}

export interface SolverScheduleInput {
  draft: CompositionDraft;
  scope?: TravelPlanScope;
  nodeDurations: Record<string, number>; // nodeId → dwell 分（explicit・捏造しない）
  edgeDurations: Record<string, number>; // `${fromNodeId}>>${toNodeId}` → route 分（explicit）
  nodeDayBindings?: Record<string, number>; // nodeId → dayIndex（range で必須・scope から導出しない）
  lockBounds?: SolverLockBoundInput[]; // explicit 数値 lock 窓
  timeBounds?: SolverTimeBoundInput[]; // explicit 数値 time-axis bound
  /** ★ S4 選択由来 precedence（must_precede と同様に STN へ注入・S4 が ChoiceSelection を edge 化する経路） */
  selectionPrecedence?: Array<{ from: string; to: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 S2 出力（feasibility-region・sequence/day/placement を確定しない）
// ─────────────────────────────────────────────────────────────────────────────

/** 各 event の取り得る区間（点でなく region・S2 は確定配置しない） */
export interface EventRegion {
  startEarliest: number;
  startLatest: number;
  endEarliest: number;
  endLatest: number;
  /** startEarliest===startLatest && endEarliest===endLatest（constraints が一意に固定） */
  forced: boolean;
}

export type TemporalFeasibilityResult =
  | { outcome: "feasible_region"; events: Record<string, EventRegion>; authoritative: false; draft: true; candidateId: string }
  | { outcome: "infeasible"; infeasibility: SolverInfeasibility; authoritative: false; draft: true; candidateId: string }
  | { outcome: "needs_input"; missingForSchedule: SolverInputGap[]; authoritative: false; draft: true; candidateId: string };

// ─────────────────────────────────────────────────────────────────────────────
// §6 最終 solver 出力（S3/S4 で産出・S1 では型のみ・S2 は産まない）
// ─────────────────────────────────────────────────────────────────────────────

export type SolverSchedule =
  | { outcome: "solved"; placed: PlacedNode[]; provenance: ScheduleProvenance; choicePoints: ScheduleChoicePoint[]; authoritative: false; draft: true; candidateId: string }
  | { outcome: "needs_input"; missingForSchedule: SolverInputGap[]; authoritative: false; draft: true; candidateId: string }
  | { outcome: "infeasible"; infeasibility: SolverInfeasibility; authoritative: false; draft: true; candidateId: string };

// ─────────────────────────────────────────────────────────────────────────────
// §7 名前付き定数
// ─────────────────────────────────────────────────────────────────────────────

/** ★ 補正4: この slack(分)以上の CHOICE は ScheduleChoicePoint を必須提示し自動 pin しない（契約の一部） */
export const MATERIAL_SLACK_THRESHOLD_MIN = 15 as const;

/** ★ per-day node CAP（S3 で enforce・超過は split_day_required） */
export const SCHEDULE_NODE_CAP_PER_DAY = 8 as const;
