/**
 * T7A — Contingency / recovery 契約型（**pure types only**・未配線）
 *
 * 設計: travel-mode-plan-os-extension-design.md M4（Contingency-Precompiled Day-of Loop）+ GPT note 2026-06-12
 *
 * 役割: 推奨案が delay / 天候 / 疲労 / 休業 / 予算変動 / 同行者不在 / 時間短縮 / 高 uncertainty で
 * 崩れ得るとき、**事前に** fallback 分岐を決定論で precompute する **pure Risk/Contingency 層**。
 * ★ 実 weather/route/place API・リアルタイムデータ・実 reschedule/cancel/booking は **一切しない**
 *   （explicit scenario input のみ・何も実行しない）。
 *
 * 純粋性: 型 + as-const のみ。
 */

import type { Visibility, ViewerScopedRationale } from "./core-types";
import type { DecisionQuestion } from "./decision-types";
import type { ReadinessState } from "./readiness-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 trigger / fallback
// ─────────────────────────────────────────────────────────────────────────────

export const CONTINGENCY_TRIGGERS = [
  "delay",
  "rain_or_weather",
  "fatigue",
  "closure",
  "budget_shock",
  "participant_unavailable",
  "time_window_shrink",
  "high_uncertainty",
] as const;
export type ContingencyTrigger = (typeof CONTINGENCY_TRIGGERS)[number];

export const FALLBACK_ACTIONS = ["keep_plan", "ask_question", "downgrade_to_easy", "switch_proposal", "defer", "cancel"] as const;
export type FallbackAction = (typeof FALLBACK_ACTIONS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// §2 scenario input（explicit・pure・外部データではない）
// ─────────────────────────────────────────────────────────────────────────────

export interface ContingencyScenario {
  trigger: ContingencyTrigger;
  /** 強度 0..1（しきい値判定用） */
  severity: number;
  /** private な事情か（private なら shared 射影で分岐ごと除去） */
  visibility: Visibility;
  /** participant_unavailable / private 由来の場合の対象 participantId */
  participantId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 分岐 / プラン
// ─────────────────────────────────────────────────────────────────────────────

export interface ContingencyBranch {
  trigger: ContingencyTrigger;
  fallbackAction: FallbackAction;
  /** switch_proposal / downgrade_to_easy の代替 candidateId（なければ null） */
  switchToProposalId: string | null;
  /** ask_question の場合 */
  question: DecisionQuestion | null;
  /** この分岐が発火したときの action-readiness（権限）への影響 */
  readinessImpact: ReadinessState;
  /** severity がこの値以上で発火（透明しきい値） */
  triggerThreshold: number;
  /** private なら shared 射影で除去 */
  visibility: Visibility;
  /** 説明（M5 二層）。shared = 共有のみ・forParticipant = private 由来含み得る */
  rationale: ViewerScopedRationale;
}

export interface ContingencyPlan {
  /**
   * ★ T7.1 権限境界: この plan が **実行権限の正本(authoritative)** か。
   *   - `planContingencies` の戻り値 = **true**。
   *   - `toSharedContingencyView` の戻り値 = **false**（display 専用・private 分岐を隠す）。
   *   private contingency が defer/cancel/blocked を課しても、shared 射影(private 分岐除去)が
   *   見かけ上 keep_plan に見えても、authoritative=false のため `hasContingencyActionAuthority` は
   *   決して true にならない（private 分岐の block は engine 側で効き続ける）。
   */
  authoritative: boolean;
  recommendedProposalId: string | null;
  branches: ContingencyBranch[];
  rationale: ViewerScopedRationale;
}
