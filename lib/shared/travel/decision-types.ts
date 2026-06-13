/**
 * T5A — Decision / consensus / fairness-history 契約型（**pure types only**・未配線）
 *
 * 設計: GPT logic-side note 2026-06-12（choose / block / ask / fairness memory）+
 *       Stratigi 2022（逐次公平性: 前回譲った側を今回優遇）
 *
 * 入力: T4 `ProposalComparison` + 任意の `FairnessHistoryInput`（**純 input のみ**）。
 * 出力: `DecisionResult`（recommend / tie / needs_question / blocked + consensus + impact + rationale）。
 *
 * ★ 境界（CEO 2026-06-12）: fairness ledger は **純 input object** であり、永続化・DB schema・
 *   実履歴 read/write・Plan Intelligence 接続は **しない**。本ファイルは型のみ。
 */

import type { Visibility, ViewerScopedRationale } from "./core-types";
import type { MissingSlotPriority, TravelSlotKey } from "./slot-types";
import type { DecisionBlocker, ParticipantImpact } from "./proposal-comparison-types";
import type { ProposalInputError } from "./proposal-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 状態
// ─────────────────────────────────────────────────────────────────────────────

export const DECISION_STATES = ["recommend", "tie", "needs_question", "blocked"] as const;
export type DecisionState = (typeof DECISION_STATES)[number];

export const CONSENSUS_READINESS = ["ready", "tentative", "not_ready"] as const;
export type ConsensusReadiness = (typeof CONSENSUS_READINESS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// §2 follow-up question
// ─────────────────────────────────────────────────────────────────────────────

export const DECISION_QUESTION_KINDS = ["missing_slot", "tie_preference"] as const;
export type DecisionQuestionKind = (typeof DECISION_QUESTION_KINDS)[number];

export interface DecisionQuestion {
  about: DecisionQuestionKind;
  /** 安定した intent ラベル（ユーザー向け文言ではない） */
  intent: string;
  priority: MissingSlotPriority;
  /** missing_slot の場合 */
  slotKey?: TravelSlotKey;
  /** tie_preference の場合: 拮抗している candidateId */
  optionIds?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 fairness history（★ 純 input・DB ではない）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 過去決定の偏りの集計（`coalter_fairness_ledger.bias_score` 相当の **純 input 表現**）。
 * priorBias: -1 = 完全に participantA 寄り … 0 = 均衡 … +1 = 完全に participantB 寄り。
 * → 逐次公平性: bias の逆方向（前回譲った側）を今回 **gently tilt** で優先。
 * visibility: shared = 共有台帳 / private = 片側のみ知る感覚（決定に影響するが shared に出さない）。
 */
export interface FairnessHistoryInput {
  participantA: string;
  participantB: string;
  priorBias: number;
  visibility: Visibility;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 出力
// ─────────────────────────────────────────────────────────────────────────────

/** 推奨案に対する participant 影響（T4 ParticipantImpact と同形・counts のみ） */
export type ParticipantDecisionImpact = ParticipantImpact;

export interface DecisionResult {
  state: DecisionState;
  /** recommend のとき非 null */
  recommendedProposalId: string | null;
  /** tie のとき拮抗 candidateId */
  tiedProposalIds: string[];
  /** needs_question / tie のとき */
  followUpQuestion: DecisionQuestion | null;
  blockers: DecisionBlocker[];
  consensusReadiness: ConsensusReadiness;
  /** 推奨案の participant 影響（counts・shared 射影で private 0 化） */
  impact: ParticipantDecisionImpact[];
  /** 履歴で tilt したか（boolean・内容なし） */
  tiltedByHistory: boolean;
  /** tilt の根拠可視性（private なら shared 射影で tilt を隠す）。tilt なしは null */
  tiltVisibility: Visibility | null;
  /** 説明（M5 二層）。shared = 共有のみ・forParticipant = 本人の private 含み得る */
  rationale: ViewerScopedRationale;
  inputError: ProposalInputError | null;
}
