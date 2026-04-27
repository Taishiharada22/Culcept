/**
 * CoAlter Stage 2 — Utterance Queue (L2-l)
 *
 * 正本: UI spec §1.6 連投抑制 / Core UX v1.1 §11.4 連投禁止
 *
 * 責務: 同時に 1 発話のみ active を保つ単一スロット queue。
 *
 * 不変原則:
 *   - active 発話が存在する間、新規 enqueue は reject (構造的 1 発話 serialize)
 *   - active ≤ 1 を構造的に enforce
 *
 * 設計選択:
 *   - 単純な single-slot store (immutable)
 *   - reducer-style enqueue / dequeue で純関数性保つ
 */

import type { PatternVariant, PresenceState } from "./types";

/**
 * 発話ジョブ。
 */
export interface Utterance {
  id: string;
  variant: PatternVariant;
  state: PresenceState;
  /** 発話時刻 (epoch ms) */
  startedAt: number;
}

/**
 * Queue state (単一スロット)。
 */
export interface UtteranceQueueState {
  active: Utterance | null;
}

/**
 * 初期 queue (空)。
 */
export function emptyUtteranceQueue(): UtteranceQueueState {
  return { active: null };
}

/**
 * 新規発話を enqueue する。active が既にある場合 reject (純関数として失敗を返す)。
 */
export interface EnqueueResult {
  next: UtteranceQueueState;
  accepted: boolean;
  reason: string;
}

export function enqueueUtterance(
  state: UtteranceQueueState,
  utterance: Utterance,
): EnqueueResult {
  if (state.active !== null) {
    return {
      next: state,
      accepted: false,
      reason: `active 発話あり (id=${state.active.id})、同時発話禁止 (§1.6)`,
    };
  }
  return {
    next: { active: utterance },
    accepted: true,
    reason: "enqueue OK",
  };
}

/**
 * 発話完了 / 退出で active をクリア。
 */
export function dequeueUtterance(state: UtteranceQueueState): UtteranceQueueState {
  return { active: null };
}

/**
 * active 発話があるかの判定。
 */
export function hasActiveUtterance(state: UtteranceQueueState): boolean {
  return state.active !== null;
}
