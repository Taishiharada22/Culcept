/**
 * T4A — Proposal comparison / diff / fairness 契約型（**pure types only**・未配線）
 *
 * 設計: docs/travel-mode-plan-os-extension-design.md §5（Plan Diff/Pareto/fairness）+
 *       GPT logic-side note 2026-06-12（比較→守り/楽/攻め→tradeoff→誰に負荷→何を聞けば決まる）
 *
 * 入力: T3 `ProposalSetOutput` + 同一 `ExtractedSlot[]`（owner 帰属のため）。
 * 出力: `ProposalComparison`（diff / Pareto / role / fairness / blockers / 優先質問）。
 *
 * 純粋性: 型 + as-const のみ。値は T1A/T3 互換。**descriptor 文字列は本契約に載せない**
 *   （比較は counts / labels / ids のみ＝private descriptor の漏洩経路を構造的に断つ。
 *    説明文は `summary: ViewerScopedRationale` に集約し M5 二層で扱う）。
 */

import type { UncertaintyLevel, ViewerScopedRationale } from "./core-types";
import type { MissingSlotQuestion } from "./slot-types";
import type { ProposalAngle, ProposalInputError } from "./proposal-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 役割（守り/楽/攻め）・angle→role は静的・決定論
// ─────────────────────────────────────────────────────────────────────────────

export const PROPOSAL_ROLES = ["protect", "easy", "push"] as const;
export type ProposalRole = (typeof PROPOSAL_ROLES)[number];

/** angle→role の正本（透明・固定）。relaxed/nature=楽、active=攻め、food/culture=守り。 */
export const ANGLE_ROLE: Record<ProposalAngle, ProposalRole> = {
  relaxed: "easy",
  nature: "easy",
  active: "push",
  food_focused: "protect",
  culture: "protect",
};

// ─────────────────────────────────────────────────────────────────────────────
// §2 比較エントリ（quality 軸 = dominance / character 軸 = 特徴）
// ─────────────────────────────────────────────────────────────────────────────

export interface ProposalComparisonEntry {
  candidateId: string;
  angle: ProposalAngle;
  role: ProposalRole;
  /** quality 軸: soft 一致数（↑ 良い） */
  softMatchCount: number;
  /** quality 軸: stretch 数（paceFit/mobilityFit の "stretch" 数・↓ 良い） */
  stretchCount: number;
  uncertainty: UncertaintyLevel;
  missingCount: number;
  /** dominance: 自分を支配する candidateId（空 = Pareto 最適） */
  dominatedBy: string[];
  paretoOptimal: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 Plan Diff（character 軸のみ・public-safe）
// ─────────────────────────────────────────────────────────────────────────────

export const DIFF_DIMENSIONS = ["angle", "role", "soft_match", "pace_fit", "mobility_fit"] as const;
export type DiffDimension = (typeof DIFF_DIMENSIONS)[number];

export interface ProposalDiff {
  aCandidateId: string;
  bCandidateId: string;
  /** 差がある次元（character 軸のみ＝private を含まない） */
  differing: DiffDimension[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 Fairness（participant 帰属・counts のみ・descriptor なし）
// ─────────────────────────────────────────────────────────────────────────────

export interface ParticipantImpact {
  participantId: string;
  /** その participant の soft 一致数（shared 由来） */
  satisfiedShared: number;
  /** 同（private 由来）。**shared 射影で除去** */
  satisfiedPrivate: number;
  /** その participant の条件が stretch された数（shared 由来） */
  stretchedShared: number;
  /** 同（private 由来）。**shared 射影で除去** */
  stretchedPrivate: number;
}

export type FairnessLean = string | "balanced"; // participantId or "balanced"

export interface ProposalFairness {
  candidateId: string;
  perParticipant: ParticipantImpact[];
  /** 全考慮（shared+private）での傾き */
  leanFull: FairnessLean;
  /** shared 由来のみでの傾き（shared 射影で露出してよい） */
  leanShared: FairnessLean;
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 Decision blockers / output
// ─────────────────────────────────────────────────────────────────────────────

export const DECISION_BLOCKERS = [
  "input_error",
  "no_viable_proposals",
  "required_inputs_missing",
  "all_high_uncertainty",
  "tie_no_dominance",
] as const;
export type DecisionBlocker = (typeof DECISION_BLOCKERS)[number];

export interface ProposalComparison {
  participantIds: string[];
  entries: ProposalComparisonEntry[];
  paretoOptimalIds: string[];
  diffs: ProposalDiff[];
  fairness: ProposalFairness[];
  blockers: DecisionBlocker[];
  /** 「何を聞けば決められるか」: priority 降順で安定ソート */
  prioritizedQuestions: MissingSlotQuestion[];
  /** 全体説明（M5 二層）。shared = 共有のみ・forParticipant = 本人の private 含み得る */
  summary: ViewerScopedRationale;
  /** T3 からの passthrough */
  inputError: ProposalInputError | null;
}
