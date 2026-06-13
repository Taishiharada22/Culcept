/**
 * T10-B — After-action learning（regret→constraint）契約型（**pure types only**・未配線）
 *
 * 設計: docs/t10-after-action-learning-plan.md + CEO 補正 2026-06-12
 *
 * 役割: 旅行後の明示フィードバック（後悔/満足/疲労/予算驚き/ペース/移動/宿・食・場所/不均衡/
 * 「次もこれ」「次は避ける」）を、**次回プランの制約/選好デルタ**へ変換するための契約型。
 *
 * ★ 過学習防止（CEO 最重要補正）: 1 回の感想を即 hard 制約にしない。デルタは既定 **soft**・
 *   低 confidence・decay/ttl 付き。hard は explicit rule / severe / non-negotiable / 反復証拠のみ。
 *
 * 純粋性: 型 + as-const のみ。永続化・memory・DB なし。
 */

import type { BudgetBand, Pace, Visibility, ViewerScopedRationale } from "./core-types";
import type { DescriptorKey } from "./slot-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 feedback の語彙
// ─────────────────────────────────────────────────────────────────────────────

export const AFTER_ACTION_DIMENSIONS = [
  "pace", //                詰め込み/ゆっくり
  "budget", //              高すぎ/安く
  "mobility", //            移動多すぎ/歩きすぎ
  "fatigue", //             疲れた → pace/移動 緩和
  "time", //                朝早すぎ/帰り遅い
  "lodging", //             宿
  "food", //                食事（夕食付き等）
  "place", //               場所/観光
  "participant_balance", // 誰かに偏った
  "overall", //             全体の満足/不満
] as const;
export type AfterActionFeedbackDimension = (typeof AFTER_ACTION_DIMENSIONS)[number];

export const AFTER_ACTION_DIRECTIONS = ["reduce", "increase", "reinforce", "avoid"] as const;
export type AfterActionFeedbackDirection = (typeof AFTER_ACTION_DIRECTIONS)[number];

export const AFTER_ACTION_MAGNITUDES = ["slight", "moderate", "strong"] as const;
export type AfterActionFeedbackMagnitude = (typeof AFTER_ACTION_MAGNITUDES)[number];

export type AfterActionFeedbackOwner = { kind: "shared" } | { kind: "participant"; participantId: string };

export interface AfterActionFeedback {
  dimension: AfterActionFeedbackDimension;
  direction: AfterActionFeedbackDirection;
  magnitude: AfterActionFeedbackMagnitude;
  owner: AfterActionFeedbackOwner;
  visibility: Visibility;
  /** lodging/food/place 等の対象（"dinner_included" / "onsen" / "quiet" 等） */
  descriptor?: string;
  // ── hard 昇格シグナル（既定は全て false/0 ＝ soft）──
  /** ユーザーが明示的に hard rule を述べた */
  explicitHardRule?: boolean;
  /** 深刻なフィードバック */
  severe?: boolean;
  /** 明示的に non-negotiable */
  nonNegotiable?: boolean;
  /** 過去同種フィードバックの反復回数（pure input・閾値で hard 昇格） */
  repeatedEvidenceCount?: number;
}

/** 相対デルタの anchor（過去プランで効いていた条件・無ければ方向性デフォルト） */
export interface AfterActionPastConditions {
  pace?: Pace;
  budgetHi?: number;
  maxWalkKm?: number;
  departAfterMin?: number;
  returnByMin?: number;
}

export interface AfterActionInput {
  feedback: AfterActionFeedback[];
  participantIds: string[];
  pastConditions?: AfterActionPastConditions;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 学習デルタ（rich metadata・過学習防止）
// ─────────────────────────────────────────────────────────────────────────────

export const DELTA_HARDNESS = ["soft", "hard"] as const;
export type DeltaHardness = (typeof DELTA_HARDNESS)[number];

export const DELTA_SCOPES = ["trip", "participant", "pair", "trip_type"] as const;
export type DeltaScope = (typeof DELTA_SCOPES)[number];

export const DELTA_PERSISTENCE = ["one_off", "repeatable", "unknown"] as const;
export type DeltaPersistence = (typeof DELTA_PERSISTENCE)[number];

export const DELTA_TARGETS = ["pace", "budget", "mobility", "time", "preference", "fairness_bias"] as const;
export type DeltaTarget = (typeof DELTA_TARGETS)[number];

/** merge 時に次回入力へ落とすための payload（typed slot / descriptor / fairness） */
export type AfterActionDeltaPayload =
  | { kind: "pace"; pace: Pace }
  | { kind: "budget"; band: BudgetBand }
  | { kind: "mobility"; maxWalkKm: number }
  | { kind: "time"; departAfterMin?: number; returnByMin?: number }
  | { kind: "preference"; descriptorKey: DescriptorKey; descriptorValue: string }
  | { kind: "fairness_bias"; overFavoredParticipantId: string; biasMagnitude: number };

export interface AfterActionLearningDelta {
  target: DeltaTarget;
  /** 由来 dimension（観測用） */
  sourceDimension: AfterActionFeedbackDimension;
  /** 0..1（magnitude 由来） */
  strength: number;
  /** 0..1（既定低・反復/severe/explicit で昇格） */
  confidence: number;
  /** ★ 既定 soft。hard は explicit/severe-strong/non-negotiable/反復のみ */
  hardness: DeltaHardness;
  scope: DeltaScope;
  persistence: DeltaPersistence;
  /** soft は decay（日数）・hard は null（無期限）。**enforcement は pruneExpiredDeltas に elapsed を渡したときのみ**（pure・clock なし） */
  decayTtlDays: number | null;
  owner: AfterActionFeedbackOwner;
  visibility: Visibility;
  provenance: "after_action";
  /** 曖昧/矛盾 → true（merge では適用しない） */
  needsClarification: boolean;
  payload: AfterActionDeltaPayload;
  rationale: ViewerScopedRationale;
}

export interface AfterActionClarification {
  dimension: AfterActionFeedbackDimension;
  owner: AfterActionFeedbackOwner;
  /** "conflicting_directions" 等 */
  reason: string;
}

/** transform 結果（CEO 命名: RegretToConstraintTransformResult） */
export interface RegretToConstraintTransformResult {
  deltas: AfterActionLearningDelta[];
  clarifications: AfterActionClarification[];
  rationale: ViewerScopedRationale;
}
