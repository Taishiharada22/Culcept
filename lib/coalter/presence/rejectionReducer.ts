/**
 * CoAlter Stage 2 — 拒否 3 分類 reducer (L2-j)
 *
 * 正本: UI spec §6.6 拒否の 3 分類 / §6.7 再介入条件サマリ / §6.8 非判定性
 *
 * 3 分類 (§6.6、独立 cooldown / 信頼影響):
 *   - mode_escalation     (§6.6.1) → mode_rejection cooldown (当該 mode のみ抑制)
 *   - individual_proposal (§6.6.2) → proposal_rejection cooldown (同テーマのみ抑制)
 *   - coalter_retreat     (§6.6.3) → intervention_retreat cooldown (S0→S1 完全停止)
 *
 * 不可侵原則 (§6.7-§6.8):
 *   - 3 分類は独立。1 enum / 1 reducer に統合しない (構造的独立、plan §2.3.1)
 *   - 「悪い / 失敗」を内部表現として持たない (§6.8 非判定性)
 *   - 拒否回数カウント / 累積評価 を state に持たない (§6.8 禁止項目)
 *
 * 設計:
 *   - State は 3 slot 独立 (modeEscalation / individualProposal / coalterRetreat)
 *   - 各 slot は ActiveCooldown 配列 (cooldownResolver L2-e と互換)
 *   - reducer は新 cooldown を該当 slot に追加 (immutable)
 *   - 期限切れ prune は呼び出し側で実施 (純関数性維持)
 */

import type { ActiveCooldown } from "./cooldownResolver";
import { COOLDOWN_DEFAULT_DURATION_MS } from "./constants";
import type { PresenceMode } from "./types";

// ─────────────────────────────────────────────
// Event types (3 分類独立)
// ─────────────────────────────────────────────

export type RejectionEvent =
  | {
      type: "MODE_ESCALATION_REJECTED";
      rejectedMode: PresenceMode;
      at: number;
      durationMs?: number;
    }
  | {
      type: "PROPOSAL_REJECTED";
      theme: string;
      at: number;
      durationMs?: number;
    }
  | {
      type: "COALTER_RETREAT_REQUESTED";
      at: number;
      durationMs?: number;
    };

// ─────────────────────────────────────────────
// State (3 slot 独立、構造的に混同不可)
// ─────────────────────────────────────────────

/**
 * 拒否 reducer の state。3 slot は型レベルで分離。
 *
 * NOTE: §6.8 非判定性のため、本 state は **boolean フラグや回数カウントを持たない**。
 * cooldown の存在 = 拒否があった事実。「失敗」「悪い」表現を内部から構造的に排除。
 */
export interface RejectionState {
  /** §6.6.1 モード昇格拒否 (mode_rejection cooldown 群) */
  modeEscalation: ReadonlyArray<ActiveCooldown>;
  /** §6.6.2 個別提案拒否 (proposal_rejection cooldown 群) */
  individualProposal: ReadonlyArray<ActiveCooldown>;
  /** §6.6.3 介入後退要求 (intervention_retreat cooldown 群) */
  coalterRetreat: ReadonlyArray<ActiveCooldown>;
}

/**
 * 初期 state は全 slot 空配列。
 */
export function initialRejectionState(): RejectionState {
  return {
    modeEscalation: [],
    individualProposal: [],
    coalterRetreat: [],
  };
}

// ─────────────────────────────────────────────
// Reducer (純関数 immutable)
// ─────────────────────────────────────────────

export function rejectionReducer(
  state: RejectionState,
  event: RejectionEvent,
): RejectionState {
  switch (event.type) {
    case "MODE_ESCALATION_REJECTED":
      return reduceModeEscalation(state, event);
    case "PROPOSAL_REJECTED":
      return reduceProposal(state, event);
    case "COALTER_RETREAT_REQUESTED":
      return reduceCoalterRetreat(state, event);
  }
}

function reduceModeEscalation(
  state: RejectionState,
  event: Extract<RejectionEvent, { type: "MODE_ESCALATION_REJECTED" }>,
): RejectionState {
  const cooldown: ActiveCooldown = {
    kind: "mode_rejection",
    expiresAt:
      event.at + (event.durationMs ?? COOLDOWN_DEFAULT_DURATION_MS.mode_rejection),
    rejectedMode: event.rejectedMode,
  };
  return {
    ...state,
    modeEscalation: [...state.modeEscalation, cooldown],
  };
}

function reduceProposal(
  state: RejectionState,
  event: Extract<RejectionEvent, { type: "PROPOSAL_REJECTED" }>,
): RejectionState {
  const cooldown: ActiveCooldown = {
    kind: "proposal_rejection",
    expiresAt:
      event.at +
      (event.durationMs ?? COOLDOWN_DEFAULT_DURATION_MS.proposal_rejection),
    rejectedTheme: event.theme,
  };
  return {
    ...state,
    individualProposal: [...state.individualProposal, cooldown],
  };
}

function reduceCoalterRetreat(
  state: RejectionState,
  event: Extract<RejectionEvent, { type: "COALTER_RETREAT_REQUESTED" }>,
): RejectionState {
  const cooldown: ActiveCooldown = {
    kind: "intervention_retreat",
    expiresAt:
      event.at +
      (event.durationMs ?? COOLDOWN_DEFAULT_DURATION_MS.intervention_retreat),
  };
  return {
    ...state,
    coalterRetreat: [...state.coalterRetreat, cooldown],
  };
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * 3 slot から全 active cooldown を平坦化して返す (cooldownResolver 入力用)。
 *
 * 期限切れは呼び出し側で pruneExpired (cooldownResolver) する想定、本関数は純結合。
 */
export function flattenCooldowns(state: RejectionState): ReadonlyArray<ActiveCooldown> {
  return [
    ...state.modeEscalation,
    ...state.individualProposal,
    ...state.coalterRetreat,
  ];
}

/**
 * 各 slot の期限切れを除去した新 state を返す。
 */
export function pruneRejectionState(
  state: RejectionState,
  now: number,
): RejectionState {
  return {
    modeEscalation: state.modeEscalation.filter((c) => c.expiresAt > now),
    individualProposal: state.individualProposal.filter((c) => c.expiresAt > now),
    coalterRetreat: state.coalterRetreat.filter((c) => c.expiresAt > now),
  };
}
