/**
 * T3A — Travel proposal / candidate 契約型（**pure types only**・未配線）
 *
 * 設計: docs/travel-mode-plan-os-extension-design.md §4/§5 + GPT logic-side note 2026-06-12
 *
 * ★ 概念の分離（前提の整理）:
 *   T1A `TravelCandidate` は **itinerary DAG を持つ完成候補**（= 後段の solver / 場所検索の出力）。
 *   T3 の `TravelProposal` は **場所確定前の「提案骨格」**（角度 + 条件評価 + rationale + 欠損 +
 *   不確実性）。場所検索・経路・LLM を使わず、決定論で作れる範囲のみ。
 *   関係: ExtractedSlotSet → (T3) TravelProposal[]（3案骨格） → (solver・HOLD) → T1A TravelCandidate。
 *
 * 純粋性: 型 + as-const のみ（関数・runtime・I/O なし）。値は T1A/T1B/T2B 互換。
 */

import type {
  BudgetBand,
  ConstraintAxis,
  Pace,
  UncertaintyLevel,
  ViewerScopedRationale,
  Visibility,
} from "./core-types";
import type { DateOrRangeValue, DescriptorKey, MissingSlotQuestion, TravelSlotKey } from "./slot-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 提案の角度（fixed・experience angle）
// ─────────────────────────────────────────────────────────────────────────────

export const PROPOSAL_ANGLES = ["relaxed", "food_focused", "active", "nature", "culture"] as const;
export type ProposalAngle = (typeof PROPOSAL_ANGLES)[number];

/** 構造的なフィット度（決定論ラベル・score ではない） */
export const FIT_LABELS = ["fit", "stretch", "conflict"] as const;
export type FitLabel = (typeof FIT_LABELS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// §2 条件評価の単位
// ─────────────────────────────────────────────────────────────────────────────

/** soft preference の一致（どの述語が角度に効いたか） */
export interface SoftPreferenceMatch {
  descriptorKey: DescriptorKey;
  descriptorValue: string;
  /** その preference の出所可視性（shared 射影で private を落とすため） */
  visibility: Visibility;
}

/**
 * hard constraint 違反（fail-closed の理由）。**produced proposal には載らない**
 * （違反 = 角度ごと reject の理由として `RejectedAngle` に載る）。private 由来は shared 射影で除去。
 */
export interface HardConstraintViolation {
  axis: ConstraintAxis;
  /** 正規化済み descriptor（"avoid:long_walk" 等） */
  descriptor: string;
  /** 違反元の可視性（private なら shared 射影で当該 reject ごと除去） */
  visibility: Visibility;
  /** 違反元の owner（private の場合のみ非 null） */
  ownerParticipantId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 TravelProposal（提案骨格・場所確定前）
// ─────────────────────────────────────────────────────────────────────────────

export interface TravelProposal {
  /** 決定論 id（`proposal:${angle}`） */
  candidateId: string;
  angle: ProposalAngle;
  title: string;
  summary: string;
  /** 時間窓（slot 由来・未確定なら null） */
  timeWindow: DateOrRangeValue | null;
  /** 場所/エリアの placeholder（解決前。"未指定" もあり） */
  areaPlaceholder: string;
  /** 予算帯（slot 由来・null 可） */
  budgetBand: BudgetBand | null;
  paceFit: FitLabel;
  mobilityFit: FitLabel;
  softPreferenceMatches: SoftPreferenceMatch[];
  uncertainty: UncertaintyLevel;
  /** この提案に不足している入力（slot key） */
  missingInputs: TravelSlotKey[];
  /**
   * 説明（M5 二層）。shared = 共有条件のみ由来。forParticipant = 本人の private 由来を含み得る。
   * shared 射影では forParticipant を落とす。
   */
  rationale: ViewerScopedRationale;
}

/** fail-closed で却下された角度 */
export interface RejectedAngle {
  angle: ProposalAngle;
  violations: HardConstraintViolation[];
}

/** 入力レベルの致命的問題（全提案不能） */
export const PROPOSAL_INPUT_ERRORS = ["invalid_participants", "contradictory_red_lines"] as const;
export type ProposalInputError = (typeof PROPOSAL_INPUT_ERRORS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// §4 出力（full・solver/owner 側）
// ─────────────────────────────────────────────────────────────────────────────

export interface ProposalSetOutput {
  participantIds: string[];
  /** 最大 3 案（採用された提案・private 含む rationale） */
  proposals: TravelProposal[];
  /** fail-closed で落ちた角度（private 違反含む） */
  rejected: RejectedAngle[];
  /** 不足入力の問い（intent ラベルのみ） */
  missingQuestions: MissingSlotQuestion[];
  /** 入力レベルの致命的問題（あれば proposals は空） */
  inputError: ProposalInputError | null;
}

/** MVP の最大提案数（3案）。group mode 同様、恒久制限ではない（拡張時はこの定数のみ変更）。 */
export const MVP_MAX_PROPOSALS = 3;
