/**
 * T6A — Reservation / action-readiness 契約型（**pure types only**・未配線）
 *
 * 設計: travel-mode-plan-os-extension-design.md M3（Reservation-Readiness）+ GPT note 2026-06-12
 *
 * 役割: T5 の決定（選択/推奨案）が「相談だけ / 提案 / 仮おさえ / 予約手続き」のどこまで進めて
 * 安全かを判定する **pure Permission/Risk 層**。**実予約・カレンダー書き込み・外部 booking は一切しない**
 * （許可レベルを計算するだけ）。
 *
 * 純粋性: 型 + as-const のみ。
 */

import type { Visibility, ViewerScopedRationale } from "./core-types";
import type { DecisionBlocker } from "./proposal-comparison-types";
import type { DecisionQuestion } from "./decision-types";
import type { ProposalInputError } from "./proposal-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 状態 / 行動ラダー
// ─────────────────────────────────────────────────────────────────────────────

export const READINESS_STATES = ["ready_to_propose", "needs_question", "needs_confirmation", "not_ready", "blocked"] as const;
export type ReadinessState = (typeof READINESS_STATES)[number];

/** 行動ラダー（commitment 昇順）。T6 は **判定のみ・実行しない**。 */
export const ACTION_KINDS = ["discuss_only", "propose_plan", "schedule_hold", "reserve_or_book_later"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// §2 確認理由 / リスク
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIRMATION_REASONS = [
  "paid_booking",
  "long_travel",
  "irreversible",
  "other_participant_impact",
  "high_uncertainty",
  "private_constraint_conflict",
] as const;
export type ConfirmationReason = (typeof CONFIRMATION_REASONS)[number];

export interface RequiredConfirmation {
  reason: ConfirmationReason;
  /** private 理由は shared 射影で除去（存在自体を隠す） */
  visibility: Visibility;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 純 policy input（外部データではない・呼び出し側が渡す意図/制約）
// ─────────────────────────────────────────────────────────────────────────────

export interface ReadinessPolicy {
  /** ユーザーが目指す最大行動（既定 propose_plan） */
  intendedAction?: ActionKind;
  /** 有償予約を伴うか（reserve 時のリスク） */
  involvesPaidBooking?: boolean;
  /** 取消不能 / 取消料ありか */
  irreversible?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 出力
// ─────────────────────────────────────────────────────────────────────────────

export interface ReadinessResult {
  /**
   * ★ T6.1 権限境界: この結果が **実行権限の正本(authoritative)** か。
   *   - `assessReadiness` の戻り値 = **true**（schedule/reserve/book の可否はこれで判定する）。
   *   - `toSharedReadinessView` の戻り値 = **false**（display/提案のみ・**実行権限ではない**）。
   *   private-only 確認を隠した shared 射影が `ready_to_propose` を返しても、authoritative=false の
   *   ため `hasActionAuthority` は決して true にならない（private 確認は engine 側で gate され続ける）。
   */
  authoritative: boolean;
  state: ReadinessState;
  /** 判定対象の行動（実行はしない） */
  actionKind: ActionKind;
  /** 進める前に必要な確認（gate されたもの） */
  requiredConfirmations: RequiredConfirmation[];
  /** 検出された全リスク（informational・gate 有無に関わらず） */
  riskFlags: ConfirmationReason[];
  blockers: DecisionBlocker[];
  /** needs_question / not_ready(tie) の追加質問 */
  pendingQuestion: DecisionQuestion | null;
  /** 共有資源を commit する行動で承認が必要な participantId */
  participantApprovalRequired: string[];
  /** 説明（M5 二層）。shared = 共有のみ・forParticipant = 本人の private 含み得る */
  rationale: ViewerScopedRationale;
  inputError: ProposalInputError | null;
}
