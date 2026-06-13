/**
 * T8A — Plan Decision Packet 契約型（**pure types only**・未配線）
 *
 * 設計: GPT note 2026-06-12（engine output boundary / プロダクトの脳の出力契約）
 *
 * 役割: T3 proposal / T4 comparison / T5 decision / T6 readiness / T7 contingency を
 * **1 つのエンジン出力**に束ねた、将来 CoAlter / Plan Intelligence / UI へ渡す前の **安全な handoff 契約**。
 * ★ これは Plan Intelligence 投影や UI 接続の実装ではない。pure な出力契約と builder のみ。
 *
 * 権限境界（T6.1/T7.1 継承）:
 *   - `authoritative=true` の packet のみが **実行権限の正本**。
 *   - shared/viewer 射影は `authoritative=false`・`executionAuthority=false`＝**display 専用**で実行権限に化けない。
 *
 * 純粋性: 型 + as-const のみ。
 */

import type { Visibility, ViewerScopedRationale } from "./core-types";
import type { DecisionQuestion, DecisionState } from "./decision-types";
import type { ReadinessState, RequiredConfirmation } from "./readiness-types";
import type { ContingencyTrigger, FallbackAction } from "./contingency-types";
import type { ProposalInputError } from "./proposal-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 next best action（束ねた単一の次の一手）
// ─────────────────────────────────────────────────────────────────────────────

export const NEXT_ACTIONS = ["propose_plan", "confirm", "handle_contingency", "ask_question", "await_preference", "blocked"] as const;
export type NextAction = (typeof NEXT_ACTIONS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// §2 fallback summary（contingency 分岐の compact 要約）
// ─────────────────────────────────────────────────────────────────────────────

export interface FallbackSummaryEntry {
  trigger: ContingencyTrigger;
  fallbackAction: FallbackAction;
  switchToProposalId: string | null;
  /** private は shared 射影で除去 */
  visibility: Visibility;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 packet
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanDecisionPacket {
  /** ★ 実行権限の正本か（build=true / 射影=false） */
  authoritative: boolean;
  /** ★ 実際に schedule/reserve/book してよいか（射影は常に false） */
  executionAuthority: boolean;
  recommendedProposalId: string | null;
  decisionState: DecisionState;
  readinessState: ReadinessState;
  /** 発火中の contingency があるか（射影では shared 分岐のみで再計算） */
  contingencyActive: boolean;
  /** 束ねた単一の次の一手 */
  nextAction: NextAction;
  /** 「何を聞けば決まるか」のキュー */
  questionQueue: DecisionQuestion[];
  /** 「何を確認すれば進めるか」のキュー（射影では shared のみ） */
  confirmationQueue: RequiredConfirmation[];
  /** contingency 分岐の要約（射影では shared のみ） */
  fallbackSummary: FallbackSummaryEntry[];
  /** blocked 理由（あれば） */
  blockedReason: string | null;
  /**
   * 説明（M5 二層）。shared = 共有のみ・forParticipant = 本人の private 含み得る（**engine-only**）。
   * shared 射影では forParticipant を全削除。
   */
  rationale: ViewerScopedRationale;
  inputError: ProposalInputError | null;
}
